// Disposable canary proof, based on collector-native-capture/credentialDelivery.mjs.
// No hosted credentials. Actual logging defaults remain unchanged.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,createHmac,pbkdf2Sync,createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import pg from 'pg'
const {Client}=pg
const CONTAINER='qik-managed-compat',ROLE='mip_scd_audit',SCHEMA='mip_scd'
const qi=s=>'"'+s.replaceAll('"','""')+'"',secrets=[]
function credential(){
 const password=randomBytes(36).toString('base64url'),salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256')
 const verifier='SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64')+':'+createHmac('sha256',salted).update('Server Key').digest('base64')
 secrets.push(password,verifier);return {password,verifier}
}
async function connect(user,password){
 const c=new Client({host:'127.0.0.1',port:5432,database:'postgres',user,password,application_name:'mip-secure-delivery-canary',connectionTimeoutMillis:5000,statement_timeout:1000,query_timeout:5000,options:'-c lock_timeout=500ms'})
 c.on('error',()=>{})
 try{await c.connect();return c}catch(e){try{await c.end()}catch{};const x=Error('synthetic connection refused');x.code=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null;throw x}
}
async function one(c,sql,args=[]){return (await c.query(sql,args)).rows[0]}
async function rejected(user,password){
 let c;try{c=await connect(user,password)}catch(e){assert.equal(e.code,'28P01');return}
 await c.end();assert.fail('wrong password accepted')
}
async function guard(c){
 const rows=(await c.query("select name,setting from pg_settings where name=any($1::text[])",[[
  'log_statement','log_min_error_statement','log_parameter_max_length','log_parameter_max_length_on_error','log_min_duration_statement','log_min_duration_sample','log_transaction_sample_rate','pgaudit.log','pgaudit.log_parameter','auto_explain.log_min_duration','auto_explain.log_nested_statements','auto_explain.log_parameter_max_length','pg_stat_statements.track','pg_stat_statements.track_utility','statement_timeout','lock_timeout','plpgsql.check_asserts'
 ]])).rows,v=Object.fromEntries(rows.map(r=>[r.name,r.setting]))
 for(const [k,w] of Object.entries({log_statement:'ddl',log_min_error_statement:'error',log_parameter_max_length:'-1',log_parameter_max_length_on_error:'0',log_min_duration_statement:'-1',log_min_duration_sample:'-1',log_transaction_sample_rate:'0','pg_stat_statements.track':'top','pg_stat_statements.track_utility':'on','auto_explain.log_min_duration':'10000','auto_explain.log_nested_statements':'off','auto_explain.log_parameter_max_length':'-1','plpgsql.check_asserts':'on'}))assert.equal(v[k],w,'host-shape guard '+k)
 assert.ok(['none',''].includes(v['pgaudit.log']));assert.equal(v['pgaudit.log_parameter'],'off')
 assert.ok(Number(v.statement_timeout)>0&&Number(v.statement_timeout)<=1000)
 assert.ok(Number(v.lock_timeout)>0&&Number(v.lock_timeout)<=500)
}
const helper="create function mip_scd.deliver(action text, verifier text) returns text\nlanguage plpgsql security invoker set search_path='' as $body$\nbegin\n if session_user <> 'postgres' or current_user <> 'postgres' then return 'refused';end if;\n if verifier is null or verifier !~ '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/=]{24}[$][A-Za-z0-9+/=]{44}:[A-Za-z0-9+/=]{44}$'\n or action is null or action not in('create','rotate','error','assert','timeout','cancel') then return 'refused';end if;\n if current_setting('statement_timeout')::interval>interval '1 second'\n or current_setting('statement_timeout')::interval<=interval '0 seconds' then return 'refused';end if;\n begin\n  if action='create' then\n   execute format('create role mip_scd_audit login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L',verifier);\n  elsif action='error' then\n   execute format('alter role mip_scd_absent password %L',verifier);\n  else\n   execute format('alter role mip_scd_audit password %L',verifier);\n  end if;\n  if action='assert' then assert false,verifier;end if;\n  if action in('timeout','cancel') then perform pg_sleep(3);end if;\n  return 'applied';\n exception\n  when query_canceled then return 'canceled';\n  when assert_failure then return 'refused';\n  when others then return 'refused';\n end;\nend\n$body$;"
function docker(args){
 const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024,timeout:10000})
 assert.equal(r.error,undefined,'bounded capture');assert.equal(r.status,0,'owned-container capture')
 return (r.stdout??'')+(r.stderr??'')
}
const containsCanary=text=>secrets.some(s=>text.includes(s)||text.includes(s.replaceAll('$','\\$')))
async function logFiles(c){
 const r=await one(c,"select current_setting('data_directory') data,current_setting('logging_collector') collector,current_setting('log_destination') destination")
 assert.ok(r.destination.split(',').map(x=>x.trim()).every(x=>['stderr','csvlog','jsonlog'].includes(x)))
 if(r.collector==='off'){assert.equal(r.destination,'stderr');return []}
 const files=[]
 for(const type of r.destination.split(',').map(x=>x.trim())){
  const name=(await one(c,'select pg_current_logfile($1) file',[type])).file
  if(!name&&type==='stderr')continue
  assert.ok(name,'active filename required')
  const full=path.posix.resolve(r.data,name)
  assert.ok(/^\/(?:var\/log\/postgresql|var\/lib\/postgresql)(?:\/[A-Za-z0-9_.-]+)+$/.test(full),'owned path')
  files.push(full)
 }
 assert.ok(files.length);return files
}
test('managed logging defaults: bound SCRAM delivery and actual log canaries',async()=>{
 assert.equal(process.env.MIP_SECURE_DELIVERY_ARM,'synthetic-managed-logging-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 assert.ok(process.env.MIP_COMPAT_ADMIN_PASSWORD&&process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
 const provider=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
 let customer,cancelClient,owned=false,failed=false,phase='guard',code=null
 const files=new Set(),since=new Date(Date.now()-2000).toISOString()
 const before=(await provider.query('select rolname from pg_roles order by rolname')).rows.map(x=>x.rolname)
 try{
  assert.equal((await one(provider,'show server_version_num')).server_version_num,'170006')
  assert.ok(!before.includes(ROLE)&&!before.includes('mip_scd_absent'))
  assert.equal((await one(provider,"select count(*)::int n from pg_namespace where nspname=$1",[SCHEMA])).n,0)
  for(const f of await logFiles(provider))files.add(f)
  customer=await connect('postgres',process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
  cancelClient=await connect('postgres',process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
  assert.equal((await one(customer,'select rolsuper from pg_roles where rolname=current_user')).rolsuper,false)
  await guard(customer)
  await rejected('postgres',randomBytes(36).toString('base64url'))
  owned=true;phase='fixed-private-helper'
  await customer.query('begin')
  await customer.query('create schema mip_scd')
  await customer.query('revoke all on schema mip_scd from public,anon,authenticated,service_role')
  await customer.query(helper)
  await customer.query('revoke all on function mip_scd.deliver(text,text) from public,anon,authenticated,service_role')
  await customer.query('commit')
  const deliver=async(action,cred)=>{
   await guard(customer)
   return (await one(customer,'select mip_scd.deliver($1,$2) state',[action,cred.verifier])).state
  }
  phase='create'
  const first=credential();assert.equal(await deliver('create',first),'applied')
  let auth=await connect(ROLE,first.password);assert.equal((await one(auth,'select session_user')).session_user,ROLE);await auth.end()
  await rejected(ROLE,randomBytes(36).toString('base64url'))
  phase='duplicate-error'
  const duplicate=credential();assert.equal(await deliver('create',duplicate),'refused');await rejected(ROLE,duplicate.password)
  phase='rotate'
  const second=credential();assert.equal(await deliver('rotate',second),'applied');await rejected(ROLE,first.password)
  auth=await connect(ROLE,second.password);await auth.end()
  phase='dynamic-error'
  const error=credential();assert.equal(await deliver('error',error),'refused');await rejected(ROLE,error.password)
  phase='assert-failure'
  const asserted=credential();assert.equal(await deliver('assert',asserted),'refused');await rejected(ROLE,asserted.password)
  auth=await connect(ROLE,second.password);await auth.end()
  phase='statement-timeout'
  const timeout=credential();assert.equal(await deliver('timeout',timeout),'canceled');await rejected(ROLE,timeout.password)
  auth=await connect(ROLE,second.password);await auth.end()
  phase='external-cancel'
  const canceled=credential(),pid=(await one(customer,'select pg_backend_pid() pid')).pid
  // Attach handler immediately so an unexpected SQL failure cannot become an
  // unhandled rejection containing raw details while waiting to cancel.
  const pending=deliver('cancel',canceled).then(state=>({state}),()=>({error:true}))
  await new Promise(r=>setTimeout(r,200))
  const target=await one(cancelClient,"select pid from pg_stat_activity where pid=$1 and usename='postgres' and datname=current_database() and application_name='mip-secure-delivery-canary'",[pid])
  assert.equal(target?.pid,pid)
  assert.equal((await one(cancelClient,'select pg_cancel_backend($1) canceled',[pid])).canceled,true)
  assert.deepEqual(await pending,{state:'canceled'})
  await rejected(ROLE,canceled.password);auth=await connect(ROLE,second.password);await auth.end()
  phase='logging-settings-unchanged';await guard(customer)
  phase='statement-statistics-canary'
  const ext=await one(provider,"select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_stat_statements'")
  assert.ok(ext?.nspname)
  const statements=(await provider.query('select query from '+qi(ext.nspname)+'.pg_stat_statements')).rows
  assert.ok(statements.some(r=>/mip_scd[.]deliver\(\$1,\$2\)/.test(r.query)),'actual bound helper statistics required')
  assert.equal(containsCanary(statements.map(r=>r.query).join('\n')),false,'canary in statement statistics')
  phase='server-log-canary'
  for(const f of await logFiles(provider))files.add(f)
  await new Promise(r=>setTimeout(r,300))
  const captured=[docker(['logs','--since',since,CONTAINER])]
  for(const f of files)captured.push(docker(['exec',CONTAINER,'cat','--',f]))
  assert.ok(captured.some(t=>t.includes('mip_scd.deliver')),'actual helper DDL log evidence required')
  for(const text of captured)assert.equal(containsCanary(text),false,'canary in server logs')
  phase='customer-cleanup'
  await customer.query('alter role mip_scd_audit nologin')
  await customer.query('drop role mip_scd_audit')
  await customer.query('drop schema mip_scd cascade')
  assert.deepEqual((await provider.query('select rolname from pg_roles order by rolname')).rows.map(x=>x.rolname),before)
 }catch(e){failed=true;code=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null}
 finally{
  for(const c of [cancelClient,customer])if(c)try{await c.query('rollback');await c.end()}catch{failed=true}
  if(owned)try{
   await provider.query('drop schema if exists mip_scd cascade')
   if((await provider.query('select 1 from pg_roles where rolname=$1',[ROLE])).rowCount){await provider.query('drop owned by '+qi(ROLE));await provider.query('drop role '+qi(ROLE))}
   assert.deepEqual((await provider.query('select rolname from pg_roles order by rolname')).rows.map(x=>x.rolname),before)
  }catch{failed=true}
  await provider.end()
 }
 assert.equal(failed,false,'secure delivery canary failed at '+phase+' SQLSTATE '+(code??'none')+'; raw logs and errors withheld')
})
