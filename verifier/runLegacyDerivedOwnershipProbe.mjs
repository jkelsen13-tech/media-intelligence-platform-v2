import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { createNewsBackend } from '../src/lib/newsBackend.js'

const ARTICLE = '10000000-0000-4000-8000-000000000011'
const ALICE = '20000000-0000-4000-8000-000000000011'
const SOURCE_URL = 'https://derived-owner.example.invalid/source'
const SUMMARY = 'Alice Smith announced the <b>fictional</b> harbor update in a court filing.'
const SENTINEL = 'Read-only reference import: public source metadata only. No original body text, embeddings, entities, claims, or relationship data were copied.'
const LEGACY = new URL('../supabase/functions/backfill-legacy/index.ts', import.meta.url)
const identifier = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/i); return `"${value}"` }
const hash = value => createHash('sha256').update(value).digest('hex')
const digestArticle = article => hash(JSON.stringify({ title:article.title,summary:article.summary,body_text:article.body_text,source_status:article.source_status }))

async function actualExtractor() {
  const source=await readFile(LEGACY,'utf8')
  const compiled=await build({stdin:{contents:source+'\nexport {extractBatch,EntityResolver};\n',resolveDir:new URL('../supabase/functions/backfill-legacy/',import.meta.url).pathname,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,
    plugins:[{name:'no-live-entrypoint',setup(b){b.onResolve({filter:/^https:/},()=>({path:'sdk',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=()=>{throw Error("live entrypoint prohibited")}',loader:'js'}))}}]})
  const prior=globalThis.Deno
  globalThis.Deno={env:{get:()=>undefined},serve(){}}
  try {return {module:await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`),source_sha256:hash(source)}}
  finally {if(prior===undefined)delete globalThis.Deno;else globalThis.Deno=prior}
}

// SDK request translator, not PostgREST/JWT or independent session qualification.
// Every request commits before the next. Explicit fixture promotion is inserted
// after positive source UPDATE RETURNING, before the next derived mutation.
async function fixture({writer='postgres',body=SUMMARY,promotion=false,sourceRevisionRace=false}={}) {
  const db=await PGlite.create(),requests=[],executed=[],events=[]
  await applyFoundation(db)
  await db.exec(`alter table articles add column entities_extracted_at timestamptz,add column image_url text,add column image_alt text,add column arc_assign_attempted_at timestamptz,add column source_status_changed_at timestamptz,add column source_status_note text;

    create table public.article_entities(article_id uuid not null references articles(id),entity_id uuid not null references entities(id),confidence numeric not null default 0.5,extraction_method text not null default 'heuristic',role text,primary key(article_id,entity_id));
    create table public.fixture_status_invalidations(article_id uuid);
    create function public.fixture_source_change_clause() returns trigger language plpgsql as $$begin
      if new.source_status is not distinct from old.source_status or new.source_status not in ('corrected','withdrawn') then return new;end if;
      insert into public.fixture_status_invalidations values(new.id);return new;
    end$$;
    create trigger zz_factual_source_change before update on articles for each row execute function public.fixture_source_change_clause();`)
  await db.query("insert into articles(id,feed,outlet,title,url,summary,body_text,reader_state) values($1,'fixture','Synthetic Publisher','Alice Smith announced the fictional harbor update.',$2,$3,$4,'pending_review')",[ARTICLE,SOURCE_URL,SUMMARY,body])
  await db.query("insert into entities(id,canonical_name,normalized_name,entity_type) values($1,'Alice Smith','alice smith','person')",[ALICE])
  await db.query("insert into article_entities(article_id,entity_id,confidence) values($1,$2,0.95)",[ARTICLE,ALICE])
  await db.query("insert into citations(article_id,cited_entity,cited_type,documentation_strength) values($1,'Explicit fixture prior citation','agency_release',1)",[ARTICLE])
  const rpc=async (action,input={})=>(await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result
  const job=await rpc('enqueue',{run_id:'legacy-derived-fixture',article:{url:SOURCE_URL,title:'Alice Smith announced the fictional harbor update.',outlet:'Synthetic Publisher',summary:SUMMARY,body_text:body}})
  const reserved=await rpc('claim'),finished=await rpc('finish',{job_id:job,lease_token:reserved.lease_token})
  const capture=(await db.query('select * from evidence_pipeline.article_captures where id=$1',[finished.capture_id])).rows[0]
  let tail=Promise.resolve(),positiveSource=false,promoted=false,revisionInjected=false,patchCount=0
  const transaction=(role,work)=>{
    const pending=tail.then(async()=>{await db.exec(`begin;set local role ${identifier(role)}`);try{const result=await work();await db.exec('commit');return result}catch(e){await db.exec('rollback');throw e}})
    tail=pending.catch(()=>{});return pending
  }
  const query=(role,sql,params=[])=>{executed.push({role,sql,params});return db.query(sql,params)}
  const currentArticle=async()=>(await db.query('select * from articles where id=$1',[ARTICLE])).rows[0]
  let atPromotion=null,reader=null
  const forRole=role=>async(input,init)=>{
    const request=new Request(input,init),url=new globalThis.URL(request.url),table=url.pathname.split('/').at(-1),params=url.searchParams
    const payload=['PATCH','POST'].includes(request.method)?await request.json():null
    requests.push({role,method:request.method,table,filters:Object.fromEntries(params),payload})
    const headers={'content-type':'application/json'}
    try {
      if(table==='articles'&&request.method==='PATCH'){
        patchCount++
        if(sourceRevisionRace&&!revisionInjected){
          revisionInjected=true;await db.query("update articles set title='Synthetic later pending revision',summary='Synthetic later pending revision.',body_text='Synthetic later pending body.' where id=$1",[ARTICLE])
          events.push({kind:'fixture_pending_revision_after_selection',source_hash:digestArticle(await currentArticle())})
        }
      }
      if(promotion&&positiveSource&&!promoted&&table!=='articles'&&['PATCH','POST','DELETE'].includes(request.method)){
        promoted=true
        const before=await currentArticle()
        await db.query("update articles set reader_state='eligible' where id=$1",[ARTICLE])
        const article=await currentArticle(),version=(await db.query("select ordinal,payload from evidence_pipeline.record_versions where record_kind='article' and record_key=$1 order by ordinal desc limit 1",[ARTICLE])).rows[0]
        atPromotion={article,source_hash:digestArticle(article),record_ordinal:version.ordinal,prior_citations:(await reader.loadArticleDetail(ARTICLE)).citations}
        assert.equal(digestArticle(before),atPromotion.source_hash)
        events.push({kind:'explicit_fixture_admin_promotion_after_committed_source_returning',next_derived_table:table,next_derived_method:request.method,source_hash:atPromotion.source_hash,record_ordinal:version.ordinal})
      }
      const response=await transaction(role,async()=>{
        if(url.pathname.includes('/rpc/')){
          const rpcNames={mip_pipeline_v1:['select public.mip_pipeline_v1($1,$2::jsonb) result',[payload.p_action,JSON.stringify(payload.p_input??{})]],mip_legacy_graph_v1:['select public.mip_legacy_graph_v1($1,$2::jsonb) result',[payload.p_action,JSON.stringify(payload.p_input??{})]],mip_evidence_changes_v1:['select public.mip_evidence_changes_v1($1,$2::jsonb) result',[payload.p_action,JSON.stringify(payload.p_input??{})]],mip_v2_ingestion_write_batch:['select public.mip_v2_ingestion_write_batch($1,$2,$3,$4::jsonb,$5) result',[payload.p_run_id,payload.p_source_key,payload.p_batch_number,JSON.stringify(payload.p_actions),payload.p_writer_key]],mip_v2_ingestion_begin_run:['select public.mip_v2_ingestion_begin_run($1,$2,$3::timestamptz,$4::timestamptz,$5,$6,$7) result',[payload.p_run_id,payload.p_mode,payload.p_window_start,payload.p_window_end,payload.p_algorithm_version,payload.p_model_id,payload.p_writer_key]]}
          const route=rpcNames[table];assert.ok(route,'bounded fixture RPC');const result=await query(role,...route)
          return new Response(JSON.stringify(result.rows[0].result),{headers})
        }
        assert.ok(['articles','entities','article_entities','citations','news_detail_public','authors_public'].includes(table))
        const values=[],filters=[]
        for(const [field,value]of params){
          if(['select','order','offset','limit','on_conflict','columns'].includes(field))continue
          if(field==='or'){assert.equal(value,'(reader_state.neq.eligible,source_status.neq.active)');filters.push("(reader_state<>'eligible' or source_status<>'active')");continue}
          if(value==='is.null'){filters.push(`${identifier(field)} is null`);continue}
          if(value.startsWith('in.')){const items=value.slice(4,-1).split(',').map(x=>x.replace(/^"|"$/g,''));filters.push(`${identifier(field)} in (${items.map(x=>{values.push(x);return '$'+values.length}).join(',')})`);continue}
          assert.ok(value.startsWith('eq.'));values.push(value.slice(3));filters.push(`${identifier(field)}=$${values.length}`)
        }
        const where=filters.length?' where '+filters.join(' and '):'',selected=params.get('select')?.split(',').map(x=>identifier(x.trim())).join(',')??'*'
        let rows
        if(request.method==='GET'){
          const order=(params.get('order')??'').split(',').filter(Boolean).map(x=>{const[field,dir='asc',nulls]=x.split('.');assert.ok(['asc','desc'].includes(dir));return`${identifier(field)} ${dir}${nulls?' nulls '+(nulls==='nullslast'?'last':'first'):''}`}).join(',')
          const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??1000)
          assert.ok(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0)
          rows=(await query(role,`select ${selected} from public.${identifier(table)}${where}${order?' order by '+order:''} limit ${limit} offset ${offset}`,values)).rows
        }else if(request.method==='PATCH'){
          const set=Object.entries(payload).map(([field,value])=>{values.push(Array.isArray(value)&&field==='claims'?JSON.stringify(value):value);return`${identifier(field)}=$${values.length}`}).join(',')
          rows=(await query(role,`update public.${identifier(table)} set ${set}${where} returning ${selected}`,values)).rows
        }else if(request.method==='DELETE')rows=(await query(role,`delete from public.${identifier(table)}${where} returning *`,values)).rows
        else if(request.method==='POST'){
          const fields=Object.keys(payload),conflict=params.get('on_conflict')?.split(',').map(identifier)
          const sql=`insert into public.${identifier(table)}(${fields.map(identifier).join(',')}) values(${fields.map((_,i)=>'$'+(i+1)).join(',')})${conflict?' on conflict('+conflict.join(',')+') do update set '+fields.map(field=>`${identifier(field)}=excluded.${identifier(field)}`).join(','):''} returning ${selected}`
          rows=(await query(role,sql,Object.values(payload))).rows
        }else throw Error('unsupported fixture method')
        headers['content-range']=`0-${Math.max(0,rows.length-1)}/${rows.length}`
        const single=request.headers.get('accept')?.includes('vnd.pgrst.object')
        if(single&&rows.length!==1)return new Response(JSON.stringify({code:'PGRST116',message:'No row',details:`The result contains ${rows.length} rows`}),{status:406,headers})
        if(table==='articles'&&request.method==='PATCH'&&rows.length>0&&patchCount===1){positiveSource=true;events.push({kind:'committed_positive_source_returning',writer:role,returned_ids:rows.map(row=>row.id)})}
        return new Response(JSON.stringify(single?rows[0]:rows),{headers})
      })
      return response
    }catch(error){return new Response(JSON.stringify({code:error.code??'fixture_transport_error',message:error.message}),{status:error.code==='42501'?403:400,headers})}
  }
  const clients=Object.fromEntries(['postgres','service_role','anon'].map(role=>[role,createClient('https://legacy-derived.example.invalid','sb_publishable_fixture',{accessToken:async()=>`fixture-${role}`,global:{fetch:forRole(role)},realtime:{transport:class{constructor(){throw Error('fixture websocket forbidden')}}}})]))
  reader=createNewsBackend(clients.anon)
  return {db,clients,client:clients[writer],reader,requests,executed,events,capture,currentArticle,get atPromotion(){return atPromotion},close:()=>db.close()}
}

async function installNewUrlOwnerFixture(db){
  // Exact historical new-URL writer body; synthetic prerequisites and synthetic
  // credential replace deployment/activation evidence. No live installation.
  const definition=await readFile(new URL('../supabase/migrations/20260819_provenance_first_ingestion_pipeline.sql',import.meta.url),'utf8')
  for(const name of ['ingestion_runs','ingestion_checkpoints','article_extraction_results']){
    const start=definition.indexOf(`create table if not exists public.${name} (`),end=definition.indexOf('\n);',start)
    assert.ok(start>=0&&end>start);await db.exec(definition.slice(start,end+3))
  }
  const uniqueStart=definition.indexOf('create unique index if not exists cross_surface_candidates_dedupe_idx')
  assert.ok(uniqueStart>=0);await db.exec(definition.slice(uniqueStart,definition.indexOf(';',uniqueStart)+1))
  await db.exec(`alter table ingestion_sources add column if not exists active boolean not null default false;
    create unique index fixture_citation_new_url_owner_key on citations(article_id,cited_entity,cited_type);
    create function public.digest(input text,algorithm text) returns bytea language plpgsql immutable as $$begin
      if algorithm<>'sha256' then raise exception 'fixture supports sha256 only';end if;return sha256(convert_to(input,'UTF8'));end$$;`)
  const writer=await readFile(new URL('../supabase/migrations/20260819_authenticated_ingestion_writer.sql',import.meta.url),'utf8')
  await db.exec(writer)
  const key='synthetic-one-purpose-writer-key-000000000000'
  await db.query("insert into ingestion_writer_credentials(id,key_hash,active) values(1,$1,true)",[hash(key)])
  await db.query("insert into ingestion_sources(source_key,label,source_url,source_type,active) values('fixture-source','Synthetic source','https://source.example.invalid','rss',true)")
  return key
}

export async function runLegacyDerivedOwnershipProbe({receiptPath}={}){
  const actual=await actualExtractor(),cases=[]
  const check=async(name,options,work)=>{const f=await fixture(options);try{const result=await work(f);cases.push({name,status:'PASS',...result,requests:f.requests,executed_sql:f.executed,events:f.events})}finally{await f.close()}}
  const extract=async f=>{
    const resolver=new actual.module.EntityResolver({});await resolver.load(f.client)
    const report={entitiesResolved:0,citations:0,extracted:0,errors:[]}
    const previous=globalThis.Deno;globalThis.Deno={env:{get:()=>undefined},serve(){}}
    try{await actual.module.extractBatch(f.client,resolver,new Set(),{},report)}finally{if(previous===undefined)delete globalThis.Deno;else globalThis.Deno=previous}
    return report
  }
  await check('regular extraction: approval after source RETURNING permits later entity and reader-presented citation mutation',{promotion:true},async f=>{
    const report=await extract(f);assert.equal(report.errors.length,0);assert.equal(report.extracted,0);assert.equal(report.reviewedSourceSkipped,1)
    assert.ok(f.atPromotion);assert.equal(f.atPromotion.prior_citations[0].cited_entity,'Explicit fixture prior citation')
    const after=await f.currentArticle(),detail=await f.reader.loadArticleDetail(ARTICLE)
    assert.equal(after.reader_state,'eligible');assert.equal(after.entities_extracted_at,null);assert.equal(digestArticle(after),f.atPromotion.source_hash)
    assert.ok(detail.citations.some(row=>row.cited_type==='court_doc'));assert.ok(!detail.citations.some(row=>row.cited_entity==='Explicit fixture prior citation'))
    assert.ok((await f.db.query('select mention_count from entities where id=$1',[ALICE])).rows[0].mention_count>0)
    assert.equal((await f.db.query('select count(*)::int n from fixture_status_invalidations')).rows[0].n,0)
    const cap=(await f.db.query('select content_hash,payload from evidence_pipeline.article_captures where id=$1',[f.capture.id])).rows[0]
    assert.equal(cap.content_hash,f.capture.content_hash);assert.equal(cap.payload.body_text,SUMMARY)
    return {gate:'GAP_REPRODUCED',writer_authority:'isolated postgres fixture; not current service_role',report,at_approval:f.atPromotion,after_reader_citations:detail.citations,source_unchanged_after_approval:true,capture_hash:cap.content_hash,completion_refused:true}
  })
  await check('metadata sentinel: approval after positive source write precedes public citation/link deletion',{promotion:true,body:SENTINEL},async f=>{
    const report=await extract(f);assert.equal(report.errors.length,0);assert.equal(report.reviewedSourceSkipped,1);assert.ok(f.atPromotion)
    const detail=await f.reader.loadArticleDetail(ARTICLE);assert.equal(f.atPromotion.prior_citations.length,1);assert.deepEqual(detail.citations,[])
    assert.equal((await f.db.query('select count(*)::int n from article_entities where article_id=$1',[ARTICLE])).rows[0].n,0)
    assert.equal(digestArticle(await f.currentArticle()),f.atPromotion.source_hash)
    return {gate:'GAP_REPRODUCED',report,at_approval:f.atPromotion,after_reader_citations:detail.citations,derived_deletions_after_approval:true,completion_refused:true}
  })
  await check('current service-role article UPDATE denial prevents all per-article derived mutations',{writer:'service_role',promotion:true},async f=>{
    const before=await f.currentArticle()
    await f.db.exec('begin;set local role service_role')
    try {await assert.rejects(f.db.query('select id from public.articles where id=$1 for update',[ARTICLE]),e=>e.code==='42501')}
    finally {await f.db.exec('rollback')}
    const report=await extract(f);assert.equal(report.errors.length,1);assert.equal(report.extracted,0)
    assert.equal(f.atPromotion,null);assert.deepEqual(await f.currentArticle(),before)
    assert.ok(!f.requests.some(r=>r.table!=='articles'&&['PATCH','POST','DELETE'].includes(r.method)))
    assert.equal((await f.db.query('select mention_count from entities where id=$1',[ALICE])).rows[0].mention_count,0)
    assert.equal((await f.reader.loadArticleDetail(ARTICLE)).articleMissing,true)
    return {gate:'DENIED_CONTROL',report,derived_writes:0,article_for_update_denied:true,source_authority:'actual restored service_role grants, not a clone of live ACLs'}
  })
  await check('ordinary pending control completes extraction privately with the actual resolver',{},async f=>{
    const report=await extract(f);assert.equal(report.errors.length,0);assert.equal(report.extracted,1);assert.ok(report.entitiesResolved>0);assert.ok(report.citations>0)
    assert.equal((await f.currentArticle()).reader_state,'pending_review');assert.ok((await f.currentArticle()).entities_extracted_at)
    assert.equal((await f.reader.loadArticleDetail(ARTICLE)).articleMissing,true)
    return {gate:'PENDING_CONTROL',report,public_reader_missing:true}
  })
  await check('state guard does not bind a pending write to its selected source/capture revision',{sourceRevisionRace:true},async f=>{
    const report=await extract(f),after=await f.currentArticle();assert.equal(report.errors.length,0);assert.equal(report.extracted,1)
    assert.equal(after.title,'Synthetic later pending revision');assert.equal(after.body_text,SUMMARY.replace(/<\/?b>/g,''));assert.notEqual(after.summary,'Synthetic later pending revision.')
    assert.equal((await f.reader.loadArticleDetail(ARTICLE)).articleMissing,true)
    assert.equal((await f.db.query('select count(*)::int n from evidence_pipeline.article_captures where article_id=$1',[ARTICLE])).rows[0].n,1)
    return {gate:'SOURCE_VERSION_GAP_REPRODUCED',report,current_source_hash:digestArticle(after),retained_capture_hash:f.capture.content_hash,field_mixture:'newer pending title plus stale selected summary/body',public_reader_missing:true}
  })
  await check('existing native and private staging owners refuse legacy derived-write operations',{},async f=>{
    const before=(await f.db.query('select to_jsonb(a) row from articles a where id=$1',[ARTICLE])).rows[0].row
    const legacy={article_id:ARTICLE,capture_id:f.capture.id,citations:[{cited_entity:'attempted derived replacement'}],entities:[{canonical_name:'attempted new identity'}]}
    for(const rpc of ['mip_pipeline_v1','mip_legacy_graph_v1']){
      const result=await f.clients.service_role.rpc(rpc,{p_action:'legacy_commit',p_input:legacy});assert.ok(result.error);assert.match(result.error.message,/unsupported/)
    }
    const candidate=await f.clients.service_role.rpc('mip_pipeline_v1',{p_action:'candidate',p_input:{capture_id:f.capture.id,candidate_key:'legacy-invalid-derivatives',candidate_kind:'claim',statement:'Synthetic statement.',source_field:'summary',span_start:0,span_end:11,excerpt:'Alice Smith',extractor_version:'synthetic',remaining_uncertainty:'Fixture only.',citations:legacy.citations}})
    assert.match(candidate.error?.message??'',/unsupported candidate field/)
    const publish=await f.clients.service_role.rpc('mip_legacy_graph_v1',{p_action:'publish',p_input:legacy});assert.match(publish.error?.message??'',/publication is not implemented/)
    assert.deepEqual((await f.db.query('select to_jsonb(a) row from articles a where id=$1',[ARTICLE])).rows[0].row,before)
    assert.equal((await f.db.query('select cited_entity from citations where article_id=$1',[ARTICLE])).rows[0].cited_entity,'Explicit fixture prior citation')
    await f.db.query("update articles set reader_state='eligible' where id=$1",[ARTICLE])
    const eligible=await f.currentArticle()
    const enqueue=await f.clients.service_role.rpc('mip_pipeline_v1',{p_action:'enqueue',p_input:{run_id:'native-correction-owner-control',article:{url:SOURCE_URL,title:'Synthetic pending native correction',outlet:'Synthetic Publisher',summary:'Synthetic correction remains pending.',body_text:'Synthetic correction remains pending.'}}})
    assert.equal(enqueue.error,null)
    const reserved=await f.clients.service_role.rpc('mip_pipeline_v1',{p_action:'claim',p_input:{}});assert.equal(reserved.error,null);assert.equal(reserved.data.id,enqueue.data)
    const finish=await f.clients.service_role.rpc('mip_pipeline_v1',{p_action:'finish',p_input:{job_id:reserved.data.id,lease_token:reserved.data.lease_token}})
    assert.equal(finish.error,null);assert.equal(finish.data.outcome,'revision_pending');assert.deepEqual(await f.currentArticle(),eligible)
    const correction=(await f.db.query('select review_state,payload from evidence_pipeline.article_captures where id=$1',[finish.data.capture_id])).rows[0]
    assert.equal(correction.review_state,'pending');assert.equal(correction.payload.title,'Synthetic pending native correction')
    assert.equal((await f.db.query('select cited_entity from citations where article_id=$1',[ARTICLE])).rows[0].cited_entity,'Explicit fixture prior citation')
    return {gate:'EXISTING_OWNER_SCOPE_PROVED',native_and_staging_reject_legacy_commit:true,private_candidate_rejects_citation_fields:true,no_existing_row_mutation:true,native_correction_retained_pending:true,previous_eligible_article_and_citations_preserved:true}
  })
  await check('durable change receipt owner records completion without owning legacy source/derived mutations',{},async f=>{
    await f.db.exec(await readFile(new URL('../supabase/migrations/20260906042413_evidence_change_queue_v1.sql',import.meta.url),'utf8'))
    const before=await f.currentArticle(),citations=(await f.db.query('select * from citations where article_id=$1',[ARTICLE])).rows
    const claim=await f.clients.service_role.rpc('mip_evidence_changes_v1',{p_action:'claim',p_input:{route:'dependency_lookup'}})
    assert.equal(claim.error,null);assert.ok(claim.data.id)
    const receipt={work_ref:'synthetic-scope-proof-only-no-source-work',coverage:'complete',legacy_commit:{article_id:ARTICLE,capture_id:f.capture.id,entities:[{canonical_name:'Not applied'}],citations:[{cited_entity:'Not applied'}]}}
    const finish=await f.clients.service_role.rpc('mip_evidence_changes_v1',{p_action:'finish',p_input:{job_id:claim.data.id,lease_token:claim.data.lease_token,receipt}})
    assert.equal(finish.error,null);assert.equal(finish.data,'completed')
    const recorded=(await f.db.query("select detail from evidence_pipeline.change_job_events where job_id=$1 and event='completed'",[claim.data.id])).rows[0].detail
    assert.deepEqual(recorded,receipt);assert.deepEqual(await f.currentArticle(),before)
    assert.deepEqual((await f.db.query('select * from citations where article_id=$1',[ARTICLE])).rows,citations)
    assert.equal((await f.db.query("select count(*)::int n from entities where canonical_name='Not applied'")).rows[0].n,0)
    return {gate:'EXISTING_RECEIPT_OWNER_SCOPE_PROVED',transport_receipt_recorded:true,source_or_child_work_executed:false,receipt_does_not_supply_atomic_legacy_owner:true}
  })
  await check('historical authenticated batch owner is atomic new-URL insertion, not existing-row/canonical-entity completion',{},async f=>{
    const key=await installNewUrlOwnerFixture(f.db)
    const begin=await f.clients.anon.rpc('mip_v2_ingestion_begin_run',{p_run_id:'synthetic-new-url-owner',p_mode:'backfill',p_window_start:null,p_window_end:null,p_algorithm_version:'synthetic',p_model_id:null,p_writer_key:key});assert.equal(begin.error,null)
    const action=url=>({article:{feed:'fixture',outlet:'Synthetic Publisher',title:'Synthetic batch supplied source',url,summary:'Synthetic new-URL owner supplied summary.',body_text:'Synthetic supplied source.',source_status:'active'},citations:[{cited_entity:'Synthetic batch citation',cited_type:'agency_release',documentation_strength:1}],entities:[{canonical_name:'Unsupported canonical identity'}]})
    const before=await f.currentArticle()
    const existing=await f.clients.anon.rpc('mip_v2_ingestion_write_batch',{p_run_id:'synthetic-new-url-owner',p_source_key:'fixture-source',p_batch_number:1,p_actions:[action(SOURCE_URL)],p_writer_key:key})
    assert.equal(existing.error,null);assert.equal(existing.data.inserted,0);assert.deepEqual(await f.currentArticle(),before)
    assert.equal((await f.db.query('select cited_entity from citations where article_id=$1',[ARTICLE])).rows[0].cited_entity,'Explicit fixture prior citation')
    const created=await f.clients.anon.rpc('mip_v2_ingestion_write_batch',{p_run_id:'synthetic-new-url-owner',p_source_key:'fixture-source',p_batch_number:2,p_actions:[action('https://batch-owner.example.invalid/new')],p_writer_key:key})
    assert.equal(created.error,null);assert.equal(created.data.inserted,1)
    const child=(await f.db.query("select a.id,a.reader_state,c.cited_entity from articles a join citations c on c.article_id=a.id where a.url='https://batch-owner.example.invalid/new'")).rows[0]
    assert.equal(child.reader_state,'pending_review');assert.equal(child.cited_entity,'Synthetic batch citation')
    assert.equal((await f.db.query("select count(*)::int n from entities where canonical_name='Unsupported canonical identity'")).rows[0].n,0)
    assert.equal((await f.reader.loadArticleDetail(child.id)).articleMissing,true)
    return {gate:'EXISTING_OWNER_SCOPE_PROVED',existing_url_inserted:0,existing_citation_unchanged:true,new_url_inserted:1,new_url_pending:true,canonical_entity_payload_ignored:true,fixture_prerequisites:'Synthetic active source/run/key; sha256-only digest compatibility function, not full crypto/deployed activation qualification'}
  })
  const sourceFiles=[LEGACY,new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',import.meta.url),new URL('../supabase/migrations/20260905203600_mip_legacy_graph_private_staging.sql',import.meta.url),new URL('../supabase/migrations/20260819_authenticated_ingestion_writer.sql',import.meta.url),new URL('../supabase/migrations/20260906042413_evidence_change_queue_v1.sql',import.meta.url),new URL(import.meta.url)]
  const receipt={status:'PROBE_PASS_CLOSURE_UNBOUND',base:'8f495ffe040adcb7c20d69fedfd269b948c5ea0b',live_operations:0,source_repair:false,legacy_reactivated:false,existing_guards_preserved:true,extractor_sha256:actual.source_sha256,cases,limits:['Explicit isolated postgres mutation authority; current service_role denial control included','Interleaved committed SDK statements, not independent PostgreSQL multi-session concurrency','Actual reader DTO demonstrates citation change after synthetic approval','Supplied unchanged-source-status trigger clause only, not full deployed function replay','No existing owner closes legacy existing-row/global-entity/capture-bound completion; no new RPC/trusted grant/publication policy introduced'],artifacts:await Promise.all(sourceFiles.map(async file=>({file:file.pathname,sha256:hash(await readFile(file))})))}
  if(receiptPath){await mkdir(dirname(receiptPath),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n')}
  return receipt
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const receipt=await runLegacyDerivedOwnershipProbe({receiptPath:process.argv[2]});console.log(JSON.stringify({status:receipt.status,live_operations:0,cases:receipt.cases.map(({name,status,gate,report})=>({name,status,gate,report}))},null,2))}
