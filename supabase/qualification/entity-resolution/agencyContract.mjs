import {QUALIFICATION} from './mentionContract.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const fail=()=>{throw new Error('agency_contract_denied')}
const bounded=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.length<=n
const score=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1
function keys(o,names){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join('|')!==names.split('|').sort().join('|'))fail()}
function ids(xs,min,max){if(!Array.isArray(xs)||xs.length<min||xs.length>max||!xs.every(uuid)||new Set(xs).size!==xs.length)fail()}
function revision(x){if(!uuid(x.scope)||!uuid(x.id)||!Number.isSafeInteger(x.version)||x.version<1||(x.version===1?x.predecessor_id!==null:!uuid(x.predecessor_id)))fail()}
const result=()=>Object.freeze({...QUALIFICATION,documented_fact:false,attribution_kind:'reviewed_interpretation'})
export function validateActorRevision(x){
 keys(x,'scope|id|actor_id|version|predecessor_id|label|kind|evidence|reason');revision(x)
 if(!uuid(x.actor_id)||!bounded(x.label,256)||!['person','organization','collective','unknown'].includes(x.kind)||!bounded(x.reason,4096))fail()
 ids(x.evidence,1,16);return result()
}
export function validateAgency(x){
 keys(x,'scope|id|action_mention|participant_mention|role|version|predecessor_id|action_kind|status|choices|evidence|role_confidence|evidence_quality|evidence_relevance|assessment_confidence|reason')
 revision(x)
 if(!uuid(x.action_mention)||!uuid(x.participant_mention)||!['speaker','addressee','agent','principal','beneficiary','affected_actor'].includes(x.role)||
 !['direct_action','attributed_action'].includes(x.action_kind)||!['unresolved','proposed','accepted','rejected'].includes(x.status)||!bounded(x.reason,4096))fail()
 for(const k of ['role_confidence','evidence_quality','evidence_relevance','assessment_confidence'])if(!score(x[k]))fail()
 ids(x.evidence,1,16)
 if(!Array.isArray(x.choices)||x.choices.length>8)fail()
 if(x.status==='accepted'?x.choices.length!==1:x.status==='proposed'?x.choices.length===0:x.choices.length!==0)fail()
 const seen=new Set()
 for(const c of x.choices){
  keys(c,'candidate_id|decision_id|actor_revision_id|identity_confidence')
  if(!uuid(c.candidate_id)||!uuid(c.actor_revision_id)||!score(c.identity_confidence)||seen.has(c.candidate_id)||
   (c.decision_id!==null&&!uuid(c.decision_id))||(x.status==='accepted'&&c.decision_id===null))fail()
  seen.add(c.candidate_id)
 }
 // Shape validation conveys no authority: the database must revalidate current
 // membership, source bytes/access, identity heads and actor revision.
 return result()
}
