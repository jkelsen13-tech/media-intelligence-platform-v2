import test from 'node:test'
import assert from 'node:assert/strict'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {validateHypothesisAssessment} from '../src/lib/hypothesisAssessment.js'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisAssessmentClient} from '../src/lib/hypothesisAssessmentClient.js'
const user='00000000-0000-4000-8000-000000000001',iid='00000000-0000-4000-8000-000000000002',parent='00000000-0000-4000-8000-000000000003'
function reassessment() {
 const r=hypothesisFixture();Object.assign(r,{question_id:iid,revision:2,predecessor_id:parent,revision_trigger:'new_evidence',revision_effect:'unchanged',
  reassessment_causes:[{cause_id:'00000000-0000-4000-8000-000000000004',reason:'Synthetic explicit consideration.'}]})
 return r
}
test('reassessment requires explicit unique explanations, never a completed flag or review approval',()=>{
 assert.equal(validateHypothesisAssessment(reassessment()).valid,true)
 for(const change of [r=>r.reassessment_causes=[],r=>r.reassessment_causes[0].reason='',r=>r.reassessment_causes.push({...r.reassessment_causes[0]}),
  r=>r.reassessment_causes[0].approved=true,r=>{r.revision=1;r.predecessor_id=null;r.revision_trigger='initial';r.revision_effect='initial'}]){
  const r=reassessment();change(r);assert.equal(validateHypothesisAssessment(r).valid,false)
 }
})
test('completion store binds the exact assessment and verified owner to one parameterized call',async()=>{
 const calls=[],assessment=reassessment(),store=createHypothesisStore(async(...args)=>{calls.push(args);return{rows:[{value:{completed_reassessment:true,publication_allowed:false}}]}})
 const result=await store.complete({verifiedUserId:user,investigationId:iid,workspaceVersionId:iid,sourceProject:'synthetic-only',
  requestId:user,predecessorId:parent,assessment})
 assert.equal(result.publication_allowed,false);assert.equal(calls.length,1)
 assert.match(calls[0][0],/mip_hypothesis.complete_reassessment/)
 assert.deepEqual(calls[0][1].slice(0,6),[user,iid,iid,'synthetic-only',user,parent])
 assert.deepEqual(JSON.parse(calls[0][1][6]),assessment)
})
test('authenticated completion client cannot substitute owner, source scope or review status',async()=>{
 const calls=[],store={appendBound:async()=>{},boundHistory:async()=>{},complete:async args=>{calls.push(args);return{completed_reassessment:true,publication_allowed:false}}}
 const handler=createHypothesisHandler({authenticate:async()=>({id:user}),store,sourceProject:'synthetic-only',allowedOrigins:['https://example.org']})
 const client=createHypothesisAssessmentClient(async(action,input)=>{
  const r=await handler(new Request('https://example.org/hypothesis',{method:'POST',headers:{
   authorization:'Bearer synthetic-only','content-type':'application/json',origin:'https://example.org'},body:JSON.stringify({action,input})}))
  return r.json()
 })
 const input={investigation_id:iid,workspace_version_id:iid,request_id:user,predecessor_id:parent,assessment:reassessment()}
 assert.equal((await client.complete(input)).error,null)
 assert.equal(calls[0].verifiedUserId,user);assert.equal(calls[0].sourceProject,'synthetic-only')
 for(const changed of [{...input,user_id:parent},{...input,source_project:'different'},{...input,assessment:{...input.assessment,review_state:'reviewed'}}]){
  assert.equal((await client.complete(changed)).error.code,'invalid_request')
 }
 assert.equal(calls.length,1)
})
test('plain append cannot carry reassessment acknowledgements and completion cannot omit them',async()=>{
 let calls=0
 const handler=createHypothesisHandler({authenticate:async()=>({id:user}),store:{appendBound:async()=>calls++,boundHistory:async()=>{},complete:async()=>calls++},
  sourceProject:'synthetic-only',allowedOrigins:['https://example.org']})
 const input={investigation_id:iid,workspace_version_id:iid,request_id:user,predecessor_id:parent,assessment:reassessment()}
 for(const action of ['append','complete']){
  const body=structuredClone(input);if(action==='complete')delete body.assessment.reassessment_causes
  const r=await handler(new Request('https://example.org/hypothesis',{method:'POST',headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},
   body:JSON.stringify({action,input:body})}))
  assert.equal(r.status,400)
 }
 assert.equal(calls,0)
})
