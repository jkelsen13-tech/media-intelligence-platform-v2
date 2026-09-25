import test from 'node:test'
import assert from 'node:assert/strict'
import {qikWorkerJournal} from '../supabase/functions/source-comparison-generation-candidate/qikWorkerJournal.js'

test('qik journal requires explicit transport/session and never discovers credentials',()=>{
 for(const options of [{},{rpc:()=>{},runtime:'r'},{rpc:()=>{},runtime:'',session:'s'}])
  assert.throws(()=>qikWorkerJournal(options),/mip_journal_context/)
})
test('putOnce awaits positive database acknowledgement and isolates caller mutation',async()=>{
 let release,seen
 const rpc=async(name,args)=>{
  assert.equal(name,'worker_journal_put');seen=args
  await new Promise(resolve=>{release=resolve})
  return true
 }
 const journal=qikWorkerJournal({rpc,runtime:'r',session:'s'})
 const entry={version:1,operation:'worker_claim',args:{p_runtime:'r',p_request:'request'}}
 let finished=false
 const result=journal.putOnce('worker_claim:request',entry).then(()=>{finished=true})
 entry.args.p_request='changed-after-call'
 assert.equal(finished,false)
 assert.equal(seen.p_entry.args.p_request,'request')
 assert.equal(Object.hasOwn(seen.p_entry.args,'p_session'),false)
 release();await result
 assert.equal(finished,true)
})
test('missing acknowledgement, database conflict and session-in-entry all reject',async()=>{
 for(const response of [false,null,undefined,'true']){
  const journal=qikWorkerJournal({rpc:async()=>response,runtime:'r',session:'s'})
  await assert.rejects(journal.putOnce('key',{}),/mip_journal_commit_unconfirmed/)
 }
 const journal=qikWorkerJournal({rpc:async()=>{throw Error('mip_journal_content_conflict')},runtime:'r',session:'s'})
 await assert.rejects(journal.putOnce('key',{}),/mip_journal_content_conflict/)
 let calls=0
 const protectedJournal=qikWorkerJournal({rpc:async()=>{calls++;return true},runtime:'r',session:'s'})
 await assert.rejects(protectedJournal.putOnce('key',{args:{p_session:'old'}}),/mip_journal_session_retention/)
 assert.equal(calls,0)
})
test('fresh process journal reads by exact key using its fresh session only',async()=>{
 const seen=[]
 const journal=qikWorkerJournal({rpc:async(name,args)=>{seen.push([name,args]);return null},runtime:'r',session:'fresh'})
 assert.equal(await journal.get('worker_complete:exact-request'),null)
 assert.deepEqual(seen,[['worker_journal_get',{p_runtime:'r',p_session:'fresh',p_key:'worker_complete:exact-request'}]])
})
