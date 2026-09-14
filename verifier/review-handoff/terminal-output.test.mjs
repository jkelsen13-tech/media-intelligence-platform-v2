import test from 'node:test';
import assert from 'node:assert/strict';
import {reserve,accept} from './controller.mjs';
import {receive} from './protocol.mjs';
import {controllerFixture,protocolFixture,memoryStore} from './fixtures.mjs';
// Inputs are synthetic, including the embedded otherwise-valid PASS report.
// The APIs accept report objects, not provider text. Do not parse, normalize,
// unwrap terminal provider state, or search narrative for an embedded verdict.
const cases=[
 ['raw narrative',()=> 'Synthetic review is unfinished; this is a narrative handoff.'],
 ['narrative containing complete bound PASS JSON',report=>'Synthetic narrative before\n```json\n'+JSON.stringify(report)+'\n```\nSynthetic narrative after'],
 ['narrative containing an unfilled output template',()=> 'Synthetic template: {"outcome":"CHOOSE_PASS_FAIL_OR_BLOCKED","coverage":"REVIEWER_FILL"}'],
 ['partial JSON',report=>JSON.stringify(report).slice(0,-1)],
 ['provider FINISHED wrapper',report=>({status:'FINISHED',result:report})],
];
for(const [name,output] of cases){
 test('controller rejects repeated '+name+' before result persistence or a delivery decision',async()=>{
  const {q,r}=controllerFixture(),store=memoryStore();
  await reserve(store,q);
  const reserved=[...store.rows],get=store.get,create=store.create;
  let reads=0,writes=0,accepted=0;
  store.get=async key=>{reads++;return get(key)};
  store.create=async(key,value)=>{writes++;return create(key,value)};
  const report=output(r);
  for(let delivery=0;delivery<2;delivery++){
   await assert.rejects(async()=>{
    const decision=await accept(store,q,report,{kind:'synthetic-test-double'});
    accepted++;return decision;
   },/object|schema/);
  }
  assert.equal(accepted,0); // No outcome, remediation proposal or deliveryKey returned.
  assert.equal(reads,0);assert.equal(writes,0);
  assert.deepEqual([...store.rows],reserved);
  assert.equal(store.rows.has('result/'+q.request),false);
 });
 test('protocol rejects repeated '+name+' before putOnce or accepted outcome',async()=>{
  const args=protocolFixture();args[3]=output(args[3]);
  let writes=0,accepted=0;
  const store={putOnce:async()=>{writes++}};
  for(let delivery=0;delivery<2;delivery++){
   await assert.rejects(async()=>{
    const decision=await receive(args,store);accepted++;return decision;
   },/object|schema/);
  }
  assert.equal(accepted,0);assert.equal(writes,0);
 });
}
