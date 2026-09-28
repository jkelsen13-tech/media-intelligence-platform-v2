// Opt-in disposable actual PostgreSQL 17.6 qualification; never a hosted probe.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
const enabled=process.env.MIP_DISPOSABLE_POSTGRES==='arc-membership-qik-source'
function connection(){
 let u
 try{u=new URL(process.env.MIP_ARC_QIK_SOURCE_DATABASE_URL)}catch{throw Error('qik_source_synthetic_connection')}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)
  ||u.pathname!=='/mip_arc_qik_source_test'||u.search||u.hash)throw Error('qik_source_synthetic_target')
 return {connectionString:u.href,ssl:false,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:5000}
}
test('qik DATE/RLS compatibility storage refuses unqualified authority and preserves source corpus',
 {skip:!enabled,timeout:90000},async()=>{
 const db=new pg.Client(connection())
 let owned=false,stage='connect',primary=null
 const cleanup=[]
 const safe=e=>({sqlstate:/^[0-9A-Z]{5}$/.test(e?.code??'')?e.code:'none',
  code:/^arc_qik_source_[a-z_]+$/.test(e?.message??'')?e.message:e?.code==='ERR_ASSERTION'?'assertion_failed':'operation_failed'})
 try{
  await db.connect()
  stage='catalog_guard'
  const meta=(await db.query("select current_database() name,current_setting('server_version_num')::int version")).rows[0]
  assert.equal(meta.name,'mip_arc_qik_source_test');assert.equal(meta.version,170006)
  assert.equal((await db.query('select pg_try_advisory_lock(790613505) held')).rows[0].held,true)
    const existing=(await db.query(`
      select 'user_schema' kind from pg_namespace
       where nspname not in ('public','pg_catalog','information_schema','pg_toast')
        and nspname !~ '^pg_(toast_)?temp_[0-9]+$'
      union all select 'public_class' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
      union all select 'public_routine' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      union all select 'public_type' from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'
      union all select 'public_operator' from pg_operator o join pg_namespace n on n.oid=o.oprnamespace where n.nspname='public'
      union all select 'public_collation' from pg_collation c join pg_namespace n on n.oid=c.collnamespace where n.nspname='public'
      union all select 'public_conversion' from pg_conversion c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
      union all select 'public_text_search_config' from pg_ts_config c join pg_namespace n on n.oid=c.cfgnamespace where n.nspname='public'
      union all select 'public_text_search_dictionary' from pg_ts_dict d join pg_namespace n on n.oid=d.dictnamespace where n.nspname='public'
      union all select 'public_text_search_parser' from pg_ts_parser p join pg_namespace n on n.oid=p.prsnamespace where n.nspname='public'
      union all select 'public_text_search_template' from pg_ts_template t join pg_namespace n on n.oid=t.tmplnamespace where n.nspname='public'
      union all select 'extra_extension' from pg_extension where extname<>'plpgsql'
      union all select 'foreign_server' from pg_foreign_server
      union all select 'event_trigger' from pg_event_trigger
      union all select 'large_object' from pg_largeobject_metadata
      union all select 'publication' from pg_publication
      limit 1
    `)).rows

  assert.equal(existing.length,0)
  assert.equal((await db.query("select 1 from pg_roles where rolname in ('mip_arc_qik_source_owner','mip_arc_qik_source_probe')")).rows.length,0)
  owned=true
  stage='source_fixture'
  await db.query(`
   create role mip_arc_qik_source_probe nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
   create table public.articles(id uuid primary key,title text,summary text,published_at timestamptz,outlet text,arc_id uuid,body_text text);
   create table public.entities(id uuid primary key,canonical_name text);
   create table public.story_arcs(id uuid primary key,started_at date not null,title text,summary text,last_update_at timestamptz);
   create table public.pipeline_config(key text primary key,value jsonb);
   create table public.arc_membership_candidates(id uuid primary key,article_id uuid,arc_id uuid,state text,updated_at timestamptz);
   alter table public.articles enable row level security;
   alter table public.entities enable row level security;
   alter table public.story_arcs enable row level security;
   alter table public.pipeline_config enable row level security;
   alter table public.arc_membership_candidates enable row level security;
   insert into public.articles(id,title,body_text) values('00000000-0000-4000-8000-000000000001','SOURCE_SENTINEL','BODY_SENTINEL');
   insert into public.entities values('00000000-0000-4000-8000-000000000002','ENTITY_SENTINEL');
   insert into public.story_arcs(id,started_at) values('00000000-0000-4000-8000-000000000003','2026-01-01');
  `)
  const migration=await readFile(new URL('../supabase/qualification/arc-membership-qik-source/001_storage.sql',import.meta.url),'utf8')
  const absent=async()=>{
   assert.equal((await db.query("select to_regclass('public.article_entities') is null absent")).rows[0].absent,true)
   assert.equal((await db.query("select 1 from pg_roles where rolname='mip_arc_qik_source_owner'")).rows.length,0)
  }
  // Refuse unsupported source definitions atomically; no replacement PK/type.
  stage='date_refusal'
  await db.query('alter table public.story_arcs alter column started_at type timestamptz using started_at::timestamptz')
  try{await assert.rejects(db.query(migration),e=>e.message==='arc_qik_source_date_shape')}finally{await db.query('rollback')}
  await absent()
  await db.query('alter table public.story_arcs alter column started_at type date using started_at::date')
  stage='uuid_refusal'
  await db.query('alter table public.entities alter column id type text using id::text')
  try{await assert.rejects(db.query(migration),e=>e.message==='arc_qik_source_identity_shape')}finally{await db.query('rollback')}
  await absent()
  await db.query('alter table public.entities alter column id type uuid using id::uuid')
  stage='identity_refusal'
  await db.query('alter table public.entities drop constraint entities_pkey')
  try{await assert.rejects(db.query(migration),e=>e.message==='arc_qik_source_identity_shape')}finally{await db.query('rollback')}
  await absent()
  await db.query('alter table public.entities add primary key(id)')
  stage='rls_refusal'
  await db.query('alter table public.articles disable row level security')
  try{await assert.rejects(db.query(migration),e=>e.message==='arc_qik_source_relation_shape')}finally{await db.query('rollback')}
  await absent()
  await db.query('alter table public.articles enable row level security')
  stage='locked_rls_race'
  const blocker=new pg.Client(connection())
  let pendingInstall
  try{
   await blocker.connect()
   await blocker.query('begin')
   await blocker.query('alter table public.articles disable row level security')
   const pid=(await db.query('select pg_backend_pid() pid')).rows[0].pid
   pendingInstall=db.query(migration).then(()=>({ok:true}),e=>({ok:false,...safe(e)}))
   let observed=false
   for(let attempt=0;attempt<40;attempt++){
    await blocker.query('select pg_stat_clear_snapshot()')
    const waiting=(await blocker.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]
    if(waiting?.wait_event_type==='Lock'){observed=true;break}
    await new Promise(resolve=>setTimeout(resolve,25))
   }
   assert.equal(observed,true,'installer must be observed waiting on source DDL')
   await blocker.query('commit')
   const result=await pendingInstall
   assert.equal(result.ok,false)
   assert.equal(result.code,'arc_qik_source_relation_shape')
  }finally{
   try{await blocker.query('rollback')}finally{
    try{if(pendingInstall)await pendingInstall;await db.query('rollback')}
    finally{await blocker.end()}
   }
  }
  await absent()
  await db.query('alter table public.articles enable row level security')
  stage='install'
  await db.query(migration)
  stage='catalog_assertions'
  const manifest=JSON.parse(await readFile(new URL('../verifier/qik-c6-c9-caller-source-successor.json',import.meta.url),'utf8'))
  assert.equal(manifest.stages[1].stage,'qik_article_entity_storage')
  assert.equal(manifest.stages[2].stage,'qik_arc_release_policy_storage')
  const actualColumns=async relation=>(await db.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum",[relation])).rows.map(r=>r.attname)
  const entityColumns=await actualColumns('public.article_entities')
  const releaseColumns=await actualColumns('public.arc_membership_release_policy')
  assert.deepEqual(entityColumns,manifest.stages[1].retained_fields)
  assert.deepEqual(releaseColumns,manifest.stages[2].retained_fields)
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='public.article_entities'::regclass and contype='f'")).rows[0].n,2)
  for(const rel of ['article_entities','arc_membership_release_policy']){
   const found=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",['public.'+rel])).rows[0]
   assert.deepEqual(found,{relrowsecurity:true,relforcerowsecurity:true})
   assert.equal((await db.query('select count(*)::int n from public.'+rel)).rows[0].n,0)
   assert.equal((await db.query("select count(*)::int n from pg_policy where polrelid=$1::regclass",['public.'+rel])).rows[0].n,0)
  }
  assert.equal((await db.query("select a.atttypid::regtype::text kind from pg_attribute a where a.attrelid='public.story_arcs'::regclass and a.attname='started_at'")).rows[0].kind,'date')
  stage='authority_fences'
  const entityInsert="insert into public.article_entities(article_id,entity_id,confidence,extraction_method) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',0.9,'SYNTHETIC_UNADMITTED')"
  // Actual superuser fixture DML still hits the no-authority trigger.
  await assert.rejects(db.query(entityInsert),e=>e.message==='arc_qik_source_entity_authority_unqualified')
  await assert.rejects(db.query("insert into public.arc_membership_release_policy(model_version,auto_approval_enabled) values('synthetic',true)"),
   e=>e.message==='arc_qik_source_release_authority_unqualified')
  await assert.rejects(db.query('truncate public.article_entities'),e=>e.message==='arc_qik_source_entity_authority_unqualified')
  await assert.rejects(db.query('truncate public.arc_membership_release_policy'),e=>e.message==='arc_qik_source_release_authority_unqualified')
  stage='zero_row_fences'
  for(const [relation,column,code] of [
   ['article_entities','confidence','arc_qik_source_entity_authority_unqualified'],
   ['arc_membership_release_policy','fixture_passed','arc_qik_source_release_authority_unqualified'],
  ]){
   await assert.rejects(db.query('update public.'+relation+' set '+column+'='+column+' where false'),e=>e.message===code)
   await assert.rejects(db.query('delete from public.'+relation+' where false'),e=>e.message===code)
  }
  assert.deepEqual(await actualColumns('public.article_entities'),entityColumns)
  assert.deepEqual(await actualColumns('public.arc_membership_release_policy'),releaseColumns)
  stage='fence_assertion_drift'
  const assertionBlock=migration.match(/do \$assert\$[\s\S]*?end \$assert\$;/)?.[0]
  assert.ok(assertionBlock)
  await db.query(assertionBlock)
  const drifts=[
   "alter table public.article_entities disable trigger qik_entity_authority",
   "alter table public.article_entities enable trigger qik_entity_authority",
   `create function public.qik_source_synthetic_noop() returns trigger language plpgsql as $noop$ begin return null;end $noop$;
     drop trigger qik_entity_authority on public.article_entities;
     create trigger qik_entity_authority before insert or update or delete on public.article_entities for each statement execute function public.qik_source_synthetic_noop();
     alter table public.article_entities enable always trigger qik_entity_authority;`,
   `drop trigger qik_entity_authority on public.article_entities;
     create trigger qik_entity_authority before insert or update or delete on public.article_entities for each statement when(false) execute function mip_arc_qik_source.reject_unqualified_write();
     alter table public.article_entities enable always trigger qik_entity_authority;`,
   `drop trigger qik_entity_authority on public.article_entities;
     create trigger qik_entity_authority before insert or update or delete on public.article_entities for each row execute function mip_arc_qik_source.reject_unqualified_write();
     alter table public.article_entities enable always trigger qik_entity_authority;`,
   `create trigger qik_source_duplicate before insert on public.article_entities for each statement execute function mip_arc_qik_source.reject_unqualified_write();`,
   "alter table public.arc_membership_release_policy disable trigger qik_arc_release_authority_truncate",
  ]
  for(const drift of drifts){
   await db.query('begin')
   try{
    await db.query(drift)
    await assert.rejects(db.query(assertionBlock),e=>e.message==='arc_qik_source_trigger_boundary')
   }finally{await db.query('rollback')}
   await db.query(assertionBlock)
  }
  stage='private_owner'
  await db.query('set role mip_arc_qik_source_owner')
  try{
   await assert.rejects(db.query('select mip_arc_qik_source.require_entity_authority()'),e=>e.message==='arc_qik_source_entity_authority_unqualified')
   await assert.rejects(db.query('select id from public.articles'),e=>e.code==='42501')
   await assert.rejects(db.query('select id from public.entities'),e=>e.code==='42501')
   await assert.rejects(db.query(entityInsert),e=>e.message==='arc_qik_source_entity_authority_unqualified')
   assert.equal((await db.query('select count(*)::int n from public.article_entities')).rows[0].n,0)
  }finally{await db.query('reset role')}
  stage='ambient_acl'
  const roles=(await db.query("select rolname from pg_roles where rolname in('anon','authenticated','service_role','mip_arc_qik_source_probe') order by rolname")).rows
  assert.ok(roles.some(r=>r.rolname==='mip_arc_qik_source_probe'))
  for(const {rolname} of roles){
   await db.query('set role "'+rolname+'"')
   try{
    for(const statement of [
     'select * from public.article_entities',
     'select * from public.arc_membership_release_policy',
     'select mip_arc_qik_source.require_entity_authority()',
     entityInsert,
     "insert into public.arc_membership_release_policy(model_version) values('DENIAL_SENTINEL')",
    ])await assert.rejects(db.query(statement),e=>e.code==='42501'&&!String(e.detail??'').includes('SENTINEL'))
   }finally{await db.query('reset role')}
  }
  stage='unchanged_sources'
  assert.equal((await db.query('select title from public.articles')).rows[0].title,'SOURCE_SENTINEL')
  assert.equal((await db.query('select body_text from public.articles')).rows[0].body_text,'BODY_SENTINEL')
  assert.equal((await db.query('select count(*)::int n from public.article_entities')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from public.arc_membership_release_policy')).rows[0].n,0)
  assert.deepEqual(await actualColumns('public.article_entities'),manifest.stages[1].retained_fields)
  assert.deepEqual(await actualColumns('public.arc_membership_release_policy'),manifest.stages[2].retained_fields)
  assert.equal((await db.query('select canonical_name from public.entities')).rows[0].canonical_name,'ENTITY_SENTINEL')
  assert.equal((await db.query("select count(*)::int n from pg_class where oid in('public.articles'::regclass,'public.entities'::regclass,'public.story_arcs'::regclass,'public.pipeline_config'::regclass,'public.arc_membership_candidates'::regclass) and relrowsecurity")).rows[0].n,5)
  stage='existing_refusal'
  try{await assert.rejects(db.query(migration),e=>e.message==='arc_qik_source_existing_contract')}finally{await db.query('rollback')}
  assert.equal((await db.query('select count(*)::int n from public.article_entities')).rows[0].n,0)
 }catch(e){primary={stage,...safe(e)}}
 finally{
  const attempt=async(stage,fn)=>{try{await fn()}catch(e){cleanup.push({stage,...safe(e)})}}
  if(owned){
   await attempt('rollback',()=>db.query('rollback'))
   await attempt('reset_role',()=>db.query('reset role'))
   await attempt('owned_tables',()=>db.query('drop table if exists public.article_entities,public.arc_membership_release_policy'))
   await attempt('owned_schema',()=>db.query('drop schema if exists mip_arc_qik_source cascade'))
   await attempt('source_fixture',()=>db.query('drop table if exists public.arc_membership_candidates,public.pipeline_config,public.story_arcs,public.entities,public.articles'))
   await attempt('owner_usage',()=>db.query(`
    do $cleanup$
    begin
     if exists(select 1 from pg_roles where rolname='mip_arc_qik_source_owner') then
      revoke usage on schema public from mip_arc_qik_source_owner;
     end if;
    end $cleanup$;
   `))
   await attempt('owned_roles',()=>db.query('drop role if exists mip_arc_qik_source_owner,mip_arc_qik_source_probe'))
  }
  await attempt('close',()=>db.end())
 }
 if(primary||cleanup.length)throw Error('arc_qik_source_synthetic_failure '+JSON.stringify({primary,cleanup}))
})
