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
