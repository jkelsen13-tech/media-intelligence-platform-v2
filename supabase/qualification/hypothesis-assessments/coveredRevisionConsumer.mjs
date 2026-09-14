// Source transcript consumer. Transport/custody are supplied by the isolated trusted recorder.
import {createHash} from 'node:crypto'
import {decodeRevisionCommits} from './pgoutputRecorder.mjs'
import {bootstrapKey,recordBootstrappedPgoutputBatch} from './temporalBootstrap.mjs'
import {createFencedAcknowledgement} from './fencedAcknowledgement.mjs'
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hash=v=>createHash('sha256').update(v).digest('hex')
const deny=()=>{throw Error('mip_source_capture_denied')}
const keys=['schema','id','binding_id','source_id','stream_epoch','observation_epoch','bootstrap_hash','before_lsn','end_lsn','frame_hash','frames'].sort().join('|')
function position(v){
 if(typeof v!=='string'||!/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/.test(v))deny()
 const parts=v.split('/').map(x=>BigInt('0x'+x))
 if(parts.map(x=>x.toString(16).toUpperCase()).join('/')!==v)deny()
 return (parts[0]<<32n)|parts[1]
}
export async function consumeSourceCapture({capture,bindingId,context,observationEpoch,relationId,session,journal,prepare,advance}){
 if(!capture||Object.getPrototypeOf(capture)!==Object.prototype||Object.keys(capture).sort().join('|')!==keys||
 capture.schema!=='mip_source_capture_v1'||!context||typeof journal?.get!=='function'||typeof journal?.putOnce!=='function'||
 typeof prepare!=='function'||typeof advance!=='function')deny()
 for(const v of [bindingId,context.source_id,context.stream_epoch,observationEpoch,session,capture.id])
  if(typeof v!=='string'||!uid.test(v))deny()
 if(capture.binding_id!==bindingId||capture.source_id!==context.source_id||capture.stream_epoch!==context.stream_epoch||
 capture.observation_epoch!==observationEpoch||typeof capture.bootstrap_hash!=='string'||!/^[0-9a-f]{64}$/.test(capture.bootstrap_hash)||
 !Array.isArray(capture.frames)||capture.frames.length===0||capture.frames.length>100000)deny()
 const before=position(capture.before_lsn),end=position(capture.end_lsn)
 if(before===0n||end<=before)deny()
 let bytes=0
 const frames=capture.frames.map(v=>{
  if(typeof v!=='string'||!/^([0-9a-f]{2})+$/.test(v)||v.length>8192)deny()
  bytes+=v.length/2;if(bytes>16777216)deny()
  return Buffer.from(v,'hex')
 })
 if(hash(capture.frames.join('\n'))!==capture.frame_hash)deny()
 const decoded=decodeRevisionCommits(frames,{relationId,observationEpoch})
 if(decoded.length!==1||decoded[0].end_lsn!==capture.end_lsn||position(decoded[0].input.commit_lsn)<before)deny()
 // Copy exact capture/context before asynchronous custody calls can mutate caller-owned objects.
 const fixed={id:capture.id,before:capture.before_lsn,end:capture.end_lsn,
  bootstrap:capture.bootstrap_hash,frames:capture.frame_hash}
 const scope={source_id:context.source_id,stream_epoch:context.stream_epoch}
 const saved=await journal.get(bootstrapKey(scope))
 if(!saved||hash(JSON.stringify(saved))!==fixed.bootstrap)deny()
 let receipt
 const acknowledge=createFencedAcknowledgement({bindingId,context:scope,session,journal,
  prepare:p=>prepare({...p,capture:fixed.id,bootstrap:fixed.bootstrap,frames:fixed.frames}),
  advance:async p=>{
   const result=await advance(p)
   if(result?.capture_id!==fixed.id||result.covered_from!==fixed.before||result.covered_through!==fixed.end||
    result.frame_hash!==fixed.frames)deny()
   // Normalize protocol fields; database JSON key order is not evidence mutation.
   receipt={state:result.state,request_id:result.request_id,end_lsn:result.end_lsn,
    historical_time_qualified:result.historical_time_qualified,capture_id:fixed.id,
    covered_from:fixed.before,covered_through:fixed.end,frame_hash:fixed.frames}
   return receipt
  }})
 const result=await recordBootstrappedPgoutputBatch({context:scope,observationEpoch,relationId,frames,journal,acknowledge})
 const key='coverage-v1:'+bindingId+':'+fixed.id,exact=JSON.stringify(receipt)
 const ack=await journal.putOnce(key,receipt)
 if(ack?.committed!==true||JSON.stringify(await journal.get(key))!==exact)throw Error('mip_coverage_receipt_not_durable')
 return {...result,coverage_key:key,covered_from:fixed.before,covered_through:fixed.end,capture_id:fixed.id}
}
