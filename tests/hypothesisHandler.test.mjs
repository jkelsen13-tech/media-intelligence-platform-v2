import test from 'node:test'
import assert from 'node:assert/strict'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
function fixture(overrides={}) {
 const calls=[]
 const h=createHypothesisHandler({authenticate:async auth=>{calls.push(['auth',auth]);return{id,is_anonymous:false}},
  store:{appendBound:async x=>{calls.push(['append',x]);return{publication_allowed:false}},
   boundHistory:async x=>{calls.push(['history',x]);return{entries:[],publication_allowed:false}}},
  sourceProject:'synthetic-handler',allowedOrigins:['https://example.org'],...overrides})
 const request=(body={action:'history',input:{investigation_id:other}},headers={})=>h(new Request('https://example.org/hypothesis',{
  method:'POST',headers:{authorization:'Bearer synthetic-test-only','content-type':'application/json',origin:'https://example.org',...headers},
  body:typeof body==='string'?body:JSON.stringify(body)}))
 return {request,calls}
}
test('hypothesis transport binds verified identity and private cache boundary',async()=>{
 const {request,calls}=fixture(),r=await request()
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(calls[1],['history',{verifiedUserId:id,investigationId:other}])
})
test('hypothesis transport refuses caller identity, source namespace, public audience and historical-time assertions',async()=>{
 for(const extra of [{user_id:id},{source_project:'cc-definition-batch-v1'},{audience:'public'},{as_of:'2026-01-01'}]){
  const {request,calls}=fixture(),r=await request({action:'history',input:{investigation_id:other,...extra}})
  assert.equal(r.status,400);assert.equal(calls.length,0)
 }
})
test('hypothesis transport binds append source configuration and forbids review/publication promotion',async()=>{
 const assessment=hypothesisFixture();assessment.question_id=other
 const input={investigation_id:other,workspace_version_id:other,request_id:id,predecessor_id:null,assessment}
 const {request,calls}=fixture()
 assert.equal((await request({action:'append',input})).status,200)
 assert.equal(calls[1][1].sourceProject,'synthetic-handler');assert.equal(calls[1][1].verifiedUserId,id)
 for(const change of [{release_state:'public'},{review_state:'approved'},{question_id:id}]){
  const altered=structuredClone(input);Object.assign(altered.assessment,change)
  const {request,calls}=fixture()
  assert.equal((await request({action:'append',input:altered})).status,400);assert.equal(calls.length,0)
 }
})
test('hypothesis transport denies absent, invalid and anonymous Auth without database work',async()=>{
 for(const identity of [null,{id:'invalid'},{id,is_anonymous:true}]){
  let calls=0
  const {request}=fixture({authenticate:async()=>identity,store:{appendBound:async()=>calls++,boundHistory:async()=>calls++}})
  assert.equal((await request()).status,401);assert.equal(calls,0)
 }
 const {request,calls}=fixture();assert.equal((await request(undefined,{authorization:''})).status,401);assert.equal(calls.length,0)
})
test('hypothesis transport excludes unknown origins and bounds malformed/oversized input',async()=>{
 const {request,calls}=fixture()
 assert.equal((await request(undefined,{origin:'https://evil.example'})).status,403)
 assert.equal((await request('{')).status,400)
 assert.equal((await request('x'.repeat(65537))).status,413)
 assert.equal(calls.length,0)
})
test('hypothesis transport sanitizes database, Auth and unexpected failures',async()=>{
 for(const [code,status,expected] of [['42501',403,'access_denied'],['40001',409,'version_conflict'],['22023',400,'invalid_request'],['XX000',503,'service_unavailable']]){
  const {request}=fixture({store:{appendBound:async()=>{},boundHistory:async()=>{throw Object.assign(new Error('sensitive synthetic detail'),{code})}}})
  const r=await request();assert.equal(r.status,status);assert.deepEqual(await r.json(),{error:{code:expected}})
 }
 const {request}=fixture({authenticate:async()=>{throw new Error('synthetic Auth detail')}})
 assert.deepEqual(await(await request()).json(),{error:{code:'service_unavailable'}})
})
test('hypothesis transport cannot bind the closed CC batch or an implicit origin policy',()=>{
 for(const options of [{sourceProject:'cc-definition-batch-v1'},{allowedOrigins:[]},{allowedOrigins:['http://example.org']}]){
  assert.throws(()=>fixture(options),/invalid_isolated_configuration/)
 }
})
