// Concrete qik-owned RPC journal for the existing durable worker. Undeployed.
// The SQL boundary removes session/lease tokens before storage and reconstructs
// terminal lease tokens from native state only under fresh bound authority.
import {runDurableGenerationWorker,recoverGenerationRequest,durableWorkerRpc} from './durableWorker.js'

import {processGenerationClaim} from './workerV2.js'

export function qikWorkerJournal({rpc,runtime,session}){
 if(typeof rpc!=='function'||typeof runtime!=='string'||!runtime||
    typeof session!=='string'||!session)throw Error('mip_journal_context')
 const context={p_runtime:runtime,p_session:session}
 return Object.freeze({
  async putOnce(key,entry){
   const retained=structuredClone(entry)
   if(retained.args&&Object.hasOwn(retained.args,'p_session'))throw Error('mip_journal_session_retention')
   const result=await rpc('worker_journal_put',{...context,p_key:key,p_entry:retained})
   if(result!==true)throw Error('mip_journal_commit_unconfirmed')
  },
  async get(key){
   return rpc('worker_journal_get',{...context,p_key:key})
  }
 })
}
export function runQikJournaledWorker(options){
 return resumeQikJournaledWorker(options)
}
export function recoverQikJournaledRequest(options){
 return recoverGenerationRequest({...options,journal:qikWorkerJournal(options)})
}

// Discovery and claim use separate transactions: concurrent callers may create
// pending work after an empty read. This is per-invocation admission, not a global
// drain or distributed serialization guarantee. Native leases/replay still own work.
// Startup/reconnect owner: no key comes from a caller or process memory.
// One bounded page per invocation; exact native owners resume expired claims.
// Active leases/backoff block admission. No cancellation or generic queue reset.
export async function resumeQikJournaledWorker(options){
 const {rpc,runtime,session,pageSize=20,shouldDrain=()=>false}=options
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>50)throw Error('mip_journal_page_bounds')
 if(await shouldDrain())return {state:'draining',recovered:0}
 const pending=await rpc('worker_journal_pending',{
  p_runtime:runtime,p_session:session,p_after:'',p_limit:pageSize})
 if(!Array.isArray(pending)||pending.length>pageSize)throw Error('mip_journal_discovery_shape')
 let recovered=0,held=0
 for(const item of pending){
  if(!item||typeof item.key!=='string'||!/^worker_(claim|complete|fail):[0-9a-f-]{36}$/.test(item.key)||
   !['retry_terminal','hold_claim'].includes(item.action))throw Error('mip_journal_discovery_shape')
  if(item.action==='hold_claim'){
   if(await shouldDrain())return {state:'draining',recovered}
   const resumed=await rpc('worker_resume_claim',{p_session:session,p_runtime:runtime,p_key:item.key})
   if(!resumed||!['resumed','resolved','exhausted','waiting_lease','waiting_backoff','terminal_pending'].includes(resumed.state))
    throw Error('mip_claim_resume_shape')
   if(resumed.state==='resumed'){
    if(!resumed.claim?.lease_token)throw Error('mip_claim_resume_shape')
    const result=await processGenerationClaim({...options,rpc:durableWorkerRpc({...options,journal:qikWorkerJournal(options)})},resumed.claim)
    // Stop on an ambiguous terminal; its exact request is now discoverable.
    if(!['completed','failed'].includes(result.state))return result
    recovered++
   }else if(['waiting_lease','waiting_backoff','terminal_pending'].includes(resumed.state))held++
   continue
  }
  if(!/^worker_(complete|fail):/.test(item.key))throw Error('mip_journal_discovery_shape')
  if(await shouldDrain())return {state:'draining',recovered}
  const result=await recoverQikJournaledRequest({...options,key:item.key})
  if(!['completed','failed'].includes(result))throw Error('mip_journal_recovery_unconfirmed')
  recovered++
 }
 if(held)return {state:'waiting_native_claim_recovery',recovered,held}
 // Re-query on the next bounded invocation. Never infer drained state from a
 // short page read before retries; other old requests may become visible.
 if(pending.length)return {state:'recovery_required',recovered}
 if(await shouldDrain())return {state:'draining',recovered}
 return runDurableGenerationWorker({...options,journal:qikWorkerJournal(options)})
}
