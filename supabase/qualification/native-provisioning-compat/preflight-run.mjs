// Manual protected auth/metadata preflight only; never imports installer/activation APIs.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
const exec=promisify(execFile)
const ROOT=new URL('../../../',import.meta.url)
const SHA=/^[a-f0-9]{40}$/
const PINS=Object.freeze({
 'supabase/qualification/native-provisioning-compat/preflight.mjs':'96172ea7e2567c84ff6ca00263fb474089312c36',
 'supabase/qualification/native-provisioning-compat/sessionLock.mjs':'14897d98eec36f86cab03111585ae0aaa436c8e7',
 'supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs':'af0f3b69c34695f9241934fae89ac00cedd08515',
 'supabase/qualification/collector-native-capture/credentialDelivery.mjs':'354679fadc48eb9f8a8154456f3d38e7faab3e61',
 'supabase/qualification/native-governed-host/adapter.mjs':'47622a1729351d0cabda279d63855b9309e490b0',
 'package.json':'68caf5625166966005fff9cd702b3bc6c5fa49ad',
 'package-lock.json':'2b1796f9fa6bf6490f8d935863c8b6dd0a41a7f0'
})
const fail=()=>{throw Error('installer_preflight_host_refused')}
export function validatePreflightHostEnvironment(e,version,argc){
 if(version!=='v22.14.0'||argc!==2||e.GITHUB_EVENT_NAME!=='workflow_dispatch'
 ||e.GITHUB_REPOSITORY!=='jkelsen13-tech/media-intelligence-platform-v2'||e.GITHUB_RUN_ATTEMPT!=='1'
 ||e.MIP_PREFLIGHT_HOST_ADMISSION!=='qualified-installer-auth-metadata-preflight-v1'
 ||e.MIP_PREFLIGHT_BUDGET_ADMISSION!=='within-existing-25-once-10-monthly'
 ||e.MIP_PREFLIGHT_EXECUTE!=='run-auth-metadata-preflight'
 ||!SHA.test(e.QIK_NATIVE_PREFLIGHT_APPROVED_SHA??'')
 ||e.GITHUB_SHA!==e.QIK_NATIVE_PREFLIGHT_APPROVED_SHA
 ||e.MIP_PREFLIGHT_RELEASE_SHA!==e.QIK_NATIVE_PREFLIGHT_APPROVED_SHA
 ||!e.NODE_EXTRA_CA_CERTS||e.NODE_OPTIONS||e.NODE_DEBUG||e.NODE_DEBUG_NATIVE||e.DEBUG
 ||e.SSLKEYLOGFILE||e.NODE_TLS_REJECT_UNAUTHORIZED||e.PGOPTIONS||e.PGPASSWORD||e.PGHOST
 ||e.ACTIONS_STEP_DEBUG==='true'||e.ACTIONS_RUNNER_DEBUG==='true'
 ||e.QIK_NATIVE_AUDIT_DATABASE_URL||e.QIK_NATIVE_METADATA_AUDIT_DATABASE_URL)fail()
 if(typeof e.MIP_PREFLIGHT_CONFIG_JSON!=='string'||Buffer.byteLength(e.MIP_PREFLIGHT_CONFIG_JSON)>1024)fail()
 let c;try{c=JSON.parse(e.MIP_PREFLIGHT_CONFIG_JSON)}catch{fail()}
 if(!c||Array.isArray(c)||!['c3ManifestSha256,c3OperationId,expectedLogin','c3ManifestSha256,c3OperationId,expectedLogin,provisioningProfile'].includes(Object.keys(c).sort().join())
 ||('provisioningProfile' in c&&(!['supabase-managed-v1','supabase-managed-solo-session-lock-v1'].includes(c.provisioningProfile)||c.expectedLogin!=='postgres'))
 ||!/^[a-z][a-z0-9_]{0,62}$/.test(c.expectedLogin??'')
 ||!/^[a-f0-9]{32}$/.test(c.c3OperationId??'')||!/^[a-f0-9]{64}$/.test(c.c3ManifestSha256??''))fail()
 return Object.freeze({release:e.QIK_NATIVE_PREFLIGHT_APPROVED_SHA,config:c})
}
export async function main(){
 let emitted=false,release=null
 const refuse=diagnostic=>{
  if(emitted)return
  emitted=true
  process.stdout.write(JSON.stringify({contract:'installer-auth-metadata-host-receipt-v1',release_sha:release,
   state:'preflight_refused',diagnostic,connection_cleanup_verified:false,
   installation_ready:false,installation_performed:false,activation_allowed:false,
   publication_allowed:false,material_access_allowed:false,production_qualified:false})+'\n')
  process.exitCode=1
 }
 const fatal=()=>{refuse('host_refused');process.exit(1)}
 process.once('uncaughtException',fatal);process.once('unhandledRejection',fatal)
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{refuse('interrupted');process.exit(1)})
 try{
  const e=process.env
  // Remove secret from subprocess inheritance even when later admission/source checks refuse.
  const installer=e.QIK_NATIVE_INSTALLER_DATABASE_URL;delete e.QIK_NATIVE_INSTALLER_DATABASE_URL
  const validated=validatePreflightHostEnvironment(e,process.version,process.argv.length)
  release=validated.release
  async function git(args){
   const {stdout}=await exec('git',args,{cwd:fileURLToPath(ROOT),encoding:'buffer',timeout:10000,maxBuffer:2097152,
    env:{PATH:e.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}})
   return stdout
  }
  if((await git(['rev-parse','HEAD'])).toString().trim()!==release)fail()
  await git(['merge-base','--is-ancestor','0e7c0679fbd39e4288be7b45785e7e7badf71404',release])
  if((await git(['status','--porcelain','--untracked-files=normal'])).length)fail()
  for(const [path,pin] of Object.entries(PINS)){
   const bytes=await readFile(new URL(path,ROOT))
   if(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==pin)fail()
  }
  const {runInstallerAuthPreflight}=await import('./preflight.mjs')
  const result=await runInstallerAuthPreflight(validated.config,{installer})
  emitted=true
  process.stdout.write(JSON.stringify({...result,contract:'installer-auth-metadata-host-receipt-v1',release_sha:release})+'\n')
  if(result.state!=='installer_authenticated_c3_current'||result.connection_cleanup_verified!==true)process.exitCode=1
 }catch{refuse('host_refused')}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main()
