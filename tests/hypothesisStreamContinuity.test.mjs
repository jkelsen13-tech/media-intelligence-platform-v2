// Synthetic mechanism tests. No source material or production permissions.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {consumeSourceCapture} from '../supabase/qualification/hypothesis-assessments/coveredRevisionConsumer.mjs'
import {recordBootstrap} from '../supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs'
import {frames,epoch} from './hypothesisPgoutputFixture.mjs'
const hash=v=>createHash('sha256').update(v).digest('hex')
async function fixture(){
 const context={source_id:epoch,stream_epoch:epoch},entries=new Map(),calls={prepare:0,advance:0}
 const journal={putOnce:async(k,v)=>{
  const text=JSON.stringify(v);if(entries.has(k)&&entries.get(k)!==text)throw Error('synthetic_content_conflict')
  entries.set(k,text);return {committed:true}
 },get:async k=>entries.has(k)?JSON.parse(entries.get(k)):null}
 const base=await recordBootstrap({context,observationEpoch:epoch,journal,
  input:{consistent_lsn:'0/10',snapshot_id:'00000003-000000AA-1',rows:[]}})
 const wire=frames().map(b=>b.toString('hex'))
 const capture={schema:'mip_source_capture_v1',id:epoch,binding_id:epoch,...context,observation_epoch:epoch,
  bootstrap_hash:base.hash,before_lsn:'0/10',end_lsn:'0/3FC',frame_hash:hash(wire.join('\n')),frames:wire}
 let prepared
 const prepare=async p=>{calls.prepare++;prepared=p;return p.request}
 const advance=async p=>{
  calls.advance++
  return {frame_hash:capture.frame_hash,covered_through:capture.end_lsn,covered_from:capture.before_lsn,capture_id:capture.id,
   historical_time_qualified:false,end_lsn:capture.end_lsn,request_id:p.request,state:'slot_advance_observed'}
 }
 const options={capture,bindingId:epoch,context,observationEpoch:epoch,relationId:'42',session:epoch,journal,prepare,advance}
 return {options,entries,calls,prepared:()=>prepared}
}
test('covered consumer binds native transcript/bootstrap/durable delivery and retains exact acknowledgement',async()=>{
 const f=await fixture(),first=await consumeSourceCapture(f.options),request=f.prepared().request
 assert.equal(first.commits,1);assert.equal(first.historical_time_qualified,false)
 assert.equal(f.prepared().capture,epoch);assert.equal(f.prepared().frames,f.options.capture.frame_hash)
 assert.equal(f.prepared().bootstrap,f.options.capture.bootstrap_hash)
 assert.match(f.prepared().hash,/^[0-9a-f]{64}$/)
 const receipt=await f.options.journal.get(first.coverage_key)
 assert.equal(receipt.covered_through,'0/3FC')
 await consumeSourceCapture(f.options)
 assert.equal(f.prepared().request,request);assert.equal(f.calls.advance,2)
})
test('covered consumer denies unbound identities, transcript changes, unknown fields and malformed intervals before writing',async()=>{
 for(const mutate of [
  c=>c.binding_id='22222222-2222-4222-8222-222222222222',
  c=>c.stream_epoch='22222222-2222-4222-8222-222222222222',
  c=>c.observation_epoch='22222222-2222-4222-8222-222222222222',
  c=>c.frames[0]=c.frames[0].toUpperCase(),
  c=>c.frame_hash='f'.repeat(64),c=>c.bootstrap_hash='f'.repeat(64),
  c=>c.end_lsn='0/3FD',c=>c.before_lsn='0/400',c=>c.before_lsn='00/10',
  c=>c.body='Synthetic forbidden extra',c=>c.frames=[]]){
  const f=await fixture(),before=f.entries.size;mutate(f.options.capture)
  await assert.rejects(()=>consumeSourceCapture(f.options))
  assert.equal(f.calls.prepare,0);assert.equal(f.calls.advance,0);assert.equal(f.entries.size,before)
 }
})
test('complete transcript is required; recomputed hashes cannot turn multiple or incomplete transactions into one capture',async()=>{
 for(const kind of ['multiple','incomplete']){
  const f=await fixture(),c=f.options.capture
  c.frames=kind==='multiple'?[...frames(),...frames({commit:2000,end:2020})].map(x=>x.toString('hex')):c.frames.slice(0,-1)
  c.frame_hash=hash(c.frames.join('\n'))
  await assert.rejects(()=>consumeSourceCapture(f.options))
  assert.equal(f.calls.prepare,0);assert.equal(f.calls.advance,0)
 }
})
test('a rejected source binding never advances despite locally retained candidate metadata',async()=>{
 const f=await fixture()
 f.options.prepare=async()=>{throw Error('synthetic_source_capture_mismatch')}
 await assert.rejects(()=>consumeSourceCapture(f.options),/synthetic_source_capture_mismatch/)
 assert.equal(f.calls.advance,0)
 assert.equal([...f.entries.keys()].some(k=>k.startsWith('coverage-v1:')),false)
})
test('coverage receipt mismatch cannot become an accepted acknowledgement',async()=>{
 for(const field of ['capture_id','covered_from','covered_through','frame_hash']){
  const f=await fixture(),advance=f.options.advance
  f.options.advance=async p=>({...await advance(p),[field]:'synthetic-wrong'})
  await assert.rejects(()=>consumeSourceCapture(f.options),/mip_source_capture_denied/)
  assert.equal([...f.entries.keys()].some(k=>k.startsWith('coverage-v1:')),false)
 }
})
test('lost source reply replays stable permit and retained delivery without an in-memory request map',async()=>{
 const f=await fixture(),advance=f.options.advance;let firstRequest
 f.options.advance=async p=>{firstRequest=p.request;await advance(p);throw Error('synthetic_lost_source_reply')}
 await assert.rejects(()=>consumeSourceCapture(f.options),/synthetic_lost_source_reply/)
 f.options={...f.options,advance}
 await consumeSourceCapture(f.options)
 assert.equal(f.prepared().request,firstRequest)
})
test('consumer requires committed exact coverage receipt readback',async()=>{
 for(const kind of ['uncommitted','missing','changed']){
  const f=await fixture(),old=f.options.journal
  f.options.journal={putOnce:async(k,v)=>{const r=await old.putOnce(k,v);return k.startsWith('coverage-v1:')&&kind==='uncommitted'?{committed:false}:r},
   get:async k=>{const v=await old.get(k);return k.startsWith('coverage-v1:')?(kind==='missing'?null:kind==='changed'?{...v,extra:true}:v):v}}
  await assert.rejects(()=>consumeSourceCapture(f.options),/mip_coverage_receipt_not_durable/)
 }
})
