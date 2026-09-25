// Concrete qik-owned RPC journal for the existing durable worker. Undeployed.
// The SQL boundary removes session/lease tokens before storage and reconstructs
// terminal lease tokens from native state only under fresh bound authority.
import {runDurableGenerationWorker,recoverGenerationRequest} from './durableWorker.js'

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
 return runDurableGenerationWorker({...options,journal:qikWorkerJournal(options)})
}
export function recoverQikJournaledRequest(options){
 return recoverGenerationRequest({...options,journal:qikWorkerJournal(options)})
}
