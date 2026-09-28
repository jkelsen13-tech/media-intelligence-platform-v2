import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {prepareAtomicInstall,validateAtomicConfig,DOJ_PATH,DOJ_SOURCE_COMMIT} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {SOURCE_COMMIT} from '../supabase/qualification/qik-comparison-adapter/compileSource.mjs'
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
