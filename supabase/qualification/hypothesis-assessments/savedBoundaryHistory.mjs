// Isolated admission and consume services. Their database principals MUST be disjoint.
// No live endpoint, credential, provider, issuer or independently protected custody is configured.
import {randomUUID,createHash} from 'node:crypto'
import {createSupabaseHypothesisAuthenticator} from './supabaseAuthenticator.mjs'
import {boundaryRegistrationEnvelope,boundaryRegistrationDigest} from './boundaryRegistrationCustody.mjs'
import {verifyRetainedBoundaryPrefix} from './retainedBoundaryPrefix.mjs'
const deny=()=>{throw Error('mip_boundary_history_denied')}
const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const copy=x=>JSON.parse(JSON.stringify(x))
const keys=(x,list)=>{if(!x||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).sort().join('|')!==list.split('|').sort().join('|'))deny()}
const live=signal=>{if(signal?.aborted)deny()}
const until=authorization=>{
 try{return new Date(JSON.parse(Buffer.from(authorization.slice(7).split('.')[1],'base64url')).exp*1000).toISOString()}catch{deny()}
}
const historyKeys='contract_version|investigation_id|entries|temporal_scope|historical_commit_visibility_qualified|source_authority_qualified|user_history_qualified|historical_time_qualified|publication_allowed'
const requestKeys='authorization|investigationId|captureIds|terminalCapture|targetMarker'
function freezeRequest(request){
 keys(request,requestKeys)
 const r=copy(request)
 if(typeof r.authorization!=='string'||r.authorization.length>16391||!uid(r.investigationId)||
  !uid(r.terminalCapture)||!uid(r.targetMarker)||!Array.isArray(r.captureIds)||r.captureIds.length>256||
  !r.captureIds.every(uid))deny()
 return r
}
// This service holds only the proof-issuer capability; it cannot consume/read payloads.
// Auth is verified inside admission; there is no supplied verifiedUserId.
export function createBoundaryProofAuthority({authConfiguration,registration,observationEpoch,revisionRelation,markerRelation,
 journal,withAuthority,issuePermit,sourceSession}={}){
 const reg=boundaryRegistrationEnvelope(registration),digest=boundaryRegistrationDigest(reg)
 const authenticate=createSupabaseHypothesisAuthenticator(authConfiguration)
 if(!uid(observationEpoch)||typeof withAuthority!=='function'||typeof issuePermit!=='function'||typeof sourceSession!=='function')deny()
 const scope=Object.freeze({source:reg.source,stream:reg.stream,bindingId:reg.bindingId,incarnationId:reg.incarnationId,
  contractDigest:reg.contractDigest,operation:'history-admission',digest})
 return Object.freeze({async withPermit(request,challenge,signal,consume){
  const r=freezeRequest(request);keys(challenge,'schema|request_id|backend_pid|transaction_id')
  const c=copy(challenge)
  if(c.schema!=='mip_boundary_challenge_v1'||!uid(c.request_id)||!Number.isSafeInteger(c.backend_pid)||c.backend_pid<1||
   typeof c.transaction_id!=='string'||!/^\d+$/.test(c.transaction_id)||typeof consume!=='function')deny()
  live(signal)
  const user=await authenticate(r.authorization);if(!uid(user?.id)||user.is_anonymous!==false)deny()
  return withAuthority(scope,async custody=>{
   const check=async()=>{
    live(signal)
    if(await custody.head(reg.source)!==digest||JSON.stringify(boundaryRegistrationEnvelope(await custody.read(digest)))!==JSON.stringify(reg))deny()
   }
   await check()
   const proof=await verifyRetainedBoundaryPrefix({registration:reg,observationEpoch,revisionRelation,markerRelation,journal,
    captureIds:r.captureIds,terminalCapture:r.terminalCapture,targetMarker:r.targetMarker})
   if(proof.revision_ids.length>512)deny()
   await check()
   const current=await authenticate(r.authorization)
   if(current?.id!==user.id||current?.is_anonymous!==false)deny()
   live(signal)
   const claim={schema:'mip_boundary_identity_proof_v1',request_id:c.request_id,backend_pid:c.backend_pid,transaction_id:c.transaction_id,
    binding_id:reg.bindingId,incarnation_id:reg.incarnationId,contract_digest:reg.contractDigest,source_id:reg.source,
    stream_epoch:reg.stream,observation_epoch:observationEpoch,terminal_capture:proof.terminal_capture,target_marker:proof.target_marker,
    covered_through:proof.covered_through,user_id:user.id,investigation_id:r.investigationId,revision_ids:proof.revision_ids,auth_until:until(r.authorization)}
   const session=sourceSession();if(!uid(session))deny()
   const permit=copy(await issuePermit(session,claim,signal))
   keys(permit,'schema|permit_id|request_id|expires_at|prefix_digest|claim')
   keys(permit.claim,Object.keys(claim).join('|'))
   for(const key of Object.keys(claim))if(JSON.stringify(permit.claim[key])!==JSON.stringify(claim[key]))deny()
   if(permit.schema!=='mip_boundary_permit_v1'||!uid(permit.permit_id)||permit.request_id!==c.request_id||
    permit.prefix_digest!==createHash('sha256').update([...proof.revision_ids].sort().join(',')).digest('hex')||
    !Number.isFinite(Date.parse(permit.expires_at)))deny()
   await check()
   // The consumer has no issuer credential and the issuer receives no history payload.
   const {claim:sealedIdentity,...capability}=permit
   const receipt=await consume(Object.freeze(capability))
   keys(receipt,'schema|delivery_id|delivered|historical_time_qualified|publication_allowed')
   if(receipt.schema!=='mip_saved_boundary_delivery_receipt_v2'||receipt.delivery_id!==permit.permit_id||
    receipt.delivered!==true||receipt.historical_time_qualified!==false||receipt.publication_allowed!==false)deny()
   return receipt
  })
 }})
}
// withTransaction must reserve ONE consume-only authenticated backend, honor AbortSignal by
// cancelling/closing it, and roll back on errors. Production transport admission remains absent.
export function createSavedBoundaryReader({authority,withTransaction}={}){
 if(typeof authority?.withPermit!=='function'||typeof withTransaction!=='function')deny()
 return async(request,deliver)=>{
  const r=freezeRequest(request);if(typeof deliver!=='function')deny()
  const controller=new AbortController();let totalTimer,leaseTimer
  const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('mip_boundary_delivery_aborted')),{once:true}))
  totalTimer=setTimeout(()=>controller.abort(),30000)
  const work=withTransaction(async query=>{
   await query("set local statement_timeout='5000ms';set local lock_timeout='5000ms';set local idle_in_transaction_session_timeout='15000ms'",[])
   const requestId=randomUUID()
   const challenge=copy((await query('select mip_temporal.boundary_history_challenge($1::uuid) as value',[requestId])).rows?.[0]?.value)
   if(challenge?.request_id!==requestId)deny()
   return authority.withPermit(r,challenge,controller.signal,async permit=>{
    live(controller.signal)
    const started=performance.now()
    const envelope=copy((await query('select mip_temporal.consume_boundary_history_permit($1::uuid,$2::uuid) as value',[permit.permit_id,requestId])).rows?.[0]?.value)
    keys(envelope,'schema|permit_id|request_id|expires_at|remaining_ms|payload')
    if(envelope.schema!=='mip_boundary_delivery_v1'||envelope.permit_id!==permit.permit_id||envelope.request_id!==requestId||
     envelope.expires_at!==permit.expires_at||!Number.isSafeInteger(envelope.remaining_ms)||envelope.remaining_ms<1||envelope.remaining_ms>10000)deny()
    const remaining=envelope.remaining_ms-Math.ceil(performance.now()-started)
    if(remaining<1)deny()
    const payload=envelope.payload;keys(payload,historyKeys)
    if(payload.contract_version!=='mip_hypothesis_history_v1'||payload.investigation_id!==r.investigationId||
     payload.temporal_scope!=='saved_boundary_current_permission'||!Array.isArray(payload.entries)||payload.entries.length>128||
     Buffer.byteLength(JSON.stringify(payload))>1048576)deny()
    for(const k of ['historical_commit_visibility_qualified','source_authority_qualified','user_history_qualified','historical_time_qualified','publication_allowed'])if(payload[k]!==false)deny()
    const seen=new Set()
    for(const e of payload.entries){
     if(!uid(e.revision_id)||seen.has(e.revision_id)||!['available','withheld'].includes(e.status))deny()
     seen.add(e.revision_id)
     const allowed=e.status==='available'?['revision_id','revision','completed_at','status','assessment','workspace_version_id','observation_id','current_context','reassessment_pending']:['revision_id','revision','completed_at','status','reason','workspace_version_id','observation_id']
     if(Object.keys(e).some(k=>!allowed.includes(k)))deny()
     if(e.status==='available'&&e.assessment?.question_id!==r.investigationId)deny()
    }
    leaseTimer=setTimeout(()=>controller.abort(),remaining)
    await Promise.race([Promise.resolve().then(()=>deliver(payload,controller.signal)),aborted])
    live(controller.signal)
    return {schema:'mip_saved_boundary_delivery_receipt_v2',delivery_id:permit.permit_id,delivered:true,historical_time_qualified:false,publication_allowed:false}
   })
  },controller.signal)
  try{return await Promise.race([work,aborted])}
  finally{clearTimeout(totalTimer);clearTimeout(leaseTimer);controller.abort();await Promise.allSettled([work])}
 }
}
