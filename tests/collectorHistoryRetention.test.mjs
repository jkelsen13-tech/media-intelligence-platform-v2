import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const migration = await readFile(new URL('../supabase/migrations/20260908180013_collector_history_retention.sql', import.meta.url),'utf8')
const source='yhbwnrtlqbjtcrrlpbge', observed='2026-01-01T00:00:00Z'
async function fixture(t) {
  const db=await PGlite.create(); t.after(()=>db.close())
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema mip_private;')
  await db.exec(migration)
  return db
}
const retain=(db,rows,relation='ingestion_runs',project=source)=>db.query(
  'select mip_private.retain_collector_rows($1,$2,$3,$4::jsonb) r',[project,relation,observed,typeof rows==='string'?rows:JSON.stringify(rows)]).then(r=>r.rows[0].r)
const count=db=>db.query('select count(*)::int n from mip_private.collector_row_versions').then(r=>r.rows[0].n)

test('collector retention preserves revised payloads, source identities and exact numeric/time values',async t=>{
  const db=await fixture(t); await db.exec('set role service_role')
  const raw='[{"run_id":"same","state":"completed","counters":{"n":9007199254740993},"completed_at":"2026-01-01T00:00:00.123456+00:00","notes":null}]'
  assert.equal((await retain(db,raw)).inserted,1)
  assert.equal((await retain(db,raw)).already_retained,1)
  await retain(db,[{run_id:'same',state:'failed',notes:'Correction, not overwrite'}])
  await retain(db,[{run_id:'same',state:'completed'}],'ingestion_runs','niejaejtbxgakyrsntxm')
  await retain(db,[{id:'same',run_id:'same',ingest_source_id:'source-1'}],'ingestion_source_runs')
  assert.equal(await count(db),4)
  const preserved=(await db.query("select payload->'counters'->>'n' as n,payload->>'completed_at' as time from mip_private.collector_row_versions where payload ? 'counters'")).rows[0]
  assert.deepEqual(preserved,{n:'9007199254740993',time:'2026-01-01T00:00:00.123456+00:00'})
})
test('duplicate identities, invalid batches and partial failures cannot silently lose or partially retain history',async t=>{
  const db=await fixture(t)
  for(const rows of [[],{},null,[null],[{}],[{run_id:null}],[{run_id:'a'},{run_id:'a',state:'changed'}],Array.from({length:251},(_,i)=>({run_id:String(i)})),[{run_id:'large',notes:'x'.repeat(2097152)}]]) {
    await assert.rejects(retain(db,rows)); assert.equal(await count(db),0)
  }
  await assert.rejects(retain(db,[{run_id:'a'}],'credentials'))
  await assert.rejects(retain(db,[{run_id:'a'}],'ingestion_runs','unknown-project'))
  await assert.rejects(retain(db,[{run_id:'valid'},{run_id:'x'.repeat(513)}]))
  assert.equal(await count(db),0,'a later invalid row rolls back earlier insertion')
  await db.exec('begin'); await retain(db,[{run_id:'rolled-back'}]); await db.exec('rollback')
  assert.equal(await count(db),0)
})
test('browser principals cannot read or import and worker/owner mutation paths cannot rewrite retained rows',async t=>{
  const db=await fixture(t); await retain(db,[{run_id:'history'}])
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role)
    await assert.rejects(count(db),/permission denied/)
    await assert.rejects(retain(db,[{run_id:'denied'}]),/permission denied/)
    await db.exec('reset role')
  }
  await db.exec('set role service_role')
  for(const sql of ["update mip_private.collector_row_versions set source_key=source_key",'delete from mip_private.collector_row_versions','truncate mip_private.collector_row_versions']) await assert.rejects(db.exec(sql),/permission denied/)
  await db.exec('reset role')
  for(const sql of ["update mip_private.collector_row_versions set source_key=source_key",'delete from mip_private.collector_row_versions','truncate mip_private.collector_row_versions']) await assert.rejects(db.exec(sql),/collector_history_is_immutable/)
  const before=await count(db)
  await assert.rejects(db.query("insert into mip_private.collector_row_versions(source_project,source_relation,source_key,payload_hash,payload,source_observed_at) values($1,'ingestion_runs','forged',repeat('0',64),'{\"run_id\":\"other\"}',$2)",[source,observed]),/check constraint/)
  assert.equal(await count(db),before)
  const fn=(await db.query("select prosecdef,proconfig from pg_proc where pronamespace='mip_private'::regnamespace and proname='retain_collector_rows'")).rows[0]
  assert.equal(fn.prosecdef,false); assert.ok(fn.proconfig.includes('search_path=""'))
  const table=(await db.query("select relrowsecurity from pg_class where oid='mip_private.collector_row_versions'::regclass")).rows[0]
  assert.equal(table.relrowsecurity,true)
})
