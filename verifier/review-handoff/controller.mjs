import {createHash} from 'node:crypto';
const check=(v,c)=>{if(!v)throw Error(c)};
const obj=(v,keys)=>{check(v && Object.getPrototypeOf(v)===Object.prototype,'object');check(Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'),'schema')};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=v=>typeof v==='string'&&v.length>0&&v.length<=4000;
export function requestKey(request) {return digest(request)}
export function validateRequest(q) {
 obj(q,'version synthetic request candidate packet implementer reviewer model requirements controller');
 check(q.version===1&&q.synthetic===true,'real_activation_disabled');
 check(id(q.request)&&sha(q.candidate)&&sha(q.controller)&&/^[a-f0-9]{64}$/.test(q.packet),'binding');
 check(id(q.implementer)&&id(q.reviewer)&&q.implementer!==q.reviewer&&id(q.model),'independence');
 check(Array.isArray(q.requirements)&&q.requirements.length>0&&q.requirements.every(id)&&new Set(q.requirements).size===q.requirements.length,'requirements');
}
export function validateReport(q,r) {
 validateRequest(q);
 obj(r,'version synthetic requestKey candidate packet reviewer model outcome coverage findings blockers');
 check(r.version===1&&r.synthetic===true&&r.requestKey===requestKey(q)&&r.candidate===q.candidate&&r.packet===q.packet&&r.reviewer===q.reviewer&&r.model===q.model,'report_binding');
 check(['PASS','FAIL','BLOCKED'].includes(r.outcome),'outcome');
 check(Array.isArray(r.coverage)&&r.coverage.length===q.requirements.length&&new Set(r.coverage.map(x=>x.id)).size===q.requirements.length,'coverage');
 for(const c of r.coverage) {
  obj(c,'id status evidenceClass references');
  check(q.requirements.includes(c.id)&&['PASS','FAIL','BLOCKED','NOT_TESTED'].includes(c.status),'coverage');
  check(['artifact_inspection','independently_reproduced_this_run','supplied_implementation_agent_result','missing_evidence','NOT_TESTED','BLOCKED'].includes(c.evidenceClass),'evidence_class');
  check(Array.isArray(c.references)&&c.references.every(x=>typeof x==='string'&&new RegExp('^packet:'+q.packet+'/[a-zA-Z0-9_-]+$').test(x)),'references');
  if(c.status==='PASS')check(c.references.length>0&&['artifact_inspection','independently_reproduced_this_run'].includes(c.evidenceClass),'unsupported_pass');
 }
 check(Array.isArray(r.findings)&&Array.isArray(r.blockers),'details');
 check(new Set(r.findings.map(x=>x.id)).size===r.findings.length,'duplicate_finding');
 for(const f of r.findings) {
  obj(f,'id requirement severity summary evidence remediation');
  check(id(f.id)&&q.requirements.includes(f.requirement)&&['low','medium','high','critical'].includes(f.severity)&&text(f.summary)&&text(f.remediation),'finding');
  check(Array.isArray(f.evidence)&&f.evidence.length>0&&f.evidence.every(x=>r.coverage.find(c=>c.id===f.requirement).references.includes(x)),'finding_evidence');
 }
 for(const b of r.blockers) {
  obj(b,'kind requirement detail');
  check(['engineering','missing_evidence','owner_decision','permission','disclosure','production','spending'].includes(b.kind)&&q.requirements.includes(b.requirement)&&text(b.detail),'blocker');
 }
 if(r.outcome==='PASS')check(!r.findings.length&&!r.blockers.length&&r.coverage.every(c=>c.status==='PASS'),'false_pass');
 if(r.outcome==='FAIL')check(r.findings.length>0&&r.coverage.some(c=>c.status==='FAIL'),'unsupported_fail');
 if(r.outcome==='BLOCKED')check(r.blockers.length>0&&r.coverage.some(c=>['BLOCKED','NOT_TESTED'].includes(c.status)),'unsupported_blocked');
 return {outcome:r.outcome,synthetic:true,merge:false,approve:false,publish:false,
  proposedAction:r.blockers.some(b=>['owner_decision','permission','disclosure','production','spending'].includes(b.kind))?'owner_required':r.outcome==='PASS'?'continue_authorized_engineering':r.outcome==='FAIL'?'remediate_new_candidate':'continue_other_authorized_work'};
}
// Adapter contract: get(key) and atomic create(key, bytes), never overwrite.
// This module has no credentials, provider calls, GitHub mutations or wakeup API.
// Synthetic lifecycle allows testing crash boundaries before wiring trusted adapters.
export async function reserve(store,q) {
 validateRequest(q); const key='request/'+q.request, bytes=JSON.stringify(q);
 const existing=await store.get(key);
 if(existing!==undefined){check(existing===bytes,'request_conflict');return {created:false,key}}
 try{await store.create(key,bytes);return {created:true,key}}
 catch(e){if(await store.get(key)===bytes)return {created:false,key};throw e}
}
export async function accept(store,q,r,transport) {
 const decision=validateReport(q,r);
 // No caller-controlled verified=true can activate a real review.
 check(transport?.kind==='synthetic-test-double','real_transport_disabled');
 check(await store.get('request/'+q.request)===JSON.stringify(q),'not_reserved');
 const key='result/'+q.request, bytes=JSON.stringify(r), old=await store.get(key);
 if(old!==undefined)check(old===bytes,'result_conflict');
 else try{await store.create(key,bytes)}catch(e){check(await store.get(key)===bytes,'result_conflict')}
 // Result remains durable if delivery crashes. Redelivery uses this exact key.
 return {...decision,deliveryKey:digest({request:requestKey(q),result:digest(r)})};
}
