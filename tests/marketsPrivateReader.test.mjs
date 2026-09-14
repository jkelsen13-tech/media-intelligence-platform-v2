import test from 'node:test'
import assert from 'node:assert/strict'
import {createPrivateMarketsReader} from '../supabase/qualification/markets-evidence/store.mjs'
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const input=()=>({investigation_id:id,workspace_version_id:id,asset_id:id,event_id:null,at:'2026-06-01T00:00:00Z'})
test('private market request accepts identities only and derives user/source from trusted configuration',async()=>{
 const calls=[],reader=createPrivateMarketsReader({authenticate:async()=>({id:other}),sourceProject:'synthetic-source',query:async(sql,args)=>{calls.push({sql,args});return {rows:[{value:{publication_allowed:false}}]}}})
 assert.equal((await reader.read({},input())).data.publication_allowed,false)
 assert.deepEqual(calls[0].args,[other,id,id,'synthetic-source',id,null,'2026-06-01T00:00:00Z'])
 assert.match(calls[0].sql,/\$1::uuid/);assert.doesNotMatch(calls[0].sql,/synthetic-source/)
 for(const field of ['user_id','source_project','publiclyEligible','rightsApproved'])
  assert.equal((await reader.read({},{...input(),[field]:true})).error.code,'invalid_request')
 assert.equal(calls.length,1)
})
test('private market arguments are captured before authentication awaits and unauthenticated reads never reach storage',async()=>{
 let resolve,args
 const reader=createPrivateMarketsReader({authenticate:()=>new Promise(r=>resolve=r),sourceProject:'synthetic-source',query:async(_,a)=>{args=a;return {rows:[{value:{}}]}}})
 const p=input(),pending=reader.read({},p);p.asset_id=other;resolve({id})
 await pending;assert.equal(args[4],id)
 let calls=0
 const denied=createPrivateMarketsReader({authenticate:async()=>null,sourceProject:'synthetic-source',query:async()=>{calls++}})
 assert.equal((await denied.read({},input())).error.code,'authentication_required');assert.equal(calls,0)
})
test('storage error details and private material are withheld from the server seam response',async()=>{
 const reader=createPrivateMarketsReader({authenticate:async()=>({id}),sourceProject:'synthetic-source',query:async()=>{throw Error('synthetic private database detail')}})
 assert.deepEqual(await reader.read({},input()),{data:null,error:{code:'access_denied'}})
 assert.throws(()=>createPrivateMarketsReader({authenticate:()=>{},sourceProject:'cc-definition-batch-v1',query:()=>{}}),/unconfigured/)
})

test('dated identity request rejects relative, ambiguous and finer than PostgreSQL timestamps before auth or SQL',async()=>{
 let auth=0,sql=0;const reader=createPrivateMarketsReader({authenticate:async()=>{auth++;return {id}},sourceProject:'synthetic',query:async()=>{sql++;return {rows:[{value:{}}]}}})
 for(const at of ['now','today','2026-06-01','2026-06-01T00:00:00','2026-02-30T00:00:00Z','2026-06-01T00:00:00.1234567Z','infinity'])
  assert.equal((await reader.read({},{...input(),at})).error.code,'invalid_request')
 assert.equal(auth,0);assert.equal(sql,0)
 await reader.read({},{...input(),at:'2026-06-01T00:00:00.123456+05:30'})
 assert.equal(auth,1);assert.equal(sql,1)
})
