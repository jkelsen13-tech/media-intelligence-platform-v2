import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation, restoreEclipseInvestigation } from '../scripts/mipConsolidationRestore.mjs'
import { insertCyclosporaCohort, CYCLOSPORA_EVENT } from '../scripts/mipPublicSurfaceCohort.mjs'
import { IDENTITY_DECISIONS } from '../scripts/mipIdentityReconciliation.mjs'
import {
  DEPENDENCY_GROUPS,
  LIVE_DRY_RUN,
  STAGING_MIGRATION,
  applyStagingPage,
  assertPageNotPublishing,
  dryRunManifest,
  executeDryRun,
  fingerprintPayload,
  objectFamily,
  planPage,
  planRecord,
  runBoundedWorker,
  validateRecordEndpoints,
} from '../scripts/mipLegacyGraphStaging.mjs'

const MANUS = 'yhbwnrtlqbjtcrrlpbge'
const ECLIPSE = 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const EDGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const ORPHAN_EDGE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
const SOURCE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const DIVERGENT_NODE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
const GAP_ARTICLE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

async function scalar(db, sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0]
}

async function asRole(db, role, fn) {
  await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

function nodeRecord({ id, label, type = 'event', slug = label }) {
  return {
    source_project_ref: MANUS,
    source_table: 'nodes',
    source_id: id,
    payload: { id, slug, label, type, description: label, metadata: {} },
  }
}

function edgeRecord({ id, source, target, type = 'actor' }) {
  return {
    source_project_ref: MANUS,
    source_table: 'edges',
    source_id: id,
    payload: {
      id,
      endpoint_source_id: source,
      endpoint_target_id: target,
      type,
      weight: 'medium',
      metadata: {},
    },
  }
}

test('legacy graph staging plans, stages, and never publishes', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const pipeline = async (action, input = {}) => (
    await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])
  ).rows[0].result
  const staging = async (action, input = {}) => (
    await db.query('select public.mip_legacy_graph_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])
  ).rows[0].result

  const investigation = await restoreEclipseInvestigation(db, pipeline)
  await insertCyclosporaCohort(db)

  const publicBefore = {
    nodes: await scalar(db, 'select count(*)::int from public.nodes'),
    edges: await scalar(db, 'select count(*)::int from public.edges'),
    news: await scalar(db, 'select count(*)::int from public.news_detail_public'),
    comparison: await scalar(db, 'select count(*)::int from public.comparison_public'),
    articles: await scalar(db, 'select count(*)::int from public.articles'),
  }
  assert.equal(investigation.eventId, ECLIPSE)
  assert.equal(publicBefore.nodes, 1)
  assert.equal(publicBefore.edges, 0)
  assert.equal(publicBefore.news, 3)
  assert.equal(publicBefore.comparison, 1)

  await t.test('planner distinguishes families and rejects publication directives', () => {
    assert.equal(objectFamily('nodes', { type: 'event' }), 'graph_event')
    assert.equal(objectFamily('events', { canonical_title: 'Two Deaths' }), 'source_comparison_event')
    const family = planRecord({
      source_project_ref: MANUS,
      source_table: 'nodes',
      source_id: CYCLOSPORA_EVENT.id,
      payload: { id: CYCLOSPORA_EVENT.id, label: CYCLOSPORA_EVENT.canonical_title, type: 'event' },
    }, { comparisonEventIds: [CYCLOSPORA_EVENT.id] })
    assert.equal(family.decision, IDENTITY_DECISIONS.family_mismatch)
    assert.equal(family.conflict.conflict_kind, 'event_family_not_interchangeable')
    assert.throws(
      () => planRecord({
        source_project_ref: MANUS,
        source_table: 'nodes',
        source_id: ACTOR,
        reader_state: 'eligible',
        payload: { id: ACTOR, label: 'Actor', type: 'actor' },
      }),
      /publication directives/,
    )
    assert.equal(assertPageNotPublishing(planPage([nodeRecord({ id: ACTOR, label: 'Actor', type: 'actor' })])), true)
  })

  await t.test('isolated page stages pending graph rows without touching public tables', async () => {
    const page = [
      nodeRecord({ id: ACTOR, label: 'Legacy actor', type: 'actor', slug: 'legacy-actor' }),
      nodeRecord({ id: DIVERGENT_NODE, label: 'Legacy event', type: 'event', slug: 'legacy-event' }),
      edgeRecord({ id: EDGE, source: ACTOR, target: DIVERGENT_NODE }),
      {
        source_project_ref: MANUS,
        source_table: 'sources',
        source_id: SOURCE_ID,
        payload: { id: SOURCE_ID, node_id: DIVERGENT_NODE, outlet: 'Fixture Outlet', headline: 'Legacy source', url: 'https://example.org/legacy-source' },
      },
    ]
    const planned = planPage(page, {
      graphEventIds: [ECLIPSE],
      comparisonEventIds: [CYCLOSPORA_EVENT.id],
      publicIds: { nodes: new Set([ECLIPSE]), articles: new Set() },
    })
    assert.equal(planned.every((row) => row.decision === IDENTITY_DECISIONS.insert), true)
    assert.equal(planned.find((row) => row.source_id === EDGE).endpoints.orphan, false)

    const first = await applyStagingPage(db, { run_id: 'legacy-graph-page-1', records: page })
    const replay = await applyStagingPage(db, { run_id: 'legacy-graph-page-1', records: page })
    assert.equal(first.staged, 4)
    assert.equal(replay.staged, 4)
    assert.equal(replay.results.every((row) => row.replayed === true), true)
    assert.equal(await scalar(db, 'select count(*)::int from legacy_graph_staging.staged_records'), 4)
    assert.equal(await scalar(db, "select count(*)::int from legacy_graph_staging.staged_records where review_state='pending'"), 4)
    assert.equal(await scalar(db, 'select count(*)::int from public.nodes'), publicBefore.nodes)
    assert.equal(await scalar(db, 'select count(*)::int from public.edges'), publicBefore.edges)
  })

  await t.test('interrupted jobs resume from durable cursor without publishing', async () => {
    const queued = await staging('enqueue', {
      run_id: 'legacy-graph-resume',
      records: [nodeRecord({ id: '99999999-9999-4999-8999-999999999999', label: 'Resume node', slug: 'resume-node' })],
    })
    const claimed = await staging('claim', { run_id: 'legacy-graph-resume' })
    assert.equal(claimed.id, queued.job_id)
    assert.equal(claimed.state, 'processing')
    const interrupted = await staging('fail', {
      job_id: claimed.id,
      lease_token: claimed.lease_token,
      code: 'operator_interrupted',
      retryable: true,
    })
    assert.equal(interrupted, 'interrupted')
    const claimedAgain = await staging('claim', { run_id: 'legacy-graph-resume' })
    assert.equal(claimedAgain.id, claimed.id)
    const finished = await staging('finish', { job_id: claimedAgain.id, lease_token: claimedAgain.lease_token })
    assert.equal(finished.state, 'completed')
    assert.equal(await scalar(db, 'select count(*)::int from public.nodes'), publicBefore.nodes)
  })

  await t.test('divergent public identity and historical gaps are quarantined, not overwritten', async () => {
    const collision = await applyStagingPage(db, {
      run_id: 'legacy-graph-collision',
      records: [nodeRecord({ id: ECLIPSE, label: 'Invented replacement label', slug: 'invented-replacement' })],
    })
    assert.equal(collision.results[0].review_state, 'quarantined')
    assert.equal(collision.results[0].decision, 'identical_id_divergent_content')
    assert.equal(
      await scalar(db, 'select label from public.nodes where id=$1', [ECLIPSE]),
      '2024 Total Solar Eclipse, Cleveland, Ohio',
    )

    const gap = await applyStagingPage(db, {
      run_id: 'legacy-graph-gap',
      records: [{
        source_project_ref: 'niejaejtbxgakyrsntxm',
        source_table: 'articles',
        source_id: GAP_ARTICLE,
        recovery_status: 'not_restorable_no_pre_import_snapshot',
        payload: { id: GAP_ARTICLE, title: 'Missing historical version', url: 'https://example.org/historical-gap' },
      }],
    })
    assert.equal(gap.results[0].review_state, 'gap_recorded')
    assert.equal(gap.results[0].decision, 'historical_url_upsert_no_snapshot')
    assert.equal(
      await scalar(db, "select recovery_status from legacy_graph_staging.record_conflicts where source_id=$1", [GAP_ARTICLE]),
      'not_restorable_no_pre_import_snapshot',
    )
  })

  await t.test('orphan endpoints and family-mismatched endpoints stay private', async () => {
    const orphan = await applyStagingPage(db, {
      run_id: 'legacy-graph-orphan',
      records: [edgeRecord({
        id: ORPHAN_EDGE,
        source: '00000000-0000-4000-8000-000000000099',
        target: ACTOR,
      })],
    })
    assert.equal(orphan.results[0].id != null, true)
    assert.equal(
      await scalar(db, "select review_state from legacy_graph_staging.staged_records where source_id=$1", [ORPHAN_EDGE]),
      'quarantined',
    )
    assert.equal(
      await scalar(db, "select count(*)::int from legacy_graph_staging.record_conflicts where conflict_kind='orphan_endpoint'"),
      1,
    )

    const mismatched = validateRecordEndpoints(
      edgeRecord({ id: ORPHAN_EDGE, source: CYCLOSPORA_EVENT.id, target: ACTOR }),
      { comparisonEventIds: [CYCLOSPORA_EVENT.id], stagedIds: { nodes: new Set([ACTOR]) } },
    )
    assert.equal(mismatched.orphan, true)
    assert.equal(mismatched.checks[0].resolution, 'source_comparison_event_not_graph_node')
  })

  await t.test('divergent rerun quarantines without replacing the first payload', async () => {
    const changed = nodeRecord({ id: ACTOR, label: 'Changed actor label', type: 'actor', slug: 'legacy-actor' })
    changed.payload_sha256 = fingerprintPayload(changed.payload)
    const result = await applyStagingPage(db, { run_id: 'legacy-graph-rerun-divergent', records: [changed] })
    assert.equal(result.results[0].review_state, 'quarantined')
    assert.equal(
      await scalar(db, "select payload->>'label' from legacy_graph_staging.staged_records where source_id=$1", [ACTOR]),
      'Legacy actor',
    )
  })

  await t.test('anon and authenticated cannot read staging or publish through the RPC', async () => {
    await asRole(db, 'anon', async () => {
      await assert.rejects(db.exec('select * from legacy_graph_staging.staged_records'), /permission denied/)
      await assert.rejects(db.exec("select public.mip_legacy_graph_v1('manifest','{}'::jsonb)"), /permission denied/)
    })
    await asRole(db, 'authenticated', async () => {
      await assert.rejects(db.exec('select * from legacy_graph_staging.import_jobs'), /permission denied/)
      await assert.rejects(db.exec("select public.mip_legacy_graph_v1('enqueue','{}'::jsonb)"), /permission denied/)
    })
    await assert.rejects(staging('publish', {}), /publication is not implemented/)
  })

  await t.test('current published readbacks stay unchanged after staging', async () => {
    assert.equal(await scalar(db, 'select count(*)::int from public.nodes'), publicBefore.nodes)
    assert.equal(await scalar(db, 'select count(*)::int from public.edges'), publicBefore.edges)
    assert.equal(await scalar(db, 'select count(*)::int from public.news_detail_public'), publicBefore.news)
    assert.equal(await scalar(db, 'select count(*)::int from public.comparison_public'), publicBefore.comparison)
    assert.equal(await scalar(db, 'select count(*)::int from public.articles'), publicBefore.articles)
    assert.equal(await scalar(db, 'select count(*)::int from public.nodes where id=$1', [ECLIPSE]), 1)
    assert.equal(await scalar(db, 'select count(*)::int from public.events where id=$1', [CYCLOSPORA_EVENT.id]), 1)
    const manifest = await staging('manifest')
    assert.equal(manifest.public_nodes, publicBefore.nodes)
    assert.equal(manifest.public_edges, 0)
    assert.ok(manifest.staged.nodes >= 2)
  })
})

test('dry-run manifest is count-only and blocks live publication math', () => {
  const manifest = dryRunManifest()
  assert.equal(manifest.dry_run, true)
  assert.equal(manifest.source, 'captured_inventory')
  assert.equal(manifest.applied_live, false)
  assert.equal(manifest.apply_instructions.apply_migration, false)
  assert.equal(manifest.apply_instructions.apply_live_import, false)
  assert.equal(manifest.inventory.source_counts.nodes, 949)
  assert.equal(manifest.inventory.source_counts.edges, 451)
  assert.equal(manifest.inventory.production_counts.nodes, 1)
  assert.equal(manifest.inventory.production_counts.edges, 0)
  assert.equal(manifest.inventory.ledger.complete, true)
  assert.equal(manifest.unresolved.family_title_collisions, 665)
  assert.equal(manifest.unresolved.family_uuid_collisions, 0)
  assert.equal(manifest.publication_impact.copy_versus_publish, 'separate')
  assert.match(manifest.publication_impact.blocked_reason, /SELECT USING \(true\)/)
  assert.equal(Object.keys(manifest.dependency_groups).length, Object.keys(DEPENDENCY_GROUPS).length)
  assert.equal(STAGING_MIGRATION.endsWith('_mip_legacy_graph_private_staging.sql'), true)
})

test('staging migration never writes public graph tables', async () => {
  const sql = await readFile(new URL(`../supabase/migrations/${STAGING_MIGRATION}`, import.meta.url), 'utf8')
  assert.match(sql, /create schema legacy_graph_staging/)
  assert.match(sql, /publication is not implemented in this phase/)
  assert.doesNotMatch(sql, /insert into public\.nodes/i)
  assert.doesNotMatch(sql, /insert into public\.edges/i)
  assert.doesNotMatch(sql, /update public\.nodes/i)
  assert.doesNotMatch(sql, /update public\.edges/i)
  const executable = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(executable, /cron\.schedule|auth\.users|storage\./i)
})

test('staging regressions: fingerprints, versions, leases, endpoints, executable dry-run', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const pipeline = async (action, input = {}) => (
    await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])
  ).rows[0].result
  const staging = async (action, input = {}) => (
    await db.query('select public.mip_legacy_graph_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])
  ).rows[0].result
  await restoreEclipseInvestigation(db, pipeline)
  await insertCyclosporaCohort(db)

  await t.test('JavaScript and PostgreSQL fingerprints match and are verified server-side', async () => {
    const payload = { z: 1, a: { c: true, b: [2, 'x', null], d: {} }, label: 'Same' }
    const jsHash = fingerprintPayload(payload)
    const sqlHash = await scalar(db, 'select legacy_graph_staging.fingerprint_payload($1::jsonb)', [JSON.stringify(payload)])
    const rpcHash = (await staging('fingerprint', { payload })).sha256
    assert.equal(sqlHash, jsHash)
    assert.equal(rpcHash, jsHash)
    for (const value of [0, 0.5, 1e-7, 1e-6, 1e20, 1e21, -1e-7, 1.5e-7]) {
      const numeric = { z: value, a: { score: value } }
      assert.equal(
        await scalar(db, 'select legacy_graph_staging.fingerprint_payload($1::jsonb)', [JSON.stringify(numeric)]),
        fingerprintPayload(numeric),
        `fingerprint mismatch for ${value}`,
      )
      assert.equal(
        (await staging('fingerprint', { payload: numeric })).sha256,
        fingerprintPayload(numeric),
      )
    }
    const small = {
      source_project_ref: MANUS,
      source_table: 'nodes',
      source_id: '17171717-1717-4171-8171-171717171717',
      payload: {
        id: '17171717-1717-4171-8171-171717171717',
        label: 'Small score',
        type: 'event',
        metadata: { score: 1e-7 },
      },
    }
    const smallImport = await applyStagingPage(db, { run_id: 'legacy-graph-small-number', records: [small] })
    assert.equal(smallImport.results[0].review_state, 'pending')
    assert.equal(smallImport.results[0].decision, IDENTITY_DECISIONS.insert)

    assert.equal(
      await scalar(db, 'select legacy_graph_staging.public_graph_collision($1,$2,legacy_graph_staging.fingerprint_payload(to_jsonb(n))) from public.nodes n where n.id=$2', ['nodes', ECLIPSE]),
      'exact_public_match',
    )
    await db.query(
      `select public.mip_legacy_graph_v1('enqueue', jsonb_build_object(
         'run_id', 'legacy-graph-exact-public',
         'records', jsonb_build_array(jsonb_build_object(
           'source_project_ref', $1::text,
           'source_table', 'nodes',
           'source_id', n.id,
           'payload', to_jsonb(n)
         ))
       )) from public.nodes n where n.id=$2`,
      [MANUS, ECLIPSE],
    )
    const exactJob = await staging('claim', { run_id: 'legacy-graph-exact-public' })
    const exact = await staging('finish', { job_id: exactJob.id, lease_token: exactJob.lease_token })
    assert.equal(exact.results[0].decision, IDENTITY_DECISIONS.mapped)
    assert.equal(exact.results[0].review_state, 'pending')
    assert.equal(
      await scalar(db, 'select label from public.nodes where id=$1', [ECLIPSE]),
      '2024 Total Solar Eclipse, Cleveland, Ohio',
    )

    const stale = nodeRecord({ id: ACTOR, label: 'Changed but stale hash', type: 'actor', slug: 'legacy-actor' })
    stale.payload_sha256 = fingerprintPayload(nodeRecord({ id: ACTOR, label: 'Original', type: 'actor', slug: 'legacy-actor' }).payload)
    await assert.rejects(
      staging('enqueue', { run_id: 'legacy-graph-stale-hash', records: [stale] }),
      /payload fingerprint mismatch/,
    )
    assert.equal(await scalar(db, 'select count(*)::int from legacy_graph_staging.import_jobs where run_id=$1', ['legacy-graph-stale-hash']), 0)
  })

  await t.test('conflict replay is idempotent and does not mutate append-only history', async () => {
    const gapRecord = {
      source_project_ref: 'niejaejtbxgakyrsntxm',
      source_table: 'articles',
      source_id: GAP_ARTICLE,
      recovery_status: 'not_restorable_no_pre_import_snapshot',
      payload: { id: GAP_ARTICLE, title: 'Missing historical version', url: 'https://example.org/historical-gap' },
    }
    const first = await applyStagingPage(db, { run_id: 'legacy-graph-gap-replay', records: [gapRecord] })
    const before = (await db.query(
      "select id, detected_at, details, recovery_status from legacy_graph_staging.record_conflicts where source_id=$1 and run_id='legacy-graph-gap-replay'",
      [GAP_ARTICLE],
    )).rows
    assert.equal(before.length, 1)
    const replay = await applyStagingPage(db, { run_id: 'legacy-graph-gap-replay', records: [gapRecord] })
    const after = (await db.query(
      "select id, detected_at, details, recovery_status from legacy_graph_staging.record_conflicts where source_id=$1 and run_id='legacy-graph-gap-replay'",
      [GAP_ARTICLE],
    )).rows
    assert.equal(replay.already_completed, true)
    assert.equal(after.length, 1)
    assert.equal(after[0].id, before[0].id)
    assert.equal(String(after[0].detected_at), String(before[0].detected_at))
    assert.deepEqual(after[0].details, before[0].details)
    assert.equal(first.results[0].decision, 'historical_url_upsert_no_snapshot')
    await assert.rejects(
      db.exec("update legacy_graph_staging.record_conflicts set details='{\"mutated\":true}'::jsonb"),
      /append-only/,
    )
  })

  await t.test('divergent incoming payloads are retained with version and conflict linkage', async () => {
    const original = nodeRecord({ id: ACTOR, label: 'Legacy actor', type: 'actor', slug: 'legacy-actor' })
    await applyStagingPage(db, { run_id: 'legacy-graph-version-original', records: [original] })
    const changed = nodeRecord({ id: ACTOR, label: 'Changed actor label', type: 'actor', slug: 'legacy-actor' })
    const result = await applyStagingPage(db, { run_id: 'legacy-graph-version-divergent', records: [changed] })
    assert.equal(result.results[0].review_state, 'quarantined')
    assert.equal(
      await scalar(db, "select payload->>'label' from legacy_graph_staging.staged_records where source_id=$1", [ACTOR]),
      'Legacy actor',
    )
    const versions = (await db.query(
      'select ordinal, origin, payload_sha256, payload, predecessor_id from legacy_graph_staging.payload_versions where source_id=$1 order by ordinal',
      [ACTOR],
    )).rows
    assert.equal(versions.length, 2)
    assert.equal(versions[0].origin, 'staged_original')
    assert.equal(versions[1].origin, 'incoming_divergent')
    assert.equal(versions[0].payload.label, 'Legacy actor')
    assert.equal(versions[1].payload.label, 'Changed actor label')
    assert.equal(versions[0].payload_sha256, fingerprintPayload(original.payload))
    assert.equal(versions[1].payload_sha256, fingerprintPayload(changed.payload))
    assert.ok(versions[1].predecessor_id)
    const conflict = (await db.query(
      "select details from legacy_graph_staging.record_conflicts where source_id=$1 and run_id='legacy-graph-version-divergent'",
      [ACTOR],
    )).rows[0]
    assert.equal(conflict.details.original_sha256, versions[0].payload_sha256)
    assert.equal(conflict.details.incoming_sha256, versions[1].payload_sha256)
    assert.ok(conflict.details.original_version_id)
    assert.ok(conflict.details.incoming_version_id)
  })

  await t.test('expired processing jobs are reclaimed and old tokens are rejected atomically', async () => {
    const node = nodeRecord({ id: DIVERGENT_NODE, label: 'Lease node', type: 'event', slug: 'lease-node' })
    const queued = await staging('enqueue', { run_id: 'legacy-graph-lease', records: [node] })
    const claimed = await staging('claim', { run_id: 'legacy-graph-lease' })
    const expiredToken = claimed.lease_token
    await db.query(
      "update legacy_graph_staging.import_jobs set lease_expires_at = clock_timestamp() - interval '1 second' where id=$1",
      [claimed.id],
    )
    await assert.rejects(
      staging('finish', { job_id: claimed.id, lease_token: expiredToken }),
      /expired or superseded staging lease/,
    )
    await assert.rejects(
      staging('fail', { job_id: claimed.id, lease_token: expiredToken, code: 'late', retryable: true }),
      /expired or superseded staging lease/,
    )
    const reclaimed = await staging('claim', { run_id: 'legacy-graph-lease' })
    assert.equal(reclaimed.id, queued.job_id)
    assert.notEqual(reclaimed.lease_token, expiredToken)
    await assert.rejects(
      staging('finish', { job_id: claimed.id, lease_token: expiredToken }),
      /expired or superseded staging lease/,
    )
    const finished = await staging('finish', { job_id: reclaimed.id, lease_token: reclaimed.lease_token })
    assert.equal(finished.state, 'completed')
    assert.equal(finished.staged, 1)

    const workerNode = nodeRecord({
      id: '12121212-1212-4121-8121-121212121212',
      label: 'Worker node',
      type: 'actor',
      slug: 'worker-node',
    })
    await staging('enqueue', { run_id: 'legacy-graph-worker', records: [workerNode] })
    const worker = await runBoundedWorker((action, input = {}) => staging(action, {
      ...input,
      ...(action === 'claim' ? { run_id: 'legacy-graph-worker' } : {}),
    }), { maxJobs: 1 })
    assert.equal(worker.completed.length, 1)
    assert.equal(worker.completed[0].state, 'completed')
    assert.equal(await scalar(db, "select state from legacy_graph_staging.import_jobs where run_id='legacy-graph-worker'"), 'completed')
  })

  await t.test('missing endpoints are quarantined and page order does not change validation', async () => {
    const left = nodeRecord({ id: '13131313-1313-4131-8131-131313131313', label: 'Left', type: 'actor', slug: 'left-node' })
    const right = nodeRecord({ id: '14141414-1414-4141-8141-141414141414', label: 'Right', type: 'event', slug: 'right-node' })
    const connected = edgeRecord({
      id: '15151515-1515-4151-8151-151515151515',
      source: left.source_id,
      target: right.source_id,
    })
    const missing = {
      source_project_ref: MANUS,
      source_table: 'edges',
      source_id: '16161616-1616-4161-8161-161616161616',
      payload: { id: '16161616-1616-4161-8161-161616161616', type: 'actor', weight: 'medium', metadata: {} },
    }
    const forward = await applyStagingPage(db, {
      run_id: 'legacy-graph-order-forward',
      records: [left, right, connected],
    })
    const reverse = await applyStagingPage(db, {
      run_id: 'legacy-graph-order-reverse',
      records: [connected, right, left],
    })
    const forwardEdge = forward.results.find((row) => row.source_id === connected.source_id)
      ?? (await db.query("select review_state, decision from legacy_graph_staging.staged_records where source_id=$1", [connected.source_id])).rows[0]
    const reverseState = (await db.query(
      "select review_state, decision from legacy_graph_staging.staged_records where source_id=$1",
      [connected.source_id],
    )).rows[0]
    assert.equal(reverse.already_completed ?? false, false)
    assert.equal(forwardEdge.review_state ?? reverseState.review_state, 'pending')
    assert.equal(reverseState.review_state, 'pending')
    assert.equal(reverseState.decision, 'insert_unmapped_identity')

    const orphaned = await applyStagingPage(db, { run_id: 'legacy-graph-missing-endpoints', records: [missing] })
    assert.equal(
      await scalar(db, "select review_state from legacy_graph_staging.staged_records where source_id=$1", [missing.source_id]),
      'quarantined',
    )
    assert.equal(
      await scalar(db, "select decision from legacy_graph_staging.staged_records where source_id=$1", [missing.source_id]),
      'orphan_endpoint',
    )
    assert.equal(orphaned.results[0].review_state, 'quarantined')
    assert.equal(orphaned.results[0].decision, 'orphan_endpoint')
    assert.equal(orphaned.results[0].source_id, missing.source_id)
    const checks = (await db.query(
      'select endpoint_role, resolved, resolution from legacy_graph_staging.endpoint_checks where source_id=$1 order by endpoint_role',
      [missing.source_id],
    )).rows
    assert.equal(checks.length, 2)
    assert.equal(checks.every((row) => row.resolved === false && row.resolution === 'missing'), true)
  })

  await t.test('executable dry-run uses source rows, destination rows, and saved mappings', () => {
    assert.throws(() => executeDryRun(), /source records/)
    assert.throws(() => executeDryRun({ source_records: [nodeRecord({ id: ACTOR, label: 'A', type: 'actor' })] , destination_records: null }), /destination records/)
    const sourceRecords = [
      nodeRecord({ id: ACTOR, label: 'Legacy actor', type: 'actor', slug: 'legacy-actor' }),
      nodeRecord({ id: ECLIPSE, label: 'Invented replacement label', slug: 'invented-replacement' }),
      {
        source_project_ref: MANUS,
        source_table: 'nodes',
        source_id: CYCLOSPORA_EVENT.id,
        payload: { id: CYCLOSPORA_EVENT.id, label: CYCLOSPORA_EVENT.canonical_title, type: 'event' },
      },
    ]
    const destinationRecords = [{
      table: 'nodes',
      id: ECLIPSE,
      label: '2024 Total Solar Eclipse, Cleveland, Ohio',
      type: 'event',
    }]
    const mappings = [{
      source_project_ref: MANUS,
      source_table: 'nodes',
      source_id: ACTOR,
      target_id: ACTOR,
    }]
    const result = executeDryRun({
      source_records: sourceRecords,
      destination_records: destinationRecords,
      mappings,
      comparison_event_ids: [CYCLOSPORA_EVENT.id],
      graph_event_ids: [ECLIPSE],
    })
    assert.equal(result.source, 'supplied_source_destination_and_mappings')
    assert.notEqual(result.source, 'captured_inventory')
    assert.equal(result.planned.length, 3)
    assert.equal(result.planned.find((row) => row.source_id === ACTOR).decision, IDENTITY_DECISIONS.skip_existing_mapping)
    assert.equal(result.planned.find((row) => row.source_id === ECLIPSE).decision, IDENTITY_DECISIONS.conflict)
    assert.equal(result.planned.find((row) => row.source_id === CYCLOSPORA_EVENT.id).decision, IDENTITY_DECISIONS.family_mismatch)
    assert.equal(result.publication_impact.current_public_nodes, 1)
    assert.equal(result.unresolved.mapping_skips, 1)
    assert.equal(result.unresolved.family_mismatches, 1)
  })

  await t.test('exact public edges keep the submitted payload and map through applyStagingPage', async () => {
    const pub = (await db.query('select to_jsonb(n) payload from public.nodes n where id=$1', [ECLIPSE])).rows[0].payload
    const secondId = '18181818-1818-4181-8181-181818181818'
    const edgeId = '19191919-1919-4191-8191-191919191919'
    await db.query(
      'insert into public.nodes select (jsonb_populate_record(null::public.nodes,$1::jsonb)).*',
      [JSON.stringify({ ...pub, id: secondId, slug: 'review-second-node' })],
    )
    await db.query(
      'insert into public.edges(id,source_id,target_id,type) values($1,$2,$3,$4)',
      [edgeId, ECLIPSE, secondId, 'actor'],
    )
    const exactEdge = (await db.query('select to_jsonb(e) payload from public.edges e where id=$1', [edgeId])).rows[0].payload
    const applied = await applyStagingPage(db, {
      run_id: 'legacy-graph-exact-public-edge',
      records: [{
        source_project_ref: MANUS,
        source_table: 'edges',
        source_id: exactEdge.id,
        payload: exactEdge,
      }],
    })
    assert.equal(applied.results[0].decision, IDENTITY_DECISIONS.mapped)
    assert.equal(applied.results[0].review_state, 'pending')
    assert.equal(
      await scalar(db, 'select payload = $1::jsonb from legacy_graph_staging.staged_records where source_id=$2', [
        JSON.stringify(exactEdge),
        exactEdge.id,
      ]),
      true,
    )
    assert.equal(
      await scalar(db, "select payload ? 'endpoint_source_id' from legacy_graph_staging.staged_records where source_id=$1", [exactEdge.id]),
      false,
    )
  })

  await t.test('dry-run mapping context is revalidated on apply, not taken from client decision', async () => {
    const source = nodeRecord({
      id: '20202020-2020-4202-8202-202020202020',
      label: 'Mapped node',
      type: 'event',
      slug: 'mapped-node',
    })
    const target = '21212121-2121-4212-8212-212121212121'
    const mapping = {
      source_project_ref: MANUS,
      source_table: 'nodes',
      source_id: source.source_id,
      target_id: target,
    }
    const planned = executeDryRun({
      source_records: [source],
      destination_records: [],
      mappings: [mapping],
    })
    assert.equal(planned.planned[0].decision, IDENTITY_DECISIONS.skip_existing_mapping)
    assert.equal(planned.planned[0].proposed_target_id, target)
    const applied = await applyStagingPage(db, {
      run_id: 'legacy-graph-planned-mapping',
      records: planned.planned,
    })
    assert.equal(applied.results[0].decision, IDENTITY_DECISIONS.skip_existing_mapping)
    assert.equal(applied.results[0].proposed_target_id, target)
    assert.equal(
      await scalar(db, 'select decision from legacy_graph_staging.staged_records where source_id=$1', [source.source_id]),
      IDENTITY_DECISIONS.skip_existing_mapping,
    )
    assert.equal(
      await scalar(db, 'select proposed_target_id from legacy_graph_staging.staged_records where source_id=$1', [source.source_id]),
      target,
    )
    const forged = nodeRecord({
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Forged decision',
      type: 'event',
      slug: 'forged-decision',
    })
    forged.decision = IDENTITY_DECISIONS.skip_existing_mapping
    forged.proposed_target_id = target
    const ignored = await applyStagingPage(db, {
      run_id: 'legacy-graph-forged-decision',
      records: [forged],
    })
    assert.equal(ignored.results[0].decision, IDENTITY_DECISIONS.insert)
    assert.equal(ignored.results[0].proposed_target_id, null)
  })
})

test('dependency quarantine is transitive, order-independent, and visible in finish results', async (t) => {
  async function freshDb() {
    const db = await PGlite.create()
    await applyFoundation(db)
    const pipeline = async (action, input = {}) => (
      await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])
    ).rows[0].result
    await restoreEclipseInvestigation(db, pipeline)
    return db
  }

  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const rec = (table, n, payload) => ({
    source_project_ref: MANUS,
    source_table: table,
    source_id: id(n),
    payload: { id: id(n), ...payload },
  })

  for (const reversed of [false, true]) {
    await t.test(`arc and membership both quarantine when order reversed=${reversed}`, async () => {
      const db = await freshDb()
      t.after(() => db.close())
      const pub = (await db.query('select id from public.nodes limit 1')).rows[0]
      const base = reversed ? 20 : 10
      const arc = rec('story_arcs', base, { title: 'Arc with unavailable root', root_node_id: id(999) })
      const link = rec('arc_events', base + 1, { arc_id: arc.source_id, node_id: pub.id })
      const applied = await applyStagingPage(db, {
        run_id: `legacy-graph-dep-${reversed}`,
        records: reversed ? [link, arc] : [arc, link],
      })
      const stored = (await db.query(
        'select source_table, decision, review_state from legacy_graph_staging.staged_records where source_id=any($1::uuid[]) order by source_table',
        [[arc.source_id, link.source_id]],
      )).rows
      assert.equal(stored.length, 2)
      assert.equal(stored.every((row) => row.decision === 'orphan_endpoint'), true)
      assert.equal(stored.every((row) => row.review_state === 'quarantined'), true)
      const reportedArc = applied.results.find((row) => row.source_id === arc.source_id)
      const reportedLink = applied.results.find((row) => row.source_id === link.source_id)
      assert.equal(reportedArc.decision, 'orphan_endpoint')
      assert.equal(reportedArc.review_state, 'quarantined')
      assert.equal(reportedLink.decision, 'orphan_endpoint')
      assert.equal(reportedLink.review_state, 'quarantined')
    })
  }

  await t.test('later pages revalidate dependents and restore only when the parent is actually available', async () => {
    const missingParent = await freshDb()
    t.after(() => missingParent.close())
    const pub = (await missingParent.query('select id from public.nodes limit 1')).rows[0]
    const arc = rec('story_arcs', 40, { title: 'Later quarantined arc', root_node_id: id(999) })
    const link = rec('arc_events', 41, { arc_id: arc.source_id, node_id: pub.id })
    const first = await applyStagingPage(missingParent, {
      run_id: 'legacy-graph-later-page-membership',
      records: [link],
    })
    assert.equal(first.results[0].decision, 'orphan_endpoint')
    assert.equal(first.results[0].review_state, 'quarantined')
    await applyStagingPage(missingParent, {
      run_id: 'legacy-graph-later-page-arc',
      records: [arc],
    })
    const afterMissing = (await missingParent.query(
      'select source_table, decision, review_state from legacy_graph_staging.staged_records where source_id=any($1::uuid[]) order by source_table',
      [[arc.source_id, link.source_id]],
    )).rows
    assert.equal(afterMissing.every((row) => row.decision === 'orphan_endpoint' && row.review_state === 'quarantined'), true)
    const check = (await missingParent.query(
      "select resolved, resolution from legacy_graph_staging.endpoint_checks where source_id=$1 and endpoint_role='arc'",
      [link.source_id],
    )).rows[0]
    assert.equal(check.resolved, false)
    assert.equal(check.resolution, 'missing')

    const availableParent = await freshDb()
    t.after(() => availableParent.close())
    const validArc = rec('story_arcs', 50, { title: 'Later valid arc', root_node_id: ECLIPSE })
    const validLink = rec('arc_events', 51, { arc_id: validArc.source_id, node_id: pub.id })
    const orphanedFirst = await applyStagingPage(availableParent, {
      run_id: 'legacy-graph-later-valid-membership',
      records: [validLink],
    })
    assert.equal(orphanedFirst.results[0].review_state, 'quarantined')
    const restored = await applyStagingPage(availableParent, {
      run_id: 'legacy-graph-later-valid-arc',
      records: [validArc],
    })
    assert.equal(restored.results[0].decision, IDENTITY_DECISIONS.insert)
    assert.equal(restored.results[0].review_state, 'pending')
    const afterValid = (await availableParent.query(
      'select source_table, decision, review_state from legacy_graph_staging.staged_records where source_id=any($1::uuid[]) order by source_table',
      [[validArc.source_id, validLink.source_id]],
    )).rows
    assert.deepEqual(afterValid, [
      { source_table: 'arc_events', decision: IDENTITY_DECISIONS.insert, review_state: 'pending' },
      { source_table: 'story_arcs', decision: IDENTITY_DECISIONS.insert, review_state: 'pending' },
    ])
    const restoredCheck = (await availableParent.query(
      "select resolved, resolution from legacy_graph_staging.endpoint_checks where source_id=$1 and endpoint_role='arc'",
      [validLink.source_id],
    )).rows[0]
    assert.equal(restoredCheck.resolved, true)
    assert.equal(restoredCheck.resolution, 'story_arc')
  })
})
