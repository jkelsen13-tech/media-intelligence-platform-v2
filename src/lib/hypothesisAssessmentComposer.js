import {HYPOTHESIS_CONTRACT,assessmentInstant,validateHypothesisAssessment} from './hypothesisAssessment.js'
const text=x=>typeof x==='string'&&x.trim().length>0
const unique=xs=>new Set(xs).size===xs.length
export const UNESTIMATED_REASON='No approved estimation method is bound to this authoring session.'
export const missingEstimate=()=>({kind:'not_estimated',reason:UNESTIMATED_REASON})
export function validAuthoringContext(c,investigationId,workspaceVersionId) {
 if(c?.contract_version!=='mip_hypothesis_authoring_v1'||c.investigation_id!==investigationId||c.workspace_version_id!==workspaceVersionId||
  !text(c.observation_id)||!text(c.question)||c.access_role!=='reviewer'||c.publication_allowed!==false||c.review_state!=='unreviewed'||
  c.historical_commit_visibility_qualified!==false||c.recording_method!=='human-argument-entry-v1'||c.model_version!=='none'||
  !Array.isArray(c.estimation_methods)||c.estimation_methods.length||assessmentInstant(c.knowledge_cutoff)===null||
  !Array.isArray(c.materials)||!unique(c.materials.map(m=>m?.input_position)))return false
 if(c.head!==null&&(!text(c.head?.revision_id)||!Number.isSafeInteger(c.head.revision)||c.head.revision<1||
  !['available','withheld'].includes(c.head.status)||Object.hasOwn(c.head,'assessment')))return false
 for(const m of c.materials) if(!/^[1-9][0-9]*$/.test(m?.input_position)||!text(m.material_version)||!/^[a-f0-9]{64}$/.test(m.material_hash)||
  assessmentInstant(m.acquired_at)===null||assessmentInstant(m.acquired_at)>assessmentInstant(c.knowledge_cutoff)||
  !['checked_current','blocked'].includes(m.permission_state)||!Array.isArray(m.fields)||!unique(m.fields.map(f=>f?.name))||
  m.fields.some(f=>!['title','summary','body_text'].includes(f?.name)||!Number.isSafeInteger(f.length)||f.length<0))return false
 const b=c.backlog
 return b?.contract_version==='mip_hypothesis_reassessment_backlog_v2'&&b.investigation_id===investigationId&&b.publication_allowed===false&&
  b.completed_reassessment===false&&b.is_completion_receipt===false&&Array.isArray(b.causes)&&unique(b.causes.map(x=>x?.cause_id))&&
  b.causes.every(x=>text(x?.cause_id)&&text(x.revision_id)&&['pending_explicit_reconciliation','reassessment_recorded'].includes(x.state)&&
   ['retained_source_change','retained_assessment_change','workspace_changed','permission_changed','human_reconsideration'].includes(x.kind))
}
export function newHypothesis(id) {return{id,definition:'',likelihood:missingEstimate(),confidence:missingEstimate()}}
export function newArgument(id,hypothesisId) {return{id,hypothesis_id:hypothesisId,relation:'context',evidence_ids:[],inference:'',limitation:'',relevance:missingEstimate()}}
export function createAssessmentDraft(context,id=()=>globalThis.crypto.randomUUID()) {
 if(!validAuthoringContext(context,context?.investigation_id,context?.workspace_version_id))throw new Error('invalid_authoring_context')
 const r={contract_version:HYPOTHESIS_CONTRACT,id:id(),question_id:context.investigation_id,question:context.question,
  revision:(context.head?.revision??0)+1,predecessor_id:context.head?.revision_id??null,
  knowledge_cutoff:context.knowledge_cutoff,completed_at:context.knowledge_cutoff,
  method_version:context.recording_method,model_version:context.model_version,review_state:'unreviewed',release_state:'private',
  hypotheses:[newHypothesis(id()),newHypothesis(id())],hypothesis_relationship:'not_established',
  comparison:{state:'',favored_ids:[],rationale:'',main_limitation:'',confidence:missingEstimate()},
  evidence:[],arguments:[],assumptions:[],gaps:[],change_tests:[],
  revision_trigger:context.head?'':'initial',revision_effect:context.head?'':'initial',revision_reason:''}
 const pending=context.backlog.causes.filter(c=>c.state==='pending_explicit_reconciliation')
 if(context.head)r.reassessment_causes=pending.map(c=>({cause_id:c.cause_id,reason:''}))
 return r
}
export function bindComposerSpan(context,input,result,evidenceId) {
 const m=context.materials.find(x=>x.input_position===input.input_position)
 const field=m?.fields.find(x=>x.name===input.source_field)
 if(!m||m.permission_state!=='checked_current'||!field||!Number.isSafeInteger(input.start)||!Number.isSafeInteger(input.end)||input.start<0||input.end<=input.start||
  input.end>field.length||input.end-input.start>2000||result?.contract_version!=='mip_hypothesis_authoring_span_v1'||
  result.investigation_id!==context.investigation_id||result.workspace_version_id!==context.workspace_version_id||
  result.observation_id!==context.observation_id||result.publication_allowed!==false||result.input_position!==m.input_position||
  result.material_version!==m.material_version||result.material_hash!==m.material_hash||result.source_field!==input.source_field||
  result.start!==input.start||result.end!==input.end||result.acquired_at!==m.acquired_at||
  (result.published_at??null)!==(m.published_at??null)||(result.event_time??null)!==(m.event_time??null)||
  typeof result.excerpt!=='string'||Array.from(result.excerpt).length!==input.end-input.start||
  !/^[a-f0-9]{64}$/.test(result.excerpt_sha256))throw new Error('unbound_authoring_span')
 return{id:evidenceId,input_position:m.input_position,material_version:m.material_version,acquired_at:m.acquired_at,
  published_at:m.published_at??null,event_time:m.event_time??null,origin_group:null,documented_claim:'',quality:missingEstimate(),
  source_span:{source_field:input.source_field,start:input.start,end:input.end,excerpt_sha256:result.excerpt_sha256}}
}
export function buildComposerSubmission(context,draft,requestId) {
 const c=structuredClone(draft)
 for(const key of ['assumptions','gaps','change_tests'])if(Array.isArray(c[key]))c[key]=c[key].map(x=>x.trim()).filter(Boolean)
 if(!validAuthoringContext(context,context.investigation_id,context.workspace_version_id)||
  c.question_id!==context.investigation_id||c.question!==context.question||c.predecessor_id!==(context.head?.revision_id??null)||
  c.revision!==(context.head?.revision??0)+1||c.knowledge_cutoff!==context.knowledge_cutoff||c.completed_at!==context.knowledge_cutoff||
  c.method_version!==context.recording_method||c.model_version!=='none'||c.review_state!=='unreviewed'||c.release_state!=='private')throw new Error('authoring_scope_changed')
 const ratings=[c.comparison?.confidence,...c.hypotheses.flatMap(h=>[h.likelihood,h.confidence]),...c.evidence.map(e=>e.quality),...c.arguments.map(a=>a.relevance)]
 if(ratings.some(r=>r?.kind!=='not_estimated'))throw new Error('estimation_method_unavailable')
 for(const e of c.evidence) {
  const m=context.materials.find(x=>x.input_position===e.input_position),s=e.source_span,f=m?.fields.find(x=>x.name===s?.source_field)
  if(!m||m.permission_state!=='checked_current'||!f||e.material_version!==m.material_version||e.acquired_at!==m.acquired_at||e.origin_group!==null||
   (e.published_at??null)!==(m.published_at??null)||(e.event_time??null)!==(m.event_time??null)||
   !Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<0||s.end<=s.start||s.end>f.length||
   s.end-s.start>2000||!/^[a-f0-9]{64}$/.test(s.excerpt_sha256))throw new Error('unbound_authoring_evidence')
 }
 const pending=context.backlog.causes.filter(x=>x.state==='pending_explicit_reconciliation').map(x=>x.cause_id).sort()
 if(context.head&&(!pending.length||JSON.stringify(c.reassessment_causes?.map(x=>x.cause_id).sort())!==JSON.stringify(pending)))
  throw new Error('record_reassessment_request_first')
 if(c.comparison?.state==='better_supported'&&c.comparison.favored_ids.some(h=>!c.arguments.some(a=>a.hypothesis_id===h&&a.relation==='supports')))
  throw new Error('supporting_argument_required')
 const validation=validateHypothesisAssessment(c)
 if(!validation.valid)throw new Error(validation.reason)
 return{action:context.head?'complete':'append',input:{investigation_id:context.investigation_id,workspace_version_id:context.workspace_version_id,
  request_id:requestId,predecessor_id:c.predecessor_id,assessment:c}}
}

export async function verifyComposerSpan(context,input,result,evidenceId) {
 const bound=bindComposerSpan(context,input,result,evidenceId)
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(result.excerpt))
 if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==result.excerpt_sha256)throw new Error('authoring_excerpt_hash_mismatch')
 return bound
}

function stable(value) {
 if(Array.isArray(value))return value.map(stable)
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]))
 return value
}
export function validComposerReceipt(context,submission,result) {
 const a=result?.assessment
 if(result?.publication_allowed!==false||result.workspace_version_id!==context.workspace_version_id||result.observation_id!==context.observation_id||
  !validateHypothesisAssessment(a).valid||typeof result.current_context!=='boolean'||typeof result.reassessment_pending!=='boolean')return false
 const expected={...submission.input.assessment},actual={...a}
 delete expected.id;delete expected.completed_at;delete actual.id;delete actual.completed_at
 if(JSON.stringify(stable(actual))!==JSON.stringify(stable(expected)))return false
 if(submission.action==='complete') {
  const receipt=result.completion_receipt
  if(result.completed_reassessment!==true||receipt?.request_id!==submission.input.request_id||receipt.revision_id!==a.id||
   !Array.isArray(receipt.cause_ids)||JSON.stringify([...receipt.cause_ids].sort())!==JSON.stringify(submission.input.assessment.reassessment_causes.map(c=>c.cause_id).sort()))return false
 }
 return true
}
