// Held protected-runner entrypoint. Prerequisites only; never installs or activates.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const exec=promisify(execFile)
const pins={
 'supabase/qualification/native-provisioning-compat/sessionLock.mjs':'5f9dd6f9ee979481be580cf197fe985ea66103aa',
 'supabase/qualification/native-provisioning-compat/managedPolicy.mjs':'31493d9a42db676b39fc60e7a70e5a15192d9ec3',
 'supabase/qualification/native-provisioning-compat/hostConfig.mjs':'5ade01ebdcae8c77caa6311f11fe4bb6dbfa9eca',
 'supabase/qualification/native-provisioning-compat/provision.mjs':'19c26d3ad41dfe7d5a28e8c53ed70b4d8713d8bb',
 'supabase/qualification/collector-native-capture/credentialDelivery.mjs':'354679fadc48eb9f8a8154456f3d38e7faab3e61',
 'package.json':'68caf5625166966005fff9cd702b3bc6c5fa49ad',
 'package-lock.json':'2b1796f9fa6bf6490f8d935863c8b6dd0a41a7f0'
}
const digest=b=>createHash('sha256').update(b).digest('hex')
const fail=()=>{throw Error('managed_provisioning_host_refused')}
const injected={installer:process.env.QIK_NATIVE_INSTALLER_DATABASE_URL,audit:process.env.QIK_NATIVE_AUDIT_DATABASE_URL,metadataAudit:process.env.QIK_NATIVE_METADATA_AUDIT_DATABASE_URL}
delete process.env.QIK_NATIVE_INSTALLER_DATABASE_URL;delete process.env.QIK_NATIVE_AUDIT_DATABASE_URL;delete process.env.QIK_NATIVE_METADATA_AUDIT_DATABASE_URL
let emitted=false,phase='host_admission'
const denied=()=>({contract:'qik-managed-provisioning-host-v1',state:'outcome_unknown',phase,needs_reconciliation:true,connection_cleanup_verified:false,installation_allowed:false,activation_allowed:false,material_access_allowed:false,publication_allowed:false})
function emit(r){if(!emitted){emitted=true;process.stdout.write(JSON.stringify(r)+'\n')}}
function stop(){emit(denied());process.exitCode=1}
process.on('uncaughtException',()=>{stop();process.exit(1)})
process.on('unhandledRejection',()=>{stop();process.exit(1)})
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop();process.exit(1)})
async function git(args){
 return (await exec('git',args,{encoding:'buffer',timeout:10000,maxBuffer:2097152,
 env:{PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}})).stdout
}
try{
 const e=process.env
 if(process.version!=='v22.14.0'||process.argv.length!==2||e.GITHUB_EVENT_NAME!=='workflow_dispatch'
 ||e.GITHUB_REPOSITORY!=='jkelsen13-tech/media-intelligence-platform-v2'||e.GITHUB_RUN_ATTEMPT!=='1'
 ||e.QIK_MANAGED_PROVISIONING_HOST_ADMISSION!=='qualified-source-metadata-managed-prerequisites-v1'
 ||e.QIK_NATIVE_INSTALL_BUDGET_ADMISSION!=='within-existing-25-once-10-monthly'
 ||!['provision','reconcile'].includes(e.MIP_MANAGED_PROVISIONING_ACTION)
 ||e.NODE_OPTIONS||e.NODE_DEBUG||e.NODE_DEBUG_NATIVE||e.DEBUG||e.SSLKEYLOGFILE||e.NODE_TLS_REJECT_UNAUTHORIZED
 ||e.PGOPTIONS||e.PGPASSWORD||e.PGHOST||e.ACTIONS_STEP_DEBUG==='true'||e.ACTIONS_RUNNER_DEBUG==='true'
 ||e.MIP_MANAGED_PROVISIONING_ARM||e.MIP_DISPOSABLE_POSTGRES)fail()
 phase='release_identity'
 const release=e.QIK_APPROVED_RELEASE_SHA
 if(!/^[a-f0-9]{40}$/.test(release??'')||e.MIP_MANAGED_RELEASE_SHA!==release||e.GITHUB_SHA!==release)fail()
 if((await git(['rev-parse','HEAD'])).toString().trim()!==release||(await git(['status','--porcelain','--untracked-files=normal'])).length)fail()
 await git(['merge-base','--is-ancestor','76e96de8a9589cf87287455aea9e7c828ecfd3ff',release])
 for(const [path,pin] of Object.entries(pins)){
  const bytes=await readFile(new URL('../../../'+path,import.meta.url))
  if(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')!==pin)fail()
 }
 phase='configuration_identity'
 const raw=e.QIK_MANAGED_PROVISIONING_CONFIG_JSON
 if(typeof raw!=='string'||Buffer.byteLength(raw)>4096||! /^[a-f0-9]{64}$/.test(e.QIK_MANAGED_PROVISIONING_CONFIG_SHA256??'')||digest(raw)!==e.QIK_MANAGED_PROVISIONING_CONFIG_SHA256)fail()
 const {validateProvisioningHostConfig}=await import('./hostConfig.mjs')
 const c=validateProvisioningHostConfig(raw,e.QIK_MANAGED_PROVISIONING_CONFIG_SHA256)
 const ca=Buffer.from(e.QIK_CA_PEM_BASE64??'','base64').toString('utf8')
 if(digest(ca)!=='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')fail()
 const secrets={...injected,caPem:ca}
 delete e.QIK_NATIVE_INSTALLER_DATABASE_URL;delete e.QIK_NATIVE_AUDIT_DATABASE_URL;delete e.QIK_NATIVE_METADATA_AUDIT_DATABASE_URL
 phase='bounded_prerequisite_operation'
 const api=await import('./provision.mjs')
 const r=await (e.MIP_MANAGED_PROVISIONING_ACTION==='provision'?api.provisionManagedPrerequisites:api.reconcileManagedPrerequisites)(c,secrets)
 // Explicit allow-list: neither SQL/errors nor input configuration/credentials can escape.
 const states=['not_provisioned','provisioned_authentication_verified','provisioned_authentication_unverified','commit_outcome_unknown','provisioning_refused']
 const phases=['configuration','installer_connection','installer_identity','provider_boundary','caller_auth_prerequisite','serialization','c3_boundary','installed_phase','collision','provider_extension','secure_auditor_creation','immutable_receipt','receipt_readback','commit','distinct_auditor_authentication']
 if(r?.contract!=='qik-managed-prerequisites-v1'||!states.includes(r.state)||!phases.includes(r.phase))fail()
 const safe={...denied(),state:r.state,phase:r.phase,release_sha:release,operation_id:/^[a-f0-9]{32}$/.test(c.operationId??'')?c.operationId:null,
 needs_reconciliation:r.needs_reconciliation===true,connection_cleanup_verified:r.connection_cleanup_verified===true}
 const diagnostics=['secure_bindings_missing','installer_binding_refused','audit_binding_refused','metadata_binding_refused','audit_password_policy_refused','metadata_password_policy_refused','distinct_passwords_required']
 if(r.diagnostic!==undefined){
  if(r.state!=='provisioning_refused'||r.phase!=='configuration'||!diagnostics.includes(r.diagnostic))fail()
  safe.diagnostic=r.diagnostic
 }
 if(r.receipt&&/^[a-f0-9]{64}$/.test(r.receipt.extension_metadata_sha256??'')){
  safe.extension_metadata_sha256=r.receipt.extension_metadata_sha256
  for(const k of ['audit_oid','metadata_auditor_oid','extension_oid'])if(/^[0-9]+$/.test(r.receipt[k]??''))safe[k]=r.receipt[k]
 }
 emit(safe)
 if(safe.needs_reconciliation||!safe.connection_cleanup_verified||
 !(safe.state==='provisioned_authentication_verified'||(e.MIP_MANAGED_PROVISIONING_ACTION==='reconcile'&&safe.state==='not_provisioned')))process.exitCode=1
}catch{stop()}
