import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {eftaWorkspace} from '../src/lib/eftaWorkspace.js'
test('private adapter rejects empty/unversioned/public replies',()=>{
 for(const payload of [null,{}, {contract:'efta-private-review-v1',state:'private_review',public_release:false},
 {contract:'efta-private-review-v2',state:'private_review',public_release:true}])assert.throws(()=>eftaWorkspace(payload),/reader_contract/);
});
const canonicalEntity={kind:'institution',namespace:'mip:institution',id:'a95e3f14-f75d-5718-a7b3-55e4c4e055a9',
 label:'United States Department of Justice',resolution_ref:'6875d412-6b9a-512f-a8b5-dd03ccaf7e76'};
const payload=entity=>({contract:'efta-private-review-v2',state:'private_review',public_release:false,receipt_id:'receipt',payload_hash:'hash',
 world_view:{state:'absent'},sources:[{candidate_id:'candidate',capture_id:'capture',article_id:'article',decision_id:'decision',
 remaining_uncertainty:'Agency claim is not established compliance.',content_hash:'content',excerpt:'exact span',source_field:'body_text',
 dependency_id:'event',statement:'attributed statement',semantic_kind:'official_claim',url:'https://example.invalid/source',
 review:{identity_resolution_id:'resolution',uncertainty:'Agency claim is not established compliance.',publication_allowed:false,
 event_time:{date:'2026-01-30',precision:'day',evidence_basis:'document-date',uncertainty:'day only'},...(entity===undefined?{}:{entity})}}]});
test('workspace requires authoritative v2 canonical entity and preserves cross-surface identity',()=>{
 assert.throws(()=>eftaWorkspace(payload(undefined)),/reader_binding/);
 assert.throws(()=>eftaWorkspace(payload({...canonicalEntity,namespace:'caller:fixture'})),/reader_binding/);
 assert.throws(()=>eftaWorkspace(payload({...canonicalEntity,id:'not-a-uuid'})),/reader_binding/);
 const view=eftaWorkspace(payload(canonicalEntity));
 const entityId='mip:institution:'+canonicalEntity.id;
 assert.equal(view.sources[0].entity_id,entityId);
 assert.equal(view.claims[0].entity_id,entityId);
 assert.ok(view.graph.nodes.some(n=>n.id===entityId&&n.identity.resolution_ref===canonicalEntity.resolution_ref));
});
test('explicit route has no publication call and reader failure hides records',async()=>{
 const ui=await readFile(new URL('../src/components/EftaGovernedWorkspace.jsx',import.meta.url),'utf8');
 assert.match(ui,/client\.read\(\)/);assert.match(ui,/setState\(\{status:'unavailable'\}\)/);
 assert.doesNotMatch(ui,/\.rpc\(|release_isolated|efta_admit|service_role/);
 const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/workspace'\)==='efta'/);assert.match(app,/EftaGovernedWorkspace/);
});
