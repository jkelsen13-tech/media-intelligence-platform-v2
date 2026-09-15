import test from 'node:test'
import assert from 'node:assert/strict'
import {commitEnvelope,recordCommittedMetadata} from '../supabase/qualification/hypothesis-assessments/commitRecorder.mjs'
const id='11111111-1111-4111-8111-111111111111'
const context={source_id:id,stream_epoch:id}
const input=()=>({commit_lsn:'FFFFFFFF/FFFFFFFE',xid:'7',commit_time:'2026-09-14T12:00:00.123456Z',
 revisions:[{revision_id:id,observation_epoch:id,creator_xid:'9007199254740999'}]})
test('commit metadata preserves full-width positions and transaction IDs without Number coercion',()=>{
 const result=commitEnvelope(context,input())
 assert.equal(result.revisions[0].creator_xid,'9007199254740999')
 assert.equal(result.commit_lsn,'FFFFFFFF/FFFFFFFE')
})
test('commit metadata rejects bodies, unbound identity, malformed positions and mismatched transaction IDs',()=>{
 for(const mutate of [
  v=>v.body='synthetic forbidden extra',v=>v.commit_lsn='00/1',v=>v.commit_lsn='0/0',v=>v.commit_lsn='1/100000000',
  v=>v.xid=7,v=>v.xid='4294967296',v=>v.revisions[0].creator_xid='8',
  v=>v.revisions.push({...v.revisions[0]}),v=>v.revisions=[],v=>v.commit_time='not-a-time',v=>v.commit_time='2026-02-30T12:00:00Z'
 ]){const value=input();mutate(value);assert.throws(()=>commitEnvelope(context,value),/mip_commit_metadata_invalid/)}
 assert.throws(()=>commitEnvelope({...context,worker_attestation:true},input()),/mip_commit_metadata_invalid/)
})
test('commit acknowledgement follows committed exact readback only; uncertain writes and reads never acknowledge',async()=>{
 for(const mode of ['uncommitted','write_error','missing','changed','read_error','valid']){
  const order=[];let retained
  const journal={
   async putOnce(k,v){order.push('put');retained=v;if(mode==='write_error')throw Error('synthetic');return {committed:mode!=='uncommitted'}},
   async get(){order.push('get');if(mode==='read_error')throw Error('synthetic');return mode==='missing'?null:mode==='changed'?{...retained,xid:'8'}:retained}
  }
  const call=()=>recordCommittedMetadata({context,input:input(),journal,acknowledge:async()=>order.push('ack')})
  if(mode==='valid'){assert.equal((await call()).historical_time_qualified,false);assert.deepEqual(order,['put','get','ack'])}
  else {await assert.rejects(call);assert.equal(order.includes('ack'),false)}
 }
})
test('mutation during storage cannot change the captured envelope or acknowledgement position',async()=>{
 const value=input();let retained,ack
 const journal={async putOnce(k,v){retained=JSON.parse(JSON.stringify(v));value.commit_lsn='0/2';return {committed:true}},async get(){return retained}}
 await recordCommittedMetadata({context,input:value,journal,acknowledge:async v=>{ack=v}})
 assert.equal(ack.commit_lsn,'FFFFFFFF/FFFFFFFE')
})
