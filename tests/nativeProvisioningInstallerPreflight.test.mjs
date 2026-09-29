import test from 'node:test'
import assert from 'node:assert/strict'
import {createInstallerAuthPreflight,validateInstallerPreflightConfig,loadPinnedInstallerCa} from '../supabase/qualification/native-provisioning-compat/preflight.mjs'
const c={expectedLogin:'postgres',c3OperationId:'a'.repeat(32),c3ManifestSha256:'b'.repeat(64)}
const secrets={installer:'postgresql://postgres:synthetic-only-password@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres'}
const identity={login:'postgres',effective:'postgres',rolsuper:false,rolcanlogin:true,rolcreaterole:true,rolcreatedb:true,rolbypassrls:true,rolinherit:true,rolreplication:false,database_owner:true,read_only:true,tls:true,postgres_supported:true,vector_supported:true}
const c3={baseline:'c'.repeat(64),gate_closed:true,schedule_closed:true,sources_closed:true,credentials_empty:true,receipt_matches:true}
function fixture(change={}){
 const calls=[],options=[];let closed=0
 const client={connection:{stream:{encrypted:true,authorized:true,...change.socket}},async connect(){if(change.connect)throw change.connect},
 async query(sql,params){
  calls.push({sql,params})
  if(sql==='rollback'&&change.rollback)throw change.rollback
  if(sql==='begin read only'&&change.begin)throw change.begin
  if(sql.includes('from pg_roles r')){
   if(change.identityError)throw change.identityError
   return {rows:[{...identity,...change.identity}]}
  }
  if(sql.includes('receipt_matches')){
   if(change.c3Error)throw change.c3Error
   return {rows:[{...c3,...change.c3}]}
  }
  return {rows:[]}
 },async end(){closed++;if(change.close)throw change.close}}
 const run=createInstallerAuthPreflight({makeClient:o=>{options.push(o);return client},
  loadCa:async()=>{if(change.ca)throw change.ca;return Buffer.from('synthetic-ca-for-in-process-test-only')}})
 return {run,calls,options,closed:()=>closed}
}
test('authenticates metadata only, TLS and exact C3; qualified is not installation readiness',async()=>{
 const f=fixture(),r=await f.run(c,secrets)
 assert.equal(r.state,'installer_authenticated_c3_current')
 assert.equal(r.c3_baseline_sha256,c3.baseline)
 for(const k of ['installation_ready','installation_performed','activation_allowed','publication_allowed','material_access_allowed','production_qualified'])assert.equal(r[k],false)
 assert.equal(r.connection_cleanup_verified,true);assert.equal(f.closed(),1)
 assert.equal(f.options[0].ssl.rejectUnauthorized,true)
 assert.equal(f.options[0].connectionTimeoutMillis,5000)
 assert.equal(f.calls[0].sql,'begin read only')
 assert.equal(f.calls.at(-1).sql,'rollback')
 assert.ok(f.calls.every(x=>/^(select|set local|begin read only|rollback)/.test(x.sql.trim())))
 const q=f.calls.find(x=>x.sql.includes('receipt_matches'))
 assert.deepEqual(q.params,[c.c3OperationId,c.c3ManifestSha256])
 assert.ok(!f.calls.some(x=>x.sql.includes('synthetic-only-password')))
})
test('configuration accepts exact direct/session-pooler identity, rejects other target or options',()=>{
 assert.equal(validateInstallerPreflightConfig(c,secrets).hostname,'db.qikvmopbtijoebdqosyq.supabase.co')
 assert.equal(validateInstallerPreflightConfig(c,{installer:'postgresql://postgres.qikvmopbtijoebdqosyq:synthetic-only-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres'}).hostname,'aws-0-us-west-1.pooler.supabase.com')
 for(const installer of [
 secrets.installer.replace('5432','6543'),secrets.installer+'?sslmode=disable',
 secrets.installer.replace('/postgres','/other'),secrets.installer.replace('qikvmopbtijoebdqosyq','other'),
 secrets.installer.replace('postgres:synthetic','service_role:synthetic')
 ])assert.throws(()=>validateInstallerPreflightConfig(c,{installer}),/installer_preflight_refused/)
 assert.throws(()=>validateInstallerPreflightConfig({...c,query:'select 1'},secrets))
})
test('invalid configuration never creates client or includes input in receipt',async()=>{
 const f=fixture(),r=await f.run({...c,expectedLogin:'bad-secret-input'},secrets)
 assert.equal(r.diagnostic,'configuration');assert.equal(f.options.length,0)
 assert.ok(!JSON.stringify(r).includes('bad-secret-input'))
})
test('actual CA loader rejects missing path and dangerous inherited switches before connecting',async()=>{
 for(const env of [{},{NODE_EXTRA_CA_CERTS:'/not-read',NODE_TLS_REJECT_UNAUTHORIZED:'0'},
 {NODE_EXTRA_CA_CERTS:'/not-read',NODE_OPTIONS:'--inspect'},{NODE_EXTRA_CA_CERTS:'/not-read',ACTIONS_STEP_DEBUG:'true'}])
 await assert.rejects(loadPinnedInstallerCa(env),/installer_preflight_refused/)
})
test('CA refusal creates no database client',async()=>{
 const f=fixture({ca:{preflightCode:'ca',message:'synthetic-only-password'}}),r=await f.run(c,secrets)
 assert.equal(r.diagnostic,'ca');assert.equal(f.options.length,0)
 assert.ok(!JSON.stringify(r).includes('synthetic-only-password'))
})
for(const [code,expected] of [['28P01','authentication'],['28000','authentication'],
 ['ERR_TLS_CERT_ALTNAME_INVALID','tls'],['SELF_SIGNED_CERT_IN_CHAIN','tls'],
 ['ECONNREFUSED','connection_or_timeout'],['ETIMEDOUT','connection_or_timeout']]){
 test('sanitizes connect '+code,async()=>{
  const f=fixture({connect:{code,message:secrets.installer,detail:'raw-private',stack:'raw-stack'}}),r=await f.run(c,secrets)
  assert.equal(r.diagnostic,expected);assert.equal(f.closed(),1)
  assert.equal(r.connection_cleanup_verified,true)
  assert.ok(!JSON.stringify(r).includes('synthetic-only-password'))
  assert.ok(!JSON.stringify(r).includes('raw-private'))
 })
}
test('unknown connection exception does not inspect or emit its text',async()=>{
 const f=fixture({connect:{message:secrets.installer}}),r=await f.run(c,secrets)
 assert.equal(r.diagnostic,'connection');assert.ok(!JSON.stringify(r).includes('postgresql'))
})
test('genuine session/effective principal, safe attributes and read-only mode are mandatory',async()=>{
 for(const patch of [{effective:'supabase_admin'},{rolsuper:true},{database_owner:false},
 {rolcreaterole:false},{rolcreatedb:false},{rolbypassrls:false},{rolinherit:false},{rolreplication:true},{read_only:false}]){
  const f=fixture({identity:patch}),r=await f.run(c,secrets)
  assert.equal(r.diagnostic,'identity');assert.equal(r.state,'preflight_refused')
  assert.equal(f.calls.at(-1).sql,'rollback');assert.equal(f.closed(),1)
 }
})
test('selected database versions remain mandatory',async()=>{
 for(const [patch,why] of [[{postgres_supported:false},'prerequisite'],[{vector_supported:false},'prerequisite']]){
  const f=fixture({identity:patch}),r=await f.run(c,secrets);assert.equal(r.diagnostic,why)
 }
})
test('C3 mismatch/open gate/schedule/source or invalid digest refuses',async()=>{
 for(const patch of [{gate_closed:false},{schedule_closed:false},{sources_closed:false},{credentials_empty:false},{receipt_matches:false},{baseline:'invalid'}]){
  const f=fixture({c3:patch}),r=await f.run(c,secrets);assert.equal(r.diagnostic,'prerequisite');assert.equal(r.c3_baseline_sha256,null)
 }
})
test('permission and missing-prerequisite errors remain distinct',async()=>{
 for(const [code,expected] of [['42501','permission'],['42P01','prerequisite'],['42703','prerequisite'],['42883','prerequisite'],['57014','connection_or_timeout'],['XX000','query']]){
  const f=fixture({c3Error:{code,message:secrets.installer}}),r=await f.run(c,secrets)
  assert.equal(r.diagnostic,expected);assert.equal(r.connection_cleanup_verified,true)
  assert.ok(!JSON.stringify(r).includes('synthetic-only-password'))
 }
})
test('lost BEGIN acknowledgement still rolls back and closes',async()=>{
 const f=fixture({begin:{code:'ECONNRESET'}}),r=await f.run(c,secrets)
 assert.equal(r.state,'preflight_refused');assert.equal(f.calls.at(-1).sql,'rollback');assert.equal(f.closed(),1)
})
test('rollback or close failure overrides success and withholds baseline',async()=>{
 for(const change of [{rollback:{code:'ECONNRESET'}},{close:{message:secrets.installer}}]){
  const f=fixture(change),r=await f.run(c,secrets)
  assert.equal(r.diagnostic,'cleanup');assert.equal(r.connection_cleanup_verified,false)
  assert.equal(r.state,'preflight_refused');assert.equal(r.c3_baseline_sha256,null)
  assert.equal(f.closed(),1)
 }
})

test('actual client TLS must be encrypted and authorized even with safe configuration',async()=>{
 for(const socket of [{encrypted:false},{authorized:false},{encrypted:undefined},{authorized:undefined}]){
  const f=fixture({socket}),r=await f.run(c,secrets)
  assert.equal(r.diagnostic,'tls');assert.equal(f.calls.length,0);assert.equal(f.closed(),1)
 }
})
test('pooler backend hop SSL is metadata, never substituted for verified client TLS',async()=>{
 const f=fixture({identity:{tls:false}}),r=await f.run(c,secrets)
 assert.equal(r.state,'installer_authenticated_c3_current');assert.equal(r.backend_tls_observed,false)
})
