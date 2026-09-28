import test from 'node:test'
import assert from 'node:assert/strict'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
const id='00000000-0000-4000-8000-000000000001'
const other='00000000-0000-4000-8000-000000000002'
const revision='00000000-0000-4000-8000-000000000003'
const cause='00000000-0000-4000-8000-000000000004'
const input={investigation_id:other,revision_id:revision,cause_id:cause,expected_envelope_digest:null}
function fixture({reader=async value=>({kind:'synthetic',scope:value.investigationId,publication_allowed:false}),user={id,is_anonymous:false}}={}){
 let reads=0,queries=0,selection
 const store=createHypothesisStore(async()=>{queries++;throw Error('unexpected_query')},{semanticChangeReader:reader===null?null:async value=>{reads++;selection=value;return reader(value)}})
 const handler=createHypothesisHandler({authenticate:async()=>user,store,sourceProject:'synthetic-semantic-handler',allowedOrigins:['https://example.invalid']})
 const request=body=>handler(new Request('https://example.invalid/private',{
  method:'POST',headers:{authorization:'Bearer synthetic-only',origin:'https://example.invalid','content-type':'application/json'},
  body:JSON.stringify(body??{action:'semantic_change',input})
 }))
 return {request,counts:()=>({reads,queries,selection})}
}
test('semantic HTTP dispatch composes the trusted store and binds only verified identity',async()=>{
 const f=fixture(),r=await f.request()
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(f.counts(),{reads:1,queries:0,selection:{verifiedUserId:id,investigationId:other,revisionId:revision,causeId:cause,expectedEnvelopeDigest:null}})
 assert.equal((await r.json()).data.publication_allowed,false)
})
test('semantic browser request rejects identities, payload and all extra nested fields',async()=>{
 for(const fields of [{userId:id},{verifiedUserId:id},{connectionString:'PRIVATE_SENTINEL'},{rationale:'PRIVATE_SENTINEL'},{extra:{article:'PRIVATE_SENTINEL'}}]){
  const f=fixture(),r=await f.request({action:'semantic_change',input:{...input,...fields}})
  assert.equal(r.status,400);assert.equal(f.counts().reads,0)
 }
})
test('semantic endpoint validates exact cause/revision/digest and never supplies an assessment service action',async()=>{
 for(const body of [
  {action:'semantic_change',input:{...input,revision_id:'latest'}},
  {action:'semantic_change',input:{...input,cause_id:null}},
  {action:'semantic_change',input:{...input,expected_envelope_digest:'not-a-digest'}},
  {action:'semantic_assessment',input}
 ]){
  const f=fixture();assert.equal((await f.request(body)).status,400);assert.equal(f.counts().reads,0)
 }
})
test('missing semantic configuration refuses without old query or public fallback',async()=>{
 const f=fixture({reader:null}),r=await f.request()
 assert.equal(r.status,503);assert.equal(f.counts().queries,0)
 assert.deepEqual(await r.json(),{error:{code:'service_unavailable'}})
})
test('semantic endpoint denies anonymous authentication before private reader',async()=>{
 const f=fixture({user:{id,is_anonymous:true}})
 assert.equal((await f.request()).status,401);assert.equal(f.counts().reads,0)
})
test('semantic errors use bounded HTTP mapping and redact unknown and aggregate details',async()=>{
 for(const [error,status]of [
  [Object.assign(Error('PRIVATE_SENTINEL'),{code:'semantic_native_access_denied'}),403],
  [Object.assign(Error('PRIVATE_SENTINEL'),{code:'semantic_native_binding_mismatch'}),409],
  [Object.assign(Error('PRIVATE_SENTINEL'),{code:'semantic_native_request_refused'}),400],
  [Error('PRIVATE_SENTINEL'),503],
  [new AggregateError([Error('PRIVATE_SENTINEL')],'PRIVATE_SENTINEL'),503]
 ]){
  const f=fixture({reader:async()=>{throw error}}),r=await f.request()
  assert.equal(r.status,status);assert.equal((await r.text()).includes('PRIVATE_SENTINEL'),false)
 }
})
