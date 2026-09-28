import test from 'node:test'
import assert from 'node:assert/strict'
import {assessmentAuthorityEnvelope,hypothesisChangeAuthorityEnvelope,classifyComparisonAbsence,
 requireCanonicalAbsence,assertSameMetadataRetry,SEMANTIC_ENVELOPE_VERSION} from '../src/lib/semanticAuthorityEnvelope.js'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const sha='a'.repeat(64)
const copy=x=>structuredClone(x)
const error=code=>e=>e.code===code&&e.message===code&&!e.cause
function assessment(){
 return {id:id(1),ordinal:'9007199254740993',candidate_id:id(2),algorithm_key:'retained-review',
 algorithm_version:'v1',outcome:'insufficient_evidence',rationale:'BODY_SENTINEL 😀',
 remaining_uncertainty:'PRIVATE_SENTINEL',extra_positions:['3'],parent_ids:[id(3)],ancestor_ids:[id(3)],
 watch_keys:['article:'+id(4)],context_positions:['3','9007199254740993'],predecessor_id:null,
 assessed_at:'2026-09-20T12:01:02.123456+00:00',input_fingerprint:sha,release_state:'private',
 stale:false,stale_causes:[],superseded_by:[],publicly_eligible:false}
}
function backlog(kind='method_changed'){
 const detail=kind==='method_changed'?{implementation:'hypothesis-v1',accepted_method_revision:id(10),
 observed_method_revision:id(11),observed_active:true,classification:'method_change_requires_reassessment_not_approval'}:
 {input_position:'9007199254740993',operation:'excerpt_display',domain:'privacy',
 accepted_permission_revision:id(10),observed_permission_revision:id(11),reason:'permission_binding_changed'}
 return {contract_version:'mip_hypothesis_reassessment_backlog_v2',investigation_id:id(20),
 coverage:'retained_causes_only',completed_reassessment:false,publication_allowed:false,is_completion_receipt:false,
 causes:[{cause_id:id(21),revision_id:id(22),kind,change_position:null,
 related_version_id:kind==='method_changed'?id(11):null,detail,recorded_at:'2026-09-20T12:01:03.123456Z',
 state:'pending_explicit_reconciliation'}]}
}
test('selected assessment read shape preserves namespaced identity, source fingerprint and microseconds',async()=>{
 const input=assessment(),before=copy(input),e=await assessmentAuthorityEnvelope(input)
 assert.deepEqual(input,before);assert.equal(e.contract_version,SEMANTIC_ENVELOPE_VERSION)
 assert.deepEqual(e.identity,{namespace:'evidence_pipeline.assessments',id:id(1)})
 assert.equal(e.metadata.ordinal,'9007199254740993')
 assert.deepEqual(e.metadata.context_positions,['3','9007199254740993'])
 assert.equal(e.metadata.input_fingerprint,sha);assert.equal(e.metadata.fingerprint_scheme,'legacy_assessment_pg_jsonb_v1')
 assert.equal(e.time.recorded_at,input.assessed_at);assert.equal(e.time.as_of,null)
 assert.equal(e.currentness.state,'current')
 assert.match(e.envelope_digest.sha256,/^[a-f0-9]{64}$/)
 assert.notEqual(e.envelope_digest.sha256,sha)
 assert.ok(Object.isFrozen(e)&&Object.isFrozen(e.metadata)&&Object.isFrozen(e.metadata.context_positions))
 assert.doesNotMatch(JSON.stringify(e),/BODY_SENTINEL|PRIVATE_SENTINEL|watch_keys|rationale|remaining_uncertainty/)
})
test('insufficient evidence means assessment-scoped unresolved, never source absence',async()=>{
 const e=await assessmentAuthorityEnvelope(assessment())
 assert.deepEqual(requireCanonicalAbsence(e),{kind:'unknown_or_unresolved',scope:'assessment_outcome_only',negative_evidence:false})
 for(const outcome of ['supported','contested','not_supported']){
  const e=await assessmentAuthorityEnvelope({...assessment(),outcome})
  assert.equal(e.metadata.absence,null)
  assert.throws(()=>requireCanonicalAbsence(e),error('semantic_absence_unrepresented'))
 }
 assert.throws(()=>requireCanonicalAbsence({contract_version:SEMANTIC_ENVELOPE_VERSION,
 kind:'assessment',metadata:{absence:{kind:'unknown_or_unresolved'}}}),error('semantic_absence_unrepresented'))
})
test('provider, policy, entity roles and temporal scope remain explicitly unrepresented',async()=>{
 const e=await assessmentAuthorityEnvelope(assessment())
 assert.equal(e.metadata.provider,null);assert.equal(e.metadata.policy,null);assert.equal(e.metadata.domain_adapter,null)
 assert.ok(e.metadata.unrepresented.includes('evidence_revision_hash_digest'))
 assert.equal(e.authority.provider_activation_allowed,false)
 assert.equal(e.authority.publication_allowed,false);assert.equal(e.authority.cross_user_reuse_allowed,false)
 assert.equal(e.authority.semantic_qualification_claimed,false)
 assert.equal(e.visibility.retention,'private')
})
test('public escalation, added fields and nested payload fields refuse statically',async()=>{
 for(const patch of [{publicly_eligible:true},{release_state:'public'},{provider:'secret'},{context_positions:['3','3']}]){
  await assert.rejects(()=>assessmentAuthorityEnvelope({...assessment(),...patch}))
 }
 const r=assessment();r.stale=true;r.stale_causes=[{change_position:'4',superseding_assessment_id:null,body:'SENTINEL'}]
 await assert.rejects(()=>assessmentAuthorityEnvelope(r),error('semantic_shape_refused'))
})
test('unsafe numbers, invalid clocks and identifiers are not silently normalized',async()=>{
 await assert.rejects(()=>assessmentAuthorityEnvelope({...assessment(),ordinal:9007199254740993}),error('semantic_position_refused'))
 for(const assessed_at of ['2026-02-30T00:00:00Z','2026-01-01T00:00:00.1234567Z','2026-01-01T00:00:00'])
  await assert.rejects(()=>assessmentAuthorityEnvelope({...assessment(),assessed_at}),error('semantic_time_refused'))
 await assert.rejects(()=>assessmentAuthorityEnvelope({...assessment(),algorithm_key:'BODY SENTINEL'}),error('semantic_identifier_unrepresented'))
})
test('exact metadata retry uses new projection and preserves separate source and envelope digests',async()=>{
 const first=await assessmentAuthorityEnvelope(assessment()),fresh=await assessmentAuthorityEnvelope(assessment())
 assert.deepEqual(await assertSameMetadataRetry(JSON.parse(JSON.stringify(first)),fresh),
  {same_metadata:true,authorization_conferred:false,reuse_authorized:false})
 const reordered=Object.fromEntries(Object.entries(assessment()).reverse())
 assert.equal((await assessmentAuthorityEnvelope(reordered)).envelope_digest.sha256,first.envelope_digest.sha256)
 await assert.rejects(async()=>assertSameMetadataRetry(first,JSON.parse(JSON.stringify(fresh))),error('semantic_retry_refused'))
})
test('metadata changes, identity substitution and digest tampering conflict on retry',async()=>{
 const first=await assessmentAuthorityEnvelope(assessment())
 for(const patch of [{id:id(9)},{algorithm_version:'v2'},{input_fingerprint:'b'.repeat(64)},
 {assessed_at:'2026-09-20T12:01:02.123457+00:00'},{context_positions:['9007199254740993','3']}]){
  const changed=await assessmentAuthorityEnvelope({...assessment(),...patch})
  await assert.rejects(async()=>assertSameMetadataRetry(first,changed),error('semantic_retry_conflict'))
 }
 const forged=copy(first);forged.metadata.extra='BODY_SENTINEL'
 await assert.rejects(async()=>assertSameMetadataRetry(forged,await assessmentAuthorityEnvelope(assessment())),error('semantic_retry_refused'))
})
test('stale and superseded historical records are preserved without current-reuse claims',async()=>{
 const raw=assessment();raw.stale=true;raw.stale_causes=[{change_position:'4',superseding_assessment_id:null}]
 const old=await assessmentAuthorityEnvelope(raw),fresh=await assessmentAuthorityEnvelope(raw)
 assert.equal(old.currentness.state,'stale')
 await assert.rejects(async()=>assertSameMetadataRetry(old,fresh),error('semantic_currentness_refused'))
 assert.equal((await assertSameMetadataRetry(old,fresh,{mode:'historical_metadata'})).reuse_authorized,false)
 const superseded=await assessmentAuthorityEnvelope({...assessment(),superseded_by:[id(8)]})
 assert.equal(superseded.currentness.state,'superseded')
 await assert.rejects(async()=>assertSameMetadataRetry(superseded,await assessmentAuthorityEnvelope({...assessment(),superseded_by:[id(8)]})),error('semantic_currentness_refused'))
 await assert.rejects(()=>assessmentAuthorityEnvelope({...raw,stale:false}),error('semantic_currentness_refused'))
})
test('method-head change preserves exact prior/new revisions without inferring provider change',async()=>{
 const e=await hypothesisChangeAuthorityEnvelope(backlog(),id(21))
 assert.equal(e.metadata.canonical_cause,'method_changed')
 assert.equal(e.metadata.detail.accepted_method_revision,id(10))
 assert.equal(e.metadata.detail.observed_method_revision,id(11))
 assert.equal(e.metadata.provider_change,null);assert.equal(e.metadata.algorithm_change,null)
 assert.equal(e.currentness.state,'unknown');assert.equal(e.metadata.review_approval_claimed,false)
 assert.equal(e.identity.namespace,'mip_hypothesis.reassessment_causes')
 const fresh=await hypothesisChangeAuthorityEnvelope(backlog(),id(21))
 await assert.rejects(async()=>assertSameMetadataRetry(e,fresh),error('semantic_currentness_refused'))
})
test('permission change preserves exact operation/domain and does not restore access',async()=>{
 const e=await hypothesisChangeAuthorityEnvelope(backlog('permission_changed'),id(21))
 assert.equal(e.metadata.canonical_cause,'visibility_changed')
 assert.equal(e.metadata.detail.operation,'excerpt_display');assert.equal(e.metadata.detail.domain,'privacy')
 assert.equal(e.authority.authorization_conferred,false);assert.equal(e.authority.cross_user_reuse_allowed,false)
 const removed=backlog('permission_changed');removed.causes[0].detail.observed_permission_revision=null
 removed.causes[0].detail.reason='current_permission_denied'
 assert.equal((await hypothesisChangeAuthorityEnvelope(removed,id(21))).metadata.detail.observed_permission_revision,null)
})
test('recorded resolution stays distinct from review approval and preserves original cause',async()=>{
 const b=backlog();Object.assign(b.causes[0],{state:'reassessment_recorded',resolution_revision_id:id(30),
 resolved_at:'2026-09-20T12:02:00.123456Z'})
 const e=await hypothesisChangeAuthorityEnvelope(b,id(21))
 assert.equal(e.identity.id,id(21));assert.equal(e.metadata.resolution_revision_id,id(30))
 assert.equal(e.metadata.completion_claimed,false);assert.equal(e.metadata.review_approval_claimed,false)
})
test('generic source/assessment/workspace/human causes are not upgraded into semantic facts',async()=>{
 for(const kind of ['retained_source_change','retained_assessment_change','workspace_changed','human_reconsideration']){
  const b=backlog();b.causes[0].kind=kind;b.causes[0].change_position=kind==='retained_source_change'?'4':null
  await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(b,id(21)),error('semantic_cause_unrepresented'))
 }
 const b=backlog();b.causes[0].kind='source_retracted'
 await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(b,id(21)),error('semantic_cause_unrepresented'))
})
test('missing/duplicate cause, mismatched observed revision and payload detail refuse',async()=>{
 await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(backlog(),id(99)),error('semantic_identity_refused'))
 const duplicate=backlog();duplicate.causes.push(copy(duplicate.causes[0]))
 await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(duplicate,id(21)),error('semantic_duplicate_refused'))
 const mismatch=backlog();mismatch.causes[0].related_version_id=id(99)
 await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(mismatch,id(21)),error('semantic_cause_refused'))
 const extra=backlog();extra.causes[0].detail.reason='BODY_SENTINEL'
 await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(extra,id(21)),error('semantic_shape_refused'))
})
test('bounded omission and unknown coverage remain ephemeral and cannot become reporting absence',()=>{
 for(const [outlet,state]of [['A','not_present_in_extracted_coverage'],['B','coverage_unknown'],['C','no_absence_observation']]){
  const result=classifyComparisonAbsence({id:'event-claim-opaque',omittedBy:['A'],coverageUnknown:['B']},outlet)
  assert.equal(result.state,state);assert.equal(result.canonical_absence_kind,null)
  assert.equal(result.persistable_as_canonical_absence,false)
  assert.equal(result.source_reporting_absence_claimed,false)
  assert.throws(()=>requireCanonicalAbsence(result),error('semantic_absence_unrepresented'))
  assert.equal(Object.hasOwn(result,'outlet'),false)
 }
})
test('conflicting coverage, unknown inputs and excessive metadata are rejected',async()=>{
 assert.throws(()=>classifyComparisonAbsence({id:'x',omittedBy:['A'],coverageUnknown:['A']},'A'),error('semantic_coverage_refused'))
 assert.throws(()=>classifyComparisonAbsence({id:'x',omittedBy:[],coverageUnknown:[],capture_id:id(4)},'A'),error('semantic_shape_refused'))
 const b=backlog();b.causes=Array.from({length:257},(_,n)=>({...b.causes[0],cause_id:id(n+100)}))
 await assert.rejects(()=>hypothesisChangeAuthorityEnvelope(b,id(100)),error('semantic_bound_refused'))
})
