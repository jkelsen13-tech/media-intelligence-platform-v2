import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ALGORITHM_VERSION,
  DISPOSABLE_TEST_TOKEN,
  ENV_RUN_KEY,
  HEADER_RUN_KEY,
  HEADER_SCHEDULER_TOKEN,
  JOB_NAME,
  QIK_PHASE_A_ARTICLES,
  VAULT_SECRET_NAME,
  YHB_FENCE_ARTICLES,
  parseFeed,
  runQikIngestCollector,
} from '../supabase/qualification/qik-ingest/collector.mjs'
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

const root = dirname(fileURLToPath(new URL('../supabase/qualification/qik-ingest/load_order.json', import.meta.url)))
const loadOrder = JSON.parse(await readFile(join(root, 'load_order.json'), 'utf8'))
const sqlOf = name => readFile(join(root, name), 'utf8')

async function fixture(t) {
  const {db, exec} = await createDisposableDb()
  t.after(() => db.close())
  await loadQikIngest(exec)
  return {db, exec}
}

test('source package is live-hold, ordered, and does not activate cron, vault, or browser grants', async () => {
  const files = await readdir(root)
  for (const name of [...loadOrder.apply, ...loadOrder.cleanup, ...loadOrder.never_live, 'README.md', 'LIVE_OPERATION_PASTE.md', '05_operation_ledger.sql']) {
    assert.ok(files.includes(name), name)
  }
  assert.equal(loadOrder.live_hold, true)
  assert.equal(loadOrder.apply[0], '05_operation_ledger.sql')
  assert.equal(loadOrder.yhb_pause_fence_articles, YHB_FENCE_ARTICLES)
  assert.equal(loadOrder.qik_observed_articles_at_phase_a, QIK_PHASE_A_ARTICLES)
  const sql = (await Promise.all([...loadOrder.apply, ...loadOrder.cleanup].map(sqlOf))).join('\n')
    .replace(/--[^\n]*/g, '')
  assert.doesNotMatch(sql, /cron\.schedule|cron\.alter_job|net\.http_post|vault\.create_secret/i)
  assert.doesNotMatch(sql, /grant\s+execute\s+on function[\s\S]{0,200}\s+to\s+(anon|authenticated|public)\b/i)
  assert.doesNotMatch(sql, /freshness['"],\s*'current'/)
  assert.doesNotMatch(sql, /drop owned by|drop schema if exists qik_ingest cascade/i)
  const edge = await readFile(join(root, 'edge/index.ts'), 'utf8')
  const collectorSrc = await readFile(join(root, 'collector.mjs'), 'utf8')
  assert.match(edge, /ENV_RUN_KEY/)
  assert.match(collectorSrc, new RegExp(ENV_RUN_KEY))
  assert.match(edge, /HEADER_RUN_KEY/)
  assert.match(edge, /HEADER_SCHEDULER_TOKEN/)
  assert.match(edge, /mip_qik_ingest_schedule_authorized/)
  assert.match(edge, /mip_pipeline_v1/)
  assert.match(collectorSrc, new RegExp(HEADER_RUN_KEY))
  assert.match(collectorSrc, new RegExp(HEADER_SCHEDULER_TOKEN))
  assert.match(collectorSrc, /drainNativePipeline/)
  assert.doesNotMatch(edge, /INGEST_RSS_RUN_KEY|x-ingest-rss-key|x-ingest-rss-scheduler-token/)
  assert.doesNotMatch(collectorSrc, /INGEST_RSS_RUN_KEY/)
  const paste = await readFile(join(root, 'LIVE_OPERATION_PASTE.md'), 'utf8')
  assert.match(paste, /LIVE HOLD/)
  assert.match(paste, /Not authorization|not authorization/i)
  assert.match(await readFile(join(root, '050_schedule_disabled.sql'), 'utf8'), new RegExp(JOB_NAME))
  assert.match(await readFile(join(root, '050_schedule_disabled.sql'), 'utf8'), new RegExp(VAULT_SECRET_NAME))
  assert.equal(ALGORITHM_VERSION, 'qik-ingest-rss-v1-retain-from-yhb-v8')
})

test('gate stays off: collection_enabled cannot flip and writer is disabled', async t => {
  const {db} = await fixture(t)
  await db.exec(`
    insert into qik_ingest.runtime_credentials(credential_hash, active, notes)
    values (encode(sha256(convert_to('${DISPOSABLE_TEST_TOKEN}', 'UTF8')), 'hex'), true, 'disposable');
  `)
  await assert.rejects(
    db.exec(`update public.ingest_sources set collection_enabled = true
      where id = '11111111-1111-4111-8111-111111111111'`),
    /qik_ingest_collection_not_authorized/,
  )
  await db.exec(`set role qik_ingest_runtime`)
  const plan = (await db.query('select public.mip_qik_ingest_plan($1) r', [DISPOSABLE_TEST_TOKEN])).rows[0].r
  assert.equal(plan.collection_authorized, false)
  assert.deepEqual(plan.sources, [])
  const disabled = await runQikIngestCollector({
    rpc: rpc(db), token: DISPOSABLE_TEST_TOKEN, runId: 'qik-run-disabled',
    fetchText: async () => FEED,
  })
  assert.equal(disabled.httpStatus, 503)
  assert.equal(disabled.body.collection_authorized, false)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from public.ingestion_runs')).rows[0].n, 0)
})

test('identical delivery is idle; changed content uses revision_pending without rewriting reviewed rows', async t => {
  const {db} = await fixture(t)
  await enableDisposableWriter(db)
  const pipelineRpc = createPipelineRpc(db)
  const first = await runQikIngestCollector({
    rpc: rpc(db), pipelineRpc, token: DISPOSABLE_TEST_TOKEN, runId: 'qik-run-dup-1',
    now: '2026-09-26T15:00:00Z', fetchText: async () => FEED,
  })
  assert.equal(first.httpStatus, 200)
  assert.equal(first.body.state, 'completed')
  assert.equal(first.body.inserted, 2)
  assert.equal(first.body.revisions, 0)
  assert.equal(first.body.is_current, false)
  const afterOk = (await db.query('select public.mip_qik_ingest_observe($1) r', [DISPOSABLE_TEST_TOKEN])).rows[0].r
  assert.equal(afterOk.is_current, false)
  assert.equal(afterOk.forward.freshness, 'qik_forward_ok')
  assert.equal((await db.query('select public.mip_qik_ingest_schedule_authorized($1) ok', [DISPOSABLE_TEST_TOKEN])).rows[0].ok, true)
  assert.equal((await db.query('select public.mip_qik_ingest_schedule_authorized($1) ok', ['nope'.repeat(8)])).rows[0].ok, false)
  const jobs = (await db.query('select count(*)::int n from evidence_pipeline.import_jobs')).rows[0].n
  const captures = (await db.query('select count(*)::int n from evidence_pipeline.article_captures')).rows[0].n
  assert.equal(jobs, 2)
  assert.equal(captures, 2)
  const history = (await db.query(`
    select count(*)::int n from evidence_pipeline.record_versions
    where record_kind='article' and operation='insert'
  `)).rows[0].n
  assert.equal(history, 2)

  await db.exec(`update public.articles set reader_state='eligible' where url='https://news.example/water'`)
  const second = await runQikIngestCollector({
    rpc: rpc(db), pipelineRpc, token: DISPOSABLE_TEST_TOKEN, runId: 'qik-run-dup-2',
    now: '2026-09-26T15:05:00Z',
    fetchText: async () => FEED.replace('Council Approves Water Plan', 'CHANGED TITLE'),
  })
  assert.equal(second.body.inserted, 0)
  assert.equal(second.body.revisions, 1)
  assert.equal(second.body.duplicates, 1)
  const row = (await db.query(
    `select title, body_text, reader_state, source_status, claims
     from public.articles where url = 'https://news.example/water'`,
  )).rows[0]
  assert.equal(row.title, 'Council Approves Water Plan')
  assert.equal(row.reader_state, 'eligible')
  assert.equal(row.source_status, 'active')
  assert.deepEqual(row.claims, [])
  const pending = (await db.query(`
    select payload->>'title' as title, review_state
    from evidence_pipeline.article_captures
    where payload->>'title'='CHANGED TITLE'
  `)).rows[0]
  assert.equal(pending.title, 'CHANGED TITLE')
  assert.equal(pending.review_state, 'pending')
  const preexisting = (await db.query(
    `select count(*)::int n from public.articles where url = 'https://news.example/preexisting'`,
  )).rows[0].n
  assert.equal(preexisting, 1)
})

test('publication fields and non-http URLs cannot enter retain', async t => {
  const {db} = await fixture(t)
  await enableDisposableWriter(db)
  await db.query('select public.mip_qik_ingest_begin_run($1,$2,$3::timestamptz)',
    [DISPOSABLE_TEST_TOKEN, 'qik-run-reject', '2026-09-26T16:00:00Z'])
  const source = '11111111-1111-4111-8111-111111111111'
  await assert.rejects(
    db.query('select public.mip_qik_ingest_retain_item($1,$2,$3::uuid,$4::jsonb)',
      [DISPOSABLE_TEST_TOKEN, 'qik-run-reject', source,
        JSON.stringify({ title: 'X', url: 'https://news.example/pub', reader_state: 'eligible' })]),
    /qik_ingest_publication_fields_forbidden/,
  )
  const rejected = (await db.query('select public.mip_qik_ingest_retain_item($1,$2,$3::uuid,$4::jsonb) r',
    [DISPOSABLE_TEST_TOKEN, 'qik-run-reject', source,
      JSON.stringify({ title: 'Bad', url: 'javascript:alert(1)' })])).rows[0].r
  assert.equal(rejected.disposition, 'rejected')
  assert.equal((await db.query(`select count(*)::int n from public.articles where url like 'javascript:%'`)).rows[0].n, 0)
  assert.equal((await db.query(`select count(*)::int n from qik_ingest.observed_items`)).rows[0].n, 0)
  assert.equal((await db.query(`select count(*)::int n from public.articles where reader_state = 'eligible'`)).rows[0].n, 0)
})

test('source failure and inflight recovery never advertise current', async t => {
  const {db} = await fixture(t)
  await enableDisposableWriter(db)
  const failed = await runQikIngestCollector({
    rpc: rpc(db), pipelineRpc: createPipelineRpc(db), token: DISPOSABLE_TEST_TOKEN, runId: 'qik-run-fail',
    now: '2026-09-26T17:00:00Z',
    fetchText: async () => { throw new Error('injected_feed_failure') },
  })
  assert.equal(failed.httpStatus, 502)
  assert.equal(failed.body.state, 'failed')
  assert.equal(failed.body.freshness, 'qik_forward_stale')
  assert.equal(failed.body.is_current, false)

  await db.query('select public.mip_qik_ingest_begin_run($1,$2,$3::timestamptz)',
    [DISPOSABLE_TEST_TOKEN, 'qik-run-inflight', '2026-09-26T17:10:00Z'])
  const observed = (await db.query('select public.mip_qik_ingest_observe($1) r', [DISPOSABLE_TEST_TOKEN])).rows[0].r
  assert.equal(observed.is_current, false)
  assert.equal(observed.forward.freshness, 'qik_forward_inflight')
  assert.equal(observed.inflight_runs.length, 1)
  assert.equal(observed.fence.articles, YHB_FENCE_ARTICLES)
  assert.equal(observed.fence.corpus_transfer, false)
  await db.query(
    'select public.mip_qik_ingest_record_source_run($1,$2,$3::uuid,$4,$5,$6,$7,$8::timestamptz)',
    [DISPOSABLE_TEST_TOKEN, 'qik-run-inflight', '11111111-1111-4111-8111-111111111111',
      'failed', 0, 0, 'still_broken', '2026-09-26T17:12:00Z'],
  )
  await assert.rejects(
    db.query('select public.mip_qik_ingest_finish_run($1,$2,$3,$4::jsonb,$5::timestamptz)',
      [DISPOSABLE_TEST_TOKEN, 'qik-run-inflight', 'completed', '{}', '2026-09-26T17:13:00Z']),
    /qik_ingest_completed_with_failed_sources/,
  )
  const recovered = (await db.query(
    'select public.mip_qik_ingest_recover_inflight($1,$2,$3::timestamptz) r',
    [DISPOSABLE_TEST_TOKEN, 'qik-run-inflight', '2026-09-26T17:14:00Z'],
  )).rows[0].r
  assert.equal(recovered.state, 'failed')
  assert.equal(recovered.freshness, 'qik_forward_stale')
  assert.equal(recovered.is_current, false)
  const fence = (await db.query(
    `select watermark->>'articles' as articles, watermark->>'freshness' as freshness
     from public.mip_consolidation_watermarks
     where channel = 'ingest_pause_fence'`,
  )).rows[0]
  assert.equal(fence.articles, String(YHB_FENCE_ARTICLES))
  assert.equal(fence.freshness, 'fence')
})

test('mixed source failure is completed_with_errors and stays not current', async t => {
  const {db} = await fixture(t)
  await enableDisposableWriter(db)
  await db.exec(`
    update public.ingest_sources
      set enabled = true, collection_enabled = true
      where id = '22222222-2222-4222-8222-222222222222';
  `)
  const mixed = await runQikIngestCollector({
    rpc: rpc(db), pipelineRpc: createPipelineRpc(db), token: DISPOSABLE_TEST_TOKEN, runId: 'qik-run-mixed',
    now: '2026-09-26T18:00:00Z',
    fetchText: async (url) => {
      if (String(url).includes('idle')) throw new Error('injected_second_source_failure')
      return FEED
    },
  })
  assert.equal(mixed.httpStatus, 200)
  assert.equal(mixed.body.state, 'completed_with_errors')
  assert.ok(mixed.body.inserted >= 1)
  assert.equal(mixed.body.source_failures, 1)
  assert.equal(mixed.body.freshness, 'qik_forward_stale')
  assert.equal(mixed.body.is_current, false)
  const observed = (await db.query('select public.mip_qik_ingest_observe($1) r', [DISPOSABLE_TEST_TOKEN])).rows[0].r
  assert.equal(observed.is_current, false)
  assert.equal(observed.forward.freshness, 'qik_forward_stale')
})

test('schedule intent cannot be activated and fence insert does not add articles', async t => {
  const {db} = await fixture(t)
  const before = (await db.query('select count(*)::int n from public.articles')).rows[0].n
  assert.equal(before, 1, 'substrate preexisting row only; 040 must not copy 36183 articles')
  await assert.rejects(
    db.exec(`update qik_ingest.schedule_intent set active = true`),
    /active/,
  )
  const intent = (await db.query('select jobname, active, vault_secret_name from qik_ingest.schedule_intent')).rows[0]
  assert.equal(intent.jobname, JOB_NAME)
  assert.equal(intent.active, false)
  assert.equal(intent.vault_secret_name, VAULT_SECRET_NAME)
})

test('anon cannot execute writer RPCs; bad token is unauthorized', async t => {
  const {db} = await fixture(t)
  await enableDisposableWriter(db)
  await db.exec('set role anon')
  await assert.rejects(
    db.query('select public.mip_qik_ingest_plan($1)', [DISPOSABLE_TEST_TOKEN]),
    /permission denied|42501/i,
  )
  await db.exec('reset role')
  await db.exec('set role qik_ingest_runtime')
  await assert.rejects(
    db.query('select public.mip_qik_ingest_plan($1)', ['short-token']),
    /qik_ingest_unauthorized/,
  )
  await assert.rejects(
    db.query('select public.mip_qik_ingest_plan($1)', ['x'.repeat(32)]),
    /qik_ingest_unauthorized/,
  )
})

test('pre-existing package role refuses install; cleanup restores collection constraint', async t => {
  const leftover = await createDisposableDb()
  t.after(() => leftover.db.close())
  await loadNativeSubstrate(leftover.exec)
  await leftover.exec('create role qik_ingest_fn_owner nologin')
  await assert.rejects(installQikIngest(leftover.exec), /qik_ingest_preexisting_role/)
  assert.equal((await leftover.db.query(`select to_regnamespace('qik_ingest') n`)).rows[0].n, null)

  const enabled = await createDisposableDb()
  t.after(() => enabled.db.close())
  await loadQikIngest(enabled.exec)
  await enableDisposableWriter(enabled.db)
  await assert.rejects(cleanupQikIngest(enabled.exec), /qik_ingest_cleanup_refused/)

  const {db, exec} = await fixture(t)
  await exec(`
    create role unrelated_reader nologin;
    grant select on public.articles to unrelated_reader;
  `)
  await cleanupQikIngest(exec)
  assert.equal((await db.query(`select to_regclass('qik_ingest.collection_gate') c`)).rows[0].c, null)
  assert.equal((await db.query(`select to_regnamespace('qik_ingest_operation') n`)).rows[0].n, null)
  await assert.rejects(
    db.exec(`update public.ingest_sources set collection_enabled = true
      where id = '11111111-1111-4111-8111-111111111111'`),
    /collection_enabled|check/i,
  )
  assert.equal((await db.query('select count(*)::int n from public.articles')).rows[0].n, 1)
  assert.equal((await db.query(`
    select has_table_privilege('unrelated_reader','public.articles','SELECT') ok
  `)).rows[0].ok, true)
})

test('YHB v8 parseFeed seams remain the collector parser', () => {
  const items = parseFeed(FEED, 'https://news.example/world.xml')
  assert.equal(items[0].title, 'Council Approves Water Plan')
  assert.equal(items[0].url, 'https://news.example/water')
})
