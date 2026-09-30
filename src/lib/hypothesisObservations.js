import {assessmentInstant,validateHypothesisAssessment} from './hypothesisAssessment.js'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))
const receiptKeys=['contract_version','investigation_id','observation_id','epoch','reference_hash','revision_count',
 'observation_started_at','observation_finished_at','temporal_scope','arbitrary_time_qualified','requires_committed_readback','publication_allowed']
export function validObservationReceipt(r,iid,id=r?.observation_id){
 if(!exact(r,receiptKeys)||!uuid(iid)||!uuid(id)||r.investigation_id!==iid||r.observation_id!==id||!uuid(r.epoch)||
  r.contract_version!=='mip_hypothesis_observation_receipt_v1'||r.temporal_scope!=='committed_revisions_observed'||
  r.arbitrary_time_qualified!==false||r.requires_committed_readback!==true||r.publication_allowed!==false||
  typeof r.reference_hash!=='string'||!/^[0-9a-f]{64}$/.test(r.reference_hash)||
  !Number.isSafeInteger(r.revision_count)||r.revision_count<0)return false
 const start=assessmentInstant(r.observation_started_at),end=assessmentInstant(r.observation_finished_at)
 return start!==null&&end!==null&&start<=end
}
export const sameObservationReceipt=(a,b)=>receiptKeys.every(k=>a?.[k]===b?.[k])
export function observationListView(data,iid){
 if(!uuid(iid)||!exact(data,['contract_version','investigation_id','epoch','receipts','current_user_only','arbitrary_time_qualified','publication_allowed'])||
  data.contract_version!=='mip_hypothesis_observation_list_v1'||data.investigation_id!==iid||!uuid(data.epoch)||
  data.current_user_only!==true||data.arbitrary_time_qualified!==false||data.publication_allowed!==false||!Array.isArray(data.receipts))return null
 const ids=new Set()
 for(const r of data.receipts){
  if(!validObservationReceipt(r,iid)||r.epoch!==data.epoch||ids.has(r.observation_id))return null
  ids.add(r.observation_id)
 }
 return data.receipts
}
async function sha256(text){
 const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function observedHistoryView(data,iid,id,expected=null,digest=sha256){
 try{
  if(!exact(data,['contract_version','receipt','entries','reference_text','committed_readback','observation_membership_qualified',
   'arbitrary_time_qualified','current_user_only','publication_allowed'])||
   data.contract_version!=='mip_hypothesis_observed_history_v2'||data.committed_readback!==true||
   data.observation_membership_qualified!==true||data.arbitrary_time_qualified!==false||data.current_user_only!==true||
   data.publication_allowed!==false||!validObservationReceipt(data.receipt,iid,id)||
   (expected&&!sameObservationReceipt(expected,data.receipt))||typeof data.reference_text!=='string'||
   !Array.isArray(data.entries)||data.entries.length!==data.receipt.revision_count)return null
  if(await digest(data.reference_text)!==data.receipt.reference_hash)return null
  const refs=JSON.parse(data.reference_text)
  if(!Array.isArray(refs)||refs.length!==data.entries.length)return null
  const ids=new Set()
  for(const [index,e]of data.entries.entries()){
   const r=refs[index]
   if(!exact(r,['revision_id','revision','observed_status'])||!uuid(r.revision_id)||r.revision!==index+1||
    !['available','withheld'].includes(r.observed_status)||ids.has(r.revision_id)||!e||
    e.revision_id!==r.revision_id||e.revision!==r.revision||e.observed_status!==r.observed_status)return null
   ids.add(r.revision_id)
   if(e.status==='withheld'){
    if(Object.hasOwn(e,'assessment')||!['withheld_at_observation','missing_acceptance_binding','current_permission_or_binding_denied',
     'permission_binding_changed_fresh_review_required'].includes(e.reason))return null
   }else if(e.status!=='available'||r.observed_status!=='available'||!validateHypothesisAssessment(e.assessment).valid||
    e.assessment.question_id!==iid||e.assessment.id!==e.revision_id||e.assessment.revision!==e.revision||
    e.assessment.completed_at!==e.completed_at||e.assessment.predecessor_id!==(index?refs[index-1].revision_id:null)||
    typeof e.current_context!=='boolean'||e.reassessment_pending!==!e.current_context)return null
  }
  return{receipt:data.receipt,entries:data.entries}
 }catch{return null}
}
