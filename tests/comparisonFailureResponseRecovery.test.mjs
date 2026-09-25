import test from 'node:test'
import assert from 'node:assert/strict'
import {runGenerationWorker as original} from '../supabase/functions/source-comparison-generation-candidate/worker.js'
import {runGenerationWorker as deduped} from '../supabase/functions/source-comparison-generation-candidate/workerV2.js'
import {durableWorkerRpc,recoverGenerationRequest} from '../supabase/functions/source-comparison-generation-candidate/durableWorker.js'

const claim={generation_id:'generation',lease_token:'lease',input_hash:'hash',implementation_ref:'expected'}
const options={session:'session',runtime:'runtime',implementation:'mismatch',sha256:()=>{throw Error('unexpected hash')}}
function requestIds(){const calls=[];return {calls,id:kind=>{calls.push(kind);return kind+'-request'}}}
for(const [name,worker] of [['original',original],['deduped',deduped]]){
 test(name+': lost committed failure response retains exact request and no replacement claim',async()=>{
  const ids=requestIds(),sent=[];let committed=false
  const rpc=async(op,args)=>{
   sent.push([op,structuredClone(args)])
   if(op==='worker_claim')return claim
   assert.equal(op,'worker_fail')
   if(!committed){committed=true;throw Error('lost response')}
   return 'failed'
  }
  const result=await worker({...options,requestId:ids.id,rpc})
  assert.equal(result.state,'failure_unconfirmed');assert.equal(result.generation,'generation')
  assert.equal(await result.retry(),'failed')
  assert.deepEqual(sent[1],sent[2]);assert.deepEqual(ids.calls,['claim','failure'])
  assert.equal(sent.filter(([op])=>op==='worker_claim').length,1)
 })
 test(name+': authorization failure remains unconfirmed and retry rechecks authority',async()=>{
  let failures=0
  const result=await worker({...options,requestId:requestIds().id,rpc:async(op)=>{
   if(op==='worker_claim')return claim
   failures++;throw Error('mip_authz_revoked_session')
  }})
  assert.equal(result.state,'failure_unconfirmed')
  await assert.rejects(result.retry(),/mip_authz_revoked_session/)
  assert.equal(failures,2)
 })
 test(name+': acknowledged failure is terminal and idle/replayed claim does no computation',async()=>{
  const sent=[]
  const result=await worker({...options,requestId:requestIds().id,rpc:async op=>{sent.push(op);return op==='worker_claim'?claim:'failed'}})
  assert.equal(result.state,'failed');assert.equal(result.retry,undefined)
  assert.deepEqual(sent,['worker_claim','worker_fail'])
  for(const [value,state] of [[null,'idle'],[{generation_id:'generation'},'claim_receipt_only']]){
   let count=0
   assert.equal((await worker({...options,requestId:requestIds().id,rpc:async()=>{count++;return value}})).state,state)
   assert.equal(count,1)
  }
 })
 test(name+': durable journal records failure before send and recovers with fresh session',async()=>{
  const rows=new Map(),sent=[]
  const journal={get:async k=>structuredClone(rows.get(k)),putOnce:async(k,v)=>{
   if(rows.has(k))assert.deepEqual(rows.get(k),v);else rows.set(k,structuredClone(v))
  }}
  let lost=true
  const rpc=async(op,args)=>{
   sent.push([op,structuredClone(args)])
   if(op==='worker_claim')return claim
   assert.equal(Object.hasOwn(rows.get(op+':'+args.p_request).args,'p_session'),false)
   if(lost){lost=false;throw Error('lost')}
   return 'failed'
  }
  const result=await worker({...options,requestId:requestIds().id,rpc:durableWorkerRpc({rpc,journal,...options})})
  assert.equal(result.state,'failure_unconfirmed')
  assert.equal(await recoverGenerationRequest({rpc,journal,runtime:'runtime',session:'fresh',key:'worker_fail:failure-request'}),'failed')
  assert.equal(sent[2][1].p_session,'fresh')
  const prior={...sent[1][1]};delete prior.p_session
  const recovered={...sent[2][1]};delete recovered.p_session
  assert.deepEqual(prior,recovered)
  await assert.rejects(recoverGenerationRequest({rpc:async()=>{throw Error('mip_authz_revoked_session')},journal,runtime:'runtime',session:'revoked',key:'worker_fail:failure-request'}),/mip_authz_revoked_session/)
 })
}
