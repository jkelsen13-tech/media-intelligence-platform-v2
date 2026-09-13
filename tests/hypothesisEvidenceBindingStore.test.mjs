import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
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
 const boundStore=createHypothesisStore((...args)=>db.query(...args))
 let boundRequest,boundFirst
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

 await t.test('bound acceptance persists revision and metadata receipt atomically and closes primitive gateway bypass',async()=>{
  await db.exec(await read('supabase/qualification/hypothesis-assessments/003_bound_acceptance.sql'))
  boundRequest={verifiedUserId:user,investigationId:iid,workspaceVersionId:vid,sourceProject:base.source_project,
   requestId:randomUUID(),predecessorId:null,assessment:r}
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(boundStore.append(boundRequest),/permission denied/)
  boundFirst=await boundStore.appendBound(boundRequest)
  assert.equal(boundFirst.current_context,true);assert.equal(boundFirst.publication_allowed,false)
  assert.deepEqual(await boundStore.appendBound(boundRequest),boundFirst)
  await db.exec('reset role')
  const receipt=(await db.query('select metadata from mip_hypothesis.acceptance_bindings where revision_id=$1',[boundFirst.assessment.id])).rows[0].metadata
  assert.equal(receipt.length,1);assert.equal(receipt[0].permissions.length,6)
  assert.doesNotMatch(JSON.stringify(receipt),/meeting record|😀 B/)
 })
 await t.test('atomic acceptance cannot favor an allegation without a supporting argument',async()=>{
  const next=structuredClone(boundRequest)
  next.requestId=randomUUID()
  next.assessment.comparison.state='better_supported';next.assessment.comparison.favored_ids=['influence']
  next.assessment.arguments[0].relation='reports_allegation'
  await assert.rejects(boundStore.appendBound(next),/requires a supporting argument/)
  assert.equal((await db.query('select count(*)::int n from mip_hypothesis.revisions')).rows[0].n,1)
 })
 await t.test('historical transport verifies identity and reads only currently permitted bound revisions',async()=>{
  await db.exec(await read('supabase/qualification/hypothesis-assessments/004_bound_history.sql'))
  const handler=createHypothesisHandler({authenticate:async()=>({id:user,is_anonymous:false}),store:boundStore,
   sourceProject:base.source_project,allowedOrigins:['https://example.org']})
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(boundStore.history({verifiedUserId:user,investigationId:iid}),/permission denied/)
  const response=await handler(new Request('https://example.org/hypothesis',{method:'POST',headers:{
   authorization:'Bearer synthetic-test-only','content-type':'application/json',origin:'https://example.org'},
   body:JSON.stringify({action:'history',input:{investigation_id:iid}})}))
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store')
  const payload=await response.json()
  assert.deepEqual(payload.data.entries[0].assessment,boundFirst.assessment)
  assert.equal(payload.data.historical_commit_visibility_qualified,false)
  await db.exec('reset role')
 })
 await t.test('outer rollback removes assessment and acceptance receipt together',async()=>{
  const next=structuredClone(boundRequest)
  Object.assign(next.assessment,{id:'pending-next',revision:2,predecessor_id:boundFirst.assessment.id,revision_trigger:'methodology',revision_effect:'unchanged'})
  next.predecessorId=boundFirst.assessment.id;next.requestId=randomUUID()
  await db.exec('begin')
  const result=await boundStore.appendBound(next)
  await db.exec('rollback')
  assert.equal((await db.query('select count(*)::int n from mip_hypothesis.revisions where id=$1',[result.assessment.id])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from mip_hypothesis.acceptance_bindings where revision_id=$1',[result.assessment.id])).rows[0].n,0)
 })
 await t.test('out-of-scope source does not invalidate the saved question; changed watched source requires reassessment',async()=>{
  async function captureAgain(url,summary) {
   await intake('enqueue',{run_id:'hypothesis-change-synthetic',article:{url,title:'Synthetic source change',summary,outlet:'Synthetic',published_at:'2026-08-01'}})
   const j=await intake('claim');return intake('finish',{job_id:j.id,lease_token:j.lease_token})
  }
  await captureAgain('https://example.org/unrelated-hypothesis-source','Unrelated synthetic record.')
  assert.equal((await boundStore.appendBound(boundRequest)).current_context,true)
  await captureAgain('https://example.org/hypothesis-synthetic','A corrected synthetic meeting record.')
  const recovered=await boundStore.appendBound(boundRequest)
  assert.deepEqual(recovered.assessment,boundFirst.assessment)
  assert.equal(recovered.current_context,false);assert.equal(recovered.reassessment_pending,true)
  const history=await boundStore.boundHistory({verifiedUserId:user,investigationId:iid})
  assert.equal(history.entries[0].current_context,false)
  assert.equal(history.entries[0].reassessment_pending,true)
  assert.deepEqual(history.entries[0].assessment,boundFirst.assessment)
  const next=structuredClone(boundRequest)
  Object.assign(next.assessment,{id:'pending-next',revision:2,predecessor_id:boundFirst.assessment.id,revision_trigger:'correction',revision_effect:'less_certain'})
  next.predecessorId=boundFirst.assessment.id;next.requestId=randomUUID()
  await assert.rejects(boundStore.appendBound(next),/context changed/)
  assert.equal((await db.query('select count(*)::int n from mip_hypothesis.revisions')).rows[0].n,1)
 })
 await t.test('new permission revision cannot automatically restore an old assessment display',async()=>{
  const old=(await db.query("select * from mip_identity.operation_evidence_versions where scope->>'operation'='analysis' and scope->>'domain'='rights'")).rows[0]
  const replacement=randomUUID()
  await db.query("insert into mip_identity.operation_evidence_versions select $1,scope,authority_adapter,source_ref,source_version,source_hash,evidence_ref,approval_owner_ref,approval_record_ref,approval_status,disposition,effective_at,expires_at,conditions,synthetic from mip_identity.operation_evidence_versions where revision=$2",[replacement,old.revision])
  await db.query('update mip_identity.operation_evidence_heads set revision=$1 where revision=$2',[replacement,old.revision])
  const history=await boundStore.boundHistory({verifiedUserId:user,investigationId:iid})
  assert.equal(history.entries[0].status,'withheld')
  assert.equal(history.entries[0].reason,'permission_binding_changed_fresh_review_required')
  assert.equal(Object.hasOwn(history.entries[0],'assessment'),false)
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
  const history=await boundStore.boundHistory({verifiedUserId:user,investigationId:iid})
  assert.equal(history.entries[0].status,'withheld')
  assert.equal(Object.hasOwn(history.entries[0],'assessment'),false)
  await db.exec('reset role')
  await workspace('set_access',{investigation_id:iid,user_id:user,access_role:'revoked',reason:'Synthetic negative test.'})
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(binding(),/read denied/)
  await db.exec('reset role')
 })
})
