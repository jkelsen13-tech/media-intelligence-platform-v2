// Trusted recorder adapter. Separate prepare/advance capabilities; no production connection or identity.
import {createHash} from 'node:crypto'
import {commitEnvelope,commitJournalKey} from './commitRecorder.mjs'
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const deny=()=>{throw Error('mip_fenced_ack_denied')}
export function createFencedAcknowledgement({bindingId,context,session,journal,prepare,advance}){
 if(!uid.test(bindingId)||!uid.test(session)||!context||!uid.test(context.source_id)||!uid.test(context.stream_epoch)||
 typeof prepare!=='function'||typeof advance!=='function'||typeof journal?.get!=='function')deny()
 // Retain configured identity, not mutable caller objects.
 const source=context.source_id,stream=context.stream_epoch
 return async position=>{
  if(!position||position.source_id!==source||position.stream_epoch!==stream)deny()
  const key='commit-v1:'+source+':'+stream+':'+position.commit_lsn
  const delivery=await journal.get('delivery:'+key)
  if(!delivery||delivery.schema!=='mip_pgoutput_delivery_v1'||delivery.end_lsn!==position.end_lsn)deny()
  const e=delivery.envelope
  if(!e||e.source_id!==source||e.stream_epoch!==stream||e.commit_lsn!==position.commit_lsn)deny()
  const validated=commitEnvelope({source_id:source,stream_epoch:stream},{
   commit_lsn:e.commit_lsn,xid:e.xid,commit_time:e.commit_time,revisions:e.revisions})
  if(JSON.stringify(e)!==JSON.stringify(validated)||commitJournalKey(validated)!==key||
   JSON.stringify(await journal.get(key))!==JSON.stringify(e))deny()
  const hash=createHash('sha256').update(JSON.stringify(delivery)).digest('hex')
  const digest=createHash('sha256').update(JSON.stringify(['mip-temporal-permit-v1',bindingId,hash])).digest('hex')
  // Deterministic application UUID: exact retry survives process restart without an in-memory request map.
  const request=digest.slice(0,8)+'-'+digest.slice(8,12)+'-8'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32)
  const prepared=await prepare({session,bindingId,source,stream,request,end:position.end_lsn,hash})
  if(prepared!==request)deny()
  const result=await advance({session,request})
  if(result?.state!=='slot_advance_observed'||result.request_id!==request||result.end_lsn!==position.end_lsn||
   result.historical_time_qualified!==false)deny()
  return result
 }
}
