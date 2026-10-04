import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import {isSafeSupabaseBrowserKey,V2_SUPABASE_URL} from '../../../src/lib/supabaseOrigin.js'
import {FIXTURE_ONLY_BROWSER_KEY,fixtureServerConfig,discardAmbientClientEnvironment} from './server.mjs'

test('fixture-only key passes the unchanged browser guard without a genuine account',()=>{
  assert.equal(isSafeSupabaseBrowserKey(FIXTURE_ONLY_BROWSER_KEY),true)
  assert.match(FIXTURE_ONLY_BROWSER_KEY,/FIXTURE_ONLY/);assert.match(FIXTURE_ONLY_BROWSER_KEY,/NOT_A_REAL_KEY/)
})
test('safe server declares loopback strict port, nonexistent env directory and explicit direct defines',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mip-remount-config-'))
  try{
    const config=fixtureServerConfig({root,port:4291,head:'a'.repeat(40),dependencyRoot:root,evidenceRoot:root})
    assert.equal(config.server.host,'127.0.0.1');assert.equal(config.server.strictPort,true);assert.equal(config.envFile,false)
    assert.equal(config.define['import.meta.env.VITE_SUPABASE_URL'],JSON.stringify(V2_SUPABASE_URL))
    assert.equal(config.define['import.meta.env.VITE_SUPABASE_ANON_KEY'],JSON.stringify(FIXTURE_ONLY_BROWSER_KEY))
    assert.equal(Object.hasOwn(config.define,'import.meta.env'),false)
    await mkdir(config.envDir)
    assert.throws(()=>fixtureServerConfig({root,port:4291,head:'a'.repeat(40),dependencyRoot:root,evidenceRoot:root}))
    for(const port of [0,80,65536,4291.5])assert.throws(()=>fixtureServerConfig({root,port,head:'a'.repeat(40),dependencyRoot:root,evidenceRoot:root}))
  }finally{await rm(root,{recursive:true,force:true})}
})
test('ambient browser variables are discarded without reading their values',()=>{
  const environment={PATH:'/usr/bin:/bin',DEBUG:'fixture-debug'}
  Object.defineProperty(environment,'VITE_SUPABASE_ANON_KEY',{enumerable:true,configurable:true,get(){throw Error('value must never be read')}})
  assert.equal(discardAmbientClientEnvironment(environment),2)
  assert.deepEqual(environment,{PATH:'/usr/bin:/bin'})
})
test('installed Vite resolves with root .env and ambient client sentinels excluded; unchanged client gets fixture defines',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mip-remount-env-isolation-'))
  try{
    await writeFile(join(root,'.env'),'VITE_SUPABASE_ANON_KEY=FAKE_FILE_SENTINEL_MUST_NOT_LOAD\nVITE_SUPABASE_URL=https://fixture-file-sentinel.invalid\n')
    await writeFile(join(root,'.env.development.local'),'VITE_SUPABASE_ANON_KEY=FAKE_LOCAL_FILE_SENTINEL_MUST_NOT_LOAD\n')
    const helperUrl=pathToFileURL(resolve('scripts/qualification/imagery-remount-20261004/server.mjs')).href
    const viteUrl=pathToFileURL('/workspace/mip-oct03-release-dependency/node_modules/vite/dist/node/index.js').href
    const sourcePath=resolve('src/lib/supabase.js')
    const code=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolveConfig,transformWithEsbuild} from ${JSON.stringify(viteUrl)};import {fixtureServerConfig,discardAmbientClientEnvironment,assertResolvedFixtureConfig,FIXTURE_ONLY_BROWSER_KEY} from ${JSON.stringify(helperUrl)};
const removed=discardAmbientClientEnvironment(process.env);const declared=fixtureServerConfig({root:${JSON.stringify(root)},port:4292,head:'b'.repeat(40),dependencyRoot:${JSON.stringify(root)},evidenceRoot:${JSON.stringify(root)}});const resolved=await resolveConfig({...declared,configFile:false},'serve');assertResolvedFixtureConfig(resolved,declared);assert.equal(removed,3);const source=await readFile(${JSON.stringify(sourcePath)},'utf8');assert.ok(source.includes('if (!url || !anonKey) return null'),'unchanged client needs both env values');const transformed=await transformWithEsbuild(source,'supabase.js',{loader:'js',define:declared.define});assert.ok(transformed.code.includes(FIXTURE_ONLY_BROWSER_KEY));assert.ok(!transformed.code.includes('import.meta.env?.VITE_SUPABASE'));console.log(JSON.stringify({status:'PASS_ENV_FILES_AND_AMBIENT_CLIENT_VALUES_EXCLUDED',envFileLoading:false,resolvedEnvDir:resolved.envDir,explicitFixtureDefines:true,unchangedClientRequiresEnv:true,serverStarted:false}));`
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',VITE_SUPABASE_ANON_KEY:'FAKE_AMBIENT_SENTINEL_MUST_NOT_LOAD',VITE_SUPABASE_URL:'https://fixture-ambient-sentinel.invalid',DEBUG:'fixture-debug'}})
    assert.equal(result.status,0,result.stderr);assert.ok(!result.stdout.includes('SENTINEL'));assert.equal(JSON.parse(result.stdout.trim()).serverStarted,false)
  }finally{await rm(root,{recursive:true,force:true})}
})
