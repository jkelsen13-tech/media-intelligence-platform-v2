import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {installQikIngest, cleanupQikIngest} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
import {installCaptureCas, cleanupCaptureCas} from '../supabase/qualification/content-addressed-storage/installCaptureCas.mjs'
import {
  countHandoffOutcomes,
  createPipelineRpc,
  drainNativePipeline,
  enqueueObserved,
} from '../supabase/qualification/qik-ingest/nativeHandoff.mjs'

const execFileAsync = promisify(execFile)
const env = {...process.env, PGPASSWORD: 'mip-disposable-ci-only'}
const dbName = 'mip_collector_native_capture_test'
const boundDbName = 'mip_cnc_bound_queue_test'
const fixtureSql = await readFile(new URL('../supabase/qualification/qik-ingest/fixture_substrate.sql', import.meta.url), 'utf8')
const pipelineSql = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')

function allowedMarker() {
  const marker = process.env.MIP_DISPOSABLE_POSTGRES
  return marker === 'collector-native-capture-qualification'
    || marker === 'content-addressed-qualification'
}

function sqlFor(name) {
  return async function sql(s) {
    const r = await execFileAsync('psql', [
      '-X', '-v', 'ON_ERROR_STOP=1', '-At',
      '-h', '127.0.0.1', '-U', 'postgres', '-d', name, '-c', s,
    ], {env, timeout: 20000, maxBuffer: 8 * 1024 * 1024})
    return r.stdout.trim().split('\n').filter(x => x && !['SET', 'RESET', 'BEGIN', 'COMMIT', 'ROLLBACK'].includes(x)).at(-1)
  }
}

const sql = sqlFor(dbName)

function pgClient(database) {
  return new pg.Client({
    host: '127.0.0.1',
    user: 'postgres',
    password: 'mip-disposable-ci-only',
    database,
  })
}

const CLUSTER_ROLES = [
  'unrelated_reader',
  'qik_ingest_fn_owner',
  'qik_ingest_runtime',
  'mip_cas_owner',
  'mip_cas_gateway',
  'mip_cas_codec_verifier',
]

async function dropClusterRoles() {
  for (const rolname of CLUSTER_ROLES) {
    await execFileAsync('psql', [
      '-X', '-v', 'ON_ERROR_STOP=1', '-At',
      '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres',
      '-c', `drop role if exists ${rolname}`,
    ], {env, timeout: 10000})
  }
}

async function provisionDb(name, t) {
  await execFileAsync('dropdb', ['-h', '127.0.0.1', '-U', 'postgres', '--if-exists', name], {env})
  await dropClusterRoles()
  await execFileAsync('createdb', ['-h', '127.0.0.1', '-U', 'postgres', name], {env})
  t.after(async () => {
    try {
      await execFileAsync('dropdb', ['-h', '127.0.0.1', '-U', 'postgres', '--if-exists', name], {env})
    } catch { /* leftover db is disposable */ }
    try {
      await dropClusterRoles()
    } catch { /* leftover roles cleaned on next provision */ }
  })
}

async function fingerprint(client, id) {
  const job = (await client.query(`
    select id::text, state, outcome, attempt_count, error_code,
           lease_token::text as lease_token, payload, canonical_url, input_hash,
           article_id::text as article_id
    from evidence_pipeline.import_jobs where id = $1::uuid
  `, [id])).rows[0]
  const events = (await client.query(
    'select count(*)::int as n from evidence_pipeline.job_events where job_id = $1::uuid',
    [id],
  )).rows[0]
  return {...job, event_count: events.n}
}

function article(url, title) {
  return {url, title, outlet: 'Example World', summary: 'synthetic', body_text: null, published_at: null}
}

test('native PostgreSQL: session auth, external dependents, public sentinel', async t => {
  if (!allowedMarker()) {
    t.diagnostic('skip: set MIP_DISPOSABLE_POSTGRES=collector-native-capture-qualification (PGlite SET ROLE is not PostgREST auth)')
    return
  }
  await provisionDb(dbName, t)
  await sql('create extension if not exists pgcrypto')
  await sql(fixtureSql)
  await sql(pipelineSql)
  await installQikIngest(sql)
  await installCaptureCas(sql)

  await sql('create view public.cas_unapproved_dep as select 1 as n from mip_cas.policy()')
  await assert.rejects(cleanupCaptureCas(sql), /mip_cas_unapproved_external_dependent/)
  assert.equal(await sql("select to_regclass('public.cas_unapproved_dep') is not null"), 't')
  await sql('drop view public.cas_unapproved_dep')

  await assert.rejects(sql("set session authorization anon; select payload from evidence_pipeline.article_captures"), /permission denied/)
  await sql('reset session authorization')
  assert.equal(await sql("select has_function_privilege('service_role','public.mip_pipeline_v1(text,jsonb)','EXECUTE')"), 't')
  assert.equal(await sql("select has_function_privilege('anon','public.mip_pipeline_v1(text,jsonb)','EXECUTE')"), 'f')

  await sql(`
    create role unrelated_reader nologin;
    grant select on public.articles to unrelated_reader;
    grant select on public.nodes to qik_ingest_runtime;
  `)
  await assert.rejects(cleanupQikIngest(sql), /qik_ingest_unrelated_privilege/)
  await sql('revoke select on public.nodes from qik_ingest_runtime')

  await cleanupCaptureCas(sql)
  await cleanupQikIngest(sql)
  assert.equal(await sql('select count(*)::int from public.articles'), '1')
  assert.equal(await sql("select has_table_privilege('unrelated_reader','public.articles','SELECT')"), 't')
  assert.equal(await sql("select count(*)::int from pg_namespace where nspname in ('mip_cas','qik_ingest','qik_ingest_operation')"), '0')
})

test('native PostgreSQL: bound claim does not mutate unrelated pending, expired, or held leases', async t => {
  if (!allowedMarker()) {
    t.diagnostic('skip: set MIP_DISPOSABLE_POSTGRES=collector-native-capture-qualification (PGlite SET ROLE is not PostgREST auth)')
    return
  }
  const boundSql = sqlFor(boundDbName)
  await provisionDb(boundDbName, t)
  await boundSql('create extension if not exists pgcrypto')
  await boundSql(fixtureSql)
  await boundSql(pipelineSql)
  await installQikIngest(boundSql)

  const worker = pgClient(boundDbName)
  const holder = pgClient(boundDbName)
  await worker.connect()
  await holder.connect()
  t.after(async () => {
    await holder.end().catch(() => {})
    await worker.end().catch(() => {})
  })

  const pipelineRpc = createPipelineRpc(worker)
  await assert.rejects(pipelineRpc('claim', {}), /unscoped_claim_forbidden/)

  const boundA = await enqueueObserved({
    pipelineRpc, runId: 'bound-pg-run-1', article: article('https://qualification.invalid/cnc-pg/a', 'Bound A'),
  })
  const boundB = await enqueueObserved({
    pipelineRpc, runId: 'bound-pg-run-1', article: article('https://qualification.invalid/cnc-pg/b', 'Bound B'),
  })
  const unrelatedPending = await enqueueObserved({
    pipelineRpc, runId: 'other-pg-run', article: article('https://qualification.invalid/cnc-pg/pending', 'Unrelated pending'),
  })
  const unrelatedExpired = await enqueueObserved({
    pipelineRpc, runId: 'other-pg-run', article: article('https://qualification.invalid/cnc-pg/expired', 'Unrelated expired'),
  })
  const heldLease = await enqueueObserved({
    pipelineRpc, runId: 'other-pg-run', article: article('https://qualification.invalid/cnc-pg/held-lease', 'Held lease'),
  })
  const lockedPending = await enqueueObserved({
    pipelineRpc, runId: 'bound-pg-run-1', article: article('https://qualification.invalid/cnc-pg/locked', 'Locked by other session'),
  })

  await worker.query(`
    update evidence_pipeline.import_jobs
      set state='processing', attempt_count=1,
          lease_token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
          lease_expires_at=clock_timestamp() - interval '1 hour'
      where id=$1::uuid
  `, [unrelatedExpired])
  await worker.query(`
    update evidence_pipeline.import_jobs
      set state='processing', attempt_count=1,
          lease_token='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
          lease_expires_at=clock_timestamp() + interval '2 minutes'
      where id=$1::uuid
  `, [heldLease])

  const beforePending = await fingerprint(worker, unrelatedPending)
  const beforeExpired = await fingerprint(worker, unrelatedExpired)
  const beforeHeld = await fingerprint(worker, heldLease)
  const historyBefore = (await worker.query('select count(*)::int as n from evidence_pipeline.record_versions')).rows[0].n

  await holder.query('begin')
  await holder.query(
    'select id from evidence_pipeline.import_jobs where id=$1::uuid for update',
    [lockedPending],
  )

  const finished = await drainNativePipeline({
    pipelineRpc,
    jobIds: [boundA, boundB, lockedPending],
    maxJobs: 8,
  })
  const counts = countHandoffOutcomes(
    [boundA, boundB, lockedPending],
    finished,
    await pipelineRpc.readJobStates([boundA, boundB, lockedPending]),
  )
  assert.equal(counts.inserted, 2)
  assert.equal(counts.unresolved, 1)
  assert.equal(counts.duplicates, 0)
  assert.equal((await fingerprint(worker, lockedPending)).state, 'pending')
  assert.deepEqual(await fingerprint(worker, unrelatedPending), beforePending)
  assert.deepEqual(await fingerprint(worker, unrelatedExpired), beforeExpired)
  assert.deepEqual(await fingerprint(worker, heldLease), beforeHeld)
  assert.equal(
    (await worker.query('select count(*)::int as n from evidence_pipeline.record_versions')).rows[0].n,
    historyBefore + 2,
  )
  assert.equal((await fingerprint(worker, heldLease)).lease_token, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  assert.equal((await fingerprint(worker, unrelatedExpired)).state, 'processing')

  await holder.query('rollback')
  assert.equal((await fingerprint(worker, lockedPending)).state, 'pending')
  assert.equal(
    (await worker.query(`
      select count(*)::int as n from evidence_pipeline.article_captures
      where payload->>'url' in (
        'https://qualification.invalid/cnc-pg/pending',
        'https://qualification.invalid/cnc-pg/expired',
        'https://qualification.invalid/cnc-pg/held-lease',
        'https://qualification.invalid/cnc-pg/locked'
      )
    `)).rows[0].n,
    0,
  )
})
