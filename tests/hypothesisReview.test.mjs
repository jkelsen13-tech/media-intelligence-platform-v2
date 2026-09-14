import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {buildReviewRequest,reviewHistoryView,validReviewReceipt} from '../src/lib/hypothesisReview.js'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisAssessmentClient} from '../src/lib/hypothesisAssessmentClient.js'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisReview.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisReviewAcknowledgement.jsx'],outfile:output,
 bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Panel}=await import(pathToFileURL(output))
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const iid=id(1),user=id(2),revisionId=id(3)
const request=buildReviewRequest(iid,revisionId,id(4),null)
const receipt=(i=request,revision=1,sequence='1')=>({contract_version:'mip_hypothesis_review_receipt_v1',
 investigation_id:i.investigation_id,request_id:i.request_id,revision_id:i.revision_id,revision,
 previous_receipt_id:i.previous_receipt_id,receipt_sequence:sequence,recorded_at:'2026-09-14T12:00:00.123456Z',
 review_scope:'version_acknowledgement_only',is_approval:false,resolves_reassessment:false,publication_allowed:false})
const history=rs=>({contract_version:'mip_hypothesis_review_history_v1',investigation_id:iid,
 entries:rs.map(r=>({receipt:r,target_status:'available'})),latest_receipt_id:rs.at(-1)?.request_id??null,
 current_user_only:true,is_approval:false,resolves_reassessment:false,publication_allowed:false})
const props=client=>({client,investigationId:iid,revisionId,revision:1,userScopeKey:'synthetic-reviewer',canReview:true})
const content=tree=>JSON.stringify(tree.toJSON())
const button=(tree,label)=>tree.root.findAllByType('button').find(b=>b.children.join('')===label)
test('review history binds exact user-scoped sequence and does not accept approval or disclosure fields',()=>{
 const first=receipt(),second=receipt(buildReviewRequest(iid,id(5),id(6),first.request_id),2,'2')
 assert.equal(reviewHistoryView(history([first,second]),iid).latest.request_id,second.request_id)
 for(const mutate of [h=>h.current_user_only=false,h=>h.publication_allowed=true,h=>h.latest_receipt_id=id(9),
  h=>h.entries[1].receipt.previous_receipt_id=null,h=>h.entries[1].receipt.receipt_sequence='3',
  h=>h.entries[1].receipt.revision=1,h=>h.entries[0].receipt.is_approval=true,
  h=>h.entries[0].receipt.resolves_reassessment=true,h=>h.entries[0].receipt.source_text='untrusted']){
  const bad=history([structuredClone(first),structuredClone(second)]);mutate(bad);assert.equal(reviewHistoryView(bad,iid),null)
 }
 assert.equal(reviewHistoryView(history([first]),id(8)),null)
})
test('review receipt validates immutable request, target revision and expected sequence',()=>{
 assert.equal(validReviewReceipt(request,receipt(),1,'1'),true)
 for(const changed of [{...receipt(),request_id:id(9)},{...receipt(),revision_id:id(8)},
  {...receipt(),revision:2},{...receipt(),receipt_sequence:'2'},{...receipt(),previous_receipt_id:id(7)},
  {...receipt(),publication_allowed:true}])assert.equal(validReviewReceipt(request,changed,1,'1'),false)
 assert.ok(Object.isFrozen(request));assert.throws(()=>buildReviewRequest(iid,'bad',id(4),null))
})
test('trusted review transport supplies verified identity and rejects caller authority or approval',async()=>{
 const calls=[],store=createHypothesisStore(async(sql,args)=>{calls.push({sql,args});return{rows:[{value:receipt()}]}})
 const handler=createHypothesisHandler({authenticate:async()=>({id:user}),store,sourceProject:'synthetic-only',allowedOrigins:['https://example.org']})
 const client=createHypothesisAssessmentClient(async(action,input)=>(await handler(new Request('https://example.org/hypothesis',
  {method:'POST',headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},body:JSON.stringify({action,input})}))).json())
 assert.equal((await client.acknowledgeReview(request)).error,null)
 assert.deepEqual(calls[0].args,[user,iid,request.request_id,revisionId,null]);assert.match(calls[0].sql,/acknowledge_review/)
 for(const bad of [{...request,user_id:user},{...request,review_state:'reviewed'},{...request,publication_allowed:true},
  {...request,previous_receipt_id:'bad'}])assert.equal((await client.acknowledgeReview(bad)).error.code,'invalid_request')
 assert.equal(calls.length,1)
 await client.reviewHistory(iid);assert.deepEqual(calls[1].args,[user,iid]);assert.match(calls[1].sql,/review_history/)
})
test('review component never acknowledges on read and requires explicit current reviewer action',async()=>{
 let tree,writes=0
 const client={reviewHistory:async()=>({data:history([])}),acknowledgeReview:async()=>{writes++}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),canReview:false}))})
 assert.equal(writes,0);assert.equal(button(tree,'Mark revision 1 reviewed'),undefined)
 assert.match(content(tree),/Current reviewer assignment is required/);act(()=>tree.unmount())
})
test('uncertain acknowledgement retries identical arguments and refreshes actual review history',async()=>{
 let tree;const calls=[],saved=[]
 const client={reviewHistory:async()=>({data:history(saved)}),acknowledgeReview:async i=>{
  calls.push(structuredClone(i));if(!saved.length)saved.push(receipt(i))
  return calls.length===1?{error:{code:'request_failed'}}:{data:saved[0]}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 assert.equal(calls.length,0)
 await act(async()=>button(tree,'Mark revision 1 reviewed').props.onClick())
 assert.match(content(tree),/Acknowledgement is unconfirmed/)
 await act(async()=>button(tree,'Retry the same review acknowledgement').props.onClick())
 assert.deepEqual(calls[0],calls[1]);assert.equal(saved.length,1)
 assert.match(content(tree),/You marked revision/);assert.match(content(tree),/does not accept its conclusion/)
 assert.equal(button(tree,'Mark revision 1 reviewed'),undefined);act(()=>tree.unmount())
})
test('save response alone cannot claim latest baseline when readback omits its receipt',async()=>{
 let tree
 const client={reviewHistory:async()=>({data:history([])}),acknowledgeReview:async i=>({data:receipt(i)})}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 await act(async()=>button(tree,'Mark revision 1 reviewed').props.onClick())
 assert.match(content(tree),/has not yet confirmed the saved receipt/)
 assert.doesNotMatch(content(tree),/You marked revision/);assert.equal(button(tree,'Mark revision 1 reviewed'),undefined)
 act(()=>tree.unmount())
})
test('conflicting baseline requires explicit refresh and never silently resubmits',async()=>{
 let tree,calls=0
 const client={reviewHistory:async()=>({data:history([])}),acknowledgeReview:async()=>{calls++;return{error:{code:'version_conflict'}}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 await act(async()=>button(tree,'Mark revision 1 reviewed').props.onClick())
 assert.equal(calls,1);assert.match(content(tree),/review baseline changed/)
 await act(async()=>button(tree,'Refresh review baseline').props.onClick())
 assert.equal(calls,1);act(()=>tree.unmount())
})
test('a later review baseline cannot be moved backward by the interface',async()=>{
 let tree,calls=0
 const later=receipt(buildReviewRequest(iid,id(8),id(7),null),2,'1')
 const client={reviewHistory:async()=>({data:history([later])}),acknowledgeReview:async()=>{calls++}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 assert.match(content(tree),/later revision is already/);assert.equal(button(tree,'Mark revision 1 reviewed'),undefined)
 assert.equal(calls,0);act(()=>tree.unmount())
})
test('late acknowledgement after logout cannot restore prior review state or invoke access callback',async()=>{
 let tree,resolve,input,failures=0
 const client={reviewHistory:async()=>({data:history([])}),acknowledgeReview:i=>{input=i;return new Promise(r=>resolve=r)}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onAccessFailure:()=>failures++}))})
 act(()=>button(tree,'Mark revision 1 reviewed').props.onClick())
 await act(async()=>tree.update(createElement(Panel,{...props(client),userScopeKey:null,onAccessFailure:()=>failures++})))
 await act(async()=>resolve({data:receipt(input)}));assert.equal(tree.toJSON(),null);assert.equal(failures,0)
 act(()=>tree.unmount())
})
test('simultaneous clicks cannot create two review requests',async()=>{
 let tree,resolve,input;const calls=[]
 const client={reviewHistory:async()=>({data:history([])}),acknowledgeReview:i=>{input=i;calls.push(i);return new Promise(r=>resolve=r)}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 const click=button(tree,'Mark revision 1 reviewed').props.onClick
 act(()=>{click();click()});assert.equal(calls.length,1)
 act(()=>tree.unmount());await act(async()=>resolve({data:receipt(input)}))
})
