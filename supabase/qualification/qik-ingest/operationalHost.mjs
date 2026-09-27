// Disabled-by-default, one-shot operational adapter for the existing restricted caller.
// No installation, credentials, scheduler, retries or source activation occur here.
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {runNativeHost} from './nativeHost.mjs'

export const QIK_CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'

function refused(){throw Error('operational_host_configuration_refused')}
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)

export function assertExactSourcePlan(plan,source){
 if(!plan?.collection_authorized||!Array.isArray(plan.sources)||plan.sources.length!==1
   ||plan.sources[0]?.id!==source.id||plan.sources[0]?.feed_url!==source.feedUrl)
   throw Error('operational_host_source_plan_refused')
}

export function validateOperationalConfig(env,{source,disposable=false}={}){
 if(env.MIP_QIK_OPERATIONAL_ENABLED!=='owner-authorized-one-shot'
   ||!source||typeof source.id!=='string'||typeof source.feedUrl!=='string'
   ||env.MIP_QIK_SOURCE_ID!==source.id||env.MIP_QIK_SOURCE_FEED_URL!==source.feedUrl
   ||!sha(env.MIP_QIK_RELEASE_SHA)||env.MIP_QIK_EXPECTED_RELEASE_SHA!==env.MIP_QIK_RELEASE_SHA
   ||(env.GITHUB_SHA&&env.GITHUB_SHA!==env.MIP_QIK_RELEASE_SHA)
   ||(env.GITHUB_RUN_ATTEMPT&&env.GITHUB_RUN_ATTEMPT!=='1')
   ||(env.CLOUD_RUN_TASK_COUNT&&env.CLOUD_RUN_TASK_COUNT!=='1')
   ||(env.CLOUD_RUN_TASK_INDEX&&env.CLOUD_RUN_TASK_INDEX!=='0')
   ||(env.CLOUD_RUN_TASK_ATTEMPT&&env.CLOUD_RUN_TASK_ATTEMPT!=='0'))
   refused()
 const runId=env.MIP_QIK_NATIVE_RUN_ID,login=env.MIP_QIK_NATIVE_LOGIN
 if(typeof runId!=='string'||!/^qik-host-[a-zA-Z0-9_-]{1,100}$/.test(runId)
   ||typeof login!=='string'||!/^cnc_[a-f0-9]{32}_collector$/.test(login)
   ||typeof env.MIP_QIK_NATIVE_DATABASE_URL!=='string'
   ||typeof env.MIP_QIK_INGEST_RUN_KEY!=='string'
   ||env.MIP_QIK_INGEST_RUN_KEY.length<32||env.MIP_QIK_INGEST_RUN_KEY.length>256)
   refused()
 let url
 try{url=new URL(env.MIP_QIK_NATIVE_DATABASE_URL)}catch{refused()}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.pathname!=='/postgres'
   ||url.username!==login+'.qikvmopbtijoebdqosyq'||url.port!=='5432'
   ||url.hostname!=='aws-0-us-west-1.pooler.supabase.com'
   ||env.MIP_QIK_NATIVE_SESSION_POOLER_HOST!==url.hostname) {
   if(!disposable)refused()
 }
 if(!disposable){
   if(!env.NODE_EXTRA_CA_CERTS)refused()
   let digest
   try{digest=createHash('sha256').update(readFileSync(env.NODE_EXTRA_CA_CERTS)).digest('hex')}catch{refused()}
   if(digest!==QIK_CA_SHA256)refused()
 }
 return Object.freeze({
   connectionString:env.MIP_QIK_NATIVE_DATABASE_URL,
   token:env.MIP_QIK_INGEST_RUN_KEY,
   expectedLogin:login,runId,
   allowedFeedUrls:[source.feedUrl],
   sessionPoolerHost:disposable?null:url.hostname,
   disposable,
   assertPlan:plan=>assertExactSourcePlan(plan,source),
 })
}

export async function runOperationalHost({env=process.env,source,disposable=false,
  runNativeHostImpl=runNativeHost}={}){
 let config
 try{config=validateOperationalConfig(env,{source,disposable})}
 catch{return {state:'operational_host_configuration_refused',needs_reconciliation:false,connection_closed:true}}
 try{
   const result=await runNativeHostImpl(config)
   if(!result||typeof result.state!=='string')
     return {state:'operational_host_ambiguous',needs_reconciliation:true,connection_closed:false}
   return result
 }catch{
   return {state:'operational_host_ambiguous',needs_reconciliation:true,connection_closed:false}
 }
}
