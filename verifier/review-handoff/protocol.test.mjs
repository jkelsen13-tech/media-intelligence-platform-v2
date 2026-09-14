import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,validate,receive} from './protocol.mjs';
function fixture() {
 const b=Buffer.from('Synthetic bounded input.');
 const p={candidate:'a'.repeat(40),synthetic:true,request:'synthetic-1',implementer:'synthetic-author',disclosure:'synthetic-only',files:[{path:'tests/example.txt',bytes:b.length,sha256:hash(b)}],requirements:['r1']};
 const a={candidate:p.candidate,disclosure:p.disclosure,files:structuredClone(p.files)};
 const r={candidate:p.candidate,packet:hash(JSON.stringify(p)),request:p.request,synthetic:true,reviewer:'synthetic-reviewer',model:'test-double',outcome:'PASS',coverage:[{id:'r1',status:'PASS',evidence_class:'artifact_inspection',references:['tests/example.txt']}],findings:[],blockers:[]};
 const o={packet:r.packet,synthetic:true,verified:true,reviewer:r.reviewer,model:r.model};
 return [p,new Map([['tests/example.txt',b]]),a,r,o];
}
test('synthetic valid handoff never grants approval',()=>assert.deepEqual(validate(...fixture()),{outcome:'PASS',action:'synthetic_only',merge:false,approve:false}));
for(const [name,mutate,code] of [
 ['moving candidate',a=>a[0].candidate='main','candidate_not_frozen'],
 ['real execution closed',a=>a[0].synthetic=false,'real_transport_not_configured'],
 ['unbound disclosure',a=>a[2].disclosure='other','disclosure_unbound'],
 ['extra file',a=>a[1].set('tests/extra',Buffer.from('x')),'file_set'],
 ['changed bytes',a=>a[1].set('tests/example.txt',Buffer.from('x')),'file_binding'],
 ['path traversal',a=>{a[0].files[0].path='tests/../secret';a[2].files=structuredClone(a[0].files)},'unsafe_path'],
 ['agent rules',a=>{a[0].files[0].path='docs/AGENTS.md';a[2].files=structuredClone(a[0].files)},'unsafe_path'],
 ['unverified origin',a=>a[4].verified=false,'unverified_origin'],
 ['wrong candidate',a=>a[3].candidate='b'.repeat(40),'result_binding'],
 ['wrong request',a=>a[3].request='other','result_binding'],
 ['self review',a=>{a[3].reviewer=a[0].implementer;a[4].reviewer=a[0].implementer},'self_or_wrong_reviewer'],
 ['model mismatch',a=>a[3].model='other','self_or_wrong_reviewer'],
 ['missing coverage',a=>a[3].coverage=[],'coverage'],
 ['unbound reference',a=>a[3].coverage[0].references=['secret'],'unbound_evidence'],
 ['supplied evidence cannot certify',a=>a[3].coverage[0].evidence_class='supplied_implementation_agent_result','unsupported_pass'],
 ['contradictory pass',a=>a[3].blockers=['owner_decision'],'false_pass'],
 ['unsupported failure',a=>a[3].outcome='FAIL','unsupported_fail'],
 ['unsupported blocked',a=>a[3].outcome='BLOCKED','unsupported_blocked'],
]) test(name,()=>{const a=fixture();mutate(a);assert.throws(()=>validate(...a),new RegExp(code))});
test('FAIL and BLOCKED remain distinct',()=>{
 const a=fixture();a[3].outcome='FAIL';a[3].findings=['synthetic-defect'];a[3].coverage[0].status='FAIL';assert.equal(validate(...a).outcome,'FAIL');
 a[3].outcome='BLOCKED';a[3].blockers=['owner_decision'];a[3].coverage[0].status='BLOCKED';assert.equal(validate(...a).outcome,'BLOCKED');
});
test('exact retry preserves evidence; conflicting result cannot overwrite',async()=>{
 const values=new Map(),store={putOnce:async(k,v)=>{if(values.has(k)&&values.get(k)!==v)throw Error('conflict');values.set(k,v)}};
 const a=fixture();await receive(a,store);await receive(a,store);assert.equal(values.size,1);
 a[3].outcome='FAIL';a[3].findings=['synthetic-defect'];a[3].coverage[0].status='FAIL';
 await assert.rejects(receive(a,store),/conflict/);
});
