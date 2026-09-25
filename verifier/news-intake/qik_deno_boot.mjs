// Actual Deno import/listener/handler boot only; provider RPC seam is synthetic.
// Run exclusively in the network-none disposable container documented alongside.
import {strict as assert} from 'node:assert'
assert.equal(Deno.version.deno,'2.9.7')
const nativeFetch=globalThis.fetch
const nativeServe=Deno.serve
let server
let serverCount=0
const calls=[]
let ambiguous=false
// Retain the actual native listener, capturing only its handle for owned cleanup.
Deno.serve=(...args)=>{serverCount++;server=nativeServe(...args);return server}
const rpcOrigin='https://qualification.invalid'
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 assert.equal(url.origin,rpcOrigin)
 assert.equal(options.method,'POST')
 assert.equal(options.headers['content-profile'],'mip_identity')
 const op=url.pathname.split('/').at(-1)
 assert.equal(url.href,rpcOrigin+'/rest/v1/rpc/'+op)
 const args=JSON.parse(options.body)
 assert.equal(args.p_runtime,'synthetic-runtime')
 assert.equal(args.p_session,'synthetic-session')
 calls.push(op)
 if(ambiguous)throw Error('synthetic provider interruption')
 if(op==='worker_journal_pending')return new Response('[]')
 if(op==='worker_claim')return new Response('null')
 if(op==='worker_journal_put')return new Response('true')
 throw Error('unexpected synthetic RPC')
}
const env={
 MIP_QIK_WORKER_RPC_URL:rpcOrigin+'/rest/v1/rpc/',
 MIP_QIK_PUBLISHABLE_KEY:'sb_publishable_synthetic',
 MIP_QIK_WORKER_JWT:'dummy.'+btoa(JSON.stringify({role:'mip_comparison_worker_v1'}))+'.dummy',
 MIP_QIK_WORKER_INVOKE_TOKEN:'synthetic-invoke',
 MIP_QIK_WORKER_RUNTIME:'synthetic-runtime',
 MIP_QIK_WORKER_IMPLEMENTATION:'synthetic-implementation'
}
for(const [key,value] of Object.entries(env))Deno.env.set(key,value)
Deno.env.delete('MIP_QIK_WORKER_SESSION')
const entry=new URL('../../supabase/functions/source-comparison-generation-candidate/index.ts',import.meta.url)
try{
 await assert.rejects(import(entry.href+'?missing-session'),/mip_host_configuration/)
 assert.equal(serverCount,0)
 Deno.env.set('MIP_QIK_WORKER_SESSION','synthetic-session')
 await import(entry.href+'?boot')
 assert.equal(serverCount,1)
 const invoke=async(options)=>nativeFetch('http://127.0.0.1:8000/',{...options,signal:AbortSignal.timeout(5000)})
 const method=await invoke({method:'GET'});assert.equal(method.status,405);await method.text()
 const body=await invoke({method:'POST',headers:{authorization:'Bearer synthetic-invoke'},body:'synthetic'})
 assert.equal(body.status,400);await body.text();assert.equal(calls.length,0)
 const unauthorized=await invoke({method:'POST'})
 assert.equal(unauthorized.status,403);await unauthorized.text();assert.equal(calls.length,0)
 const started=performance.now()
 const response=await invoke({method:'POST',headers:{authorization:'Bearer synthetic-invoke'}})
 assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{state:'idle'})
 assert.deepEqual(calls,['worker_journal_pending','worker_journal_put','worker_claim','worker_journal_put'])
 ambiguous=true
 const count=calls.length
 const uncertain=await invoke({method:'POST',headers:{authorization:'Bearer synthetic-invoke'}})
 assert.equal(uncertain.status,503);assert.deepEqual(await uncertain.json(),{state:'recovery_required'})
 assert.equal(calls.length,count+1)
 console.log(JSON.stringify({case:'deno_actual_index_listener_handler',status:'PASS',deno:Deno.version.deno,
  synthetic_request_ms:Math.round((performance.now()-started)*1000)/1000,real_provider_calls:0,synthetic_rpc_calls:calls.length}))
}finally{
 globalThis.fetch=nativeFetch
 Deno.serve=nativeServe
 if(server){await server.shutdown();await server.finished}
}
console.log('DENO_OWNED_SERVER_CLEANUP_PASS')
