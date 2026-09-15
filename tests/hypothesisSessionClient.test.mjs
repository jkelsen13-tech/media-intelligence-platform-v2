import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement,StrictMode} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {useHypothesisSessionClient} from '../src/lib/useHypothesisSessionClient.js'
const auth=(token='synthetic-a',id='synthetic-user')=>({loading:false,user:{id},session:{user:{id},access_token:token,expires_at:Math.floor(Date.now()/1000)+3600}})
const endpoint='https://synthetic.invalid/hypothesis'
const props=()=>({endpoint,auth:auth(),active:true})
const response=data=>new Response(JSON.stringify({data}),{headers:{'content-type':'application/json'}})
let latest
function Harness(p){latest=useHypothesisSessionClient(p);return null}
test('optional session seam stays closed for missing configuration, account, expiry and inactive view',async()=>{
 let tree,calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;return response({})}
 try{
  for(const p of [{...props(),endpoint:null},{...props(),active:false},{...props(),auth:{loading:true}},
   {...props(),auth:{...auth(),session:{...auth().session,user:{id:'different'}}}},
   {...props(),auth:{...auth(),session:{...auth().session,expires_at:1}}},
   {...props(),endpoint:'http://synthetic.invalid/'}]){
   await act(async()=>{tree=TestRenderer.create(createElement(Harness,p))})
   assert.equal(latest,null);act(()=>tree.unmount())
  }
  assert.equal(calls,0)
 }finally{globalThis.fetch=original}
})
test('configured seam sends current credential only on explicit request and returns a client in strict mode',async()=>{
 let tree;const calls=[],original=globalThis.fetch
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return response({synthetic:true})}
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(StrictMode,null,createElement(Harness,props())))})
  assert.equal(calls.length,0);assert.ok(latest)
  assert.deepEqual((await latest.history('synthetic-investigation')).data,{synthetic:true})
  assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-a')
  assert.equal(calls[0].options.credentials,'omit')
  assert.deepEqual(JSON.parse(calls[0].options.body),{action:'history',input:{investigation_id:'synthetic-investigation'}})
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
test('logout aborts outstanding request and retired clients cannot issue another request',async()=>{
 let tree,release,signal,calls=0;const original=globalThis.fetch
 globalThis.fetch=async(_,o)=>{calls++;signal=o.signal;return new Promise(r=>release=r)}
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(Harness,props()))})
  const old=latest,pending=old.history('synthetic-investigation')
  await Promise.resolve();await Promise.resolve()
  await act(async()=>tree.update(createElement(Harness,{...props(),auth:{loading:false,user:null,session:null}})))
  assert.equal(latest,null);assert.equal(signal.aborted,true)
  assert.equal((await pending).error.code,'authentication_required')
  release(response({private:'synthetic-old-account'}))
  assert.equal((await old.history('other')).error.code,'authentication_required');assert.equal(calls,1)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
test('account and token changes replace the client and suppress previous scope responses',async()=>{
 let tree;const original=globalThis.fetch,calls=[]
 globalThis.fetch=async(_,o)=>{calls.push(o.headers.Authorization);return response({synthetic:true})}
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(Harness,props()))})
  let old=latest
  await act(async()=>tree.update(createElement(Harness,{...props(),auth:auth('synthetic-refreshed')})))
  assert.notEqual(latest,old);assert.equal((await old.history('x')).error.code,'authentication_required')
  await latest.history('x');assert.deepEqual(calls,['Bearer synthetic-refreshed'])
  old=latest
  await act(async()=>tree.update(createElement(Harness,{...props(),auth:auth('synthetic-other','other-user')})))
  assert.equal((await old.history('x')).error.code,'authentication_required')
  await latest.history('x');assert.deepEqual(calls,['Bearer synthetic-refreshed','Bearer synthetic-other'])
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
test('endpoint replacement and leaving private workspace dispose the old transport',async()=>{
 let tree;const original=globalThis.fetch,urls=[]
 globalThis.fetch=async url=>{urls.push(url);return response({synthetic:true})}
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(Harness,props()))})
  let old=latest
  await act(async()=>tree.update(createElement(Harness,{...props(),endpoint:'https://second.invalid/hypothesis'})))
  assert.equal((await old.history('x')).error.code,'authentication_required')
  await latest.history('x');assert.deepEqual(urls,['https://second.invalid/hypothesis'])
  old=latest
  await act(async()=>tree.update(createElement(Harness,{...props(),active:false})))
  assert.equal(latest,null);assert.equal((await old.history('x')).error.code,'authentication_required')
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})

test('session expiry removes the delivered client without a user request or auth event',async()=>{
 let tree;const p=props();p.auth.session.expires_at=(Date.now()+100)/1000
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(Harness,p))})
  const old=latest;assert.ok(old)
  await act(async()=>{await new Promise(r=>setTimeout(r,150))})
  assert.equal(latest,null);assert.equal((await old.history('x')).error.code,'authentication_required')
 }finally{act(()=>tree?.unmount())}
})
