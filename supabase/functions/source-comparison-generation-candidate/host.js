// Candidate for the existing Supabase Edge execution host. No activation here.
import {runQikJournaledWorker} from './qikWorkerJournal.js'
const allowed=new Set(['worker_claim','worker_complete','worker_fail','worker_journal_put','worker_journal_get','worker_journal_pending','worker_resume_claim'])
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
export function qikWorkerHost({rpcUrl,apiKey,workerJwt,invokeToken,session,runtime,implementation,fetchImpl=fetch,cryptoImpl=crypto}){
 const url=new URL(rpcUrl)
 if(url.protocol!=='https:'||url.search||url.hash||!url.pathname.endsWith('/rest/v1/rpc/'))throw Error('mip_host_rpc_url')
 if([apiKey,workerJwt,invokeToken,session,runtime,implementation].some(v=>typeof v!=='string'||!v))throw Error('mip_host_configuration')
 // This is a shape restriction, not signature verification. The provider and
 // native RPC verify the actual current identity. No administrator fallback.
 const jwtClaims=value=>JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
 if(!apiKey.startsWith('sb_publishable_')){
  let publicClaims
  try{publicClaims=jwtClaims(apiKey)}catch{throw Error('mip_host_public_key')}
  if(publicClaims.role!=='anon')throw Error('mip_host_public_key')
 }
 let claims
 try{claims=jwtClaims(workerJwt)}catch{throw Error('mip_host_worker_jwt')}
 if(claims.role!=='mip_comparison_worker_v1')throw Error('mip_host_worker_role')
 const rpc=async(name,args)=>{
  if(!allowed.has(name))throw Error('mip_host_rpc_denied')
  // Exactly one attempt. A timeout is ambiguous; native journal discovery owns
  // retry on the next invocation, never an invisible HTTP client retry.
  const response=await fetchImpl(new URL(name,url),{method:'POST',redirect:'error',
   headers:{apikey:apiKey,authorization:'Bearer '+workerJwt,'content-type':'application/json',
    'content-profile':'mip_cutover_authority','accept-profile':'mip_cutover_authority'},
   body:JSON.stringify(args),signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw Error('mip_host_rpc_refused')
  return response.json()
 }
 return async request=>{
  if(request.method!=='POST')return json(405,{state:'method_denied'})
  if(request.headers.get('authorization')!=='Bearer '+invokeToken)return json(403,{state:'denied'})
  // Invocation has no payload. Reject streams without reading or buffering them.
  if(request.body!==null){void request.body.cancel();return json(400,{state:'body_denied'})}
  const started=performance.now()
  try{
   const result=await runQikJournaledWorker({rpc,session,runtime,implementation,pageSize:20,
    requestId:()=>cryptoImpl.randomUUID(),shouldDrain:()=>performance.now()-started>=45000,
    sha256:async s=>Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('')})
   return json(200,{state:result.state,...(result.recovered===undefined?{}:{recovered:result.recovered}),
    ...(result.held===undefined?{}:{held:result.held})})
  }catch{return json(503,{state:'recovery_required'})}
 }
}
