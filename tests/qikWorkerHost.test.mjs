import test from 'node:test'
import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {qikWorkerHost} from '../supabase/functions/source-comparison-generation-candidate/host.js'
const jwt=role=>'dummy.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.dummy'
const defaults={rpcUrl:'https://qualification.invalid/rest/v1/rpc/',apiKey:'sb_publishable_synthetic',workerJwt:jwt('mip_comparison_worker_v1'),invokeToken:'synthetic-invoke',session:'synthetic-session',runtime:'synthetic-runtime',implementation:'synthetic-implementation',cryptoImpl:webcrypto}
const request=()=>new Request('https://qualification.invalid/worker',{method:'POST',headers:{authorization:'Bearer synthetic-invoke'}})
test('host rejects broad worker credentials and unauthorized requests without RPC',async()=>{
 assert.throws(()=>qikWorkerHost({...defaults,workerJwt:jwt('service_role')}),/worker_role/)
 assert.throws(()=>qikWorkerHost({...defaults,apiKey:jwt('service_role')}),/public_key/)
 assert.throws(()=>qikWorkerHost({...defaults,apiKey:'sb_secret_synthetic'}),/public_key/)
 let calls=0
 const host=qikWorkerHost({...defaults,fetchImpl:async()=>{calls++;throw Error('unexpected')}})
 assert.equal((await host(new Request('https://qualification.invalid/worker',{method:'POST'}))).status,403)
 assert.equal(calls,0)
})
test('ambiguous transport is attempted once and returns sanitized recovery state',async()=>{
 let calls=0
 const host=qikWorkerHost({...defaults,fetchImpl:async()=>{calls++;throw Error('secret diagnostic')}})
 const response=await host(request())
 assert.equal(response.status,503);assert.equal(calls,1)
 assert.deepEqual(await response.json(),{state:'recovery_required'})
})
test('host fixes runtime and schema and supplies no caller key',async()=>{
 const seen=[]
 const host=qikWorkerHost({...defaults,fetchImpl:async(url,options)=>{
  seen.push({name:new URL(url).pathname.split('/').at(-1),args:JSON.parse(options.body),headers:options.headers})
  const op=seen.at(-1).name
  return new Response(JSON.stringify(op==='worker_journal_pending'?[]:op==='worker_claim'?null:true))
 }})
 assert.deepEqual(await (await host(request())).json(),{state:'idle'})
 assert.equal(seen[0].name,'worker_journal_pending')
 assert.equal(seen[0].args.p_runtime,'synthetic-runtime')
 assert.equal(seen[0].headers['content-profile'],'mip_identity')
 assert.equal(seen.filter(x=>x.name==='worker_claim').length,1)
})

test('bounded body admission accepts only EOF and refuses data stalled and errored streams',async()=>{
 for(const mode of ['empty','data','stalled','error']){
  let calls=0,cancelled=false,pulls=0
  const host=qikWorkerHost({...defaults,fetchImpl:async()=>{calls++;throw Error('synthetic provider refusal')}})
  const stream=new ReadableStream({pull(controller){
   pulls++
   if(mode==='empty')controller.close()
   if(mode==='data')controller.enqueue(new Uint8Array([1]))
   if(mode==='error')controller.error(Error('synthetic body failure'))
  },cancel(){cancelled=true}})
  const started=performance.now()
  const response=await host(new Request('https://qualification.invalid/worker',{method:'POST',duplex:'half',
   headers:{authorization:'Bearer synthetic-invoke','content-length':'0'},body:stream}))
  assert.equal(response.status,mode==='empty'?503:400,mode)
  assert.equal(calls,mode==='empty'?1:0,mode)
  assert.ok(performance.now()-started<1000,mode)
  if(mode==='data'||mode==='stalled')assert.equal(cancelled,true,mode)
  assert.ok(pulls<=2,mode)
 }
})

test('body framing refusal cannot be bypassed with EOF',async()=>{
 for(const headers of [{'transfer-encoding':'chunked'},{'content-length':'1'},{'content-length':'invalid'},{'content-length':'00'}]){
  let calls=0,pulls=0
  const host=qikWorkerHost({...defaults,fetchImpl:async()=>{calls++;throw Error('unexpected')}})
  const stream=new ReadableStream({pull(controller){pulls++;controller.close()}})
  const response=await host(new Request('https://qualification.invalid/worker',{method:'POST',duplex:'half',
   headers:{authorization:'Bearer synthetic-invoke',...headers},body:stream}))
  assert.equal(response.status,400);assert.equal(calls,0)
 }
})

test('one zero-byte chunk requires EOF within the same admission deadline',async()=>{
 for(const mode of ['eof','data','zero','error','stall','late_eof']){
  let calls=0,pulls=0,cancelled=false
  const host=qikWorkerHost({...defaults,fetchImpl:async()=>{calls++;throw Error('synthetic provider refusal')}})
  const stream=new ReadableStream({async pull(controller){
   pulls++
   if(pulls===1){
    if(mode==='late_eof')await new Promise(resolve=>setTimeout(resolve,180))
    if(!cancelled)controller.enqueue(new Uint8Array(0))
    return
   }
   if(mode==='eof')controller.close()
   if(mode==='data')controller.enqueue(new Uint8Array([1]))
   if(mode==='zero')controller.enqueue(new Uint8Array(0))
   if(mode==='error')controller.error(Error('synthetic stream error'))
   if(mode==='late_eof'){
    await new Promise(resolve=>setTimeout(resolve,180))
    if(!cancelled)controller.close()
   }
  },cancel(){cancelled=true}},{highWaterMark:0})
  const started=performance.now()
  const response=await host(new Request('https://qualification.invalid/worker',{method:'POST',duplex:'half',
   headers:{authorization:'Bearer synthetic-invoke','content-length':'0'},body:stream}))
  assert.equal(response.status,mode==='eof'?503:400,mode)
  assert.equal(calls,mode==='eof'?1:0,mode)
  assert.ok(pulls<=2,mode)
  assert.ok(performance.now()-started<1000,mode)
 }
})

test('host HTTP recovery waits on native claim owners and never admits new work',async()=>{
 const seen=[]
 const host=qikWorkerHost({...defaults,fetchImpl:async(url,options)=>{
  const name=new URL(url).pathname.split('/').at(-1)
  seen.push({name,profile:options.headers['content-profile']})
  if(name==='worker_journal_pending')return new Response(JSON.stringify([
   {key:'worker_claim:00000000-0000-4000-8000-000000000001',action:'hold_claim'}]))
  if(name==='worker_resume_claim')return new Response(JSON.stringify({state:'waiting_lease'}))
  throw Error('unexpected new work')
 }})
 const response=await host(request())
 assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{state:'waiting_native_claim_recovery',recovered:0,held:1})
 assert.deepEqual(seen.map(x=>x.name),['worker_journal_pending','worker_resume_claim'])
 assert.ok(seen.every(x=>x.profile==='mip_identity'))
})

test('host HTTP exhausted native claim retains failure without a new claim',async()=>{
 const seen=[]
 const host=qikWorkerHost({...defaults,fetchImpl:async(url)=>{
  const name=new URL(url).pathname.split('/').at(-1)
  seen.push(name)
  if(name==='worker_journal_pending')return new Response(JSON.stringify([
   {key:'worker_claim:00000000-0000-4000-8000-000000000002',action:'hold_claim'}]))
  if(name==='worker_resume_claim')return new Response(JSON.stringify({state:'exhausted'}))
  throw Error('unexpected new work')
 }})
 const response=await host(request())
 assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{state:'recovery_required',recovered:0})
 assert.deepEqual(seen,['worker_journal_pending','worker_resume_claim'])
})
