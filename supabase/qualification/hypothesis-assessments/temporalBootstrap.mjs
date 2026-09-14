// Isolated snapshot baseline. Visibility in this snapshot is not a historical commit timestamp.
import {createHash} from 'node:crypto'
import {decodeRevisionCommits,recordPgoutputBatch} from './pgoutputRecorder.mjs'
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const deny=()=>{throw Error('mip_bootstrap_denied')}
function exact(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))deny()}
function position(v){
 if(typeof v!=='string'||!/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/.test(v))deny()
 const parts=v.split('/').map(x=>BigInt('0x'+x))
 if(parts.map(x=>x.toString(16).toUpperCase()).join('/')!==v)deny()
 return (parts[0]<<32n)|parts[1]
}
export function bootstrapEnvelope({context,observationEpoch,input}){
 exact(context,['source_id','stream_epoch'])
 for(const v of [context.source_id,context.stream_epoch,observationEpoch])if(typeof v!=='string'||!uid.test(v))deny()
 exact(input,['consistent_lsn','snapshot_id','rows'])
 if(position(input.consistent_lsn)===0n||typeof input.snapshot_id!=='string'||!/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/.test(input.snapshot_id)||
 !Array.isArray(input.rows)||input.rows.length>100000)deny()
 const seen=new Set()
 const rows=input.rows.map(row=>{
  exact(row,['revision_id','transaction_epoch','creator_xid'])
  if(typeof row.revision_id!=='string'||!uid.test(row.revision_id)||seen.has(row.revision_id))deny()
  seen.add(row.revision_id)
  let provenance='transaction_not_established'
  if(row.transaction_epoch!==null||row.creator_xid!==null){
   if(typeof row.transaction_epoch!=='string'||!uid.test(row.transaction_epoch)||typeof row.creator_xid!=='string'||
    !/^[1-9][0-9]{0,19}$/.test(row.creator_xid)||BigInt(row.creator_xid)>18446744073709551615n)deny()
   provenance=row.transaction_epoch===observationEpoch?'recorded_transaction':'foreign_transaction_epoch'
  }
  return {...row,provenance}
 }).sort((a,b)=>a.revision_id<b.revision_id?-1:a.revision_id>b.revision_id?1:0)
 return {schema:'mip_revision_bootstrap_v1',...context,observation_epoch:observationEpoch,
  consistent_lsn:input.consistent_lsn,snapshot_id:input.snapshot_id,rows,
  availability:'visible_in_exported_bootstrap_snapshot',historical_time_qualified:false}
}
export const bootstrapKey=context=>'bootstrap-v1:'+context.source_id+':'+context.stream_epoch
export async function recordBootstrap({context,observationEpoch,input,journal}){
 const envelope=bootstrapEnvelope({context,observationEpoch,input}),key=bootstrapKey(context),text=JSON.stringify(envelope)
 if(typeof journal?.putOnce!=='function'||typeof journal?.get!=='function')deny()
 const receipt=await journal.putOnce(key,envelope)
 if(receipt?.committed!==true||JSON.stringify(await journal.get(key))!==text)throw Error('mip_bootstrap_not_durable')
 return {key,hash:createHash('sha256').update(text).digest('hex'),revisions:envelope.rows.length,
  unqualified_transactions:envelope.rows.filter(r=>r.provenance!=='recorded_transaction').length,historical_time_qualified:false}
}
export async function recordBootstrappedPgoutputBatch(options){
 const {context,observationEpoch,journal,frames,relationId}=options
 const saved=await journal.get(bootstrapKey(context))
 if(!saved||saved.schema!=='mip_revision_bootstrap_v1'||!Array.isArray(saved.rows))deny()
 const normalized=bootstrapEnvelope({context,observationEpoch,input:{
  consistent_lsn:saved.consistent_lsn,snapshot_id:saved.snapshot_id,
  rows:saved.rows.map(({revision_id,transaction_epoch,creator_xid})=>({revision_id,transaction_epoch,creator_xid}))}})
 if(JSON.stringify(saved)!==JSON.stringify(normalized))deny()
 const baseline=new Set(saved.rows.map(r=>r.revision_id)),start=position(saved.consistent_lsn)
 for(const c of decodeRevisionCommits(frames,{relationId,observationEpoch})){
  if(position(c.input.commit_lsn)<start||c.input.revisions.some(r=>baseline.has(r.revision_id)))deny()
 }
 return recordPgoutputBatch(options)
}
