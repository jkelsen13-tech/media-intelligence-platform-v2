// Isolated custody contract. No production custodian or independently protected head is configured here.
import {createHash} from 'node:crypto'
import {createIncarnationBoundTransport} from './sourceIncarnation.mjs'
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hash=/^[0-9a-f]{64}$/
const deny=()=>{throw Error('mip_registration_custody_required')}
const keys=['version','sequence','previous','source','stream','bindingId','incarnationId','recoveryEvidence']
function snapshot(value,fields){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)deny()
 const result={}
 for(const key of fields){
  const d=Object.getOwnPropertyDescriptor(value,key)
  if(!d||!('value' in d)||!['string','number'].includes(typeof d.value))deny()
  result[key]=d.value
 }
 return Object.freeze(result)
}
export function registrationEnvelope(value){
 const e=snapshot(value,keys)
 if(e.version!==1||!Number.isSafeInteger(e.sequence)||e.sequence<1||
  !['source','stream','bindingId','incarnationId'].every(k=>uid.test(e[k]))||
  !hash.test(e.recoveryEvidence)||(e.sequence===1?e.previous!=='':!hash.test(e.previous)))deny()
 return e
}
export function registrationDigest(value){
 return createHash('sha256').update(JSON.stringify(registrationEnvelope(value))).digest('hex')
}
const scope=e=>Object.freeze({source:e.source,stream:e.stream,bindingId:e.bindingId,incarnationId:e.incarnationId})
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
async function exact(tx,e){
 const digest=registrationDigest(e)
 if(await tx.head(e.source)!==digest)deny()
 const read=await tx.read(digest)
 if(!read||!same(registrationEnvelope(read),e))deny()
 return digest
}
// withAuthority must authenticate its caller and hold source-scoped exclusion against
// registration/recovery/revocation until the awaited callback completes. A precheck is insufficient.
// append must be append-only and crash durable before resolving; read must bypass caches.
export async function retainRegistration({envelope,withAuthority}={}){
 const e=registrationEnvelope(envelope),digest=registrationDigest(e)
 if(typeof withAuthority!=='function')deny()
 return withAuthority(Object.freeze({...scope(e),operation:'register',digest}),async tx=>{
  const head=await tx.head(e.source)
  if(head===digest){await exact(tx,e);return digest}
  if((head??'')!==e.previous)deny()
  if(e.sequence>1){
   const old=registrationEnvelope(await tx.read(e.previous))
   if(registrationDigest(old)!==e.previous||old.source!==e.source||
    old.sequence+1!==e.sequence||old.incarnationId===e.incarnationId||
    old.bindingId===e.bindingId)deny()
  }
  await tx.append(digest,e,e.previous)
  await exact(tx,e)
  return digest
 })
}
export function createCustodyBoundTransport({envelope,expectedHead,withAuthority,call}={}){
 const e=registrationEnvelope(envelope)
 if(expectedHead!==registrationDigest(e)||typeof withAuthority!=='function')deny()
 const transport=createIncarnationBoundTransport({incarnationId:e.incarnationId,call})
 const run=(method,p,fields)=> {
  // Capture primitive values synchronously, before any authority or storage await.
  const input=snapshot(p,fields)
  if(('bindingId' in input&&input.bindingId!==e.bindingId)||
   ('source' in input&&input.source!==e.source)||('stream' in input&&input.stream!==e.stream))deny()
  return withAuthority(Object.freeze({...scope(e),operation:method,digest:expectedHead}),async tx=>{
   await exact(tx,e)
   // The trusted journal binds preparation requests durably before any source effect.
   // Old or ambiguous request bindings cannot be adopted from a restored source.
   const requestScope=Object.freeze({...scope(e),digest:expectedHead})
   if(method==='prepare'){
    await tx.bindRequest(input.request,requestScope)
    if(!same(await tx.readRequest(input.request),requestScope))deny()
   }
   if(method==='advance'&&!same(await tx.readRequest(input.request),requestScope))deny()
   return transport[method](input)
  })
 }
 return Object.freeze({
  capture:p=>run('capture',p,['session','bindingId','before','request']),
  prepare:p=>run('prepare',p,['session','bindingId','source','stream','request','end','hash','capture','bootstrap','frames']),
  advance:p=>run('advance',p,['session','request'])
 })
}
