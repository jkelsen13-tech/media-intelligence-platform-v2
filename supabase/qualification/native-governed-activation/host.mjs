// Metadata-only host successor. No source bytes, activation, SQL or material callback.
import {validateHostConfig,sanitizeApiResult} from '../native-governed-host/adapter.mjs'
import {PROFILE,ROLES} from './prepare.mjs'
const extra=['expectedMetadataAuditor','expectedSuccessorProgram']
const fields=['releaseSha','operationId','expectedLogin','auditLogin','c3OperationId','c3ManifestSha256','expectedManifestSha256','expectedNativeProgramSha256','dblinkMetadataSha256','collectorSource',...extra]
const fail=()=>{throw Error('native_activation_host_configuration_refused')}
export function validateActivationHostConfig(raw,secrets){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)fail()
 let input;try{input=JSON.parse(raw)}catch{fail()}
 if(!input||Array.isArray(input)||Object.keys(input).sort().join()!==[...fields].sort().join()
  ||!/^[0-9a-f]{64}$/.test(input.expectedSuccessorProgram??'')
  ||!/^[a-z][a-z0-9_]{0,62}$/.test(input.expectedMetadataAuditor??'')
  ||[input.expectedLogin,input.auditLogin,'postgres','service_role','authenticator','supabase_admin',...ROLES].includes(input.expectedMetadataAuditor)
  ||['postgres','service_role','authenticator','supabase_admin',...ROLES].includes(input.expectedLogin))fail()
 if(!secrets||Object.keys(secrets).sort().join()!=='audit,installer,metadataAudit')fail()
 const common=Object.fromEntries(Object.entries(input).filter(([k])=>!extra.includes(k)))
 const validated=validateHostConfig(JSON.stringify(common),{installer:secrets.installer,audit:secrets.audit})
 // The independent metadata auditor uses the same exact qik/session-TLS target validation.
 validateHostConfig(JSON.stringify({...common,expectedLogin:input.expectedMetadataAuditor}),
  {installer:secrets.metadataAudit,audit:secrets.audit})
 return Object.freeze({...validated,activationProfile:PROFILE,
  authorization:'owner-authorized-native-governed-activation-bootstrap-install',
  expectedMetadataAuditor:input.expectedMetadataAuditor,expectedSuccessorProgram:input.expectedSuccessorProgram,
  metadataAuditConnectionString:secrets.metadataAudit})
}
function closed(r,c,metadata=false){
 const base={contract:'native-activation-host-receipt-v1',profile:PROFILE,operation_id:c.operationId,
  release_sha:c.releaseSha,install_manifest_sha256:c.expectedManifestSha256,
  native_program_sha256:c.expectedNativeProgramSha256,successor_program_sha256:c.expectedSuccessorProgram,
  state:'outcome_unknown',needs_reconciliation:true,base_audit_qualified:false,
  permission_boundary_current:false,connection_cleanup_verified:false,
  activation_allowed:false,publication_allowed:false,material_access_allowed:false,production_qualified:false}
 if(metadata){
  if(r?.profile!==PROFILE||r.operation_id!==c.operationId||r.state!=='disabled_bootstrap'
   ||r.permission_boundary_current!==true||r.authority_current!==false||r.production_qualified!==false
   ||r.publication_allowed!==false||r.material_access_allowed!==false||r.connection_cleanup_verified!==true)return base
  return {...base,state:'installed_disabled_permission_audit_qualified',needs_reconciliation:false,
   base_audit_qualified:true,permission_boundary_current:true,connection_cleanup_verified:true}
 }
 if(r?.activation_profile!==PROFILE||r.successor_program_sha256!==c.expectedSuccessorProgram)return base
 const safe=sanitizeApiResult(r,c)
 return {...base,state:safe.state,needs_reconciliation:safe.needs_reconciliation,
  base_audit_qualified:safe.audit_qualified,connection_cleanup_verified:safe.connection_cleanup_verified}
}
// Fixed in-process orchestration seam for synthetic tests. Production runner binds actual APIs.
export async function dispatchActivationHostAction(action,c,read,api){
 if(!['install','reconcile','audit'].includes(action))return closed(null,c)
 try{
  if(action==='install'){
   const before=closed(await api.reconcileComparisonInstall(c,read),c)
   if(before.state!=='not_installed'||before.needs_reconciliation!==false||!before.connection_cleanup_verified)return before
   return closed(await api.installComparisonAtomic(c,read),c)
  }
  if(action==='reconcile')return closed(await api.reconcileComparisonInstall(c,read),c)
  const base=closed(await api.qualifyComparisonAudit(c,read),c)
  if(base.state!=='installed_disabled_audit_qualified'||base.needs_reconciliation!==false
   ||!base.base_audit_qualified||!base.connection_cleanup_verified)return base
  // Both independent autonomous-audit behavior and actual successor permission shape are required.
  return closed(await api.auditNativeActivationMetadata({
   expectedLogin:c.expectedLogin,operationId:c.operationId,expectedMetadataAuditor:c.expectedMetadataAuditor,
   expectedInstallManifest:c.expectedManifestSha256,expectedNativeProgram:c.expectedNativeProgramSha256,
   expectedSuccessorProgram:c.expectedSuccessorProgram,metadataAuditConnectionString:c.metadataAuditConnectionString,
   sessionPoolerHost:c.sessionPoolerHost,disposable:c.disposable===true
  },read),c,true)
 }catch{return closed(null,c)}
}
export function activationHostActionSatisfied(action,r){
 if(r?.needs_reconciliation!==false||r.connection_cleanup_verified!==true)return false
 if(action==='audit')return r.state==='installed_disabled_permission_audit_qualified'
  &&r.base_audit_qualified===true&&r.permission_boundary_current===true
 return action==='install'?r.state==='installed_disabled_audit_pending':
  action==='reconcile'&&['not_installed','installed_disabled_audit_pending'].includes(r.state)
}
