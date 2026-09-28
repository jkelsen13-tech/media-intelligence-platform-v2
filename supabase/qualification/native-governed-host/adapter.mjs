// Trusted server module; the CLI binds the real pinned APIs. No SQL/material callback.
import {createHash} from 'node:crypto'
export const BASE='d706609405906c51ddf521acbd5eabb4617b6b41'
export const MODE='native-governed-v6'
export const AUTHORIZATION='owner-authorized-disabled-comparison-native-comparison-caller-install'
export const PROJECT='qikvmopbtijoebdqosyq'
export const POOLER='aws-0-us-west-1.pooler.supabase.com'
export const CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
const SHA=/^[0-9a-f]{64}$/, COMMIT=/^[0-9a-f]{40}$/, ID=/^[0-9a-f]{32}$/, LOGIN=/^[a-z][a-z0-9_]{0,62}$/
const fields=['releaseSha','operationId','expectedLogin','auditLogin','c3OperationId','c3ManifestSha256','expectedManifestSha256','expectedNativeProgramSha256','dblinkMetadataSha256','collectorSource']
const states=new Set(['not_installed','installed_disabled_audit_pending','installed_disabled_audit_qualified','commit_ambiguous','rollback_unverified','installation_refused','reconciliation_inflight','reconciliation_drift','reconciliation_unavailable','audit_qualification_inflight','installed_disabled_audit_unresolved'])
const refuse=()=>{throw Error('native_host_configuration_refused')}
export function validateHostConfig(raw,secrets){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)refuse()
 let c;try{c=JSON.parse(raw)}catch{refuse()}
 if(!c||Array.isArray(c)||Object.keys(c).sort().join()!==[...fields].sort().join())refuse()
 if(!COMMIT.test(c.releaseSha??'')||!ID.test(c.operationId??'')||!ID.test(c.c3OperationId??''))refuse()
 for(const k of ['c3ManifestSha256','expectedManifestSha256','expectedNativeProgramSha256','dblinkMetadataSha256'])if(!SHA.test(c[k]??''))refuse()
 if(!LOGIN.test(c.expectedLogin??'')||!LOGIN.test(c.auditLogin??'')||[c.expectedLogin,'postgres','service_role','authenticator','supabase_admin'].includes(c.auditLogin)
 ||!/^qik-[a-z0-9_-]{1,90}$/.test(c.collectorSource??''))refuse()
 if(!secrets||Object.keys(secrets).sort().join()!=='audit,installer')refuse()
 const target=(value,login,audit)=>{
  if(typeof value!=='string'||value.length<1||value.length>4096)refuse()
  let u;try{u=new URL(value)}catch{refuse()}
  const pool=u.hostname===POOLER
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||u.pathname!=='/postgres'||u.hash
   ||(!pool&&u.hostname!=='db.'+PROJECT+'.supabase.co')||!['','5432'].includes(u.port)
   ||decodeURIComponent(u.username)!==login+(pool?'.'+PROJECT:''))refuse()
  if(audit){
   if([...u.searchParams.keys()].sort().join()!=='connect_timeout,sslmode,sslrootcert'
    ||u.searchParams.get('sslmode')!=='verify-full'||u.searchParams.get('sslrootcert')!=='system'||u.searchParams.get('connect_timeout')!=='5')refuse()
  }else if(u.search)refuse()
  return pool
 }
 const pool=target(secrets.installer,c.expectedLogin,false);target(secrets.audit,c.auditLogin,true)
 return Object.freeze({...c,nativeMode:MODE,authorization:AUTHORIZATION,connectionString:secrets.installer,
  auditConnectionString:secrets.audit,sessionPoolerHost:pool?POOLER:null,disposable:false})
}
export function verifySourceBlob(bytes,expected){
 const b=Buffer.from(bytes),text=b.toString('utf8')
 if(!COMMIT.test(expected??'')||!Buffer.from(text).equals(b)
  ||createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')!==expected)
  throw Error('native_host_source_refused')
 return b
}
function receipt(state,c,needs,diagnostic=null){
 return {contract:'native-governed-host-receipt-v1',state,operation_id:c.operationId,
  release_sha:c.releaseSha,manifest_sha256:c.expectedManifestSha256,native_mode:MODE,
  native_program_sha256:c.expectedNativeProgramSha256,needs_reconciliation:needs,
  audit_qualified:state==='installed_disabled_audit_qualified',activation_allowed:false,
  publication_allowed:false,material_access_allowed:false,connection_cleanup_verified:false,diagnostic}
}
export function sanitizeApiResult(r,c){
 if(!r||!states.has(r.state)||r.operation_id!==c.operationId||r.manifest_sha256!==c.expectedManifestSha256
  ||r.native_mode!==MODE||r.native_program_sha256!==c.expectedNativeProgramSha256||r.activation_allowed!==false
  ||typeof r.needs_reconciliation!=='boolean')return receipt('outcome_unknown',c,true,'native_host_receipt_refused')
 const success=['not_installed','installed_disabled_audit_pending','installed_disabled_audit_qualified'].includes(r.state)
 if(success&&r.needs_reconciliation)return receipt('outcome_unknown',c,true,'native_host_receipt_refused')
 if(r.state==='installed_disabled_audit_qualified'&&r.audit_qualified!==true)return receipt('outcome_unknown',c,true,'native_host_receipt_refused')
 // Never forward arbitrary API fields, error messages, phase strings or nested diagnostics.
 return receipt(r.state,c,success?false:true)
}
// Internal orchestration seam for source tests, not a runtime option or SQL callback.
// The CLI supplies the exact imported API namespace; inputs cannot select functions.
export async function dispatchHostAction(action,c,reader,api){
 if(!['install','reconcile','audit'].includes(action))return receipt('configuration_refused',c,false,'native_host_action_refused')
 try{
  if(action==='install'){
   const before=sanitizeApiResult(await api.reconcileComparisonInstall(c,reader),c)
   if(before.state!=='not_installed')return before
   return sanitizeApiResult(await api.installComparisonAtomic(c,reader),c)
  }
  if(action==='reconcile')return sanitizeApiResult(await api.reconcileComparisonInstall(c,reader),c)
  return sanitizeApiResult(await api.qualifyComparisonAudit(c,reader),c)
 }catch{return receipt('outcome_unknown',c,true,'native_host_api_refused')}
}

export function actionSatisfied(action,r){
 if(r?.needs_reconciliation!==false)return false
 if(action==='audit')return r.state==='installed_disabled_audit_qualified'
 if(action==='install')return r.state==='installed_disabled_audit_pending'
 return action==='reconcile'&&['not_installed','installed_disabled_audit_pending'].includes(r.state)
}
