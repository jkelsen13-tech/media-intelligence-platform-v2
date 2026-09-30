// Trusted gateway preparation over an existing authorized saved observation.
// This is not permission authority, ingestion, a worker self-attestation API, or atomic DB acceptance.
import {assessmentInstant,validateHypothesisAssessment} from '../../../src/lib/hypothesisAssessment.js'
const hashPattern=/^[a-f0-9]{64}$/
const text=x=>typeof x==='string'&&x.trim().length>0
const fail=reason=>{throw new Error(reason)}
const sameInstant=(a,b)=>assessmentInstant(a)!==null&&assessmentInstant(a)===assessmentInstant(b)
function one(rows,key,value) {
 const matches=Array.isArray(rows)?rows.filter(r=>r?.[key]===value):[]
 if(matches.length!==1)fail('retained_identity_missing_or_ambiguous')
 return matches[0]
}
export async function bindHypothesisEvidence({assessment,bundle,sourceProject,readPermission,hashText,readExcerpt,mode='real'}) {
 const check=validateHypothesisAssessment(assessment)
 if(!check.valid)fail(check.reason)
 if(!['real','synthetic_qualification'].includes(mode)||!text(sourceProject)||typeof readPermission!=='function'||typeof hashText!=='function')
  fail('authoritative_reader_unbound')
 if(bundle?.investigation_id!==assessment.question_id||!text(bundle?.version?.id)||
    !text(bundle?.observation?.id)||bundle.version.observation_id!==bundle.observation.id||
    !['viewer','reviewer'].includes(bundle.access_role)||
    bundle.version.state?.question!==assessment.question||
    bundle.observation.snapshot?.contract_version!=='investigation-observation-1'||
    bundle.observation.snapshot.publicly_eligible!==false)
  fail('investigation_observation_binding_mismatch')
 const cutoff=assessmentInstant(assessment.knowledge_cutoff),bindings=[]
 for(const e of assessment.evidence) {
  const input=one(bundle.observation.snapshot.inputs,'position',e.input_position)
  if((input.capture!=null)===(input.record_version!=null))fail('retained_input_kind_ambiguous')
  const record=input.capture??input.record_version,kind=input.capture?'capture':'record_version'
  const acquired=input.capture?record.captured_at:record.recorded_at
  // Material identity is the retained immutable record ID, not a current article ID or URL.
  if(!text(record.id)||e.material_version!==record.id||!sameInstant(e.acquired_at,acquired)||assessmentInstant(acquired)>cutoff)
   fail('retained_version_or_time_mismatch')
  if((e.published_at??null)!==(record.payload?.published_at??null)||(e.event_time??null)!==(record.payload?.event_time??null))
   fail('retained_source_clock_mismatch')
  if(record.payload===null||typeof record.payload!=='object'||Array.isArray(record.payload))
   fail('retained_payload_missing')
  // source_version_hash is a DATABASE-computed retained-envelope digest. JS must not recreate JSONB hashes.
  if(!hashPattern.test(record.source_version_hash??''))fail('retained_database_digest_missing')
  const span=e.source_span
  if(!span||!['title','summary','body_text'].includes(span.source_field)||
     !Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start||
     !hashPattern.test(span.excerpt_sha256??'')) fail('source_span_binding_missing')
  const scopeBase={source_project:sourceProject,material_ref:kind+':'+record.id,material_version:record.source_version_hash,
   source_version:record.id,audience:'isolated_internal_review'}
  const receipts=[]
  // Both processing-needed retention/analysis and bounded internal display need their own permissions.
  for(const operation of ['retention','analysis','excerpt_display']) for(const domain of ['rights','privacy']) {
   const scope={...scopeBase,operation,domain}
   let receipt
   try { receipt=await readPermission(scope) } catch { fail('permission_reader_unavailable') }
   if(receipt?.allowed!==true)fail('operation_denied:'+operation+':'+domain)
   // Caller-selected mode does not elevate a receipt. Real receipts require the authoritative adapter's
   // exact scope and material binding, admission revision and immutable primary-evidence references.
   if(mode==='real') {
    if(receipt.synthetic!==false||receipt.reason!=='real_evidence_bound'||!text(receipt.admission_revision)||
       !Array.isArray(receipt.primary_evidence_refs)||!receipt.primary_evidence_refs.length||
       !receipt.primary_evidence_refs.every(text))fail('real_permission_binding_unavailable')
   } else if(receipt.synthetic!==true||receipt.reason!=='synthetic_mechanism_only')fail('synthetic_scope_required')
   if(!text(receipt.revision)||!receipt.scope||
      Object.keys(scope).some(k=>receipt.scope[k]!==scope[k])||
      Object.keys(receipt.scope).some(k=>!Object.hasOwn(scope,k)))
    fail('permission_scope_or_revision_mismatch')
   receipts.push({operation,domain,revision:receipt.revision,synthetic:receipt.synthetic,
    admission_revision:receipt.admission_revision??null,primary_evidence_refs:receipt.primary_evidence_refs??[]})
  }
  // Do not inspect/extract a passage until every required operation is authorized.
  let excerpt
  if(readExcerpt) {
   let retained
   try { retained=await readExcerpt({workspaceVersion:bundle.version.id,position:e.input_position,span:{...span},sourceProject}) }
   catch { fail('retained_excerpt_unavailable') }
   if(retained?.material_hash!==record.source_version_hash||retained.material_version!==record.id||
      retained.input_position!==e.input_position||retained.source_field!==span.source_field||
      retained.start!==span.start||retained.end!==span.end||typeof retained.excerpt!=='string')
    fail('retained_excerpt_response_mismatch')
   excerpt=retained.excerpt
  } else {
   const raw=record.payload[span.source_field]
   if(typeof raw!=='string')fail('retained_field_missing')
   const points=Array.from(raw)
   if(span.end>points.length)fail('source_span_out_of_bounds')
   excerpt=points.slice(span.start,span.end).join('')
  }
  if(await hashText(excerpt)!==span.excerpt_sha256)fail('source_span_hash_mismatch')
  bindings.push({evidence_id:e.id,input_position:e.input_position,record_kind:kind,material_version:record.id,
   material_hash:record.source_version_hash,source_span:{...span},permissions:receipts,
   // Internal permitted display only; callers must never log this prepared response.
   excerpt})
 }
 // Favoring a hypothesis must have an inspectable supporting inference, not allegation repetition alone.
 if(assessment.comparison.state==='better_supported'&&assessment.comparison.favored_ids.some(id=>
    !assessment.arguments.some(a=>a.hypothesis_id===id&&a.relation==='supports'&&a.evidence_ids.length)))
  fail('favored_hypothesis_without_supporting_argument')
 return {status:'prepared_requires_atomic_acceptance',synthetic:mode==='synthetic_qualification',
  investigation_id:bundle.investigation_id,workspace_version_id:bundle.version.id,observation_id:bundle.observation.id,
  assessment_id:assessment.id,bindings,publication_allowed:false,
  limitation:'Preparation is not a committed assessment or current-authority acceptance receipt.'}
}
