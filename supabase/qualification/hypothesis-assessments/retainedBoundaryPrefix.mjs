// Internal retained-prefix integrity only. Never an application history or authority grant.
import {createHash} from 'node:crypto'
import {boundaryRegistrationEnvelope,boundaryRegistrationDigest} from './boundaryRegistrationCustody.mjs'
import {bootstrapKey,validateBootstrapCoverage} from './temporalBootstrap.mjs'
import {decodeRegisteredMarkerBoundary} from './registeredMarkerDecoder.mjs'
import {decodeRevisionCommits} from './pgoutputRecorder.mjs'
import {commitEnvelope,commitJournalKey} from './commitRecorder.mjs'
const deny=()=>{throw Error('mip_retained_boundary_prefix_denied')}
const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const digest=s=>createHash('sha256').update(s).digest('hex')
const exact=(v,keys)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join('|')!==keys.split('|').sort().join('|'))deny()}
function pos(v){
 if(typeof v!=='string'||!/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/.test(v))deny()
 const p=v.split('/').map(x=>BigInt('0x'+x))
 if(p.map(x=>x.toString(16).toUpperCase()).join('/')!==v)deny()
 return (p[0]<<32n)|p[1]
}
const captureKeys='schema|id|binding_id|source_id|stream_epoch|observation_epoch|bootstrap_hash|before_lsn|end_lsn|frame_hash|frames|kind|target_marker|incarnation_id|contract_digest|marker_creator_xid'
export async function verifyRetainedBoundaryPrefix({registration,observationEpoch,revisionRelation,markerRelation,captureIds,terminalCapture,targetMarker,journal}={}){
 const reg=boundaryRegistrationEnvelope(registration),registrationDigest=boundaryRegistrationDigest(reg)
 if(!uid(observationEpoch)||!uid(terminalCapture)||!uid(targetMarker)||!Array.isArray(captureIds)||captureIds.length<1||
 captureIds.length>256||captureIds.some(x=>!uid(x))||new Set(captureIds).size!==captureIds.length||
 captureIds.at(-1)!==terminalCapture||typeof journal?.get!=='function')deny()
 const ids=[...captureIds],scope={source_id:reg.source,stream_epoch:reg.stream}
 // Bound work and pin exact JSON values. A final readback detects changes, not arbitrary atomic rollback.
 const retained=new Map();let bytes=0
 const read=async key=>{
  const value=await journal.get(key),text=JSON.stringify(value)
  if(typeof text!=='string')deny()
  bytes+=Buffer.byteLength(text)
  if(bytes>67108864||(!retained.has(key)&&retained.size>=4096))deny()
  if(retained.has(key)&&retained.get(key)!==text)deny()
  retained.set(key,text)
  return JSON.parse(text)
 }
 const baseline=await validateBootstrapCoverage({context:scope,observationEpoch,journal:{get:read}})
 const baselineKey=bootstrapKey(scope),baselineText=retained.get(baselineKey),baselineHash=digest(baselineText)
 const revisions=new Set()
 for(const [key,text]of retained){
  if(key===baselineKey||key.startsWith(baselineKey+':page:')){
   const value=JSON.parse(text),rows=value?.rows??value?.bootstrap?.rows??[]
   for(const row of rows){if(revisions.has(row.revision_id)||revisions.size>=100000)deny();revisions.add(row.revision_id)}
  }
 }
 let previous=baseline.consistent_lsn
 for(const id of ids){
  const key='boundary-delivery-v2:'+reg.bindingId+':'+id,delivery=await read(key)
  exact(delivery,'schema|registration|capture|decoded|historical_time_qualified')
  if(delivery.schema!=='mip_registered_boundary_delivery_v2'||delivery.registration!==registrationDigest||delivery.historical_time_qualified!==false)deny()
  const c=delivery.capture;exact(c,captureKeys)
  if(c.schema!=='mip_source_boundary_capture_v2'||c.id!==id||c.binding_id!==reg.bindingId||c.source_id!==reg.source||
  c.stream_epoch!==reg.stream||c.observation_epoch!==observationEpoch||c.incarnation_id!==reg.incarnationId||
  c.contract_digest!==reg.contractDigest||c.bootstrap_hash!==baselineHash||c.before_lsn!==previous||
  pos(c.end_lsn)<=pos(previous)||!uid(c.target_marker)||!Array.isArray(c.frames)||c.frames.length<1||c.frames.length>100000||
  digest(c.frames.join('\n'))!==c.frame_hash)deny()
  let frameBytes=0
  const frames=c.frames.map(x=>{
   if(typeof x!=='string'||!/^([0-9a-f]{2})+$/.test(x)||x.length>8192)deny()
   frameBytes+=x.length/2;if(frameBytes>16777216)deny()
   return Buffer.from(x,'hex')
  })
  let decoded,commit
  if(c.kind==='marker'){
   decoded=decodeRegisteredMarkerBoundary(frames,{relationId:markerRelation,observationEpoch,markerId:c.target_marker,bindingId:reg.bindingId,creatorXid:c.marker_creator_xid})
   commit=decoded.commit_lsn
  }else if(c.kind==='revision'){
   const commits=decodeRevisionCommits(frames,{relationId:revisionRelation,observationEpoch})
   if(commits.length!==1)deny()
   decoded=commits[0];commit=decoded.input.commit_lsn
   const envelope=commitEnvelope(scope,decoded.input),commitKey=commitJournalKey(envelope)
   if(JSON.stringify(await read(commitKey))!==JSON.stringify(envelope)||
    JSON.stringify(await read('delivery:'+commitKey))!==JSON.stringify({schema:'mip_pgoutput_delivery_v1',relation_id:revisionRelation,
     observation_epoch:observationEpoch,envelope,end_lsn:c.end_lsn}))deny()
   for(const row of decoded.input.revisions){
    if(revisions.has(row.revision_id)||revisions.size>=100000)deny()
    revisions.add(row.revision_id)
   }
  }else deny()
  if(decoded.end_lsn!==c.end_lsn||pos(commit)<pos(previous)||JSON.stringify(decoded)!==JSON.stringify(delivery.decoded))deny()
  const deliveryHash=digest(retained.get(key))
  const requestHash=digest(JSON.stringify(['mip-boundary-permit-v2',reg.bindingId,reg.contractDigest,id,deliveryHash]))
  const request=requestHash.slice(0,8)+'-'+requestHash.slice(8,12)+'-8'+requestHash.slice(13,16)+'-a'+requestHash.slice(17,20)+'-'+requestHash.slice(20,32)
  const receipt={state:'slot_advance_observed',request_id:request,end_lsn:c.end_lsn,capture_id:id,covered_from:c.before_lsn,
   covered_through:c.end_lsn,frame_hash:c.frame_hash,kind:c.kind,target_marker:c.target_marker,contract_digest:reg.contractDigest,historical_time_qualified:false}
  if(JSON.stringify(await read('boundary-coverage-v2:'+reg.bindingId+':'+id))!==JSON.stringify(receipt))deny()
  if(id===terminalCapture&&(c.kind!=='marker'||c.target_marker!==targetMarker))deny()
  previous=c.end_lsn
 }
 for(const [key,text]of retained)if(JSON.stringify(await journal.get(key))!==text)deny()
 return {schema:'mip_internal_retained_boundary_prefix_v1',registration_digest:registrationDigest,terminal_capture:terminalCapture,
  target_marker:targetMarker,consistent_lsn:baseline.consistent_lsn,covered_through:previous,revision_ids:[...revisions].sort(),
  proof_integrity_verified:true,source_authority_qualified:false,user_history_qualified:false,historical_time_qualified:false}
}
