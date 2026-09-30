// Isolated PostgreSQL pgoutput protocol-v1 decoder. Metadata-only; no production connection.
import {commitEnvelope,commitJournalKey,recordCommittedMetadata} from './commitRecorder.mjs'
const deny=()=>{throw Error('mip_pgoutput_metadata_denied')}
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const lsn=n=>(n>>32n).toString(16).toUpperCase()+'/'+(n&4294967295n).toString(16).toUpperCase()
function timestamp(us){
 const unix=us+946684800000000n
 let seconds=unix/1000000n,micro=unix%1000000n
 if(micro<0n){seconds--;micro+=1000000n}
 if(seconds< -62135596800n||seconds>253402300799n)deny()
 return new Date(Number(seconds*1000n)).toISOString().slice(0,19)+'.'+micro.toString().padStart(6,'0')+'Z'
}
function reader(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>4096)deny()
 let p=0
 const take=n=>{if(n<0||p+n>bytes.length)deny();const b=bytes.subarray(p,p+n);p+=n;return b}
 return {u8:()=>take(1)[0],u16:()=>take(2).readUInt16BE(),u32:()=>take(4).readUInt32BE(),
  u64:()=>take(8).readBigUInt64BE(),i64:()=>take(8).readBigInt64BE(),
  string:()=>{const end=bytes.indexOf(0,p);if(end<0||end-p>100)deny();const value=take(end-p).toString('ascii');take(1);if(!/^[a-z_0-9]+$/.test(value))deny();return value},
  text:n=>{if(n>100)deny();const b=take(n);if(b.some(x=>x>127||x===0))deny();return b.toString('ascii')},
  end:()=>{if(p!==bytes.length)deny()}}
}
export function decodeRevisionCommits(frames,{relationId,observationEpoch}){
 if(typeof relationId!=='string'||!/^[1-9][0-9]{0,9}$/.test(relationId)||BigInt(relationId)>4294967295n||
 typeof observationEpoch!=='string'||!uid.test(observationEpoch)||
 !Array.isArray(frames)||frames.length>100000)deny()
 let bytes=0,relation=false,active=null,previous=0n
 const commits=[]
 for(const frame of frames){
  bytes+=frame?.length??0;if(bytes>16777216)deny()
  const r=reader(frame),kind=r.u8()
  if(kind===66){ // Begin: final commit location, commit time, xid.
   if(active)deny()
   active={commit:r.u64(),time:r.i64(),xid:String(r.u32()),rows:[]}
  }else if(kind===82){
   if(String(r.u32())!==relationId||r.string()!=='mip_hypothesis'||r.string()!=='revision_transactions'||r.u8()!==100||r.u16()!==3)deny()
   for(const [name,type,flag] of [['revision_id',2950,1],['epoch',2950,0],['creator_xid',5069,0]]){
    if(r.u8()!==flag||r.string()!==name||r.u32()!==type||r.u32()!==4294967295)deny()
   }
   relation=true
  }else if(kind===73){
   if(!active||!relation||String(r.u32())!==relationId||r.u8()!==78||r.u16()!==3)deny()
   const values=[]
   for(let i=0;i<3;i++){if(r.u8()!==116)deny();values.push(r.text(r.u32()))}
   if(values[1]!==observationEpoch||active.rows.length>=10000)deny()
   active.rows.push({revision_id:values[0],observation_epoch:values[1],creator_xid:values[2]})
  }else if(kind===67){
   if(!active||r.u8()!==0)deny()
   const commit=r.u64(),end=r.u64(),time=r.i64()
   if(commit!==active.commit||time!==active.time||commit<=previous||end<=commit||active.rows.length===0)deny()
   const input={commit_lsn:lsn(commit),xid:active.xid,commit_time:timestamp(time),revisions:active.rows}
   // Reuse exact UUID/xid/range/duplicate validation; dummy context is only local shape validation.
   commitEnvelope({source_id:observationEpoch,stream_epoch:observationEpoch},input)
   commits.push({input,end_lsn:lsn(end)})
   previous=end;active=null
  }else deny() // Origins, mutations, streaming/two-phase and logical messages require separate support.
  r.end()
 }
 if(active)deny()
 return commits
}
export async function recordPgoutputBatch({frames,relationId,observationEpoch,context,journal,acknowledge}){
 if(!context||Object.keys(context).sort().join('|')!=='source_id|stream_epoch'||
 typeof context.source_id!=='string'||!uid.test(context.source_id)||typeof context.stream_epoch!=='string'||!uid.test(context.stream_epoch)||
 !journal||typeof journal.putOnce!=='function'||typeof journal.get!=='function'||typeof acknowledge!=='function')deny()
 // Validate the entire bounded delivery before storing or acknowledging any transaction.
 const commits=decodeRevisionCommits(frames,{relationId,observationEpoch})
 for(const {input,end_lsn} of commits){
  const envelope=commitEnvelope(context,input)
  const binding={schema:'mip_pgoutput_delivery_v1',relation_id:relationId,observation_epoch:observationEpoch,envelope,end_lsn}
  const key='delivery:'+commitJournalKey(envelope),exact=JSON.stringify(binding)
  const receipt=await journal.putOnce(key,binding)
  if(receipt?.committed!==true||JSON.stringify(await journal.get(key))!==exact)throw Error('mip_pgoutput_delivery_not_durable')
  await recordCommittedMetadata({context,input,journal,acknowledge:position=>acknowledge({...position,end_lsn})})
 }
 return {state:'durable_pgoutput_batch_acknowledged',commits:commits.length,historical_time_qualified:false}
}
