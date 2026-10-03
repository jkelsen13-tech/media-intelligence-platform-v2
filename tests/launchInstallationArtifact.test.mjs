import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile,mkdtemp,mkdir,cp,rm,stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname,join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import { INITIAL_STAGES,prepareLaunchFixtureFoundation,launchCatalog,compileRollbackOnlyStageSql,installLaunchStageFixture,validateLaunchCatalog,sha256 } from '../scripts/launchInstallationSequence.mjs'
import { compileLaunchInstallationStage,compileLaunchRecoveryStage,verifyLaunchInstallationArtifact,launchInstallationSourceIdentities } from '../scripts/compileLaunchInstallationStage.mjs'
import { wholeLaunchFixture,roleCall,scalar } from './launchInstallationSequenceFixture.mjs'

let baseline
test.before(async()=>{const db=await PGlite.create();try{await prepareLaunchFixtureFoundation(db);baseline=await launchCatalog(db)}finally{await db.close()}})
const stage=INITIAL_STAGES[0]
async function directory(t){const dir=await mkdtemp(join(tmpdir(),'mip-install-artifact-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir}
async function catalogFile(dir,catalog=baseline){const path=join(dir,'accepted.json');await writeFile(path,JSON.stringify(catalog,null,2)+'\n');return path}
async function missing(path){await assert.rejects(stat(path),{code:'ENOENT'})}

test('catalog readback requires full named security fields and unique object/ACL/membership identities',async t=>{
  const mutations=[
    c=>delete c.relations[0].force_rls,c=>delete c.relations[0].columns[0].acl,
    c=>delete c.functions[0].definition,c=>delete c.roles[0].memberships,
    c=>delete c.schemas[0].owner,c=>c.relations.push(c.relations[0]),
    c=>c.relations[0].columns.push(c.relations[0].columns[0]),c=>c.functions[0].acl.push(c.functions[0].acl[0]),
    c=>c.roles[0].bypass_rls='false',c=>c.roles.push(c.roles[0]),
    c=>c.schemas[0].acl[0].is_grantable=0,c=>c.default_privileges=null,c=>c.schemas=[],c=>c.roles=[],
  ]
  const dir=await directory(t),output=join(dir,'refused.sql')
  assert.equal(validateLaunchCatalog(baseline),baseline)
  for(const mutate of mutations){
    const invalid=structuredClone(baseline);mutate(invalid)
    const path=await catalogFile(dir,invalid)
    await assert.rejects(compileLaunchInstallationStage(stage.id,path,output),/complete named catalogue required/)
    await missing(output);await missing(output+'.sha256.json')
  }
})

test('occupied receipt/SQL names and concurrent compilation preserve accepted bytes without an orphan pair',async t=>{
  const dir=await directory(t),catalog=await catalogFile(dir)
  const receiptCollision=join(dir,'receipt-occupied.sql'),sqlCollision=join(dir,'sql-occupied.sql')
  await writeFile(receiptCollision+'.sha256.json','accepted existing receipt')
  await assert.rejects(compileLaunchInstallationStage(stage.id,catalog,receiptCollision),{code:'EEXIST'})
  assert.equal(await readFile(receiptCollision+'.sha256.json','utf8'),'accepted existing receipt');await missing(receiptCollision)
  await writeFile(sqlCollision,'accepted existing SQL')
  await assert.rejects(compileLaunchInstallationStage(stage.id,catalog,sqlCollision),{code:'EEXIST'})
  assert.equal(await readFile(sqlCollision,'utf8'),'accepted existing SQL');await missing(sqlCollision+'.sha256.json')
  const concurrent=join(dir,'concurrent.sql')
  const outcomes=await Promise.allSettled([compileLaunchInstallationStage(stage.id,catalog,concurrent),compileLaunchInstallationStage(stage.id,catalog,concurrent)])
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected'&&o.reason.code==='EEXIST').length,1)
  assert.equal((await verifyLaunchInstallationArtifact(stage.id,catalog,concurrent)).status,'SOURCE_ARTIFACT_BYTES_MATCH')
})

test('read-only artifact verification binds exact catalog file bytes and refuses forged, truncated and mismatched pairs',async t=>{
  const dir=await directory(t),catalog=await catalogFile(dir),output=join(dir,'artifact.sql')
  const identity=await compileLaunchInstallationStage(stage.id,catalog,output),sql=await readFile(output),receipt=await readFile(output+'.sha256.json')
  assert.equal(identity.accepted_catalog_file_sha256,sha256(await readFile(catalog)))
  assert.notEqual(identity.accepted_catalog_file_sha256,identity.accepted_catalog_sha256)
  assert.deepEqual(identity.source_artifacts,await launchInstallationSourceIdentities())
  assert.ok(identity.source_artifacts.some(s=>s.path==='supabase/source-proposals/public-reviewed-versions-v1.installed-catalog.sql'))
  assert.ok(identity.source_artifacts.some(s=>s.path==='supabase/source-proposals/legacy-atomic-pack/installed-catalog.sql'))
  const before=await Promise.all([stat(output),stat(output+'.sha256.json')])
  await verifyLaunchInstallationArtifact(stage.id,catalog,output)
  const after=await Promise.all([stat(output),stat(output+'.sha256.json')]);assert.deepEqual(after.map(s=>s.mtimeMs),before.map(s=>s.mtimeMs))
  await assert.rejects(verifyLaunchInstallationArtifact(INITIAL_STAGES[1].id,catalog,output),/contract\/stage\/mode/)
  await writeFile(catalog,JSON.stringify(baseline));await assert.rejects(verifyLaunchInstallationArtifact(stage.id,catalog,output),/bytes drifted/)
  await catalogFile(dir)
  await writeFile(output,'');await assert.rejects(verifyLaunchInstallationArtifact(stage.id,catalog,output),/artifact bytes drifted or incomplete/)
  await writeFile(output,sql)
  const forged=JSON.parse(receipt);forged.source_artifacts[0].sha256='0'.repeat(64)
  await writeFile(output+'.sha256.json',JSON.stringify(forged));await assert.rejects(verifyLaunchInstallationArtifact(stage.id,catalog,output),/bytes drifted/)
  forged.source_artifacts=identity.source_artifacts;forged.live_operations=1
  await writeFile(output+'.sha256.json',JSON.stringify(forged));await assert.rejects(verifyLaunchInstallationArtifact(stage.id,catalog,output),/bytes drifted/)
  await writeFile(output+'.sha256.json',receipt)
  const altered=Buffer.concat([sql,Buffer.from('\n-- altered local SQL\n')]);await writeFile(output,altered)
  await writeFile(output+'.sha256.json',JSON.stringify({...identity,compiled_sha256:sha256(altered)}))
  await assert.rejects(verifyLaunchInstallationArtifact(stage.id,catalog,output),/bytes drifted/)
})

test('current helper and proposal source drift refuse even when SQL/catalog hashes still match',async t=>{
  const dir=await directory(t),root=join(dir,'source'),identities=await launchInstallationSourceIdentities()
  for(const file of identities){const target=join(root,file.path);await mkdir(dirname(target),{recursive:true});await cp(new URL('../'+file.path,import.meta.url),target)}
  const catalog=await catalogFile(dir),output=join(dir,'copied.sql'),compiler=join(root,'scripts/compileLaunchInstallationStage.mjs')
  const run=args=>spawnSync(process.execPath,[compiler,...args],{encoding:'utf8'})
  const compiled=run([stage.id,catalog,output]);assert.equal(compiled.status,0,compiled.stderr)
  const verify=()=>run([stage.id,catalog,output,'--verify'])
  assert.equal(verify().status,0)
  for(const path of ['supabase/source-proposals/story_following_v1.catalog.sql','supabase/source-proposals/public-reviewed-versions-v1.sql','scripts/launchInstallSequenceCatalog.sql']){
    const target=join(root,path),original=await readFile(target)
    await writeFile(target,Buffer.concat([original,Buffer.from('\n-- isolated test source drift\n')]))
    const readback=verify();assert.equal(readback.status,1);assert.match(readback.stderr,/bytes drifted/)
    await writeFile(target,original);assert.equal(verify().status,0)
  }
})

test('fresh preflight observes bounded settings before catalog guard, and rollback restores catalog/session settings',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());await prepareLaunchFixtureFoundation(db)
  const before=await launchCatalog(db),settings=await db.query('select current_setting(\'lock_timeout\') l,current_setting(\'statement_timeout\') s,current_setting(\'idle_in_transaction_session_timeout\') i')
  const compiled=await compileRollbackOnlyStageSql(stage,before)
  const observed=compiled.sql.replace(/(do \$launch_guard_)/,"select current_setting('lock_timeout') observed_lock,current_setting('statement_timeout') observed_statement,current_setting('idle_in_transaction_session_timeout') observed_idle;\n$1")
  const rows=(await db.exec(observed)).flatMap(part=>part.rows??[])
  assert.deepEqual(rows.find(row=>row.observed_lock),{observed_lock:'5s',observed_statement:'30s',observed_idle:'30s'})
  assert.deepEqual(await launchCatalog(db),before)
  assert.deepEqual(await db.query('select current_setting(\'lock_timeout\') l,current_setting(\'statement_timeout\') s,current_setting(\'idle_in_transaction_session_timeout\') i'),settings)
})

test('column ACL and RLS drift refuse atomically; accepted occupied package namespace preserves its exact existing owner',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());await prepareLaunchFixtureFoundation(db)
  const approved=await launchCatalog(db),article=approved.relations.find(r=>r.identity==='public.articles'),compiled=await compileRollbackOnlyStageSql(stage,approved)
  for(const [change,restore] of [
    ['grant select(body_text) on public.articles to anon','revoke select(body_text) on public.articles from anon'],
    ['alter table public.articles '+(article.rls?'disable':'enable')+' row level security','alter table public.articles '+(article.rls?'enable':'disable')+' row level security'],
  ]){
    await db.exec(change);const drifted=await launchCatalog(db)
    await assert.rejects(db.exec(compiled.sql),/approved catalogue missing or drifted/);await db.exec('rollback')
    assert.deepEqual(await launchCatalog(db),drifted);await db.exec(restore);assert.deepEqual(await launchCatalog(db),approved)
  }
  await db.exec('create table mip_private.reviewed_public_article_versions(occupied_sentinel text)')
  const occupied=await launchCatalog(db),refused=await compileRollbackOnlyStageSql(stage,occupied)
  await assert.rejects(db.exec(refused.sql),/already|occupied|exist|collision/i);await db.exec('rollback')
  assert.deepEqual(await launchCatalog(db),occupied)
})

test('source-only recovery compiles existing exact empty restore, binds original receipt bytes and refuses cross-stage receipt reuse',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());await prepareLaunchFixtureFoundation(db)
  const installed=await installLaunchStageFixture(db,stage,{approvedCatalog:await launchCatalog(db)})
  const dir=await directory(t),catalog=await catalogFile(dir,await launchCatalog(db)),original=join(dir,'original.json'),output=join(dir,'recovery.sql')
  await writeFile(original,JSON.stringify(installed,null,2)+'\n')
  const identity=await compileLaunchRecoveryStage(stage.id,catalog,original,output)
  assert.equal(identity.original_installation_receipt_file_sha256,sha256(await readFile(original)))
  assert.equal(identity.source_sql,stage.rollback)
  assert.equal((await verifyLaunchInstallationArtifact(stage.id,catalog,output,{originalReceiptPath:original})).status,'SOURCE_ARTIFACT_BYTES_MATCH')
  await writeFile(original,JSON.stringify(installed));await assert.rejects(verifyLaunchInstallationArtifact(stage.id,catalog,output,{originalReceiptPath:original}),/bytes drifted/)
  await writeFile(original,JSON.stringify({...installed,id:'public-story-following'}))
  await assert.rejects(compileLaunchRecoveryStage(stage.id,catalog,original,join(dir,'wrong.sql')),/receipt stage\/source\/native snapshot mismatch/)
  await missing(join(dir,'wrong.sql'))
  await writeFile(original,JSON.stringify(installed))
  await db.exec(await readFile(output,'utf8'));assert.deepEqual(await launchCatalog(db),installed.original)
})

test('supplied preserve-and-revoke compiles separately and ordinary readers remain denied private/profile/publication authority',async t=>{
  const {db,receipts}=await wholeLaunchFixture();t.after(()=>db.close())
  const selective=INITIAL_STAGES.find(s=>s.id==='selective-execution'),originalReceipt=receipts.find(r=>r.id===selective.id)
  const dir=await directory(t),catalog=await catalogFile(dir,await launchCatalog(db)),original=join(dir,'original.json'),output=join(dir,'containment.sql')
  await writeFile(original,JSON.stringify(originalReceipt))
  const identity=await compileLaunchRecoveryStage(selective.id,catalog,original,output,{containment:true})
  assert.equal(identity.source_sql,selective.containment);assert.match(identity.mode,/preserve-and-revoke/)
  await verifyLaunchInstallationArtifact(selective.id,catalog,output,{originalReceiptPath:original})
  for(const role of ['anon','authenticated']){
    await assert.rejects(roleCall(db,role,'select id from public.mip_profiles'),/permission denied/)
    await assert.rejects(roleCall(db,role,'select count(*) from mip_private.public_story_follows'),/permission denied/)
    await assert.rejects(roleCall(db,role,"select public.mip_public_story_following_v1('list','{}')"),/permission denied/)
    await assert.rejects(roleCall(db,role,'select body_text from public.articles'),/permission denied/)
  }
  for(const table of ['mip_private.public_story_follows','mip_private.public_story_follow_events']){
    const row=(await launchCatalog(db)).relations.find(r=>r.identity===table);assert.equal(row.rls,true);assert.equal(row.force_rls,true)
  }
  await db.exec(await readFile(output,'utf8'))
  assert.equal(await scalar(db,"select has_function_privilege('service_role','public.mip_selective_execution_v1(text,jsonb)','EXECUTE')"),false)
  assert.equal(await scalar(db,"select has_function_privilege('service_role','public.mip_public_story_following_v1(text,jsonb)','EXECUTE')"),true)
})
