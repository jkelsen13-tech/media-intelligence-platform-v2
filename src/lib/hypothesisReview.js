import {assessmentInstant} from './hypothesisAssessment.js'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const keys=['contract_version','investigation_id','request_id','revision_id','revision','previous_receipt_id','receipt_sequence','recorded_at','review_scope','is_approval','resolves_reassessment','publication_allowed']
export function validReviewRecord(r,iid) {
 return !!r&&Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k))&&
  r.contract_version==='mip_hypothesis_review_receipt_v1'&&r.investigation_id===iid&&uuid(iid)&&
  uuid(r.request_id)&&uuid(r.revision_id)&&(r.previous_receipt_id===null||uuid(r.previous_receipt_id))&&
  Number.isSafeInteger(r.revision)&&r.revision>0&&typeof r.receipt_sequence==='string'&&/^[1-9][0-9]*$/.test(r.receipt_sequence)&&
  assessmentInstant(r.recorded_at)!==null&&r.review_scope==='version_acknowledgement_only'&&
  r.is_approval===false&&r.resolves_reassessment===false&&r.publication_allowed===false
}
export function reviewHistoryView(r,iid) {
 if(!r||Object.keys(r).length!==8||r.contract_version!=='mip_hypothesis_review_history_v1'||r.investigation_id!==iid||
  r.current_user_only!==true||r.is_approval!==false||r.resolves_reassessment!==false||r.publication_allowed!==false||
  !Array.isArray(r.entries))return null
 let previous=null,revision=0;const ids=new Set(),targets=new Set()
 for(const [index,e] of r.entries.entries()){
  if(!e||Object.keys(e).length!==2||!['available','withheld'].includes(e.target_status)||!validReviewRecord(e.receipt,iid))return null
  const a=e.receipt
  if(a.previous_receipt_id!==previous||a.receipt_sequence!==String(index+1)||a.revision<=revision||ids.has(a.request_id)||targets.has(a.revision_id))return null
  previous=a.request_id;revision=a.revision;ids.add(a.request_id);targets.add(a.revision_id)
 }
 if(r.latest_receipt_id!==previous)return null
 return{entries:r.entries,latest:r.entries.at(-1)?.receipt??null}
}
export function buildReviewRequest(iid,revisionId,requestId,previousId) {
 if(!uuid(iid)||!uuid(revisionId)||!uuid(requestId)||(previousId!==null&&!uuid(previousId)))throw Error('invalid_review_request')
 return Object.freeze({investigation_id:iid,revision_id:revisionId,request_id:requestId,previous_receipt_id:previousId})
}
export function validReviewReceipt(input,r,revision,sequence) {
 return validReviewRecord(r,input.investigation_id)&&r.request_id===input.request_id&&r.revision_id===input.revision_id&&
  r.previous_receipt_id===input.previous_receipt_id&&r.revision===revision&&r.receipt_sequence===sequence
}
export const sameReviewReceipt=(a,b)=>keys.every(k=>a?.[k]===b?.[k])
