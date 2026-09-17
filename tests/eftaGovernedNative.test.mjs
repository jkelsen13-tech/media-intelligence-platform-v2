import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {fixture} from './isolatedCandidateFixture.mjs'
import {eftaWorkspace} from '../src/lib/eftaWorkspace.js'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const manifest=JSON.parse(await read('verifier/efta-governed-demo/manifest.json'))
const root='supabase/qualification/mip-cutover-authority/'
async function setup(t){
 const f=await fixture(t,{extension:true}),db=f.db;
 for(const file of ['004_publication_staging.sql','005_broker_sessions.sql','006_collector_reconciliation.sql']) await db.exec(await read(root+file));
 await db.exec("insert into mip_identity.collector_config values(true,'source');alter table public.articles add column reader_state text;alter table public.articles add column source_status text;create role mip_factual_reviewer_v3;");
 for(const name of ['claims','article_claims','claim_evidence_links','claim_corrections','explanations','story_arcs','nodes','edges','arc_events','arc_milestones','arc_membership_candidates']) await db.exec('create table public.'+name+'(id uuid primary key,payload jsonb not null)');
 await db.exec(await read(root+'007_survivor_release.sql'));
 await db.exec('select mip_identity.install_survivor_fences()');
 await db.exec(`create schema evidence_pipeline;
 create table evidence_pipeline.article_captures(id uuid primary key,article_id uuid not null references public.articles,id_unused text,content_hash text not null,payload jsonb not null,captured_at timestamptz not null default clock_timestamp(),review_state text not null default 'pending');
 create table evidence_pipeline.evidence_candidates(id uuid primary key,capture_id uuid not null references evidence_pipeline.article_captures,source_field text,span_start int,span_end int,excerpt text,review_state text default 'pending',predecessor_candidate_id uuid,event_node_id uuid,related_node_id uuid,place_id uuid,spatial_revision_id uuid);
 alter table evidence_pipeline.article_captures enable row level security;
 alter table evidence_pipeline.evidence_candidates enable row level security;`);
 for(const s of manifest.sources){
  const payload={url:s.url,title:s.title,outlet:s.outlet,summary:null,body_text:s.excerpt,published_at:null};
  await db.query("insert into public.articles(id,url,title,outlet,body_text,reader_state,source_status) values($1,$2,$3,$4,$5,'pending_review','active')",[s.article_id,s.url,s.title,s.outlet,s.excerpt]);
  assert.equal((await db.query("select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') h",[JSON.stringify(payload)])).rows[0].h,s.content_hash);
  await db.query('insert into evidence_pipeline.article_captures(id,article_id,content_hash,payload) values($1,$2,$3,$4)',[s.capture_id,s.article_id,s.content_hash,JSON.stringify(payload)]);
  await db.query('insert into evidence_pipeline.evidence_candidates(id,capture_id,source_field,span_start,span_end,excerpt) values($1,$2,$3,$4,$5,$6)',[s.candidate_id,s.capture_id,s.source_field,s.span_start,s.span_end,s.excerpt]);
 }
 await db.exec(await read(root+'011_efta_governed_review.sql')).catch(e=>{throw Error('efta_install:'+e.message+' position='+e.position)});
 const key=randomUUID(),mapping=randomUUID(),session=randomUUID();
 await db.query("insert into mip_identity.key_versions values($1,'fixture','fixture','{}','2000-01-01','2999-01-01','synthetic-only')",[key]);
 await db.query("insert into mip_identity.key_heads values('fixture','fixture',$1,true)",[key]);
 await db.query("insert into mip_identity.mapping_versions values($1,'runtime-a','mip_projection_publisher_v1','fixture','fixture','fixture',$2,600,'synthetic-only')",[mapping,key]);
 await db.query("insert into mip_identity.mapping_heads values('runtime-a','mip_projection_publisher_v1',$1,true)",[mapping]);
 const issued=(await db.query("select comparison_qualification.issue_session('mip_projection_publisher_v1','runtime-a','2999-01-01') id")).rows[0].id;
 await db.query("insert into mip_identity.sessions values($1,$2,$3,$4,$5,'2999-01-01','synthetic-only')",[issued,session,randomUUID(),mapping,key]);
 async function role(name,sql,args=[]){await db.exec('set role '+name);try{return(await db.query(sql,args)).rows[0]?.result}finally{await db.exec('reset role')}}
 const resolutions=new Map();
 const entity=(origin)=>({namespace:'fixture:institution',id:origin,label:origin,kind:'institution',resolution_ref:'fixture-reviewed-identity'});
 const resolve=(request,origin,record=entity(origin),predecessor=null,state='resolved')=>role('mip_factual_reviewer_v3','select mip_identity.efta_resolve_identity($1,$2,$3,$4,$5,$6,$7) result',[request,origin,JSON.stringify(record),predecessor,state,'Fixture identity reviewer','Explicit fixture identity decision']);
 for(const origin of new Set(manifest.sources.map(s=>s.origin_id))){const id=randomUUID();await resolve(id,origin);resolutions.set(origin,id)}
 const review=(i=0)=>({identity_resolution_id:resolutions.get(manifest.sources[i].origin_id),reviewer:'Fixture reviewer',reason:'Explicit synthetic qualification only',semantic_kind:manifest.sources[i].semantic_kind,
 audience:'isolated_internal_review',publication_allowed:false,uncertainty:manifest.sources[i].remaining_uncertainty,
 owner_authorization_ref:'fixture-only',privacy_ref:'fixture-only',rights_ref:'fixture-only',
 event_time:{date:manifest.sources[i].source_date,precision:'day',evidence_basis:'Explicit fixture document-date review',uncertainty:'day only'},
 entity:{namespace:'fixture:institution',id:manifest.sources[i].origin_id,label:manifest.sources[i].origin_id,kind:'institution',resolution_ref:'fixture-reviewed-identity'}});
 const decide=(id,i=0,action='approve',predecessor=null,r=review(i))=>role('mip_factual_reviewer_v3','select mip_identity.efta_decide($1,$2,$3,$4,$5) result',[id,manifest.sources[i].candidate_id,action,predecessor,JSON.stringify(r)]);
 const admit=(decision,request=randomUUID())=>role('mip_projection_publisher_v1','select mip_identity.efta_admit($1,$2,$3,$4) result',[request,issued,'runtime-a',decision]);
 const get=(request=randomUUID())=>role('mip_projection_publisher_v1','select mip_identity.efta_private_read($1,$2,$3) result',[request,issued,'runtime-a']);
 return {db,role,review,decide,admit,get,issued,mapping,resolve,resolutions,entity};
}
test('native exact seven anchors, reviewed admissions, identity continuity and append-only receipts',async t=>{
 const f=await setup(t);
 for(let i=0;i<7;i++){const id=randomUUID(),request=randomUUID();await f.decide(id,i);assert.equal(await f.decide(id,i),id);await f.admit(id,request);assert.equal(await f.admit(id,request),request)}
 const request=randomUUID(),payload=await f.get(request);assert.deepEqual(await f.get(request),payload);
 const view=eftaWorkspace(payload);assert.equal(view.sources.length,7);assert.equal(view.timeline.length,6);assert.equal(view.arc.members.length,6);
 assert.equal(view.comparison.state,'unavailable');assert.equal(view.world_view.state,'absent');
 assert.ok(view.claims.every(c=>view.sources.some(s=>s.id===c.source_id&&s.event_id===c.event_id)));
 for(const table of ['efta_scope','efta_identity_resolutions','efta_decisions','efta_admissions','efta_private_reads']) await assert.rejects(f.db.exec('delete from mip_identity.'+table),/immutable/);
 await assert.rejects(f.db.exec('select mip_identity.release_public()'),/disabled/);
 for(const role of ['anon','authenticated','service_role','mip_comparison_worker_v1','mip_comparison_producer_v1']) await assert.rejects(f.role(role,'select mip_identity.efta_private_read(gen_random_uuid(),gen_random_uuid(),\'runtime-a\') result'),/permission denied/);
});
test('native review omissions, semantic substitution, unknown identity and publication/geography deny',async t=>{
 const f=await setup(t);
 for(const patch of [{reviewer:''},{reason:''},{semantic_kind:'compliance_proven'},{owner_authorization_ref:''},{privacy_ref:''},{rights_ref:''},{publication_allowed:true},{geography:{}},{uncertainty:''},{entity:{}},{event_time:{date:'2026-01-01',precision:'day',evidence_basis:'published_at',uncertainty:'unknown'}}]){
 await assert.rejects(f.decide(randomUUID(),0,'approve',null,{...f.review(),...patch}),/efta_/);}
});
test('native correction/reversal lineage and stale request conflict',async t=>{
 const f=await setup(t),first=randomUUID(),second=randomUUID(),reversal=randomUUID();await f.decide(first);await f.admit(first);
 await assert.rejects(f.decide(first,0,'approve',null,{...f.review(),reason:'changed'}),/replay/);
 await f.decide(second,0,'correct',first,{...f.review(),reason:'Correction preserves history'});await f.admit(second);
 await assert.rejects(f.admit(first),/replaced/);await assert.rejects(f.decide(first),/replaced/);
 assert.equal((await f.get()).sources[0].predecessor,first);
 await f.decide(reversal,0,'reverse',second,{reviewer:'Fixture reviewer',reason:'Withdraw private admission'});
 assert.equal((await f.get()).sources.length,0);await assert.rejects(f.admit(second),/replaced/);
 assert.equal((await f.db.query('select count(*)::int n from mip_identity.efta_decisions')).rows[0].n,3);
});
test('native source replacement, body mutation and broker revocation fail closed',async t=>{
 const f=await setup(t),id=randomUUID();await f.decide(id);await f.admit(id);
 await f.db.query("update public.articles set body_text='changed' where id=$1",[manifest.sources[0].article_id]);
 await assert.rejects(f.get(),/stale/);
 await f.db.query("update public.articles set body_text=$2 where id=$1",[manifest.sources[0].article_id,manifest.sources[0].excerpt]);
 await assert.rejects(f.get(),/stale_review/);
 await f.db.query("insert into evidence_pipeline.article_captures(id,article_id,content_hash,payload) select gen_random_uuid(),article_id,content_hash,payload from evidence_pipeline.article_captures where id=$1",[manifest.sources[0].capture_id]);
 await assert.rejects(f.get(),/replaced/);
 await f.db.query("update mip_identity.mapping_heads set active=false where revision=$1",[f.mapping]);
 await assert.rejects(f.get(),/revoked/);
});

test('native identities require separate current resolution and deny drift, ambiguity and revocation',async t=>{
 const f=await setup(t),origin=manifest.sources[0].origin_id,other=manifest.sources[1].origin_id;
 await assert.rejects(f.decide(randomUUID(),0,'approve',null,{...f.review(),identity_resolution_id:randomUUID()}),/identity/);
 await assert.rejects(f.decide(randomUUID(),0,'approve',null,{...f.review(),entity:{...f.review().entity,label:'drift'}}),/identity/);
 await assert.rejects(f.resolve(randomUUID(),other,{...f.entity(origin),label:'conflict'},f.resolutions.get(other)),/ambiguous/);
 await assert.rejects(f.resolve(randomUUID(),origin,f.entity(origin),null),/predecessor/);
 const id=randomUUID();await f.decide(id);await f.admit(id);
 await f.resolve(randomUUID(),origin,f.entity(origin),f.resolutions.get(origin),'revoked');
 await assert.rejects(f.get(),/identity/);await assert.rejects(f.admit(id),/identity/);await assert.rejects(f.decide(id),/identity/);
});

test('post-admission identity replacement invalidates private reads even with unchanged text',async t=>{
 const f=await setup(t),id=randomUUID(),origin=manifest.sources[0].origin_id;
 await f.decide(id);await f.admit(id);assert.equal((await f.get()).sources.length,1);
 await f.resolve(randomUUID(),origin,f.entity(origin),f.resolutions.get(origin),'resolved');
 await assert.rejects(f.get(),/identity/);
});

test('native candidate mutation and restoration cannot revive a prior review',async t=>{
 const f=await setup(t),id=randomUUID();await f.decide(id);await f.admit(id);
 await f.db.query("update evidence_pipeline.evidence_candidates set excerpt='changed' where id=$1",[manifest.sources[0].candidate_id]);
 await assert.rejects(f.get(),/binding/);
 await f.db.query("update evidence_pipeline.evidence_candidates set excerpt=$2 where id=$1",[manifest.sources[0].candidate_id,manifest.sources[0].excerpt]);
 await assert.rejects(f.get(),/stale_review/);
});

test('native reader requires active source and durable collector revision',async t=>{
 const f=await setup(t),s=manifest.sources[0];
 for(const status of [null,'unknown','withdrawn','corrected','revoked']){
 await f.db.query('update public.articles set source_status=$2 where id=$1',[s.article_id,status]);
 await assert.rejects(f.decide(randomUUID()),/stale_source/);
 }
 await f.db.query("update public.articles set source_status='active' where id=$1",[s.article_id]);
 // Simulates an incomplete historical deployment; ordinary roles cannot erase receipts.
 await f.db.exec('alter table mip_identity.source_changes disable trigger immutable');
 await f.db.query("delete from mip_identity.source_changes where relation_name='public.articles' and row_key=$1",[s.article_id]);
 await f.db.exec('alter table mip_identity.source_changes enable trigger immutable');
 await assert.rejects(f.decide(randomUUID()),/source_revision_missing/);
});
test('publication role can inspect only scope-linked captures, candidates and source changes',async t=>{
 const f=await setup(t),article=randomUUID(),capture=randomUUID(),candidate=randomUUID();
 await f.db.query("insert into public.articles(id,title,reader_state,source_status) values($1,'Unrelated','pending_review','active')",[article]);
 await f.db.query("insert into evidence_pipeline.article_captures(id,article_id,content_hash,payload) values($1,$2,'unrelated','{}')",[capture,article]);
 await f.db.query("insert into evidence_pipeline.evidence_candidates(id,capture_id,source_field,span_start,span_end,excerpt) values($1,$2,'body_text',0,1,'x')",[candidate,capture]);
 assert.equal(await f.role('mip_publication_owner_v2','select count(*)::int result from evidence_pipeline.article_captures'),7);
 assert.equal(await f.role('mip_publication_owner_v2','select count(*)::int result from evidence_pipeline.evidence_candidates'),7);
 assert.equal(await f.role('mip_publication_owner_v2','select count(*)::int result from mip_identity.source_changes where row_key=$1',[article]),0);
});
