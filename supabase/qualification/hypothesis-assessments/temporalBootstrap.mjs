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
  return {revision_id:row.revision_id,transaction_epoch:row.transaction_epoch,creator_xid:row.creator_xid,provenance}
 }).sort((a,b)=>a.revision_id<b.revision_id?-1:a.revision_id>b.revision_id?1:0)
 return {schema:'mip_revision_bootstrap_v1',source_id:context.source_id,stream_epoch:context.stream_epoch,observation_epoch:observationEpoch,
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
 const decoded=decodeRevisionCommits(frames,{relationId,observationEpoch})
 const baseline=await validateBootstrapCoverage({context,observationEpoch,journal,
  revisionIds:decoded.flatMap(c=>c.input.revisions.map(r=>r.revision_id))})
 if(baseline.overlap||decoded.some(c=>position(c.input.commit_lsn)<position(baseline.consistent_lsn)))deny()
 return recordPgoutputBatch(options)
}

const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const bootstrapPageKey=(context,index)=>bootstrapKey(context)+':page:'+index
const pageLimit=n=>{if(!Number.isSafeInteger(n)||n<1||n>10000)deny()}
function pageEnvelope({context,observationEpoch,input,index,previousHash,rows,pageSize,after}){
 if(!Array.isArray(rows)||rows.length<1||rows.length>pageSize)deny()
 const envelope=bootstrapEnvelope({context,observationEpoch,input:{...input,rows}})
 if(rows.some((r,i)=>r.revision_id!==envelope.rows[i].revision_id)||envelope.rows[0].revision_id<=after)deny()
 return {schema:'mip_revision_bootstrap_page_v1',index,previous_hash:previousHash,bootstrap:envelope}
}
export async function recordPagedBootstrap({context,observationEpoch,input,journal,withSnapshot,pageSize=256}){
 exact(input,['consistent_lsn','snapshot_id'])
 const empty=bootstrapEnvelope({context,observationEpoch,input:{...input,rows:[]}})
 pageLimit(pageSize)
 if(typeof withSnapshot!=='function'||typeof journal?.putOnce!=='function'||typeof journal?.get!=='function')deny()
 // Pin configuration before invoking asynchronous source/custody callbacks.
 const scope={source_id:empty.source_id,stream_epoch:empty.stream_epoch}
 const fixed={consistent_lsn:empty.consistent_lsn,snapshot_id:empty.snapshot_id}
 let pages=0,count=0,previous=null,after='',exhausted=false,entered=false
 const completed=await withSnapshot(fixed.snapshot_id,async fetchPage=>{
  if(entered||typeof fetchPage!=='function')deny();entered=true
  while(true){
   const rows=await fetchPage(pageSize)
   if(!Array.isArray(rows))deny()
   if(rows.length===0){exhausted=true;return}
   if(pages>=1000000)deny()
   const page=pageEnvelope({context:scope,observationEpoch,input:fixed,index:pages,previousHash:previous,rows,pageSize,after})
   const key=bootstrapPageKey(scope,pages),text=JSON.stringify(page)
   const receipt=await journal.putOnce(key,page)
   if(receipt?.committed!==true||JSON.stringify(await journal.get(key))!==text)throw Error('mip_bootstrap_not_durable')
   previous=digest(page);after=page.bootstrap.rows.at(-1).revision_id;count+=rows.length;pages++
  }
 })
 // The adapter confirms the single read transaction finished; an interrupted prefix cannot publish a manifest.
 if(!entered||!exhausted||completed?.snapshot_id!==fixed.snapshot_id||completed?.read_transaction_completed!==true)deny()
 const manifest={schema:'mip_revision_bootstrap_manifest_v1',source_id:scope.source_id,stream_epoch:scope.stream_epoch,
  observation_epoch:observationEpoch,...fixed,page_size:pageSize,page_count:pages,row_count:count,last_page_hash:previous,
  availability:empty.availability,historical_time_qualified:false}
 const key=bootstrapKey(scope),text=JSON.stringify(manifest),receipt=await journal.putOnce(key,manifest)
 if(receipt?.committed!==true||JSON.stringify(await journal.get(key))!==text)throw Error('mip_bootstrap_not_durable')
 return {key,hash:digest(manifest),revisions:count,pages,historical_time_qualified:false}
}
export async function validateBootstrapCoverage({context,observationEpoch,journal,revisionIds=[]}){
 if(!Array.isArray(revisionIds)||revisionIds.some(v=>typeof v!=='string'||!uid.test(v)))deny()
 const saved=await journal.get(bootstrapKey(context)),wanted=new Set(revisionIds)
 if(!saved)deny()
 if(saved.schema==='mip_revision_bootstrap_v1'){
  if(!Array.isArray(saved.rows))deny()
  const normalized=bootstrapEnvelope({context,observationEpoch,input:{
   consistent_lsn:saved.consistent_lsn,snapshot_id:saved.snapshot_id,
   rows:saved.rows.map(({revision_id,transaction_epoch,creator_xid})=>({revision_id,transaction_epoch,creator_xid}))}})
  if(JSON.stringify(saved)!==JSON.stringify(normalized))deny()
  return {consistent_lsn:saved.consistent_lsn,revisions:saved.rows.length,overlap:saved.rows.some(r=>wanted.has(r.revision_id))}
 }
 exact(saved,['schema','source_id','stream_epoch','observation_epoch','consistent_lsn','snapshot_id','page_size','page_count',
  'row_count','last_page_hash','availability','historical_time_qualified'])
 if(saved.schema!=='mip_revision_bootstrap_manifest_v1'||saved.source_id!==context.source_id||saved.stream_epoch!==context.stream_epoch||
 saved.observation_epoch!==observationEpoch||saved.availability!=='visible_in_exported_bootstrap_snapshot'||saved.historical_time_qualified!==false||
 !Number.isSafeInteger(saved.page_count)||saved.page_count<0||saved.page_count>1000000||
 !Number.isSafeInteger(saved.row_count)||saved.row_count<0)deny()
 pageLimit(saved.page_size)
 const input={consistent_lsn:saved.consistent_lsn,snapshot_id:saved.snapshot_id}
 bootstrapEnvelope({context,observationEpoch,input:{...input,rows:[]}})
 let previous=null,after='',count=0,overlap=false
 for(let i=0;i<saved.page_count;i++){
  const page=await journal.get(bootstrapPageKey(context,i))
  if(!page||!Array.isArray(page.bootstrap?.rows))deny()
  const rows=page.bootstrap.rows.map(({revision_id,transaction_epoch,creator_xid})=>({revision_id,transaction_epoch,creator_xid}))
  const expected=pageEnvelope({context,observationEpoch,input,index:i,previousHash:previous,rows,pageSize:saved.page_size,after})
  if(JSON.stringify(page)!==JSON.stringify(expected))deny()
  previous=digest(expected);after=rows.at(-1).revision_id;count+=rows.length
  overlap=overlap||rows.some(r=>wanted.has(r.revision_id))
 }
 if(count!==saved.row_count||previous!==saved.last_page_hash||await journal.get(bootstrapPageKey(context,saved.page_count))!==null)deny()
 return {consistent_lsn:saved.consistent_lsn,revisions:count,overlap}
}
