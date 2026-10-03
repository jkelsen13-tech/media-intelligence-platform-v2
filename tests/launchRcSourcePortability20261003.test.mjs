import test from 'node:test'
import assert from 'node:assert/strict'
import { cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname,join } from 'node:path'
import { fileURLToPath,pathToFileURL } from 'node:url'
import { historicalSourcePath,readRepositorySource,LAUNCH_RC_HISTORICAL_SOURCE_PATHS as mappings } from '../scripts/launchRcSourcePath20261003.mjs'

const root=new URL('../',import.meta.url)
const mappingRequest=entry=>({manifestPath:mappings.manifest_path,manifestSha256:mappings.manifest_sha256,sourcePath:entry.source_path})
const forbidden=['/outside/file','../escape','a/../escape','./file','a//file','file:///outside/file','https://example.test/file','a/%2e%2e/file','a\\file','a?query','a#fragment']
test('only the three exact pinned historical Markets paths map to repository paths',()=>{
  assert.equal(mappings.manifest_path,'docs/qualification/markets-provider-contract-20261003.json')
  assert.equal(mappings.manifest_sha256,'3868bbda45bdf46b2990db9f293f7363540dbb794dfd5c091bf8ec2d6fedf8d2')
  assert.deepEqual(mappings.entries.map(entry=>entry.path),[
    'supabase/functions/_shared/marketsProviderPolicy.mjs','tests/marketsProviderPolicy20261003.test.mjs','docs/qualification/markets-provider-contract-20261003.md',
  ])
  for (const entry of mappings.entries) {
    assert.equal(historicalSourcePath(mappingRequest(entry)),entry.path)
    for (const changed of [{manifestPath:'unrelated.json'},{manifestSha256:'0'.repeat(64)},{sourcePath:entry.source_path+'.other'}])
      assert.throws(()=>historicalSourcePath({...mappingRequest(entry),...changed}),/repository relative/)
  }
  for (const sourcePath of forbidden) assert.throws(()=>historicalSourcePath({...mappingRequest(mappings.entries[0]),sourcePath}),/repository relative/)
  assert.equal(historicalSourcePath({...mappingRequest(mappings.entries[0]),sourcePath:'tests/investigationApi.test.mjs'}),'tests/investigationApi.test.mjs')
})
test('repository reader refuses a symlink outside its actual root',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'mip-source-boundary-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const inside=join(directory,'repo');await mkdir(inside);await writeFile(join(directory,'outside.mjs'),'outside bytes')
  await symlink(join(directory,'outside.mjs'),join(inside,'escape.mjs'))
  await assert.rejects(readRepositorySource(pathToFileURL(inside+'/'),'escape.mjs'),/outside repository/)
})
test('actual relocated binding reader uses its current bytes without the original checkout, and the Python resolver has the same boundary',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'mip-launch-source-portability-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  // Current tracked files need no historical Git objects or network. This also
  // works with GitHub Actions fetch-depth 1. Explicit additions support precommit
  // qualification without copying ignored credentials, caches or dependencies.
  const listing=spawnSync('git',['ls-files','-z'],{cwd:fileURLToPath(root),encoding:'utf8',maxBuffer:4*1024*1024})
  assert.equal(listing.status,0,listing.stderr)
  const integrated=JSON.parse(await readFile(new URL('docs/MIP_LAUNCH_RC_SOURCE_2026-10-03.json',root),'utf8'))
  const additions=[...integrated.sources.map(entry=>entry.path),'scripts/launchRcHistoricalSourcePaths20261003.json','scripts/launchRcSourcePath20261003.mjs','tests/launchRcSourcePortability20261003.test.mjs']
  const paths=[...new Set([...listing.stdout.split('\0').filter(Boolean),...additions])]
  for (const path of paths) {
    const destination=join(directory,path);await mkdir(dirname(destination),{recursive:true});await cp(new URL(path,root),destination)
  }
  const hook=join(directory,'deny-original-workspace.mjs')
  await writeFile(hook,`import fs from 'node:fs/promises'; import {syncBuiltinESMExports} from 'node:module'; import {fileURLToPath} from 'node:url';
const original=fs.readFile;
fs.readFile=async function(path,...args){const resolved=path instanceof URL?fileURLToPath(path):String(path);if(resolved.startsWith('/workspace/')){const error=new Error('ENOENT: original checkout unavailable');error.code='ENOENT';error.path=resolved;throw error;}return original.call(this,path,...args)};
syncBuiltinESMExports();\n`)
  const environment={...process.env};delete environment.NODE_TEST_CONTEXT
  const run=()=>spawnSync(process.execPath,['--import',hook,'--test','--test-reporter=tap','--test-name-pattern','^launch source bindings',join(directory,'tests/investigationApi.test.mjs')],{cwd:directory,env:environment,encoding:'utf8',maxBuffer:2*1024*1024,timeout:30000})
  const good=run();assert.equal(good.status,0,good.stdout+good.stderr);assert.match(good.stdout,/# pass 1\b/)
  const policy=join(directory,mappings.entries[0].path),bytes=await readFile(policy)
  await writeFile(policy,Buffer.concat([bytes,Buffer.from('\n// isolated current-byte drift\n')]))
  const drift=run();assert.equal(drift.status,1,drift.stdout+drift.stderr);assert.match(drift.stdout,/AssertionError|ERR_ASSERTION/)
  await rm(policy)
  const missing=run();assert.equal(missing.status,1,missing.stdout+missing.stderr);assert.match(missing.stdout,/ENOENT/)
  const python=spawnSync('python3',['-B','-c',`
import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('source_binding',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
mapping=module.PATH_MAPPINGS
for entry in mapping['entries']:
    assert module.historical_source_path(mapping['manifest_path'],mapping['manifest_sha256'],entry['source_path'])==entry['path']
    for manifest,sha in [('unrelated.json',mapping['manifest_sha256']),(mapping['manifest_path'],'0'*64)]:
        try: module.historical_source_path(manifest,sha,entry['source_path'])
        except RuntimeError: pass
        else: raise AssertionError('accepted unrelated absolute path')
for path in json.loads(sys.argv[2]):
    try: module.repository_path(path)
    except RuntimeError: pass
    else: raise AssertionError('accepted outside path: '+path)
outside=module.ROOT.parent/(module.ROOT.name+'-outside-source-fixture.mjs'); outside.write_text('outside bytes')
(module.ROOT/'escape-source-fixture.mjs').symlink_to(outside)
try: module.repository_path('escape-source-fixture.mjs')
except RuntimeError: pass
else: raise AssertionError('accepted outside symlink')
outside.unlink()
print('Python exact mapping and outside-root refusal passed')
`,join(directory,'scripts/buildLaunchRcSourceBinding20261003.py'),JSON.stringify(forbidden)],{cwd:directory,encoding:'utf8',maxBuffer:1024*1024,timeout:30000})
  assert.equal(python.status,0,python.stdout+python.stderr)
})
