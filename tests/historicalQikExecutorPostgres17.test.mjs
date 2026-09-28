import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { createQikHistoricalExecutor } from '../supabase/qualification/historical-qik-executor/executor.mjs'
import { buildSourceContract, sourceContractStatements } from '../supabase/qualification/historical-qik-executor/contracts.mjs'
import { FIELD_CONTRACTS, PROJECTS } from '../scripts/mipHistoricalArticleTransferPlan.mjs'
import { stableStringify, fingerprintPayload } from '../scripts/mipLegacyGraphStaging.mjs'

// RUN ONLY on the already approved ephemeral official postgres:17.6 CI service.
// This file never creates containers, accepts a remote URL or reads actual secrets.
// Node outside and dblink inside that same service both use loopback:5432.
// The explicit arm prevents accidental execution by ordinary developer tests.
const armed=process.env.MIP_HISTORICAL_EXECUTOR_DISPOSABLE==='synthetic-pg17-only'
const fixturePassword='mip-efta-disposable-ci-only'
const fixtureRolePassword='mip-historical-fixture-only'
const limits={records:10000,objects:100,bytes:10*1024*1024}
const qi=s=>'"'+s.replaceAll('"','""')+'"'
const noUnique=new Set(['arc_backup_20260726_articles','article_entities_canary_sweep_backup_20260809',
  'articles_canary_sweep_backup_20260809','articles_decode_backup_20260726',
  'articles_decode_backup_20260726_r2','articles_decode_backup_20260726_r3',
  'articles_pre_d5_backup_20260730','articles_review_batch_backup_20260729'])
const ids={
 article:'10000000-0000-4000-8000-000000000001',author:'10000000-0000-4000-8000-000000000002',
 outlet:'10000000-0000-4000-8000-000000000003',claim:'10000000-0000-4000-8000-000000000004',
 event:'10000000-0000-4000-8000-000000000005',link:'10000000-0000-4000-8000-000000000006',
 missing:'10000000-0000-4000-8000-000000000099',
}
function columnType(field) {
 if(field==='id'||field.endsWith('_id')) return 'uuid'
 if(['claims','output','provenance','arc_assignment_evidence','outlet_ids','aliases','beats',
   'framing_profile','validation_errors','counters','category_evidence','embedding'].includes(field)) return 'jsonb'
 if(field.endsWith('_at')||field==='first_seen'||field==='last_seen') return 'timestamptz'
 if(['unattributed','monoculture','is_digest','is_current','is_pre_ruling','different_causal_chain','thin_extraction'].includes(field)) return 'boolean'
 if(['confidence','extraction_confidence','membership_confidence','version','char_start','char_end',
   'mention_count','article_count','title_article_count','category_confidence'].includes(field)) return 'numeric'
 return 'text'
}
function pk(table) {
 if(noUnique.has(table)) return []
 return table==='article_entities'?['article_id','entity_id']:
   table==='event_articles'?['event_id','article_id']:
   table==='gdelt_staging_runs'?['run_id']:['id']
}
async function insert(db,table,values) {
 const columns=Object.keys(values)
 return db.query({text:'insert into public.'+qi(table)+'('+columns.map(qi).join(',')+') values ('+
   columns.map((_,i)=>'$'+(i+1)).join(',')+')',values:columns.map(k=>values[k])})
}

test('historical executor: real PostgreSQL 17.6 dblink acquisition, immutable custody and ACLs',
 {skip:!armed,timeout:180000},async t=>{
  const suffix=randomBytes(6).toString('hex')
  const names={qik:'mip_hist_qik_'+suffix,nie:'mip_hist_nie_'+suffix,yhb:'mip_hist_yhb_'+suffix}
  const createdDatabases=[],createdRoles=[],clients=[]
  let admin
  async function connect(database,user='postgres',password=fixturePassword) {
    const client=new pg.Client({host:'127.0.0.1',port:5432,database,user,password,ssl:false,
      connectionTimeoutMillis:5000,statement_timeout:115000,application_name:'mip_historical_synthetic_only'})
    // Sanitize ALL database failures before node:test can serialize them.
    client.on('error',()=>{})
    try {await client.connect()} catch {throw new Error('synthetic_connection_failed')}
    clients.push(client)
    return {raw:client,query:async input=>{
      try {return await client.query(input)}
      catch(error) {throw Object.assign(new Error('synthetic_pg_'+(error.code??'failure')),{code:error.code})}
    }}
  }
  async function role(name,login=false,requiredAbsent=false) {
    const existing=await admin.query({text:'select 1 from pg_roles where rolname=$1',values:[name]})
    if(existing.rows.length) {
      if(requiredAbsent) throw new Error('synthetic_role_collision')
      return
    }
    await admin.query('create role '+qi(name)+' '+(login?'login':'nologin')+
      " noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls"+
      (login?" password '"+fixtureRolePassword+"'":''))
    createdRoles.push(name)
  }
  try {
    admin=await connect('postgres')
    const version=await admin.query('show server_version_num')
    assert.equal(version.rows[0].server_version_num,'170006','qualification requires official PG17.6 fixture')
    for(const name of Object.values(names)) {
      assert.match(name,/^mip_hist_(qik|nie|yhb)_[a-f0-9]{12}$/)
      assert.equal((await admin.query({text:'select 1 from pg_database where datname=$1',values:[name]})).rows.length,0)
      await admin.query('create database '+qi(name))
      createdDatabases.push(name)
    }
    for(const roleName of ['anon','authenticated','service_role']) await role(roleName)
    await role('mip_history_owner',false,true)
    await role('mip_history_executor',true,true)
    await role('mip_history_source_reader',true,true)
    await role('mip_history_anonymous_fixture',true,true)
    const qik=await connect(names.qik)
    const sources={
      [PROJECTS.nie]:await connect(names.nie),
      [PROJECTS.yhb]:await connect(names.yhb),
    }
    for(const [project,db] of Object.entries(sources)) {
      for(const [table,fields] of Object.entries(FIELD_CONTRACTS[project])) {
        const keys=pk(table)
        await db.query('create table public.'+qi(table)+' ('+
          fields.map(f=>qi(f)+' '+columnType(f)).join(',')+
          (keys.length?',primary key('+keys.map(qi).join(',')+')':'')+')')
      }
      await db.query('create schema storage')
      await db.query('create table storage.objects(id uuid primary key,bucket_id text,name text,version text,metadata jsonb,updated_at timestamptz)')
      await db.query('grant usage on schema public,storage to mip_history_source_reader')
      await db.query('grant select on all tables in schema public,storage to mip_history_source_reader')
      await insert(db,'outlets',{id:ids.outlet,name:'Synthetic outlet'})
      await insert(db,'authors',{id:ids.author,name:'Synthetic café 日本',outlet_ids:JSON.stringify([ids.outlet])})
      await insert(db,'articles',{id:ids.article,author_id:ids.author,outlet_id:ids.outlet,
        title:'before café 日本 😀',summary:null,claims:'{"exact":9007199254740993.123456789,"null":null}'})
      await insert(db,'events',{id:ids.event,canonical_title:'Synthetic event'})
      await insert(db,'event_articles',{event_id:ids.event,article_id:ids.article})
      await insert(db,'claims',{id:ids.claim,event_id:ids.event,canonical_text:'Synthetic claim'})
      await insert(db,'article_claims',{id:ids.link,article_id:ids.article,claim_id:ids.claim,version:'9007199254740993'})
    }
    for(let n=0;n<2;n++) await insert(sources[PROJECTS.nie],'articles_decode_backup_20260726',
      {id:ids.article,title:'duplicate original',summary:null,body_text:'Unicode résumé 😀',claims:'{"n":9007199254740993.123456789}'})
    await insert(sources[PROJECTS.nie],'articles_decode_backup_20260726_r3',
      {id:ids.article,column_name:'title',old_value:'plain historic title; not an inferred foreign key'})

    await qik.query('create schema extensions')
    await qik.query('create extension dblink with schema extensions')
    await qik.query('create extension pgcrypto with schema extensions')
    // Explicit surrogate for the *shape* used by acquisition. This is NOT proof
    // of Supabase Vault encryption/permissions/logging or live compatibility.
    await qik.query('create schema vault')
    await qik.query('create table vault.synthetic_fixture_secrets(id uuid primary key,decrypted_secret text not null)')
    await qik.query('create view vault.decrypted_secrets as select id,decrypted_secret from vault.synthetic_fixture_secrets')
    await qik.query('grant usage on schema vault,extensions to mip_history_owner')
    await qik.query('grant select on vault.decrypted_secrets to mip_history_owner')
    await qik.query('create table public.publication_sentinel(id integer primary key,state text)')
    await qik.query("insert into public.publication_sentinel values(1,'unchanged')")
    await qik.query(await readFile(new URL('../supabase/qualification/historical-qik-executor/candidate.sql',import.meta.url),'utf8'))
    const vaultIds={[PROJECTS.nie]:randomUUID(),[PROJECTS.yhb]:randomUUID()}
    for(const [project,name] of [[PROJECTS.nie,names.nie],[PROJECTS.yhb,names.yhb]]) {
      const conn='host=127.0.0.1 port=5432 dbname='+name+
        ' user=mip_history_source_reader password='+fixtureRolePassword+' connect_timeout=5 options=-csearch_path='
      await qik.query({text:'insert into vault.synthetic_fixture_secrets values($1,$2)',values:[vaultIds[project],conn]})
    }
    for(const stmt of sourceContractStatements(vaultIds)) await qik.query(stmt)
    const routeHash=fingerprintPayload({synthetic:suffix})
    const qualification={material_host:'qik_only',synthetic_fixture_only:true,
      engine_sha:'b5b80ee37c6cd068d17f59b506bab6df70839ea6',acl_verified:true,
      cost_ceiling_verified:true,full_engine_capacity_verified:true,runtime:'qik_edge',
      measured_cpu_ms:1,measured_peak_bytes:10000000,measured_wall_ms:1000,
      measured_records:10000,measured_objects:100,measured_manifest_bytes:10000000,
      measured_max_unit_bytes:134217728}
    // Fictional fixture-only capacity values exercise admission branches. They
    // MUST NOT be copied into a real route qualification row.
    await qik.query({text:`insert into mip_history.route(singleton,project,qualified,
      authorization_sha256,route_sha256,executor,max_export_bytes,max_export_rows,
      max_unit_bytes,max_manifest_bytes,qualification)
      values(true,$1,true,$2,$2,'mip_history_executor',10000000,10000,134217728,10000000,$3)`,
      values:[PROJECTS.qik,routeHash,qualification]})
    const executor=await connect(names.qik,'mip_history_executor',fixtureRolePassword)
    const anonymous=await connect(names.qik,'mip_history_anonymous_fixture',fixtureRolePassword)
    const sourceReader=await connect(names.nie,'mip_history_source_reader',fixtureRolePassword)
    let lostCommit=false,lostCheckpoint=false,readbacks=0
    const transport={query:async input=>{
      const result=await executor.query(input)
      if(input.text.startsWith('select p.ordinal,p.body')) readbacks++
      if(lostCommit&&input.text.startsWith('select mip_history.commit_unit')) {
        lostCommit=false;throw new Error('synthetic_lost_commit_ack')
      }
      if(lostCheckpoint&&input.text.startsWith('select mip_history.cas_checkpoint')) {
        lostCheckpoint=false;throw new Error('synthetic_lost_checkpoint_ack')
      }
      return result
    }}
    const adapter=createQikHistoricalExecutor(transport)

    await t.test('real principals deny credentials, mutation and anonymous access; source SELECT-only',async()=>{
      assert.equal((await executor.query('select session_user as role')).rows[0].role,'mip_history_executor')
      for(const sql of ['select * from mip_history.payload','select mip_history.acquire(null::uuid)'])
        await assert.rejects(()=>anonymous.query(sql),e=>e.code==='42501')
      for(const sql of ['select * from vault.decrypted_secrets','select * from mip_history.source_contract',
        'update mip_history.route set qualified=true','delete from mip_history.payload'])
        await assert.rejects(()=>executor.query(sql),e=>e.code==='42501')
      await assert.rejects(()=>sourceReader.query("update public.articles set title='forbidden'"),e=>e.code==='42501')
      const rls=await qik.query(`select bool_and(c.relrowsecurity and c.relforcerowsecurity) ok
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='mip_history' and c.relkind='r'`)
      assert.equal(rls.rows[0].ok,true)
    })

    const operation=randomUUID()
    await t.test('one original RR snapshot survives concurrent source change during acquisition',async()=>{
      const original=buildSourceContract(PROJECTS.nie).inventory_sql
      await qik.query({text:'update mip_history.source_contract set inventory_sql=$1 where project=$2',
        values:["select x.v from ("+original+") x(v) cross join (select pg_advisory_xact_lock(732419)) gate",PROJECTS.nie]})
      await sources[PROJECTS.nie].query('select pg_advisory_lock(732419)')
      const acquisition=adapter.acquire(operation)
      let waitSeen=false
      try {
        for(let tries=0;tries<150;tries++) {
          const waiting=await sources[PROJECTS.nie].query(`select count(*)::int n from pg_stat_activity
            where usename='mip_history_source_reader' and wait_event='advisory'`)
          if(waiting.rows[0].n>0) {waitSeen=true;break}
          await new Promise(resolve=>setTimeout(resolve,20))
        }
        assert.equal(waitSeen,true,'dblink transaction reached controlled snapshot gate')
        await sources[PROJECTS.nie].query("update public.articles set title='after changed source'")
      } finally {await sources[PROJECTS.nie].query('select pg_advisory_unlock(732419)')}
      assert.equal((await acquisition).state,'acquired')
      await qik.query({text:'update mip_history.source_contract set inventory_sql=$1 where project=$2',
        values:[original,PROJECTS.nie]})
      const frozen=await executor.query({text:`select convert_from(body,'UTF8') body from mip_history.payload
        where operation_id=$1 and project=$2 and table_name='articles'`,values:[operation,PROJECTS.nie]})
      assert.ok(frozen.rows[0].body.includes('before café 日本 😀'))
      assert.ok(!frozen.rows[0].body.includes('after changed source'))
      await assert.rejects(()=>adapter.acquire(operation),e=>e.code==='adapter_operation_failed')
    })
    await t.test('lossless canonical seal preserves duplicates, Unicode, null and exact native numbers',async()=>{
      assert.equal((await adapter.seal(operation,{manifest_limits:limits})).state,'sealed')
      const payload=await executor.query({text:`select table_name,record_meta,convert_from(body,'UTF8') body
        from mip_history.payload where operation_id=$1 and project=$2 order by ordinal`,values:[operation,PROJECTS.nie]})
      const backup=payload.rows.filter(r=>r.table_name==='articles_decode_backup_20260726')
      assert.equal(backup.length,2)
      assert.equal(backup[0].body,backup[1].body)
      assert.notEqual(backup[0].record_meta.identity.source_id,backup[1].record_meta.identity.source_id)
      assert.ok(backup[0].body.includes('9007199254740993.123456789'))
      assert.ok(backup[0].body.includes('"summary":null'))
      assert.ok(backup[0].body.includes('résumé 😀'))
      await assert.rejects(()=>qik.query({text:'update mip_history.payload set body=body where operation_id=$1',values:[operation]}))
      await assert.rejects(()=>qik.query({text:"update mip_history.export set state='acquired' where operation_id=$1",values:[operation]}))
    })
    await t.test('ambiguous commits/CAS reconcile actual independent reads and exact original export',async()=>{
      lostCommit=true;lostCheckpoint=true
      const first=await adapter.resume(operation,{manifest_limits:limits,max_units:1})
      assert.equal(first.state,'budget_paused')
      assert.ok(readbacks>=2)
      await sources[PROJECTS.nie].query('revoke select on all tables in schema public,storage from mip_history_source_reader')
      try {
        const second=await adapter.resume(operation,{manifest_limits:limits,max_units:100})
        assert.equal(second.state,'readback_verified')
        const third=await adapter.resume(operation,{manifest_limits:limits,max_units:100})
        assert.equal(third.state,'readback_verified');assert.equal(third.verified_this_invocation,0)
      } finally {await sources[PROJECTS.nie].query('grant select on all tables in schema public,storage to mip_history_source_reader')}
      const checkpoint=(await executor.query({text:'select value from mip_history.checkpoint where operation_id=$1',values:[operation]})).rows[0].value
      const stale=await executor.query({text:'select mip_history.cas_checkpoint($1,$2,$3) stored',
        values:[operation,'0'.repeat(64),checkpoint]})
      assert.equal(stale.rows[0].stored,false)
      const unit=(await executor.query({text:'select * from mip_history.unit where operation_id=$1 limit 1',values:[operation]})).rows[0]
      await assert.rejects(()=>executor.query({text:'select mip_history.commit_unit($1,$2,$3,$4,$5,$6)',
        values:[operation,unit.manifest_sha256,unit.unit_id,'0'.repeat(64),unit.ordinals,unit.receipt]}))
      assert.deepEqual((await qik.query('select * from public.publication_sentinel')).rows,[{id:1,state:'unchanged'}])
    })
    await t.test('nonempty original object inventory rolls back the complete failed acquisition',async()=>{
      const failed=randomUUID()
      await sources[PROJECTS.nie].query({text:'insert into storage.objects(id,bucket_id,name,version) values($1,$2,$3,$4)',
        values:[randomUUID(),'fixture-private','synthetic-object','one']})
      try {await assert.rejects(()=>adapter.acquire(failed))}
      finally {await sources[PROJECTS.nie].query('delete from storage.objects')}
      assert.equal((await executor.query({text:'select count(*)::int n from mip_history.export where operation_id=$1',values:[failed]})).rows[0].n,0)
      assert.equal((await executor.query({text:'select count(*)::int n from mip_history.payload where operation_id=$1',values:[failed]})).rows[0].n,0)
    })
    await t.test('SQL acquisition errors leave no mixed partial attempt',async()=>{
      const failed=randomUUID()
      const original=buildSourceContract(PROJECTS.yhb).families.find(f=>f.table_name==='articles').select_sql
      await qik.query({text:"update mip_history.family_contract set select_sql='select nonexistent_column from public.articles' where project=$1 and table_name='articles'",values:[PROJECTS.yhb]})
      try {await assert.rejects(()=>adapter.acquire(failed))}
      finally {await qik.query({text:"update mip_history.family_contract set select_sql=$1 where project=$2 and table_name='articles'",values:[original,PROJECTS.yhb]})}
      assert.equal((await executor.query({text:'select count(*)::int n from mip_history.export where operation_id=$1',values:[failed]})).rows[0].n,0)
    })
    await t.test('bounded root-pair preflight refuses before recursive payload closure',async()=>{
      const failed=randomUUID(),bounded=buildSourceContract(PROJECTS.nie,{max_root_pairs:1,max_rows:1})
      await qik.query({text:'update mip_history.source_contract set inventory_sql=$1 where project=$2',values:[bounded.inventory_sql,PROJECTS.nie]})
      try {await assert.rejects(()=>adapter.acquire(failed))}
      finally {await qik.query({text:'update mip_history.source_contract set inventory_sql=$1 where project=$2',values:[buildSourceContract(PROJECTS.nie).inventory_sql,PROJECTS.nie]})}
      assert.equal((await executor.query({text:'select count(*)::int n from mip_history.export where operation_id=$1',values:[failed]})).rows[0].n,0)
    })
    await t.test('historical-only rows remain captured; unchanged planner refuses missing current root',async()=>{
      const failed=randomUUID()
      await insert(sources[PROJECTS.nie],'articles_decode_backup_20260726',{id:ids.missing,title:'historical-only original'})
      try {
        assert.equal((await adapter.acquire(failed)).state,'acquired')
        await assert.rejects(()=>adapter.seal(failed,{manifest_limits:limits}))
        const original=(await executor.query({text:"select count(*)::int n from mip_history.payload where operation_id=$1 and table_name='articles_decode_backup_20260726'",values:[failed]})).rows[0].n
        assert.equal(original,3)
        await assert.rejects(()=>adapter.resume(failed,{manifest_limits:limits}),e=>e.code==='original_export_unavailable')
      } finally {await sources[PROJECTS.nie].query({text:'delete from public.articles_decode_backup_20260726 where id=$1',values:[ids.missing]})}
    })
    await t.test('missing array reference/null historical root refuses closure without fabrication',async()=>{
      await sources[PROJECTS.nie].query({text:'update public.authors set outlet_ids=$1',values:[JSON.stringify([ids.missing])]})
      try {
        const failed=randomUUID()
        await adapter.acquire(failed)
        await assert.rejects(()=>adapter.seal(failed,{manifest_limits:limits}))
      } finally {await sources[PROJECTS.nie].query({text:'update public.authors set outlet_ids=$1',values:[JSON.stringify([ids.outlet])]})}
      await insert(sources[PROJECTS.nie],'articles_decode_backup_20260726',{id:null,title:'null historical native root'})
      try {
        const failed=randomUUID()
        await adapter.acquire(failed)
        await assert.rejects(()=>adapter.seal(failed,{manifest_limits:limits}))
      } finally {await sources[PROJECTS.nie].query('delete from public.articles_decode_backup_20260726 where id is null')}
    })
  } finally {
    // Ownership-recorded teardown only. Never accept a user-provided database or
    // role name; refuse preexisting fixed-role collisions before mutations.
    for(const client of clients.slice().reverse()) {
      if(client===admin?.raw) continue
      try {await client.end()} catch {}
    }
    if(admin) {
      for(const name of createdDatabases.slice().reverse()) {
        assert.match(name,/^mip_hist_(qik|nie|yhb)_[a-f0-9]{12}$/)
        await admin.query('drop database '+qi(name)+' with (force)')
      }
      for(const name of createdRoles.slice().reverse()) await admin.query('drop role '+qi(name))
      await admin.raw.end()
    }
  }
})
