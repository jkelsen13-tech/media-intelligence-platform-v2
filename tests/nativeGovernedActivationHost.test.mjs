import test from 'node:test'
import assert from 'node:assert/strict'
import {validateActivationHostConfig,dispatchActivationHostAction,activationHostActionSatisfied} from '../supabase/qualification/native-governed-activation/host.mjs'
import {ROLES} from '../supabase/qualification/native-governed-activation/prepare.mjs'
const hash='a'.repeat(64),release='b'.repeat(40),profile='native-governed-activation-v1'
const plain={releaseSha:release,operationId:'1'.repeat(32),expectedLogin:'qik_native_installer',auditLogin:'qik_native_audit',
 c3OperationId:'2'.repeat(32),c3ManifestSha256:hash,expectedManifestSha256:hash,
 expectedNativeProgramSha256:hash,dblinkMetadataSha256:hash,collectorSource:'qik-synthetic',
 expectedMetadataAuditor:'qik_activation_metadata_audit',expectedSuccessorProgram:hash}
const dsn=login=>'postgresql://'+login+'.qikvmopbtijoebdqosyq:SYNTHETIC_ONLY@aws-0-us-west-1.pooler.supabase.com:5432/postgres'
const secrets={installer:dsn(plain.expectedLogin),audit:dsn(plain.auditLogin)+'?sslmode=verify-full&sslrootcert=system&connect_timeout=5',metadataAudit:dsn(plain.expectedMetadataAuditor)}
const config=()=>validateActivationHostConfig(JSON.stringify(plain),secrets)
const read=()=>{throw Error('mock source seam unused')}
const result=(state)=>({state,operation_id:plain.operationId,manifest_sha256:hash,native_mode:'native-governed-v6',
 native_program_sha256:hash,activation_profile:profile,successor_program_sha256:hash,historical_checkpoint_only:true,
 activation_allowed:false,needs_reconciliation:false,audit_qualified:state==='installed_disabled_audit_qualified',
 connection_cleanup_verified:true,cleanup_diagnostic:null})
test('successor host requires distinct secure qik metadata credential and explicit profile',()=>{
 const c=config();assert.equal(c.activationProfile,profile);assert.equal(c.disposable,false)
 assert.equal(c.authorization,'owner-authorized-native-governed-activation-bootstrap-install')
 for(const x of [{expectedMetadataAuditor:plain.expectedLogin},{expectedMetadataAuditor:plain.auditLogin},
  {expectedMetadataAuditor:'mip_mentions_owner'},{expectedLogin:'bad;role'},{expectedSuccessorProgram:null},
  {payload:'PRIVATE_SENTINEL'},{activate:true},{expectedMetadataAuditor:'bad;role'}])
  assert.throws(()=>validateActivationHostConfig(JSON.stringify({...plain,...x}),secrets))
})
test('managed owner name is configurable only as installer and proves no authenticated operation',()=>{
 const c=validateActivationHostConfig(JSON.stringify({...plain,expectedLogin:'postgres'}),
  {...secrets,installer:dsn('postgres')})
 assert.equal(c.expectedLogin,'postgres');assert.equal(c.connectionString,dsn('postgres'))
 assert.equal(c.auditLogin,plain.auditLogin);assert.equal(c.expectedMetadataAuditor,plain.expectedMetadataAuditor)
 assert.equal(c.disposable,false);assert.equal(Object.isFrozen(c),true)
 for(const field of ['state','database_owner','connection_cleanup_verified','base_audit_qualified',
  'permission_boundary_current','activation_allowed','publication_allowed','material_access_allowed','production_qualified'])
  assert.equal(Object.hasOwn(c,field),false)
 for(const action of ['install','reconcile','audit'])assert.equal(activationHostActionSatisfied(action,c),false)
 // The same name with a mismatched credential must still fail target validation.
 assert.throws(()=>validateActivationHostConfig(JSON.stringify({...plain,expectedLogin:'postgres'}),secrets))
})
test('managed owner and forbidden service names remain refused for both auditors with matching credentials',()=>{
 for(const login of ['postgres','service_role','authenticator','supabase_admin']){
  assert.throws(()=>validateActivationHostConfig(JSON.stringify({...plain,auditLogin:login}),
   {...secrets,audit:dsn(login)+'?sslmode=verify-full&sslrootcert=system&connect_timeout=5'}))
  assert.throws(()=>validateActivationHostConfig(JSON.stringify({...plain,expectedMetadataAuditor:login}),
   {...secrets,metadataAudit:dsn(login)}))
 }
})
test('service and protected roles remain refused as installer and metadata auditor with matching credentials',()=>{
 for(const login of ['service_role','authenticator','supabase_admin',...ROLES]){
  assert.throws(()=>validateActivationHostConfig(JSON.stringify({...plain,expectedLogin:login}),
   {...secrets,installer:dsn(login)}))
  assert.throws(()=>validateActivationHostConfig(JSON.stringify({...plain,expectedMetadataAuditor:login}),
   {...secrets,metadataAudit:dsn(login)}))
 }
})
test('successor host refuses absent, wrong-project and externally routed metadata secrets',()=>{
 for(const value of ['',dsn('someone_else'),dsn(plain.expectedMetadataAuditor).replace('aws-0-us-west-1.pooler.supabase.com','example.invalid'),
  dsn(plain.expectedMetadataAuditor)+'?sslmode=disable'])
  assert.throws(()=>validateActivationHostConfig(JSON.stringify(plain),{...secrets,metadataAudit:value}))
 assert.throws(()=>validateActivationHostConfig(JSON.stringify(plain),{installer:secrets.installer,audit:secrets.audit}))
})
test('install first reconciles exact successor and never replays ambiguous or existing state',async()=>{
 for(const state of ['commit_ambiguous','installed_disabled_audit_pending','reconciliation_drift']){
  let calls=0;const api={reconcileComparisonInstall:async()=>({...result(state),needs_reconciliation:state!=='installed_disabled_audit_pending'}),
   installComparisonAtomic:async()=>{calls++;return result('installed_disabled_audit_pending')}}
  await dispatchActivationHostAction('install',config(),read,api);assert.equal(calls,0)
 }
 let installed=0
 const receipt=await dispatchActivationHostAction('install',config(),read,{
  reconcileComparisonInstall:async()=>result('not_installed'),
  installComparisonAtomic:async()=>{installed++;return result('installed_disabled_audit_pending')}
 })
 assert.equal(installed,1);assert.equal(activationHostActionSatisfied('install',receipt),true)
 assert.equal(receipt.activation_allowed,false);assert.equal(receipt.permission_boundary_current,false)
})
test('legacy or mismatched program receipt never qualifies successor installation',async()=>{
 for(const changed of [{activation_profile:null},{successor_program_sha256:'0'.repeat(64)},
  {native_program_sha256:'0'.repeat(64)},{connection_cleanup_verified:false}]){
  const receipt=await dispatchActivationHostAction('reconcile',config(),read,{
   reconcileComparisonInstall:async()=>({...result('installed_disabled_audit_pending'),...changed})
  })
  assert.equal(activationHostActionSatisfied('reconcile',receipt),false)
 }
})
test('base autonomous audit alone never establishes final permission qualification',async()=>{
 let metadata=0
 const receipt=await dispatchActivationHostAction('audit',config(),read,{
  qualifyComparisonAudit:async()=>({...result('installed_disabled_audit_qualified'),connection_cleanup_verified:false}),
  auditNativeActivationMetadata:async()=>{metadata++;throw Error('PRIVATE_SENTINEL')}
 })
 assert.equal(metadata,0);assert.equal(activationHostActionSatisfied('audit',receipt),false)
})
test('audit composes both actual API contracts with isolated metadata configuration',async()=>{
 let seen
 const api={qualifyComparisonAudit:async()=>result('installed_disabled_audit_qualified'),
  auditNativeActivationMetadata:async c=>{seen=c;return {profile,operation_id:plain.operationId,state:'disabled_bootstrap',
   permission_boundary_current:true,authority_current:false,production_qualified:false,publication_allowed:false,
   material_access_allowed:false,connection_cleanup_verified:true}}
 }
 const r=await dispatchActivationHostAction('audit',config(),read,api)
 assert.equal(activationHostActionSatisfied('audit',r),true);assert.equal(r.permission_boundary_current,true)
 assert.equal(seen.metadataAuditConnectionString,secrets.metadataAudit)
 assert.equal(Object.hasOwn(seen,'connectionString'),false);assert.equal(Object.hasOwn(seen,'auditConnectionString'),false)
 assert.equal(r.activation_allowed,false);assert.equal(r.material_access_allowed,false);assert.equal(r.production_qualified,false)
 assert.equal(JSON.stringify(r).includes('SYNTHETIC_ONLY'),false)
})
test('metadata audit with active state, authority claim or uncertain cleanup is refused by disabled host',async()=>{
 for(const changed of [{state:'active'},{authority_current:true},{permission_boundary_current:false},{connection_cleanup_verified:false}]){
  const r=await dispatchActivationHostAction('audit',config(),read,{
   qualifyComparisonAudit:async()=>result('installed_disabled_audit_qualified'),
   auditNativeActivationMetadata:async()=>({profile,operation_id:plain.operationId,state:'disabled_bootstrap',
    permission_boundary_current:true,authority_current:false,production_qualified:false,publication_allowed:false,
    material_access_allowed:false,connection_cleanup_verified:true,...changed})
  })
  assert.equal(activationHostActionSatisfied('audit',r),false)
 }
})
test('host has no activation/material action and never returns thrown secret diagnostics',async()=>{
 for(const action of ['activate','transition','transfer','install']){
  const r=await dispatchActivationHostAction(action,config(),read,{reconcileComparisonInstall:async()=>{throw Error('PRIVATE_SENTINEL')}})
  assert.equal(r.activation_allowed,false);assert.equal(r.material_access_allowed,false)
  assert.equal(JSON.stringify(r).includes('PRIVATE_SENTINEL'),false)
  assert.equal(activationHostActionSatisfied(action,r),false)
 }
})
