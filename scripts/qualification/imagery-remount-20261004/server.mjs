// Auxiliary loopback server only. No saved env files or genuine client key.
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {readFile,writeFile,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {isSafeSupabaseBrowserKey,resolveV2SupabaseUrl,V2_SUPABASE_URL} from '../../../src/lib/supabaseOrigin.js'
import {assertSafeBrowserBuildEnv} from '../../../src/lib/browserBuildEnv.js'
import {BASE_HEAD,BASE_TREE,PRODUCTION_FILES,frozenIdentity} from './run.mjs'

export const FIXTURE_ONLY_BROWSER_KEY='sb_publishable_FIXTURE_ONLY_MIP_IMAGERY_REMOUNT_20261004_NOT_A_REAL_KEY'
export const FIXTURE_ENV_PREFIX='MIP_IMAGERY_REMOUNT_NEVER_EXPOSE_20261004_'
export const EVIDENCE_ROOT='/workspace/mip-oct04-launch-readiness/imagery-remount'
export const SERVER_CLIENT_FILES=['vite.config.js','src/lib/supabase.js','src/lib/supabaseOrigin.js','src/lib/browserBuildEnv.js']
const sha=body=>createHash('sha256').update(body).digest('hex')
const git=(args,cwd)=>{const result=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim()}

export function discardAmbientClientEnvironment(environment){
  let count=0
  for(const name of Object.keys(environment)){
    if(name.startsWith('VITE_')||name.startsWith(FIXTURE_ENV_PREFIX)||name==='DEBUG'){
      delete environment[name];count++
    }
  }
  return count // Never read, print, hash or retain removed values.
}

export function fixtureServerConfig({root,port,head,dependencyRoot,evidenceRoot=EVIDENCE_ROOT}){
  assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'explicit bounded loopback port required')
  assert.match(head,/^[a-f0-9]{40}$/)
  assert.equal(isSafeSupabaseBrowserKey(FIXTURE_ONLY_BROWSER_KEY),true)
  assert.equal(resolveV2SupabaseUrl(V2_SUPABASE_URL).ok,true)
  const envDir=resolve(evidenceRoot,'NEVER_LOAD_ENV_FIXTURE_ONLY_'+head+'_'+port)
  assert.equal(existsSync(envDir),false,'isolated environment directory must not exist')
  return {
    root:resolve(root),configFile:resolve(root,'vite.config.js'),mode:'development',
    envDir,envFile:false,envPrefix:FIXTURE_ENV_PREFIX,
    define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(V2_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(FIXTURE_ONLY_BROWSER_KEY)},
    cacheDir:resolve(evidenceRoot,'vite-cache-fixture-only-'+head+'-'+port),
    server:{host:'127.0.0.1',port,strictPort:true,open:false,origin:'http://127.0.0.1:'+port,
      allowedHosts:['127.0.0.1','localhost'],cors:false,
      hmr:{host:'127.0.0.1',protocol:'ws',port},fs:{strict:true,allow:[resolve(root),resolve(dependencyRoot)]}},
  }
}

export function assertResolvedFixtureConfig(config,declared){
  assert.equal(config.root,declared.root);assert.equal(config.mode,'development')
  assert.equal(config.server.host,'127.0.0.1');assert.equal(config.server.port,declared.server.port)
  assert.equal(config.server.strictPort,true);assert.equal(config.server.open,false)
  assert.equal(config.server.origin,declared.server.origin);assert.equal(config.server.cors,false)
  assert.equal(config.server.hmr.host,'127.0.0.1');assert.equal(config.server.hmr.protocol,'ws')
  assert.equal(config.server.hmr.port,declared.server.port)
  // Installed Vite appends its origin/HMR hosts during normalization.
  assert.deepEqual([...new Set(config.server.allowedHosts)].sort(),['127.0.0.1','localhost'])
  assert.equal(config.envDir,false,'installed Vite envFile:false disables all env-file loading')
  assert.equal(config.envPrefix,FIXTURE_ENV_PREFIX)
  assert.equal(config.env?.VITE_SUPABASE_URL,undefined);assert.equal(config.env?.VITE_SUPABASE_ANON_KEY,undefined)
  assert.equal(config.define['import.meta.env.VITE_SUPABASE_URL'],JSON.stringify(V2_SUPABASE_URL))
  assert.equal(config.define['import.meta.env.VITE_SUPABASE_ANON_KEY'],JSON.stringify(FIXTURE_ONLY_BROWSER_KEY))
  assertSafeBrowserBuildEnv(config)
}

async function start(){
  const portIndex=process.argv.indexOf('--port'),receiptIndex=process.argv.indexOf('--receipt')
  assert.ok(portIndex>=0&&receiptIndex>=0,'--port and new external --receipt are required')
  const port=Number(process.argv[portIndex+1]),receiptPath=resolve(process.argv[receiptIndex+1]??'')
  assert.ok(receiptPath.startsWith(EVIDENCE_ROOT+'/'),'receipt stays in external imagery-remount evidence')
  assert.equal(existsSync(receiptPath),false,'never overwrite a server receipt')
  const root=process.cwd(),current={head:git(['rev-parse','HEAD'],root),tree:git(['rev-parse','HEAD^{tree}'],root),dirty:git(['status','--porcelain'],root)!==''}
  frozenIdentity(current,{expectedHead:process.env.MIP_IMAGERY_REMOUNT_EXPECTED_HEAD,expectedTree:process.env.MIP_IMAGERY_REMOUNT_EXPECTED_TREE})
  assert.equal(git(['merge-base',BASE_HEAD,current.head],root),BASE_HEAD)
  const sourceFileHashes={}
  for(const name of [...PRODUCTION_FILES,...SERVER_CLIENT_FILES]){
    const body=await readFile(resolve(root,name)),baseline=spawnSync('git',['show',BASE_HEAD+':'+name],{cwd:root,maxBuffer:8*1024*1024})
    assert.equal(baseline.status,0);assert.deepEqual(body,baseline.stdout,'unchanged base App source: '+name);sourceFileHashes[name]=sha(body)
  }
  const ambientVariablesDiscarded=discardAmbientClientEnvironment(process.env)
  // Resolve only already installed project dependencies; never install or fall back.
  const require=createRequire(resolve(root,'package.json'))
  const dependencyRoot=await realpath(resolve(root,'node_modules'))
  const vite=await import(pathToFileURL(require.resolve('vite')).href)
  const declared=fixtureServerConfig({root,port,head:current.head,dependencyRoot})
  const server=await vite.createServer(declared)
  try{assertResolvedFixtureConfig(server.config,declared);await server.listen()}
  catch(error){await server.close();throw error}
  const receipt={schema:'mip.imagery-remount-loopback-server.v1',status:'LISTENING_FIXTURE_ONLY_LOOPBACK',recordedAtUtc:new Date().toISOString(),candidate:current.head,tree:current.tree,dirty:false,
    baseSource:{head:BASE_HEAD,tree:BASE_TREE},sourceFileHashes,
    serverEntrySha256:sha(await readFile(new URL(import.meta.url))),viteConfigSha256:sha(await readFile(resolve(root,'vite.config.js'))),
    clientSourceSha256:sha(await readFile(resolve(root,'src/lib/supabase.js'))),clientOriginGuardSha256:sha(await readFile(resolve(root,'src/lib/supabaseOrigin.js'))),
    runtime:{node:process.version,vite:vite.version},loopbackOrigin:declared.server.origin,basePath:server.config.base,
    declaredNonexistentEnvDir:declared.envDir,envDirExists:false,envFileLoading:false,resolvedEnvDir:server.config.envDir,envPrefix:FIXTURE_ENV_PREFIX,
    ambientClientValuesReadPrintedHashed:false,ambientVariablesDiscarded,
    browserDefines:{publicV2OriginForLocalInterceptionOnly:V2_SUPABASE_URL,syntheticKey:FIXTURE_ONLY_BROWSER_KEY,fixtureOnly:true,actualAccountOrCredential:false},
    permissionsGranted:false,targetProbes:false,browserStarted:false,cacheDir:declared.cacheDir,
    requirement:'The browser harness must intercept all nonlocal HTTP/WebSocket requests before goto; the public V2 origin only satisfies unchanged origin validation and grants no target permission.'}
  await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'})
  const close=async()=>{await server.close();process.exit(0)}
  process.once('SIGINT',close);process.once('SIGTERM',close)
  console.log(JSON.stringify({status:receipt.status,origin:declared.server.origin,basePath:server.config.base,receiptPath,fixtureOnly:true,envFilesLoaded:false}))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await start()
