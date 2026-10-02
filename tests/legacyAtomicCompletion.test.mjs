import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { atomicFixture,EXTRACTOR,SENTINEL } from './legacyAtomicCompletionFixture.mjs'
import { legacyAtomicCatalogQuery,LEGACY_ATOMIC_PROPOSAL } from '../scripts/legacyAtomicCompletionPackage.mjs'
const receipts=[]
const record=(name,f,result)=>receipts.push({name,status:'PASS',...result,requests:f.requests})
test.after(async()=>{if(process.env.MIP_LEGACY_ATOMIC_RECEIPT)await writeFile(process.env.MIP_LEGACY_ATOMIC_RECEIPT,JSON.stringify({status:'PASS',live_operations:0,source_repair:true,legacy_reactivated:false,cases:receipts,limits:['Synthetic isolated PostgreSQL administrator fixtures; no live admission or grants','Installed SDK request adapter exercises SQL; no live PostgREST/JWT or independent multi-session concurrency']},null,2)+'\n')})

test('actual SDK handler retains one raw native capture and private receipt, leaves source and shared derived rows unchanged',async()=>{
 const f=await atomicFixture();try{
  const before=await f.state(),counts=await f.counts(),r=await f.run();assert.deepEqual(await f.state(),before)
  assert.equal(r.report.errors.length,0);assert.equal(r.report.extracted,1);assert.equal(r.report.privateCompletions,1);assert.equal(r.resolverCalls,0);assert.equal(r.report.entitiesResolved,0);assert.equal(r.report.citations,0)
  const c=(await f.db.query('select * from mip_private.legacy_extraction_completions where article_id=$1',[f.pending])).rows[0]
  assert.equal(c.publication,'withheld');assert.ok(c.plan.entities.some(e=>e.surface==='Alice Smith'));assert.ok(c.plan.citations.some(e=>e.cited_type==='court_doc'))
  const cap=(await f.db.query('select * from evidence_pipeline.article_captures where id=$1',[c.capture_id])).rows[0]
  assert.match(cap.payload.body_text,/<b>/);assert.equal(cap.content_hash,c.capture_hash);assert.equal(c.plan.normalization.body_text,cap.payload.body_text.replace(/<\/?b>/g,''))
  assert.equal(await f.scalar("select encode(sha256(convert_to(payload::text,'UTF8')),'hex')=content_hash from evidence_pipeline.article_captures where id=$1",[cap.id]),true)
  const after=await f.counts();assert.equal(after['evidence_pipeline.article_captures'],counts['evidence_pipeline.article_captures']+1);assert.equal(after['evidence_pipeline.change_jobs'],counts['evidence_pipeline.change_jobs']+2)
  assert.equal((await f.run()).more,false);assert.deepEqual(await f.state(),before)
  record('atomic private capture and completion; unchanged public/source bytes',f,{report:r.report,capture_hash:c.capture_hash,private_completed:1,shared_writes:0})
 }finally{await f.close()}
})

test('actual handler denies admission race before completion without capture, source or derived mutation',async()=>{
 const f=await atomicFixture({onComplete:async f=>{await f.db.query("update articles set reader_state='eligible' where id=$1",[f.pending])}});try{
  const before=await f.state(),counts=await f.counts(),r=await f.run();assert.equal(r.more,false);assert.equal(r.report.privateCompletions,undefined);assert.match(r.report.errors[0],/private legacy source/)
  const after=await f.state();assert.deepEqual(after.entities,before.entities);assert.deepEqual(after.citations,before.citations);assert.deepEqual(after.links,before.links);assert.deepEqual(await f.counts(),{...counts,'evidence_pipeline.evidence_changes':counts['evidence_pipeline.evidence_changes']+1,'evidence_pipeline.change_jobs':counts['evidence_pipeline.change_jobs']+2})
  const a=after.articles.find(a=>a.id===f.pending),b=before.articles.find(a=>a.id===f.pending);for(const k of Object.keys(b).filter(k=>k!=='reader_state'))assert.deepEqual(a[k],b[k]);assert.equal(a.reader_state,'eligible')
  record('pending selection -> admission before RPC is denied',f,{report:r.report,rolled_back:true})
 }finally{await f.close()}
})

test('actual handler denies selected source byte revision and retains the newer bytes',async()=>{
 const f=await atomicFixture({onComplete:async f=>{await f.db.query("update articles set body_text='Explicit newer pending source revision.' where id=$1",[f.pending])}});try{
  const before=await f.state(),counts=await f.counts(),r=await f.run();assert.equal(r.more,false);assert.match(r.report.errors[0],/version\/hash conflict/);assert.deepEqual(await f.counts(),{...counts,'evidence_pipeline.evidence_changes':counts['evidence_pipeline.evidence_changes']+1,'evidence_pipeline.change_jobs':counts['evidence_pipeline.change_jobs']+2})
  const after=await f.state();assert.equal(after.articles.find(a=>a.id===f.pending).body_text,'Explicit newer pending source revision.');assert.deepEqual(after.entities,before.entities);assert.deepEqual(after.citations,before.citations)
  record('selected source version revision is denied without overwrite',f,{report:r.report})
 }finally{await f.close()}
})

test('actual handler refuses missing atomic RPC and has no table-write fallback',async()=>{
 const f=await atomicFixture({install:false});try{const before=await f.state();await assert.rejects(f.run(),/private legacy selection/);assert.deepEqual(await f.state(),before);assert.equal(f.requests.length,1);assert.ok(f.requests.every(r=>r.path.includes('/rpc/')));record('uninstalled route default denial',f,{fallback_writes:0})}finally{await f.close()}
})

test('whole private transaction rolls back newly retained job/capture/change dispatch when final receipt insert fails',async()=>{
 const f=await atomicFixture();try{
  await f.db.exec("create function public.fixture_deny_private_completion() returns trigger language plpgsql as $$begin raise exception 'forced final private receipt failure';end$$;create trigger fixture_deny_private_completion before insert on mip_private.legacy_extraction_completions for each row execute function public.fixture_deny_private_completion();")
  const before=await f.state(),counts=await f.counts(),r=await f.run();assert.match(r.report.errors[0],/forced final private receipt failure/);assert.equal(r.more,false);assert.deepEqual(await f.counts(),counts);assert.deepEqual(await f.state(),before)
  record('private job/capture/change dispatch/receipt whole transaction rollback',f,{report:r.report,counts})
 }finally{await f.close()}
})

test('private completion exact version/hash CAS and idempotency reject tampering',async()=>{
 const f=await atomicFixture();try{
  await f.run();const request=f.requests.find(r=>r.payload.p_action==='complete_private').payload.p_input
  const invoke=input=>f.roleCall('service_role',"select public.mip_legacy_extraction_v1('complete_private',$1::jsonb)",[JSON.stringify(input)])
  await assert.rejects(f.roleCall('service_role','select public.mip_legacy_extraction_v1(null,$1::jsonb)',[JSON.stringify(request)]),/unsupported legacy action/)
  const counts=await f.counts(),same=await invoke(request);assert.equal(same.publication,'withheld');assert.deepEqual(await f.counts(),counts)
  await assert.rejects(invoke({...request,source_hash:'0'.repeat(64)}),/version\/hash conflict/)
  await assert.rejects(invoke({...request,record_version_id:'00000000-0000-4000-8000-000000000001'}),/version\/hash conflict/)
  await assert.rejects(invoke({...request,plan:{...request.plan,proposed_digest:!request.plan.proposed_digest}}),/idempotency conflict/)
  await assert.rejects(invoke({...request,reader_state:'eligible'}),/invalid private completion/);assert.deepEqual(await f.counts(),counts)
  record('exact hash/version/idempotency CAS',f,{completion_id:same.completion_id})
 }finally{await f.close()}
})

test('metadata sentinel retains no inferred relations and neither deletes nor publishes existing shared rows',async()=>{
 const f=await atomicFixture({rawBody:SENTINEL});try{
  const before=await f.state(),r=await f.run();assert.deepEqual(await f.state(),before);assert.equal(r.report.metadataOnlySkipped,1);assert.equal(r.report.extracted,0)
  const plan=await f.scalar('select plan from mip_private.legacy_extraction_completions where article_id=$1',[f.pending]);assert.equal(plan.metadata_only,true);assert.deepEqual(plan.claims,[]);assert.deepEqual(plan.entities,[]);assert.deepEqual(plan.citations,[])
  record('metadata-only plan withheld; existing shared rows preserved',f,{report:r.report})
 }finally{await f.close()}
})

test('private selection preserves active/eligible denial, withdrawn eligibility and exact run scope; source updates reconsider completed work',async()=>{
 const f=await atomicFixture();try{
  assert.equal(await f.selection(f.first.article_id),undefined);assert.equal((await f.run('different-run')).more,false)
  await f.db.query("update articles set reader_state='eligible',source_status='withdrawn' where id=$1",[f.pending]);assert.ok(await f.selection());assert.equal((await f.run()).report.privateCompletions,1)
  assert.equal(await f.selection(),undefined);await f.db.query("update articles set body_text='Explicit changed private withdrawn source bytes.' where id=$1",[f.pending]);assert.ok(await f.selection());assert.equal((await f.run()).report.privateCompletions,1)
  assert.equal(await f.scalar('select count(*)::int from mip_private.legacy_extraction_completions where article_id=$1',[f.pending]),2)
  record('private eligibility and source-version reconsideration',f,{completion_count:2})
 }finally{await f.close()}
})

async function prepareReviewed(f){
 await f.db.query("update articles set reader_state='pending_review' where id=$1",[f.first.article_id]);await f.run(null)
 const c=(await f.db.query('select * from mip_private.legacy_extraction_completions where article_id=$1',[f.first.article_id])).rows[0]
 await f.db.query("update articles set reader_state='eligible' where id=$1",[f.first.article_id]);const version=await f.bindArticle(f.first)
 const reviewedEntity=await f.scalar("insert into entities(canonical_name,normalized_name,entity_type) values('Vessel','vessel','other') returning id")
 const plan={review_ref:'synthetic-explicit-legacy-review',entities:[{entity_id:reviewedEntity,article_claim_id:f.article_claim_id,surface:'vessel',role:'subject',confidence:1}],citations:[{article_claim_id:f.article_claim_id,cited_entity:'source',cited_type:'prior_reporting',documentation_strength:1}]}
 const invoke=(overrides={},role='postgres')=>f.roleCall(role,'select public.mip_legacy_reviewed_completion_v1($1,$2,$3,$4,$5::jsonb)',[overrides.version??version,overrides.capture??c.capture_id,overrides.hash??c.capture_hash,overrides.completion??c.completion_id,JSON.stringify(overrides.plan??plan)])
 return{c,version,plan,invoke}
}

test('only publication owner applies explicit exact admitted evidence links, with no canonical entity or source writes',async()=>{
 const f=await atomicFixture();try{
  const r=await prepareReviewed(f),before=await f.state();await assert.rejects(r.invoke({},'service_role'),/permission denied/);await assert.rejects(r.invoke({},'anon'),/permission denied/)
  const id=await r.invoke();assert.equal(await r.invoke(),id);const after=await f.state();assert.deepEqual(after.articles,before.articles);assert.deepEqual(after.entities,before.entities)
  assert.equal(await f.scalar('select count(*)::int from article_entities where article_id=$1',[f.first.article_id]),1);assert.equal(await f.scalar('select count(*)::int from mip_private.legacy_reviewed_completions'),1)
  assert.equal((await f.readArticle(f.first.article_id)).public_version_id,r.version)
  record('exact owner-reviewed derived application',f,{public_version_id:r.version,review_completion_id:id,article_and_entities_unchanged:true})
 }finally{await f.close()}
})

test('reviewed completion denies wrong capture/hash, unrelated evidence and stale newer public version before any mutation',async()=>{
 const f=await atomicFixture();try{
  const r=await prepareReviewed(f),before=await f.state(),counts=await f.counts()
  await assert.rejects(r.invoke({hash:'0'.repeat(64)}),/exact reviewed admitted/)
  await assert.rejects(r.invoke({capture:f.second.capture_id}),/exact reviewed admitted/)
  await assert.rejects(r.invoke({plan:{...r.plan,entities:[{...r.plan.entities[0],article_claim_id:'00000000-0000-4000-8000-000000000001'}]}}),/exact admitted evidence/)
  await assert.rejects(r.invoke({plan:{...r.plan,entities:[{...r.plan.entities[0],surface:'Unmentioned person'}]}}),/invalid reviewed entity/)
  await f.bindArticle(f.first,{review:'synthetic-newer-review',predecessor:r.version,reason:'Synthetic explicit successor fixture'})
  await assert.rejects(r.invoke(),/exact reviewed admitted/);assert.deepEqual(await f.state(),before);assert.deepEqual(await f.counts(),counts)
  record('reviewed capture/hash/evidence/newest-head CAS denial',f,{public_version_id:r.version})
 }finally{await f.close()}
})

test('reviewed completion rolls back preceding deletes and inserts when final receipt fails',async()=>{
 const f=await atomicFixture();try{
  const r=await prepareReviewed(f);await f.db.exec("create function public.fixture_deny_reviewed_completion() returns trigger language plpgsql as $$begin raise exception 'forced final reviewed receipt failure';end$$;create trigger fixture_deny_reviewed_completion before insert on mip_private.legacy_reviewed_completions for each row execute function public.fixture_deny_reviewed_completion();")
  const before=await f.state(),counts=await f.counts();await assert.rejects(r.invoke(),/forced final reviewed receipt failure/);assert.deepEqual(await f.state(),before);assert.deepEqual(await f.counts(),counts)
  record('owner-reviewed derived and receipt whole transaction rollback',f,{rolled_back:true})
 }finally{await f.close()}
})

test('new narrow owner has no service membership, browser execution or shared canonical mutation privilege',async()=>{
 const f=await atomicFixture();try{
  const roles=(await f.db.query("select rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname='mip_legacy_completion_owner'")).rows[0];assert.ok(Object.values(roles).every(x=>x===false))
  for(const role of ['anon','authenticated','service_role'])assert.equal(await f.scalar("select pg_has_role($1,'mip_legacy_completion_owner','MEMBER')",[role]),false)
  assert.equal(await f.scalar("select has_table_privilege('service_role','articles','UPDATE')"),false)
  for(const col of ['title','body_text','claims','reader_state','source_status','entities_extracted_at'])assert.equal(await f.scalar("select has_column_privilege('mip_legacy_completion_owner','articles',$1,'UPDATE')",[col]),false)
  assert.equal(await f.scalar("select has_column_privilege('mip_legacy_completion_owner','articles','id','UPDATE')"),true)
  for(const table of ['entities','article_entities','citations'])assert.equal(await f.scalar("select has_table_privilege('mip_legacy_completion_owner',$1,'INSERT')",[table]),false)
  for(const role of ['anon','authenticated'])await assert.rejects(f.roleCall(role,"select public.mip_legacy_extraction_v1('read_pending',$1::jsonb)",[JSON.stringify({run_tag:null,limit:25,extractor_version:EXTRACTOR})]),/permission denied/)
  assert.equal(await f.scalar("select has_schema_privilege('mip_legacy_completion_owner','mip_private','CREATE')"),false)
  await assert.rejects(f.roleCall('service_role','select count(*) from mip_private.legacy_extraction_completions'),/permission denied/)
  record('exact least privilege source role and default browser denial',f,{roles,service_article_update:false})
 }finally{await f.close()}
})

test('catalog drift rejects install atomically and exact additions preserve unrelated overload owner/ACL',async()=>{
 const f=await atomicFixture({install:false});try{
  await f.db.exec("create function public.mip_legacy_extraction_v1(integer) returns integer language sql as $$select $1$$;revoke all on function public.mip_legacy_extraction_v1(integer) from public;grant execute on function public.mip_legacy_extraction_v1(integer) to anon;")
  const before=(await f.db.query("select proowner,proacl::text from pg_proc where oid='public.mip_legacy_extraction_v1(integer)'::regprocedure")).rows[0]
  await f.db.exec('set search_path=pg_catalog');const catalog=await f.scalar(await legacyAtomicCatalogQuery());await f.db.query("select set_config('mip.legacy_atomic_expected_catalog',$1,false)",[JSON.stringify(catalog)])
  await f.db.exec('alter table public.articles add column fixture_catalog_drift text')
  await assert.rejects(f.db.exec(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')),/baseline missing or drifted/);await f.db.exec('rollback;reset search_path')
  assert.equal(await f.scalar("select count(*)::int from pg_roles where rolname='mip_legacy_completion_owner'"),0)
  // Refresh is explicit fixture owner pinning, not a deploy installer shortcut.
  const {installLegacyAtomicCompletionFixture}=await import('../scripts/legacyAtomicCompletionPackage.mjs');await installLegacyAtomicCompletionFixture(f.db)
  assert.deepEqual((await f.db.query("select proowner,proacl::text from pg_proc where oid='public.mip_legacy_extraction_v1(integer)'::regprocedure")).rows[0],before)
  record('expected catalog drift denied; unrelated overload ACL/owner preserved',f,{unrelated_overload_unchanged:true})
 }finally{await f.close()}
})

test('pending native job collision fails closed without stealing native leases or creating a second capture engine',async()=>{
 const f=await atomicFixture();try{
  const a=(await f.db.query('select * from articles where id=$1',[f.pending])).rows[0]
  const job=await f.rpc('enqueue',{run_id:'synthetic-unfinished-native-owner',article:{url:a.url,title:a.title,outlet:a.outlet,summary:a.summary,body_text:a.body_text,published_at:a.published_at}})
  const before=await f.state(),counts=await f.counts(),r=await f.run();assert.match(r.report.errors[0],/native source capture job already exists/);assert.equal(r.more,false);assert.deepEqual(await f.counts(),counts);assert.deepEqual(await f.state(),before)
  assert.equal(await f.scalar('select state from evidence_pipeline.import_jobs where id=$1',[job]),'pending')
  record('unfinished native capture owner retained; no alternate engine',f,{native_job:job,stolen_leases:0})
 }finally{await f.close()}
})

test('exact guarded rollback stops service RPC while retaining every receipt/capture and unrelated overload',async()=>{
 const f=await atomicFixture();try{
  await f.run();await f.db.exec("create function public.mip_legacy_extraction_v1(integer) returns integer language sql as $$select $1$$;revoke all on function public.mip_legacy_extraction_v1(integer) from public;grant execute on function public.mip_legacy_extraction_v1(integer) to anon;")
  const before=await f.state(),counts=await f.counts(),overload=(await f.db.query("select proowner,proacl::text from pg_proc where oid='public.mip_legacy_extraction_v1(integer)'::regprocedure")).rows[0]
  const {legacyAtomicInstalledCatalogQuery}=await import('../scripts/legacyAtomicCompletionPackage.mjs')
  await f.db.exec('set search_path=pg_catalog');const catalog=await f.scalar(await legacyAtomicInstalledCatalogQuery())
  const rollback=await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/rollback.sql',import.meta.url),'utf8')
  await assert.rejects(f.db.exec(rollback),/rollback catalog missing or drifted/);await f.db.exec('rollback')
  await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify({...catalog,roles:[]})]);await assert.rejects(f.db.exec(rollback),/rollback catalog missing or drifted/);await f.db.exec('rollback')
  await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify(catalog)]);await f.db.exec(rollback);await f.db.exec('reset search_path')
  await assert.rejects(f.run(),/private legacy selection.*permission denied/);assert.deepEqual(await f.state(),before);assert.deepEqual(await f.counts(),counts)
  assert.deepEqual((await f.db.query("select proowner,proacl::text from pg_proc where oid='public.mip_legacy_extraction_v1(integer)'::regprocedure")).rows[0],overload)
  record('exact revoke-only rollback keeps private/native audit history',f,{history_retained:true,unrelated_overload_unchanged:true})
 }finally{await f.close()}
})
