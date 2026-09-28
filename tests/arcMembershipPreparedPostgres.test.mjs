// Opt-in actual PostgreSQL test. Without both markers this file skips.
// Mocked unit tests in arcMembershipPrepared.test.mjs are not this evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomBytes} from 'node:crypto'
import {prepareArcMembership} from '../supabase/qualification/arc-membership-prepared/prepare.mjs'
import {fixture,requests,id} from '../supabase/qualification/arc-membership-prepared/syntheticFixture.mjs'

const enabled=process.env.MIP_DISPOSABLE_POSTGRES==='arc-membership-prepared'
const connectionString=process.env.MIP_ARC_PREPARED_DATABASE_URL
function connection() {
  let url
  try { url=new URL(connectionString) } catch { throw Error('synthetic_database_url_required') }
  if(!['postgres:','postgresql:'].includes(url.protocol)
    || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    || url.pathname!=='/mip_arc_prepared_test' || url.search || url.hash)
    throw Error('synthetic_database_target_refused')
  return {connectionString:url.href,ssl:false,connectionTimeoutMillis:5000}
}
test('actual PostgreSQL owns one repeatable-read snapshot, detects stale replay, and leaves no writes',
  {skip:!enabled,timeout:90000},async()=>{
  const config=connection(),db=new pg.Client({...config,query_timeout:10000,
    statement_timeout:5000,application_name:'mip-arc-prepared-synthetic-admin'})
  const readerRole='arc_prepared_reader_'+randomBytes(8).toString('hex')
  // Generated identifier has no caller-controlled punctuation.
  const quotedRole='"'+readerRole+'"'
  let owned=false,roleCreated=false
  try {
    await db.connect()
    await db.query("set statement_timeout='5000ms'")
    const version=(await db.query("select current_database() name,current_setting('server_version_num')::int version")).rows[0]
    assert.equal(version.name,'mip_arc_prepared_test')
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
    assert.equal((await db.query('select 1 from pg_roles where rolname=$1',[readerRole])).rows.length,0)
    owned=true
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
    const baseline=await prepareArcMembership(input)
    assert.equal(baseline.scores[0].candidate_updated_at,'2026-01-14 12:00:00.123456+00')
    await assert.rejects(prepareArcMembership({...input,requests:input.requests.map(row=>({
      ...row,candidate_updated_at:'2026-01-14 12:00:00.123457+00',
    }))}),/stale_or_foreign_candidate/)
    await db.query('create role '+quotedRole+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls')
    roleCreated=true
    await db.query('grant usage on schema public to '+quotedRole)
    await db.query('grant select on public.arc_membership_candidates,public.story_arcs,public.articles,'+
      'public.article_entities,public.pipeline_config,public.arc_membership_release_policy to '+quotedRole)
    let deniedReadCode=null,closedReaders=0
    class LimitedReader extends pg.Client {
      async connect() {
        await super.connect()
        await super.query('set role '+quotedRole)
      }
      async query(sql,...args) {
        try { return await super.query(sql,...args) }
        catch(error) { deniedReadCode=error.code;throw error }
      }
      async end() { try { return await super.end() } finally { closedReaders++ } }
    }
    // This proves server-enforced effective-role grants, not direct password
    // authentication. No runtime grants or hosted roles are installed.
    const limited=await prepareArcMembership(input,{ClientClass:LimitedReader})
    assert.equal(limited.input_sha256,baseline.input_sha256)
    await db.query('revoke select on public.articles from '+quotedRole)
    await assert.rejects(prepareArcMembership(input,{ClientClass:LimitedReader}),error=>{
      assert.equal(error.message,'arc_prepared_read_failed')
      assert.equal(error.cause,undefined)
      assert.equal(error.detail,undefined)
      assert.equal(error.code,undefined)
      assert.ok(!JSON.stringify(error).includes('articles'))
      return true
    })
    assert.equal(deniedReadCode,'42501','actual PostgreSQL missing SELECT denial required')
    assert.equal(closedReaders,2,'both allowed and denied reader sessions close')
    await db.query('grant select on public.articles to '+quotedRole)
    assert.equal(baseline.counts.members,1001)
    assert.equal(baseline.counts.entity_relations,1002)
    assert.ok(!JSON.stringify(baseline).includes('SENTINEL'))
    assert.equal((await prepareArcMembership({...input,expectedInputHash:baseline.input_sha256})).input_sha256,baseline.input_sha256)
    let changed=false,reader
    class ConcurrentClient extends pg.Client {
      constructor(options){super(options);reader=this}
      async query(sql,...args){
        const result=await super.query(sql,...args)
        if(typeof sql==='string'&&sql.includes('arc-prepared:articles')&&!changed) {
          changed=true
          await db.query('update public.articles set summary=$1 where id=$2',['concurrently changed',id(1000)])
        }
        return result
      }
    }
    const consistent=await prepareArcMembership({...input,expectedInputHash:baseline.input_sha256},{ClientClass:ConcurrentClient})
    assert.equal(changed,true)
    assert.equal(consistent.input_sha256,baseline.input_sha256,'member read remains in original real snapshot')
    await assert.rejects(reader.query('select 1'),/closed|ended|not queryable/i)
    await assert.rejects(prepareArcMembership({...input,expectedInputHash:baseline.input_sha256}),/stale_source/)
    await assert.rejects(prepareArcMembership({...input,limits:{page:97,members:1000}}),/row_count_overflow/)
    const state=(await db.query('select state,updated_at::text revision from public.arc_membership_candidates')).rows[0]
    assert.equal(state.state,'pending')
    assert.equal(state.revision,data.candidates[0].updated_at)
    // The adapter's exact transaction rejects writes at the PostgreSQL server.
    let denied=false
    class ReadOnlyProbe extends pg.Client {
      async query(sql,...args) {
        const result=await super.query(sql,...args)
        if(typeof sql==='string'&&sql.includes('arc-prepared:snapshot')) {
          try { await super.query("update public.arc_membership_candidates set state='approved'") }
          catch(error){denied=error.code==='25006';throw error}
        }
        return result
      }
    }
    await assert.rejects(prepareArcMembership(input,{ClientClass:ReadOnlyProbe}),/arc_prepared_read_failed/)
    assert.equal(denied,true)
    assert.equal((await db.query('select state from public.arc_membership_candidates')).rows[0].state,'pending')
  } finally {
    let cleanupFailed=false
    try {
      if(owned) {
        try {
          await db.query(`
            drop table if exists public.article_entities,public.arc_membership_candidates,
              public.story_arcs,public.articles,public.pipeline_config,public.arc_membership_release_policy;
          `)
        } catch { cleanupFailed=true }
      }
      if(roleCreated) {
        // Attempt each owned-role cleanup even if an earlier drop failed.
        for(const sql of [
          'revoke all privileges on all tables in schema public from '+quotedRole,
          'revoke all privileges on schema public from '+quotedRole,
          'drop role '+quotedRole,
        ]) {
          try { await db.query(sql) } catch { cleanupFailed=true }
        }
      }
    } finally {
      // Client.end is attempted even after connect or cleanup fails.
      try { await db.end() } catch { cleanupFailed=true }
    }
    if(cleanupFailed)throw Error('arc_prepared_synthetic_cleanup_failed')
  }
})
