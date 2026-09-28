// Source-authored full-backend synthetic constructor. NOT RUN by its author.
// No service, installation, credential delivery, or real source is created here.
import assert from 'node:assert/strict'
import pg from 'pg'
import {callNativeComparisonBinding} from '../supabase/qualification/native-comparison-binding/serverCaller.mjs'
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
// Exact non-format static exception messages from the complete installed source only.
// Includes fixed operation-denial reasons; never accepts a prefix or arbitrary message.
// Never copy driver message/detail/context, arguments, SQL or payload into diagnostics.
const stagedRefusals=new Set(["comparison completion conflict","comparison failure conflict","comparison input binding mismatch","doj_admin_excess_head_privilege","doj_existing_canonical_dependency","efta_assignment_not_authorized","efta_assignment_receipt_payload_mismatch","efta_authenticated_subject_mismatch","efta_authentication_key_not_authorized","efta_authentication_policy_not_authorized","efta_authentication_session_revoked","efta_decision_replaced","efta_exact_binding_denied","efta_gateway_credential_not_authorized","efta_identity_ambiguous","efta_identity_conflict","efta_identity_drift","efta_identity_not_owner_approved","efta_identity_origin_mismatch","efta_identity_parent_unresolved","efta_identity_predecessor","efta_identity_replaced","efta_identity_review_required","efta_identity_unresolved_or_stale","efta_live_auth_session_invalid","efta_live_authentication_required","efta_live_session_bad_request","efta_predecessor_conflict","efta_replaced_evidence","efta_replay_conflict","efta_review_binding_required","efta_review_required","efta_source_revision_missing","efta_stale_review","efta_stale_source","immutable comparison generation history","invalid comparison failure token","invalid comparison output","invalid comparison snapshot binding","invalid or expired comparison lease","invalid selection request","invalid source observation","mip_audit_rule_invalid","mip_audit_unavailable","mip_backlog_already_started","mip_broker_recovery_dependencies","mip_capture_requires_server_input","mip_claim_not_recorded","mip_collector_replay_owner","mip_collector_source_mismatch","mip_comparison_reader_prerequisites_missing","mip_factual_fresh_version_required","mip_factual_history_preserved","mip_factual_release_ineligible","mip_hosted_capture_requires_bound_producer","mip_identity_bad_request","mip_identity_claim_mismatch","mip_identity_expired","mip_identity_fresh_revision_required","mip_identity_key_revoked","mip_identity_mapping_revoked","mip_identity_session_revoked","mip_identity_stale_revision","mip_identity_token_replay","mip_journal_args","mip_journal_bad_key","mip_journal_binding","mip_journal_content_conflict","mip_journal_generation_binding","mip_journal_native_token_unavailable","mip_journal_output_shape","mip_journal_page_bounds","mip_journal_receipt_shape","mip_journal_request_missing","mip_journal_requires_scoped_queue","mip_journal_shape","mip_journal_token_binding","mip_native_capture_binding_missing","mip_native_capture_bytes_invalid","mip_native_capture_stale","mip_native_collector_duplicate_recorder","mip_native_collector_fence_topology","mip_native_collector_identity_missing","mip_native_collector_prerequisite_missing","mip_native_collector_recorder_topology","mip_native_collector_relation","mip_native_final_chain_membership","mip_native_final_chain_review_retention_trigger","mip_native_final_schema_usage","mip_native_generation_lineage_mismatch","mip_native_lineage_shape","mip_native_lineage_version","mip_native_output_binding","mip_native_output_shape","mip_native_review_evidence_missing","mip_native_review_kernel_privilege_drift","mip_native_review_policy_collision","mip_native_review_prerequisites_missing","mip_native_review_retention_shape","mip_native_review_span_unbound","mip_operation_denied_audience_denied","mip_operation_denied_authoritative_adapter_unbound","mip_operation_denied_doj_applicability_unverified","mip_operation_denied_doj_authority_unbound","mip_operation_denied_doj_material_stale_or_unavailable","mip_operation_denied_doj_operation_expired","mip_operation_denied_doj_operation_missing_or_revoked","mip_operation_denied_doj_policy_inactive","mip_operation_denied_doj_private_policy_bound","mip_operation_denied_doj_record_binding_mismatch","mip_operation_denied_doj_scope_denied","mip_operation_denied_domain_denied","mip_operation_denied_internal_admission_inactive","mip_operation_denied_internal_authorization_unbound","mip_operation_denied_material_version_mismatch","mip_operation_denied_missing_capture_binding","mip_operation_denied_missing_material_closure","mip_operation_denied_missing_operation_evidence","mip_operation_denied_missing_primary_evidence","mip_operation_denied_operation_denied","mip_operation_denied_permission_expired","mip_operation_denied_permission_not_effective","mip_operation_denied_privacy_admission_missing","mip_operation_denied_qualification_batch_closed","mip_operation_denied_revoked_operation_evidence","mip_operation_denied_synthetic_mechanism_only","mip_operation_denied_unfulfilled_permission_condition","mip_operation_denied_unsupported_evidence_reference","mip_operation_fresh_review_required","mip_permission_runtime_denied","mip_public_release_disabled","mip_publication_archive_missing","mip_publication_article_ineligible","mip_publication_authority_missing","mip_publication_binding","mip_publication_claim_ineligible","mip_publication_closure_mismatch","mip_publication_correction_ineligible","mip_publication_dependency_ineligible","mip_publication_dependency_missing","mip_publication_event_ineligible","mip_publication_evidence_missing","mip_publication_explanation_binding","mip_publication_explanation_ineligible","mip_publication_explanation_missing","mip_publication_link_ineligible","mip_publication_membership_missing","mip_publication_missing_input","mip_publication_policy_revoked","mip_publication_replay_conflict","mip_publication_retained_evidence_missing","mip_publication_source_mismatch","mip_publication_stale_source_context","mip_publication_stale_source_input","mip_reader_evidence_unbound","mip_reader_release_binding","mip_reader_release_missing","mip_reader_release_scope","mip_resume_journal_missing","mip_resume_key","mip_survivor_relation_missing","mip_survivor_relation_or_fence_missing","selection retry conflict","stale selection predecessor","unbound publication selection","unbound selection output","unknown comparison generation"])
const diagnostic=(error,stage)=>({
 stage,staging_refusal:stage==='actual_staging_release_reader'&&stagedRefusals.has(error?.message)?error.message:null,sqlstate:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE',
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
 const owned=[];let stage='guard',primary=null,result,initialGate=null,sourceInitial=null,sourceInserted=false;const cleanup=[]
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
  const ingestRuntime=await freshRole('qik_ingest_runtime')
  const authorityAdmin=await freshRole('mip_cutover_authority_admin_v1')
  const permissionReader=await freshRole('mip_publication_owner_v2')
  // Reserved identifiers are disjoint from all earlier c650 fixture objects.
  const eventIds=[id(7000),id(7001)],arc=id(7010),node=id(7011),milestone=id(7012),candidate=id(7013)
  const runtime='synthetic-native-comparison-binding',implementation='synthetic-native-comparison-binding-v1'
  const source=(await db.query('select source from mip_identity.collector_config where id')).rows[0].source
  assert.equal(source,'qik-fixture-v1')
  const originalPayloads=[],captures=[],observations=[]
  const sourceId='1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d'
  const feedURL='https://www.justice.gov/news/rss?type=press_release&m=1'
  const token='synthetic-native-comparison-c3-token-00000000000000',runId='synthetic-native-comparison-'+randomUUID(),outletId=id(7240)
  // The installed hosted compiler deliberately denies the old synthetic permission
  // fallback. Use the unchanged actual C3/020 mechanism with SYNTHETIC feed bytes;
  // never restore a permissive adapter, fetch DOJ, or seed a real owner approval.
  stage='synthetic_c3_feed_profile'
  initialGate=(await db.query('select collection_authorized from qik_ingest.collection_gate where id')).rows[0].collection_authorized
  assert.equal(initialGate,false)
  sourceInitial=(await db.query('select outlet_id,feed_url,enabled,collection_enabled from public.ingest_sources where id=$1',[sourceId])).rows[0]??null
  if(sourceInitial)assert.equal(sourceInitial.feed_url,feedURL)
  await db.query("insert into public.outlets(id,name) values($1,'Binding synthetic outlet 0')",[outletId])
  if(sourceInitial)await db.query('update public.ingest_sources set outlet_id=$2,enabled=true,collection_enabled=true where id=$1',[sourceId,outletId])
  else{
   await db.query('insert into public.ingest_sources(id,outlet_id,feed_url,enabled,collection_enabled) values($1,$2,$3,true,true)',[sourceId,outletId,feedURL])
   sourceInserted=true
  }
  await db.query("insert into qik_ingest.runtime_credentials values($1,true,'synthetic fixture only')",[hash(token)])
  await db.query('update qik_ingest.collection_gate set collection_authorized=true where id')
  await value(ingestRuntime,'select public.mip_qik_ingest_begin_run($1,$2,null) result',[token,runId])
  const native=async(action,input)=>value(ingestRuntime,'select public.mip_qik_ingest_native($1,$2,$3,$4::jsonb) result',[token,runId,action,JSON.stringify(input)])
  const extractionBackend=createRetainedExtractionBackend(db)
  stage='original_capture_pair_sets'
  for(let index=0;index<4;index++){
   await db.query('update public.outlets set name=$2 where id=$1',[outletId,'Binding synthetic outlet '+index])
   const item={url:'https://www.justice.gov/synthetic/native-comparison-'+index+'?marker='+encodeURIComponent(sentinel),
    title:sentence,summary:sentence,published_at:'2026-01-02T00:00:00Z'}
   const observation=await value(ingestRuntime,'select public.mip_qik_ingest_retain_item($1,$2,$3,$4::jsonb) result',[token,runId,sourceId,JSON.stringify(item)])
   assert.equal(observation.disposition,'observed')
   observations.push(observation.id)
   const job=await native('enqueue',{observation_id:observation.id})
   assert.equal(await native('enqueue',{observation_id:observation.id}),job)
   const claim=await native('claim',{job_ids:[job]})
   assert.equal(claim.id,job)
   const done=await native('finish',{job_id:job,lease_token:claim.lease_token})
   assert.equal(done.job_id,job)
   const cap=(await db.query('select id,job_id,article_id,content_hash,payload from evidence_pipeline.article_captures where id=$1',[done.capture_id])).rows[0]
   assert.equal(cap.job_id,job);assert.equal(cap.article_id,done.article_id);assert.equal(cap.payload.body_text,null)
   assert.ok(cap.payload.url.includes(sentinel))
   originalPayloads.push(cap.payload)
   delete cap.payload
   const extracted=await extractRetainedCapture({backend:extractionBackend,capture_id:cap.id})
   assert.equal(extracted.state,'candidates_retained');assert.ok(extracted.candidate_ids.length>0)
   captures.push(cap)
   await db.query("update public.articles set reader_state='eligible',source_status='active' where id=$1",[cap.article_id])
  }
  await value(ingestRuntime,"select public.mip_qik_ingest_finish_run($1,$2,'completed','{}'::jsonb,null) result",[token,runId])
  // Restore the disabled collection boundary before snapshots/readers. A source
  // can remain disabled while its originally captured feed evidence is validated.
  await db.query('update qik_ingest.collection_gate set collection_authorized=$1 where id',[initialGate])
  await db.query('update public.ingest_sources set enabled=false,collection_enabled=false where id=$1',[sourceId])
  assert.equal((await db.query('select collection_authorized from qik_ingest.collection_gate where id')).rows[0].collection_authorized,false)
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
  // DOJ material stays feed-only; public article.arc_id remains NULL. The native
  // member is established by the existing reviewed PRIVATE attachment mechanism.
  await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,state,updated_at) values($1,$2,$3,'pending','2026-01-02T00:00:00Z')",[candidate,captures[0].article_id,arc])
  await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,state,updated_at) values($1,$2,$3,'pending','2026-01-02T00:00:00Z')",[id(7014),captures[1].article_id,arc])

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
  const permissionScope=member=>({source_project:source,material_ref:'article:'+member.article.id,
   material_version:null,operation:'retention',audience:'isolated_internal_review',domain:'rights'})
  const firstMember=input.eventInputs[0].members[0],legacyScope=permissionScope(firstMember)
  legacyScope.material_version=await value(db,'select mip_comparison_kernel_v1.argument_digest($1::jsonb) result',[JSON.stringify(firstMember.article)])
  const legacyDecision=await value(permissionReader,'select mip_identity.operation_check($1::jsonb) result',[JSON.stringify(legacyScope)])
  assert.equal(legacyDecision.allowed,false);assert.equal(legacyDecision.reason,'authoritative_adapter_unbound')
  const authorityInsert=async(table,record)=>{
   assert.ok(['doj_policy_versions','doj_policy_heads','doj_material_bindings','operation_evidence_versions'].includes(table))
   await authorityAdmin.query('insert into mip_identity.'+table+' select x.* from jsonb_populate_record(null::mip_identity.'+table+',$1::jsonb) x',[JSON.stringify(record)])
  }
  const dojPolicy={revision:id(7260),source_project:source,source_id:sourceId,feed_url:feedURL,
   policy_url:'https://www.justice.gov/legalpolicies',policy_version:'synthetic-policy-fixture-v1',
   policy_document_hash:hash('synthetic primary-policy document'),policy_clause_hash:hash('synthetic conditional policy clause'),
   policy_record_ref:'synthetic-policy-record',policy_observed_at:'2026-01-01T00:00:00Z',
   owner_record_ref:'synthetic-owner-instruction',owner_instruction_hash:hash('synthetic private instruction'),owner_principal_ref:'synthetic-owner',
   audience:'isolated_internal_review',operations:['retention','analysis','excerpt_display'],
   fields:['source_identity','original_url','title','published_at','short_feed_summary','native_capture_bytes_hash'],
   effective_at:'2020-01-01T00:00:00Z',expires_at:'2999-01-01T00:00:00Z',owner_field_signature:null}
  await authorityInsert('doj_policy_versions',dojPolicy)
  await authorityInsert('doj_policy_heads',{source_project:source,revision:dojPolicy.revision,active:true})
  for(const event of input.eventInputs)for(const member of event.members){
   const index=captures.findIndex(c=>c.article_id===member.article.id),cap=captures[index]
   assert.ok(index>=0)
   const materialVersion=await value(db,'select mip_comparison_kernel_v1.argument_digest($1::jsonb) result',[JSON.stringify(member.article)])
   const sourceReceiptHash=await value(db,"select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') result from evidence_pipeline.import_receipts r where job_id=$1 and run_id=$2",[cap.job_id,runId])
   const binding={revision:randomUUID(),policy_revision:dojPolicy.revision,article_id:cap.article_id,capture_id:cap.id,
    observation_id:observations[index],article_version:materialVersion,capture_hash:cap.content_hash,
    source_receipt_ref:'synthetic-receipt:'+cap.job_id,source_receipt_hash:sourceReceiptHash,
    selection_record_ref:'synthetic-selection:'+cap.article_id,selection_record_hash:hash('synthetic exception review:'+cap.article_id),
    applicability:'verified_first_party_unmarked_doj_text'}
   await authorityInsert('doj_material_bindings',binding)
   const conditions=[
    {status:'verified',evidence_ref:dojPolicy.policy_record_ref,document_hash:dojPolicy.policy_document_hash,clause_hash:dojPolicy.policy_clause_hash,policy_revision:dojPolicy.revision},
    {status:'verified',evidence_ref:dojPolicy.owner_record_ref,instruction_hash:dojPolicy.owner_instruction_hash},
    {status:'verified',evidence_ref:binding.selection_record_ref,selection_hash:binding.selection_record_hash,receipt_hash:binding.source_receipt_hash,binding_revision:binding.revision}]
   for(const operation of ['retention','analysis','excerpt_display'])for(const domain of ['rights','privacy']){
    const operationScope={source_project:source,material_ref:'article:'+member.article.id,material_version:materialVersion,operation,audience:'isolated_internal_review',domain}
    const revision=randomUUID()
    await authorityInsert('operation_evidence_versions',{revision,scope:operationScope,authority_adapter:'doj-private-policy-v1',
     source_ref:feedURL,source_version:cap.id,source_hash:cap.content_hash,evidence_ref:dojPolicy.policy_record_ref,
     approval_owner_ref:dojPolicy.owner_principal_ref,approval_record_ref:dojPolicy.owner_record_ref,
     approval_status:'recorded',disposition:'allow',effective_at:dojPolicy.effective_at,expires_at:dojPolicy.expires_at,conditions,synthetic:false})
    await authorityAdmin.query('update mip_identity.operation_evidence_heads set revision=$2,active=true where scope=$1::jsonb',[JSON.stringify(operationScope),revision])
    const decision=await value(permissionReader,'select mip_identity.operation_check($1::jsonb) result',[JSON.stringify(operationScope)])
    assert.equal(decision.allowed,true);assert.equal(decision.reason,'doj_private_policy_bound')
    assert.equal(decision.public_release_allowed,false);assert.equal(decision.owner_field_signature,null)
   }
  }
  // These records exercise the real 020 resolver with synthetic values only.
  // synthetic:false selects that code path; it is NOT a real-material approval.
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
  stage='reviewed_private_seed_member'
  const bootstrapCohort=id(7250),bootstrapGeneration=id(7251),bootstrapReview=id(7252),bootstrapAttachment=id(7253)
  const bootstrapRevision=(await db.query('select updated_at::text revision from public.arc_membership_candidates where id=$1',[id(7014)])).rows[0].revision
  await reviewer.query('select mip_arc_native.review_cohort($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[
   scope,bootstrapCohort,id(7014),bootstrapRevision,captures[1].article_id,arc,[],bindings.slice(4),[extractions[1]],selection])
  const bootstrapSnapshot=await value(gateway,'select mip_arc_native.snapshot($1,$2,$3) result',[scope,bootstrapCohort,bootstrapGeneration])
  const bootstrapWire=await value(gateway,'select mip_arc_native.read_scoring_input($1,$2,$3) result',[scope,bootstrapGeneration,bootstrapSnapshot.input_hash])
  const bootstrapScore=scoreGovernedNativeInput(bootstrapWire)
  assert.equal(bootstrapScore.score.decision,'candidate');assert.deepEqual(bootstrapScore.score.hard_rejections,[])
  const bootstrapScored=await value(gateway,'select mip_arc_native.complete_score($1,$2,$3,$4::jsonb) result',[scope,bootstrapGeneration,bootstrapSnapshot.input_hash,JSON.stringify(bootstrapScore)])
  await reviewer.query("select mip_arc_native.review_score($1,$2,$3,$4,$5,1,null,'accepted_private','reviewed_continuity')",[scope,bootstrapReview,bootstrapGeneration,bootstrapSnapshot.input_hash,bootstrapScored.output_hash])
  const attachment=await value(reviewer,'select mip_arc_native.prepare_private_attachment($1,$2,$3,$4,$5) result',[scope,bootstrapGeneration,bootstrapSnapshot.input_hash,bootstrapScored.output_hash,bootstrapReview])
  await value(reviewer,'select mip_arc_native.attach_private_membership($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[
   scope,bootstrapAttachment,bootstrapGeneration,bootstrapSnapshot.input_hash,bootstrapScored.output_hash,bootstrapReview,
   attachment.version,attachment.expected_predecessor,attachment.private_arc_revision,attachment.private_set_digest])
  assert.equal((await db.query('select arc_id from public.articles where id=$1',[captures[1].article_id])).rows[0].arc_id,null)

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
  await reviewer.query('select mip_arc_projection_private.review_source($1,$2,$3,$4,$5,$6,$7,$8,$9)',[scope,sourceBinding,captures[0].article_id,captures[0].id,captures[0].job_id,captures[0].content_hash,'null',meta.body_hash,meta.url_hash])
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
  const exerciseActualServerCaller=async(receipt,phase)=>{
   assert.ok(phase==='current'||phase==='revoke')
   assert.equal(receipt.scope,scope);assert.equal(receipt.binding_id,id(7150))
   stage=phase==='current'?'actual_server_caller_current':'actual_server_caller_revoke'
   const previousGuard=process.env.MIP_DISPOSABLE_POSTGRES
   assert.equal(previousGuard,'qik-persistent-install')
   const connection={
    connectionString:'postgresql://'+reviewerName+':mip-efta-disposable-ci-only@127.0.0.1:5432/postgres',
    expectedLogin:reviewerName,sessionPoolerHost:null,disposable:true
   }
   const brokerContext={session:publisherSession,runtime}
   const expected={native_generation_id:nativeGeneration,comparison_generation_id:comparisonGeneration}
   const admitRequest={action:'admit',scope,binding_id:id(7150),projection_id:projection,
    dependency_hash:projectionReceipt.dependency_hash,display_hash:projectionReceipt.display_hash,
    private_review_id:privateReview,release_request:releaseRequest,event_id:eventIds[0],
    ...expected,broker:brokerContext}
   const readRequest={action:'read',scope,binding_id:id(7150),manifest_hash:receipt.manifest_hash,
    ...expected,broker:brokerContext}
   const confirm=(answer,state,wire,diagnostics=[])=>assert.deepEqual(answer,{
    state,receipt:wire,needs_reconciliation:false,connection_closed:true,diagnostics,
    reconciliation_identity:null,publication_allowed:false,attachment_allowed:false
   })
   try{
    process.env.MIP_DISPOSABLE_POSTGRES='qik-native-caller'
    if(phase==='current'){
     // Real SCRAM login and unchanged authenticatedPgDriver; no SET ROLE or
     // synthetic result substitution in this server-caller exercise.
     confirm(await callNativeComparisonBinding({connection,request:admitRequest}),'current_binding_confirmed',receipt)
     confirm(await callNativeComparisonBinding({connection,request:readRequest}),'current_binding_confirmed',receipt)
     const originalQuery=pg.Client.prototype.query
     const seen={admit:0,read:0,commit:0,lost:0},admitClients=new Set(),readClients=new Set()
     try{
      pg.Client.prototype.query=async function(...args){
       const selected=this.connectionParameters?.user===reviewerName
       const sql=typeof args[0]==='string'?args[0]:args[0]?.text
       if(selected&&sql==='select mip_native_comparison.admit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result'){
        seen.admit++;admitClients.add(this)
       }
       if(selected&&sql==='select mip_native_comparison.read_current($1,$2,$3,$4,$5) result'){
        seen.read++;readClients.add(this)
       }
       // Execute every real query first. Lose exactly one successful COMMIT
       // acknowledgement; this is synthetic acknowledgement loss, not a network outage.
       const answer=await originalQuery.apply(this,args)
       if(selected&&sql==='commit'){
        seen.commit++
        if(seen.lost===0){seen.lost++;throw Error('synthetic_commit_acknowledgement_lost')}
       }
       return answer
      }
      confirm(await callNativeComparisonBinding({connection,request:admitRequest}),
       'current_binding_confirmed',receipt,['commit_acknowledgement_unknown'])
     }finally{pg.Client.prototype.query=originalQuery}
     assert.deepEqual(seen,{admit:1,read:1,commit:2,lost:1})
     assert.equal(admitClients.size,1);assert.equal(readClients.size,1)
     assert.notEqual([...admitClients][0],[...readClients][0])
    }else{
     const request={action:'revoke',scope,binding_id:id(7150)}
     confirm(await callNativeComparisonBinding({connection,request}),'revoked_private',null)
     confirm(await callNativeComparisonBinding({connection,request}),'revoked_private',null)
    }
   }finally{
    if(previousGuard===undefined)delete process.env.MIP_DISPOSABLE_POSTGRES
    else process.env.MIP_DISPOSABLE_POSTGRES=previousGuard
   }
   stage='binding_assertions'
  }
  const comparison={session:publisherSession,runtime,release_request:releaseRequest,event_id:eventIds[0],generation_id:comparisonGeneration}
  result=await assertNativeComparisonBinding({...fx,
   native:{projection_id:projection,generation_id:nativeGeneration,dependency_hash:projectionReceipt.dependency_hash,display_hash:projectionReceipt.display_hash,review_id:privateReview},
   comparison,otherComparison:{...comparison,event_id:eventIds[1]},
   nativeSources:captures.slice(0,2).map(c=>({article_id:c.article_id,capture_id:c.id,content_hash:c.content_hash,job_id:c.job_id})),
   bindingIds:[id(7150),id(7151)],sentinels:[sentinel,sentence,...originalPayloads.map(x=>x.url)],
   finalAssertion,withFinalBoundary,exerciseActualServerCaller,
   withRevokedComparisonSession:body=>rollbackMutation(c=>c.query('select mip_comparison_kernel_v1.revoke_session($1)',[publisherSession]),body),
   withRevokedNativeAccess:body=>rollbackMutation(c=>c.query('update mip_arc_projection_private.source_access set allowed=false,version=version+1 where scope=$1 and binding=$2',[scope,sourceBinding]),body),
   withInvalidatedComparison:body=>rollbackMutation(c=>c.query('update mip_identity.publication_review_heads set active=false where generation_id=$1',[comparisonGeneration]),body)
  })
  assert.deepEqual(result,{checks:6,publication_allowed:false,attachment_allowed:false})
 }catch(error){primary=diagnostic(error,stage)}
 finally{
  if(initialGate!==null){
   try{await db.query('update qik_ingest.collection_gate set collection_authorized=$1 where id',[initialGate])}catch{cleanup.push('collection_gate_restore')}
   try{
    if(sourceInitial)await db.query('update public.ingest_sources set outlet_id=$2,feed_url=$3,enabled=$4,collection_enabled=$5 where id=$1',[
     '1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d',sourceInitial.outlet_id,sourceInitial.feed_url,sourceInitial.enabled,sourceInitial.collection_enabled])
    else if(sourceInserted)await db.query('update public.ingest_sources set enabled=false,collection_enabled=false where id=$1',['1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d'])
   }catch{cleanup.push('source_configuration_restore')}
  }
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
