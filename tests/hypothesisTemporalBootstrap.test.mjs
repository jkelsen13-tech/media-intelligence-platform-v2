import test from 'node:test'
import assert from 'node:assert/strict'
import {bootstrapEnvelope,recordBootstrap,recordBootstrappedPgoutputBatch} from '../supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs'
import {frames,epoch} from './hypothesisPgoutputFixture.mjs'
const context={source_id:epoch,stream_epoch:epoch},base={context,observationEpoch:epoch}
const input=()=>({consistent_lsn:'0/10',snapshot_id:'00000003-000000AA-1',
 rows:[{revision_id:epoch,transaction_epoch:epoch,creator_xid:'9007199254740999'}]})
test('bootstrap preserves unknown and foreign transaction provenance without inventing historical time',()=>{
 const v=input();v.rows[0].transaction_epoch=null;v.rows[0].creator_xid=null
 const unknown=bootstrapEnvelope({...base,input:v})
 assert.equal(unknown.rows[0].provenance,'transaction_not_established');assert.equal(unknown.historical_time_qualified,false)
 v.rows[0].transaction_epoch='22222222-2222-4222-8222-222222222222';v.rows[0].creator_xid='9007199254740999'
 assert.equal(bootstrapEnvelope({...base,input:v}).rows[0].provenance,'foreign_transaction_epoch')
})
test('bootstrap refuses duplicate IDs, partial provenance, bodies and noncanonical positions',()=>{
 for(const change of [v=>v.rows.push({...v.rows[0]}),v=>v.rows[0].creator_xid=null,v=>v.body='synthetic extra',v=>v.consistent_lsn='00/10']){
  const v=input();change(v);assert.throws(()=>bootstrapEnvelope({...base,input:v}))
 }
})
test('bootstrap requires committed exact readback and never treats acknowledgement alone as durability',async()=>{
 for(const kind of ['uncommitted','missing','changed']){
  let saved
  const journal={putOnce:async(k,v)=>{saved=v;return {committed:kind!=='uncommitted'}},get:async()=>kind==='missing'?null:{...saved,rows:[]}}
  await assert.rejects(()=>recordBootstrap({...base,input:input(),journal}))
 }
})
test('stream gate denies missing baseline, pre-baseline commits and overlap before any write or acknowledgement',async()=>{
 let writes=0
 const journal={get:async()=>null,putOnce:async()=>{writes++}}
 const options={...base,journal,frames:frames(),relationId:'42',acknowledge:async()=>{writes++}}
 await assert.rejects(()=>recordBootstrappedPgoutputBatch(options))
 const v=input();journal.get=async()=>bootstrapEnvelope({...base,input:v})
 await assert.rejects(()=>recordBootstrappedPgoutputBatch(options)) // same ID is already in baseline
 v.rows=[];v.consistent_lsn='0/FFFF'
 await assert.rejects(()=>recordBootstrappedPgoutputBatch(options))
 assert.equal(writes,0)
})

test('bootstrap canonicalizes provider field order and replays through the stream gate without weakening exact readback',async()=>{
 const v=input();v.rows[0].revision_id='22222222-2222-4222-8222-222222222222'
 const reversed={rows:v.rows.map(r=>({creator_xid:r.creator_xid,transaction_epoch:r.transaction_epoch,revision_id:r.revision_id})),
 snapshot_id:v.snapshot_id,consistent_lsn:v.consistent_lsn}
 const reorderedContext={stream_epoch:epoch,source_id:epoch}
 const entries=new Map()
 const journal={putOnce:async(k,value)=>{
  const text=JSON.stringify(value);if(entries.has(k)&&entries.get(k)!==text)throw Error('synthetic_conflict')
  entries.set(k,text);return {committed:true}
 },get:async k=>entries.has(k)?JSON.parse(entries.get(k)):null}
 const first=await recordBootstrap({...base,input:reversed,context:reorderedContext,journal})
 const second=await recordBootstrap({...base,input:v,journal})
 assert.equal(first.hash,second.hash)
 let ack=0
 const result=await recordBootstrappedPgoutputBatch({...base,frames:frames(),relationId:'42',journal,acknowledge:async()=>{ack++}})
 assert.equal(ack,1);assert.equal(result.historical_time_qualified,false)
})
