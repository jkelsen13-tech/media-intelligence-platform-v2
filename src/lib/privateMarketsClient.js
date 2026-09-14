import {snapshotPrivateMarketsRequest,mapPrivateMarketsResult,marketUUID,privateMarketsFailure as failure,privateMarketsErrors} from './privateMarketsContract.js'
// One view-scoped instance: latest call wins. Dispose on Auth/client/workspace replacement.
// The expected observation comes from the workspace version, not a caller authority claim.
export function createPrivateMarketsClient({transport=null}={}){
 if(transport!==null&&typeof transport!=='function')throw Error('invalid_private_markets_configuration')
 let disposed=false,sequence=0,pending=null
 return Object.freeze({
  read:async(input,{expectedObservationId,signal:external}={})=>{
   if(disposed)return failure('request_cancelled')
   pending?.abort();const turn=++sequence,controller=new AbortController();pending=controller
   const abort=()=>controller.abort();external?.addEventListener('abort',abort,{once:true});if(external?.aborted)abort()
   const frozen=snapshotPrivateMarketsRequest(input),observation=expectedObservationId
   try{
    if(!frozen||!marketUUID(observation))return failure('invalid_request')
    if(!transport)return failure('not_configured')
    if(controller.signal.aborted)return failure('request_cancelled')
    const result=await transport(frozen,{signal:controller.signal})
    if(disposed||sequence!==turn||controller.signal.aborted)return failure('request_cancelled')
    if(result?.error)return failure(privateMarketsErrors.has(result.error.code)?result.error.code:'service_unavailable')
    const data=mapPrivateMarketsResult(result?.data,frozen,{expectedObservationId:observation})
    return data?{data,error:null}:failure('invalid_response')
   }catch{return failure(disposed||sequence!==turn||controller.signal.aborted?'request_cancelled':'service_unavailable')}
   finally{external?.removeEventListener('abort',abort);if(sequence===turn)pending=null}
  },
  dispose:()=>{disposed=true;sequence++;pending?.abort();pending=null;transport?.dispose?.()}
 })
}
