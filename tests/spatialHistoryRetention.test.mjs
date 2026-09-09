import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../supabase/migrations/20260909181233_spatial_history_retention.sql', import.meta.url), 'utf8')
const parentMigration = await readFile(new URL('../supabase/migrations/20260909190228_spatial_parent_retention.sql', import.meta.url), 'utf8')
const ancestorPatch = await readFile(new URL('../supabase/migrations/20260909191503_spatial_source_ancestor.sql', import.meta.url), 'utf8')
const source = 'jfnzyvzthzqtczlxhjll', observed = '2026-01-01T00:00:00Z'
async function fixture(t) {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema mip_private; grant usage on schema mip_private to anon, authenticated; create schema spatial; create table spatial.assertions(id text primary key, decision text);')
  await db.exec("insert into spatial.assertions values ('shared', 'survivor decision')")
  await db.exec(migration)
  await db.exec(parentMigration)
  await db.exec(ancestorPatch)
  return db
}
const retain = (db, rows, relation = 'spatial.assertions', project = source, time = observed) =>
  db.query('select mip_private.retain_spatial_rows($1,$2,$3,$4::jsonb) r',
    [project, relation, time, typeof rows === 'string' ? rows : JSON.stringify(rows)]).then(r => r.rows[0].r)
const count = db => db.query('select count(*)::int n from mip_private.spatial_row_versions').then(r => r.rows[0].n)

test('sandbox history keeps independent relation identities, revisions and original decisions without changing live assertions', async t => {
  const db = await fixture(t); await db.exec('set role service_role')
  assert.equal((await retain(db, [{id: 'shared', decision: 'sandbox withheld'}])).inserted, 1)
  assert.equal((await retain(db, [{id: 'shared', decision: 'sandbox withheld'}], undefined, undefined, '2026-01-02T00:00:00Z')).already_retained, 1)
  await retain(db, [{id: 'shared', decision: 'sandbox correction'}])
  await retain(db, [{id: 'shared', assertion_id: 'shared', effective_at: '2026-01-01'}], 'spatial.release_decisions')
  assert.equal(await count(db), 3)
  const retained = (await db.query("select source_observed_at::text as observed from mip_private.spatial_row_versions where payload->>'decision'='sandbox withheld'")).rows[0]
  assert.match(retained.observed, /^2026-01-01/)
  await db.exec('reset role')
  assert.deepEqual((await db.query('select * from spatial.assertions')).rows, [{id: 'shared', decision: 'survivor decision'}])
})

test('raw PostgreSQL JSON retains exact geometry, large ordinals, native time, nulls and array order', async t => {
  const db = await fixture(t)
  const raw = '[{"id":"precise","ordinal":9007199254740993,"geometry":{"coordinates":[-82.123456789012345678,41.000000000000000001]},"source_native_time":"2026-01-01T00:00:00.123456+05:30","guard_start_utc":"2025-12-31T18:30:00.123456+00:00","reason":null,"evidence":["b","a"]}]'
  await retain(db, raw, 'spatial.assertion_revisions')
  const p = (await db.query("select payload->>'ordinal' as ordinal, payload#>>'{geometry,coordinates,0}' as longitude, payload#>>'{geometry,coordinates,1}' as latitude, payload->>'source_native_time' as native_time, payload->>'guard_start_utc' as guard_time, payload->'reason' as reason, payload->'evidence' as evidence from mip_private.spatial_row_versions")).rows[0]
  assert.deepEqual(p, {ordinal: '9007199254740993', longitude: '-82.123456789012345678', latitude: '41.000000000000000001', native_time: '2026-01-01T00:00:00.123456+05:30', guard_time: '2025-12-31T18:30:00.123456+00:00', reason: null, evidence: ['b','a']})
})

test('malformed identities, unscoped sources, nonfinite times and partial batches fail atomically', async t => {
  const db = await fixture(t)
  for (const rows of [[], {}, null, [null], [{}], [{id: null}], [{id: 1}], [{id: []}], [{id: ''}], [{id:'a'}, {id:'a', revision:2}], Array.from({length:251}, (_,i) => ({id:String(i)})), [{id:'large', note:'x'.repeat(2097152)}]]) {
    await assert.rejects(retain(db, rows)); assert.equal(await count(db), 0)
  }
  for (const time of [null, 'infinity', '-infinity', '2999-01-01T00:00:00Z']) await assert.rejects(retain(db, [{id:'a'}], undefined, undefined, time))
  for (const relation of ['assertions', 'auth.users', 'public.nodes', null]) await assert.rejects(retain(db, [{id:'a'}], relation))
  for (const project of ['qikvmopbtijoebdqosyq', 'unknown-project', null]) await assert.rejects(retain(db, [{id:'a'}], undefined, project))
  await assert.rejects(retain(db, [{id:'valid'}, {id:'x'.repeat(513)}]))
  assert.equal(await count(db), 0, 'late row rejection rolls back earlier insertion')
  await db.exec('begin'); await retain(db, [{id:'rolled-back'}]); await db.exec('rollback')
  assert.equal(await count(db), 0)
})

test('browser access stays denied even with schema usage; worker and owner DML cannot rewrite history', async t => {
  const db = await fixture(t); await retain(db, [{id:'history'}])
  for (const role of ['anon','authenticated']) {
    await db.exec('set role ' + role)
    await assert.rejects(count(db), /permission denied/)
    await assert.rejects(retain(db, [{id:'denied'}]), /permission denied/)
    await db.exec('reset role')
  }
  for (const role of ['service_role', null]) {
    await db.exec(role ? 'set role ' + role : 'reset role')
    for (const sql of ['update mip_private.spatial_row_versions set source_key=source_key', 'delete from mip_private.spatial_row_versions', 'truncate mip_private.spatial_row_versions'])
      await assert.rejects(db.exec(sql), role ? /permission denied/ : /spatial_history_is_immutable/)
  }
  assert.equal(await count(db), 1)
  const fn = (await db.query("select prosecdef,proconfig from pg_proc where pronamespace='mip_private'::regnamespace and proname='retain_spatial_rows'")).rows[0]
  assert.equal(fn.prosecdef, false); assert.ok(fn.proconfig.includes('search_path=""'))
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='mip_private.spatial_row_versions'::regclass")).rows[0].relrowsecurity, true)
})

test('direct inserts cannot forge payload hashes, keys or finite observation ordering', async t => {
  const db = await fixture(t); await retain(db, [{id:'history'}])
  for (const values of [
    "'wrong', payload_hash, payload, source_observed_at, retained_at",
    "source_key, repeat('0',64), payload, source_observed_at, retained_at",
    "source_key, payload_hash, payload, 'infinity'::timestamptz, retained_at",
    "source_key, payload_hash, payload, source_observed_at, '-infinity'::timestamptz",
    "source_key, payload_hash, payload, retained_at + interval '1 second', retained_at"
  ]) await assert.rejects(db.exec('insert into mip_private.spatial_row_versions(source_project,source_relation,source_key,payload_hash,payload,source_observed_at,retained_at) select source_project,source_relation,' + values + ' from mip_private.spatial_row_versions'), /check constraint/)
  assert.equal(await count(db), 1)
})
