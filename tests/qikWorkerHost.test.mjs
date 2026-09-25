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
