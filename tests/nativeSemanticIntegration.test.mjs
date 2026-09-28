import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeSemanticAssessmentReader,createNativeSemanticChangeReader} from '../supabase/qualification/native-semantic-integration/reader.mjs'
const connection={connectionString:'postgresql://synthetic_native:synthetic@127.0.0.1:5432/synthetic',expectedLogin:'synthetic_native',disposable:true,sessionPoolerHost:null}
const id='00000000-0000-4000-8000-000000000001'
test('closed configuration rejects executable hooks and material fields',()=>{
 assert.throws(()=>createNativeSemanticAssessmentReader({...connection,query:()=>{}}))
 assert.throws(()=>createNativeSemanticChangeReader({...connection,body:'PRIVATE_SENTINEL'}))
 assert.throws(()=>createNativeSemanticAssessmentReader({...connection,expectedLogin:'browser'}))
 const extra={...connection};extra[Symbol('hidden')]=true
 assert.throws(()=>createNativeSemanticChangeReader(extra))
})
test('assessment request validates exact identity and currentness before connecting',async()=>{
 const read=createNativeSemanticAssessmentReader(connection)
 const valid={assessmentId:id,expectedInputFingerprint:'a'.repeat(64),expectedEnvelopeDigest:null,mode:'current'}
 for(const request of [{...valid,mode:'public'},{...valid,assessmentId:'latest'},{...valid,rationale:'PRIVATE_SENTINEL'},
 {...valid,expectedInputFingerprint:null},{...valid,expectedEnvelopeDigest:'bad'}])
  await assert.rejects(()=>read(request),e=>e.code==='semantic_native_request_refused')
})
test('change reader rejects browser identities and invented cause fields before connecting',async()=>{
 const read=createNativeSemanticChangeReader(connection)
 const valid={verifiedUserId:id,investigationId:id,revisionId:id,causeId:id,expectedEnvelopeDigest:null}
 for(const request of [{...valid,userId:id},{...valid,causeId:'latest'},{...valid,scope:'public'},
 {...valid,sourceReportingAbsence:true},{...valid,expectedEnvelopeDigest:'bad'}])
  await assert.rejects(()=>read(request),e=>e.code==='semantic_native_request_refused')
})
test('request accessors never execute',async()=>{
 const read=createNativeSemanticChangeReader(connection);let called=false
 const request={verifiedUserId:id,investigationId:id,revisionId:id,causeId:id,expectedEnvelopeDigest:null}
 Object.defineProperty(request,'causeId',{enumerable:true,get(){called=true;throw Error('PRIVATE_SENTINEL')}})
 await assert.rejects(()=>read(request),e=>e.code==='semantic_native_request_refused')
 assert.equal(called,false)
})
