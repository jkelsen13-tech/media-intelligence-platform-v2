// Trusted server seam only; no default endpoint/identity, browser credentials or publication.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function createPrivateMarketsReader({authenticate,sourceProject,query}={}){
 if(typeof authenticate!=='function'||typeof query!=='function'||typeof sourceProject!=='string'||!sourceProject.trim()||sourceProject==='cc-definition-batch-v1')throw Error('mip_markets_unconfigured')
 const source=sourceProject
 return Object.freeze({read:async(request,input)=>{
  try{
   if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join('|')!=='asset_id|at|event_id|investigation_id|workspace_version_id')return {error:{code:'invalid_request'}}
   const frozen=Object.freeze({...input})
   if(![frozen.investigation_id,frozen.workspace_version_id].every(v=>typeof v==='string'&&uuid.test(v))||
    ![frozen.asset_id,frozen.event_id].every(v=>v===null||(typeof v==='string'&&uuid.test(v)))||
    (!frozen.asset_id&&!frozen.event_id)||typeof frozen.at!=='string')return {error:{code:'invalid_request'}}
   const user=await authenticate(request)
   if(!user||typeof user.id!=='string'||!uuid.test(user.id))return {error:{code:'authentication_required'}}
   const result=await query('select mip_markets.read_private($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::timestamptz) as value',
    [user.id,frozen.investigation_id,frozen.workspace_version_id,source,frozen.asset_id,frozen.event_id,frozen.at])
   return {data:result.rows[0].value,error:null}
  }catch{return {data:null,error:{code:'access_denied'}}}
 }})
}
