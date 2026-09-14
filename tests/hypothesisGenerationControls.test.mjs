import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {syntheticAuthoringContext,fillSyntheticComposer} from './hypothesisComposerFixture.mjs'
import {buildGenerationRequest,validGenerationReceipt,generationBacklogView} from '../src/lib/hypothesisGeneration.js'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisAssessmentClient} from '../src/lib/hypothesisAssessmentClient.js'
const root=fileURLToPath(new URL('../',import.meta.url)),dir=root+'tests/.compiled/generation-controls'
mkdirSync(dir,{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisAssessmentComposer.jsx','src/components/HypothesisGenerationLedger.jsx'],
 outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {ComposerForm:Form}=await import(pathToFileURL(dir+'/HypothesisAssessmentComposer.mjs'))
const {default:Ledger}=await import(pathToFileURL(dir+'/HypothesisGenerationLedger.mjs'))
const uid='00000000-0000-4000-8000-000000000001'
const receipt=i=>({generation_id:uid,request_id:i.request_id,investigation_id:i.investigation_id,workspace_version_id:i.workspace_version_id,
 method_revision:uid,input_hash:'a'.repeat(64),publication_allowed:false})
function ledger(c) {return{contract_version:'mip_hypothesis_generation_backlog_v1',investigation_id:c.investigation_id,
 entries:[{generation_id:uid,request_id:uid,workspace_version_id:c.workspace_version_id,observation_id:c.observation_id,predecessor_id:null,
  input_hash:'a'.repeat(64),method_revision:uid,implementation:'synthetic-method',state:'processing',recorded_at:'2026-09-13T12:00:00Z',
  lease_expired:true,retained_for_reconciliation:true,block_reason:null,completed_revision_id:null}],
 coverage:'retained_generation_jobs',current_authority_qualified:false,automatic_retry:false,force_cancellation:false,publication_allowed:false}}
const content=tree=>JSON.stringify(tree.toJSON())
const button=(tree,label)=>tree.root.findAllByType('button').find(b=>b.children.join('')===label)
async function definitions(tree) {
 for(const label of ['Definition of explanation 1','Definition of explanation 2']) {
  const field=tree.root.findAll(n=>n.props.label===label)[0]
  await act(async()=>field.findByType('textarea').props.onChange({target:{value:'Synthetic '+label}}))
 }
}
test('generation specification excludes human rationale, scores, source text and authority',()=>{
 const c=syntheticAuthoringContext(),d=fillSyntheticComposer(c),i=buildGenerationRequest(c,d,uid)
 assert.deepEqual(Object.keys(i).sort(),['investigation_id','request_id','spec','workspace_version_id'])
 assert.deepEqual(Object.keys(i.spec).sort(),['hypotheses','hypothesis_relationship','spans'])
 assert.deepEqual(Object.keys(i.spec.hypotheses[0]).sort(),['definition','id'])
 d.hypotheses[0].definition='Changed after request'
 assert.notEqual(i.spec.hypotheses[0].definition,d.hypotheses[0].definition)
})
test('generation request requires exact retained context, definitions and pending cause for revisions',()=>{
 const c=syntheticAuthoringContext(),d=fillSyntheticComposer(c)
 assert.throws(()=>buildGenerationRequest(c,{...d,question:'Other'},uid))
 assert.throws(()=>buildGenerationRequest(c,{...d,hypotheses:[d.hypotheses[0]]},uid))
 c.head={revision_id:uid,revision:1,status:'available'}
 const next=fillSyntheticComposer(c)
 assert.throws(()=>buildGenerationRequest(c,next,randomUUID()),/record_reassessment_request_first/)
})
test('capture receipt binds request and workspace without claiming computation or approval',()=>{
 const c=syntheticAuthoringContext(),i=buildGenerationRequest(c,fillSyntheticComposer(c),uid),r=receipt(i)
 assert.equal(validGenerationReceipt(i,r),true)
 for(const changed of [{...r,request_id:randomUUID()},{...r,workspace_version_id:randomUUID()},{...r,publication_allowed:true},{...r,output:'unbound'}])
  assert.equal(validGenerationReceipt(i,changed),false)
})
test('handler defaults generation closed and binds only trusted configuration and verified identity',async()=>{
 const c=syntheticAuthoringContext(),i=buildGenerationRequest(c,fillSyntheticComposer(c),uid),calls=[]
 const store=createHypothesisStore(async(sql,args)=>{calls.push({sql,args});return{rows:[{value:receipt(i)}]}})
 const options={authenticate:async()=>({id:uid}),store,sourceProject:'synthetic-only',allowedOrigins:['https://example.org']}
 const clientFor=h=>createHypothesisAssessmentClient(async(action,input)=>(await h(new Request('https://example.org/hypothesis',{method:'POST',
  headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},body:JSON.stringify({action,input})}))).json())
 const closed=clientFor(createHypothesisHandler(options))
 assert.equal((await closed.captureGeneration(i)).error.code,'generation_not_configured');assert.equal(calls.length,0)
 const client=clientFor(createHypothesisHandler({...options,generationTarget:{runtimeId:'synthetic-runtime',methodRevision:uid}}))
 assert.equal((await client.captureGeneration(i)).error,null)
 assert.deepEqual(calls[0].args,[uid,c.investigation_id,c.workspace_version_id,'synthetic-only',uid,'synthetic-runtime',uid,JSON.stringify(i.spec)])
 for(const bad of [{...i,user_id:uid},{...i,runtime:'other'},{...i,method_revision:uid},{...i,source_project:'other'},{...i,spec:{...i.spec,body_text:'untrusted'}}])
  assert.equal((await client.captureGeneration(bad)).error.code,'invalid_request')
 assert.equal(calls.length,1)
})
test('read-only generation ledger rejects secrets, extra source text, wrong scope and false approval',()=>{
 const c=syntheticAuthoringContext(),r=ledger(c)
 assert.equal(generationBacklogView(r,c.investigation_id).length,1)
 for(const mutate of [x=>x.entries[0].lease_token='secret',x=>x.entries[0].inputs={},x=>x.publication_allowed=true,
  x=>x.current_authority_qualified=true,x=>x.entries[0].completed_revision_id=uid,x=>x.entries[0].generation_id='bad']){
  const changed=structuredClone(r);mutate(changed);assert.equal(generationBacklogView(changed,c.investigation_id),null)
 }
 assert.equal(generationBacklogView(r,uid),null)
})
test('generation control freezes exact ambiguous requests and retries without human rationale',async()=>{
 const c=syntheticAuthoringContext(),calls=[];let tree,saved=0
 const client={captureGeneration:async i=>{calls.push(structuredClone(i));return calls.length===1?{error:{code:'request_failed'}}:{data:receipt(i)}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Form,{context:c,client,onSaved:()=>saved++}))})
 await definitions(tree)
 await act(async()=>button(tree,'Request retained-input assessment').props.onClick({preventDefault(){}}))
 assert.equal(calls.length,1);assert.doesNotMatch(content(tree),/Definition of explanation 1/)
 await act(async()=>button(tree,'Retry the same generation request').props.onClick({preventDefault(){}}))
 assert.deepEqual(calls[0],calls[1]);assert.equal(saved,1);assert.match(content(tree),/Retained-input work requested/)
 act(()=>tree.unmount())
})
test('closed worker target returns to editing without implying capture or executing another path',async()=>{
 const c=syntheticAuthoringContext();let tree,calls=0
 await act(async()=>{tree=TestRenderer.create(createElement(Form,{context:c,client:{captureGeneration:async()=>{calls++;return{error:{code:'generation_not_configured'}}}}}))})
 await definitions(tree);await act(async()=>button(tree,'Request retained-input assessment').props.onClick({preventDefault(){}}))
 assert.equal(calls,1);assert.match(content(tree),/No evaluated worker is configured/);assert.ok(tree.root.findByType('form'))
 act(()=>tree.unmount())
})
test('generation completion arriving after unmount cannot alter another account or workspace',async()=>{
 const c=syntheticAuthoringContext();let tree,resolve,input,saved=0
 await act(async()=>{tree=TestRenderer.create(createElement(Form,{context:c,onSaved:()=>saved++,client:{captureGeneration:i=>{input=i;return new Promise(r=>resolve=r)}}}))})
 await definitions(tree);act(()=>button(tree,'Request retained-input assessment').props.onClick({preventDefault(){}}))
 act(()=>tree.unmount());await act(async()=>resolve({data:receipt(input)}));assert.equal(saved,0)
})
test('worker ledger loads explicitly, explains stranded work and has no retry/cancel action',async()=>{
 const c=syntheticAuthoringContext();let tree,calls=0
 await act(async()=>{tree=TestRenderer.create(createElement(Ledger,{investigationId:c.investigation_id,userScopeKey:'synthetic',
  client:{generationBacklog:async()=>{calls++;return{data:ledger(c)}}}}))})
 assert.equal(calls,0);await act(async()=>button(tree,'Inspect worker attempts').props.onClick())
 assert.equal(calls,1);assert.match(content(tree),/Lease expired; retained work has not been requeued/)
 assert.equal(tree.root.findAllByType('button').length,1)
 act(()=>tree.unmount())
})
test('late worker ledger cannot restore state after logout',async()=>{
 const c=syntheticAuthoringContext();let tree,resolve
 const p={investigationId:c.investigation_id,userScopeKey:'synthetic',client:{generationBacklog:()=>new Promise(r=>resolve=r)}}
 await act(async()=>{tree=TestRenderer.create(createElement(Ledger,p))})
 act(()=>button(tree,'Inspect worker attempts').props.onClick())
 await act(async()=>tree.update(createElement(Ledger,{...p,userScopeKey:null})))
 await act(async()=>resolve({data:ledger(c)}));assert.equal(tree.toJSON(),null);act(()=>tree.unmount())
})
