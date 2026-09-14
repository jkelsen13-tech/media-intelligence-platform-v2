import {snapshotPrivateMarketsRequest,marketUUID,privateMarketsFailure as failure} from '../../../src/lib/privateMarketsContract.js'
export const PRIVATE_MARKETS_SQL='select mip_markets.read_private($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::timestamptz) as value'
function databaseError(error){
 if(error?.code==='42501')return 'access_denied'
 if(['22023','22P02','22007','22008'].includes(error?.code))return 'invalid_request'
 // Exact trusted database messages only; never return arbitrary diagnostics.
 const code=error?.code==='P0001'?String(error?.message??'').split('_via_')[0]:null
 if(['mip_market_candidate_budget','mip_market_path_budget'].includes(code))return 'scope_too_large'
 if(['mip_market_assessment_unavailable','mip_market_asset_unavailable','mip_market_identity_not_valid','mip_market_alias_invalid','mip_market_aliases_required'].includes(code))return 'evidence_unavailable'
 if(['mip_market_identity_not_in_workspace','mip_market_source_denied','mip_market_material_not_in_workspace','mip_market_operation_denied'].includes(code))return 'access_denied'
 return 'service_unavailable'
}
// Trusted server seam only: no endpoint, session storage or provider credentials.
export function createPrivateMarketsReader({authenticate,sourceProject,query}={}){
 if(typeof authenticate!=='function'||typeof query!=='function'||typeof sourceProject!=='string'||!sourceProject.trim()||sourceProject==='cc-definition-batch-v1')throw Error('mip_markets_unconfigured')
 const source=sourceProject
 return Object.freeze({read:async(request,input)=>{
  const frozen=snapshotPrivateMarketsRequest(input)
  if(!frozen)return failure('invalid_request')
  let user
  try{user=await authenticate(request)}catch{return failure('service_unavailable')}
  if(request?.signal?.aborted)return failure('request_cancelled')
  if(!user||!marketUUID(user.id)||user.is_anonymous===true)return failure('authentication_required')
  try{
   const result=await query(PRIVATE_MARKETS_SQL,[user.id,frozen.investigation_id,frozen.workspace_version_id,source,frozen.asset_id,frozen.event_id,frozen.at],{signal:request?.signal})
   if(request?.signal?.aborted)return failure('request_cancelled')
   return {data:result.rows[0].value,error:null}
  }catch(error){return failure(request?.signal?.aborted?'request_cancelled':databaseError(error))}
 }})
}
