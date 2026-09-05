import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation, restoreEclipseInvestigation } from '../scripts/mipConsolidationRestore.mjs'
import {
  insertCyclosporaCohort,
  insertLedgerSample,
  eventKey,
  CYCLOSPORA_EVENT,
  CYCLOSPORA_ARTICLES,
  FRONTEND_RELATIONS,
  REMAINING_FRONTEND_DEPS,
  TIMELINE_ARC,
  hashRows,
} from '../scripts/mipPublicSurfaceCohort.mjs'

const LEDGER_MAPPINGS = [
  {
    source_project_ref: 'niejaejtbxgakyrsntxm',
    source_table: 'events',
    source_id: CYCLOSPORA_EVENT.id,
    target_id: CYCLOSPORA_EVENT.id,
    source_url: CYCLOSPORA_ARTICLES[1].url,
    imported_at: '2026-08-20T03:50:00Z',
  },
]
const LEDGER_CONFLICTS = [
  {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    source_project_ref: 'niejaejtbxgakyrsntxm',
    run_key: 'original-readonly-import-2026-08-20',
    source_table: 'articles',
    source_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    target_id: null,
    source_url: 'https://example.org/historical-gap',
    conflict_kind: 'historical_url_upsert_no_snapshot',
    affected_fields: ['body_text'],
    recovery_status: 'not_restorable_no_pre_import_snapshot',
    details: { note: 'recorded gap, not invented' },
    detected_at: '2026-08-20T03:57:24.512899+00',
  },
]

test('public-surface transfer restores frontend relations without leaking private bases', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  const investigation = await restoreEclipseInvestigation(db, rpc)
  const cohort = await insertCyclosporaCohort(db)
  await insertLedgerSample(db, LEDGER_MAPPINGS, LEDGER_CONFLICTS)

  for (const name of [...FRONTEND_RELATIONS, ...REMAINING_FRONTEND_DEPS]) {
    assert.equal(await scalar('select to_regclass($1) is not null', [`public.${name}`]), true, name)
  }

  await t.test('Source Comparison identity stays off the graph-event table', async () => {
    assert.equal(await scalar('select count(*)::int from nodes where id=$1', [CYCLOSPORA_EVENT.id]), 0)
    assert.equal(await scalar('select count(*)::int from events where id=$1', [investigation.finished?.event_id ?? 'acc55cb2-5ac2-4aed-be36-3f576d2bc443']), 0)
    assert.equal(cohort.graph_event_ids.length, 0)
    assert.equal(cohort.event_key, eventKey(CYCLOSPORA_EVENT.id))
  })

  await t.test('anonymous readers see approved comparison and eligible news, not pending NASA', async () => {
    await db.exec('set role anon')
    const comparison = (await db.query('select * from comparison_public')).rows
    assert.equal(comparison.length, 1)
    assert.equal(comparison[0].event_key, cohort.event_key)
    assert.equal(comparison[0].canonical_title, CYCLOSPORA_EVENT.canonical_title)
    assert.equal(comparison[0].articles.length, 3)
    assert.equal(await scalar('select count(*)::int from news_detail_public'), 3)
    assert.equal(await scalar('select count(*)::int from news_detail_public where article_id=$1', ['e5a84674-0176-4704-b56f-e01c8ffa84f4']), 0)
    assert.equal(await scalar('select count(*)::int from articles'), 3)
    await assert.rejects(db.exec('select * from events'), /permission denied/)
    await assert.rejects(db.exec('select * from article_claims'), /permission denied/)
    await assert.rejects(db.exec('select name, framing_profile from authors'), /permission denied/)
    await assert.rejects(db.exec('select * from mip_private.arc_has_approved_membership'), /permission denied|does not exist/)
    const coverage = (await db.query('select * from graph_coverage_public')).rows[0]
    assert.equal(coverage.article_count, 4)
    assert.equal(coverage.published_node_count, 1)
    assert.equal(await scalar('select count(*)::int from topics'), 25)
    assert.equal(await scalar('select count(*)::int from arc_events'), 1)
    assert.equal(await scalar('select count(*)::int from arc_milestones_public'), 0)
    await db.exec('reset role')
  })

  await t.test('retraction and pending membership stay withheld', async () => {
    await db.query("update events set comparison_validation_state='pending_review' where id=$1", [CYCLOSPORA_EVENT.id])
    await db.exec('set role anon')
    assert.equal(await scalar('select count(*)::int from comparison_public'), 0)
    await db.exec('reset role')
    await db.query("update events set comparison_validation_state='approved' where id=$1", [CYCLOSPORA_EVENT.id])

    await db.query(
      `insert into arc_membership_candidates(id, article_id, arc_id, generation_method, state)
       values ('ffffffff-ffff-4fff-8fff-fffffffffff1',$1,$2,'fixture','pending')`,
      [CYCLOSPORA_ARTICLES[0].id, TIMELINE_ARC.id],
    )
    await db.query(
      "update arc_events set arc_membership_candidate_id='ffffffff-ffff-4fff-8fff-fffffffffff1'",
    )
    await db.exec('set role anon')
    assert.equal(await scalar('select count(*)::int from arc_events'), 0)
    assert.equal(await scalar('select count(*)::int from arc_milestones_public'), 0)
    await db.exec('reset role')
    await db.query("update arc_membership_candidates set state='approved' where id='ffffffff-ffff-4fff-8fff-fffffffffff1'")
    await db.exec('set role anon')
    assert.equal(await scalar('select count(*)::int from arc_events'), 1)
    assert.equal(await scalar('select count(*)::int from arc_milestones_public'), 1)
    await db.exec('reset role')
  })

  await t.test('direct arc attachment is intercepted and does not auto-approve', async () => {
    await db.query('update articles set arc_id=$1 where id=$2', [TIMELINE_ARC.id, CYCLOSPORA_ARTICLES[1].id])
    assert.equal(await scalar('select arc_id from articles where id=$1', [CYCLOSPORA_ARTICLES[1].id]), null)
    assert.equal(await scalar("select state from arc_membership_candidates where article_id=$1 and arc_id=$2", [CYCLOSPORA_ARTICLES[1].id, TIMELINE_ARC.id]), 'pending')
  })

  await t.test('ledger rows keep recorded recovery status and content hash', async () => {
    const mappings = (await db.query('select source_project_ref, source_table, source_id, target_id, source_url from original_source_import_mappings where source_table=$1', ['events'])).rows
    assert.equal(mappings.length, 1)
    assert.equal(mappings[0].source_id, CYCLOSPORA_EVENT.id)
    assert.equal(mappings[0].target_id, CYCLOSPORA_EVENT.id)
    assert.equal(
      hashRows(mappings, ['source_project_ref', 'source_table', 'source_id', 'target_id', 'source_url']),
      hashRows(LEDGER_MAPPINGS, ['source_project_ref', 'source_table', 'source_id', 'target_id', 'source_url']),
    )
    assert.equal(await scalar("select recovery_status from original_source_import_conflicts where conflict_kind='historical_url_upsert_no_snapshot'"), 'not_restorable_no_pre_import_snapshot')
  })
})
