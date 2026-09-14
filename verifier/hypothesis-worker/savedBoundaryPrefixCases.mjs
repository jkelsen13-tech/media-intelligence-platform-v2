import {savedBoundaryHistoryCases} from './savedBoundaryHistoryCases.mjs'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {quote as q} from '../integrated/transport.mjs'
import {verifyRetainedBoundaryPrefix} from '../../supabase/qualification/hypothesis-assessments/retainedBoundaryPrefix.mjs'
export async function savedBoundaryPrefixCases(t,f,configured,relations){
 async function prepared(t){
  const b=await configured(t,{paged:true}),revisions=await b.produce(),issue=await b.issue()
  const first=await b.capture(issue.marker_id);assert.equal(first.kind,'revision');await b.consume(first)
  const last=await b.capture(issue.marker_id,first.end_lsn);assert.equal(last.kind,'marker');await b.consume(last)
  const options={registration:b.registration,observationEpoch:f.observationEpoch,...relations,captureIds:[first.id,last.id],
   terminalCapture:last.id,targetMarker:issue.marker_id,journal:b.journal()}
  return {b,revisions,first,last,options}
 }
 await t.test('internal retained prefix verifies actual native deliveries without granting application history authority',async t=>{
  const {b,revisions,options,last}=await prepared(t),before=await b.confirmed()
  const result=await verifyRetainedBoundaryPrefix(options)
  assert.equal(result.covered_through,last.end_lsn)
  assert.ok(b.capturedIds.length>0,'native exported bootstrap must contain pre-existing revisions')
  for(const id of b.capturedIds)assert.ok(result.revision_ids.includes(id),'bootstrap member absent from verified prefix')
  for(const id of revisions)assert.ok(result.revision_ids.includes(id))
  assert.equal(result.proof_integrity_verified,true)
  for(const key of ['source_authority_qualified','user_history_qualified','historical_time_qualified'])assert.equal(result[key],false)
  const later=await b.produce(),again=await verifyRetainedBoundaryPrefix(options)
  assert.deepEqual(again,result);for(const id of later)assert.ok(!again.revision_ids.includes(id))
  assert.equal(await b.confirmed(),before);assert.equal(await b.checkpointCount(),'2')
 })
 await t.test('internal prefix rejects missing swapped omitted or corrupt retained basis and scope',async t=>{
  const {b,first,last,options}=await prepared(t),j=b.journal(),base='bootstrap-v1:'+b.registration.source+':'+b.registration.stream
  const firstKey='boundary-delivery-v2:'+b.bindingId+':'+first.id,lastKey='boundary-delivery-v2:'+b.bindingId+':'+last.id
  for(const missing of [base,base+':page:0',firstKey,lastKey,'boundary-coverage-v2:'+b.bindingId+':'+first.id]){
   await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,journal:{get:k=>k===missing?null:j.get(k)}}))
  }
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,journal:{get:k=>j.get(k===firstKey?lastKey:k)}}))
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,captureIds:[last.id]}))
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,captureIds:[last.id,first.id],terminalCapture:first.id}))
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,targetMarker:randomUUID()}))
  for(const key of ['source','stream','bindingId','incarnationId']){
   await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,registration:{...b.registration,[key]:randomUUID()}}))
  }
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,journal:{get:async k=>{
   const v=await j.get(k);if(k===base+':page:0')v.bootstrap.rows[0].creator_xid='999';return v
  }}}))
  let lost=false
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,journal:{get:async k=>{
   if(lost&&k===base)return null
   const v=await j.get(k);if(k==='boundary-coverage-v2:'+b.bindingId+':'+last.id)lost=true;return v
  }}}))
  assert.equal(await b.confirmed(),last.end_lsn);assert.equal(await b.checkpointCount(),'2')
 })
 await t.test('retained integrity cannot substitute source revocation or current journal admission',async t=>{
  const {b,options}=await prepared(t)
  await f.admin(b.revokeSql)
  await assert.rejects(()=>b.issue(),/mip_temporal_binding_denied/)
  const retained=await verifyRetainedBoundaryPrefix(options)
  assert.equal(retained.source_authority_qualified,false);assert.equal(retained.user_history_qualified,false)
  await f.admin('update mip_identity.mapping_heads set active=false where runtime='+q(b.runtime))
  await assert.rejects(()=>verifyRetainedBoundaryPrefix(options))
 })
 await savedBoundaryHistoryCases(t,f,prepared)
}
