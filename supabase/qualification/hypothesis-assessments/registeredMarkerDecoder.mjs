// Strict typed native marker decoding for the registered v2 source contract.
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
export function decodeRegisteredMarkerBoundary(frames,{relationId,observationEpoch,markerId,bindingId,creatorXid}){
 relation(relationId);id(observationEpoch);id(markerId);id(bindingId)
 if(typeof creatorXid!=='string'||!/^[1-9][0-9]{0,19}$/.test(creatorXid))deny()
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
   if(kind!==82||String(r.u32())!==relationId||r.str()!=='mip_temporal'||r.str()!=='registered_stream_markers'||r.u8()!==100||r.u16()!==4)deny()
   for(const [name,type,flag] of [['marker_id',2950,1],['binding_id',2950,0],['epoch',2950,0],['creator_xid',5069,0]])
    if(r.u8()!==flag||r.str()!==name||r.u32()!==type||r.u32()!==4294967295)deny()
  }else if(index===2){
   if(kind!==73||String(r.u32())!==relationId||r.u8()!==78||r.u16()!==4)deny()
   const values=[]
   for(let i=0;i<4;i++){if(r.u8()!==116)deny();values.push(r.text(r.u32()))}
   if(values[0]!==markerId||values[1]!==bindingId||values[2]!==observationEpoch||values[3]!==creatorXid||!/^[1-9][0-9]{0,19}$/.test(values[3]))deny()
   const full=BigInt(values[3])
   if(full>18446744073709551615n||(full&4294967295n)!==BigInt(begin.xid))deny()
   marker={marker_id:markerId,binding_id:bindingId,observation_epoch:observationEpoch,creator_xid:values[3]}
  }else{
   if(kind!==67||r.u8()!==0)deny()
   const commit=r.u64(),end=r.u64(),time=r.i64()
   if(commit!==begin.commit||time!==begin.time||end<=commit)deny()
   ending=end
  }
  r.end()
 }
 return {schema:'mip_registered_marker_boundary_v2',relation_id:relationId,...marker,
  commit_lsn:lsn(begin.commit),end_lsn:lsn(ending),xid:String(begin.xid),
  // Preserve source timestamp bytes without interpreting them as historical qualification.
  commit_time_pg_microseconds:begin.time.toString(),historical_time_qualified:false}
}
