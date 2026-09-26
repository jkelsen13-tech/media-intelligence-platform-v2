import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {createDisposableDb,loadQikIngest,createPipelineRpc} from './qikIngestTestKit.mjs'
import {enqueueObserved,drainNativePipeline} from '../supabase/qualification/qik-ingest/nativeHandoff.mjs'
import {processGenerationClaim} from '../supabase/functions/source-comparison-generation-candidate/workerV2.js'
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const root = 'supabase/qualification/'
const impl = 'native-capture-lineage-test-v1'
const sentence = 'Officials reportedly approved the council funding proposal on Tuesday.'
const hash = value => createHash('sha256').update(value).digest('hex')

async function fixture(t,{replaceBefore=false}={}) {
 const {db,exec}=await createDisposableDb()
 t.after(()=>db.close())
 await loadQikIngest(exec)
 await db.exec(await read(root+'comparison-generations/contract.sql'))
 await db.exec(await read(root+'comparison-generations/source-snapshot.sql'))
 await db.exec(`create table public.events(id uuid primary key,canonical_title text,status text,
  comparison_validation_state text,occurred_at_start date,occurred_at_end date);
  create table public.event_articles(event_id uuid,article_id uuid,membership_method text);
  insert into public.events values('00000000-0000-4000-8000-000000000001',
  'Council decision','active','approved','2026-01-01','2026-01-01');`)
 const pipeline=createPipelineRpc(db), articles=[]
 for (const outlet of ['A','B']) {
  const article={url:'https://news.example/c7-'+outlet,outlet,title:sentence,summary:sentence,
   body_text:null,published_at:null}
  const job=await enqueueObserved({pipelineRpc:pipeline,runId:'native-c7-'+outlet,article})
  const [done]=await drainNativePipeline({pipelineRpc:pipeline,jobIds:[job]})
  const extraction=await pipeline.extractCapture({job_id:job,capture_id:done.capture_id})
  assert.equal(extraction.state,'candidates_retained')
  articles.push({...done,article})
  await db.query("insert into public.event_articles values('00000000-0000-4000-8000-000000000001',$1,'reviewed')",[done.article_id])
 }
 const superseded=[]
 if(replaceBefore) {
  const old=(await db.query('select * from evidence_pipeline.evidence_candidates where capture_id=$1',[articles[0].capture_id])).rows[0]
  const {id,created_at,review_state,...candidate}=old
  const successor=await pipeline('candidate',{...candidate,predecessor_candidate_id:id,
   extractor_version:candidate.extractor_version+':next'})
  superseded.push({article_id:articles[0].article_id,id,successor})
 }
 const snapshot=()=>db.query('select comparison_qualification.source_snapshot($1::jsonb,$2) r',
  [JSON.stringify({entries:[]}),impl]).then(r=>r.rows[0].r)
 const input=await snapshot()
 const generation=(await db.query("select comparison_qualification.enqueue('qik-test',$1::jsonb,$2,clock_timestamp()) id",
  [JSON.stringify(input),impl])).rows[0].id
 const claim=(await db.query('select comparison_qualification.claim() r')).rows[0].r
 const rpc=async(name,args)=>{
  if(name==='worker_complete')return(await db.query('select comparison_qualification.complete($1,$2,$3,$4,$5::jsonb) r',
   [args.p_generation,args.p_token,args.p_input_hash,args.p_implementation,JSON.stringify(args.p_output)])).rows[0].r
  if(name==='worker_fail')return(await db.query('select comparison_qualification.fail($1,$2,$3,$4) r',
   [args.p_generation,args.p_token,args.p_input_hash,args.p_implementation])).rows[0].r
  throw Error('unexpected test RPC')
 }
 assert.equal((await processGenerationClaim({rpc,requestId:()=>randomUUID(),session:'test',runtime:'test',
  implementation:impl,sha256:hash},claim)).state,'completed')
 const output=(await db.query('select output_payload from comparison_qualification.outputs where generation_id=$1',[generation])).rows[0].output_payload
 const evidence=output.projection.article_claims.map(surface=>{
  const member=input.eventInputs.flatMap(e=>e.members).find(m=>m.article.id===surface.article_id)
  const cap=member.retained_capture,k=cap.candidates.find(c=>c.excerpt===surface.surface_text)
  assert.ok(k)
  return {article_id:surface.article_id,claim_key:surface.claim_key,candidate_id:k.candidate_id,
   capture_id:cap.capture_id,content_hash:cap.content_hash,field:k.source_field,
   span_start:k.span_start,span_end:k.span_end,excerpt:k.excerpt,
   field_hash:hash(cap.payload[k.source_field]),auditability_state:'verified_retained_source'}
 })
 const check=(i=input,o=output,e=evidence)=>db.query(
  'select comparison_qualification.check_native_review_lineage($1::jsonb,$2::jsonb,$3::jsonb)',
  [JSON.stringify(i),JSON.stringify(o),JSON.stringify(e)])
 return {db,pipeline,articles,input,output,evidence,check,snapshot,superseded}
}

test('native retain/extract identities survive fenced generation without publication',async t=>{
 const f=await fixture(t)
 assert.equal(f.output.retained_lineage.length,2)
 assert.equal(f.output.lineage_review_state,'pending')
 await f.check()
 for(const lineage of f.output.retained_lineage) {
  assert.equal(lineage.retained_capture.review_state,'pending')
  assert.equal(lineage.retained_capture.candidates.length,1)
 }
 assert.equal((await f.db.query("select count(*)::int n from public.articles where reader_state='eligible'")).rows[0].n,0)
 assert.equal((await f.db.query("select count(*)::int n from public.articles where claims<>'[]'::jsonb")).rows[0].n,0)
 assert.equal((await f.db.query("select count(*)::int n from evidence_pipeline.evidence_candidates where review_state<>'pending'")).rows[0].n,0)
})

test('generation evidence rejects wrong candidate/capture/hash/span/article and pending-state relabeling',async t=>{
 const f=await fixture(t)
 for(const mutation of [
  e=>{e[0].candidate_id=randomUUID()},
  e=>{e[0].capture_id=randomUUID()},
  e=>{e[0].content_hash='0'.repeat(64)},
  e=>{e[0].span_start++},
  e=>{e[0].span_end--},
  e=>{e[0].article_id=randomUUID()},
  e=>{e[0].excerpt='Different source text'},
 ]) {
  const e=structuredClone(f.evidence);mutation(e)
  await assert.rejects(f.check(f.input,f.output,e),/mip_native_review_span_unbound/)
 }
 const unbound=structuredClone(f.output)
 unbound.retained_lineage[0].retained_capture.content_hash='0'.repeat(64)
 await assert.rejects(f.check(f.input,unbound),/mip_native_generation_lineage_mismatch/)
 const promoted=structuredClone(f.output);promoted.lineage_review_state='accepted'
 await assert.rejects(f.check(f.input,promoted),/mip_native_generation_lineage_mismatch/)
})

test('new native capture invalidates old generation even when reviewed article has not changed',async t=>{
 const f=await fixture(t),first=f.articles[0]
 const job=await enqueueObserved({pipelineRpc:f.pipeline,runId:'native-c7-revision',
  article:{...first.article,summary:'The council decision remains under review according to a later report.'}})
 await drainNativePipeline({pipelineRpc:f.pipeline,jobIds:[job]})
 await assert.rejects(f.check(),/mip_native_capture_stale/)
 const next=await f.snapshot()
 assert.notEqual(next.eventInputs[0].members.find(m=>m.article.id===first.article_id).retained_capture.capture_id,
  f.input.eventInputs[0].members.find(m=>m.article.id===first.article_id).retained_capture.capture_id)
 assert.equal((await f.db.query('select summary from public.articles where id=$1',[first.article_id])).rows[0].summary,sentence)
})

test('missing native lineage cannot become review evidence and private mechanism is browser-denied',async t=>{
 const f=await fixture(t)
 const input=structuredClone(f.input),output=structuredClone(f.output)
 input.eventInputs[0].members[0].retained_capture=null
 output.retained_lineage[0].retained_capture=null
 await assert.rejects(f.check(input,output),/mip_native_capture_binding_missing/)
 await f.db.exec('set role anon')
 await assert.rejects(f.check(),/permission denied|42501/)
 await f.db.exec('reset role')
 // Actual extension refuses to replace a missing factual/permission review chain.
 await assert.rejects(f.db.exec(await read(root+'mip-cutover-authority/017_native_capture_review.sql')),
  /mip_native_review_prerequisites_missing/)
 await f.db.exec('rollback')
})

test('replacement before generation excludes superseded candidate from reviewable lineage',async t=>{
 const f=await fixture(t,{replaceBefore:true}),old=f.superseded[0]
 await f.check()
 const member=f.input.eventInputs[0].members.find(m=>m.article.id===old.article_id)
 assert.deepEqual(member.retained_capture.candidates.map(k=>k.candidate_id),[old.successor])
 const evidence=structuredClone(f.evidence)
 evidence.find(e=>e.article_id===old.article_id).candidate_id=old.id
 await assert.rejects(f.check(f.input,f.output,evidence),/mip_native_review_span_unbound/)
})
