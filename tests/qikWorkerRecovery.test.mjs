import test from 'node:test'
import assert from 'node:assert/strict'
import {resumeQikJournaledWorker} from '../supabase/functions/source-comparison-generation-candidate/qikWorkerJournal.js'
const key='worker_complete:00000000-0000-0000-0000-000000000001'
test('restart discovers exact terminal key and uses fresh authority before admitting work',async()=>{
 const calls=[]
 const result=await resumeQikJournaledWorker({runtime:'r',session:'fresh',rpc:async(name,args)=>{
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
test('unknown claim holds native ownership and never polls or cancels it',async()=>{
 const calls=[]
 const result=await resumeQikJournaledWorker({runtime:'r',session:'fresh',rpc:async(name)=>{
  calls.push(name);return [{key:key.replace('complete','claim'),action:'hold_claim',native_state:'processing'}]
 }})
 assert.deepEqual(result,{state:'held_claim_requires_native_owner',recovered:0,held:1})
 assert.deepEqual(calls,['worker_journal_pending'])
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
