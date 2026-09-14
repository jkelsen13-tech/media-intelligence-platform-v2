// Synthetic protocol bytes only. Native tests additionally consume PostgreSQL's actual output.
const b=(n,size)=>{const v=Buffer.alloc(size);size===8?v.writeBigUInt64BE(BigInt(n)):size===4?v.writeUInt32BE(Number(n)):v.writeUInt16BE(Number(n));return v}
const c=s=>Buffer.from(s+'\0'),byte=n=>Buffer.from([n])
export const epoch='11111111-1111-4111-8111-111111111111'
export function frames({relation=42,revision=epoch,xid=7,full='4294967303',commit=1000,end=1020,time=842529600123456n}={}){
 const columns=[['revision_id',2950,1],['epoch',2950,0],['creator_xid',5069,0]]
 return [
 Buffer.concat([byte(66),b(commit,8),b(time,8),b(xid,4)]),
 Buffer.concat([byte(82),b(relation,4),c('mip_hypothesis'),c('revision_transactions'),byte(100),b(3,2),
 ...columns.flatMap(([name,type,flag])=>[byte(flag),c(name),b(type,4),b(4294967295,4)])]),
 Buffer.concat([byte(73),b(relation,4),byte(78),b(3,2),...[revision,epoch,full].flatMap(v=>[byte(116),b(Buffer.byteLength(v),4),Buffer.from(v)])]),
 Buffer.concat([byte(67),byte(0),b(commit,8),b(end,8),b(time,8)])
 ]
}
