// Existing GitHub environment only. No arguments, material query, automatic replay or activation.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {BASE,MODE,CA_SHA256,validateHostConfig,verifySourceBlob,dispatchHostAction,actionSatisfied} from './adapter.mjs'
const exec=promisify(execFile)
const CODE_PINS=Object.freeze({
  "supabase/qualification/qik-comparison-adapter/atomicInstall.mjs": "a97cd41a30216ad6561fc21088099c1bf75e2afd",
  "supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs": "a591c92b10d174bd2937e9634f8d491b4c34567b",
  "supabase/qualification/qik-comparison-adapter/compileSource.mjs": "cd87eb0a0bc758315246e74675339f3ea2972a19",
  "supabase/qualification/native-governed-install/install.mjs": "c56aa3e050fdb9342ef90dc71dca44f2810782ea",
  "supabase/qualification/qik-ingest/persistentInstall.mjs": "24625b8382399db71e9dba6e3ddb88a936ade33f",
  "supabase/qualification/qik-ingest/installQikIngest.mjs": "fa5d24041b38592ec950e2e46ca28be11f30d997",
  "supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs": "af0f3b69c34695f9241934fae89ac00cedd08515",
  "supabase/qualification/collector-native-capture/credentialDelivery.mjs": "354679fadc48eb9f8a8154456f3d38e7faab3e61",
  "package-lock.json": "2b1796f9fa6bf6490f8d935863c8b6dd0a41a7f0"
})
let emitted=false
function stop(code){
 if(!emitted){emitted=true;process.stdout.write(JSON.stringify({contract:'native-governed-host-receipt-v1',
  state:'outcome_unknown',needs_reconciliation:true,activation_allowed:false,publication_allowed:false,
  material_access_allowed:false,connection_cleanup_verified:false,diagnostic:code})+'\n')}
 process.exitCode=1
}
process.on('uncaughtException',()=>{stop('native_host_uncaught');process.exit(1)})
process.on('unhandledRejection',()=>{stop('native_host_unhandled');process.exit(1)})
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>{stop('native_host_interrupted');process.exit(1)})
const fail=()=>{throw Error('native_host_refused')}
async function git(args){
 // No credential-bearing environment reaches even the local source-only git subprocess.
 const {stdout}=await exec('git',args,{encoding:'buffer',timeout:10000,maxBuffer:2097152,
  env:{PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}})
 return stdout
}
try{
 const e=process.env
 if(process.version!=='v22.14.0'||process.argv.length!==2
  ||e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REPOSITORY!=='jkelsen13-tech/media-intelligence-platform-v2'
  ||e.GITHUB_RUN_ATTEMPT!=='1'||e.MIP_NATIVE_HOST_ADMISSION!=='qualified-source-metadata-only-v1'
  ||e.MIP_NATIVE_HOST_BUDGET_ADMISSION!=='within-existing-25-once-10-monthly'
  ||!['install','reconcile','audit'].includes(e.MIP_NATIVE_HOST_ACTION)
  ||e.NODE_OPTIONS||e.NODE_DEBUG||e.NODE_DEBUG_NATIVE||e.DEBUG||e.SSLKEYLOGFILE||e.NODE_TLS_REJECT_UNAUTHORIZED||e.PGOPTIONS||e.PGPASSWORD||e.PGHOST
  ||e.ACTIONS_STEP_DEBUG==='true'||e.ACTIONS_RUNNER_DEBUG==='true')fail()
 const release=e.QIK_APPROVED_RELEASE_SHA
 if(!/^[0-9a-f]{40}$/.test(release??'')||e.GITHUB_SHA!==release
  ||e.MIP_NATIVE_HOST_RELEASE_SHA!==release)fail()
 if((await git(['rev-parse','HEAD'])).toString().trim()!==release)fail()
 await git(['merge-base','--is-ancestor',BASE,release])
 if((await git(['status','--porcelain','--untracked-files=normal'])).length)fail()
 for(const [path,pin] of Object.entries(CODE_PINS)){
  const b=await readFile(new URL('../../../'+path,import.meta.url))
  verifySourceBlob(b,pin)
 }
 if(!e.NODE_EXTRA_CA_CERTS||createHash('sha256').update(await readFile(e.NODE_EXTRA_CA_CERTS)).digest('hex')!==CA_SHA256)fail()
 const api=await import('../qik-comparison-adapter/atomicInstall.mjs')
 const compiler=await import('../qik-comparison-adapter/compileSource.mjs')
 const native=await import('../native-governed-install/install.mjs')
 const selected=new Map(compiler.SOURCE_PINS.map(([path,blob])=>[compiler.SOURCE_COMMIT+':'+path,blob]))
 selected.set(api.DOJ_SOURCE_COMMIT+':'+api.DOJ_PATH,api.DOJ_BLOB)
 for(const entry of native.NATIVE_CALLER_ORDER)selected.set(':'+entry.path,entry.blob)
 const cache=new Map();let total=0
 async function readPinnedSource(path,ref){
  const key=(ref??'')+':'+path,pin=selected.get(key)
  if(!pin)fail()
  if(!cache.has(pin)){
   const b=verifySourceBlob(await git(['cat-file','blob',pin]),pin)
   total+=b.length;if(total>8388608)fail()
   cache.set(pin,b)
  }
  return cache.get(pin)
 }
 const config=validateHostConfig(e.MIP_NATIVE_HOST_CONFIG_JSON,{installer:e.QIK_NATIVE_INSTALLER_DATABASE_URL,audit:e.QIK_NATIVE_AUDIT_DATABASE_URL})
 delete e.QIK_NATIVE_INSTALLER_DATABASE_URL;delete e.QIK_NATIVE_AUDIT_DATABASE_URL
 if(config.releaseSha!==release)fail()
 // Compile/hash all selected source before any authenticated database connection.
 const plan=await api.prepareAtomicInstall(readPinnedSource,{nativeMode:MODE})
 if(plan.manifest_sha256!==config.expectedManifestSha256||plan.native.program_sha256!==config.expectedNativeProgramSha256)fail()
 const result=await dispatchHostAction(e.MIP_NATIVE_HOST_ACTION,config,readPinnedSource,api)
 if(!emitted){emitted=true;process.stdout.write(JSON.stringify(result)+'\n')}
 if(!actionSatisfied(e.MIP_NATIVE_HOST_ACTION,result))process.exitCode=1
}catch{stop('native_host_refused')}
