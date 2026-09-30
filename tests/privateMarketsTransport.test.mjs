import test from 'node:test'
import assert from 'node:assert/strict'
import {createPrivateMarketsHandler} from '../supabase/qualification/markets-evidence/handler.mjs'
import {createPrivateMarketsHttpTransport} from '../src/lib/privateMarketsHttpTransport.js'
import {createPrivateMarketsClient} from '../src/lib/privateMarketsClient.js'
import {mapPrivateMarketsResult} from '../src/lib/privateMarketsContract.js'
import {privateMarketInput as input,privateMarketResult as result,marketTestId as id} from './privateMarketsTransportFixture.mjs'
const origin='https://synthetic.invalid',endpoint=origin+'/markets'
const config={allowedOrigins:[origin],sourceProject:'synthetic-only',authenticate:async()=>({id:id(20),is_anonymous:false}),query:async()=>({rows:[{value:result()}]})}
const req=(body=input(),extra={})=>new Request(endpoint,{method:'POST',headers:{origin,authorization:'Bearer synthetic-only','content-type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)})
test('handler binds trusted identity/source and preserves private microsecond/date metadata',async()=>{
 let args;const handler=createPrivateMarketsHandler({...config,query:async(sql,a)=>{args=a;assert.match(sql,/\$1::uuid/);return {rows:[{value:result()}]}}})
 const r=await handler(req()),body=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('set-cookie'),null)
 assert.deepEqual(args,[id(20),id(1),id(2),'synthetic-only',id(3),id(4),input().at])
 assert.equal(body.data.at,input().at);assert.equal(body.data.paths[0].valid_from,'2026-01-01');assert.equal(body.data.paths[0].hops[0].published_at,null)
})
test('handler rejects origin, cookies, anonymous identity and caller authority before query',async()=>{
 let calls=0;const handler=createPrivateMarketsHandler({...config,query:async()=>{calls++}})
 for(const headers of [{origin:'https://other.invalid'},{origin:'null'},{cookie:'session=fake'},{authorization:''}])assert.notEqual((await handler(req(input(),headers))).status,200)
 for(const field of ['user_id','source_project','rights','review_state','observation_id'])assert.equal((await handler(req({...input(),[field]:id(1)}))).status,400)
 assert.equal((await createPrivateMarketsHandler({...config,query:async()=>{calls++},authenticate:async()=>({id:id(20),is_anonymous:true})})(req())).status,401)
 assert.equal(calls,0)
})
test('handler bounds malformed UTF8 and oversized streamed JSON without partial disclosure',async()=>{
 const h=createPrivateMarketsHandler(config)
 assert.equal((await h(req('{'))).status,400);assert.equal((await h(req('x'.repeat(4097)))).status,413)
 const r=new Request(endpoint,{method:'POST',headers:{origin,authorization:'Bearer synthetic','content-type':'application/json'},body:new Uint8Array([255])})
 assert.equal((await h(r)).status,400)
 assert.equal((await createPrivateMarketsHandler({...config,maxResponseBytes:8})(req())).status,503)
})
test('trusted database failures have sanitized meaningful classifications',async()=>{
 for(const [code,message,status,want] of [['42501','sensitive',403,'access_denied'],['P0001','mip_market_assessment_unavailable',409,'evidence_unavailable'],['P0001','mip_market_candidate_budget',409,'scope_too_large'],['22P02','private',400,'invalid_request'],['08006','secret',503,'service_unavailable']]){
  const h=createPrivateMarketsHandler({...config,query:async()=>{throw Object.assign(Error(message),{code})}}),r=await h(req())
  assert.equal(r.status,status);assert.deepEqual(await r.json(),{error:{code:want}})
 }
})
test('strict mapper rejects promoted flags, mismatched observation/time/version, unknown fields and malformed Unicode spans',()=>{
 for(const mutate of [r=>r.publication_allowed=true,r=>r.source_root_lineage_qualified=true,r=>r.extra='private',r=>r.at='2026-06-01T00:00:00.123457Z',r=>r.observation_id=id(99),r=>r.paths[0].hops[0].subject.version_id=id(99),r=>r.paths[0].hops[0].support.end=6]){
  const r=result();mutate(r);assert.equal(mapPrivateMarketsResult(r,input(),{expectedObservationId:id(5)}),null)
 }
 const r=result();r.paths[0].hops[0].source_url='https://user:password@example.invalid/x';r.paths[0].hops[0].published_at='2026-01-01'
 const mapped=mapPrivateMarketsResult(r,input());assert.equal(mapped.paths[0].hops[0].source_url,null);assert.equal(mapped.paths[0].hops[0].published_at,'2026-01-01')
})
test('HTTP transport is unconfigured by default and refuses credential-bearing destinations',async()=>{
 assert.equal((await createPrivateMarketsHttpTransport()(input())).error.code,'not_configured')
 for(const url of ['http://synthetic.invalid/x','https://user:pass@synthetic.invalid/x',endpoint+'?token=x',endpoint+'#x'])assert.throws(()=>createPrivateMarketsHttpTransport({endpoint:url,getAccessToken:async()=>''}))
})
test('actual Request Response seam preserves fixed fetch security options and fresh bearer',async()=>{
 let token='one',calls=0;const handler=createPrivateMarketsHandler({...config,authenticate:async a=>{assert.equal(a,'Bearer '+token);return{id:id(20)}}})
 const transport=createPrivateMarketsHttpTransport({endpoint,getAccessToken:async()=>token,fetchImpl:async(url,o)=>{
  calls++;assert.equal(o.cache,'no-store');assert.equal(o.credentials,'omit');assert.equal(o.redirect,'error');assert.equal(o.referrerPolicy,'no-referrer')
  return handler(new Request(url,{...o,headers:{...o.headers,origin}}))
 }})
 const client=createPrivateMarketsClient({transport})
 assert.equal((await client.read(input(),{expectedObservationId:id(5)})).data.paths.length,1);token='two'
 assert.equal((await client.read(input(),{expectedObservationId:id(5)})).error,null);assert.equal(calls,2);client.dispose()
})
test('disposal and new scope suppress late success AND late denial from adapters ignoring abort',async()=>{
 for(const late of [{data:result(),error:null},{data:null,error:{code:'access_denied'}}]){
  const resolvers=[],signals=[],client=createPrivateMarketsClient({transport:(_,o)=>{signals.push(o.signal);return new Promise(r=>resolvers.push(r))}})
  const first=client.read(input(),{expectedObservationId:id(5)}),second=client.read(input(),{expectedObservationId:id(5)})
  resolvers[0](late);assert.equal((await first).error.code,'request_cancelled');assert.equal(signals[0].aborted,true)
  client.dispose();resolvers[1](late);assert.equal((await second).error.code,'request_cancelled')
 }
})
test('transport disposal during delayed token lookup prevents dispatch',async()=>{
 let resolve,calls=0;const transport=createPrivateMarketsHttpTransport({endpoint,getAccessToken:()=>new Promise(r=>resolve=r),fetchImpl:async()=>{calls++}})
 const pending=transport(input());transport.dispose();resolve('synthetic');assert.equal((await pending).error.code,'request_cancelled');assert.equal(calls,0)
})
test('timeouts abort hung authentication and token lookup without retry or diagnostic disclosure',async()=>{
 const h=createPrivateMarketsHandler({...config,timeoutMs:5,authenticate:()=>new Promise(()=>{})})
 assert.equal((await h(req())).status,503)
 let calls=0;const t=createPrivateMarketsHttpTransport({endpoint,timeoutMs:5,getAccessToken:()=>new Promise(()=>{}),fetchImpl:async()=>{calls++}})
 assert.equal((await t(input())).error.code,'service_unavailable');assert.equal(calls,0);t.dispose()
})
test('transport cancels over-budget response streams and rejects redirects',async()=>{
 let cancelled=false;const t=createPrivateMarketsHttpTransport({endpoint,maxResponseBytes:8,getAccessToken:async()=>'synthetic',fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({data:result()})))},cancel(){cancelled=true}}),{headers:{'content-type':'application/json'}})})
 assert.equal((await t(input())).error.code,'service_unavailable');assert.equal(cancelled,true);t.dispose()
 const other=createPrivateMarketsHttpTransport({endpoint,getAccessToken:async()=>'synthetic',fetchImpl:async()=>{const r=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(r,'redirected',{value:true});return r}})
 assert.equal((await other(input())).error.code,'invalid_response');other.dispose()
})

test('client disposal resolves an adapter that never settles and aborted calls do not dispatch',async()=>{
 let calls=0;const c=createPrivateMarketsClient({transport:()=>{calls++;return new Promise(()=>{})}})
 const p=c.read(input(),{expectedObservationId:id(5)});c.dispose();assert.equal((await p).error.code,'request_cancelled');assert.equal(calls,1)
 const controller=new AbortController();controller.abort();const other=createPrivateMarketsClient({transport:()=>{calls++}})
 assert.equal((await other.read(input(),{expectedObservationId:id(5),signal:controller.signal})).error.code,'request_cancelled');assert.equal(calls,1)
})
