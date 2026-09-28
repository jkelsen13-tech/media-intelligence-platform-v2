// Opt-in actual PostgreSQL test. Without both markers this file skips.
// Mocked unit tests in arcMembershipPrepared.test.mjs are not this evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {readFile} from 'node:fs/promises'
import {admitHistoricalArc,readHistoricalArc} from '../supabase/qualification/arc-membership-retained/retained.mjs'
import {prepareArcMembership} from '../supabase/qualification/arc-membership-prepared/prepare.mjs'
import {fixture,requests,id} from '../supabase/qualification/arc-membership-prepared/syntheticFixture.mjs'

const enabled=process.env.MIP_DISPOSABLE_POSTGRES==='arc-membership-retained'
const connectionString=process.env.MIP_ARC_RETAINED_DATABASE_URL
function connection() {
  let url
  try { url=new URL(connectionString) } catch { throw Error('synthetic_database_url_required') }
  if(!['postgres:','postgresql:'].includes(url.protocol)
    || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    || url.pathname!=='/mip_arc_retained_test' || url.search || url.hash)
    throw Error('synthetic_database_target_refused')
  return {connectionString:url.href,ssl:false,connectionTimeoutMillis:5000}
}
test('actual PostgreSQL historical immutable admission, replay, authority and cleanup',
  {skip:!enabled,timeout:90000},async()=>{
  const config=connection(),db=new pg.Client({...config,query_timeout:10000,
    statement_timeout:5000,application_name:'mip-arc-retained-synthetic-admin'})
  let owned=false,stage='connect',primaryFailure=null
  const cleanupFailures=[]
  let admissionDiagnostic=null
  const sanitized=error=>({
    sqlstate:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:'none',
    code:/^arc_retained_[a-z_]+$/.test(error?.message??'')?error.message:
      error?.code==='ERR_ASSERTION'?'assertion_failed':'operation_failed',
  })
  try {
    await db.connect()
    await db.query("set statement_timeout='5000ms'")
    stage='catalog_guard'
    const version=(await db.query("select current_database() name,current_setting('server_version_num')::int version")).rows[0]
    assert.equal(version.name,'mip_arc_retained_test')
    assert.equal(version.version,170006,'exact PostgreSQL 17.6 required')
    assert.equal((await db.query('select pg_try_advisory_lock(790613504) held')).rows[0].held,true)
    // Class-only emptiness is insufficient: functions or another user schema
    // could hide preexisting objects in a database that merely has no tables.
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
    assert.equal(existing.length,0,'dedicated database catalog must be empty')
    assert.equal((await db.query("select 1 from pg_roles where rolname in ('mip_arc_retained_owner','mip_arc_retained_reader','mip_arc_retained_outsider_test')")).rows.length,0)
    stage='source_fixture'
    owned=true
    await db.query('create role mip_arc_retained_outsider_test nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls')
    await db.query(`
      create table public.arc_membership_candidates(id uuid primary key,article_id uuid not null,
        arc_id uuid not null,state text not null,updated_at timestamptz not null);
      create table public.story_arcs(id uuid primary key,title text,summary text,
        started_at timestamptz,last_update_at timestamptz);
      create table public.articles(id uuid primary key,title text,summary text,
        published_at timestamptz,outlet text,arc_id uuid,body_text text,url text);
      create table public.article_entities(article_id uuid,entity_id uuid,confidence numeric,
        primary key(article_id,entity_id));
      create table public.pipeline_config(key text primary key,value jsonb);
      create table public.arc_membership_release_policy(model_version text primary key,
        fixture_passed boolean,auto_approval_enabled boolean,auto_approval_threshold numeric);
    `)
    const data=fixture()
    data.candidates[0].updated_at='2026-01-14 12:00:00.123456+00'
    for(const row of data.candidates)await db.query('insert into public.arc_membership_candidates values($1,$2,$3,$4,$5)',
      [row.id,row.article_id,row.arc_id,row.state,row.updated_at])
    for(const row of data.arcs)await db.query('insert into public.story_arcs values($1,$2,$3,$4,$5)',
      [row.id,row.title,row.summary,row.started_at,row.last_update_at])
    const member=data.articles[1]
    // More than 1000 actual rows prove complete SQL keyset paging, not a mock.
    data.articles=[data.articles[0],...Array.from({length:1001},(_,i)=>({...member,id:id(1000+i)}))]
    for(const row of data.articles)await db.query('insert into public.articles values($1,$2,$3,$4,$5,$6,$7,$8)',
      [row.id,row.title,row.summary,row.published_at,row.outlet,row.arc_id,'BODY_SENTINEL','URL_SENTINEL'])
    await db.query('insert into public.article_entities select id,$1,0.9 from public.articles',[id(301)])
    await db.query("insert into public.pipeline_config values('entity_resolve_min_confidence','0.70'::jsonb)")
    await db.query("insert into public.arc_membership_release_policy values('arc-v1-membership-2026-08-23.2',true,false,null)")

    const input={connection:config,sourceKind:'historical_public',requests:requests(data),limits:{page:97}}
    stage='baseline'
    const baseline=await prepareArcMembership(input)
    stage='install'
    await db.query(await readFile(new URL('../supabase/qualification/arc-membership-retained/001_retained.sql',import.meta.url),'utf8'))
    // Test admin is the synthetic session principal; runtime users/credentials
    // are not seeded by the installation. Role membership is test-only.
    stage='test_access'
    await db.query('grant mip_arc_retained_owner,mip_arc_retained_reader to current_user')
    const scope=id(901),generation=id(902)
    await db.query('insert into mip_arc_retained.access values($1,session_user,true)',[scope])
    const args={...input,scope,generation,expectedInputHash:baseline.input_sha256}
    stage='first_admission'
    class DiagnosticClient extends pg.Client {
      async query(sql,...values){
        try{return await super.query(sql,...values)}
        catch(error){
          if(error?.message==='arc_retained_admission_failed'){
            const match=/^stage=(identity|authorization|hash|shape|candidate_projection|arc_projection|article_projection|relation_shape|cardinality|candidate_context|member_context|article_context|entity_context|floor|release|retry|insert);sqlstate=([0-9A-Z]{5})$/.exec(error.detail??'')
            if(match)admissionDiagnostic={stage:match[1],sqlstate:match[2]}
          }
          throw error
        }
      }
    }
    const first=await admitHistoricalArc(args,{ClientClass:DiagnosticClient})
    assert.deepEqual(first.scores,baseline.scores)
    assert.equal(first.input_sha256,baseline.input_sha256)
    assert.equal(first.counts.members,1001)
    assert.ok(!JSON.stringify(first).includes('SENTINEL'))
    assert.equal(first.publication_allowed,false);assert.equal(first.approval_allowed,false)
    assert.equal(first.scores_persisted,false)
    assert.equal((await db.query('select count(*)::int n from mip_arc_retained.inputs')).rows[0].n,1)
    await assert.rejects(admitHistoricalArc({...args,expectedInputHash:'f'.repeat(64)}),/retry_conflict/)
    await assert.rejects(admitHistoricalArc({...args,requests:args.requests.map(r=>({...r,candidate_updated_at:'2026-01-14 12:00:00.123457+00'}))}),/retry_conflict/)
    stage='original_replay'
    // Readback and exact retry are bound to original retained context, not latest.
    await db.query("update public.articles set title='LATEST_SENTINEL' where id=$1",[data.articles[0].id])
    await db.query('delete from public.article_entities')
    assert.deepEqual(await readHistoricalArc(args),first)
    assert.deepEqual(await admitHistoricalArc(args),first)
    stage='revocation'
    // Revocation takes the same actual ACL row lock as admission/readback.
    await db.query('update mip_arc_retained.access set allowed=false where scope=$1',[scope])
    await assert.rejects(readHistoricalArc(args),e=>e.message==='arc_retained_access_denied'&&e.cause===undefined)
    await assert.rejects(admitHistoricalArc(args),/access_denied/)
    await db.query('update mip_arc_retained.access set allowed=true where scope=$1',[scope])
    await assert.rejects(readHistoricalArc({...args,generation:id(999)}),/missing/)
    await assert.rejects(readHistoricalArc({...args,scope:id(999)}),/access_denied/)
    stage='source_authority'
    // Source SELECT omission and RLS visibility are explicit failures, never
    // a silently truncated retained context. Old readback remains independent.
    const current=await prepareArcMembership(input)
    const next={...args,generation:id(903),expectedInputHash:current.input_sha256}
    await db.query('revoke select(id,title,summary,published_at,outlet,arc_id) on public.articles from mip_arc_retained_owner')
    await assert.rejects(admitHistoricalArc(next),/source_authority/)
    await db.query('grant select(id,title,summary,published_at,outlet,arc_id) on public.articles to mip_arc_retained_owner')
    await db.query('alter table public.articles enable row level security')
    await assert.rejects(admitHistoricalArc(next),/source_authority/)
    assert.deepEqual(await readHistoricalArc(args),first)
    await db.query('alter table public.articles disable row level security')
    stage='concurrent_snapshot'
    // Real second connection mutates between first source page and subsequent
    // reads. The admitted context remains that one owned MVCC snapshot.
    let changed=false
    class ConcurrentClient extends DiagnosticClient {
      async query(sql,...values){
        const result=await super.query(sql,...values)
        if(typeof sql==='string'&&sql.includes('arc-prepared:candidates')&&!changed){
          changed=true
          await db.query("update public.story_arcs set summary='CONCURRENT_SENTINEL' where id=$1",[data.arcs[0].id])
        }
        return result
      }
    }
    const concurrent=await admitHistoricalArc(next,{ClientClass:ConcurrentClient})
    assert.equal(concurrent.input_sha256,current.input_sha256)
    assert.equal(changed,true)
    assert.deepEqual(await readHistoricalArc(next),concurrent)
    await assert.rejects(admitHistoricalArc({...next,generation:id(904)}),/stale_source/)
    stage='direct_acl'
    // Effective ACL and direct SQL wrapper boundary, with real PostgreSQL.
    assert.equal((await db.query("select has_function_privilege('mip_arc_retained_reader','mip_arc_retained.admit_input(uuid,uuid,text,text)','EXECUTE') allowed")).rows[0].allowed,false)
    assert.equal((await db.query("select has_table_privilege('mip_arc_retained_reader','mip_arc_retained.inputs','SELECT') allowed")).rows[0].allowed,false)
    assert.equal((await db.query("select has_column_privilege('mip_arc_retained_owner','public.articles','body_text','SELECT') allowed")).rows[0].allowed,false)
    const ambient=(await db.query("select rolname from pg_roles where rolname in ('anon','authenticated','service_role','mip_arc_retained_outsider_test') order by rolname")).rows
    assert.ok(ambient.some(r=>r.rolname==='mip_arc_retained_outsider_test'))
    for(const {rolname} of ambient){
      // Names come from this closed constant catalog predicate, not user input.
      await db.query('set role "'+rolname+'"')
      try{
        for(const [sql,values] of [
          ['select * from mip_arc_retained.read_input($1,$2,$3,false)',[scope,generation,first.input_sha256]],
          ['select mip_arc_retained.admit_input($1,$2,$3,$4)',[scope,id(908),'f'.repeat(64),'PRIVATE_DENIAL_SENTINEL']],
          ['select * from mip_arc_retained.inputs',[]],
          ['select * from mip_arc_retained.access',[]],
        ])await assert.rejects(db.query(sql,values),e=>{
          assert.equal(e.code,'42501')
          assert.ok(!String(e.message).includes('PRIVATE_DENIAL_SENTINEL'))
          assert.ok(!String(e.detail??'').includes('PRIVATE_DENIAL_SENTINEL'))
          return true
        })
      }finally{await db.query('reset role')}
    }
    await db.query('set role mip_arc_retained_reader')
    try{
      const allowed=(await db.query('select * from mip_arc_retained.read_input($1,$2,$3,false)',[scope,generation,first.input_sha256])).rows
      assert.equal(allowed.length,1)
      assert.equal(allowed[0].input_sha256,first.input_sha256)
      assert.deepEqual(Object.keys(allowed[0]).sort(),['canonical_input','input_sha256'])
      await assert.rejects(db.query('select mip_arc_retained.admit_input($1,$2,$3,$4)',[scope,id(905),'f'.repeat(64),'{}']),e=>e.code==='42501')
      await assert.rejects(db.query('select * from mip_arc_retained.inputs'),e=>e.code==='42501')
    }finally{await db.query('reset role')}
    await db.query('begin isolation level repeatable read')
    await db.query('set local role mip_arc_retained_owner')
    try{
      const stored=(await db.query('select canonical_input,input_sha256 from mip_arc_retained.inputs where generation=$1',[generation])).rows[0]
      const invalid=JSON.parse(stored.canonical_input);invalid.articles[0].body_text='SQL_FORBIDDEN_SENTINEL'
      // Wrong full hash / extra nested fields never enter durable storage.
      await assert.rejects(db.query('select mip_arc_retained.admit_input($1,$2,$3,$4)',[scope,id(906),stored.input_sha256,JSON.stringify(invalid)]),
        e=>e.message==='arc_retained_admission_failed'&&!String(e.detail??'').includes('SENTINEL'))
    }finally{await db.query('rollback')}
    stage='immutability'
    await assert.rejects(db.query('update mip_arc_retained.inputs set input_sha256=input_sha256'),/arc_retained_immutable/)
    await assert.rejects(db.query('delete from mip_arc_retained.inputs'),/arc_retained_immutable/)
    assert.equal((await db.query('select count(*)::int n from mip_arc_retained.inputs')).rows[0].n,2)
  }catch(error){
    primaryFailure={stage,...sanitized(error),admissionDiagnostic}
  }finally{
    const attempt=async(name,operation)=>{
      try{await operation()}catch(error){cleanupFailures.push({stage:name,...sanitized(error)})}
    }
    if(owned){
      await attempt('rollback',()=>db.query('rollback'))
      await attempt('reset_role',()=>db.query('reset role'))
      await attempt('owned_schema',()=>db.query('drop schema if exists mip_arc_retained cascade'))
      await attempt('owned_tables',()=>db.query('drop table if exists public.arc_membership_release_policy,public.pipeline_config,public.article_entities,public.articles,public.story_arcs,public.arc_membership_candidates'))
      // Installer roles are transactional. An installation failure may leave
      // neither role; never assume owned=true means those roles committed.
      await attempt('owner_public_usage',()=>db.query(`
        do $cleanup$
        begin
          if exists(select 1 from pg_roles where rolname='mip_arc_retained_owner') then
            revoke usage on schema public from mip_arc_retained_owner;
          end if;
        end $cleanup$;
      `))
      await attempt('owned_roles',()=>db.query('drop role if exists mip_arc_retained_reader,mip_arc_retained_owner,mip_arc_retained_outsider_test'))
    }
    await attempt('close',()=>db.end())
  }
  if(primaryFailure||cleanupFailures.length){
    // Only fixed stage labels, SQLSTATE and allowlisted contract codes escape.
    // Never attach driver objects, causes, query text, values or assertion data.
    throw Error('arc_retained_synthetic_failure '+JSON.stringify({
      primary:primaryFailure,cleanup:cleanupFailures,
    }))
  }
})
