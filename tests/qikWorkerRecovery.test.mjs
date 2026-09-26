import test from 'node:test'
import assert from 'node:assert/strict'
import {resumeQikJournaledWorker,runQikJournaledWorker} from '../supabase/functions/source-comparison-generation-candidate/qikWorkerJournal.js'
const key='worker_complete:00000000-0000-0000-0000-000000000001'
test('restart discovers exact terminal key and uses fresh authority before admitting work',async()=>{
 const calls=[]
 const result=await runQikJournaledWorker({runtime:'r',session:'fresh',rpc:async(name,args)=>{
  calls.push(name);assert.equal(args.p_session,'fresh')
  if(name==='worker_journal_pending')return [{key,action:'retry_terminal',native_state:'completed'}]
  if(name==='worker_journal_get')return {version:1,operation:'worker_complete',args:{p_runtime:'r',p_request:key.split(':')[1]}}
  if(name==='worker_journal_put')return true
  if(name==='worker_complete')return 'completed'
  throw Error('unexpected claim')
 }})
 assert.deepEqual(result,{state:'recovery_required',recovered:1})
 assert.deepEqual(calls,['worker_journal_pending','worker_journal_get','worker_journal_put','worker_complete','worker_journal_put'])
})
test('discovered claim asks its native owner and waits without generic polling or cancellation',async()=>{
 const calls=[]
 const result=await resumeQikJournaledWorker({runtime:'r',session:'fresh',rpc:async(name)=>{
  calls.push(name)
  if(name==='worker_journal_pending')return [{key:key.replace('complete','claim'),action:'hold_claim',native_state:'processing'}]
  if(name==='worker_resume_claim')return {state:'waiting_lease'}
  throw Error('unexpected RPC')
 }})
 assert.deepEqual(result,{state:'waiting_native_claim_recovery',recovered:0,held:1})
 assert.deepEqual(calls,['worker_journal_pending','worker_resume_claim'])
})
test('drain gates admission but does not cancel a recovery already invoked',async()=>{
 let drain=false,completed=false
 const result=await resumeQikJournaledWorker({runtime:'r',session:'fresh',shouldDrain:()=>drain,rpc:async(name)=>{
  if(name==='worker_journal_pending')return [{key,action:'retry_terminal',native_state:'processing'}]
  if(name==='worker_journal_get'){drain=true;return {version:1,operation:'worker_complete',args:{p_runtime:'r',p_request:key.split(':')[1]}}}
  if(name==='worker_journal_put')return true
  if(name==='worker_complete'){completed=true;return 'completed'}
 }})
 assert.equal(completed,true);assert.equal(result.recovered,1)
 assert.deepEqual(await resumeQikJournaledWorker({shouldDrain:()=>true,rpc:()=>{throw Error('unexpected RPC')}}),{state:'draining',recovered:0})
})
test('page bounds and malformed discovery refuse before new work',async()=>{
 for(const pageSize of [0,51,1.1])await assert.rejects(resumeQikJournaledWorker({pageSize}),/page_bounds/)
 await assert.rejects(resumeQikJournaledWorker({rpc:async()=>[{key:'bad',action:'retry_terminal'}]}),/discovery_shape/)
})

test('successive bounded pages make terminal progress before empty-page admission',async()=>{
 const outstanding=[key,key.replace(/1$/,'2')];let claims=0
 const options={runtime:'r',session:'s',pageSize:1,requestId:()=> 'new-request',rpc:async(name,args)=>{
  if(name==='worker_journal_pending')return outstanding.slice(0,1).map(key=>({key,action:'retry_terminal',native_state:'completed'}))
  if(name==='worker_journal_get')return {version:1,operation:'worker_complete',args:{p_runtime:'r',p_request:args.p_key.split(':')[1]}}
  if(name==='worker_journal_put'){if(args.p_key.endsWith(':receipt')&&args.p_key.startsWith('worker_complete'))outstanding.shift();return true}
  if(name==='worker_complete')return 'completed'
  if(name==='worker_claim'){claims++;return null}
 }}
 assert.deepEqual(await runQikJournaledWorker(options),{state:'recovery_required',recovered:1})
 assert.deepEqual(await runQikJournaledWorker(options),{state:'recovery_required',recovered:1})
 assert.equal(claims,0)
 assert.deepEqual(await runQikJournaledWorker(options),{state:'idle'})
 assert.equal(claims,1)
})
