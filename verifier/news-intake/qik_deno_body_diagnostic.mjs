// Diagnostic only: classify original synthetic HTTP requests, not qualification.
// Run exclusively in the network-none disposable container documented alongside.
import {strict as assert} from 'node:assert'
assert.equal(Deno.version.deno,'2.9.7')
const nativeFetch=globalThis.fetch
const nativeServe=Deno.serve
let server
let serverCount=0
// Retain the actual native listener, capturing only its handle for owned cleanup.

const rpcOrigin='https://qualification.invalid'
globalThis.fetch=async()=>{throw Error('diagnostic_provider_rpc_forbidden')}
let label='unset'
Deno.serve=(handler)=>{
 serverCount++
 server=nativeServe(async request=>{
  if(new URL(request.url).pathname!=='/body-probe')return handler(request)
  const started=performance.now()
  const length=request.headers.get('content-length')
  const info={case:label,transfer_encoding_present:request.headers.has('transfer-encoding'),
   content_length_class:length===null?'missing':length==='0'?'zero':/^[0-9]+$/.test(length)?'nonzero':'malformed',
   body_null:request.body===null}
  if(request.body!==null){
   const reader=request.body.getReader()
   let timer
   try{
    const first=await Promise.race([reader.read(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),250)})])
    info.first_read=first===null?'timeout':first.done?'eof':first.value?.byteLength===0?'zero_chunk':'nonzero_chunk'
   }catch{info.first_read='error'}finally{
    clearTimeout(timer);void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}
   }
  }
  info.elapsed_bucket=performance.now()-started<250?'under_250ms':'at_least_250ms'
  console.log(JSON.stringify(info))
  return new Response(null,{status:204})
 })
 return server
}
const env={
 MIP_QIK_WORKER_RPC_URL:rpcOrigin+'/rest/v1/rpc/',
 MIP_QIK_PUBLISHABLE_KEY:'sb_publishable_synthetic',
 MIP_QIK_WORKER_JWT:'dummy.'+btoa(JSON.stringify({role:'mip_comparison_worker_v1'}))+'.dummy',
 MIP_QIK_WORKER_INVOKE_TOKEN:'synthetic-invoke',
 MIP_QIK_WORKER_RUNTIME:'synthetic-runtime',
 MIP_QIK_WORKER_IMPLEMENTATION:'synthetic-implementation',
 MIP_QIK_WORKER_SESSION:'synthetic-session'
}
for(const [key,value] of Object.entries(env))Deno.env.set(key,value)
try{
 await import('../../supabase/functions/source-comparison-generation-candidate/index.ts')
 assert.equal(serverCount,1)
 for(const probe of [true,false])for(const explicit of [false,true]){
  label=(probe?'probe_':'candidate_')+(explicit?'explicit_empty':'implicit_empty')
  const response=await nativeFetch('http://127.0.0.1:8000/'+(probe?'body-probe':''),{method:'POST',
   headers:{authorization:'Bearer synthetic-invoke'},...(explicit?{body:''}:{}),signal:AbortSignal.timeout(5000)})
  await response.text()
  if(!probe)console.log(JSON.stringify({case:label,handler_status:response.status}))
 }
}finally{
 globalThis.fetch=nativeFetch;Deno.serve=nativeServe
 if(server){await server.shutdown();await server.finished}
 console.log('DENO_DIAGNOSTIC_SERVER_CLEANUP_PASS')
}
