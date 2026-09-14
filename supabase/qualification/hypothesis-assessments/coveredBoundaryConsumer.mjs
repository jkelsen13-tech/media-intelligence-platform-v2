// Integrated isolated v2 consumer. Registration comes from trusted custody, never source discovery.
import {createHash} from 'node:crypto'
import {boundaryRegistrationEnvelope,boundaryRegistrationDigest} from './boundaryRegistrationCustody.mjs'
import {decodeRegisteredMarkerBoundary} from './registeredMarkerDecoder.mjs'
import {decodeRevisionCommits} from './pgoutputRecorder.mjs'
import {bootstrapKey,validateBootstrapCoverage,recordBootstrappedPgoutputBatch} from './temporalBootstrap.mjs'
const deny=()=>{throw Error('mip_registered_boundary_capture_denied')}
const hash=s=>createHash('sha256').update(s).digest('hex')
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const keys=['schema','id','binding_id','source_id','stream_epoch','observation_epoch','bootstrap_hash','before_lsn','end_lsn','frame_hash','frames','kind','target_marker','incarnation_id','contract_digest','marker_creator_xid'].sort().join('|')
function position(v){
 if(typeof v!=='string'||!/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/.test(v))deny()
 const p=v.split('/').map(x=>BigInt('0x'+x))
 if(p.map(x=>x.toString(16).toUpperCase()).join('/')!==v)deny()
 return (p[0]<<32n)|p[1]
}
export async function consumeBoundaryCapture({capture,registration,observationEpoch,revisionRelation,markerRelation,session,journal,transport}){
 const reg=boundaryRegistrationEnvelope(registration)
 if(!capture||Object.getPrototypeOf(capture)!==Object.prototype||Object.keys(capture).sort().join('|')!==keys||
 typeof journal?.get!=='function'||typeof journal?.putOnce!=='function'||typeof transport?.prepare!=='function'||typeof transport?.advance!=='function')deny()
 // Detach the source transcript and all configuration before async calls.
 const c=JSON.parse(JSON.stringify(capture)),source=reg.source,stream=reg.stream,scope={source_id:source,stream_epoch:stream}
 if(c.schema!=='mip_source_boundary_capture_v2'||c.binding_id!==reg.bindingId||c.source_id!==source||c.stream_epoch!==stream||
 c.incarnation_id!==reg.incarnationId||c.contract_digest!==reg.contractDigest||c.observation_epoch!==observationEpoch||
 ![session,c.id,c.target_marker,observationEpoch].every(v=>typeof v==='string'&&uid.test(v))||
 !/^[0-9a-f]{64}$/.test(c.bootstrap_hash)||!Array.isArray(c.frames)||c.frames.length===0||c.frames.length>100000||
 position(c.before_lsn)===0n||position(c.end_lsn)<=position(c.before_lsn))deny()
 let size=0
 const frames=c.frames.map(v=>{
  if(typeof v!=='string'||!/^([0-9a-f]{2})+$/.test(v)||v.length>8192)deny()
  size+=v.length/2;if(size>16777216)deny()
  return Buffer.from(v,'hex')
 })
 if(hash(c.frames.join('\n'))!==c.frame_hash)deny()
 let decoded,ids=[]
 if(c.kind==='marker'){
  decoded=decodeRegisteredMarkerBoundary(frames,{relationId:markerRelation,observationEpoch,markerId:c.target_marker,
   bindingId:reg.bindingId,creatorXid:c.marker_creator_xid})
 }else if(c.kind==='revision'){
  const tx=decodeRevisionCommits(frames,{relationId:revisionRelation,observationEpoch})
  if(tx.length!==1)deny()
  decoded=tx[0];ids=decoded.input.revisions.map(r=>r.revision_id)
 }else deny()
 const commit=c.kind==='marker'?decoded.commit_lsn:decoded.input.commit_lsn
 if(decoded.end_lsn!==c.end_lsn||position(commit)<position(c.before_lsn))deny()
 const envelope={schema:'mip_registered_boundary_delivery_v2',registration:boundaryRegistrationDigest(reg),capture:c,decoded,historical_time_qualified:false}
 const exact=JSON.stringify(envelope),digest=hash(exact),key='boundary-delivery-v2:'+reg.bindingId+':'+c.id
 const requestHash=hash(JSON.stringify(['mip-boundary-permit-v2',reg.bindingId,reg.contractDigest,c.id,digest]))
 const request=requestHash.slice(0,8)+'-'+requestHash.slice(8,12)+'-8'+requestHash.slice(13,16)+'-a'+requestHash.slice(17,20)+'-'+requestHash.slice(20,32)
 const baseline=await validateBootstrapCoverage({context:scope,observationEpoch,journal,revisionIds:ids})
 if(baseline.overlap||position(commit)<position(baseline.consistent_lsn)||
 hash(JSON.stringify(await journal.get(bootstrapKey(scope))))!==c.bootstrap_hash)deny()
 const put=await journal.putOnce(key,JSON.parse(exact))
 if(put?.committed!==true||JSON.stringify(await journal.get(key))!==exact)throw Error('mip_boundary_delivery_not_durable')
 let receipt
 const acknowledge=async()=>{
  if(JSON.stringify(await journal.get(key))!==exact)throw Error('mip_boundary_delivery_not_durable')
  const prepared=await transport.prepare({session,bindingId:reg.bindingId,source,stream,request,end:c.end_lsn,hash:digest,
   capture:c.id,bootstrap:c.bootstrap_hash,frames:c.frame_hash,target:c.target_marker})
  if(prepared!==request)deny()
  const result=await transport.advance({session,request})
  if(result?.state!=='slot_advance_observed'||result.request_id!==request||result.end_lsn!==c.end_lsn||
   result.capture_id!==c.id||result.covered_from!==c.before_lsn||result.covered_through!==c.end_lsn||
   result.frame_hash!==c.frame_hash||result.kind!==c.kind||result.target_marker!==c.target_marker||
   result.contract_digest!==reg.contractDigest||result.historical_time_qualified!==false)deny()
  receipt={state:result.state,request_id:request,end_lsn:c.end_lsn,capture_id:c.id,covered_from:c.before_lsn,
   covered_through:c.end_lsn,frame_hash:c.frame_hash,kind:c.kind,target_marker:c.target_marker,
   contract_digest:reg.contractDigest,historical_time_qualified:false}
 }
 if(c.kind==='revision')await recordBootstrappedPgoutputBatch({context:scope,observationEpoch,relationId:revisionRelation,frames,journal,acknowledge})
 else await acknowledge()
 const receiptKey='boundary-coverage-v2:'+reg.bindingId+':'+c.id,receiptText=JSON.stringify(receipt)
 const saved=await journal.putOnce(receiptKey,JSON.parse(receiptText))
 if(saved?.committed!==true||JSON.stringify(await journal.get(receiptKey))!==receiptText)throw Error('mip_boundary_receipt_not_durable')
 return {state:'registered_boundary_covered',kind:c.kind,covered_from:c.before_lsn,covered_through:c.end_lsn,
  capture_id:c.id,delivery_key:key,coverage_key:receiptKey,historical_time_qualified:false}
}
