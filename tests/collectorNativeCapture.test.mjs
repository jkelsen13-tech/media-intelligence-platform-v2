import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {decodeCanonical} from '../supabase/qualification/content-addressed-storage/store.mjs'
import {installCaptureCas, cleanupCaptureCas, createSessionCall} from '../supabase/qualification/content-addressed-storage/installCaptureCas.mjs'
import {bindExactCaptureBytes, assertCaptureHash, sha256Hex} from '../supabase/qualification/content-addressed-storage/bindExactCaptureBytes.mjs'
import {runQikIngestCollector} from '../supabase/qualification/qik-ingest/collector.mjs'
import {
  FEED,
  cleanupQikIngest,
  createDisposableDb,
  createPipelineRpc,
  enableDisposableWriter,
  installQikIngest,
  loadNativeSubstrate,
  loadQikIngest,
  rpc,
} from './qikIngestTestKit.mjs'

const fixture = JSON.parse(await readFile(new URL('../supabase/qualification/content-addressed-storage/fixtures/synthetic-canonical.json', import.meta.url), 'utf8'))
const investigation = '00000000-0000-4000-8000-000000000001'
const alice = '00000000-0000-4000-8000-000000000003'
const DISPOSABLE_TEST_TOKEN = 'qik-ingest-disposable-test-token'

async function scalar(db, sql, params = []) {
  const row = (await db.query(sql, params)).rows[0]
  return row ? Object.values(row)[0] : null
}

async function seedIdentity(db, scope, raw, provenance = fixture.provenance) {
  const bytes = Buffer.from(raw)
  await db.query(
    'insert into mip_cas.source_identities values(gen_random_uuid(),$1::uuid,$2,$3,$4,$5::timestamptz)',
    [scope, provenance.source_version, sha256Hex(bytes), bytes.length, provenance.acquired_at])
  await db.query(
    `insert into mip_cas.source_permissions values($1::uuid,$2,$3,$4,clock_timestamp()+interval '1 hour') on conflict do nothing`,
    [scope, provenance.source_version, provenance.rights_ref, provenance.privacy_ref])
}

test('composed collector observe → native handoff → history → reused C4 bind', async t => {
  const {db, exec} = await createDisposableDb()
  t.after(() => db.close())
  await loadQikIngest(exec)
  await enableDisposableWriter(db)
  await db.exec(`
    create role unrelated_reader nologin;
    grant select on public.articles to unrelated_reader;
  `)
  await installCaptureCas(exec)
  await db.exec("create role cas_alice login; grant mip_cas_gateway to cas_alice;")
  await db.query('insert into mip_cas.principals values($1,$2::uuid)', ['cas_alice', alice])
  await db.query(`insert into mip_cas.access values($1::uuid,$2::uuid,clock_timestamp()+interval '1 hour')`, [alice, investigation])

  const pipelineRpc = createPipelineRpc(db)
  const result = await runQikIngestCollector({
    rpc: rpc(db),
    pipelineRpc,
    token: DISPOSABLE_TEST_TOKEN,
    runId: 'composed-run-1',
    now: '2026-09-26T19:00:00Z',
    fetchText: async () => FEED,
  })
  assert.equal(result.body.inserted, 2)
  assert.equal(result.body.revisions, 0)
  assert.equal(await scalar(db, 'select count(*)::int from evidence_pipeline.import_jobs'), 2)
  assert.equal(await scalar(db, 'select count(*)::int from evidence_pipeline.article_captures'), 2)
  assert.equal(await scalar(db, `select count(*)::int from evidence_pipeline.record_versions where record_kind='article' and operation='insert'`), 2)
  assert.equal(await scalar(db, `select count(*)::int from public.articles where url='https://news.example/preexisting'`), 1)
  assert.equal(await scalar(db, `select reader_state from public.articles where url='https://news.example/water'`), 'pending_review')

  const cap = (await db.query(`
    select id, content_hash, convert_to(payload::text,'UTF8') bytes
    from evidence_pipeline.article_captures
    where payload->>'url'='https://news.example/water'
  `)).rows[0]
  const payloadBytes = Buffer.from(cap.bytes)
  assertCaptureHash({payloadBytes, contentHash: cap.content_hash})
  const captureProv = {...fixture.provenance, source_version: 'composed-pipeline-capture-v1'}
  await seedIdentity(db, investigation, payloadBytes, captureProv)
  const receipt = await bindExactCaptureBytes({
    call: createSessionCall(db, 'cas_alice'),
    investigation,
    logicalKey: 'pipeline:' + cap.id,
    payloadBytes,
    contentHash: cap.content_hash,
    provenance: captureProv,
  })
  assert.equal(receipt.committed, true)
  assert.equal(receipt.hash, cap.content_hash)
  const record = await createSessionCall(db, 'cas_alice')('read', [investigation, 'pipeline:' + cap.id, 'canonical'])
  assert.deepEqual(decodeCanonical(record), payloadBytes)

  await db.exec('set role anon')
  await assert.rejects(db.query('select payload from evidence_pipeline.article_captures'), /permission denied|42501/i)
  await db.exec('reset role')

  await db.exec(`
    update qik_ingest.collection_gate set collection_authorized = false;
    update public.ingest_sources set collection_enabled = false, enabled = false;
  `)
  await cleanupCaptureCas(exec)
  await cleanupQikIngest(exec)
  assert.equal(await scalar(db, "select count(*)::int from pg_namespace where nspname in ('mip_cas','qik_ingest','qik_ingest_operation')"), 0)
  assert.equal(await scalar(db, 'select count(*)::int from public.articles'), 3)
  assert.equal(await scalar(db, "select has_table_privilege('unrelated_reader','public.articles','SELECT')"), true)
})

test('C3/C4 cleanup boundaries: unrelated objects, external dependents, interrupted install', async t => {
  await t.test('unrelated same-role object and extra grant refuse C3 cleanup', async () => {
    const {db, exec} = await createDisposableDb()
    t.after(() => db.close())
    await loadQikIngest(exec)
    await db.exec(`
      create role unrelated_reader nologin;
      grant select on public.articles to unrelated_reader;
      grant select on public.nodes to qik_ingest_runtime;
    `)
    await assert.rejects(cleanupQikIngest(exec), /qik_ingest_unrelated_privilege/)
    await db.exec('revoke select on public.nodes from qik_ingest_runtime')
    await db.exec('create table qik_ingest.unexpected(id int)')
    await assert.rejects(cleanupQikIngest(exec), /qik_ingest_unexpected_object/)
    assert.equal(await scalar(db, "select to_regclass('qik_ingest.unexpected') is not null"), true)
    assert.equal(await scalar(db, "select to_regclass('qik_ingest.collection_gate') is not null"), true)
    await db.exec('drop table qik_ingest.unexpected')
    await cleanupQikIngest(exec)
    assert.equal(await scalar(db, "select has_table_privilege('unrelated_reader','public.articles','SELECT')"), true)
    assert.equal(await scalar(db, 'select count(*)::int from public.articles'), 1)
  })

  await t.test('interrupted C3 install is ledger-bound and restores the original collection constraint', async () => {
    const {db, exec} = await createDisposableDb()
    t.after(() => db.close())
    await loadNativeSubstrate(exec)
    await installQikIngest(exec, {until: '010_collection_gate.sql'})
    assert.equal(await scalar(db, "select to_regclass('qik_ingest.collection_gate') is not null"), true)
    assert.equal(await scalar(db, "select to_regclass('qik_ingest.schedule_intent') is not null"), false)
    await cleanupQikIngest(exec)
    assert.equal(await scalar(db, "select to_regnamespace('qik_ingest') is not null"), false)
    await assert.rejects(
      db.exec(`update public.ingest_sources set collection_enabled = true
        where id = '11111111-1111-4111-8111-111111111111'`),
      /collection_enabled|check/i,
    )
    assert.equal(await scalar(db, 'select count(*)::int from public.articles'), 1)
  })

  await t.test('C4 refuses unapproved public view/trigger dependents and role-owned extras', async () => {
    const {db, exec} = await createDisposableDb()
    t.after(() => db.close())
    await loadNativeSubstrate(exec)
    await installCaptureCas(exec)
    await db.exec('create view public.cas_unapproved_dep as select 1 as n from mip_cas.policy()')
    await db.exec(`
      create function public.cas_unapproved_trig() returns trigger language plpgsql as $$
      begin
        perform mip_cas.policy();
        return new;
      end $$;
      create trigger cas_unapproved_articles
        before insert on public.articles
        for each row execute function public.cas_unapproved_trig();
    `)
    await assert.rejects(cleanupCaptureCas(exec), /mip_cas_unapproved_external_dependent/)
    assert.equal(await scalar(db, "select to_regclass('public.cas_unapproved_dep') is not null"), true)
    assert.equal(await scalar(db, "select to_regclass('public.articles') is not null"), true)
    await db.exec('drop trigger cas_unapproved_articles on public.articles')
    await db.exec('drop function public.cas_unapproved_trig()')
    await db.exec('drop view public.cas_unapproved_dep')
    await db.exec('create table public.cas_role_extra(id int); alter table public.cas_role_extra owner to mip_cas_owner')
    await assert.rejects(cleanupCaptureCas(exec), /mip_cas_role_still_owns_objects/)
    await db.exec('drop table public.cas_role_extra')
    await cleanupCaptureCas(exec)
    assert.equal(await scalar(db, "select to_regclass('public.articles') is not null"), true)
    assert.equal(await scalar(db, "select count(*)::int from pg_namespace where nspname='mip_cas'"), 0)
  })
})
