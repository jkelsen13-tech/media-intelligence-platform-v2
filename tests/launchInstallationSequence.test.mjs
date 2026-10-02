import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { INITIAL_STAGES, prepareLaunchFixtureFoundation, launchCatalog, installLaunchStageFixture,recoverLaunchStageFixture,compileStageSql,compileRollbackOnlyStageSql,fileIdentity,sha256 } from '../scripts/launchInstallationSequence.mjs'
import { wholeLaunchFixture,populateLaunchHistory,retainedHistory,scalar,roleCall } from './launchInstallationSequenceFixture.mjs'
import { compileLaunchInstallationStage } from '../scripts/compileLaunchInstallationStage.mjs'
import { createClient } from '@supabase/supabase-js'
import { createNewsBackend } from '../src/lib/newsBackend.js'

const results=[],receipts=[]
const record=(name,details={})=>results.push({name,status:'PASS',...details})
test.after(async()=>{
  if(process.env.MIP_LAUNCH_SEQUENCE_RECEIPT)await writeFile(process.env.MIP_LAUNCH_SEQUENCE_RECEIPT,JSON.stringify({contract:'mip-launch-install-sequence-qualification-v1',
    status:results.length===INITIAL_STAGES.filter(s=>s.rollback).length+5?'PASS':'INCOMPLETE',runtime:process.version,live_operations:0,source_only:true,synthetic_disposable:true,cases:results,stages:receipts,
    limits:['PGlite synthetic existing-owner fixture; no live grants/admission/provider acquisition or protected transaction','Single-session engine; no live PostgreSQL/PostgREST/JWT/multisession lock qualification','Legacy and native prerequisites intentionally retained; no global destructive uninstall claimed']},null,2)+'\n')
})
test('existing eligible content is withheld by empty immutable ledgers; missing owners never fall back and rollback restores predecessor exposure',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());await prepareLaunchFixtureFoundation(db)
  const pipeline=(action,input={})=>scalar(db,'select public.mip_pipeline_v1($1,$2::jsonb)',[action,JSON.stringify(input)])
  await pipeline('enqueue',{run_id:'synthetic-availability-cutover',article:{url:'https://example.invalid/cutover-existing',title:'EXISTING ELIGIBLE SOURCE BEFORE CUTOVER',
    outlet:'Synthetic predecessor outlet',summary:'An existing source has no immutable reviewed admission yet.',body_text:'PREDECESSOR RAW COLUMN EXPOSURE',published_at:'2026-10-01T00:00:00Z'}})
  const job=await pipeline('claim'),source=await pipeline('finish',{job_id:job.id,lease_token:job.lease_token})
  await db.query("update public.articles set reader_state='eligible' where id=$1",[source.article_id])
  const predecessor=await roleCall(db,'anon','select title,body_text from public.articles where id=$1',[source.article_id])
  assert.equal(predecessor,'EXISTING ELIGIBLE SOURCE BEFORE CUTOVER')
  const oldDetail=await roleCall(db,'anon',"select coalesce(jsonb_agg(t),'[]') from public.news_detail_public t where article_id=$1",[source.article_id])
  assert.equal(oldDetail.length,1,'the predecessor reader did expose this eligible source')
  const calls=[]
  const client=createClient('https://synthetic-cutover-sdk.invalid','synthetic-publishable',{accessToken:async()=> 'synthetic-current-session',global:{fetch:async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url),resource=url.pathname.split('/').at(-1);calls.push({resource,method:request.method})
    await db.exec('begin;set local role anon')
    try{
      let rows
      if(resource==='news_reviewed_articles_public')rows=(await db.query('select id,published_at,fetched_at,public_version_id,public_version from public.news_reviewed_articles_public')).rows
      else if(resource==='articles')rows=(await db.query('select id,title,body_text from public.articles')).rows
      else if(resource==='news_detail_public')rows=(await db.query('select * from public.news_detail_public')).rows
      else if(resource==='read_reviewed_public_story_directory_v1'){
        const payload=await request.json(),data=await scalar(db,'select public.read_reviewed_public_story_directory_v1($1,$2)',[payload.p_after??null,payload.p_limit??30])
        return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})
      }else throw Error('unexpected synthetic SDK request: '+resource)
      return new Response(JSON.stringify(rows),{headers:{'content-type':'application/json','content-range':`0-${Math.max(rows.length-1,0)}/${rows.length}`}})
    }catch(e){return new Response(JSON.stringify({code:e.code??'fixture_failure',message:e.message}),{status:400,headers:{'content-type':'application/json'}})}
    finally{await db.exec('rollback')}
  }}})
  const backend=createNewsBackend(client)
  const missing=await backend.loadArticles();assert.deepEqual(missing.articles,[]);assert.ok(missing.articlesUnavailable)
  assert.equal((await backend.loadStoryDirectory()).status,'unavailable')
  assert.deepEqual(calls.map(c=>c.resource),['news_reviewed_articles_public','read_reviewed_public_story_directory_v1'],'raw predecessors are available but no fallback request is issued')
  const stage=INITIAL_STAGES[0],r=await installLaunchStageFixture(db,stage,{approvedCatalog:await launchCatalog(db)})
  assert.equal(await scalar(db,'select count(*)::int from public.articles where id=$1',[source.article_id]),1,'the cutover does not delete existing source content')
  assert.equal(await scalar(db,'select count(*)::int from mip_private.reviewed_public_article_versions'),0)
  assert.deepEqual((await backend.loadArticles()).articles,[],'installation alone withholds existing eligible content')
  assert.equal((await backend.loadArticles()).articlesUnavailable,null,'installed empty is distinct from missing owner')
  assert.equal((await backend.loadStoryDirectory()).stories.length,0)
  await assert.rejects(roleCall(db,'anon','select body_text from public.articles where id=$1',[source.article_id]),/permission denied/)
  assert.deepEqual(await roleCall(db,'anon',"select coalesce(jsonb_agg(t),'[]') from public.news_detail_public t where article_id=$1",[source.article_id]),[])
  await recoverLaunchStageFixture(db,stage,r,{approvedCatalog:await launchCatalog(db)})
  assert.equal(await roleCall(db,'anon','select body_text from public.articles where id=$1',[source.article_id]),'PREDECESSOR RAW COLUMN EXPOSURE','empty rollback reopens the exact predecessor raw-column authority')
  assert.equal((await roleCall(db,'anon',"select coalesce(jsonb_agg(t),'[]') from public.news_detail_public t where article_id=$1",[source.article_id])).length,1)
  assert.deepEqual((await backend.loadArticles()).articles,[],'modern reader still refuses the missing immutable owner after rollback')
  assert.ok((await backend.loadArticles()).articlesUnavailable)
  const reinstalled=await installLaunchStageFixture(db,stage,{approvedCatalog:await launchCatalog(db)})
  const hash=await scalar(db,'select content_hash from evidence_pipeline.article_captures where id=$1',[source.capture_id])
  const admitted=await scalar(db,"select mip_private.bind_reviewed_public_article_version($1,$2,$3,'source_report','synthetic-explicit-cutover-review','synthetic-policy','Pending factual verification; explicit synthetic report-envelope admission only.')",[source.article_id,source.capture_id,hash])
  const visible=await backend.loadArticles();assert.equal(visible.articles.length,1);assert.equal(visible.articles[0].public_version_id,admitted)
  assert.equal(visible.articles[0].public_version.admission_kind,'source_report');assert.deepEqual(visible.articles[0].public_version.evidence,[])
  await assert.rejects(recoverLaunchStageFixture(db,stage,reinstalled,{approvedCatalog:await launchCatalog(db)}),/admitted history exists/);await db.exec('rollback')
  assert.equal((await backend.loadArticles()).articles[0].public_version_id,admitted)
  assert.equal(calls.some(c=>c.resource==='articles'||c.resource==='news_detail_public'),false)
  record('existing-data availability cutover; installed-empty withholding; missing-owner no-fallback; explicit population; rollback predecessor raw exposure')
})
test('local compiler binds exact bytes, handles literal catalog text and never overwrites an accepted artifact',async t=>{
  const db=await PGlite.create(),directory=await mkdtemp(join(tmpdir(),'mip-launch-compile-'));t.after(async()=>{await db.close();await rm(directory,{recursive:true,force:true})})
  await prepareLaunchFixtureFoundation(db)
  await db.query('comment on table public.articles is '+"'$launch_sequence_guard$ "+"quote'' literal "+"\\\\n"+"'")
  const baseline=await launchCatalog(db),catalogPath=join(directory,'catalog.json'),output=join(directory,'accepted.sql')
  assert.equal(baseline.relations.find(r=>r.sequence)?.sequence.max,'9223372036854775807')
  await writeFile(catalogPath,JSON.stringify(baseline))
  await assert.rejects(compileLaunchInstallationStage('guessed-stage',catalogPath,output),/exact installation stage/)
  await writeFile(join(directory,'incomplete.json'),'{}')
  await assert.rejects(compileLaunchInstallationStage(INITIAL_STAGES[0].id,join(directory,'incomplete.json'),output),/complete named catalogue/)
  const result=await compileLaunchInstallationStage(INITIAL_STAGES[0].id,catalogPath,output),source=await readFile(output,'utf8')
  assert.equal(result.compiled_sha256,sha256(source));assert.equal(result.live_operations,0)
  await assert.rejects(compileLaunchInstallationStage(INITIAL_STAGES[0].id,catalogPath,output),/EEXIST/)
  await db.exec(source)
  assert.equal((await launchCatalog(db)).relations.some(r=>r.identity==='public.news_reviewed_articles_public'),true)
  record('literal-safe local compiler; exact source/catalog/artifact hashes; no overwrite or execution fallback')
})
test('all proposals coexist with fresh stage-local baselines and exact supplied empty restores',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());await prepareLaunchFixtureFoundation(db)
  const foundation=await launchCatalog(db);let previous=foundation
  for(const stage of INITIAL_STAGES){
    await t.test(stage.id,async()=>{
      assert.deepEqual(await launchCatalog(db),previous)
      await assert.rejects(installLaunchStageFixture(db,stage),/separate approved stage/)
      if(previous!==foundation){await assert.rejects(installLaunchStageFixture(db,stage,{approvedCatalog:foundation}),/approved catalogue missing or drifted/);await db.exec('rollback')}
      await db.exec("comment on table public.articles is 'synthetic interstage catalogue drift'")
      await assert.rejects(installLaunchStageFixture(db,stage,{approvedCatalog:previous}),/approved catalogue missing or drifted/);await db.exec('rollback')
      await db.exec('comment on table public.articles is null')
      assert.deepEqual(await launchCatalog(db),previous)
      if(stage.catalogHelper)await db.exec(await readFile(new URL('../'+stage.catalogHelper,import.meta.url),'utf8'))
      const rehearsal=await compileRollbackOnlyStageSql(stage,previous)
      assert.equal((rehearsal.sql.match(/^commit;\s*$/gm)??[]).length,0)
      assert.equal((rehearsal.sql.match(/^rollback;\s*$/gm)??[]).length,1)
      await db.exec(rehearsal.sql)
      assert.deepEqual(await launchCatalog(db),previous,'rollback-only rehearsal never commits package mutations')
      let r=await installLaunchStageFixture(db,stage,{approvedCatalog:previous})
      assert.deepEqual(r.captured,r.original,'baseline read occurs inside the proposal transaction')
      assert.match(r.transactionId,/^\d+$/);assert.equal(new Set(receipts.map(r=>r.transactionId)).has(r.transactionId),false)
      const compiled=await compileStageSql(stage,previous)
      assert.equal((compiled.sql.match(/^begin;\s*$/gm)??[]).length,1);assert.equal((compiled.sql.match(/^commit;\s*$/gm)??[]).length,1)
      if(stage.rollback){
        await assert.rejects(recoverLaunchStageFixture(db,stage,r,{approvedCatalog:foundation}),/approved catalogue missing or drifted/);await db.exec('rollback')
        const recovery=await recoverLaunchStageFixture(db,stage,r,{approvedCatalog:r.installed})
        assert.deepEqual(recovery.after,r.original,'exact full named owner/ACL/definition/default/RLS restore at this checkpoint')
        record(stage.id+' exact empty checkpoint restore',{rollbackHash:recovery.sourceHash})
        r=await installLaunchStageFixture(db,stage,{approvedCatalog:await launchCatalog(db)})
      }
      receipts.push({id:r.id,proposal:r.proposal,sourceHash:r.sourceHash,compiledHash:r.compiledHash,transactionId:r.transactionId,
        originalCatalogHash:sha256(JSON.stringify(r.original)),installedCatalogHash:sha256(JSON.stringify(r.installed)),delta:r.delta,
        rehearsalHash:rehearsal.compiledHash,artifacts:await Promise.all([stage.proposal,stage.rollback,stage.containment,stage.catalogHelper].filter(Boolean).map(fileIdentity))})
      previous=r.installed
    })
  }
  assert.equal(await scalar(db,"select has_table_privilege('anon','public.articles','SELECT')"),false)
  for(const role of ['anon','authenticated']){
    assert.deepEqual(await roleCall(db,role,'select public.read_reviewed_public_story_directory_v1()'),{contract:'mip-reviewed-public-story-directory-v1',stories:[],complete:true,next_after:null})
    assert.equal((await roleCall(db,role,"select public.read_markets_source_directory_v1('2026-10-02T00:00:00Z')")).reason,'no_admitted_assets')
    assert.deepEqual(await roleCall(db,role,'select coalesce(jsonb_agg(t),\'[]\') from public.comparison_public t'),[])
    await assert.rejects(roleCall(db,role,'select count(*) from evidence_pipeline.selective_source_authorizations'),/permission denied/)
    await assert.rejects(roleCall(db,role,"select mip_private.bind_comparison_member(null,null,'forged')"),/permission denied/)
  }
  assert.equal(await scalar(db,'select count(*)::int from evidence_pipeline.selective_criteria_versions'),0)
  assert.equal(await scalar(db,'select count(*)::int from evidence_pipeline.selective_source_authorizations'),0)
  assert.equal(await scalar(db,"select has_table_privilege('service_role','public.articles','UPDATE')"),false)
  assert.equal(await scalar(db,"select pg_has_role('service_role','mip_legacy_completion_owner','MEMBER')"),false)
  assert.equal(await scalar(db,"select has_function_privilege('service_role','public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb)','EXECUTE')"),false)
  const nativeRole=(await launchCatalog(db)).roles.find(r=>r.identity==='mip_legacy_completion_owner')
  assert.deepEqual([nativeRole.superuser,nativeRole.bypass_rls,nativeRole.login,nativeRole.inherit],[false,false,false,false])
  record('whole installed stack defaults closed; publication/rights/policy/role boundaries distinct')
})
test('whole empty reverse recovery restores final readers then contains retained Legacy and Selective owners',async t=>{
  const {db,receipts}=await wholeLaunchFixture();t.after(()=>db.close())
  for(const id of ['reviewed-comparison','markets-directory']){
    const stage=INITIAL_STAGES.find(s=>s.id===id),receipt=receipts.find(r=>r.id===id)
    const recovered=await recoverLaunchStageFixture(db,stage,receipt,{approvedCatalog:await launchCatalog(db)})
    assert.deepEqual(recovered.after,receipt.original)
  }
  const retainedBefore=await launchCatalog(db)
  for(const id of ['legacy-atomic-completion','selective-execution']){
    const stage=INITIAL_STAGES.find(s=>s.id===id)
    const recovered=await recoverLaunchStageFixture(db,stage,receipts.find(r=>r.id===id),{approvedCatalog:await launchCatalog(db),containment:true})
    assert.deepEqual(recovered.delta.relations,{added:[],removed:[],changed:[]});assert.deepEqual(recovered.delta.roles,{added:[],removed:[],changed:[]})
  }
  assert.notDeepEqual(await launchCatalog(db),receipts[0].original,'retained owners are explicitly not a global uninstall')
  for(const signature of ['public.mip_legacy_extraction_v1(text,jsonb)','mip_private.legacy_extraction_apply_v1(text,jsonb)','public.mip_selective_execution_v1(text,jsonb)'])
    assert.equal(await scalar(db,'select has_function_privilege(\'service_role\',$1,\'EXECUTE\')',[signature]),false)
  assert.equal(await scalar(db,"select has_function_privilege('service_role','public.mip_investigation_selective_intake_v1(text,jsonb)','EXECUTE')"),true)
  assert.equal(await scalar(db,"select has_function_privilege('service_role','public.mip_public_story_following_v1(text,jsonb)','EXECUTE')"),true)
  assert.equal((await launchCatalog(db)).relations.length,retainedBefore.relations.length)
  record('whole empty reverse recovery with explicit retained dependency barrier')
})
test('populated whole-stack history refuses destructive restore and survives exact revoke-only containment',async t=>{
  const {db,receipts}=await wholeLaunchFixture();t.after(()=>db.close());const h=await populateLaunchHistory(db)
  const before=await retainedHistory(db),catalog=await launchCatalog(db)
  for(const id of ['reviewed-comparison','markets-directory','selective-execution','public-story-following','reviewed-public-versions']){
    const stage=INITIAL_STAGES.find(s=>s.id===id)
    await assert.rejects(recoverLaunchStageFixture(db,stage,receipts.find(r=>r.id===id),{approvedCatalog:await launchCatalog(db)}),/history|preservation|populated|retain/i)
    await db.exec('rollback');assert.deepEqual(await launchCatalog(db),catalog);assert.deepEqual(await retainedHistory(db),before)
  }
  for(const id of ['legacy-atomic-completion','selective-execution']){
    const stage=INITIAL_STAGES.find(s=>s.id===id)
    await recoverLaunchStageFixture(db,stage,receipts.find(r=>r.id===id),{approvedCatalog:await launchCatalog(db),containment:true})
    assert.deepEqual(await retainedHistory(db),before)
  }
  const visible=await roleCall(db,'authenticated','select public.read_reviewed_public_story_v1($1,$2)',[h.story.story_id,h.story.public_version_id])
  assert.equal(visible.public_version_id,h.story.public_version_id)
  assert.equal(visible.members[0].admission_kind,'source_report');assert.equal(visible.members[0].evidence.length,0)
  assert.doesNotMatch(JSON.stringify(visible),/PRIVATE_COMPLETE_BODY_OUTSIDE_ADMISSION/)
  await assert.rejects(roleCall(db,'service_role',"select public.mip_legacy_extraction_v1('read_pending','{}')"),/permission denied/)
  await assert.rejects(roleCall(db,'service_role',"select public.mip_selective_execution_v1('read','{}')"),/permission denied/)
  assert.equal(await scalar(db,"select count(*)::int from mip_private.legacy_extraction_completions where completion_id=$1",[h.legacy.completion_id]),1)
  record('all populated restoration gates refuse atomically; exact revoke-only history preserved')
})
