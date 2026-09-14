import {createPrivateMarketsReader} from './store.mjs'
import {snapshotPrivateMarketsRequest,mapPrivateMarketsResult} from '../../../src/lib/privateMarketsContract.js'
import {readPrivateMarketsJson} from '../../../src/lib/privateMarketsIO.js'
// Isolated Request/Response adapter. Auth must verify the bearer remotely/server-side;
// decoding a caller JWT or trusting metadata is not authentication. No deployed entrypoint.
export function createPrivateMarketsHandler({authenticate,sourceProject,query,allowedOrigins,timeoutMs=15000,maxResponseBytes=1048576}={}){
 if(typeof authenticate!=='function'||!Array.isArray(allowedOrigins)||!allowedOrigins.length||allowedOrigins.some(o=>{try{return new URL(o).origin!==o||!o.startsWith('https://')}catch{return true}})||
 !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>1048576)throw Error('invalid_private_markets_configuration')
 const origins=new Set(allowedOrigins)
 const reader=createPrivateMarketsReader({sourceProject,query,authenticate:request=>authenticate(request.headers.get('authorization'),{signal:request.signal})})
 return async request=>{
  const origin=request.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type'}
  if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers}),error=(status,code)=>reply(status,{error:{code}})
  if(!origin||!origins.has(origin))return error(403,'origin_denied')
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return error(405,'invalid_request')
  if(!/^Bearer [A-Za-z0-9._~+\/-]+=*$/i.test(request.headers.get('authorization')??'')||(request.headers.get('authorization')??'').length>16391)return error(401,'authentication_required')
  if(request.headers.has('cookie'))return error(400,'invalid_request')
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return error(415,'invalid_request')
  const controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort()
  request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort()
  const timer=setTimeout(abort,timeoutMs)
  let onAbort
  const cancelled=new Promise(resolve=>{onAbort=()=>resolve(error(request.signal.aborted?499:503,request.signal.aborted?'request_cancelled':'service_unavailable'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort()})
  const execute=async()=>{
   let input
   try{input=await readPrivateMarketsJson(request.body,4096,signal)}catch(e){return error(e.message==='body_limit'?413:400,'invalid_request')}
   const frozen=snapshotPrivateMarketsRequest(input)
   if(!frozen)return error(400,'invalid_request')
   const result=await reader.read({headers:request.headers,signal},frozen)
   if(signal.aborted)return error(499,'request_cancelled')
   if(result.error){const code=result.error.code;return error(({authentication_required:401,access_denied:403,invalid_request:400,evidence_unavailable:409,scope_too_large:409,request_cancelled:499})[code]??503,code)}
   const data=mapPrivateMarketsResult(result.data,frozen)
   if(!data)return error(503,'invalid_response')
   const output=JSON.stringify({data})
   if(new TextEncoder().encode(output).byteLength>maxResponseBytes)return error(503,'scope_too_large')
   return new Response(output,{status:200,headers})
  }
  try{return await Promise.race([execute(),cancelled])}catch{return error(503,'service_unavailable')}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);signal.removeEventListener('abort',onAbort)}
 }
}
