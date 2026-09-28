import { timingSafeEqual } from 'node:crypto'
import { createQikHistoricalExecutor } from './executor.mjs'

const project='qikvmopbtijoebdqosyq'
const fixedCodes=new Set(['route_unconfigured','route_unqualified','capacity_unqualified',
  'original_export_unavailable','original_export_changed','object_capture_unqualified',
  'adapter_operation_failed','invocation_budget','cancelled','request_invalid','unauthorized','busy'])
const states=new Set(['acquired','sealed','readback_verified','budget_paused','unit_exceeds_budget',
  'unsupported_unit_capacity','incomplete','not_started'])
const reply=(status,state,code=null)=>new Response(JSON.stringify({state,code}),{
  status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
const fail=code=>{throw Object.assign(new Error(code),{code})}
function equalToken(actual,expected) {
  if(typeof actual!=='string'||typeof expected!=='string'||expected.length<32) return false
  const a=Buffer.from(actual),b=Buffer.from(expected)
  return a.length===b.length&&timingSafeEqual(a,b)
}
export function restrictedConnection(value) {
  let url
  try {url=new URL(value)} catch {fail('route_unconfigured')}
  if(!['postgres:','postgresql:'].includes(url.protocol)||
    url.hostname!=='db.'+project+'.supabase.co'||
    decodeURIComponent(url.username)!=='mip_history_executor'||
    (url.port&&url.port!=='5432')||url.pathname!=='/postgres'||!url.password)
    fail('route_unconfigured')
  // Do not use connectionString: query-string SSL/host/user overrides must not
  // override these explicit restricted TLS connection options.
  return {host:url.hostname,port:5432,database:'postgres',user:'mip_history_executor',
    password:decodeURIComponent(url.password),ssl:{rejectUnauthorized:true},
    connectionTimeoutMillis:5000,statement_timeout:110000,
    application_name:'mip_history_private_executor'}
}
async function boundedJson(request) {
  if(!request.body||!request.headers.get('content-type')?.startsWith('application/json'))
    fail('request_invalid')
  const reader=request.body.getReader(),chunks=[];let length=0
  try {
    for(;;) {
      const {done,value}=await reader.read()
      if(done)break
      length+=value.byteLength
      if(length>4096) {await reader.cancel();fail('request_invalid')}
      chunks.push(value)
    }
    const bytes=new Uint8Array(length);let at=0
    for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
    if(!value||typeof value!=='object'||Array.isArray(value))fail('request_invalid')
    return value
  } catch(error) {fail(error?.code==='request_invalid'?'request_invalid':'request_invalid')}
  finally {reader.releaseLock()}
}
function parameters(value) {
  if(!['acquire','seal','resume'].includes(value.action)||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.operation_id??''))
    fail('request_invalid')
  const allowed=value.action==='acquire'?['action','operation_id']:
    value.action==='seal'?['action','operation_id','manifest_limits']:
    ['action','operation_id','manifest_limits','max_units','max_material_bytes','timeout_ms']
  if(Object.keys(value).some(k=>!allowed.includes(k)))fail('request_invalid')
  if(value.action!=='acquire') {
    const m=value.manifest_limits
    if(!m||Object.keys(m).sort().join(',')!=='bytes,objects,records'||
      !Object.values(m).every(n=>Number.isSafeInteger(n)&&n>0)||
      m.records>250000||m.objects>100000||m.bytes>1024**4)fail('request_invalid')
  }
  if(value.action==='resume') {
    for(const [key,max] of [['max_units',100],['max_material_bytes',134217728],['timeout_ms',110000]])
      if(value[key]!==undefined&&(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>max))
        fail('request_invalid')
  }
  return value
}
// Concrete authenticated handler, with test injection ONLY at process composition.
// Request bodies cannot supply a SQL selector, host, credential, admission or driver.
export function createHistoricalHandler({readSecret,createClient,makeExecutor=createQikHistoricalExecutor}) {
  let busy=false
  return async request=>{
    let client,timer,abortListener,ownsSlot=false;const controller=new AbortController()
    try {
      if(request.method!=='POST')return reply(405,'not_started','request_invalid')
      if(readSecret('SUPABASE_URL')!=='https://'+project+'.supabase.co')
        return reply(503,'not_started','route_unconfigured')
      // The gateway also requires a valid JWT (see config.toml). This independent,
      // high-entropy server-only token restricts the migration invoker.
      if(!equalToken(request.headers.get('x-mip-history-invoker'),readSecret('MIP_HISTORY_INVOKER_TOKEN')))
        return reply(401,'not_started','unauthorized')
      if(busy)return reply(409,'not_started','busy')
      const p=parameters(await boundedJson(request))
      const supplied=readSecret('MIP_HISTORY_EXECUTOR_DB_URL')??readSecret('SUPABASE_DB_URL')
      const options=restrictedConnection(supplied)
      if(busy)return reply(409,'not_started','busy')
      busy=true;ownsSlot=true
      client=createClient(options)
      client.on?.('error',()=>{}) // never log driver data
      timer=setTimeout(()=>controller.abort(),115000)
      abortListener=()=>controller.abort()
      request.signal?.addEventListener('abort',abortListener,{once:true})
      await client.connect()
      let closed=false
      const db={query:async({signal=controller.signal,...query})=>{
        if(closed||signal.aborted||controller.signal.aborted)fail('cancelled')
        let rejectAbort
        const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Object.assign(new Error('cancelled'),{code:'cancelled'}))})
        const cancel=()=>{
          closed=true;rejectAbort()
          // Closing the dedicated connection makes writes potentially ambiguous;
          // exact readback on the next invocation is the recovery mechanism.
          void client.end().catch(()=>{})
        }
        signal.addEventListener('abort',cancel,{once:true})
        controller.signal.addEventListener('abort',cancel,{once:true})
        try {return await Promise.race([client.query(query),aborted])}
        catch(error){fail(error?.code==='cancelled'?'cancelled':'adapter_operation_failed')}
        finally {
          signal.removeEventListener('abort',cancel)
          controller.signal.removeEventListener('abort',cancel)
        }
      }}
      const adapter=makeExecutor(db)
      let result
      if(p.action==='acquire') result=await adapter.acquire(p.operation_id,{signal:controller.signal})
      else if(p.action==='seal') result=await adapter.seal(p.operation_id,{manifest_limits:p.manifest_limits,signal:controller.signal})
      else {
        const {action,operation_id,...budget}=p
        result=await adapter.resume(operation_id,budget)
      }
      // Discard manifests/checkpoints/identities/byte data/driver diagnostics.
      const state=states.has(result?.state)?result.state:'incomplete'
      const code=result?.code==null?null:fixedCodes.has(result.code)?result.code:'adapter_operation_failed'
      return reply(state==='not_started'||state==='incomplete'?409:200,state,code)
    } catch(error) {
      const code=fixedCodes.has(error?.code)?error.code:'adapter_operation_failed'
      return reply(code==='request_invalid'?400:503,'not_started',code)
    } finally {
      clearTimeout(timer)
      if(abortListener)request.signal?.removeEventListener('abort',abortListener)
      controller.abort()
      if(client) {try {await client.end()} catch {}}
      if(ownsSlot)busy=false
    }
  }
}
