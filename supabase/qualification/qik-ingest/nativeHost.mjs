// One-shot execution-host adapter. No installer, scheduler, role switching or retries.
import {connectAuthenticatedPg} from '../collector-native-capture/authenticatedPgDriver.mjs'
import {createBoundNativePipelineRpc} from './nativeHandoff.mjs'
import {runQikIngestCollector} from './collector.mjs'

const calls=Object.freeze({
 plan:['select public.mip_qik_ingest_plan($1) result',a=>[a.token]],
 begin_run:['select public.mip_qik_ingest_begin_run($1,$2,$3::timestamptz) result',a=>[a.token,a.run_id,a.now]],
 retain_item:['select public.mip_qik_ingest_retain_item($1,$2,$3::uuid,$4::jsonb) result',a=>[a.token,a.run_id,a.source_id,JSON.stringify(a.item)]],
 record_source_run:['select public.mip_qik_ingest_record_source_run($1,$2,$3::uuid,$4,$5,$6,$7,$8::timestamptz) result',
   a=>[a.token,a.run_id,a.source_id,a.state,a.fetched,a.new_items,a.error_note,a.now]],
 finish_run:['select public.mip_qik_ingest_finish_run($1,$2,$3,$4::jsonb,$5::timestamptz) result',
   a=>[a.token,a.run_id,a.state,JSON.stringify(a.counters??{}),a.now]],
})
export function createNativeCollectorRpc(db){
 return async(name,args)=>{
   const call=calls[name];if(!call)throw Error('native_host_rpc_unknown')
   return (await db.query(call[0],call[1](args))).rows[0].result
 }
}
export function boundedFeedFetcher({allowedFeedUrls,disposable=false,maxBytes=1048576,timeoutMs=8000}){
 if(!Array.isArray(allowedFeedUrls)||!allowedFeedUrls.length||allowedFeedUrls.length>32
   || !Number.isInteger(maxBytes)||maxBytes<1||maxBytes>1048576
   || !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000)throw Error('native_host_feed_policy_invalid')
 const allowed=new Set(allowedFeedUrls.map(value=>{
   const url=new URL(value)
   if(url.username||url.password||url.hash
     || !(url.protocol==='https:' || (disposable&&url.protocol==='http:'&&url.hostname==='127.0.0.1')))
     throw Error('native_host_feed_policy_invalid')
   return url.href
 }))
 return async value=>{
   let url;try{url=new URL(value)}catch{throw Error('native_host_feed_denied')}
   if(!allowed.has(url.href))throw Error('native_host_feed_denied')
   const signal=AbortSignal.timeout(timeoutMs)
   let response
   try{
     response=await fetch(url,{method:'GET',redirect:'manual',signal,
       headers:{'user-agent':'MIP-Qik-Native/1.0','accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'}})
     if(!response.ok)throw Error('native_host_feed_http')
     const length=response.headers.get('content-length')
     if(length!==null && (!/^\d+$/.test(length)||Number(length)>maxBytes))throw Error('native_host_feed_size')
     if(!response.body)throw Error('native_host_feed_empty')
     const reader=response.body.getReader(),chunks=[]
     let bytes=0
     try{
       for(;;){
         const {done,value:chunk}=await reader.read();if(done)break
         bytes+=chunk.byteLength;if(bytes>maxBytes)throw Error('native_host_feed_size')
         chunks.push(chunk)
       }
     }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
     const data=new Uint8Array(bytes);let offset=0
     for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength}
     return new TextDecoder('utf-8',{fatal:true}).decode(data)
   }catch{
     await response?.body?.cancel().catch(()=>{})
     throw Error('native_host_feed_unavailable')
   }
 }
}
export async function runNativeHost({connectionString,expectedLogin,token,runId,allowedFeedUrls,
 sessionPoolerHost=null,disposable=false,maxFeedBytes=1048576,feedTimeoutMs=8000}){
 if(typeof runId!=='string'||!/^qik-host-[a-zA-Z0-9_-]{1,100}$/.test(runId))
   throw Error('native_host_run_id_invalid')
 if(typeof token!=='string'||token.length<32||token.length>256)throw Error('native_host_token_invalid')
 if(disposable && process.env.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller')
   throw Error('native_host_disposable_refused')
 if(!disposable && new URL(connectionString).pathname!=='/postgres')throw Error('native_host_database_refused')
 const fetchText=boundedFeedFetcher({allowedFeedUrls,disposable,maxBytes:maxFeedBytes,timeoutMs:feedTimeoutMs})
 let db,result,failed=false,closed=false
 try{
   db=await connectAuthenticatedPg({connectionString,expectedLogin,sessionPoolerHost,disposable})
   // A login may inherit the runtime group only. Reject broad memberships even
   // when NOINHERIT would hide them until SET ROLE.
   const authority=(await db.query(`
     select pg_has_role(current_user,'qik_ingest_runtime','USAGE') as runtime,
       exists(select 1 from pg_roles r where r.rolname not in(current_user,'qik_ingest_runtime')
         and pg_has_role(current_user,r.oid,'MEMBER')) as extra_membership,
       has_table_privilege(current_user,(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='evidence_pipeline' and c.relname='import_jobs'),'SELECT,INSERT,UPDATE,DELETE') as native_table,
       has_any_column_privilege(current_user,'public.articles','INSERT,UPDATE') as article_write
   `)).rows[0]
   if(!authority?.runtime||authority.extra_membership||authority.native_table||authority.article_write)
     throw Error('native_host_authority_refused')
   result=await runQikIngestCollector({rpc:createNativeCollectorRpc(db),
     pipelineRpc:createBoundNativePipelineRpc(db,{token,runId}),token,runId,fetchText})
 }catch{failed=true}
 finally{if(db)try{await db.end();closed=true}catch{failed=true}}
 // Never print PostgreSQL errors, feed URLs, credentials, raw item bodies or
 // source failure text. A lost response is not permission to retry/recover.
 const body=result?.body
 const terminal=body&&['completed','completed_with_errors','failed'].includes(body.state)
 return {
   run_id:runId,http_status:result?.httpStatus??null,
   state:failed?'native_host_failed':terminal?body.state:'native_host_refused',
   ...(terminal?Object.fromEntries(['inserted','duplicates','revisions','rejected','unresolved',
     'failed_jobs','source_failures','extracted_captures','extraction_incomplete'].map(k=>[k,body[k]])):{}),
   connection_closed:closed,
   needs_reconciliation:failed||(!terminal&&result?.httpStatus===409),
   // Even acknowledged terminal failure can retain observations/jobs/captures.
   residuals:'retain_run_observations_and_native_evidence',
 }
}
