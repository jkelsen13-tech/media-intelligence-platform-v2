import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,validate,receive} from './protocol.mjs';
import {protocolFixture as fixture,finding,blocker} from './fixtures.mjs';
test('synthetic valid handoff never grants approval',()=>assert.deepEqual(validate(...fixture()),{outcome:'PASS',action:'synthetic_only',merge:false,approve:false}));
for(const [name,mutate,code] of [
 ['moving candidate',a=>a[0].candidate='main','candidate_not_frozen'],
 ['real execution closed',a=>a[0].synthetic=false,'real_transport_not_configured'],
 ['unbound disclosure',a=>a[2].disclosure='other','disclosure_unbound'],
 ['extra file',a=>a[1].set('tests/extra',Buffer.from('x')),'file_set'],
 ['changed bytes',a=>a[1].set('src/example.jsx',Buffer.from('x')),'file_binding'],
 ['path traversal',a=>{a[0].files[0].path='tests/../secret';a[2].files=structuredClone(a[0].files)},'unsafe_path'],
 ['agent rules',a=>{a[0].files[0].path='docs/AGENTS.md';a[2].files=structuredClone(a[0].files)},'unsafe_path'],
 ['supabase secret/config excluded',a=>{a[0].files[1].path='supabase/.env';a[2].files=structuredClone(a[0].files)},'unsafe_path'],
 ['missing frontend layer',a=>{a[0].requirementLayers.frontend_behavior='backend';a[2].requirementLayers=structuredClone(a[0].requirementLayers);a[3].packet=a[4].packet=hash(JSON.stringify(a[0]))},'full_stack_required'],
 ['missing backend layer',a=>{a[0].requirementLayers.backend_contract='frontend';a[2].requirementLayers=structuredClone(a[0].requirementLayers);a[3].packet=a[4].packet=hash(JSON.stringify(a[0]))},'full_stack_required'],
 ['missing cross layer',a=>{a[0].requirementLayers.cross_layer_semantics='frontend';a[2].requirementLayers=structuredClone(a[0].requirementLayers);a[3].packet=a[4].packet=hash(JSON.stringify(a[0]))},'full_stack_required'],
 ['unverified origin',a=>a[4].verified=false,'unverified_origin'],
 ['wrong candidate',a=>a[3].candidate='b'.repeat(40),'result_binding'],
 ['wrong request',a=>a[3].request='other','result_binding'],
 ['self review',a=>{a[3].reviewer=a[0].implementer;a[4].reviewer=a[0].implementer},'self_or_wrong_reviewer'],
 ['model mismatch',a=>a[3].model='other','self_or_wrong_reviewer'],
 ['missing coverage',a=>a[3].coverage=[],'coverage'],
 ['unbound reference',a=>a[3].coverage[0].references=['secret'],'unbound_evidence'],
 ['supplied evidence cannot certify',a=>a[3].coverage[0].evidence_class='supplied_implementation_agent_result','unsupported_pass'],
 ['contradictory pass',a=>a[3].blockers=[blocker(a[3])],'blocker_status'],
 ['unsupported failure',a=>a[3].outcome='FAIL','unsupported_fail'],
 ['unsupported blocked',a=>a[3].outcome='BLOCKED','unsupported_blocked'],
]) test(name,()=>{const a=fixture();mutate(a);assert.throws(()=>validate(...a),new RegExp(code))});
test('FAIL and BLOCKED remain distinct',()=>{
 const a=fixture();a[3].outcome='FAIL';a[3].findings=[finding(a[3])];a[3].coverage[0].status='FAIL';assert.equal(validate(...a).outcome,'FAIL');
 a[3].outcome='BLOCKED';a[3].findings=[];a[3].blockers=[blocker(a[3])];a[3].coverage[0].status='BLOCKED';assert.equal(validate(...a).outcome,'BLOCKED');
});
test('exact retry preserves evidence; conflicting result cannot overwrite',async()=>{
 const values=new Map(),store={putOnce:async(k,v)=>{if(values.has(k)&&values.get(k)!==v)throw Error('conflict');values.set(k,v)}};
 const a=fixture();await receive(a,store);await receive(a,store);assert.equal(values.size,1);
 a[3].outcome='FAIL';a[3].findings=[finding(a[3])];a[3].coverage[0].status='FAIL';
 await assert.rejects(receive(a,store),/conflict/);
});
