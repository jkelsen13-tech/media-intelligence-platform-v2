import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {eftaWorkspace} from '../src/lib/eftaWorkspace.js'
test('private adapter rejects empty/unversioned/public replies',()=>{
 for(const payload of [null,{}, {contract:'efta-private-review-v1',state:'private_review',public_release:true}])assert.throws(()=>eftaWorkspace(payload),/reader_contract/);
});
test('explicit route has no publication call and reader failure hides records',async()=>{
 const ui=await readFile(new URL('../src/components/EftaGovernedWorkspace.jsx',import.meta.url),'utf8');
 assert.match(ui,/client\.read\(\)/);assert.match(ui,/setState\(\{status:'unavailable'\}\)/);
 assert.doesNotMatch(ui,/\.rpc\(|release_isolated|efta_admit|service_role/);
 const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/workspace'\)==='efta'/);assert.match(app,/EftaGovernedWorkspace/);
});
