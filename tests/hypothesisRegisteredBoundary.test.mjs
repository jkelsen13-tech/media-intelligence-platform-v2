import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {frames,epoch} from './hypothesisPgoutputFixture.mjs'
import {decodeRegisteredMarkerBoundary} from '../supabase/qualification/hypothesis-assessments/registeredMarkerDecoder.mjs'
import {boundaryRegistrationEnvelope,boundaryRegistrationDigest,retainBoundaryRegistration,createBoundaryCustodyTransport} from '../supabase/qualification/hypothesis-assessments/boundaryRegistrationCustody.mjs'
import {consumeBoundaryCapture} from '../supabase/qualification/hypothesis-assessments/coveredBoundaryConsumer.mjs'
import {recordBootstrap} from '../supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs'
const id=n=>String(n).repeat(8)+'-'+String(n).repeat(4)+'-4'+String(n).repeat(3)+'-8'+String(n).repeat(3)+'-'+String(n).repeat(12)
const reg={version:2,sequence:1,previous:'',source:id(1),stream:id(2),bindingId:id(3),incarnationId:id(4),recoveryEvidence:'a'.repeat(64),contractDigest:'b'.repeat(64)}
const session=id(5),marker=id(6),captureId=id(7)
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b}
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b}
const str=s=>Buffer.from(s+'\0'),byte=n=>Buffer.from([n])
function native(){
 const data=frames({revision:marker})
 const columns=[['marker_id',2950,1],['binding_id',2950,0],['epoch',2950,0],['creator_xid',5069,0]]
 data[1]=Buffer.concat([byte(82),u32(42),str('mip_temporal'),str('registered_stream_markers'),byte(100),u16(4),
  ...columns.flatMap(([name,type,flag])=>[byte(flag),str(name),u32(type),u32(4294967295)])])
 data[2]=Buffer.concat([byte(73),u32(42),byte(78),u16(4),...[marker,reg.bindingId,epoch,'4294967303'].flatMap(v=>[byte(116),u32(v.length),Buffer.from(v)])])
 return data
}
const markerOptions={relationId:'42',observationEpoch:epoch,markerId:marker,bindingId:reg.bindingId,creatorXid:'4294967303'}
function custody(){
 const values=new Map(),requests=new Map();let head=null
 return {withAuthority:async(scope,fn)=>fn({
  head:async()=>head,read:async d=>values.get(d),
  append:async(d,e)=>{values.set(d,JSON.parse(JSON.stringify(e)));head=d},
  bindRequest:async(r,e)=>{if(requests.has(r)&&JSON.stringify(requests.get(r))!==JSON.stringify(e))throw Error('conflict');requests.set(r,e)},
  readRequest:async r=>requests.get(r)
 }),requests,setHead:v=>{head=v}}
}
function journal(){
 const entries=new Map()
 return {putOnce:async(k,v)=>{const text=JSON.stringify(v);if(entries.has(k)&&entries.get(k)!==text)throw Error('immutable_conflict');entries.set(k,text);return {committed:true}},
 get:async k=>entries.has(k)?JSON.parse(entries.get(k)):null}
}
test('registered marker decoder binds source request, binding, epoch and full xid',()=>{
 const data=native(),decoded=decodeRegisteredMarkerBoundary(data,markerOptions)
 assert.equal(decoded.binding_id,reg.bindingId);assert.equal(decoded.end_lsn,'0/3FC')
 for(const opt of [{bindingId:id(9)},{creatorXid:'4294967304'},{markerId:id(9)},{observationEpoch:id(9)},{relationId:'43'}])
  assert.throws(()=>decodeRegisteredMarkerBoundary(data,{...markerOptions,...opt}))
 assert.throws(()=>decodeRegisteredMarkerBoundary([...data,...data],markerOptions))
 const bad=native();bad[2][0]=77;assert.throws(()=>decodeRegisteredMarkerBoundary(bad,markerOptions))
})
test('v2 custody forwards exact incarnation and contract, requires durable issue/prepare identities and current head',async()=>{
 assert.throws(()=>boundaryRegistrationEnvelope({...reg,version:1}))
 const c=custody();await retainBoundaryRegistration({envelope:reg,withAuthority:c.withAuthority})
 const calls=[],api=createBoundaryCustodyTransport({envelope:reg,expectedHead:boundaryRegistrationDigest(reg),withAuthority:c.withAuthority,
  call:async(name,args)=>{calls.push({name,args});return args}})
 await assert.rejects(()=>api.capture({session,bindingId:reg.bindingId,before:'0/1',request:captureId,target:marker}))
 await api.issue({session,bindingId:reg.bindingId,request:marker})
 await api.capture({session,bindingId:reg.bindingId,before:'0/1',request:captureId,target:marker})
 assert.equal(calls[0].args[2],reg.incarnationId);assert.equal(calls[0].args[3],reg.contractDigest)
 assert.equal(calls[1].args[2],reg.incarnationId);assert.equal(calls[1].args[3],reg.contractDigest)
 await assert.rejects(()=>api.advance({session,request:id(8)}))
 c.setHead('c'.repeat(64));await assert.rejects(()=>api.issue({session,bindingId:reg.bindingId,request:marker}))
})
test('full retained bootstrap and typed marker delivery precede prepare; adapter mutation cannot change endpoint',async()=>{
 const j=journal(),scope={source_id:reg.source,stream_epoch:reg.stream}
 const baseline=await recordBootstrap({context:scope,observationEpoch:epoch,journal:j,input:{consistent_lsn:'0/1',snapshot_id:'00000001-00000002-1',rows:[]}})
 const data=native(),hex=data.map(x=>x.toString('hex'))
 const c={schema:'mip_source_boundary_capture_v2',id:captureId,binding_id:reg.bindingId,source_id:reg.source,stream_epoch:reg.stream,
  observation_epoch:epoch,bootstrap_hash:baseline.hash,before_lsn:'0/1',end_lsn:'0/3FC',
  frame_hash:createHash('sha256').update(hex.join('\n')).digest('hex'),frames:hex,kind:'marker',target_marker:marker,
  incarnation_id:reg.incarnationId,contract_digest:reg.contractDigest,marker_creator_xid:'4294967303'}
 let prepared
 const transport={prepare:async p=>{
  prepared={...p}
  const saved=await j.get('boundary-delivery-v2:'+reg.bindingId+':'+captureId)
  assert.equal(saved.capture.end_lsn,p.end);assert.equal(saved.decoded.marker_id,marker)
  return p.request
 },advance:async p=>({state:'slot_advance_observed',request_id:p.request,end_lsn:'0/3FC',capture_id:captureId,
  covered_from:'0/1',covered_through:'0/3FC',frame_hash:c.frame_hash,kind:'marker',target_marker:marker,
  contract_digest:reg.contractDigest,historical_time_qualified:false})}
 const result=await consumeBoundaryCapture({capture:c,registration:reg,observationEpoch:epoch,revisionRelation:'41',markerRelation:'42',session,
  journal:{get:j.get,putOnce:async(k,v)=>{const r=await j.putOnce(k,v);if(v.capture)v.capture.end_lsn='F/FFF';return r}},transport})
 assert.equal(result.covered_through,'0/3FC');assert.equal(prepared.end,'0/3FC')
 await assert.rejects(()=>consumeBoundaryCapture({capture:{...c,bootstrap_hash:'c'.repeat(64)},registration:reg,observationEpoch:epoch,
  revisionRelation:'41',markerRelation:'42',session,journal:j,transport}))
})
