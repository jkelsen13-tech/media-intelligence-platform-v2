import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReport as oldReport,requestKey as oldKey,reserve as oldReserve,accept as oldAccept} from './baseline-c6dd9ed-controller.mjs';
import {validate as oldValidate,receive as oldReceive} from './baseline-c6dd9ed-protocol.mjs';
import {controllerFixture,protocolFixture,memoryStore} from './fixtures.mjs';
import {hash} from './validation.mjs';
// Exact originals retained from c6dd9ed, imports are restricted to synthetic CI.
// These tests demonstrate the defect, not success of the corrected validator.
function oldController(){
 const {q,r}=controllerFixture();delete q.evidence;q.version=r.version=1;r.requestKey=oldKey(q);return {q,r};
}
function oldProtocol(){
 const a=protocolFixture();
 for(const f of a[0].files){delete f.role;delete f.requirements}
 a[2].files=structuredClone(a[0].files);a[3].packet=a[4].packet=hash(JSON.stringify(a[0]));return a;
}
test('c6dd9ed f1 counterexample: controller PASS with packet tokens and no inventory',()=>{
 const {q,r}=oldController();assert.equal(oldReport(q,r).outcome,'PASS');assert.equal(q.evidence,undefined);
});
test('c6dd9ed f1/f2 counterexample: protocol PASS with only frontend paths for all layers',()=>{
 const a=oldProtocol();
 for(let i=1;i<3;i++){const f=a[0].files[i],b=a[1].get(f.path);a[1].delete(f.path);f.path='src/evidence-'+i+'.txt';a[1].set(f.path,b);a[3].coverage[i].references=[f.path]}
 a[2].files=structuredClone(a[0].files);a[3].packet=a[4].packet=hash(JSON.stringify(a[0]));
 assert.equal(oldValidate(...a).outcome,'PASS');
});
for(const index of [1,2])test('c6dd9ed f2 counterexample: row '+index+' cites frontend',()=>{
 const a=oldProtocol();a[3].coverage[index].references=a[3].coverage[0].references;assert.equal(oldValidate(...a).outcome,'PASS');
});
for(const outcome of ['FAIL','BLOCKED'])test('c6dd9ed f4 counterexample: '+outcome+' accepts empty object detail',()=>{
 const a=oldProtocol();a[3].outcome=outcome;a[3].coverage[0].status=outcome;a[3][outcome==='FAIL'?'findings':'blockers']=[{}];assert.equal(oldValidate(...a).outcome,outcome);
});
test('c6dd9ed f5 counterexample: approval keys persist despite false decision',async()=>{
 const a=oldProtocol();a[3].approve=a[3].merge=true;let retained;
 const d=await oldReceive(a,{putOnce:async(k,v)=>{retained=JSON.parse(v)}});
 assert.equal(d.approve,false);assert.equal(retained.approve,true);assert.equal(retained.merge,true);
});
test('c6dd9ed async counterexample: report mutated after validation is persisted',async()=>{
 const {q,r}=oldController(),s=memoryStore();await oldReserve(s,q);const oldGet=s.get;
 s.get=async k=>{if(k.startsWith('request/'))r.approve=true;return oldGet(k)};
 const d=await oldAccept(s,q,r,{kind:'synthetic-test-double'});
 assert.equal(d.approve,false);assert.equal(JSON.parse(s.rows.get('result/'+q.request)).approve,true);
});
