// Source-authored full-backend synthetic constructor. NOT RUN by its author.
// No service, installation, credential delivery, or real source is created here.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto'
import {createRetainedExtractionBackend,extractRetainedCapture} from '../supabase/qualification/collector-native-capture/retainedExtraction.mjs'
import {issueWorkloadSession} from '../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {runQikJournaledWorker} from '../supabase/functions/source-comparison-generation-candidate/qikWorkerJournal.js'
import {scoreGovernedNativeInput} from '../supabase/qualification/arc-membership-native/runGovernedNativeArc.mjs'
import {assertNativeComparisonBinding} from './nativeComparisonBindingAssertions.mjs'

const sentence='Officials reportedly approved the council funding proposal on Tuesday.'
const hash=x=>createHash('sha256').update(x,'utf8').digest('hex')
const quote=x=>{assert.match(x,/^[a-z][a-z0-9_]{0,62}$/);return '"'+x+'"'}
const value=async(c,q,args=[])=>(await c.query(q,args)).rows[0].result
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const fixtureFailures=new WeakMap()
export const nativeComparisonFixtureDiagnostic=error=>error&&typeof error==='object'?fixtureFailures.get(error)??null:null
const bindingRefusal=/^native_comparison_check_[1-6]_(?:dual_authority_and_actual_binding|exact_retry_and_real_event_mismatch|metadata_only_original_identity|current_both_sides_refuse_real_revocation|direct_wrapper_and_final_acl_boundary|append_only_local_revocation_no_publication)_sqlstate_(?:[A-Z0-9]{5}|NONE)_frames_(?:(?:nativeComparisonBindingAssertions\.mjs|nativeArcCohortPostgres17\.test\.mjs):[0-9]{1,6}:[0-9]{1,6}(?:,(?:nativeComparisonBindingAssertions\.mjs|nativeArcCohortPostgres17\.test\.mjs):[0-9]{1,6}:[0-9]{1,6}){0,3})?$/
const diagnostic=(error,stage)=>({
 stage,sqlstate:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE',
 binding_check:bindingRefusal.test(error?.message??'')?error.message:null,
 frames:String(error?.stack??'').split('\n').slice(1).flatMap(line=>{
  const m=line.match(/(?:nativeComparisonBindingFixture\.mjs|nativeComparisonBindingAssertions\.mjs|brokerSession\.js|workloadIdentity\.js|qikWorkerJournal\.js|durableWorker\.js|workerV2\.js):\d{1,6}:\d{1,6}/)
  return m?[m[0]]:[]
 }).slice(0,4)
})
// Closed dispatch: function identifiers and argument order never come from data.
const workerCalls=Object.freeze({
 worker_claim:['p_request','p_session','p_runtime'],
 worker_complete:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation','p_output'],
 worker_fail:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation'],
 worker_journal_put:['p_session','p_runtime','p_key','p_entry'],
 worker_journal_get:['p_session','p_runtime','p_key'],
 worker_journal_pending:['p_session','p_runtime','p_after','p_limit'],
 worker_resume_claim:['p_session','p_runtime','p_key']
})
export async function runNativeComparisonBindingFixture(fx){
 if(fx.syntheticFixture!==true||typeof fx.connect!=='function'||typeof fx.id!=='function')
  throw Error('native_comparison_fixture_guard')
 const {db,reviewer,sameReviewer,gateway,outsider,worker,admin,scope,id,connect,sentinel}=fx
 const owned=[];let stage='guard',primary=null,result;const cleanup=[]
 const freshRole=async role=>{
  const c=await connect();owned.push(c)
  const original=(await c.query('select session_user::text u,current_user::text e')).rows[0]
  assert.equal(original.u,'postgres');assert.equal(original.e,'postgres')
  await c.query('set role '+quote(role))
  assert.equal((await c.query('select current_user::text u')).rows[0].u,role)
  return c
 }
 try{
  for(const key of ['MIP_NATIVE_ARC_COHORT_DISPOSABLE','MIP_QIK_COMPARISON_DISPOSABLE'])
   assert.equal(process.env[key],'synthetic-pg17-only')
  assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
  assert.equal((await db.query("select current_setting('server_version_num') v,current_database() d")).rows[0].v,'170006')
  const reviewerName=(await reviewer.query('select session_user::text u')).rows[0].u
  assert.equal((await sameReviewer.query('select session_user::text u')).rows[0].u,reviewerName)
  const workerLogins=[(await gateway.query('select session_user::text u')).rows[0].u,
   (await worker.query('select session_user::text u')).rows[0].u].sort()
  assert.equal(new Set(workerLogins).size,2)
  const broker=await freshRole('mip_identity_broker_v2')
  const producer=await freshRole('mip_comparison_producer_v1')
  const comparisonWorker=await freshRole('mip_comparison_worker_v1')
  const publisher=await freshRole('mip_projection_publisher_v1')
  const factualReviewer=await freshRole('mip_factual_reviewer_v3')
  const fieldOwner=await freshRole('mip_mentions_owner')
  // Reserved identifiers are disjoint from all earlier c650 fixture objects.
  const eventIds=[id(7000),id(7001)],arc=id(7010),node=id(7011),milestone=id(7012),candidate=id(7013)
  const runtime='synthetic-native-comparison-binding',implementation='synthetic-native-comparison-binding-v1'
  const source=(await db.query('select source from mip_identity.collector_config where id')).rows[0].source
  assert.equal(source,'qik-fixture-v1')
  const originalPayloads=[],captures=[]
  stage='original_capture_pair_sets'
  const extractionBackend=createRetainedExtractionBackend(db)
  for(let index=0;index<4;index++){
   const payload={url:'https://synthetic.invalid/native-comparison-'+index,
    title:sentence,summary:sentence,outlet:'Binding synthetic outlet '+index,
    body_text:sentence+' '+sentinel,published_at:'2026-01-02T00:00:00Z'}
   originalPayloads.push(payload)
   const job=await value(db,"select evidence_pipeline.enqueue('synthetic-native-comparison',$1::jsonb) result",[JSON.stringify(payload)])
   const claim=await value(db,'select evidence_pipeline.claim_job() result')
   assert.equal(claim.id,job)
   const done=await value(db,'select evidence_pipeline.finish_job($1,$2) result',[job,claim.lease_token])
   assert.equal(done.job_id,job)
   const cap=(await db.query('select id,job_id,article_id,content_hash from evidence_pipeline.article_captures where id=$1',[done.capture_id])).rows[0]
   assert.equal(cap.job_id,job);assert.equal(cap.article_id,done.article_id)
   const extracted=await extractRetainedCapture({backend:extractionBackend,capture_id:cap.id})
   assert.equal(extracted.state,'candidates_retained');assert.ok(extracted.candidate_ids.length>0)
   captures.push(cap)
   await db.query("update public.articles set reader_state='eligible',source_status='active' where id=$1",[cap.article_id])
  }
  assert.equal(new Set(captures.map(c=>c.article_id)).size,4)
  for(let index=0;index<2;index++){
   await db.query("insert into public.events(id,canonical_title,status,comparison_validation_state,occurred_at_start,occurred_at_end) values($1,$2,'active','approved','2026-01-02','2026-01-02')",[eventIds[index],sentence])
   for(const c of captures.slice(index*2,index*2+2))
    await db.query("insert into public.event_articles(event_id,article_id,membership_method) values($1,$2,'reviewed')",[eventIds[index],c.article_id])
  }
  // Finish every public source/context mutation before comparison/native snapshots.
  await db.query("insert into public.nodes(id,type) values($1,'institution')",[node])
  await db.query("insert into public.story_arcs(id,started_at,title,summary,last_update_at,root_node_id) values($1,'2026-01-01',$2,$2,'2026-01-02T00:00:00Z',$3)",[arc,sentence,node])
  await db.query("insert into public.arc_milestones(id,arc_id,milestone_key,status) values($1,$2,'ia_concludes','pending')",[milestone,arc])
  await db.query('update public.articles set arc_id=$1 where id=$2',[arc,captures[1].article_id])
  await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,state,updated_at) values($1,$2,$3,'pending','2026-01-02T00:00:00Z')",[candidate,captures[0].article_id,arc])

  stage='broker_configuration'
  await db.query('select mip_comparison_kernel_v1.bind_source_scope($1,$2)',[runtime,source])
  await db.query('select mip_comparison_kernel_v1.bind_evaluated_implementation($1,$2)',[runtime,implementation])
  await db.query('insert into mip_cutover_authority.runtime_config values($1,$2,$3,$4::jsonb)',[runtime,source,implementation,JSON.stringify({entries:[]})])
  for(const operation of Object.keys(workerCalls))
   await db.query('select mip_comparison_kernel_v1.bind_runtime($1,$2,$3)',[runtime,'mip_comparison_worker_v1',operation])
  await db.query('select mip_comparison_kernel_v1.bind_runtime($1,$2,$3)',[runtime,'mip_comparison_producer_v1','producer_enqueue'])
  // Only the disposable public JWK enters PostgreSQL; signing material stays in memory.
  const pair=generateKeyPairSync('rsa',{modulusLength:2048}),key=id(7020)
  const issuer='https://qualification.invalid',audience='synthetic-broker',kid='native-comparison-synthetic'
  await db.query("insert into mip_identity.key_versions values($1,$2,$3,$4::jsonb,'2000-01-01','2999-01-01','synthetic-only')",
   [key,issuer,kid,JSON.stringify(pair.publicKey.export({format:'jwk'}))])
  await db.query('insert into mip_identity.key_heads values($1,$2,$3,true)',[issuer,kid,key])
  const principals=['mip_comparison_producer_v1','mip_comparison_worker_v1','mip_projection_publisher_v1']
  for(const [index,principal] of principals.entries()){
   const mapping=id(7021+index)
   await db.query("insert into mip_identity.mapping_versions values($1,$2,$3,$4,$5,$6,$7,600,'synthetic-only')",
    [mapping,runtime,principal,issuer,audience,runtime+':'+principal,key])
   await db.query('insert into mip_identity.mapping_heads values($1,$2,$3,true)',[runtime,principal,mapping])
  }
  const brokerSQL=async(name,args)=>{
   if(name==='configuration')return value(broker,'select mip_identity.configuration($1,$2) result',args)
   if(name==='issue')return value(broker,'select mip_identity.issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',args)
   throw Error('native_comparison_broker_dispatch')
  }
  const issue=async principal=>{
   const now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
   const unsigned=encode({alg:'RS256',typ:'JWT',kid})+'.'+encode({iss:issuer,aud:audience,sub:runtime+':'+principal,iat:now,exp:now+500,jti:randomUUID()})
   const token=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),pair.privateKey).toString('base64url')
   return issueWorkloadSession({sql:brokerSQL,token,runtime,principal,request:randomUUID(),now})
  }
  const sessions={}
  for(const principal of principals)sessions[principal]=await issue(principal)

  stage='actual_journal_worker'
  const comparisonGeneration=await value(producer,'select mip_identity.capture_delta($1,$2,$3) result',
   [randomUUID(),sessions.mip_comparison_producer_v1,runtime])
  assert.ok(comparisonGeneration)
  const rpc=async(name,args)=>{
   const keys=workerCalls[name]
   if(!keys)throw Error('native_comparison_worker_dispatch')
   const params=keys.map(k=>k==='p_output'||k==='p_entry'?JSON.stringify(args[k]):args[k])
   const placeholders=keys.map((k,i)=>'$'+(i+1)+(k==='p_output'||k==='p_entry'?'::jsonb':'')).join(',')
   return value(comparisonWorker,'select mip_identity.'+name+'('+placeholders+') result',params)
  }
  const completed=await runQikJournaledWorker({rpc,session:sessions.mip_comparison_worker_v1,runtime,implementation,requestId:()=>randomUUID(),sha256:hash})
  assert.equal(completed.state,'completed');assert.equal(completed.generation,comparisonGeneration)
  const retained=(await db.query('select g.input_payload,o.output_payload from mip_comparison_kernel_v1.generations g join mip_comparison_kernel_v1.outputs o on o.generation_id=g.id where g.id=$1',[comparisonGeneration])).rows[0]
  const input=retained.input_payload,output=retained.output_payload
  assert.deepEqual(input.eventInputs.map(x=>x.event.id).sort(),eventIds.slice().sort())
  assert.ok(output.projection.article_claims.length>=4);assert.ok(output.projection.explanations.length>=2)
  const journal=(await db.query('select entry from mip_cutover_authority.worker_journal where runtime_id=$1',[runtime])).rows
  assert.ok(journal.length>=4)
  for(const row of journal){assert.equal(Object.hasOwn(row.entry.args??{},'p_session'),false);assert.equal(Object.hasOwn(row.entry.args??{},'p_token'),false)}
  const evidence=[]
  for(const surface of output.projection.article_claims){
   const member=input.eventInputs.flatMap(x=>x.members).find(x=>x.article.id===surface.article_id)
   assert.ok(member)
   const retainedCapture=member.retained_capture,original=captures.find(x=>x.article_id===surface.article_id)
   assert.equal(retainedCapture.capture_id,original.id);assert.equal(retainedCapture.content_hash,original.content_hash)
   const actual=retainedCapture.candidates.find(x=>x.excerpt===surface.surface_text)
   assert.ok(actual)
   const payload=originalPayloads[captures.indexOf(original)],field=payload[actual.source_field]
   assert.equal(Array.from(field).slice(actual.span_start,actual.span_end).join(''),actual.excerpt)
   assert.equal(hash(field),actual.field_hash)
   evidence.push({article_id:surface.article_id,claim_key:surface.claim_key,candidate_id:actual.candidate_id,
    capture_id:original.id,content_hash:original.content_hash,field:actual.source_field,
    span_start:actual.span_start,span_end:actual.span_end,excerpt:actual.excerpt,field_hash:actual.field_hash,
    auditability_state:'verified_retained_source'})
  }
  assert.equal(new Set(evidence.map(x=>x.article_id)).size,4)

  stage='actual_factual_review'
  const explanationIds=[]
  for(const projected of output.projection.explanations){
   const explanation={...projected,id:randomUUID(),version:1,is_current:true,
    source_ids:[...new Set(evidence.map(e=>e.article_id))].sort(),
    archived_sources:evidence.map(e=>({article_id:e.article_id,field_hash:e.field_hash,status:'retained'})),
    provenance_class:'synthetic_mechanism',state:'ok',review_status:'draft',
    falsification_condition:'An independent record disproves the council decision.'}
   const columns=['id','assertion_id','assertion_type','version','is_current','source_ids','archived_sources','supporting_passage','rule_version','provenance_class','state','review_status','falsification_condition']
   await db.query('insert into public.explanations('+columns.join(',')+') select '+columns.map(c=>'x.'+c).join(',')+' from jsonb_populate_record(null::public.explanations,$1::jsonb) x',[JSON.stringify(explanation)])
   await factualReviewer.query('select mip_factual.review_publish($1,$2)',[explanation.id,'synthetic-native-comparison'])
   explanationIds.push(explanation.id)
  }
  const explanations=(await db.query('select to_jsonb(e) result from public.explanations e where id=any($1::uuid[]) order by assertion_id',[explanationIds])).rows.map(x=>x.result)
  stage='actual_permission_review'
  for(const event of input.eventInputs)for(const member of event.members){
   const materialVersion=await value(db,'select mip_comparison_kernel_v1.argument_digest($1::jsonb) result',[JSON.stringify(member.article)])
   for(const operation of ['retention','analysis','excerpt_display'])for(const domain of ['rights','privacy']){
    const permissionScope={source_project:source,material_ref:'article:'+member.article.id,material_version:materialVersion,operation,audience:'isolated_internal_review',domain}
    const revision=randomUUID()
    await db.query("insert into mip_identity.operation_evidence_versions values($1,$2::jsonb,'synthetic-fixture-v1','synthetic-record','v1',repeat('a',64),'synthetic-evidence','synthetic-owner','synthetic-approval','recorded','allow','2020-01-01','2999-01-01','[]',true)",[revision,JSON.stringify(permissionScope)])
    await db.query('insert into mip_identity.operation_evidence_heads values($1::jsonb,$2,true)',[JSON.stringify(permissionScope),revision])
   }
  }
  const publicationPolicy=id(7030),publicationReview=id(7031),releaseRequest=id(7032)
  await db.query("insert into mip_identity.publication_policy_versions values($1,'synthetic-privacy','synthetic-rights','synthetic-publication','survivor-reader-v1','synthetic-only')",[publicationPolicy])
  await db.query('insert into mip_identity.publication_policy_heads values(true,$1,true)',[publicationPolicy])
  await db.query("insert into mip_identity.publication_reviews select $1::uuid,g.id,g.input_hash,o.output_hash,$2::uuid,'eligible','eligible',$3::jsonb,$4::jsonb,mip_identity.survivor_context(),'2999-01-01','synthetic-only','synthetic-only' from mip_comparison_kernel_v1.generations g join mip_comparison_kernel_v1.outputs o on o.generation_id=g.id where g.id=$5",
   [publicationReview,publicationPolicy,JSON.stringify(evidence),JSON.stringify(explanations),comparisonGeneration])
  await db.query('insert into mip_identity.publication_review_heads values($1,$2,true)',[comparisonGeneration,publicationReview])
  stage='actual_staging_release_reader'
  const publisherSession=sessions.mip_projection_publisher_v1
  const approved=await value(publisher,'select mip_identity.stage_review($1,$2,$3) result',[publisherSession,runtime,publicationReview])
  assert.ok(approved)
  assert.equal(await value(publisher,'select mip_identity.release_isolated($1,$2,$3,$4) result',[releaseRequest,publisherSession,runtime,publicationReview]),'isolated_released')
  const accepted=await value(publisher,'select mip_identity.read_isolated_comparison($1,$2,$3) result',[publisherSession,runtime,releaseRequest])
  assert.equal(accepted.contract_version,'accepted-comparison-private-v2')
  assert.equal(accepted.generation_id,comparisonGeneration)
  for(const [index,eventId] of eventIds.entries()){
   const ev=accepted.events.find(x=>x.event.id===eventId);assert.ok(ev)
   assert.deepEqual(ev.sources.map(x=>x.article_id).sort(),captures.slice(index*2,index*2+2).map(x=>x.article_id).sort())
  }

  stage='native_scalar_extraction_reviews'
  const bindings=[],extractions=[]
  for(const [index,capture] of captures.slice(0,2).entries()){
   const fieldId=id(7090+index),fieldText=originalPayloads[index].summary
   await fieldOwner.query('select mip_mentions.admit_native_field($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [scope,fieldId,capture.id,capture.job_id,capture.article_id,capture.content_hash,'summary',hash(fieldText),Buffer.byteLength(fieldText)])
   await admin.query('select mip_mentions.set_field_access($1,$2,true)',[scope,fieldId])
   for(const [fieldIndex,field] of ['title','summary','outlet','published_at'].entries()){
    const binding=id(7100+index*10+fieldIndex)
    const meta=(await db.query("select case when not(payload?$2) then 'missing' when payload->$2='null'::jsonb then 'null' else jsonb_typeof(payload->$2) end kind,encode(sha256(convert_to(jsonb_build_object('present',payload?$2,'value',payload->$2)::text,'UTF8')),'hex') hash from evidence_pipeline.article_captures where id=$1",[capture.id,field])).rows[0]
    await reviewer.query('select mip_arc_native.review_scalar($1,$2,$3,$4,$5,$6,$7,$8,$9)',[scope,binding,capture.article_id,capture.id,capture.job_id,capture.content_hash,field,meta.kind,meta.hash])
    await admin.query('select mip_arc_native.set_scalar_access($1,$2,true)',[scope,binding]);bindings.push(binding)
   }
   const prepared=await value(gateway,'select mip_arc_qik_source.prepare_governed_article($1,$2,$3) result',[scope,capture.article_id,capture.id])
   assert.equal(prepared.groups.length,0)
   const extraction=id(7120+index)
   // Honest entity-unavailable state; lexical/time continuity must independently pass.
   await reviewer.query("select mip_arc_native.review_extraction($1,$2,$3,$4,$5,1,null,'unavailable','method_does_not_provide_entities',$6)",[scope,extraction,capture.article_id,capture.id,capture.content_hash,prepared.article_set_digest])
   extractions.push(extraction)
  }
  const previous=(await db.query('select id,version from mip_arc_native.selection_policies where scope=$1 order by version desc limit 1',[scope])).rows[0]
  const selection=id(7130),cohort=id(7131),nativeGeneration=id(7132),scoreReview=id(7133)
  await reviewer.query('select mip_arc_native.review_selection_policy($1,$2,$3,$4,0.7,true,31,128,4194304,125829120)',[scope,selection,(previous?.version??0)+1,previous?.id??null])
  const candidateRevision=(await db.query('select updated_at::text revision from public.arc_membership_candidates where id=$1',[candidate])).rows[0].revision
  await reviewer.query('select mip_arc_native.review_cohort($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[scope,cohort,candidate,candidateRevision,captures[0].article_id,arc,[captures[1].article_id],bindings,extractions,selection])
  stage='actual_native_score'
  const snap=await value(gateway,'select mip_arc_native.snapshot($1,$2,$3) result',[scope,cohort,nativeGeneration])
  const wire=await value(gateway,'select mip_arc_native.read_scoring_input($1,$2,$3) result',[scope,nativeGeneration,snap.input_hash])
  const score=scoreGovernedNativeInput(wire)
  assert.equal(score.score.decision,'candidate');assert.deepEqual(score.score.hard_rejections,[])
  const scored=await value(gateway,'select mip_arc_native.complete_score($1,$2,$3,$4::jsonb) result',[scope,nativeGeneration,snap.input_hash,JSON.stringify(score)])
  await reviewer.query("select mip_arc_native.review_score($1,$2,$3,$4,$5,1,null,'accepted_private','reviewed_continuity')",[scope,scoreReview,nativeGeneration,snap.input_hash,scored.output_hash])
  await value(gateway,'select mip_arc_native.read_current_score($1,$2,$3,$4,$5) result',[scope,nativeGeneration,snap.input_hash,scored.output_hash,scoreReview])

  stage='actual_private_projection'
  const sourceBinding=id(7140),citation=id(7141),context=id(7142),projection=id(7143),privateReview=id(7144)
  const meta=(await db.query("select encode(sha256(convert_to(jsonb_build_object('present',payload?'body_text','value',payload->'body_text')::text,'UTF8')),'hex') body_hash,encode(sha256(convert_to(jsonb_build_object('present',payload?'url','value',payload->'url')::text,'UTF8')),'hex') url_hash from evidence_pipeline.article_captures where id=$1",[captures[0].id])).rows[0]
  await reviewer.query('select mip_arc_projection_private.review_source($1,$2,$3,$4,$5,$6,$7,$8,$9)',[scope,sourceBinding,captures[0].article_id,captures[0].id,captures[0].job_id,captures[0].content_hash,'string',meta.body_hash,meta.url_hash])
  await reviewer.query('select mip_arc_projection_private.set_source_access($1,$2,true)',[scope,sourceBinding])
  await reviewer.query("select mip_arc_projection_private.review_citations($1,$2,$3,1,null,'reviewed_complete','[]'::jsonb)",[scope,citation,sourceBinding])
  const observed=await value(reviewer,'select mip_arc_projection_private.inspect_context($1,$2) result',[scope,arc])
  assert.equal(observed.context.root_node_id,node);assert.ok(observed.context.milestones.some(x=>x.id===milestone))
  await reviewer.query("select mip_arc_projection_private.review_context($1,$2,$3,1,null,'reviewed',$4)",[scope,context,arc,observed.context_hash])
  const projectionReceipt=await value(reviewer,'select mip_arc_projection_private.prepare($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[scope,projection,nativeGeneration,snap.input_hash,scored.output_hash,scoreReview,sourceBinding,citation,context])
  await reviewer.query("select mip_arc_projection_private.review($1,$2,$3,$4,$5,1,null,'accepted_private','reviewed_private_display')",[scope,privateReview,projection,projectionReceipt.dependency_hash,projectionReceipt.display_hash])
  await value(gateway,'select mip_arc_projection_private.read_current($1,$2,$3,$4,$5) result',[scope,projection,projectionReceipt.dependency_hash,projectionReceipt.display_hash,privateReview])
  await value(publisher,'select mip_identity.read_isolated_comparison($1,$2,$3) result',[publisherSession,runtime,releaseRequest])

  stage='binding_assertions'
  const sourceSQL=await read('supabase/qualification/native-comparison-binding/001_private_binding.sql')
  const marker='do $native_comparison_final$',end='end $native_comparison_final$;'
  const start=sourceSQL.indexOf(marker),finish=sourceSQL.indexOf(end,start)
  assert.ok(start>=0&&finish>start);assert.equal(sourceSQL.split(marker).length,2)
  const finalAssertion=sourceSQL.slice(start,finish+end.length)
  // Fixture-only administrator transaction; real session_user switches to the
  // observed reviewer after mutation, so that same transaction sees the change.
  // This does not claim separate password-authenticated reviewer mutation authority.
  const rollbackMutation=async(mutation,body)=>{
   const c=await connect();owned.push(c);let failure;const originalQuery=c.query
   try{
    await c.query('begin');await mutation(c)
    await c.query('set local session authorization '+quote(reviewerName))
    assert.deepEqual((await c.query('select session_user::text u,current_user::text e')).rows[0],{u:reviewerName,e:reviewerName})
    // Every denial must execute its real reader, not inherit 25P02 from the
    // preceding expected SQL error. Only error recovery is wrapped.
    const rawQuery=originalQuery.bind(c)
    c.query=async(...args)=>{
     await rawQuery('savepoint binding_callback_query')
     try{
      const answer=await rawQuery(...args)
      await rawQuery('release savepoint binding_callback_query')
      return answer
     }catch(error){
      await rawQuery('rollback to savepoint binding_callback_query')
      await rawQuery('release savepoint binding_callback_query')
      throw error
     }
    }
    await body(c)
   }catch(error){failure=error}
   finally{
    c.query=originalQuery
    try{await c.query('rollback')}catch{cleanup.push('mutation_rollback')}
    try{await c.query('reset session authorization')}catch{cleanup.push('mutation_identity_reset')}
   }
   if(failure)throw failure
  }
  const edges=async c=>(await c.query("select p.rolname parent,m.rolname member,m.rolcanlogin login,g.rolname grantor,a.admin_option admin,a.inherit_option inherit,a.set_option set from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where p.rolname='mip_arc_native_worker' or m.rolname='mip_arc_native_worker' order by p.rolname,m.rolname,g.rolname")).rows
  const withFinalBoundary=async body=>{
   const c=await connect();owned.push(c);const before=await edges(c);let failure
   assert.equal(before.length,2);assert.deepEqual(before.map(x=>x.member).sort(),workerLogins)
   assert.ok(before.every(x=>x.parent==='mip_arc_native_worker'&&x.login&&!x.admin))
   try{
    await c.query('begin')
    for(const login of workerLogins)await c.query('revoke mip_arc_native_worker from '+quote(login))
    assert.deepEqual(await edges(c),[])
    await c.query(finalAssertion)
    await body(c)
   }catch(error){failure=error}
   finally{
    try{await c.query('rollback')}catch{cleanup.push('boundary_rollback')}
    try{assert.deepEqual(await edges(c),before)}catch{cleanup.push('boundary_edges')}
   }
   if(failure)throw failure
  }
  const comparison={session:publisherSession,runtime,release_request:releaseRequest,event_id:eventIds[0],generation_id:comparisonGeneration}
  result=await assertNativeComparisonBinding({...fx,
   native:{projection_id:projection,generation_id:nativeGeneration,dependency_hash:projectionReceipt.dependency_hash,display_hash:projectionReceipt.display_hash,review_id:privateReview},
   comparison,otherComparison:{...comparison,event_id:eventIds[1]},
   nativeSources:captures.slice(0,2).map(c=>({article_id:c.article_id,capture_id:c.id,content_hash:c.content_hash,job_id:c.job_id})),
   bindingIds:[id(7150),id(7151)],sentinels:[sentinel,sentence,...originalPayloads.map(x=>x.url)],
   finalAssertion,withFinalBoundary,
   withRevokedComparisonSession:body=>rollbackMutation(c=>c.query('select mip_comparison_kernel_v1.revoke_session($1)',[publisherSession]),body),
   withRevokedNativeAccess:body=>rollbackMutation(c=>c.query('update mip_arc_projection_private.source_access set allowed=false,version=version+1 where scope=$1 and binding=$2',[scope,sourceBinding]),body),
   withInvalidatedComparison:body=>rollbackMutation(c=>c.query('update mip_identity.publication_review_heads set active=false where generation_id=$1',[comparisonGeneration]),body)
  })
  assert.deepEqual(result,{checks:6,publication_allowed:false,attachment_allowed:false})
 }catch(error){primary=diagnostic(error,stage)}
 finally{
  for(const c of owned){
   try{await c.query('rollback')}catch{cleanup.push('client_rollback')}
   try{await c.query('reset session authorization');await c.query('reset role')}catch{cleanup.push('client_identity')}
   try{await c.end()}catch{cleanup.push('client_close')}
  }
 }
 if(primary||cleanup.length){
  const failure=Error('native_comparison_fixture_failed')
  fixtureFailures.set(failure,Object.freeze({primary:primary?Object.freeze({...primary,frames:Object.freeze([...primary.frames])}):null,cleanup:Object.freeze([...cleanup])}))
  throw failure
 }
 return {checks:result.checks,original_captures:4,accepted_events:2,publication_allowed:false,attachment_allowed:false}
}
