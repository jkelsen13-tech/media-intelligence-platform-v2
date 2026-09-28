import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {BASE,MODE,validateHostConfig,verifySourceBlob,sanitizeApiResult,dispatchHostAction,actionSatisfied} from '../supabase/qualification/native-governed-host/adapter.mjs'
const hash='a'.repeat(64)
const plain={releaseSha:BASE,operationId:'1'.repeat(32),expectedLogin:'postgres',auditLogin:'qik_audit_only',
 c3OperationId:'2'.repeat(32),c3ManifestSha256:hash,expectedManifestSha256:hash,
 expectedNativeProgramSha256:hash,dblinkMetadataSha256:hash,collectorSource:'qik-qualified-source'}
const secrets={installer:'postgresql://postgres.qikvmopbtijoebdqosyq:SYNTHETIC_SECRET@aws-0-us-west-1.pooler.supabase.com:5432/postgres',
 audit:'postgresql://qik_audit_only.qikvmopbtijoebdqosyq:SYNTHETIC_AUDIT@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=system&connect_timeout=5'}
const config=()=>validateHostConfig(JSON.stringify(plain),secrets)
const result=(state,c=config())=>({state,operation_id:c.operationId,manifest_sha256:c.expectedManifestSha256,
 native_mode:MODE,native_program_sha256:c.expectedNativeProgramSha256,activation_allowed:false,
 needs_reconciliation:!['not_installed','installed_disabled_audit_pending','installed_disabled_audit_qualified'].includes(state),
 audit_qualified:state==='installed_disabled_audit_qualified'})
const reader=()=>{throw Error('source reader unused by injected orchestration fixture')}
test('exact secure hosted configuration selects v6 and forbids override keys',()=>{
 const c=config();assert.equal(c.nativeMode,MODE);assert.equal(c.disposable,false);assert.equal(c.sessionPoolerHost,'aws-0-us-west-1.pooler.supabase.com')
 for(const extra of [{nativeMode:'native-governed-v5'},{sql:'select secret'},{disposable:true},{action:'activate'}])
  assert.throws(()=>validateHostConfig(JSON.stringify({...plain,...extra}),secrets),/native_host_configuration_refused/)
})
test('missing or unknown secure configuration refuses without connecting',()=>{
 for(const value of ['',null,'{}','[]','x'.repeat(4097)])
  assert.throws(()=>validateHostConfig(value,secrets),/native_host_configuration_refused/)
 assert.throws(()=>validateHostConfig(JSON.stringify(plain),{installer:secrets.installer}),/native_host_configuration_refused/)
 assert.throws(()=>validateHostConfig(JSON.stringify({...plain,auditLogin:'postgres'}),secrets),/native_host_configuration_refused/)
})
test('wrong target, insecure audit TLS, query override and fragment refuse',()=>{
 for(const installer of [secrets.installer.replace('aws-0-us-west-1.pooler.supabase.com','example.invalid'),secrets.installer+'?sslmode=disable',secrets.installer+'#secret',secrets.installer.replace('/postgres','/other')])
  assert.throws(()=>validateHostConfig(JSON.stringify(plain),{...secrets,installer}))
 for(const audit of [secrets.audit.replace('verify-full','require'),secrets.audit+'&options=unsafe',secrets.audit.replace('connect_timeout=5','connect_timeout=50')])
  assert.throws(()=>validateHostConfig(JSON.stringify(plain),{...secrets,audit}))
})
test('blob verification binds original bytes and rejects wrong or non-UTF8 bytes',()=>{
 const b=Buffer.from('pinned source\n'),pin=createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')
 assert.deepEqual(verifySourceBlob(b,pin),b)
 assert.throws(()=>verifySourceBlob(Buffer.from('changed'),pin))
 const invalid=Buffer.from([255]);const invalidPin=createHash('sha1').update(Buffer.from('blob 1\0')).update(invalid).digest('hex')
 assert.throws(()=>verifySourceBlob(invalid,invalidPin))
})
test('installation requires fresh not-installed reconciliation and uses exact identity once',async()=>{
 const c=config(),calls=[]
 const api={async reconcileComparisonInstall(x,r){calls.push(['reconcile',x,r]);return result('not_installed',x)},
  async installComparisonAtomic(x,r){calls.push(['install',x,r]);return result('installed_disabled_audit_pending',x)}}
 const out=await dispatchHostAction('install',c,reader,api)
 assert.deepEqual(calls.map(x=>x[0]),['reconcile','install'])
 assert.ok(calls.every(x=>x[1]===c&&x[2]===reader))
 assert.equal(out.state,'installed_disabled_audit_pending');assert.equal(out.activation_allowed,false)
 assert.equal(out.connection_cleanup_verified,false)
})
test('existing receipt, drift or inflight state never causes install replay',async()=>{
 for(const state of ['installed_disabled_audit_pending','reconciliation_drift','reconciliation_inflight','reconciliation_unavailable']){
  let writes=0
  const out=await dispatchHostAction('install',config(),reader,{async reconcileComparisonInstall(){return result(state)},async installComparisonAtomic(){writes++}})
  assert.equal(writes,0);assert.equal(out.state,state)
 }
})
test('ambiguous commit returns same operation with no automatic retry or audit',async()=>{
 let reconciles=0,installs=0
 const out=await dispatchHostAction('install',config(),reader,{async reconcileComparisonInstall(){reconciles++;return result('not_installed')},
  async installComparisonAtomic(){installs++;return result('commit_ambiguous')}})
 assert.equal(reconciles,1);assert.equal(installs,1);assert.equal(out.operation_id,plain.operationId);assert.equal(out.needs_reconciliation,true)
})
test('separate reconciliation never mutates or substitutes a fresh operation',async()=>{
 let calls=0
 const c=config(),out=await dispatchHostAction('reconcile',c,reader,{async reconcileComparisonInstall(x){assert.equal(x,c);calls++;return result('installed_disabled_audit_pending')}})
 assert.equal(calls,1);assert.equal(out.operation_id,c.operationId)
})
test('audit action delegates exact API and retains disabled flags',async()=>{
 let calls=0
 const out=await dispatchHostAction('audit',config(),reader,{async qualifyComparisonAudit(){calls++;return result('installed_disabled_audit_qualified')}})
 assert.equal(calls,1);assert.equal(out.audit_qualified,true);assert.equal(out.activation_allowed,false);assert.equal(out.publication_allowed,false)
})
test('wrong manifest, operation, mode, program or activation receipt refuses',()=>{
 for(const change of [{manifest_sha256:'b'.repeat(64)},{operation_id:'3'.repeat(32)},{native_mode:'native-governed-v5'},
 {native_program_sha256:'b'.repeat(64)},{activation_allowed:true},{needs_reconciliation:true}]){
  const out=sanitizeApiResult({...result('installed_disabled_audit_pending'),...change},config())
  assert.equal(out.state,'outcome_unknown');assert.equal(out.needs_reconciliation,true)
 }
})
test('raw driver errors and unexpected payload fields never reach receipt',async()=>{
 const raw=Object.assign(Error('SYNTHETIC_SECRET BODY_SENTINEL'),{detail:'SYNTHETIC_AUDIT',cause:Error('capture payload')})
 const out=await dispatchHostAction('reconcile',config(),reader,{async reconcileComparisonInstall(){throw raw}})
 assert.equal(out.state,'outcome_unknown')
 const clean=sanitizeApiResult({...result('installed_disabled_audit_pending'),phase:'BODY_SENTINEL',diagnostic:'SYNTHETIC_SECRET',native_failure:{body:'BODY_SENTINEL'}},config())
 for(const r of [out,clean])assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_SECRET|SYNTHETIC_AUDIT|BODY_SENTINEL|capture payload/)
 assert.deepEqual(Object.keys(clean).sort(),['contract','state','operation_id','release_sha','manifest_sha256','native_mode','native_program_sha256','needs_reconciliation','audit_qualified','activation_allowed','publication_allowed','material_access_allowed','connection_cleanup_verified','diagnostic'].sort())
})
test('unknown action and unrecognized result never invoke another API',async()=>{
 let calls=0;const api={async reconcileComparisonInstall(){calls++;return result('not_installed')}}
 const out=await dispatchHostAction('activate',config(),reader,api)
 assert.equal(calls,0);assert.equal(out.state,'configuration_refused')
 assert.equal(sanitizeApiResult({...result('not_installed'),state:'published'},config()).state,'outcome_unknown')
})

test('audit and install do not report a missing installation as fulfilled',()=>{
 const absent=sanitizeApiResult(result('not_installed'),config())
 assert.equal(actionSatisfied('reconcile',absent),true)
 assert.equal(actionSatisfied('install',absent),false)
 assert.equal(actionSatisfied('audit',absent),false)
 assert.equal(actionSatisfied('audit',sanitizeApiResult(result('installed_disabled_audit_qualified'),config())),true)
})

test('swallowed underlying close failure never becomes verified cleanup',async()=>{
 const api={async reconcileComparisonInstall(){
  try{throw Error('SYNTHETIC_CLOSE_SECRET')}catch{/* Existing API hides this cleanup error. */}
  return result('installed_disabled_audit_pending')
 }}
 const out=await dispatchHostAction('reconcile',config(),reader,api)
 assert.equal(out.state,'installed_disabled_audit_pending')
 assert.equal(out.connection_cleanup_verified,false)
 assert.doesNotMatch(JSON.stringify(out),/SYNTHETIC_CLOSE_SECRET/)
})
