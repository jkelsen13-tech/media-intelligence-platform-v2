import {createClient} from '@supabase/supabase-js'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
function claimsFor(token,issuer,audience){
 try{
  if(token.length>16384||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return null
  const [head,body]=token.split('.'),decode=s=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))
  const h=decode(head),p=decode(body),now=Date.now()/1000
  if(!h||typeof h.alg!=='string'||h.alg.toLowerCase()==='none'||!p||p.iss!==issuer||p.aud!==audience||
   p.role!=='authenticated'||p.is_anonymous!==false||!uuid(p.sub)||!uuid(p.session_id)||
   !Number.isSafeInteger(p.exp)||p.exp<=now||!Number.isSafeInteger(p.iat)||p.iat>now||
   (p.nbf!==undefined&&(!Number.isSafeInteger(p.nbf)||p.nbf>now)))return null
  return p
 }catch{return null}
}
// Default closed; no environment reads, session persistence, broad key, worker credential or live activation.
export function createSupabaseHypothesisAuthenticator(configuration){
 if(configuration==null)return Object.freeze(async()=>null)
 const {projectUrl,publishableKey,issuer,audience,fetchImpl=globalThis.fetch,timeoutMs=10000}=configuration
 let url
 try{url=new URL(projectUrl)}catch{throw TypeError('invalid_hypothesis_auth_configuration')}
 if(url.origin!==projectUrl||url.protocol!=='https:'||issuer!==projectUrl+'/auth/v1'||
  typeof audience!=='string'||!audience.trim()||typeof publishableKey!=='string'||
  !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)||publishableKey.length>4096||
  typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
  throw TypeError('invalid_hypothesis_auth_configuration')
 const endpoint=projectUrl+'/auth/v1/user'
 return Object.freeze(async authorization=>{
  if(typeof authorization!=='string'||!/^Bearer \S+$/i.test(authorization))return null
  const token=authorization.slice(7),claims=claimsFor(token,issuer,audience)
  if(!claims)return null
  const controller=new AbortController();let attempts=0,timer
  const denied=()=>new Response('{"code":"unexpected_failure","msg":"Authentication unavailable"}',{status:503,headers:{'content-type':'application/json'}})
  const scopedFetch=async(input,options={})=>{
   if(++attempts!==1||String(input)!==endpoint||(options.method??'GET').toUpperCase()!=='GET')return denied()
   const headers=new Headers(options.headers)
   if(headers.get('authorization')!=='Bearer '+token||headers.get('apikey')!==publishableKey)return denied()
   let response,reader
   const cancel=()=>{void reader?.cancel().catch(()=>{})}
   try{
    response=await fetchImpl(endpoint,{method:'GET',headers:{authorization:'Bearer '+token,apikey:publishableKey},
     signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})
    if(controller.signal.aborted||response.redirected||(response.url&&response.url!==endpoint)||
     !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))return denied()
    if(!response.ok)return new Response('{"code":"bad_jwt","msg":"Authentication denied"}',{status:401,headers:{'content-type':'application/json'}})
    reader=response.body?.getReader();if(!reader)return denied()
    controller.signal.addEventListener('abort',cancel,{once:true})
    let size=0;const chunks=[]
    for(;;){const {value,done}=await reader.read();if(controller.signal.aborted)return denied();if(done)break
     size+=value.byteLength;if(size>65536)return denied();chunks.push(value)}
    const bytes=new Uint8Array(size);let offset=0
    for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}
    const user=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
    if(!user||user.id!==claims.sub||user.aud!==audience||user.role!=='authenticated'||user.is_anonymous!==false)return denied()
    // Strip provider metadata before the SDK response and never retain or return it.
    return new Response(JSON.stringify({id:user.id,aud:user.aud,role:user.role,is_anonymous:false}),
     {headers:{'content-type':'application/json'}})
   }catch{return denied()}
   finally{controller.signal.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}else{void response?.body?.cancel().catch(()=>{})}}
  }
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null)},timeoutMs)})
  try{
   const client=createClient(projectUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:scopedFetch}})
   const verified=client.auth.getUser(token).then(({data,error})=>{
    if(controller.signal.aborted||error||!claimsFor(token,issuer,audience)||data?.user?.id!==claims.sub||data.user.is_anonymous!==false)return null
    return Object.freeze({id:data.user.id,is_anonymous:false})
   }).catch(()=>null)
   return await Promise.race([verified,timeout])
  }catch{return null}
  finally{clearTimeout(timer);controller.abort()}
 })
}
