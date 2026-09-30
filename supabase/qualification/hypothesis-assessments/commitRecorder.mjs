// Isolated metadata recorder; not a historical coverage or publication qualification.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function fail(){throw Error('mip_commit_metadata_invalid')}
function exact(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||
 Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail()
}
function decimal(value,max){
 if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)||value.length>20||BigInt(value)>max)fail()
 return value
}
export function commitEnvelope(context,input){
 exact(context,['source_id','stream_epoch'])
 if(typeof context.source_id!=='string'||typeof context.stream_epoch!=='string'||!uuid.test(context.source_id)||!uuid.test(context.stream_epoch))fail()
 exact(input,['commit_lsn','xid','commit_time','revisions'])
 if(typeof input.commit_lsn!=='string'||!/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/.test(input.commit_lsn))fail()
 const [hi,lo]=input.commit_lsn.split('/').map(x=>BigInt('0x'+x))
 const lsn=hi.toString(16).toUpperCase()+'/'+lo.toString(16).toUpperCase()
 if(lsn!==input.commit_lsn||(hi===0n&&lo===0n))fail()
 const xid=decimal(input.xid,4294967295n)
 if(typeof input.commit_time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(input.commit_time)||
 !Number.isFinite(Date.parse(input.commit_time)))fail()
 if(new Date(input.commit_time).toISOString().slice(0,19)!==input.commit_time.slice(0,19))fail()
 if(!Array.isArray(input.revisions)||input.revisions.length<1||input.revisions.length>10000)fail()
 const seen=new Set()
 const revisions=input.revisions.map(row=>{
  exact(row,['revision_id','observation_epoch','creator_xid'])
  if(typeof row.revision_id!=='string'||typeof row.observation_epoch!=='string'||!uuid.test(row.revision_id)||!uuid.test(row.observation_epoch)||seen.has(row.revision_id))fail()
  seen.add(row.revision_id)
  const creator=decimal(row.creator_xid,18446744073709551615n)
  if((BigInt(creator)&4294967295n)!==BigInt(xid))fail()
  return {revision_id:row.revision_id,observation_epoch:row.observation_epoch,creator_xid:creator}
 })
 return {schema:'mip_commit_metadata_v1',source_id:context.source_id,stream_epoch:context.stream_epoch,
  commit_lsn:lsn,xid,commit_time:input.commit_time,revisions}
}
export function commitJournalKey(envelope){
 return 'commit-v1:'+envelope.source_id+':'+envelope.stream_epoch+':'+envelope.commit_lsn
}
export async function recordCommittedMetadata({context,input,journal,acknowledge}){
 if(!journal||typeof journal.putOnce!=='function'||typeof journal.get!=='function'||typeof acknowledge!=='function')fail()
 // Capture a detached exact envelope before the first await. Never retain arbitrary decoded bodies.
 const envelope=commitEnvelope(context,input),text=JSON.stringify(envelope),key=commitJournalKey(envelope)
 const receipt=await journal.putOnce(key,envelope)
 if(receipt?.committed!==true)throw Error('mip_commit_not_durable')
 const retained=await journal.get(key)
 if(JSON.stringify(retained)!==text)throw Error('mip_commit_readback_mismatch')
 // The source adapter must implement scoped, replay-safe acknowledgement and its own current-authority fence.
 // A lost response never causes a reset: the caller replays this exact envelope under fresh authority.
 await acknowledge({source_id:envelope.source_id,stream_epoch:envelope.stream_epoch,commit_lsn:envelope.commit_lsn})
 return {state:'durable_metadata_acknowledged',key,historical_time_qualified:false}
}
