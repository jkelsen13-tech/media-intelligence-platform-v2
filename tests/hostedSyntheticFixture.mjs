import {webcrypto} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {qikWorkerHost} from '../supabase/functions/source-comparison-generation-candidate/host.js'
import {
 DISPOSABLE_IMPLEMENTATION,DISPOSABLE_PRINCIPAL,DISPOSABLE_RUNTIME,shapeWorkerJwt
} from '../supabase/qualification/hosted-synthetic/60_disposable_credential_session.mjs'
import {
 HOSTED_SYNTHETIC_INSTALL,cleanupHostedSynthetic,installHostedSynthetic,
 recoverPublicSourceWindow,stripOuterTransaction
} from '../supabase/qualification/hosted-synthetic/installHostedSynthetic.mjs'
import {readFile} from 'node:fs/promises'

const repo=p=>readFile(new URL('../'+p,import.meta.url),'utf8')

export {HOSTED_SYNTHETIC_INSTALL,cleanupHostedSynthetic as cleanupPackage,
 installHostedSynthetic,recoverPublicSourceWindow,stripOuterTransaction}

export const LIVE_EVENT_ID='ffffffff-ffff-4fff-8fff-ffffffffffff'
export const LIVE_ARTICLE_A='ffffffff-ffff-4fff-8fff-ffffffffff01'
export const LIVE_ARTICLE_B='ffffffff-ffff-4fff-8fff-ffffffffff02'
export const LIVE_MARKER='LIVE ROW MUST NOT APPEAR IN SNAPSHOT'
export const INVOKE_TOKEN='synthetic-invoke'
export const QIK_REF='qikvmopbtijoebdqosyq'
export const INDEX_ENV_NAMES=Object.freeze([
 'MIP_QIK_WORKER_RPC_URL','MIP_QIK_PUBLISHABLE_KEY','MIP_QIK_WORKER_JWT',
 'MIP_QIK_WORKER_INVOKE_TOKEN','MIP_QIK_WORKER_SESSION','MIP_QIK_WORKER_RUNTIME',
 'MIP_QIK_WORKER_IMPLEMENTATION'])

export const PUBLIC_SOURCE_RELATIONS=Object.freeze([
 'events','event_articles','articles','pipeline_config'])
export const SYNTHETIC_RELATIONS=Object.freeze([
 'synthetic_events','synthetic_articles','synthetic_event_articles','synthetic_pipeline_config'])
export const PACKAGE_ROLES=Object.freeze([
 'mip_kernel_owner_v2','mip_comparison_worker_v1','mip_comparison_producer_v1',
 'mip_identity_broker_v2','service_role','anon','authenticated'])

const WORKER_RPC=Object.freeze({
 worker_claim:{sql:'select mip_identity.worker_claim($1::uuid,$2::uuid,$3) result',
  keys:['p_request','p_session','p_runtime']},
 worker_complete:{sql:'select mip_identity.worker_complete($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,$7,$8::jsonb) result',
  keys:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation','p_output']},
 worker_fail:{sql:'select mip_identity.worker_fail($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,$7) result',
  keys:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation']},
 worker_journal_put:{sql:'select mip_identity.worker_journal_put($1::uuid,$2,$3,$4::jsonb) result',
  keys:['p_session','p_runtime','p_key','p_entry']},
 worker_journal_get:{sql:'select mip_identity.worker_journal_get($1::uuid,$2,$3) result',
  keys:['p_session','p_runtime','p_key']},
 worker_journal_pending:{sql:'select mip_identity.worker_journal_pending($1::uuid,$2,$3,$4::int) result',
  keys:['p_session','p_runtime','p_after','p_limit']},
 worker_resume_claim:{sql:'select mip_identity.worker_resume_claim($1::uuid,$2,$3) result',
  keys:['p_session','p_runtime','p_key']}
})

export async function createHostedSyntheticDb(t){
 const db=await PGlite.create()
 t.after(()=>db.close())
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
 return db
}

export async function stubPublicSource(db){
 await db.exec(`
create table public.events (
 id uuid primary key,canonical_title text,status text,comparison_validation_state text,
 occurred_at_start date,occurred_at_end date
);
create table public.articles (
 id uuid primary key,outlet text,title text,url text,summary text,body_text text,
 published_at timestamptz,claims jsonb,embedding text,unattributed boolean,monoculture boolean,is_digest boolean
);
create table public.event_articles (
 event_id uuid references public.events(id),
 article_id uuid references public.articles(id),
 membership_method text,membership_confidence numeric,created_at timestamptz,
 primary key(event_id,article_id)
);
create table public.pipeline_config (key text primary key,value jsonb,updated_at timestamptz);
insert into public.events values
 ('${LIVE_EVENT_ID}','${LIVE_MARKER}','active','approved','2026-06-01','2026-06-01');
insert into public.articles(id,outlet,title,summary,published_at,claims) values
 ('${LIVE_ARTICLE_A}','Live Outlet A','${LIVE_MARKER}','${LIVE_MARKER}','2026-06-01 00:00:00+00','{"live":true}'),
 ('${LIVE_ARTICLE_B}','Live Outlet B','${LIVE_MARKER}','${LIVE_MARKER}','2026-06-01 00:00:01+00','{"live":true}');
insert into public.event_articles values
 ('${LIVE_EVENT_ID}','${LIVE_ARTICLE_A}','live',0.5,'2026-06-01 00:00:00+00'),
 ('${LIVE_EVENT_ID}','${LIVE_ARTICLE_B}','live',0.5,'2026-06-01 00:00:01+00');
insert into public.pipeline_config values ('claim_group_confidence_floor','0.99','2026-06-01 00:00:00+00');
`)
}

export async function privilege(db,role,rel,priv='SELECT'){
 const r=await db.query('select has_table_privilege($1,$2,$3) ok',[role,rel,priv])
 return r.rows[0].ok===true
}

export async function columnPrivilege(db,role,rel,col,priv='SELECT'){
 const r=await db.query('select has_column_privilege($1,$2,$3,$4) ok',[role,rel,col,priv])
 return r.rows[0].ok===true
}

export async function functionExecute(db,role,sig){
 const r=await db.query('select has_function_privilege($1,$2::text,$3) ok',[role,sig,'EXECUTE'])
 return r.rows[0].ok===true
}

function bind(value){
 if(value===undefined)return null
 if(value!==null&&typeof value==='object')return JSON.stringify(value)
 return value
}

export function workerFetchImpl(db,{onCall}={}){
 return async(url,options)=>{
  const name=new URL(url).pathname.split('/').at(-1)
  const spec=WORKER_RPC[name]
  if(!spec)return new Response(JSON.stringify({state:'rpc_denied'}),{status:400})
  const args=JSON.parse(options.body)
  if(onCall)onCall({name,args,headers:options.headers})
  await db.exec('set role mip_comparison_worker_v1')
  try{
   const result=(await db.query(spec.sql,spec.keys.map(k=>bind(args[k])))).rows[0].result
   return new Response(JSON.stringify(result??null),{status:200,
    headers:{'content-type':'application/json'}})
  }catch{
   return new Response(JSON.stringify({state:'rpc_refused'}),{status:400})
  }finally{await db.exec('reset role')}
 }
}

export function hostedSyntheticHost(db,{session,fetchImpl,invokeToken=INVOKE_TOKEN}={}){
 return qikWorkerHost({
  rpcUrl:'https://qualification.invalid/rest/v1/rpc/',
  apiKey:'sb_publishable_synthetic',
  workerJwt:shapeWorkerJwt(DISPOSABLE_PRINCIPAL),
  invokeToken,
  session,
  runtime:DISPOSABLE_RUNTIME,
  implementation:DISPOSABLE_IMPLEMENTATION,
  cryptoImpl:webcrypto,
  fetchImpl:fetchImpl??workerFetchImpl(db)
 })
}

export function emptyInvoke(token=INVOKE_TOKEN){
 return new Request('https://qualification.invalid/worker',{
  method:'POST',headers:{authorization:'Bearer '+token}})
}

export async function loadSql(path){
 return repo(path)
}
