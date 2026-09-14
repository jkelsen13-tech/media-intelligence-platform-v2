// Isolated trusted coordinator. No browser export, endpoint or production adapter.
import {boundaryRegistrationEnvelope,boundaryRegistrationDigest} from './boundaryRegistrationCustody.mjs'
import {verifyRetainedBoundaryPrefix} from './retainedBoundaryPrefix.mjs'
const deny=()=>{throw Error('mip_boundary_history_denied')}
const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const clone=x=>JSON.parse(JSON.stringify(x))
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const sql='select mip_temporal.read_boundary_history($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::uuid) as value'
// withAuthority is the existing authenticated custody contract and must exclude source
// registration/restore/revocation through callback completion. withTransaction must reserve
// one authenticated PostgreSQL connection and hold its transaction through callback completion.
// Neither callback may be supplied by the browser. Independent production custody remains absent.
export async function deliverSavedBoundaryHistory({prefix,session,verifiedUserId,investigationId,withAuthority,withTransaction,deliver}={}){
 if(!uid(session)||!uid(verifiedUserId)||!uid(investigationId)||typeof withAuthority!=='function'||
 typeof withTransaction!=='function'||typeof deliver!=='function')deny()
 const registration=boundaryRegistrationEnvelope(prefix?.registration),digest=boundaryRegistrationDigest(registration)
 // Freeze all request parameters before yielding; journal remains a trusted capability.
 const options=clone({...prefix,journal:undefined,registration})
 options.journal=prefix.journal
 const scope=Object.freeze({source:registration.source,stream:registration.stream,bindingId:registration.bindingId,
  incarnationId:registration.incarnationId,contractDigest:registration.contractDigest,operation:'history',digest})
 const checkCustody=async tx=>{
  if(await tx.head(registration.source)!==digest||!same(boundaryRegistrationEnvelope(await tx.read(digest)),registration))deny()
 }
 return withAuthority(scope,async custody=>{
  await checkCustody(custody)
  const proof=await verifyRetainedBoundaryPrefix(options)
  const args=[session,registration.bindingId,registration.incarnationId,registration.contractDigest,registration.source,
   registration.stream,options.observationEpoch,options.terminalCapture,options.targetMarker,verifiedUserId,investigationId]
  return withTransaction(async query=>{
   if(typeof query!=='function')deny()
   const read=async()=>{
    const result=clone((await query(sql,args)).rows?.[0]?.value)
    if(result?.schema!=='mip_combined_boundary_history_v1'||result.binding_id!==registration.bindingId||
     result.incarnation_id!==registration.incarnationId||result.contract_digest!==registration.contractDigest||
     result.source_id!==registration.source||result.stream_epoch!==registration.stream||
     result.observation_epoch!==options.observationEpoch||result.terminal_capture!==proof.terminal_capture||
     result.target_marker!==proof.target_marker||result.covered_through!==proof.covered_through||
     result.verified_user_id!==verifiedUserId||result.investigation_id!==investigationId||
     result.history?.contract_version!=='mip_hypothesis_history_v1'||result.history.investigation_id!==investigationId||
     result.history.publication_allowed!==false||!Array.isArray(result.history.entries))deny()
    return result.history
   }
   await read() // Acquire source, membership and material fences on the same backend.
   await checkCustody(custody)
   // Reread after custody IO to catch expiry; all transaction fences remain held.
   const history=await read(),ids=new Set(proof.revision_ids),seen=new Set()
   const entries=history.entries.filter(entry=>{
    if(!uid(entry.revision_id)||seen.has(entry.revision_id)||!['available','withheld'].includes(entry.status))deny()
    seen.add(entry.revision_id);return ids.has(entry.revision_id)
   })
   const response={...history,entries,temporal_scope:'saved_boundary_current_permission',
    historical_commit_visibility_qualified:false,source_authority_qualified:false,user_history_qualified:false,
    historical_time_qualified:false,publication_allowed:false}
   // Delivery occurs inside BOTH scopes. Only investigation-scoped, current-permission
   // history is delivered; source-wide prefix IDs and control attestations stay internal.
   await deliver(response)
   return {schema:'mip_saved_boundary_delivery_receipt_v1',delivered:true,historical_time_qualified:false,publication_allowed:false}
  })
 })
}
