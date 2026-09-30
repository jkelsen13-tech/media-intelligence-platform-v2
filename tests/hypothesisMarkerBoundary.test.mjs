import test from 'node:test'
import assert from 'node:assert/strict'
import {frames,epoch} from './hypothesisPgoutputFixture.mjs'
import {decodeMarkerBoundary,retainMarkerBoundary} from '../supabase/qualification/hypothesis-assessments/pgoutputBoundaryRecorder.mjs'
const options={relationId:'42',observationEpoch:epoch,markerId:epoch}
const context={source_id:epoch,stream_epoch:'22222222-2222-4222-8222-222222222222'}
const markerFrames=(args={})=>{
 const result=frames(args)
 result[1]=Buffer.from(result[1].toString('latin1').replace('mip_hypothesis','mip_temporal').replace('revision_transactions','stream_markers').replace('revision_id','marker_id'),'latin1')
 return result
}
const journal=()=>{const entries=new Map();return {entries,
 putOnce:async(k,v)=>{const text=JSON.stringify(v);if(entries.has(k)&&entries.get(k)!==text)throw Error('conflict');entries.set(k,text);return {committed:true}},
 get:async k=>entries.has(k)?JSON.parse(entries.get(k)):null}}
test('marker proof is a distinct native transaction with exact epoch, relation, xid and endpoint',()=>{
 const b=decodeMarkerBoundary(markerFrames(),options)
 assert.equal(b.end_lsn,'0/3FC');assert.equal(b.creator_xid,'4294967303')
 assert.equal(b.historical_time_qualified,false);assert.equal(Object.hasOwn(b,'revisions'),false)
 for(const [data,opt] of [
  [[],options],[frames(),options],[markerFrames().slice(0,-1),options],
  [[...markerFrames(),...markerFrames()],options],
  [markerFrames(),{...options,markerId:context.stream_epoch}],
  [markerFrames(),{...options,observationEpoch:context.stream_epoch}],
  [markerFrames(),{...options,relationId:'43'}],
  [markerFrames({full:'4294967304'}),options],
  [markerFrames({end:999}),options]
 ])assert.throws(()=>decodeMarkerBoundary(data,opt),/mip_marker_boundary_denied/)
})
test('mutation, logical message, extra tuple, trailing bytes and commit mismatch fail closed',()=>{
 for(const index of [0,1,2,3]){
  const data=markerFrames();data[index]=Buffer.concat([data[index],Buffer.from([0])])
  assert.throws(()=>decodeMarkerBoundary(data,options))
 }
 for(const kind of [77,85,68,84,83]){
  const data=markerFrames();data[2][0]=kind
  assert.throws(()=>decodeMarkerBoundary(data,options))
 }
 const data=markerFrames();data[3][9]^=1
 assert.throws(()=>decodeMarkerBoundary(data,options))
})
test('retention requires committed exact readback, immutable retry and never acknowledges',async()=>{
 const j=journal(),data=markerFrames()
 const args={...options,context,frames:data,journal:j}
 const result=await retainMarkerBoundary(args)
 assert.equal(result.state,'durable_marker_boundary_proof')
 assert.equal(result.authority_integrated,false);assert.equal(result.historical_time_qualified,false)
 assert.deepEqual(await retainMarkerBoundary(args),result)
 await assert.rejects(()=>retainMarkerBoundary({...args,frames:markerFrames({time:842529600123457n})}),/conflict/)
 await assert.rejects(()=>retainMarkerBoundary({...args,journal:{putOnce:async()=>({committed:false}),get:j.get}}),/not_durable/)
 await assert.rejects(()=>retainMarkerBoundary({...args,journal:{putOnce:j.putOnce,get:async()=>null}}),/not_durable/)
})
test('caller mutation during custody cannot change retained source or native transcript',async()=>{
 const j=journal(),data=markerFrames(),scope={...context}
 const result=await retainMarkerBoundary({...options,context:scope,frames:data,journal:{
  putOnce:async(k,v)=>{scope.source_id=context.stream_epoch;data[0].fill(0);return j.putOnce(k,v)},get:j.get}})
 assert.equal((await j.get(result.key)).source_id,context.source_id)
 assert.equal((await j.get(result.key)).frames[0][0],'4')
})

test('custody adapter mutation cannot alter the returned endpoint after retaining original bytes',async()=>{
 const j=journal()
 let adapterObject
 const result=await retainMarkerBoundary({...options,context,frames:markerFrames(),journal:{
  putOnce:async(k,v)=>{adapterObject=v;const receipt=await j.putOnce(k,v);v.boundary.end_lsn='F/FFFFFF';return receipt},
  get:async k=>{adapterObject.boundary.end_lsn='E/EEEEEE';return j.get(k)}
 }})
 const retained=await j.get(result.key)
 assert.equal(result.end_lsn,retained.boundary.end_lsn)
 assert.equal(result.end_lsn,'0/3FC')
})
