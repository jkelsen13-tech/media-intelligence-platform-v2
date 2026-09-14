import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisAssessmentClient} from '../src/lib/hypothesisAssessmentClient.js'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisRequest.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisReassessmentRequest.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Panel,ReassessmentRequestDetail:Detail}=await import(pathToFileURL(output))
const user='00000000-0000-4000-8000-000000000001',iid='00000000-0000-4000-8000-000000000002',revision='00000000-0000-4000-8000-000000000003'
const input={investigation_id:iid,request_id:user,revision_id:revision,trigger:'methodology',reason:'Synthetic reasoning concern.'}
const receipt=i=>({contract_version:'mip_hypothesis_request_receipt_v1',investigation_id:iid,request_id:i.request_id,revision_id:revision,
 cause_id:'synthetic-cause',trigger:i.trigger,completed_reassessment:false,publication_allowed:false})
const props=client=>({client,investigationId:iid,revisionId:revision,scopeKey:'synthetic-owner-and-question'})
const content=tree=>JSON.stringify(tree.toJSON())
async function enter(tree){await act(async()=>tree.root.findByType('textarea').props.onChange({target:{value:'Synthetic reconsideration reason.'}}))}
async function submit(tree){await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}))}
test('human request store binds trusted identity and exact arguments without raw reason interpolation',async()=>{
 const calls=[],store=createHypothesisStore(async(...args)=>{calls.push(args);return{rows:[{value:{}}]}})
 await store.requestReassessment({verifiedUserId:user,investigationId:iid,requestId:user,revisionId:revision,trigger:input.trigger,reason:input.reason})
 assert.deepEqual(calls[0][1],[user,iid,user,revision,input.trigger,input.reason]);assert.doesNotMatch(calls[0][0],/Synthetic reasoning/)
 await store.requestDetail({verifiedUserId:user,investigationId:iid,requestId:user})
 assert.match(calls[1][0],/read_reassessment_request/);assert.deepEqual(calls[1][1],[user,iid,user])
})
test('request handler rejects self-assigned identity, approval and unbounded reasons',async()=>{
 const calls=[],handler=createHypothesisHandler({authenticate:async()=>({id:user}),sourceProject:'synthetic-only',allowedOrigins:['https://example.org'],
  store:{appendBound:async()=>{},boundHistory:async()=>{},requestReassessment:async args=>{calls.push(args);return receipt(input)}}})
 const client=createHypothesisAssessmentClient(async(action,input)=>{
  const r=await handler(new Request('https://example.org/hypothesis',{method:'POST',headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},
   body:JSON.stringify({action,input})}));return r.json()
 })
 assert.equal((await client.requestReassessment(input)).error,null);assert.equal(calls[0].verifiedUserId,user)
 for(const bad of [{...input,user_id:revision},{...input,approved:true},{...input,trigger:'approve_publication'},
  {...input,reason:' '},{...input,reason:'x'.repeat(2001)}]){
  assert.equal((await client.requestReassessment(bad)).error.code,'invalid_request')
 }
 assert.equal(calls.length,1)
})
test('request form keeps exact retry identity after an ambiguous response',async()=>{
 const calls=[];let recorded=0,tree
 const client={requestReassessment:async i=>{calls.push(structuredClone(i));return calls.length===1?{error:{code:'request_failed'}}:{data:receipt(i)}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onRecorded:()=>recorded++}))})
 await enter(tree);await submit(tree)
 assert.match(content(tree),/Recording is unconfirmed/);assert.equal(tree.root.findByType('textarea').props.disabled,true)
 await submit(tree);assert.deepEqual(calls[0],calls[1]);assert.equal(recorded,1)
 assert.match(content(tree),/Reassessment remains pending/);act(()=>tree.unmount())
})
test('late request completion after unmount cannot refresh a different private workspace',async()=>{
 let resolve,recorded=0,tree,sent
 const client={requestReassessment:i=>{sent=i;return new Promise(r=>resolve=r)}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onRecorded:()=>recorded++}))})
 await enter(tree);act(()=>{tree.root.findByType('form').props.onSubmit({preventDefault(){}})})
 act(()=>tree.unmount());await act(async()=>resolve({data:receipt(sent)}))
 assert.equal(recorded,0)
})
test('wrong-scope or publication-bearing receipt cannot claim request success',async()=>{
 for(const mutate of [r=>r.revision_id='other',r=>r.publication_allowed=true,r=>r.completed_reassessment=true]){
  let recorded=0,tree
  const client={requestReassessment:async i=>{const r=receipt(i);mutate(r);return{data:r}}}
  await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onRecorded:()=>recorded++}))})
  await enter(tree);await submit(tree);assert.equal(recorded,0);assert.match(content(tree),/Recording is unconfirmed/)
  act(()=>tree.unmount())
 }
})
test('request reason is fetched explicitly and withheld responses never reveal supplied text',async()=>{
 for(const status of ['available','withheld']){
  let calls=0,tree
  const cause={cause_id:'synthetic-cause',revision_id:revision,detail:{request_id:user,trigger:'methodology'}}
  const client={requestDetail:async()=>{calls++;return{data:{contract_version:'mip_hypothesis_request_detail_v1',investigation_id:iid,
   request_id:user,revision_id:revision,cause_id:cause.cause_id,trigger:'methodology',publication_allowed:false,is_approval:false,status,reason:'Synthetic private request.'}}}}
  await act(async()=>{tree=TestRenderer.create(createElement(Detail,{client,investigationId:iid,cause,scopeKey:'synthetic'}))})
  assert.equal(calls,0);await act(async()=>tree.root.findByType('button').props.onClick())
  assert.equal(calls,1)
  if(status==='available')assert.match(content(tree),/Synthetic private request/)
  else assert.doesNotMatch(content(tree),/Synthetic private request/)
  act(()=>tree.unmount())
 }
})

test('rapid duplicate submissions share one in-flight request',async()=>{
 let calls=0,resolve,sent,tree
 const client={requestReassessment:i=>{calls++;sent=i;return new Promise(r=>resolve=r)}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 await enter(tree)
 act(()=>{const send=tree.root.findByType('form').props.onSubmit;send({preventDefault(){}});send({preventDefault(){}})})
 assert.equal(calls,1)
 await act(async()=>resolve({data:receipt(sent)}))
 act(()=>tree.unmount())
})
