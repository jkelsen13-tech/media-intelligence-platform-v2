import test from 'node:test'
import assert from 'node:assert/strict'
import {createHypothesisHttpTransport as make} from '../src/lib/hypothesisHttpTransport.js'
const endpoint='https://mip-synthetic.invalid/hypotheses'
const response=data=>new Response(JSON.stringify({data}),{headers:{'content-type':'application/json'}})
const config={endpoint,getAccessToken:async()=> 'synthetic-token-only'}
test('explicit HTTPS endpoint is required; credentials, query strings and fragments are not destinations',()=>{
 for(const value of [undefined,'http://example.invalid/x','https://name:secret@example.invalid/x','https://example.invalid/x?token=a','https://example.invalid/x#x','/x'])
  assert.throws(()=>make({...config,endpoint:value}),/invalid_hypothesis_http_configuration/)
})
test('request uses fresh tokens, fixed security options and no automatic retry',async()=>{
 let token='synthetic-first',reads=0;const calls=[]
 const transport=make({...config,getAccessToken:async()=>{reads++;return token},fetchImpl:async(url,options)=>{calls.push({url,options});return response({saved:true})}})
 await transport('history',{investigation_id:'synthetic'})
 token='synthetic-second'
 await transport('history',{investigation_id:'synthetic'})
 assert.equal(reads,2);assert.equal(calls.length,2)
 assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-first');assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-second')
 for(const {url,options:o}of calls){
  assert.equal(url,endpoint);assert.equal(o.credentials,'omit');assert.equal(o.cache,'no-store')
  assert.equal(o.redirect,'error');assert.equal(o.referrerPolicy,'no-referrer');assert.equal(o.mode,'cors')
  assert.deepEqual(JSON.parse(o.body),{action:'history',input:{investigation_id:'synthetic'}})
 }
 transport.dispose()
})
test('arguments are captured before delayed token acquisition',async()=>{
 let resolve;const token=new Promise(r=>resolve=r),input={investigation_id:'original'};let sent
 const transport=make({...config,getAccessToken:()=>token,fetchImpl:async(_,o)=>{sent=JSON.parse(o.body);return response({})}})
 const pending=transport('history',input);input.investigation_id='changed';resolve('synthetic')
 assert.equal((await pending).error,null);assert.equal(sent.input.investigation_id,'original');transport.dispose()
})
test('missing or malformed credentials and invalid requests never invoke fetch',async()=>{
 let calls=0
 for(const token of [null,undefined,'','space token','synthetic\r\nheader']){
  const transport=make({...config,getAccessToken:async()=>token,fetchImpl:async()=>{calls++;return response({})}})
  assert.equal((await transport('history',{})).error.code,'authentication_required');transport.dispose()
 }
 const transport=make({...config,fetchImpl:async()=>{calls++;return response({})}})
 for(const [action,input]of [['publish',{}],['history',null],['history',[]],['append',{text:'a'.repeat(65536)}]])
  assert.equal((await transport(action,input)).error.code,'invalid_request')
 assert.equal(calls,0);transport.dispose()
})
test('shutdown during token lookup prevents dispatch and permanently invalidates the transport',async()=>{
 let resolve,fetches=0
 const transport=make({...config,getAccessToken:()=>new Promise(r=>resolve=r),fetchImpl:async()=>{fetches++;return response({private:true})}})
 const pending=transport('history',{});transport.dispose();resolve('synthetic')
 assert.equal((await pending).error.code,'authentication_required')
 assert.equal((await transport('history',{})).error.code,'authentication_required');assert.equal(fetches,0)
})
test('shutdown suppresses a late response even if a fetch adapter ignores cancellation',async()=>{
 let resolve,signal
 const transport=make({...config,fetchImpl:(_,o)=>{signal=o.signal;return new Promise(r=>resolve=r)}})
 const pending=transport('history',{});await Promise.resolve()
 transport.dispose();resolve(response({private:'synthetic private marker'}))
 assert.equal((await pending).error.code,'authentication_required');assert.equal(signal.aborted,true)
})
test('timeout covers a stuck token provider without dispatch or retry',async()=>{
 let calls=0
 const transport=make({...config,timeoutMs:5,getAccessToken:()=>new Promise(()=>{}),fetchImpl:async()=>{calls++;return response({})}})
 assert.equal((await transport('history',{})).error.code,'request_failed');assert.equal(calls,0);transport.dispose()
})
test('ambiguous completion returns no success and is not retried automatically',async()=>{
 let calls=0;const transport=make({...config,fetchImpl:async()=>{calls++;throw Error('synthetic private server diagnostic')}})
 const result=await transport('acknowledge_review',{request_id:'exact'})
 assert.deepEqual(result,{data:null,error:{code:'request_failed'}});assert.equal(calls,1);transport.dispose()
})
test('oversized streamed response is cancelled without exposing partial content',async()=>{
 let cancelled=false
 const transport=make({...config,maxResponseBytes:8,fetchImpl:async()=>new Response(new ReadableStream({
  start(c){c.enqueue(new TextEncoder().encode('{"data":"synthetic private marker"}'))},
  cancel(){cancelled=true}
 }),{headers:{'content-type':'application/json'}})})
 assert.deepEqual(await transport('history',{}),{data:null,error:{code:'request_failed'}})
 assert.equal(cancelled,true);transport.dispose()
})
test('redirects, unexpected content types and malformed response envelopes fail closed',async()=>{
 const bad=[
 ()=>new Response('<html>private</html>',{headers:{'content-type':'text/html'}}),
 ()=>new Response('{"data":{},"error":{"code":"access_denied"}}',{headers:{'content-type':'application/json'}}),
 ()=>new Response('{"data":null}',{headers:{'content-type':'application/json'}}),
 ()=>new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),
 ()=>{const r=response({});Object.defineProperty(r,'redirected',{value:true});return r},
 ()=>{const r=response({});Object.defineProperty(r,'url',{value:'https://other.invalid/x'});return r},
 ]
 for(const factory of bad){
  const transport=make({...config,fetchImpl:async()=>factory()})
  assert.equal((await transport('history',{})).error.code,'request_failed');transport.dispose()
 }
})
test('server errors retain only allowed codes, never raw payloads',async()=>{
 for(const [code,expected]of [['access_denied','access_denied'],['private-detail','service_unavailable']]){
  const transport=make({...config,fetchImpl:async()=>new Response(JSON.stringify({error:{code,message:'synthetic private marker'}}),
   {status:403,headers:{'content-type':'application/json'}})})
  assert.deepEqual(await transport('history',{}),{data:null,error:{code:expected}});transport.dispose()
 }
})
test('shutdown while reading a response cancels its stream',async()=>{
 let reading,started=new Promise(r=>reading=r),cancelled=false
 const transport=make({...config,fetchImpl:async()=>{
  const stream=new ReadableStream({cancel(){cancelled=true}}),getReader=stream.getReader.bind(stream)
  stream.getReader=()=>{const reader=getReader();reading();return reader}
  return new Response(stream,{headers:{'content-type':'application/json'}})
 }})
 const pending=transport('history',{});await started;await Promise.resolve();transport.dispose()
 assert.equal((await pending).error.code,'authentication_required')
 assert.equal(cancelled,true)
})
