import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile,mkdtemp,mkdir,cp,rm,stat } from 'node:fs/promises'
import { dirname,join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { wholeLaunchFixture,populateLaunchHistory,retainedHistory } from './launchInstallationSequenceFixture.mjs'
import { launchCatalog,sha256,INITIAL_STAGES } from '../scripts/launchInstallationSequence.mjs'
import { selectiveExecutionInstalledCatalogQuery } from '../scripts/selectiveExecutionPackage.mjs'
import { compileSelectiveCompletionArtifact,verifySelectiveCompletionArtifact,selectiveCompletionArtifactSources,SELECTIVE_COMPLETION_RUNNER_SHA256 } from '../scripts/compileSelectiveIntakeCompletionStage20261003.mjs'

let baseline,native
test.before(async()=>{const f=await wholeLaunchFixture();try{baseline=await launchCatalog(f.db);native=(await f.db.query(await selectiveExecutionInstalledCatalogQuery())).rows[0].jsonb_build_object}finally{await f.db.close()}})
async function inputs(t,whole=baseline,selective=native){
  const dir=await mkdtemp(join(tmpdir(),'mip-completion-artifact-'));t.after(()=>rm(dir,{recursive:true,force:true}))
  const wholeCatalogPath=join(dir,'whole.json'),nativeCatalogPath=join(dir,'native.json')
  await writeFile(wholeCatalogPath,JSON.stringify(whole,null,2)+'\n');await writeFile(nativeCatalogPath,JSON.stringify(selective,null,2)+'\n')
  return {dir,wholeCatalogPath,nativeCatalogPath,outputPath:join(dir,'artifact.sql'),expectedRunnerSha256:SELECTIVE_COMPLETION_RUNNER_SHA256}
}
const missing=path=>assert.rejects(stat(path),{code:'ENOENT'})

test('independent post-eight-stage compiler binds two distinct accepted catalogs, paired runner and exact source/import closure',async t=>{
  const options=await inputs(t),receipt=await compileSelectiveCompletionArtifact(options),sql=await readFile(options.outputPath)
  assert.equal(INITIAL_STAGES.length,8);assert.equal(receipt.mode,'install');assert.equal(receipt.live_operations,0)
  assert.equal(receipt.whole_catalog_file_sha256,sha256(await readFile(options.wholeCatalogPath)))
  assert.equal(receipt.native_catalog_file_sha256,sha256(await readFile(options.nativeCatalogPath)))
  assert.notEqual(receipt.whole_catalog_parsed_sha256,receipt.native_catalog_parsed_sha256)
  assert.deepEqual(receipt.source_artifacts,await selectiveCompletionArtifactSources())
  for(const path of ['scripts/compileLaunchInstallationStage.mjs','scripts/selectiveIntakeCompletionPackage.mjs','scripts/selectiveIntakeExecution.mjs','scripts/selectiveIntakeDeclaration.mjs','scripts/evidencePipeline.mjs','scripts/operatorBackend.mjs','supabase/functions/_shared/operatorBackend.mjs','package-lock.json'])assert.ok(receipt.source_artifacts.some(s=>s.path===path),path)
  assert.equal(receipt.compiled_sha256,sha256(sql));assert.match(sql.toString(),/mip.selective_completion_expected_catalog/)
  const before=await stat(options.outputPath);await verifySelectiveCompletionArtifact(options);assert.equal((await stat(options.outputPath)).mtimeMs,before.mtimeMs)
  const rollback={...options,mode:'rollback-only',outputPath:join(options.dir,'rollback.sql')};await compileSelectiveCompletionArtifact(rollback)
  const body=await readFile(rollback.outputPath,'utf8');assert.equal((body.match(/^begin;\s*$/gm)||[]).length,1);assert.equal((body.match(/^commit;\s*$/gm)||[]).length,0);assert.equal((body.match(/^rollback;\s*$/gm)||[]).length,1)
})

test('wrong catalog schema, missing security fields, duplicate identities, inconsistent owner and unbound runner refuse before publication',async t=>{
  const options=await inputs(t)
  await assert.rejects(compileSelectiveCompletionArtifact({...options,wholeCatalogPath:options.nativeCatalogPath,nativeCatalogPath:options.wholeCatalogPath}),/complete named catalogue/)
  await assert.rejects(compileSelectiveCompletionArtifact({...options,expectedRunnerSha256:'0'.repeat(64)}),/paired runner binding/)
  for(const mutate of [c=>delete c.relations[0].force_rls,c=>delete c.relations[0].columns[0].acl,c=>c.functions.push(c.functions[0]),c=>delete c.roles[0].memberships,c=>c.functions.find(f=>f.signature==='public.mip_selective_execution_v1(text,jsonb)').acl[0].grantable='false']){
    const bad=structuredClone(native);mutate(bad);await writeFile(options.nativeCatalogPath,JSON.stringify(bad))
    await assert.rejects(compileSelectiveCompletionArtifact(options),/native Selective catalogue/);await missing(options.outputPath);await missing(options.outputPath+'.sha256.json')
  }
  const inconsistent=structuredClone(native);inconsistent.functions.find(f=>f.signature==='public.mip_selective_execution_v1(text,jsonb)').definition+='\n-- disagreement'
  await writeFile(options.nativeCatalogPath,JSON.stringify(inconsistent));await assert.rejects(compileSelectiveCompletionArtifact(options),/catalogues disagree/)
})

test('exclusive paired writer preserves either occupied name and admits only one concurrent follow-on artifact',async t=>{
  const options=await inputs(t)
  await writeFile(options.outputPath+'.sha256.json','accepted receipt');await assert.rejects(compileSelectiveCompletionArtifact(options),{code:'EEXIST'});await missing(options.outputPath)
  assert.equal(await readFile(options.outputPath+'.sha256.json','utf8'),'accepted receipt')
  const other={...options,outputPath:join(options.dir,'occupied.sql')};await writeFile(other.outputPath,'accepted SQL');await assert.rejects(compileSelectiveCompletionArtifact(other),{code:'EEXIST'});await missing(other.outputPath+'.sha256.json')
  assert.equal(await readFile(other.outputPath,'utf8'),'accepted SQL')
  const pair={...options,outputPath:join(options.dir,'concurrent.sql')},results=await Promise.allSettled([compileSelectiveCompletionArtifact(pair),compileSelectiveCompletionArtifact(pair)])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='EEXIST').length,1);await verifySelectiveCompletionArtifact(pair)
})

test('read-only verification refuses whitespace-only catalog changes, SQL/receipt tampering and current helper/paired-runner source drift',async t=>{
  const options=await inputs(t),receipt=await compileSelectiveCompletionArtifact(options),sql=await readFile(options.outputPath),bytes=await readFile(options.outputPath+'.sha256.json')
  for(const [file,value] of [[options.wholeCatalogPath,baseline],[options.nativeCatalogPath,native]]){
    const old=await readFile(file);await writeFile(file,JSON.stringify(value));await assert.rejects(verifySelectiveCompletionArtifact(options),/bytes drifted/);await writeFile(file,old)
  }
  await writeFile(options.outputPath,'');await assert.rejects(verifySelectiveCompletionArtifact(options),/SQL bytes drifted or incomplete/);await writeFile(options.outputPath,sql)
  await writeFile(options.outputPath+'.sha256.json',JSON.stringify({...receipt,live_operations:1}));await assert.rejects(verifySelectiveCompletionArtifact(options),/bytes drifted/);await writeFile(options.outputPath+'.sha256.json',bytes)
  const root=join(options.dir,'source'),sources=await selectiveCompletionArtifactSources()
  for(const source of sources){const target=join(root,source.path);await mkdir(dirname(target),{recursive:true});await cp(new URL('../'+source.path,import.meta.url),target)}
  const compiler=join(root,'scripts/compileSelectiveIntakeCompletionStage20261003.mjs'),output=join(options.dir,'copied.sql')
  const run=mode=>spawnSync(process.execPath,[compiler,mode,options.wholeCatalogPath,options.nativeCatalogPath,output,SELECTIVE_COMPLETION_RUNNER_SHA256],{encoding:'utf8'})
  assert.equal(run('install').status,0);assert.equal(run('verify').status,0)
  for(const path of ['scripts/selectiveIntakeCompletionPackage.mjs','scripts/selectiveIntakeExecution.mjs']){
    const target=join(root,path),old=await readFile(target);await writeFile(target,Buffer.concat([old,Buffer.from('\n// isolated source drift\n')]))
    const result=run('verify');assert.equal(result.status,1);assert.match(result.stderr,/bytes drifted|paired runner source drifted/);await writeFile(target,old);assert.equal(run('verify').status,0)
  }
})

test('actual eight-stage fixture rejects native approval drift, installs follow-on and restores exact whole/native catalogs with populated history intact',async t=>{
  const {db}=await wholeLaunchFixture();t.after(()=>db.close());await populateLaunchHistory(db)
  const query=await selectiveExecutionInstalledCatalogQuery(),whole=await launchCatalog(db),selective=(await db.query(query)).rows[0].jsonb_build_object,history=await retainedHistory(db)
  const options=await inputs(t,whole,selective),receipt=await compileSelectiveCompletionArtifact(options)
  const bad=structuredClone(selective);bad.server_version_num='170006'
  await writeFile(options.nativeCatalogPath,JSON.stringify(bad));const refused={...options,outputPath:join(options.dir,'native-drift.sql')};await compileSelectiveCompletionArtifact(refused)
  await assert.rejects(db.exec(await readFile(refused.outputPath,'utf8')),/catalogue missing or drifted/);await db.exec('rollback');assert.deepEqual(await launchCatalog(db),whole);assert.deepEqual(await retainedHistory(db),history)
  await writeFile(options.nativeCatalogPath,JSON.stringify(selective,null,2)+'\n')
  await db.exec(await readFile(options.outputPath,'utf8'))
  const currentWhole=await launchCatalog(db),currentNative=(await db.query(query)).rows[0].jsonb_build_object
  assert.notDeepEqual(currentWhole,whole);assert.notDeepEqual(currentNative,selective);assert.deepEqual(await retainedHistory(db),history)
  const recovery=await inputs(t,currentWhole,currentNative);recovery.mode='restore';recovery.originalArtifactPath=options.outputPath
  const restored=await compileSelectiveCompletionArtifact(recovery);await verifySelectiveCompletionArtifact(recovery)
  assert.equal(restored.original_install_sql_sha256,receipt.compiled_sha256)
  const originalBytes=await readFile(options.outputPath+'.sha256.json');await writeFile(options.outputPath+'.sha256.json',originalBytes.toString()+'\n');await assert.rejects(verifySelectiveCompletionArtifact(recovery),/bytes drifted/);await writeFile(options.outputPath+'.sha256.json',originalBytes)
  await assert.rejects(compileSelectiveCompletionArtifact({...recovery,originalArtifactPath:refused.outputPath,outputPath:join(recovery.dir,'wrong-original.sql')}),/native installer\/version|catalogue|SQL bytes|capture/)
  await db.exec(await readFile(recovery.outputPath,'utf8'))
  assert.deepEqual(await launchCatalog(db),whole);assert.deepEqual((await db.query(query)).rows[0].jsonb_build_object,selective);assert.deepEqual(await retainedHistory(db),history)
})
