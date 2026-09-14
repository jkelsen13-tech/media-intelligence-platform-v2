import {validAuthoringContext} from './hypothesisAssessmentComposer.js'
import {assessmentInstant} from './hypothesisAssessment.js'
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const text=v=>typeof v==='string'&&v.trim().length>0
export function buildGenerationRequest(context,draft,requestId) {
 if(!validAuthoringContext(context,context.investigation_id,context.workspace_version_id)||!uuid(requestId)||
  draft.question_id!==context.investigation_id||draft.question!==context.question||draft.predecessor_id!==(context.head?.revision_id??null)||
  !Array.isArray(draft.hypotheses)||draft.hypotheses.length<2||draft.hypotheses.length>64||
  draft.hypotheses.some(h=>!text(h?.id)||!text(h.definition))||new Set(draft.hypotheses.map(h=>h.id)).size!==draft.hypotheses.length||
  !['overlapping','mutually_exclusive','not_established'].includes(draft.hypothesis_relationship)||
  !Array.isArray(draft.evidence)||draft.evidence.length>256||new Set(draft.evidence.map(e=>e?.id)).size!==draft.evidence.length)
  throw Error('invalid_generation_request')
 if(context.head&&!context.backlog.causes.some(c=>c.state==='pending_explicit_reconciliation'))throw Error('record_reassessment_request_first')
 const spans=draft.evidence.map(e=>{
  const m=context.materials.find(x=>x.input_position===e.input_position),s=e.source_span,field=m?.fields.find(x=>x.name===s?.source_field)
  if(!text(e.id)||!m||m.permission_state!=='checked_current'||m.material_version!==e.material_version||!field||
   !Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<0||s.end<=s.start||s.end>field.length||s.end-s.start>2000)
   throw Error('unbound_generation_evidence')
  return{id:e.id,input_position:e.input_position,source_field:s.source_field,start:s.start,end:s.end}
 })
 return {investigation_id:context.investigation_id,workspace_version_id:context.workspace_version_id,request_id:requestId,
  spec:{hypotheses:draft.hypotheses.map(h=>({id:h.id,definition:h.definition})),hypothesis_relationship:draft.hypothesis_relationship,spans}}
}
export function validGenerationReceipt(input,r) {
 return !!r&&r.publication_allowed===false&&r.request_id===input.request_id&&r.investigation_id===input.investigation_id&&
  r.workspace_version_id===input.workspace_version_id&&uuid(r.generation_id)&&uuid(r.method_revision)&&
  typeof r.input_hash==='string'&&/^[0-9a-f]{64}$/.test(r.input_hash)&&
  Object.keys(r).every(k=>['generation_id','request_id','investigation_id','workspace_version_id','method_revision','input_hash','publication_allowed'].includes(k))
}
export function generationBacklogView(r,iid) {
 const v2=r?.contract_version==='mip_hypothesis_generation_backlog_v2'
 if((!v2&&r?.contract_version!=='mip_hypothesis_generation_backlog_v1')||r.investigation_id!==iid||r.coverage!=='retained_generation_jobs'||
  r.current_authority_qualified!==false||r.automatic_retry!==false||r.force_cancellation!==false||r.publication_allowed!==false||!Array.isArray(r.entries)||
  Object.keys(r).some(k=>!['contract_version','investigation_id','entries','coverage','current_authority_qualified','automatic_retry','force_cancellation','publication_allowed'].includes(k)))return null
 const seen=new Set()
 for(const e of r.entries) {
  if(!e||!['generation_id','request_id','workspace_version_id','observation_id','method_revision'].every(k=>uuid(e[k]))||seen.has(e.generation_id)||
   !/^[0-9a-f]{64}$/.test(e.input_hash)||!text(e.implementation)||assessmentInstant(e.recorded_at)===null||
   !['pending','processing','completed','failed'].includes(e.state)||typeof e.lease_expired!=='boolean'||typeof e.retained_for_reconciliation!=='boolean'||
   (e.predecessor_id!==null&&!uuid(e.predecessor_id))||(e.completed_revision_id!==null&&!uuid(e.completed_revision_id))||
   (e.state==='completed')!==(e.completed_revision_id!==null)||(e.lease_expired&&e.state!=='processing')||
   (e.block_reason!==null&&e.block_reason!=='current_authority_or_context_unavailable')||
   Object.keys(e).some(k=>!['generation_id','request_id','workspace_version_id','observation_id','predecessor_id','input_hash','method_revision',
    'implementation','state','recorded_at','lease_expired','retained_for_reconciliation','block_reason','completed_revision_id',...(v2?['recovery_prior_generation_id','recovery_generation_id']:[])].includes(k)))return null
  if(v2&&['recovery_prior_generation_id','recovery_generation_id'].some(k=>!Object.hasOwn(e,k)||(e[k]!==null&&(!uuid(e[k])||e[k]===e.generation_id))))return null
  seen.add(e.generation_id)
 }
 if(v2) {
  const byId=new Map(r.entries.map(e=>[e.generation_id,e])),checked=new Set()
  for(const e of r.entries) {
   if(e.recovery_prior_generation_id&&byId.get(e.recovery_prior_generation_id)?.recovery_generation_id!==e.generation_id)return null
   if(e.recovery_generation_id&&byId.get(e.recovery_generation_id)?.recovery_prior_generation_id!==e.generation_id)return null
   const chain=new Set();let cursor=e
   while(cursor&&!checked.has(cursor.generation_id)){if(chain.has(cursor.generation_id))return null;chain.add(cursor.generation_id);cursor=byId.get(cursor.recovery_generation_id)}
   for(const id of chain)checked.add(id)
  }
 }
 return r.entries
}

export function buildRecoveryRequest(context,draft,requestId,priorGenerationId) {
 if(!uuid(priorGenerationId))throw Error('invalid_recovery_generation');
 return {...buildGenerationRequest(context,draft,requestId),prior_generation_id:priorGenerationId};
}
export function validRecoveryReceipt(input,r) {
 if(!r||r.prior_generation_id!==input.prior_generation_id||r.generation_id===input.prior_generation_id||
  !['failed','processing'].includes(r.prior_state)||r.prior_retained!==true||r.force_cancellation!==false||r.automatic_retry!==false)return false;
 const {prior_generation_id,prior_state,prior_retained,force_cancellation,automatic_retry,...capture}=r;
 return validGenerationReceipt(input,capture);
}
