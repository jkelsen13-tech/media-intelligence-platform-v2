import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { installLegacyAtomicCompletionFixture } from '../scripts/legacyAtomicCompletionPackage.mjs'

const handler = new URL('../supabase/functions/backfill-legacy/index.ts',import.meta.url)
const source = await readFile(handler,'utf8')
const compiled = await build({stdin:{contents:source+'\nexport {extractBatch};\n',resolveDir:new URL('../supabase/functions/backfill-legacy/',import.meta.url).pathname,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,
 plugins:[{name:'no-live-entrypoint',setup(b){b.onResolve({filter:/^https:/},()=>({path:'sdk',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=()=>{throw Error("live entrypoint prohibited")}',loader:'js'}))}}]})
const before=globalThis.Deno;globalThis.Deno={env:{get:()=>undefined},serve(){}}
let actual
try{actual=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)}finally{if(before===undefined)delete globalThis.Deno;else globalThis.Deno=before}
export const EXTRACTOR='legacy-pure-candidates-v1'
export const SENTINEL='Read-only reference import: public source metadata only. No original body text, embeddings, entities, claims, or relationship data were copied.'

export async function atomicFixture({install=true,onComplete=null,rawBody='Alice Smith announced the <b>fictional</b> harbor update in a court filing.'}={}){
 const f=await createReviewedVersionFixture(),requests=[]
 await f.db.exec(`alter table articles add column image_url text,add column image_alt text,add column entities_extracted_at timestamptz;
 create table public.article_entities(article_id uuid not null references articles(id),entity_id uuid not null references entities(id),confidence numeric not null default 0.5,extraction_method text not null default 'heuristic',role text,primary key(article_id,entity_id));`)
 await f.db.exec(await readFile(new URL('../supabase/migrations/20260906042413_evidence_change_queue_v1.sql',import.meta.url),'utf8'))
 const pending=await f.scalar("insert into articles(feed,outlet,title,url,summary,body_text,ingestion_run_id) values('synthetic','Synthetic legacy','Alice Smith recorded a fictional harbor event.','https://legacy-atomic.example.invalid/source',$1,$1,'fixture-scoped') returning id",[rawBody])
 const entity=await f.scalar("insert into entities(canonical_name,normalized_name,entity_type) values('Alice Smith','alice smith','person') returning id")
 await f.db.query("insert into article_entities(article_id,entity_id) values($1,$2)",[pending,entity])
 await f.db.query("insert into citations(article_id,cited_entity,cited_type,documentation_strength) values($1,'Existing explicit citation','agency_release',1)",[pending])
 if(install)await installLegacyAtomicCompletionFixture(f.db)
 const roleCall=async(role,sql,params=[])=>{
  assert.ok(['service_role','anon','authenticated','postgres'].includes(role));await f.db.exec(`begin;set local role ${role}`)
  try{const result=await f.scalar(sql,params);await f.db.exec('commit');return result}catch(e){await f.db.exec('rollback');throw e}
 }
 let injected=false
 // Actual installed SDK -> bounded request adapter -> real PostgreSQL functions.
 // This is not PostgREST/JWT or independent multi-session qualification.
 const forRole=role=>async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  const payload=await request.json(),rpc=url.pathname.split('/').at(-1)
  requests.push({role,method:request.method,path:url.pathname,rpc,payload})
  const headers={'content-type':'application/json'}
  try{
   assert.equal(request.method,'POST');assert.ok(url.pathname.includes('/rpc/'));assert.equal(rpc,'mip_legacy_extraction_v1','handler must issue no table writes or alternate owner calls')
   if(onComplete&&!injected&&payload.p_action==='complete_private'){injected=true;await onComplete({ ...f,pending,entity,payload })}
   const result=await roleCall(role,'select public.mip_legacy_extraction_v1($1,$2::jsonb)',[payload.p_action,JSON.stringify(payload.p_input)])
   return new Response(JSON.stringify(result),{headers})
  }catch(e){return new Response(JSON.stringify({code:e.code??'fixture_error',message:e.message}),{status:e.code==='42501'?403:400,headers})}
 }
 const client=createClient('https://legacy-atomic.example.invalid','sb_publishable_fixture',{accessToken:async()=> 'fixture-service',global:{fetch:forRole('service_role')},realtime:{transport:class{constructor(){throw Error('fixture websocket forbidden')}}}})
 const run=async(runTag='fixture-scoped')=>{
  const report={entitiesResolved:0,citations:0,extracted:0,digests:0,errors:[]};let resolverCalls=0
  const prior=globalThis.Deno;globalThis.Deno={env:{get:()=>undefined},serve(){}}
  try{const more=await actual.extractBatch(client,{resolve(){resolverCalls++;throw Error('shared resolution forbidden')}},new Set(),{},report,runTag);return{more,report,resolverCalls}}
  finally{if(prior===undefined)delete globalThis.Deno;else globalThis.Deno=prior}
 }
 const state=async()=>({articles:(await f.db.query('select * from articles order by id')).rows,entities:(await f.db.query('select * from entities order by id')).rows,
 citations:(await f.db.query('select * from citations order by id')).rows,links:(await f.db.query('select * from article_entities order by article_id,entity_id')).rows})
 const counts=async()=>{
  const result={};for(const table of ['evidence_pipeline.import_jobs','evidence_pipeline.import_receipts','evidence_pipeline.job_events','evidence_pipeline.article_captures','evidence_pipeline.evidence_changes','evidence_pipeline.change_jobs','mip_private.legacy_extraction_completions','mip_private.legacy_reviewed_completions'])result[table]=await f.scalar(`select count(*)::int from ${table}`)
  return result
 }
 const selection=async(article=pending)=>{const data=await roleCall('service_role',"select public.mip_legacy_extraction_v1('read_pending',$1::jsonb)",[JSON.stringify({run_tag:null,limit:25,extractor_version:EXTRACTOR})]);return data.articles.find(a=>a.id===article)}
 return{...f,pending,entity,requests,roleCall,client,run,state,counts,selection,close:()=>f.db.close()}
}
