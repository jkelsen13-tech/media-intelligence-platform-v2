// Synthetic executable proof only. NOT an installed profile, provisioning service,
// production integration, owner-policy approval, or secure GitHub secret setter.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,createHmac,pbkdf2Sync,createHash} from 'node:crypto'
import pg from 'pg'
const {Client}=pg
const names={installer:'postgres',issuer:'mip_lcp_issuer',custodian:'mip_lcp_custodian',owner:'mip_lcp_owner',audit:'mip_lcp_audit',metadata:'mip_lcp_metadata'}
const roles=Object.values(names).filter(r=>r!=='postgres'),schema='mip_lcp'
const qi=s=>'"'+s.replaceAll('"','""')+'"',ql=s=>"'"+s.replaceAll("'","''")+"'"
const passwords=Object.fromEntries(['audit','metadata'].map(k=>[k,randomBytes(32).toString('base64url')]))
// Passwords never appear in SQL. Synthetic SCRAM verifiers remain runtime-only.
function verifier(password){
 const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256')
 const client=createHmac('sha256',salted).update('Client Key').digest()
 return 'SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+createHash('sha256').update(client).digest('base64')+':'+createHmac('sha256',salted).update('Server Key').digest('base64')
}
async function connect(user,password){
 const c=new Client({host:'127.0.0.1',port:5432,database:'postgres',user,password,connectionTimeoutMillis:5000,statement_timeout:10000})
 try{await c.connect();return c}catch(e){try{await c.end()}catch{};const error=Error('synthetic connection refused');if(/^[A-Z0-9]{5}$/.test(e.code??''))error.code=e.code;throw error}
}
async function denied(c,sql,codes=['42501']){
 try{await c.query(sql)}catch(e){assert.ok(codes.includes(e.code),'bounded expected SQLSTATE');return}
 assert.fail('operation unexpectedly authorized')
}
async function one(c,sql){return (await c.query(sql)).rows[0]}
const safe="nologin noinherit nosuperuser nocreatedb noreplication nobypassrls"
test('sealed custodian candidate: real PG17 role lifecycle and protected policy dependency',async()=>{
 assert.equal(process.env.MIP_CUSTODIAN_LIFECYCLE_ARM,'synthetic-pg17-local-only','explicit disposable arm required')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install','existing disposable route guard required')
 assert.ok(process.env.MIP_COMPAT_ADMIN_PASSWORD && process.env.MIP_COMPAT_CUSTOMER_PASSWORD,'synthetic runtime credentials required')
 const root=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
 let installer,audit,metadata,failure=false,owned=false,phase='guard',failureCode=null
 try{
  assert.equal((await one(root,"show server_version_num")).server_version_num,'170006')
  assert.equal((await one(root,"select rolsuper from pg_roles where rolname=current_user")).rolsuper,true)
 }catch{await root.end();throw Error('synthetic lifecycle guard failed')}
 try{
  const baseline=(await root.query("select rolname from pg_roles order by rolname")).rows.map(x=>x.rolname)
  assert.ok(!roles.some(r=>baseline.includes(r)),'fixture role collision')
  assert.equal((await one(root,"select count(*)::int n from pg_namespace where nspname='mip_lcp'")).n,0)
  owned=true;phase='bootstrap'
  installer=await connect(names.installer,process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
  const customer=await one(installer,'select session_user,current_user,rolsuper,rolcreaterole,rolcreatedb from pg_roles where rolname=current_user')
  assert.equal(customer.session_user,'postgres');assert.equal(customer.current_user,'postgres');assert.equal(customer.rolsuper,false);assert.equal(customer.rolcreaterole,true);assert.equal(customer.rolcreatedb,true)
  phase='rollback'
  // Atomic rollback proves temporary issuer creation leaves no role residue.
  await installer.query('begin')
  await installer.query('create role '+qi(names.issuer)+' '+safe+' createrole')
  await installer.query('rollback')
  assert.equal((await one(root,"select count(*)::int n from pg_roles where rolname='mip_lcp_issuer'")).n,0)
  await installer.query('begin')
  phase='create'
  await installer.query('create schema '+schema)
  await installer.query('revoke all on schema '+schema+' from public')
  await installer.query('create role '+qi(names.issuer)+' '+safe+' createrole')
  await installer.query('grant '+qi(names.issuer)+' to '+qi(names.installer)+' with admin false,inherit false,set true')
  await installer.query('set local role '+qi(names.issuer))
  await installer.query('create role '+qi(names.custodian)+' '+safe+' createrole')
  await installer.query('create role '+qi(names.owner)+' '+safe+' nocreaterole')
  await installer.query('grant '+qi(names.custodian)+','+qi(names.owner)+' to '+qi(names.installer)+' with admin false,inherit false,set true')
  await installer.query('set local role '+qi(names.installer))
  await installer.query('grant usage,create on schema '+schema+' to '+qi(names.custodian)+','+qi(names.owner))
  await installer.query('set local role '+qi(names.custodian))
  for(const k of ['audit','metadata']) await installer.query('create role '+qi(names[k])+' login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '+ql(verifier(passwords[k])))
  // Installer can revoke login and attempt exact role drop; cannot set/reset
  // passwords, grant memberships, select a role name, or issue arbitrary SQL.
  await installer.query("create function mip_lcp.revoke_audit() returns void language plpgsql security definer set search_path='' as $$begin if session_user<>'postgres' then raise exception 'denied' using errcode='42501';end if; alter role mip_lcp_audit nologin;end$$")
  await installer.query("create function mip_lcp.drop_audit() returns void language plpgsql security definer set search_path='' as $$begin if session_user<>'postgres' then raise exception 'denied' using errcode='42501';end if; if exists(select 1 from pg_roles where rolname='mip_lcp_audit' and rolcanlogin) then raise exception 'login still enabled' using errcode='42501';end if; if exists(select 1 from pg_roles where rolname='mip_lcp_audit') then drop role mip_lcp_audit;end if;end$$")
  await installer.query('set local role '+qi(names.owner))
  await installer.query('create table mip_lcp.synthetic_rejection(id integer)')
  await installer.query('alter table mip_lcp.synthetic_rejection enable row level security')
  await installer.query('alter table mip_lcp.synthetic_rejection force row level security')
  await installer.query('grant insert on mip_lcp.synthetic_rejection to mip_lcp_audit')
  await installer.query("create policy synthetic_audit_insert on mip_lcp.synthetic_rejection for insert to mip_lcp_audit with check(true)")
  // Candidate successor helper; existing production contracts contain NO such
  // helper. This fixture must not be called proof those contracts now pass.
  await installer.query("create function mip_lcp.remove_policy() returns void language plpgsql security definer set search_path='' as $$begin if session_user<>'postgres' then raise exception 'denied' using errcode='42501';end if; if exists(select 1 from pg_roles where rolname='mip_lcp_audit' and rolcanlogin) then raise exception 'login still enabled' using errcode='42501';end if; drop policy if exists synthetic_audit_insert on mip_lcp.synthetic_rejection; if exists(select 1 from pg_roles where rolname='mip_lcp_audit') then revoke insert on mip_lcp.synthetic_rejection from mip_lcp_audit;end if;end$$")
  await installer.query('revoke all on function mip_lcp.remove_policy() from public')
  await installer.query('grant execute on function mip_lcp.remove_policy() to postgres')
  await installer.query('set local role '+qi(names.custodian))
  await installer.query('revoke all on function mip_lcp.revoke_audit(),mip_lcp.drop_audit() from public')
  await installer.query('grant execute on function mip_lcp.revoke_audit(),mip_lcp.drop_audit() to postgres')
  await installer.query('set local role '+qi(names.installer))
  await installer.query('revoke create on schema mip_lcp from mip_lcp_custodian,mip_lcp_owner')
  // Revoke explicitly issued temporary SET paths using the exact issuer.
  await installer.query('set local role '+qi(names.issuer))
  await installer.query('revoke mip_lcp_custodian,mip_lcp_owner from postgres')
  await installer.query('set local role '+qi(names.installer))
  await installer.query('drop role mip_lcp_issuer')
  phase='seal'
  await installer.query('commit')
  assert.equal((await one(root,"select count(*)::int n from pg_auth_members where roleid='mip_lcp_custodian'::regrole or roleid='mip_lcp_owner'::regrole")).n,0)
  const edges=(await root.query("select roleid::regrole::text role,member::regrole::text member,admin_option,inherit_option,set_option from pg_auth_members where roleid in('mip_lcp_audit'::regrole,'mip_lcp_metadata'::regrole) order by role")).rows
  assert.equal(edges.length,2)
  for(const e of edges){assert.equal(e.member,names.custodian);assert.equal(e.admin_option,true);assert.equal(e.inherit_option,false);assert.equal(e.set_option,false)}
  phase='identity-denials'
  audit=await connect(names.audit,passwords.audit);metadata=await connect(names.metadata,passwords.metadata)
  for(const c of [installer,audit,metadata]){
   await denied(c,'set role mip_lcp_custodian')
   await denied(c,'set role mip_lcp_owner')
   await denied(c,'grant mip_lcp_audit to '+qi(c===installer?names.installer:c===audit?names.audit:names.metadata))
  }
  await denied(installer,'set role mip_lcp_audit')
  await denied(installer,"alter role mip_lcp_audit password null")
  // Authenticated auditor native self-rotation, no SECURITY DEFINER EXECUTE.
  phase='rotation'
  const rotated=randomBytes(32).toString('base64url')
  await audit.query('alter role mip_lcp_audit password '+ql(verifier(rotated)))
  await audit.end();audit=null
  let oldAccepted=false
  try{const old=await connect(names.audit,passwords.audit);await old.end();oldAccepted=true}catch(e){assert.equal(e.code,'28P01')}
  assert.equal(oldAccepted,false)
  audit=await connect(names.audit,rotated)
  assert.equal((await one(audit,'select session_user')).session_user,names.audit)
  await denied(audit,'select mip_lcp.revoke_audit()')
  await denied(installer,'select mip_lcp.remove_policy()')
  phase='revocation'
  await installer.query('select mip_lcp.revoke_audit()')
  // NOLOGIN prevents new logins, but does NOT terminate existing sessions.
  assert.equal((await one(audit,'select session_user')).session_user,names.audit)
  await audit.end();audit=null
  let disabledAccepted=false
  try{const c=await connect(names.audit,rotated);await c.end();disabledAccepted=true}catch(e){assert.ok(['28000','28P01'].includes(e.code))}
  assert.equal(disabledAccepted,false)
  phase='policy-dependency'
  await denied(installer,'select mip_lcp.drop_audit()',['2BP01'])
  await installer.query('select mip_lcp.remove_policy()')
  await installer.query('select mip_lcp.remove_policy()') // bounded idempotent retry
  await installer.query('select mip_lcp.drop_audit()')
  await installer.query('select mip_lcp.drop_audit()') // exact absent retry
  assert.equal((await one(root,"select count(*)::int n from pg_roles where rolname='mip_lcp_audit'")).n,0)
  await denied(metadata,'select mip_lcp.remove_policy()')
 }catch(e){failure=true;failureCode=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null}
 finally{
  for(const c of [audit,metadata,installer])if(c)try{await c.query('rollback');await c.end()}catch{failure=true}
  // Provider-superuser disposable teardown, not claimed installer capability.
  try{
   if(owned){
   await root.query('drop schema if exists mip_lcp cascade')
   for(const role of [...roles].reverse()){
    if((await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){
     await root.query('drop owned by '+qi(role))
     await root.query('drop role '+qi(role))
    }
   }
   }
   if(owned)assert.equal((await root.query('select count(*)::int n from pg_roles where rolname=any($1)',[roles])).rows[0].n,0)
   if(owned)assert.equal((await one(root,"select count(*)::int n from pg_namespace where nspname='mip_lcp'")).n,0)
  }catch{failure=true}
  await root.end()
 }
 assert.equal(failure,false,'candidate lifecycle proof failed at '+phase+' SQLSTATE '+(failureCode??'none')+'; raw database errors withheld')
})
