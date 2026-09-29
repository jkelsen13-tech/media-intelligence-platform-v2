// Explicit trusted-installer ADMIN successor: disposable proof only.
// Old zero-edge contracts and failed sealed-custodian evidence remain unchanged.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,createHmac,pbkdf2Sync,createHash} from 'node:crypto'
import pg from 'pg'
const {Client}=pg
const N={installer:'postgres',issuer:'mip_tal_issuer',owner:'mip_tal_owner',audit:'mip_tal_audit',metadata:'mip_tal_metadata'}
const ownedRoles=[N.issuer,N.owner,N.audit,N.metadata],schema='mip_tal'
const qi=s=>'"'+s.replaceAll('"','""')+'"',ql=s=>"'"+s.replaceAll("'","''")+"'"
function scram(password){
 const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256')
 return 'SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64')+':'+createHmac('sha256',salted).update('Server Key').digest('base64')
}
async function connect(user,password){
 const c=new Client({host:'127.0.0.1',port:5432,database:'postgres',user,password,application_name:'mip-trusted-auditor-fixture',connectionTimeoutMillis:5000,statement_timeout:10000})
 c.on('error',()=>{}) // Expected owned-session termination; never emit raw error.
 try{await c.connect();return c}catch(e){try{await c.end()}catch{};const x=Error('synthetic connection refused');x.code=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null;throw x}
}
async function one(c,sql,args=[]){return (await c.query(sql,args)).rows[0]}
let denialEvidence=null
async function denied(c,sql,codes=['42501']){
 try{await c.query(sql)}catch(e){const actual=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null;denialEvidence={expected:codes,actual,unexpectedly_authorized:false};assert.ok(codes.includes(actual),'expected bounded SQLSTATE');return}
 denialEvidence={expected:codes,actual:null,unexpectedly_authorized:true};assert.fail('unexpectedly authorized')
}
async function authenticationDenied(user,password,codes=['28P01']){
 let c
 try{c=await connect(user,password)}catch(e){assert.ok(codes.includes(e.code),'expected auth rejection');return}
 await c.end();assert.fail('password unexpectedly accepted')
}
async function logging(c){
 const rows=(await c.query("select name,setting from pg_settings where name=any($1::text[])",[[
  'log_statement','log_min_error_statement','log_min_duration_statement','log_min_duration_sample','log_transaction_sample_rate','log_duration','log_parameter_max_length','log_parameter_max_length_on_error','pgaudit.log','pgaudit.log_parameter','auto_explain.log_min_duration','pg_stat_statements.track','pg_stat_statements.track_utility'
 ]])).rows,v=Object.fromEntries(rows.map(r=>[r.name,r.setting]))
 for(const [k,w] of Object.entries({log_statement:'none',log_min_error_statement:'panic',log_min_duration_statement:'-1',log_min_duration_sample:'-1',log_transaction_sample_rate:'0',log_duration:'off',log_parameter_max_length:'0',log_parameter_max_length_on_error:'0'}))assert.equal(v[k],w,'credential logging guard '+k)
 assert.ok([undefined,'none',''].includes(v['pgaudit.log']))
 assert.ok([undefined,'off'].includes(v['pgaudit.log_parameter']))
 assert.ok([undefined,'-1'].includes(v['auto_explain.log_min_duration']))
 assert.ok([undefined,'none'].includes(v['pg_stat_statements.track'])||v['pg_stat_statements.track_utility']==='off')
}
test('explicit trusted installer ADMIN successor: two auditor lifecycle paths',async()=>{
 assert.equal(process.env.MIP_CUSTODIAN_LIFECYCLE_ARM,'synthetic-pg17-local-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 assert.ok(process.env.MIP_COMPAT_ADMIN_PASSWORD&&process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
 const provider=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
 const clients=new Set()
 let customer,owned=false,failure=false,phase='guard',code=null
 const before=(await provider.query('select rolname from pg_roles order by rolname')).rows.map(x=>x.rolname)
 try{
  assert.equal((await one(provider,'show server_version_num')).server_version_num,'170006')
  assert.equal((await one(provider,'select rolsuper from pg_roles where rolname=current_user')).rolsuper,true)
  assert.ok(!ownedRoles.some(r=>before.includes(r)))
  assert.equal((await one(provider,"select count(*)::int n from pg_namespace where nspname=$1",[schema])).n,0)
  customer=await connect(N.installer,process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
  const identity=await one(customer,'select session_user,current_user,rolsuper,rolcreaterole,rolcreatedb from pg_roles where rolname=current_user')
  assert.equal(identity.session_user,N.installer);assert.equal(identity.current_user,N.installer)
  assert.equal(identity.rolsuper,false);assert.equal(identity.rolcreaterole,true);assert.equal(identity.rolcreatedb,true)
  await logging(customer)
  phase='scram-baseline'
  await authenticationDenied(N.installer,randomBytes(32).toString('base64url'))
  owned=true
  phase='rollback-role-creation'
  await customer.query('begin')
  await customer.query('create role mip_tal_issuer nologin createrole noinherit nosuperuser nocreatedb noreplication nobypassrls')
  await customer.query('rollback')
  assert.equal((await one(customer,"select count(*)::int n from pg_roles where rolname='mip_tal_issuer'")).n,0)
  const credentials=Object.fromEntries([N.audit,N.metadata].map(r=>[r,randomBytes(32).toString('base64url')]))
  phase='create-auditors-and-owner'
  await customer.query('begin')
  await customer.query('create schema mip_tal')
  await customer.query('revoke all on schema mip_tal from public')
  for(const role of [N.audit,N.metadata])await customer.query('create role '+qi(role)+' login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '+ql(scram(credentials[role])))
  await customer.query('create role mip_tal_issuer nologin createrole noinherit nosuperuser nocreatedb noreplication nobypassrls')
  await customer.query('grant mip_tal_issuer to postgres with admin false,inherit false,set true')
  await customer.query('set local role mip_tal_issuer')
  await customer.query('create role mip_tal_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls')
  await customer.query('grant mip_tal_owner to postgres with admin false,inherit false,set true')
  await customer.query('set local role postgres')
  await customer.query('grant usage,create on schema mip_tal to mip_tal_owner')
  await customer.query('set local role mip_tal_owner')
  // Synthetic analogue of the installed protected-owner policy dependency.
  // This new fixed helper would require an explicit production successor.
  for(const [role,table,permission] of [[N.audit,'rejections','insert'],[N.metadata,'metadata','select']]){
   await customer.query('create table mip_tal.'+table+'(id integer)')
   await customer.query('alter table mip_tal.'+table+' enable row level security')
   await customer.query('alter table mip_tal.'+table+' force row level security')
   await customer.query('grant '+permission+' on mip_tal.'+table+' to '+qi(role))
   await customer.query('create policy auditor_access on mip_tal.'+table+' for '+permission+' to '+qi(role)+(permission==='insert'?' with check(true)':' using(true)'))
   await customer.query("create function mip_tal.cleanup_"+table+"() returns void language plpgsql security definer set search_path='' as $$begin if session_user<>'postgres' then raise exception 'denied' using errcode='42501';end if; if exists(select 1 from pg_roles where rolname='"+role+"' and rolcanlogin) then raise exception 'still enabled' using errcode='42501';end if; drop policy if exists auditor_access on mip_tal."+table+"; if exists(select 1 from pg_roles where rolname='"+role+"') then revoke "+permission+" on mip_tal."+table+" from "+role+";end if;end$$")
   await customer.query('revoke all on function mip_tal.cleanup_'+table+'() from public')
   await customer.query('grant execute on function mip_tal.cleanup_'+table+'() to postgres')
  }
  await customer.query('set local role postgres')
  await customer.query('grant usage on schema mip_tal to mip_tal_audit,mip_tal_metadata')
  await customer.query('revoke create on schema mip_tal from mip_tal_owner')
  await customer.query('set local role mip_tal_issuer')
  await customer.query('revoke mip_tal_owner from postgres')
  await customer.query('set local role postgres')
  await customer.query('drop role mip_tal_issuer')
  await customer.query('commit')
  phase='admin-topology'
  const edges=(await customer.query("select roleid::regrole::text role,member::regrole::text member,admin_option,inherit_option,set_option from pg_auth_members where roleid=any($1::regrole[]) or member=any($1::regrole[]) order by roleid",[ [N.audit,N.metadata] ])).rows
  assert.equal(edges.length,2)
  for(const e of edges){assert.ok([N.audit,N.metadata].includes(e.role));assert.equal(e.member,N.installer);assert.equal(e.admin_option,true);assert.equal(e.inherit_option,false);assert.equal(e.set_option,false)}
  assert.equal((await one(customer,"select count(*)::int n from pg_auth_members where roleid='mip_tal_owner'::regrole or member='mip_tal_owner'::regrole")).n,0)
  // Explicit policy acknowledgment: ADMIN can acquire SET. Exercise then rollback.
  phase='trusted-admin-acquires-set'
  await customer.query('begin')
  await customer.query('grant mip_tal_audit to postgres with admin false,inherit false,set true')
  await customer.query('set local role mip_tal_audit')
  assert.equal((await one(customer,'select current_user')).current_user,N.audit)
  await customer.query('rollback')
  assert.equal((await one(customer,"select pg_has_role('postgres','mip_tal_audit','SET') allowed")).allowed,false)
  phase='runtime-boundaries'
  for(const role of [N.audit,N.metadata]){
   await authenticationDenied(role,randomBytes(32).toString('base64url'))
   const c=await connect(role,credentials[role]);clients.add(c)
   assert.equal((await one(c,'select session_user,current_user')).session_user,role)
   const p=await one(c,"select current_setting('supautils.privileged_role',true) privileged")
   assert.ok(p.privileged)
   assert.equal((await one(c,"select pg_has_role(current_user,$1,'USAGE') allowed",[p.privileged])).allowed,false)
   assert.equal((await one(c,"select pg_has_role(current_user,$1,'SET') allowed",[p.privileged])).allowed,false)
   phase='deny-'+role+'-set-postgres'
   await denied(c,'set role postgres')
   phase='deny-'+role+'-set-owner'
   await denied(c,'set role mip_tal_owner')
   phase='deny-'+role+'-grant-metadata'
   await denied(c,'grant mip_tal_metadata to '+qi(role))
   phase='deny-'+role+'-cleanup-rejections'
   await denied(c,'select mip_tal.cleanup_rejections()')
   phase='deny-'+role+'-cleanup-metadata'
   await denied(c,'select mip_tal.cleanup_metadata()')
   phase='rotate-'+role
   const next=randomBytes(32).toString('base64url')
   await logging(customer)
   await customer.query('alter role '+qi(role)+' password '+ql(scram(next)))
   await c.end();clients.delete(c)
   await authenticationDenied(role,credentials[role])
   const live=await connect(role,next);clients.add(live)
   const pid=(await one(live,'select pg_backend_pid() pid')).pid
   assert.equal((await one(live,'select session_user')).session_user,role)
   phase='revoke-'+role
   await customer.query('alter role '+qi(role)+' nologin')
   await customer.query('alter role '+qi(role)+' nologin') // exact retry
   await authenticationDenied(role,next,['28000','28P01'])
   assert.equal((await one(live,'select session_user')).session_user,role)
   // Narrow existing-session cleanup: exact client PID + user + DB + application.
   const target=await one(customer,"select pid from pg_stat_activity where pid=$1 and usename=$2 and datname=current_database() and application_name='mip-trusted-auditor-fixture' and backend_type='client backend' and pid<>pg_backend_pid()",[pid,role])
   assert.equal(target?.pid,pid)
   assert.equal((await one(customer,'select pg_terminate_backend($1) terminated',[pid])).terminated,true)
   let remaining=1
   for(let i=0;i<50&&remaining;i++){remaining=(await one(customer,'select count(*)::int n from pg_stat_activity where pid=$1 and usename=$2',[pid,role])).n;if(remaining)await new Promise(r=>setTimeout(r,100))}
   assert.equal(remaining,0)
   try{await live.end()}catch{}clients.delete(live)
   await authenticationDenied(role,next,['28000','28P01'])
   phase='dependency-cleanup-'+role
   await denied(customer,'drop role '+qi(role),['2BP01'])
   const table=role===N.audit?'rejections':'metadata'
   await customer.query('select mip_tal.cleanup_'+table+'()')
   await customer.query('select mip_tal.cleanup_'+table+'()')
   await customer.query('revoke usage on schema mip_tal from '+qi(role))
   await customer.query('drop role '+qi(role))
   await customer.query('drop role if exists '+qi(role))
   assert.equal((await one(customer,'select count(*)::int n from pg_roles where rolname=$1',[role])).n,0)
  }
  phase='protected-owner-retirement-boundary'
  // Auditor ADMIN does not confer ADMIN on protected owner; provider teardown
  // of this separate synthetic owner is not claimed customer capability.
  await denied(customer,'drop role mip_tal_owner')
 }catch(e){failure=true;code=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null}
 finally{
  for(const c of clients)try{await c.end()}catch{failure=true}
  if(customer)try{await customer.query('rollback');await customer.end()}catch{failure=true}
  try{
   if(owned){
    await provider.query('drop schema if exists mip_tal cascade')
    for(const r of ownedRoles)if((await provider.query('select 1 from pg_roles where rolname=$1',[r])).rowCount){await provider.query('drop owned by '+qi(r));await provider.query('drop role '+qi(r))}
    assert.deepEqual((await provider.query('select rolname from pg_roles order by rolname')).rows.map(x=>x.rolname),before)
    assert.equal((await one(provider,"select count(*)::int n from pg_namespace where nspname='mip_tal'")).n,0)
   }
  }catch{failure=true}
  await provider.end()
 }
 assert.equal(failure,false,'trusted ADMIN successor proof failed at '+phase+' SQLSTATE '+(code??'none')+' denial '+JSON.stringify(denialEvidence)+'; raw errors withheld')
})
