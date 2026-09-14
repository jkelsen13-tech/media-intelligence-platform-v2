import {check,exact,id,hash,digest,requirements,evidenceBinding,fullInventory,coverage,snapshot} from './validation.mjs';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
export function requestKey(request){return digest(request)}
export function validateRequest(q){
 exact(q,'version synthetic request candidate packet implementer reviewer model requirements requirementLayers controller evidence');
 check(q.version===2&&q.synthetic===true,'real_activation_disabled');
 check(id(q.request)&&sha(q.candidate)&&sha(q.controller)&&typeof q.packet==='string'&&/^[a-f0-9]{64}$/.test(q.packet),'binding');
 check(id(q.implementer)&&id(q.reviewer)&&q.implementer!==q.reviewer&&id(q.model),'independence');
 requirements(q);
 check(Array.isArray(q.evidence)&&q.evidence.length>0,'evidence_inventory');
 const ids=new Set(),paths=new Set();
 for(const e of q.evidence){
  exact(e,'id path bytes sha256 role requirements content');
  check(id(e.id)&&!ids.has(e.id)&&!paths.has(e.path),'evidence_identity');
  ids.add(e.id);paths.add(e.path);evidenceBinding(e,q);
  check(typeof e.content==='string','file_binding');
  const bytes=Buffer.from(e.content,'utf8');
  check(bytes.toString('utf8')===e.content&&bytes.length===e.bytes&&hash(bytes)===e.sha256,'file_binding');
 }
 check(q.packet===digest(q.evidence),'packet_binding');
 fullInventory(q,q.evidence);
}
export function validateReport(q,r){
 validateRequest(q);
 exact(r,'version synthetic requestKey candidate packet reviewer model outcome coverage findings blockers');
 check(r.version===2&&r.synthetic===true&&r.requestKey===requestKey(q)&&r.candidate===q.candidate&&r.packet===q.packet&&r.reviewer===q.reviewer&&r.model===q.model,'report_binding');
 coverage(q,r,new Map(q.evidence.map(e=>['packet:'+q.packet+'/'+e.id,e])),'evidenceClass');
 return {outcome:r.outcome,synthetic:true,merge:false,approve:false,publish:false,
  proposedAction:r.blockers.some(b=>['owner_decision','permission','disclosure','production','spending'].includes(b.kind))?'owner_required':r.outcome==='PASS'?'continue_authorized_engineering':r.outcome==='FAIL'?'remediate_new_candidate':'continue_other_authorized_work'};
}
// Synthetic-only lifecycle: adapters supply atomic create and exact get.
// No credentials, real transport, wakeup, approval, merge or publication wiring.
export async function reserve(store,request){
 const q=snapshot(request);validateRequest(q);
 const key='request/'+q.request,bytes=JSON.stringify(q);
 const existing=await store.get(key);
 if(existing!==undefined){check(existing===bytes,'request_conflict');return {created:false,key}}
 try{await store.create(key,bytes);return {created:true,key}}
 catch(e){if(await store.get(key)===bytes)return {created:false,key};throw e}
}
export async function accept(store,request,report,transport){
 const q=snapshot(request),r=snapshot(report);
 const decision=validateReport(q,r);
 check(transport?.kind==='synthetic-test-double','real_transport_disabled');
 const requestBytes=JSON.stringify(q),key='result/'+q.request,bytes=JSON.stringify(r);
 const deliveryKey=digest({request:requestKey(q),result:digest(r)});
 check(await store.get('request/'+q.request)===requestBytes,'not_reserved');
 const old=await store.get(key);
 if(old!==undefined)check(old===bytes,'result_conflict');
 else try{await store.create(key,bytes)}catch(e){check(await store.get(key)===bytes,'result_conflict')}
 return {...decision,deliveryKey};
}
