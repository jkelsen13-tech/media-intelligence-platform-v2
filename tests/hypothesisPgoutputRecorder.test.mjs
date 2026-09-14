import test from 'node:test'
import assert from 'node:assert/strict'
import {decodeRevisionCommits,recordPgoutputBatch} from '../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs'
import {frames,epoch} from './hypothesisPgoutputFixture.mjs'
const options={relationId:'42',observationEpoch:epoch},context={source_id:epoch,stream_epoch:epoch}
test('pgoutput metadata decoder binds actual protocol fields without conflating commit and end LSN',()=>{
 const [r]=decodeRevisionCommits(frames(),options)
 assert.equal(r.input.commit_lsn,'0/3E8');assert.equal(r.end_lsn,'0/3FC')
 assert.equal(r.input.revisions[0].creator_xid,'4294967303')
 assert.equal(r.input.commit_time,'2026-09-12T12:00:00.123456Z')
})
test('pgoutput decoder fails closed on truncation, trailing data, scope/schema/epoch mismatch and unsupported messages',()=>{
 for(const mutate of [
  f=>f.slice(0,-1),f=>f.slice(1),f=>[...f,Buffer.from('O')],f=>[...f,Buffer.from('U')],f=>[...f,Buffer.from('D')],
  f=>[...f,Buffer.from('T')],f=>[...f,Buffer.from('S')],f=>[...f,Buffer.from('b')],
  f=>f.map((v,i)=>i===1?Buffer.concat([v,Buffer.from([0])]):v),
  f=>f.map((v,i)=>i===2?v.subarray(0,-1):v),
  f=>[f[0],f[2],f[3]],f=>[f[0],f[0],...f.slice(1)]
 ])assert.throws(()=>decodeRevisionCommits(mutate(frames()),options))
 assert.throws(()=>decodeRevisionCommits(frames({relation:43}),options))
 assert.throws(()=>decodeRevisionCommits(frames(),{...options,observationEpoch:'22222222-2222-4222-8222-222222222222'}))
 assert.throws(()=>decodeRevisionCommits(frames({full:'4294967304'}),options))
})
test('pgoutput order rejects duplicate or backwards commits and validates whole batch before effects',async()=>{
 assert.throws(()=>decodeRevisionCommits([...frames(),...frames()],options))
 let calls=0
 await assert.rejects(()=>recordPgoutputBatch({frames:[...frames(),Buffer.from('U')],...options,context,
 journal:{putOnce:async()=>{calls++}},acknowledge:async()=>{calls++}}))
 assert.equal(calls,0)
})
test('pgoutput retains exact delivery end position before commit readback and acknowledgement',async()=>{
 const retained=new Map(),order=[]
 const journal={async putOnce(k,v){order.push('put');const text=JSON.stringify(v);if(retained.has(k)&&retained.get(k)!==text)throw Error('synthetic conflict');retained.set(k,text);return {committed:true}},
 async get(k){order.push('get');return JSON.parse(retained.get(k))}}
 let ack
 const result=await recordPgoutputBatch({frames:frames(),...options,context,journal,acknowledge:async p=>{order.push('ack');ack=p}})
 assert.deepEqual(order,['put','get','put','get','ack']);assert.equal(ack.end_lsn,'0/3FC');assert.equal(result.historical_time_qualified,false)
 await assert.rejects(()=>recordPgoutputBatch({frames:frames({end:1021}),...options,context,journal,acknowledge:async()=>assert.fail('must not ack conflict')}))
})
