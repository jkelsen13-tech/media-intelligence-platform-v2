// Isolated custody contract. No production custodian or independently protected head is configured here.
import {createHash} from 'node:crypto'
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hash=/^[0-9a-f]{64}$/
const deny=()=>{throw Error('mip_registration_custody_required')}
const keys=['version','sequence','previous','source','stream','bindingId','incarnationId','recoveryEvidence','contractDigest']
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
export function boundaryRegistrationEnvelope(value){
 const e=snapshot(value,keys)
 if(e.version!==2||!Number.isSafeInteger(e.sequence)||e.sequence<1||
  !['source','stream','bindingId','incarnationId'].every(k=>uid.test(e[k]))||
  !hash.test(e.contractDigest)||!hash.test(e.recoveryEvidence)||(e.sequence===1?e.previous!=='':!hash.test(e.previous)))deny()
 return e
}
export function boundaryRegistrationDigest(value){
 return createHash('sha256').update(JSON.stringify(boundaryRegistrationEnvelope(value))).digest('hex')
}
const scope=e=>Object.freeze({source:e.source,stream:e.stream,bindingId:e.bindingId,incarnationId:e.incarnationId,contractDigest:e.contractDigest})
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
async function exact(tx,e){
 const digest=boundaryRegistrationDigest(e)
 if(await tx.head(e.source)!==digest)deny()
 const read=await tx.read(digest)
 if(!read||!same(boundaryRegistrationEnvelope(read),e))deny()
 return digest
}
// withAuthority must authenticate its caller and hold source-scoped exclusion against
// registration/recovery/revocation until the awaited callback completes. A precheck is insufficient.
// append must be append-only and crash durable before resolving; read must bypass caches.
export async function retainBoundaryRegistration({envelope,withAuthority}={}){
 const e=boundaryRegistrationEnvelope(envelope),digest=boundaryRegistrationDigest(e)
 if(typeof withAuthority!=='function')deny()
 return withAuthority(Object.freeze({...scope(e),operation:'register',digest,envelope:e}),async tx=>{
  const head=await tx.head(e.source)
  if(head===digest){await exact(tx,e);return digest}
  if((head??'')!==e.previous)deny()
  if(e.sequence>1){
   const old=boundaryRegistrationEnvelope(await tx.read(e.previous))
   if(boundaryRegistrationDigest(old)!==e.previous||old.source!==e.source||
    old.sequence+1!==e.sequence||old.incarnationId===e.incarnationId||
    old.bindingId===e.bindingId)deny()
  }
  await tx.append(digest,e,e.previous)
  await exact(tx,e)
  return digest
 })
}
export function createBoundaryCustodyTransport({envelope,expectedHead,withAuthority,call}={}){
 const e=boundaryRegistrationEnvelope(envelope)
 if(expectedHead!==boundaryRegistrationDigest(e)||typeof withAuthority!=='function')deny()
 if(typeof call!=='function')deny()
 const transport={
 issue:p=>call('issue_boundary_marker',[p.session,p.bindingId,e.incarnationId,e.contractDigest,p.request]),
 capture:p=>call('capture_boundary_incarnation',[p.session,p.bindingId,e.incarnationId,e.contractDigest,p.before,p.request,p.target]),
 prepare:p=>call('prepare_boundary_incarnation',[p.session,p.capture,e.incarnationId,e.contractDigest,p.target,p.request,p.source,p.stream,p.end,p.bootstrap,p.frames,p.hash]),
 advance:p=>call('advance_boundary_incarnation',[p.session,p.request,e.incarnationId,e.contractDigest])
 }
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
   if(method==='issue'||method==='prepare'){
    await tx.bindRequest(input.request,Object.freeze({...requestScope,operation:method}))
    if(!same(await tx.readRequest(input.request),{...requestScope,operation:method}))deny()
   }
   if(method==='advance'&&!same(await tx.readRequest(input.request),{...requestScope,operation:'prepare'}))deny()
   if(['capture','prepare'].includes(method)&&!same(await tx.readRequest(input.target),{...requestScope,operation:'issue'}))deny()
   return transport[method](input)
  })
 }
 return Object.freeze({
  issue:p=>run('issue',p,['session','bindingId','request']),
  capture:p=>run('capture',p,['session','bindingId','before','request','target']),
  prepare:p=>run('prepare',p,['session','bindingId','source','stream','request','end','hash','capture','bootstrap','frames','target']),
  advance:p=>run('advance',p,['session','request'])
 })
}
