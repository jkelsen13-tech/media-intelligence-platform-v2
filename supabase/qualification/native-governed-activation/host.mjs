import {INSTALL_DIAGNOSTICS} from '../qik-comparison-adapter/atomicInstall.mjs'
import {SOURCE_PINS} from '../qik-comparison-adapter/compileSource.mjs'
import {managedOptions} from '../native-provisioning-compat/managedPolicy.mjs'
// Metadata-only host successor. No source bytes, activation, SQL or material callback.
import {validateHostConfig,sanitizeApiResult} from '../native-governed-host/adapter.mjs'
import {PROFILE,ROLES} from './prepare.mjs'
// Installer names do not prove privileges: connectPersistentInstaller checks the actual
// authenticated database owner and attributes; preparation and C3 checks remain mandatory.
const extra=['expectedMetadataAuditor','expectedSuccessorProgram']
const fields=['releaseSha','operationId','expectedLogin','auditLogin','c3OperationId','c3ManifestSha256','expectedManifestSha256','expectedNativeProgramSha256','dblinkMetadataSha256','collectorSource',...extra]
const fail=()=>{throw Error('native_activation_host_configuration_refused')}
export function validateActivationHostConfig(raw,secrets){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)fail()
 let input;try{input=JSON.parse(raw)}catch{fail()}
 const managed=managedOptions(input??{})
 const additional=managed?['provisioningProfile','provisioningOperationId']:[]
 if(!input||Array.isArray(input)||Object.keys(input).sort().join()!==[...fields,...additional].sort().join()
  ||!/^[0-9a-f]{64}$/.test(input.expectedSuccessorProgram??'')
  ||!/^[a-z][a-z0-9_]{0,62}$/.test(input.expectedMetadataAuditor??'')
  ||[input.expectedLogin,input.auditLogin,'postgres','service_role','authenticator','supabase_admin',...ROLES].includes(input.expectedMetadataAuditor)
  ||['service_role','authenticator','supabase_admin',...ROLES].includes(input.expectedLogin))fail()
 if(!secrets||Object.keys(secrets).sort().join()!=='audit,installer,metadataAudit')fail()
 const common=Object.fromEntries(Object.entries(input).filter(([k])=>![...extra,...additional].includes(k)))
 const validated=validateHostConfig(JSON.stringify(common),{installer:secrets.installer,audit:secrets.audit})
 // The independent metadata auditor uses the same exact qik/session-TLS target validation.
 validateHostConfig(JSON.stringify({...common,expectedLogin:input.expectedMetadataAuditor}),
  {installer:secrets.metadataAudit,audit:secrets.audit})
 return Object.freeze({...validated,...(managed?{provisioningProfile:input.provisioningProfile,provisioningOperationId:input.provisioningOperationId}:{}),activationProfile:PROFILE,
  authorization:'owner-authorized-native-governed-activation-bootstrap-install',
  expectedMetadataAuditor:input.expectedMetadataAuditor,expectedSuccessorProgram:input.expectedSuccessorProgram,
  metadataAuditConnectionString:secrets.metadataAudit})
}
// Independently bounded failure fields from the already-sanitized pinned atomic API.
// Unknown fields, raw exceptions and arbitrary source paths never reach the receipt.
const FAILURE_STATES=new Set(['installation_refused','reconciliation_unavailable','installed_disabled_audit_unresolved'])
const FAILURE_PHASES=new Set(["begin","catalog_preflight","c3_baseline","audit_prerequisite","temporary_creator","credential_timeout_bound","credential_logging_assertion","credential_configuration","credential_timeout_restore","doj_permission_unit","final_permission_functions","temporary_schema_create_revoke","compatibility_role_attributes","compatibility_acl_revoke","installation_receipt","c3_preservation","catalog_inspection_permissions","native_joint_install","temporary_creator_ownership","temporary_role_grants_revoke","temporary_creator_drop","temporary_membership_assertions","audit_secret_boundary","catalog_inspection_assertions","final_assertions","final_doj_assertions","final_compatibility_assertions","native_final_joint_closure","successor_final_boundary","commit","connection","reconciliation_begin","reconciliation_inventory","reconciliation_receipt","reconciliation_audit_boundary","native_reconciliation","audit_begin","audit_existing_receipt","audit_write_probe","audit_caller_rollback","audit_readback_lock","audit_readback_probe","audit_c3_preservation","audit_qualification_receipt","audit_qualification_commit"])
for(const [path] of SOURCE_PINS)FAILURE_PHASES.add('source:'+path)
const FAILURE_SQLSTATES=new Set(['42501','42710','P0001','23514','55000','57014','55P03','42704','21000','42809','42P01','42703','25006','25P02','40P01','40001'])
function failureDetails(r,safe){
 if(!FAILURE_STATES.has(safe.state))return {}
 return {failure_phase:FAILURE_PHASES.has(r?.phase)?r.phase:null,
  failure_sqlstate:FAILURE_SQLSTATES.has(r?.sqlstate)?r.sqlstate:null,
  failure_diagnostic:INSTALL_DIAGNOSTICS.includes(r?.diagnostic)?r.diagnostic:null}
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
  base_audit_qualified:safe.audit_qualified,connection_cleanup_verified:safe.connection_cleanup_verified,...failureDetails(r,safe)}
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
   sessionPoolerHost:c.sessionPoolerHost,disposable:c.disposable===true,...(c.provisioningProfile?{provisioningProfile:c.provisioningProfile,provisioningOperationId:c.provisioningOperationId}:{})
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
