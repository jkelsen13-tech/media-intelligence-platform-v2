import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareAtomicInstall,validateAtomicConfig,DOJ_PATH,DOJ_SOURCE_COMMIT,sanitizeInstallDiagnostic,INSTALL_DIAGNOSTICS,finishAtomicConnection} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {SOURCE_COMMIT,compileSource,NAME_MAPPING} from '../supabase/qualification/qik-comparison-adapter/compileSource.mjs'
const root=new URL('../',import.meta.url)
const reader=async(path,ref)=>{
 assert.ok([SOURCE_COMMIT,DOJ_SOURCE_COMMIT].includes(ref))
 return readFile(new URL(path,root))
}
const H='1'.repeat(64)
function config(){return {authorization:'owner-authorized-disabled-comparison-install',
 operationId:'2'.repeat(32),expectedLogin:'postgres',c3OperationId:'3'.repeat(32),
 c3ManifestSha256:H,expectedManifestSha256:H,dblinkMetadataSha256:H,collectorSource:'qik-native-v1',
 auditLogin:'qik_audit',auditConnectionString:'postgresql://qik_audit:synthetic-password@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=system&connect_timeout=5'}}
test('source plan preserves pinned source and final assertion order',async()=>{
 const p=await prepareAtomicInstall(reader)
 assert.equal(p.manifest_sha256,(await prepareAtomicInstall(reader)).manifest_sha256)
 assert.ok(p.roles.length>30)
 assert.equal(p.credential_statement_timeout_max_ms,1000)
 assert.deepEqual(p.catalog_inspection_schemas,['mip_comparison_kernel_v1','mip_cutover_authority','mip_identity'])
 const original=await compileSource(reader)
 const changes=p.closure.split('\n').filter(line=>line.startsWith('alter role '))
 assert.equal(changes.length,7)
 assert.deepEqual(changes.map(line=>line.match(/^alter role ([a-z0-9_]+) noinherit;$/)?.[1]).sort(),
  Object.entries(NAME_MAPPING).filter(([name])=>name.startsWith('qual_')).map(([,name])=>name).sort())
 assert.equal(p.compatibility,original.steps.find(step=>step.path==='adapter:compatibility-assertions-v1').sql)
 const finalSql=original.steps.find(step=>step.path.endsWith('/019_native_retention_permissions.sql')).sql
 assert.equal(p.assertions,finalSql.slice(finalSql.indexOf('do $final_native_permissions$')))

 for(const step of p.body)assert.equal(step.compiled_sha256,createHash('sha256').update(step.sql).digest('hex'))
 assert.ok(p.body.every(s=>!s.path.endsWith('/019_native_retention_permissions.sql')))
 assert.match(p.permissions,/revoke all on function/)
 assert.ok(p.assertions.startsWith('do $final_native_permissions$'))
 assert.ok(p.dojAssertions.startsWith('do $final_doj_permissions$'))
 assert.match(p.dojBody,/create table mip_identity.doj_policy_versions/)
 assert.doesNotMatch(p.dojBody,/\bcomparison_qualification\b/)
 assert.match(p.body.find(s=>s.path.endsWith('/009_factual_enforcement.sql')).sql,/alter extension dblink set schema mip_factual_transport/)
 assert.doesNotMatch(p.body.map(s=>s.sql).join('\n'),/create extension dblink/)
 assert.match(p.body[0].sql,/grant create on schema "mip_comparison_kernel_v1"/)
})
test('source digest drift cannot reach installer execution',async()=>{
 await assert.rejects(prepareAtomicInstall(async(p,r)=>Buffer.concat([await reader(p,r),Buffer.from('\n')])),/adapter_source_digest/)
 await assert.rejects(prepareAtomicInstall(async(p,r)=>p===DOJ_PATH?Buffer.from('begin;\ncommit;\n'):reader(p,r)),/doj_source_digest/)
})
test('required config is finite, explicit and secret-free when normalized',()=>{
 const c=validateAtomicConfig(config())
 assert.equal(c.creator,'mip_tmp_'+'2'.repeat(32))
 assert.equal('auditConnectionString' in c,false)
 assert.equal('connectionString' in c,false)
 for(const key of ['operationId','c3OperationId','c3ManifestSha256','expectedManifestSha256','dblinkMetadataSha256','collectorSource']){
  const x=config();delete x[key];assert.throws(()=>validateAtomicConfig(x))
 }
})
test('audit credential route is exact qik TLS, never administrator or transaction pooler',()=>{
 for(const replacement of [
  'postgresql://qik_audit:synthetic@db.niejaejtbxgakyrsntxm.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=system&connect_timeout=5',
  config().auditConnectionString.replace('5432','6543'),
  config().auditConnectionString.replace('verify-full','require'),
  config().auditConnectionString+'&options=-csearch_path=public',
  config().auditConnectionString.replace('/postgres?','/other?'),
 ]){
  assert.throws(()=>validateAtomicConfig({...config(),auditConnectionString:replacement}),/atomic_audit_target/)
 }
 assert.throws(()=>validateAtomicConfig({...config(),auditLogin:'postgres'}),/audit_login/)
 assert.throws(()=>validateAtomicConfig({...config(),disposable:true}),/disposable_target/)
})
test('session pooler is supported only with exact project-qualified login',()=>{
 const good=config()
 good.auditConnectionString=good.auditConnectionString
  .replace('qik_audit:','qik_audit.qikvmopbtijoebdqosyq:')
  .replace('db.qikvmopbtijoebdqosyq.supabase.co','aws-0-us-west-1.pooler.supabase.com')
 assert.equal(validateAtomicConfig(good).auditLogin,'qik_audit')
 assert.throws(()=>validateAtomicConfig({...good,auditConnectionString:good.auditConnectionString.replace('.qikvmopbtijoebdqosyq:','.niejaejtbxgakyrsntxm:')}),/audit_target/)
})

test('diagnostics expose only static controlled codes and omit arbitrary error data',()=>{
 assert.equal(sanitizeInstallDiagnostic({message:'atomic_audit_column_acl',detail:'synthetic-secret'}),'atomic_audit_column_acl')
 assert.equal(sanitizeInstallDiagnostic({message:'mip_native_final_chain_table_acl: synthetic-secret'}),'mip_native_final_chain_table_acl')
 for(const message of ['synthetic-secret','atomic_audit_column_acl: synthetic-secret','mip_native_final_chain_table_acl_untrusted: synthetic-secret','atomic_audit_unknown'])assert.equal(sanitizeInstallDiagnostic({message}),null)
 for(const value of [null,{},42,{message:42}])assert.equal(sanitizeInstallDiagnostic(value),null)
 assert.equal(Object.isFrozen(INSTALL_DIAGNOSTICS),true)
})

function pendingReceipt(state='installed_disabled_audit_pending',needsReconciliation=false){
 return {state,operation_id:'2'.repeat(32),manifest_sha256:H,activation_allowed:false,
  needs_reconciliation:needsReconciliation,audit_qualified:state==='installed_disabled_audit_qualified'}
}
test('cleanup completion preserves acknowledged transaction evidence and waits for close',async()=>{
 const receipt=pendingReceipt(),calls=[]
 let finishClose
 const closing=new Promise(resolve=>{finishClose=resolve})
 const pending=finishAtomicConnection({end:async()=>{calls.push('end');await closing}},receipt)
 assert.deepEqual(calls,['end'])
 assert.equal(receipt.connection_cleanup_verified,undefined)
 finishClose();await pending
 assert.equal(receipt.state,'installed_disabled_audit_pending')
 assert.equal(receipt.needs_reconciliation,false)
 assert.equal(receipt.connection_cleanup_verified,true)
 assert.equal(receipt.cleanup_diagnostic,null)
})
test('close rejection or synchronous throw cannot hide committed installation or permit retry',async()=>{
 for(const end of [
  async()=>{throw Object.assign(Error('synthetic-credential'),{detail:'synthetic-material'})},
  ()=>{throw Error('synthetic-credential')}
 ]){
  const receipt=pendingReceipt()
  await finishAtomicConnection({end},receipt)
  assert.equal(receipt.state,'installed_disabled_audit_pending')
  assert.equal(receipt.needs_reconciliation,true)
  assert.equal(receipt.connection_cleanup_verified,false)
  assert.equal(receipt.cleanup_diagnostic,'atomic_connection_close_failed')
  assert.doesNotMatch(JSON.stringify(receipt),/synthetic-credential|synthetic-material/)
 }
})
test('cleanup preserves commit ambiguity and never issues rollback or replay for it',async()=>{
 const calls=[],receipt=pendingReceipt('commit_ambiguous',true)
 await finishAtomicConnection({query:async sql=>calls.push(sql),end:async()=>calls.push('end')},receipt)
 assert.deepEqual(calls,['end'])
 assert.equal(receipt.state,'commit_ambiguous')
 assert.equal(receipt.needs_reconciliation,true)
 assert.equal(receipt.connection_cleanup_verified,true)
})
test('reconciliation absence plus failed rollback remains unsafe even when close succeeds',async()=>{
 const calls=[],receipt=pendingReceipt('not_installed')
 await finishAtomicConnection({
  query:async sql=>{calls.push(sql);throw Error('synthetic-credential')},
  end:async()=>calls.push('end')
 },receipt,true)
 assert.deepEqual(calls,['rollback','end'])
 assert.equal(receipt.state,'not_installed')
 assert.equal(receipt.needs_reconciliation,true)
 assert.equal(receipt.connection_cleanup_verified,false)
 assert.equal(receipt.cleanup_diagnostic,'atomic_cleanup_rollback_failed')
})
test('both cleanup failures still attempt close once and expose only fixed diagnostics',async()=>{
 const calls=[],receipt=pendingReceipt('installed_disabled_audit_qualified')
 await finishAtomicConnection({
  query:async sql=>{calls.push(sql);throw Error('synthetic-rollback-secret')},
  end:async()=>{calls.push('end');throw Error('synthetic-close-secret')}
 },receipt,true)
 assert.deepEqual(calls,['rollback','end'])
 assert.equal(receipt.state,'installed_disabled_audit_qualified')
 assert.equal(receipt.audit_qualified,false)
 assert.equal(receipt.needs_reconciliation,true)
 assert.equal(receipt.connection_cleanup_verified,false)
 assert.equal(receipt.cleanup_diagnostic,'atomic_connection_close_failed')
 assert.doesNotMatch(JSON.stringify(receipt),/synthetic-/)
})
test('prior install rollback failure and missing connection never become verified cleanup',async()=>{
 const refused=pendingReceipt('installation_refused')
 await finishAtomicConnection({end:async()=>{}},refused,false,true)
 assert.equal(refused.state,'installation_refused')
 assert.equal(refused.needs_reconciliation,true)
 assert.equal(refused.connection_cleanup_verified,false)
 assert.equal(refused.cleanup_diagnostic,'atomic_cleanup_rollback_failed')
 const unavailable=pendingReceipt('reconciliation_unavailable',true)
 await finishAtomicConnection(null,unavailable,true)
 assert.equal(unavailable.connection_cleanup_verified,false)
 assert.equal(unavailable.needs_reconciliation,true)
})
