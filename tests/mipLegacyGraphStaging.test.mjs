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
  fingerprintPayload,
  objectFamily,
  planPage,
  planRecord,
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
    await db.exec(`
      insert into legacy_graph_staging.import_jobs (run_id, source_project_ref, source_table, state)
      values ('legacy-graph-resume', '${MANUS}', 'nodes', 'pending')
    `)
    const claimed = await staging('claim')
    assert.equal(claimed.state, 'processing')
    const interrupted = await staging('fail', {
      job_id: claimed.id,
      lease_token: claimed.lease_token,
      code: 'operator_interrupted',
      retryable: true,
    })
    assert.equal(interrupted, 'interrupted')
    const claimedAgain = await staging('claim')
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
