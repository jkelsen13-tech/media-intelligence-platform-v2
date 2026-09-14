// Isolated native-boundary proof. Not wired to source permits or production consumers.
import {createHash} from 'node:crypto'
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const deny=()=>{throw Error('mip_marker_boundary_denied')}
const lsn=n=>(n>>32n).toString(16).toUpperCase()+'/'+(n&4294967295n).toString(16).toUpperCase()
function id(v){if(typeof v!=='string'||!uid.test(v))deny();return v}
function relation(v){if(typeof v!=='string'||!/^[1-9][0-9]{0,9}$/.test(v)||BigInt(v)>4294967295n)deny();return v}
function reader(b){
 if(!Buffer.isBuffer(b)||b.length===0||b.length>4096)deny()
 let p=0
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||p+n>b.length)deny();const v=b.subarray(p,p+n);p+=n;return v}
 return {u8:()=>take(1)[0],u16:()=>take(2).readUInt16BE(),u32:()=>take(4).readUInt32BE(),
 u64:()=>take(8).readBigUInt64BE(),i64:()=>take(8).readBigInt64BE(),
 str:()=>{const end=b.indexOf(0,p);if(end<0||end-p>100)deny();const v=take(end-p);take(1);if(v.some(x=>x>127))deny();return v.toString('ascii')},
 text:n=>{if(n>100)deny();const v=take(n);if(v.some(x=>x>127||x===0))deny();return v.toString('ascii')},
 end:()=>{if(p!==b.length)deny()}}
}
export function decodeMarkerBoundary(frames,{relationId,observationEpoch,markerId}){
 relation(relationId);id(observationEpoch);id(markerId)
 // Exactly one native marker-only transaction; no arbitrary empty or mixed transaction.
 if(!Array.isArray(frames)||frames.length!==4)deny()
 let total=0,begin,marker,ending
 for(let index=0;index<4;index++){
  total+=frames[index]?.length??0;if(total>16384)deny()
  const r=reader(frames[index]),kind=r.u8()
  if(index===0){
   if(kind!==66)deny()
   begin={commit:r.u64(),time:r.i64(),xid:r.u32()}
   if(begin.commit===0n||begin.xid===0)deny()
  }else if(index===1){
   if(kind!==82||String(r.u32())!==relationId||r.str()!=='mip_temporal'||r.str()!=='stream_markers'||r.u8()!==100||r.u16()!==3)deny()
   for(const [name,type,flag] of [['marker_id',2950,1],['epoch',2950,0],['creator_xid',5069,0]])
    if(r.u8()!==flag||r.str()!==name||r.u32()!==type||r.u32()!==4294967295)deny()
  }else if(index===2){
   if(kind!==73||String(r.u32())!==relationId||r.u8()!==78||r.u16()!==3)deny()
   const values=[]
   for(let i=0;i<3;i++){if(r.u8()!==116)deny();values.push(r.text(r.u32()))}
   if(values[0]!==markerId||values[1]!==observationEpoch||!/^[1-9][0-9]{0,19}$/.test(values[2]))deny()
   const full=BigInt(values[2])
   if(full>18446744073709551615n||(full&4294967295n)!==BigInt(begin.xid))deny()
   marker={marker_id:markerId,observation_epoch:observationEpoch,creator_xid:values[2]}
  }else{
   if(kind!==67||r.u8()!==0)deny()
   const commit=r.u64(),end=r.u64(),time=r.i64()
   if(commit!==begin.commit||time!==begin.time||end<=commit)deny()
   ending=end
  }
  r.end()
 }
 return {schema:'mip_marker_boundary_v1',relation_id:relationId,...marker,
  commit_lsn:lsn(begin.commit),end_lsn:lsn(ending),xid:String(begin.xid),
  // Preserve source timestamp bytes without interpreting them as historical qualification.
  commit_time_pg_microseconds:begin.time.toString(),historical_time_qualified:false}
}
export async function retainMarkerBoundary({frames,relationId,observationEpoch,markerId,context,journal}){
 if(!context||Object.getPrototypeOf(context)!==Object.prototype||Object.keys(context).sort().join('|')!=='source_id|stream_epoch'||
 typeof journal?.putOnce!=='function'||typeof journal?.get!=='function')deny()
 const source=id(context.source_id),stream=id(context.stream_epoch)
 const boundary=decodeMarkerBoundary(frames,{relationId,observationEpoch,markerId})
 // Own all bytes and identities before async custody calls.
 const hex=frames.map(v=>v.toString('hex'))
 const envelope={schema:'mip_marker_delivery_proof_v1',source_id:source,stream_epoch:stream,boundary,
  frame_hash:createHash('sha256').update(hex.join('\n')).digest('hex'),frames:hex,authority_integrated:false}
 const key='marker-proof-v1:'+source+':'+stream+':'+markerId,exact=JSON.stringify(envelope)
 const receipt=await journal.putOnce(key,envelope)
 if(receipt?.committed!==true||JSON.stringify(await journal.get(key))!==exact)throw Error('mip_marker_boundary_not_durable')
 // This proof intentionally has no acknowledge/advance capability.
 return {state:'durable_marker_boundary_proof',key,end_lsn:boundary.end_lsn,
  authority_integrated:false,historical_time_qualified:false}
}
