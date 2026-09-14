import {snapshotPrivateMarketsRequest,privateMarketsFailure as failure,privateMarketsErrors} from './privateMarketsContract.js'
import {readPrivateMarketsJson} from './privateMarketsIO.js'
// Explicit HTTPS endpoint only. No default route, persisted token, cookies, redirect or retry.
export function createPrivateMarketsHttpTransport({endpoint=null,getAccessToken,fetchImpl=globalThis.fetch,timeoutMs=15000,maxResponseBytes=1048576}={}){
 if(endpoint===null){const unconfigured=async()=>failure('not_configured');unconfigured.dispose=()=>{};return Object.freeze(unconfigured)}
 let url;try{url=new URL(endpoint)}catch{throw Error('invalid_private_markets_configuration')}
 if(typeof endpoint!=='string'||url.href!==endpoint||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||
 !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>1048576)throw Error('invalid_private_markets_configuration')
 let disposed=false;const pending=new Set()
 async function transport(input,{signal:external}={}){
  if(disposed)return failure('request_cancelled')
  const frozen=snapshotPrivateMarketsRequest(input);if(!frozen)return failure('invalid_request')
  const body=JSON.stringify(frozen),controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort()
  external?.addEventListener('abort',abort,{once:true});if(external?.aborted)abort()
  pending.add(controller);const timer=setTimeout(abort,timeoutMs)
  let cancel
  const cancelled=new Promise(resolve=>{cancel=()=>resolve(failure(disposed||external?.aborted?'request_cancelled':'service_unavailable'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel()})
  const execute=async()=>{
   if(signal.aborted)return failure('request_cancelled')
   const token=await getAccessToken()
   if(disposed||signal.aborted)return failure('request_cancelled')
   if(typeof token!=='string'||token.length>16384||!token.length||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token))return failure('authentication_required')
   const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body,signal,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})
   if(disposed||signal.aborted){void response.body?.cancel().catch(()=>{});return failure('request_cancelled')}
   if(response.redirected||response.type==='opaqueredirect'||(response.url&&response.url!==endpoint)||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){void response.body?.cancel().catch(()=>{});return failure('invalid_response')}
   const value=await readPrivateMarketsJson(response.body,maxResponseBytes,signal)
   if(disposed||signal.aborted)return failure('request_cancelled')
   if(!value||Object.getPrototypeOf(value)!==Object.prototype)return failure('invalid_response')
   if(!response.ok){
    const code=value.error?.code
    if(Object.keys(value).length!==1||!value.error||Object.keys(value.error).length!==1||!privateMarketsErrors.has(code))return failure('service_unavailable')
    const statuses={authentication_required:[401],access_denied:[403],origin_denied:[403],invalid_request:[400,405,413,415],evidence_unavailable:[409],scope_too_large:[409,503],service_unavailable:[503],invalid_response:[503],request_cancelled:[499]}
    return failure(statuses[code]?.includes(response.status)?code:'service_unavailable')
   }
   if(response.status!==200||Object.keys(value).length!==1||!Object.hasOwn(value,'data')||value.data===null)return failure('invalid_response')
   return {data:value.data,error:null}
  }
  try{return await Promise.race([execute(),cancelled])}catch{return failure(signal.aborted?(disposed||external?.aborted?'request_cancelled':'service_unavailable'):'service_unavailable')}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);external?.removeEventListener('abort',abort);pending.delete(controller)}
 }
 transport.dispose=()=>{disposed=true;for(const c of pending)c.abort();pending.clear()}
 return Object.freeze(transport)
}
