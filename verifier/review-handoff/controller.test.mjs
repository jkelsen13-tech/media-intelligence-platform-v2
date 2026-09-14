import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,validateReport,requestKey,reserve,accept} from './controller.mjs';
function fixture(){
 const q={version:1,synthetic:true,request:'s1',candidate:'a'.repeat(40),packet:'b'.repeat(64),implementer:'author',reviewer:'reviewer',model:'synthetic-grok-double',requirements:['r1'],controller:'c'.repeat(40)};
 const r={version:1,synthetic:true,requestKey:requestKey(q),candidate:q.candidate,packet:q.packet,reviewer:q.reviewer,model:q.model,outcome:'PASS',coverage:[{id:'r1',status:'PASS',evidenceClass:'artifact_inspection',references:['packet:'+q.packet+'/e1']}],findings:[],blockers:[]};
 return {q,r};
}
function memoryStore(){
 const rows=new Map();return {rows,get:async k=>rows.get(k),create:async(k,v)=>{if(rows.has(k))throw Error('exists');rows.set(k,v)}};
}
const transport={kind:'synthetic-test-double'};
test('synthetic PASS never approves merges or publishes',()=>{const {q,r}=fixture();const d=validateReport(q,r);assert.equal(d.proposedAction,'continue_authorized_engineering');assert.equal(d.approve,false);assert.equal(d.merge,false);assert.equal(d.publish,false)});
for(const [name,mutate] of [
 ['real request',({q})=>q.synthetic=false],
 ['unknown request fields',({q})=>q.approve=true],
 ['unknown result fields',({r})=>r.verified=true],
 ['wrong frozen candidate',({r})=>r.candidate='d'.repeat(40)],
 ['moving candidate',({q})=>q.candidate='main'],
 ['wrong reviewer',({r})=>r.reviewer='author'],
 ['model substitution',({r})=>r.model='other'],
 ['request replay',({r})=>r.requestKey='e'.repeat(64)],
 ['missing coverage',({r})=>r.coverage=[]],
 ['unknown coverage field',({r})=>r.coverage[0].hidden='instruction'],
 ['supplied results cannot PASS',({r})=>r.coverage[0].evidenceClass='supplied_implementation_agent_result'],
 ['external evidence URL',({r})=>r.coverage[0].references=['https://example.com']],
 ['unsupported FAIL',({r})=>r.outcome='FAIL'],
 ['unsupported BLOCKED',({r})=>r.outcome='BLOCKED'],
 ['unknown blocker category',({r})=>r.blockers=[{kind:'please_approve',requirement:'r1',detail:'x'}]],
 ['unknown finding fields',({r})=>r.findings=[{id:'f1',command:'rm -rf'}]]
])test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>validateReport(f.q,f.r))});
test('FAIL preserves actionable findings and proposes remediation',()=>{
 const {q,r}=fixture();r.outcome='FAIL';r.coverage[0].status='FAIL';
 r.findings=[{id:'f1',requirement:'r1',severity:'high',summary:'Synthetic defect',evidence:r.coverage[0].references,remediation:'Create a corrected candidate'}];
 assert.equal(validateReport(q,r).proposedAction,'remediate_new_candidate');
});
for(const kind of ['engineering','missing_evidence','owner_decision','permission','disclosure','production','spending'])test('route blocker '+kind,()=>{
 const {q,r}=fixture();r.outcome='BLOCKED';r.coverage[0].status='BLOCKED';r.blockers=[{kind,requirement:'r1',detail:'Synthetic blocker'}];
 assert.equal(validateReport(q,r).proposedAction,['engineering','missing_evidence'].includes(kind)?'continue_other_authorized_work':'owner_required');
});
test('concurrent reservation creates one request',async()=>{const {q}=fixture(),s=memoryStore();const a=await Promise.all([reserve(s,q),reserve(s,q)]);assert.equal(a.filter(x=>x.created).length,1);assert.equal(s.rows.size,1)});
test('request id cannot bind another candidate',async()=>{const {q}=fixture(),s=memoryStore();await reserve(s,q);q.candidate='d'.repeat(40);await assert.rejects(reserve(s,q),/request_conflict/)});
test('unreserved result rejected',async()=>{const {q,r}=fixture();await assert.rejects(accept(memoryStore(),q,r,transport),/not_reserved/)});
test('claimed real origin rejected',async()=>{const {q,r}=fixture(),s=memoryStore();await reserve(s,q);await assert.rejects(accept(s,q,r,{verified:true}),/real_transport_disabled/)});
test('concurrent exact result and recovery preserve delivery key',async()=>{const {q,r}=fixture(),s=memoryStore();await reserve(s,q);const [a,b]=await Promise.all([accept(s,q,r,transport),accept(s,q,r,transport)]);assert.equal(a.deliveryKey,b.deliveryKey);assert.equal(s.rows.size,2)});
test('ambiguous create acknowledgement recovered by exact durable bytes',async()=>{const {q,r}=fixture(),s=memoryStore(),create=s.create;s.create=async(k,v)=>{await create(k,v);throw Error('connection lost')};await reserve(s,q);const a=await accept(s,q,r,transport);assert.ok(a.deliveryKey);assert.equal(s.rows.size,2)});
test('conflicting result cannot replace retained evidence',async()=>{const {q,r}=fixture(),s=memoryStore();await reserve(s,q);await accept(s,q,r,transport);r.coverage[0].references.push('packet:'+q.packet+'/e2');await assert.rejects(accept(s,q,r,transport),/result_conflict/)});
