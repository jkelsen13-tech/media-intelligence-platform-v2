// Actual Deno import/listener recovery HTTP only; provider RPC seam is synthetic.
// Separate from qik_deno_boot.mjs. Do not replace that fixture or change admission.
import {strict as assert} from 'node:assert'
assert.equal(Deno.version.deno,'2.9.7')
const nativeFetch=globalThis.fetch
const nativeServe=Deno.serve
let server
let serverCount=0
const calls=[]
const HOLD_WAITING='worker_claim:00000000-0000-4000-8000-000000000001'
const HOLD_EXHAUSTED='worker_claim:00000000-0000-4000-8000-000000000002'
let scenario='waiting_lease'
Deno.serve=(...args)=>{serverCount++;server=nativeServe(...args);return server}
const rpcOrigin='https://qualification.invalid'
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 assert.equal(url.origin,rpcOrigin)
 assert.equal(options.method,'POST')
 assert.equal(options.headers['content-profile'],'mip_identity')
 assert.equal(options.headers['accept-profile'],'mip_identity')
 const op=url.pathname.split('/').at(-1)
 assert.equal(url.href,rpcOrigin+'/rest/v1/rpc/'+op)
 const args=JSON.parse(options.body)
 assert.equal(args.p_runtime,'synthetic-runtime')
 assert.equal(args.p_session,'synthetic-session')
 calls.push(op)
 if(op==='worker_journal_pending'){
  assert.equal(args.p_after,'')
  assert.equal(args.p_limit,20)
  const key=scenario==='waiting_lease'?HOLD_WAITING:HOLD_EXHAUSTED
  return new Response(JSON.stringify([{key,action:'hold_claim'}]))
 }
 if(op==='worker_resume_claim'){
  const key=scenario==='waiting_lease'?HOLD_WAITING:HOLD_EXHAUSTED
  assert.equal(args.p_key,key)
  if(scenario==='waiting_lease')return new Response(JSON.stringify({state:'waiting_lease'}))
  if(scenario==='exhausted')return new Response(JSON.stringify({state:'exhausted'}))
 }
 throw Error('unexpected synthetic RPC')
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
const entry=new URL('../../supabase/functions/source-comparison-generation-candidate/index.ts',import.meta.url)
try{
 await import(entry.href+'?recovery')
 assert.equal(serverCount,1)
 const invoke=async(options)=>nativeFetch('http://127.0.0.1:8000/',{...options,signal:AbortSignal.timeout(5000)})
 const method=await invoke({method:'GET'});assert.equal(method.status,405);await method.text()
 const unauthorized=await invoke({method:'POST'})
 assert.equal(unauthorized.status,403);await unauthorized.text();assert.equal(calls.length,0)
 const body=await invoke({method:'POST',headers:{authorization:'Bearer synthetic-invoke'},body:'synthetic'})
 assert.equal(body.status,400);assert.deepEqual(await body.json(),{state:'body_denied'});assert.equal(calls.length,0)
 const waiting=await invoke({method:'POST',headers:{authorization:'Bearer synthetic-invoke'},body:''})
 assert.equal(waiting.status,200)
 assert.deepEqual(await waiting.json(),{state:'waiting_native_claim_recovery',recovered:0,held:1})
 assert.deepEqual(calls,['worker_journal_pending','worker_resume_claim'])
 scenario='exhausted'
 const exhausted=await invoke({method:'POST',headers:{authorization:'Bearer synthetic-invoke'}})
 assert.equal(exhausted.status,200)
 assert.deepEqual(await exhausted.json(),{state:'recovery_required',recovered:0})
 assert.deepEqual(calls,['worker_journal_pending','worker_resume_claim','worker_journal_pending','worker_resume_claim'])
 assert.ok(!calls.includes('worker_claim'))
 console.log(JSON.stringify({case:'deno_actual_index_listener_recovery',status:'PASS',deno:Deno.version.deno,
  real_provider_calls:0,synthetic_rpc_calls:calls.length,worker_claim_calls:0}))
}finally{
 globalThis.fetch=nativeFetch
 Deno.serve=nativeServe
 if(server){await server.shutdown();await server.finished}
 console.log('DENO_OWNED_SERVER_CLEANUP_PASS')
}
