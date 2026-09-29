// Existing protected GitHub execution only; source and metadata, never article material.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {BASE,CA_SHA256,verifySourceBlob} from '../native-governed-host/adapter.mjs'
import {validateActivationHostConfig,dispatchActivationHostAction,activationHostActionSatisfied} from './host.mjs'
const exec=promisify(execFile)
const CODE_PINS=Object.freeze({
  "supabase/qualification/native-governed-activation/001_profile.sql": "59e7dbfa5bb9925b4525aa1e3b3d5003d55610f9",
  "supabase/qualification/native-governed-activation/prepare.mjs": "7c7be46fe1dd30763469bf5d654d2aa32f28a19c",
  "supabase/qualification/native-governed-activation/activation.mjs": "83a2695e06699999bda39c4b98f9f36e1a6c3e08",
  "supabase/qualification/native-governed-activation/audit.mjs": "5c71d14e162ae3a5ad1a54cf6eae4e87457b17fb",
  "supabase/qualification/native-governed-install/install.mjs": "be48ebead2edb1f62ef4137d077d9da50383292e",
  "supabase/qualification/qik-comparison-adapter/atomicInstall.mjs": "ef2e729f92efcac7ba7de240bc4062fc3e0e1d6c",
  "supabase/qualification/qik-comparison-adapter/compileSource.mjs": "cd87eb0a0bc758315246e74675339f3ea2972a19",
  "supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs": "a591c92b10d174bd2937e9634f8d491b4c34567b",
  "supabase/qualification/qik-ingest/persistentInstall.mjs": "24625b8382399db71e9dba6e3ddb88a936ade33f",
  "supabase/qualification/qik-ingest/installQikIngest.mjs": "fa5d24041b38592ec950e2e46ca28be11f30d997",
  "supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs": "af0f3b69c34695f9241934fae89ac00cedd08515",
  "supabase/qualification/collector-native-capture/credentialDelivery.mjs": "354679fadc48eb9f8a8154456f3d38e7faab3e61",
  "package.json": "68caf5625166966005fff9cd702b3bc6c5fa49ad",
  "package-lock.json": "2b1796f9fa6bf6490f8d935863c8b6dd0a41a7f0",
  "supabase/qualification/native-governed-host/adapter.mjs": "47622a1729351d0cabda279d63855b9309e490b0",
  "supabase/qualification/native-governed-activation/host.mjs": "f0ac06ba0ae8c5541eae7960a89f70ed25a7737e",
  "supabase/qualification/native-provisioning-compat/managedPolicy.mjs": "31493d9a42db676b39fc60e7a70e5a15192d9ec3",
  "supabase/qualification/native-provisioning-compat/provision.mjs": "19c26d3ad41dfe7d5a28e8c53ed70b4d8713d8bb",
  "supabase/qualification/native-provisioning-compat/retirement.mjs": "c12018a7d78a3df8714104475eac29ccd06cc2b0",
  "supabase/qualification/native-provisioning-compat/sessionLock.mjs": "5f9dd6f9ee979481be580cf197fe985ea66103aa"
})
let emitted=false,phase='host_admission'
function stop(){
 if(!emitted){emitted=true;process.stdout.write(JSON.stringify({contract:'native-activation-host-receipt-v1',
  state:'outcome_unknown',needs_reconciliation:true,activation_allowed:false,publication_allowed:false,
  material_access_allowed:false,production_qualified:false,connection_cleanup_verified:false,
  diagnostic:'native_activation_host_refused',phase})+'\n')}
 process.exitCode=1
}
process.on('uncaughtException',()=>{stop();process.exit(1)})
process.on('unhandledRejection',()=>{stop();process.exit(1)})
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>{stop();process.exit(1)})
const fail=()=>{throw Error('native_activation_host_refused')}
async function git(args){
 const {stdout}=await exec('git',args,{encoding:'buffer',timeout:10000,maxBuffer:2097152,
  env:{PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}})
 return stdout
}
try{
 const e=process.env
 if(process.version!=='v22.14.0'||process.argv.length!==2||e.GITHUB_EVENT_NAME!=='workflow_dispatch'
  ||e.GITHUB_REPOSITORY!=='jkelsen13-tech/media-intelligence-platform-v2'||e.GITHUB_RUN_ATTEMPT!=='1'
  ||e.MIP_NATIVE_HOST_ADMISSION!=='qualified-source-metadata-only-activation-v1'
  ||e.MIP_NATIVE_HOST_BUDGET_ADMISSION!=='within-existing-25-once-10-monthly'
  ||!['install','reconcile','audit'].includes(e.MIP_NATIVE_HOST_ACTION)
  ||e.NODE_OPTIONS||e.NODE_DEBUG||e.NODE_DEBUG_NATIVE||e.DEBUG||e.SSLKEYLOGFILE||e.NODE_TLS_REJECT_UNAUTHORIZED
  ||e.PGOPTIONS||e.PGPASSWORD||e.PGHOST||e.ACTIONS_STEP_DEBUG==='true'||e.ACTIONS_RUNNER_DEBUG==='true')fail()
 phase='release_identity'
 const release=e.QIK_APPROVED_RELEASE_SHA
 if(!/^[0-9a-f]{40}$/.test(release??'')||e.GITHUB_SHA!==release||e.MIP_NATIVE_HOST_RELEASE_SHA!==release)fail()
 if((await git(['rev-parse','HEAD'])).toString().trim()!==release)fail()
 await git(['merge-base','--is-ancestor',BASE,release])
 if((await git(['status','--porcelain','--untracked-files=normal'])).length)fail()
 phase='source_integrity'
 for(const [path,pin] of Object.entries(CODE_PINS))verifySourceBlob(await readFile(new URL('../../../'+path,import.meta.url)),pin)
 phase='manifest_integrity'
 const manifestBytes=await readFile(new URL('../../../verifier/qik-native-activation-successor.json',import.meta.url))
 if(!/^[0-9a-f]{64}$/.test(e.QIK_NATIVE_ACTIVATION_MANIFEST_SHA256??'')
  ||createHash('sha256').update(manifestBytes).digest('hex')!==e.QIK_NATIVE_ACTIVATION_MANIFEST_SHA256)fail()
 const manifest=JSON.parse(manifestBytes)
 if(manifest.profile!=='native-governed-activation-v1'||manifest.production_qualified!==false)fail()
 for(const entry of manifest.sources){
  if(typeof entry.path!=='string'||entry.path.startsWith('/')||entry.path.includes('..')||entry.path.includes('\\'))fail()
  verifySourceBlob(await readFile(new URL('../../../'+entry.path,import.meta.url)),entry.git_blob)
 }
 phase='ca_identity'
 if(!e.NODE_EXTRA_CA_CERTS||createHash('sha256').update(await readFile(e.NODE_EXTRA_CA_CERTS)).digest('hex')!==CA_SHA256)fail()
 phase='configuration'
 const config=validateActivationHostConfig(e.MIP_NATIVE_HOST_CONFIG_JSON,{
  installer:e.QIK_NATIVE_INSTALLER_DATABASE_URL,audit:e.QIK_NATIVE_AUDIT_DATABASE_URL,
  metadataAudit:e.QIK_NATIVE_METADATA_AUDIT_DATABASE_URL})
 delete e.QIK_NATIVE_INSTALLER_DATABASE_URL;delete e.QIK_NATIVE_AUDIT_DATABASE_URL;delete e.QIK_NATIVE_METADATA_AUDIT_DATABASE_URL
 if(config.releaseSha!==release)fail()
 const api=await import('../qik-comparison-adapter/atomicInstall.mjs')
 const audit=await import('./audit.mjs')
 const compiler=await import('../qik-comparison-adapter/compileSource.mjs')
 const native=await import('../native-governed-install/install.mjs')
 const preparation=await import('./prepare.mjs')
 const selected=new Map(compiler.SOURCE_PINS.map(([path,blob])=>[compiler.SOURCE_COMMIT+':'+path,blob]))
 selected.set(api.DOJ_SOURCE_COMMIT+':'+api.DOJ_PATH,api.DOJ_BLOB)
 for(const entry of native.NATIVE_CALLER_ORDER)selected.set(':'+entry.path,entry.blob)
 selected.set(':'+preparation.SQL_PATH,preparation.SQL_BLOB)
 const cache=new Map();let total=0
 async function readPinnedSource(path,ref){
  const pin=selected.get((ref??'')+':'+path);if(!pin)fail()
  if(!cache.has(pin)){
   const bytes=verifySourceBlob(await git(['cat-file','blob',pin]),pin)
   total+=bytes.length;if(total>8388608)fail();cache.set(pin,bytes)
  }
  return cache.get(pin)
 }
 const plan=await api.prepareAtomicInstall(readPinnedSource,{
  nativeMode:config.nativeMode,activationProfile:config.activationProfile,expectedLogin:config.expectedLogin,
  operationId:config.operationId,expectedMetadataAuditor:config.expectedMetadataAuditor,...(config.provisioningProfile?{provisioningProfile:config.provisioningProfile,provisioningOperationId:config.provisioningOperationId}:{})})
 if(plan.manifest_sha256!==config.expectedManifestSha256||plan.native.program_sha256!==config.expectedNativeProgramSha256
  ||plan.activation.program_sha256!==config.expectedSuccessorProgram)fail()
 const result=await dispatchActivationHostAction(e.MIP_NATIVE_HOST_ACTION,config,readPinnedSource,{
  installComparisonAtomic:api.installComparisonAtomic,reconcileComparisonInstall:api.reconcileComparisonInstall,
  qualifyComparisonAudit:api.qualifyComparisonAudit,auditNativeActivationMetadata:audit.auditNativeActivationMetadata})
 if(!emitted){emitted=true;process.stdout.write(JSON.stringify(result)+'\n')}
 if(!activationHostActionSatisfied(e.MIP_NATIVE_HOST_ACTION,result))process.exitCode=1
}catch{stop()}
