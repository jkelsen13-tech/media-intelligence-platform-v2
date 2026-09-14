// Explicit configuration only. No default endpoint, token storage, automatic retry or production activation.
const actions=new Set(['capture_observation','read_observation','history','backlog','reconcile','generation_backlog','review_history','acknowledge_review',
 'recover_generation','capture_generation','authoring_context','authoring_span','request_reassessment','request_detail','append','complete'])
const errors=new Set(['authentication_required','access_denied','version_conflict','invalid_request','origin_denied',
 'service_unavailable','generation_not_configured'])
const failure=code=>({data:null,error:{code}})
async function boundedResponse(response,maximum,signal){
 if(!response.body?.getReader)throw Error('invalid_response')
 const reader=response.body.getReader(),chunks=[];let size=0
 const cancel=()=>{void reader.cancel().catch(()=>{})}
 signal.addEventListener('abort',cancel,{once:true})
 try{
  for(;;){
   if(signal.aborted)throw Error('aborted')
   const {value,done}=await reader.read();if(done)break
   size+=value.byteLength
   if(size>maximum){cancel();throw Error('response_limit')}
   chunks.push(value)
  }
  if(signal.aborted)throw Error('aborted')
  const bytes=new Uint8Array(size);let offset=0
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 }finally{signal.removeEventListener('abort',cancel);reader.releaseLock()}
}
export function createHypothesisHttpTransport({endpoint,getAccessToken,fetchImpl=globalThis.fetch,
 timeoutMs=30000,maxResponseBytes=2097152}={}){
 let url
 try{url=new URL(endpoint)}catch{throw new TypeError('invalid_hypothesis_http_configuration')}
 if(typeof endpoint!=='string'||url.href!==endpoint||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
  typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||
  !Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>16777216)
  throw new TypeError('invalid_hypothesis_http_configuration')
 let disposed=false
 const pending=new Set()
 async function transport(action,input){
  if(disposed)return failure('authentication_required')
  if(!actions.has(action)||input===null||typeof input!=='object'||Array.isArray(input))return failure('invalid_request')
  let body
  try{body=JSON.stringify({action,input});if(new TextEncoder().encode(body).byteLength>65536)return failure('invalid_request')}
  catch{return failure('invalid_request')}
  // Capture exact arguments before asynchronous token acquisition.
  const controller=new AbortController(),{signal}=controller
  pending.add(controller)
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  let abort
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('aborted'));signal.addEventListener('abort',abort,{once:true})})
  const execute=async()=>{
   const token=await getAccessToken()
   if(disposed||signal.aborted)throw Error('aborted')
   if(typeof token!=='string'||!token.length||token.length>16384||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token))
    return failure('authentication_required')
   const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body,signal,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})
   if(disposed||signal.aborted){void response.body?.cancel().catch(()=>{});throw Error('aborted')}
   if(response.redirected||response.type==='opaqueredirect'||(response.url&&response.url!==endpoint)||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){void response.body?.cancel().catch(()=>{});throw Error('invalid_response')}
   const result=await boundedResponse(response,maxResponseBytes,signal)
   if(disposed||signal.aborted)throw Error('aborted')
   if(!result||typeof result!=='object'||Array.isArray(result))throw Error('invalid_response')
   if(!response.ok){
    const code=result.error?.code
    return failure(errors.has(code)?code:'service_unavailable')
   }
   if(Object.keys(result).length!==1||!Object.hasOwn(result,'data')||result.data===null)throw Error('invalid_response')
   return{data:result.data,error:null}
  }
  try{return await Promise.race([execute(),cancelled])}
  catch{return failure(disposed?'authentication_required':'request_failed')}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);pending.delete(controller)}
 }
 transport.dispose=()=>{
  disposed=true
  for(const controller of pending)controller.abort()
  pending.clear()
 }
 return Object.freeze(transport)
}
