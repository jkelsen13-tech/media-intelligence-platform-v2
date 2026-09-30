import test from 'node:test'
import assert from 'node:assert/strict'
import {createFencedAcknowledgement} from '../supabase/qualification/hypothesis-assessments/fencedAcknowledgement.mjs'
import {commitEnvelope,commitJournalKey} from '../supabase/qualification/hypothesis-assessments/commitRecorder.mjs'
const id='11111111-1111-4111-8111-111111111111',context={source_id:id,stream_epoch:id}
const input={commit_lsn:'0/10',xid:'7',commit_time:'2026-09-14T12:00:00Z',revisions:[{revision_id:id,observation_epoch:id,creator_xid:'7'}]}
const e=commitEnvelope(context,input),key=commitJournalKey(e)
const delivery={schema:'mip_pgoutput_delivery_v1',relation_id:'42',observation_epoch:id,envelope:e,end_lsn:'0/20'}
const position={...context,commit_lsn:'0/10',end_lsn:'0/20'}
test('fenced acknowledgement derives exact stable permit identity across newly constructed adapters',async()=>{
 const seen=[]
 const options={bindingId:id,session:id,context,journal:{get:async k=>k===key?e:delivery},
 prepare:async p=>{seen.push(p);return p.request},
 advance:async p=>({state:'slot_advance_observed',request_id:p.request,end_lsn:'0/20',historical_time_qualified:false})}
 await createFencedAcknowledgement(options)(position);await createFencedAcknowledgement(options)(position)
 assert.deepEqual(seen[0],seen[1])
 assert.match(seen[0].request,/^[0-9a-f-]{36}$/)
})
test('fenced acknowledgement refuses mismatched/missing durable binding before issuing authority',async()=>{
 for(const variant of ['missing','wrong_end','wrong_source','missing_metadata','changed_metadata']){
  let issued=false
  const journal={get:async k=>{
   if(k===key)return variant==='missing_metadata'?null:variant==='changed_metadata'?{...e,xid:'8'}:e
   return variant==='missing'?null:variant==='wrong_end'?{...delivery,end_lsn:'0/21'}:
    variant==='wrong_source'?{...delivery,envelope:{...e,source_id:'22222222-2222-4222-8222-222222222222'}}:delivery
  }}
  await assert.rejects(()=>createFencedAcknowledgement({bindingId:id,session:id,context,journal,
   prepare:async()=>{issued=true},advance:async()=>assert.fail('unexpected advancement')})(position))
  assert.equal(issued,false)
 }
})
test('fenced acknowledgement does not treat substituted prepare or advance responses as success',async()=>{
 const base={bindingId:id,session:id,context,journal:{get:async k=>k===key?e:delivery}}
 let advanced=false
 await assert.rejects(()=>createFencedAcknowledgement({...base,prepare:async()=>id,advance:async()=>{advanced=true}})(position))
 assert.equal(advanced,false)
 await assert.rejects(()=>createFencedAcknowledgement({...base,prepare:async p=>p.request,
 advance:async p=>({state:'slot_advance_observed',request_id:p.request,end_lsn:'0/21',historical_time_qualified:false})})(position))
})
