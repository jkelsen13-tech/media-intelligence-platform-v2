import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {bindHypothesisEvidence} from '../supabase/qualification/hypothesis-assessments/evidenceBinding.mjs'
const hash=s=>createHash('sha256').update(s).digest('hex')
test('hypothesis binding uses real workspace tables and existing operation-check implementation with synthetic permission records',async t=>{
 const db=await PGlite.create();t.after(()=>db.close())
 const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
 await db.exec(await read('tests/changeQueueFixture.sql'))
 await db.exec('create table public.mip_profiles(id uuid primary key)')
 const user=randomUUID(),outsider=randomUUID()
 await db.query('insert into public.mip_profiles values($1),($2)',[user,outsider])
 const files=await readdir(new URL('../supabase/migrations/',import.meta.url))
 for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1','investigation_workspace_batch_v1']){
  const found=files.filter(f=>f.endsWith('_'+suffix+'.sql'));assert.equal(found.length,1)
  await db.exec(await read('supabase/migrations/'+found[0]))
 }
 const rpc=name=>(action,input={})=>db.query('select public.'+name+'($1,$2::jsonb) r',[action,JSON.stringify(input)]).then(r=>r.rows[0].r)
 const intake=rpc('mip_pipeline_v1'),assess=rpc('mip_assessments_v1'),observe=rpc('mip_investigation_briefings_v1'),workspace=rpc('mip_investigation_workspace_v1')
 await intake('enqueue',{run_id:'hypothesis-synthetic',article:{url:'https://example.org/hypothesis-synthetic',title:'Synthetic meeting record',summary:'A 😀 B meeting record.',outlet:'Synthetic',published_at:'2026-08-01'}})
 const job=await intake('claim'),capture=await intake('finish',{job_id:job.id,lease_token:job.lease_token})
 const candidate=await intake('candidate',{capture_id:capture.capture_id,candidate_key:'synthetic',candidate_kind:'claim',
  statement:'A 😀 B meeting record.',source_field:'summary',span_start:0,span_end:21,excerpt:'A 😀 B meeting record.',
  extractor_version:'synthetic',remaining_uncertainty:'Synthetic mechanism only.'})
 const context=await assess('context',{candidate_id:candidate})
 const existing=await assess('append',{candidate_id:candidate,algorithm_key:'synthetic',algorithm_version:'v1',outcome:'insufficient_evidence',
  rationale:'Synthetic.',remaining_uncertainty:'Synthetic.',context_positions:context.context_positions})
 const obs=await observe('observe',{observation_id:randomUUID(),candidate_ids:[candidate]})
 const iid=randomUUID(),vid=randomUUID()
 const state={question:'What explains the fictional contract award?',scope_note:'Synthetic only.',canonical_subject:null,
  time_range:{from:null,to:null,meaning:'Not established.'},unresolved_questions:[],hypotheses:[],commitments:[],coverage:[]}
 await workspace('put',{investigation_id:iid,version_id:vid,previous_version_id:null,observation_id:obs.id,state,change_reason:'Synthetic.'})
 await workspace('set_access',{investigation_id:iid,user_id:user,access_role:'reviewer',reason:'Synthetic fixture assignment.'})
 await db.exec(await read('supabase/qualification/hypothesis-assessments/001_revision_store.sql'))
 // Use the frozen operation-check function and its actual evidence/head table definitions.
 // No real grants or CC activation: only explicit synthetic-fixture-v1 records below.
 const policy=await read('supabase/qualification/mip-cutover-authority/008_operation_evidence.sql')
 await db.exec('create schema mip_identity;create schema mip_cutover_authority;create table mip_cutover_authority.publication_fence(id boolean primary key);insert into mip_cutover_authority.publication_fence values(true)')
 await db.exec(policy.slice(policy.indexOf('create table mip_identity.operation_evidence_versions'),policy.indexOf('create table mip_identity.review_operation_bindings')))
 await db.exec(policy.slice(policy.indexOf('create function mip_identity.operation_check'),policy.indexOf('alter function mip_identity.validate_review')))
 await db.exec(await read('supabase/qualification/hypothesis-assessments/002_retained_observation_reader.sql'))
 const binding=async(uid=user)=>db.query('select mip_hypothesis.observation_binding($1,$2,$3) r',[uid,iid,vid]).then(r=>r.rows[0].r)
 let bundle,r,base
 await t.test('database reader derives exact native hashes while omitting all source text',async()=>{
  await db.exec('set role mip_hypothesis_gateway')
  bundle=await binding()
  assert.doesNotMatch(JSON.stringify(bundle),/meeting record|body_text|summary|Synthetic meeting/)
  const entry=bundle.observation.snapshot.inputs.find(i=>i.capture)
  assert.match(entry.capture.source_version_hash,/^[0-9a-f]{64}$/)
  r=hypothesisFixture();r.question_id=iid;r.question=state.question
  r.knowledge_cutoff=(await db.query(`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as value`)).rows[0].value;r.completed_at=r.knowledge_cutoff
  Object.assign(r.evidence[0],{input_position:entry.position,material_version:entry.capture.id,acquired_at:entry.capture.captured_at,
   published_at:entry.capture.payload.published_at??null,event_time:null,
   source_span:{source_field:'summary',start:2,end:5,excerpt_sha256:hash('😀 B')}})
  base={source_project:'synthetic-hypothesis-source',material_ref:'capture:'+entry.capture.id,
   material_version:entry.capture.source_version_hash,source_version:entry.capture.id,audience:'isolated_internal_review'}
  await assert.rejects(binding(outsider),/read denied/)
  await db.exec('reset role')
 })
 const getExcerpt=async({position,span,sourceProject})=>(await db.query('select mip_hypothesis.retained_excerpt($1,$2,$3,$4,$5,$6,$7,$8,$9) r',
  [user,iid,vid,position,sourceProject,span.source_field,span.start,span.end,span.excerpt_sha256])).rows[0].r
 await t.test('missing permission prevents database passage disclosure',async()=>{
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(getExcerpt({position:r.evidence[0].input_position,span:r.evidence[0].source_span,sourceProject:base.source_project}),/operation denied/)
  await db.exec('reset role')
 })
 await t.test('six explicit synthetic operation scopes permit only the exact internal span',async()=>{
  for(const operation of ['retention','analysis','excerpt_display']) for(const domain of ['rights','privacy']){
   const scope={...base,operation,domain},revision=randomUUID()
   await db.query(`insert into mip_identity.operation_evidence_versions values($1,$2,'synthetic-fixture-v1','synthetic-policy','v1',$3,
    'synthetic-evidence','synthetic-owner','synthetic-approval','recorded','allow','2000-01-01','2999-01-01','[]',true)`,[revision,JSON.stringify(scope),hash('synthetic policy')])
   await db.query('insert into mip_identity.operation_evidence_heads values($1,$2,true)',[JSON.stringify(scope),revision])
  }
  const readPermission=async scope=>(await db.query('select mip_hypothesis.operation_permission($1,$2,$3,$4,$5,$6,$7) r',
   [user,iid,vid,r.evidence[0].input_position,scope.source_project,scope.operation,scope.domain])).rows[0].r
  await db.exec('set role mip_hypothesis_gateway')
  const prepared=await bindHypothesisEvidence({assessment:r,bundle,sourceProject:base.source_project,readPermission,hashText:hash,
   mode:'synthetic_qualification',readExcerpt:getExcerpt})
  assert.equal(prepared.bindings[0].excerpt,'😀 B');assert.equal(prepared.bindings[0].permissions.length,6)
  assert.equal(prepared.status,'prepared_requires_atomic_acceptance')
  const response=await getExcerpt({position:r.evidence[0].input_position,span:r.evidence[0].source_span,sourceProject:base.source_project})
  assert.equal(response.excerpt,'😀 B')
  await assert.rejects(getExcerpt({position:r.evidence[0].input_position,span:r.evidence[0].source_span,sourceProject:'cc-definition-batch-v1'}),/source scope unavailable/)
  await db.exec('reset role')
 })
 await t.test('repeatable-read cannot reuse an older membership snapshot',async()=>{
  await db.exec('begin isolation level repeatable read')
  await assert.rejects(binding(),/requires read committed/)
  await db.exec('rollback')
 })
 await t.test('revoked privacy evidence and revoked membership independently deny subsequent content reads',async()=>{
  await db.query("update mip_identity.operation_evidence_heads set active=false where scope->>'domain'='privacy'")
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(getExcerpt({position:r.evidence[0].input_position,span:r.evidence[0].source_span,sourceProject:base.source_project}),/operation denied/)
  await db.exec('reset role')
  await workspace('set_access',{investigation_id:iid,user_id:user,access_role:'revoked',reason:'Synthetic negative test.'})
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(binding(),/read denied/)
  await db.exec('reset role')
 })
})
