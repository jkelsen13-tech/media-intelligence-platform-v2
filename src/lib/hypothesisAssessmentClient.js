import {validateHypothesisAssessment,assessmentInstant} from './hypothesisAssessment.js'
// Inject an authenticated transport. No live endpoint, credential or persistent browser cache.
export function createHypothesisAssessmentClient(transport) {
 async function call(action,input) {
  if(typeof transport!=='function')return{data:null,error:{code:'not_configured'}}
  try {
   const result=await transport(action,input)
   if(result?.error) {
    const code=result.error.code
    return{data:null,error:{code:['authentication_required','access_denied','version_conflict','invalid_request','origin_denied','service_unavailable'].includes(code)?code:'request_failed'}}
   }
   return{data:result?.data??null,error:null}
  }catch{return{data:null,error:{code:'request_failed'}}}
 }
 return Object.freeze({
  history:investigationId=>call('history',{investigation_id:investigationId}),
  backlog:investigationId=>call('backlog',{investigation_id:investigationId}),
  reconcile:investigationId=>call('reconcile',{investigation_id:investigationId}),
  append:input=>call('append',input),
 })
}
export function hypothesisHistoryView(history,backlog,investigationId) {
 if(history?.contract_version!=='mip_hypothesis_history_v1'||history.investigation_id!==investigationId||
  history.publication_allowed!==false||history.temporal_scope!=='retained_versions_only'||
  history.historical_commit_visibility_qualified!==false||!Array.isArray(history.entries))return null
 const ids=new Set()
 for(const [i,e]of history.entries.entries()) {
  if(typeof e?.revision_id!=='string'||!e.revision_id||ids.has(e.revision_id)||e.revision!==i+1||assessmentInstant(e.completed_at)===null)return null
  ids.add(e.revision_id)
  if(e.status==='withheld') {
   if(Object.hasOwn(e,'assessment')||!['missing_acceptance_binding','current_permission_or_binding_denied','permission_binding_changed_fresh_review_required'].includes(e.reason))return null
  }else if(e.status!=='available'||!validateHypothesisAssessment(e.assessment).valid||
   e.assessment.question_id!==investigationId||e.assessment.id!==e.revision_id||e.assessment.revision!==e.revision||
   e.assessment.completed_at!==e.completed_at||e.assessment.predecessor_id!==(i===0?null:history.entries[i-1].revision_id)||
   typeof e.current_context!=='boolean'||e.reassessment_pending!==!e.current_context)return null
 }
 if(backlog?.contract_version!=='mip_hypothesis_reassessment_backlog_v1'||backlog.investigation_id!==investigationId||
  backlog.publication_allowed!==false||backlog.completed_reassessment!==false||
  !['retained_causes_only','current_head_watch_scope_at_reconciliation'].includes(backlog.coverage)||!Array.isArray(backlog.causes))return null
 const causes=new Set()
 for(const c of backlog.causes) {
  if(typeof c?.cause_id!=='string'||!c.cause_id||causes.has(c.cause_id)||!ids.has(c.revision_id)||
   !['retained_source_change','retained_assessment_change','workspace_changed','permission_changed'].includes(c.kind)||
   c.state!=='pending_explicit_reconciliation')return null
  causes.add(c.cause_id)
 }
 return{entries:history.entries,causes:backlog.causes}
}
