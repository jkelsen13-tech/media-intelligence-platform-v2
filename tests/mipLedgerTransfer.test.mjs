import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation, restoreEclipseInvestigation } from '../scripts/mipConsolidationRestore.mjs'
import { insertCyclosporaCohort, CYCLOSPORA_EVENT } from '../scripts/mipPublicSurfaceCohort.mjs'
import {
  applyLedgerPage,
  assertLedgerPageSafe,
  hashMappingRows,
  hashConflictRows,
  EXPECTED_LEDGER,
  ORIGINAL_PROJECT_REF,
  MAPPING_HASH_SQL,
  CONFLICT_HASH_SQL,
} from '../scripts/mipLedgerTransfer.mjs'
import { IDENTITY_DECISIONS } from '../scripts/mipIdentityReconciliation.mjs'

const PAGE = {
  mappings: [
    {
      t: 'events',
      s: '0134b63e-18b4-416c-a762-c19496dd1b78',
      g: '0134b63e-18b4-416c-a762-c19496dd1b78',
      u: null,
      i: '2026-08-20T01:24:07.883305+00',
    },
    {
      t: 'articles',
      s: '006e3e79-10e1-4d5f-99f5-0a1b46e4c93d',
      g: '2af74224-c8eb-4fba-9af6-6a7566d0d1f1',
      u: 'https://www.nytimes.com/2026/07/23/business/media/new-york-times-subpoenas-withdraw.html',
      i: '2026-08-20T01:14:34.488546+00',
    },
    {
      t: 'policies',
      s: '036c2fa5-6b10-49f9-a4d2-341b3016b9a3',
      g: '036c2fa5-6b10-49f9-a4d2-341b3016b9a3',
      u: null,
      i: '2026-08-20T01:24:08.187467+00',
    },
  ],
  conflicts: [
    {
      id: '4b33d98b-5cec-4a06-9ed8-9fc14c7ede4e',
      rk: 'original-readonly-cross-surface-import-20260820',
      t: 'articles',
      s: '006e3e79-10e1-4d5f-99f5-0a1b46e4c93d',
      g: '2af74224-c8eb-4fba-9af6-6a7566d0d1f1',
      u: 'https://www.nytimes.com/2026/07/23/business/media/new-york-times-subpoenas-withdraw.html',
      k: 'existing_import_mapping_skipped',
      af: [],
      rs: 'not_applicable_existing_mapping',
      d: { policy: 'insert-only; existing Version Two article fields are never updated' },
      i: '2026-08-20T03:57:24.082909+00',
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      rk: 'niejaejtbxgakyrsntxm-historical-article-upsert-audit-20260820',
      t: 'articles',
      s: '006e3e79-10e1-4d5f-99f5-0a1b46e4c93d',
      g: '2af74224-c8eb-4fba-9af6-6a7566d0d1f1',
      u: 'https://www.nytimes.com/2026/07/23/business/media/new-york-times-subpoenas-withdraw.html',
      k: 'historical_url_upsert_no_snapshot',
      af: ['body_text'],
      rs: 'not_restorable_no_pre_import_snapshot',
      d: {
        reason: 'Former original-source article upsert selected an existing Version Two row by URL.',
        prior_import_run_key: 'original-readonly-cross-surface-import-20260820',
        restoration_evidence: 'No article history, snapshot table, or mapping snapshot columns exist in Version Two.',
      },
      i: '2026-08-20T03:57:24.512899+00',
    },
  ],
}

test('ledger transfer restores recorded mappings and conflicts without inventing identity', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  const investigation = await restoreEclipseInvestigation(db, rpc)
  await insertCyclosporaCohort(db)

  assert.equal(assertLedgerPageSafe(PAGE, {
    graphEventIds: [investigation.eventId],
    comparisonEventIds: [CYCLOSPORA_EVENT.id],
  }), true)

  await applyLedgerPage(db, PAGE)
  await applyLedgerPage(db, PAGE)

  assert.equal(await scalar('select count(*)::int from original_source_import_mappings'), 3)
  assert.equal(await scalar('select count(*)::int from original_source_import_conflicts'), 2)
  assert.equal(await scalar('select source_project_ref from original_source_import_mappings limit 1'), ORIGINAL_PROJECT_REF)

  const mappings = (await db.query('select source_table, source_id, target_id, source_url from original_source_import_mappings')).rows
  const conflicts = (await db.query('select id, run_key, source_table, source_id, target_id, conflict_kind, recovery_status from original_source_import_conflicts')).rows
  const sqlMappingHash = (await db.query(MAPPING_HASH_SQL)).rows[0]
  const sqlConflictHash = (await db.query(CONFLICT_HASH_SQL)).rows[0]
  assert.equal(sqlMappingHash.mapping_sha256, hashMappingRows(PAGE.mappings))
  assert.equal(sqlConflictHash.conflict_sha256, hashConflictRows(PAGE.conflicts))
  assert.equal(sqlMappingHash.mapping_count, 3)
  assert.equal(sqlConflictHash.conflict_count, 2)
  assert.notEqual(sqlMappingHash.mapping_sha256, EXPECTED_LEDGER.mapping_sha256)

  await t.test('article remap is preserved and not inferred from the Cyclospora title', async () => {
    const article = mappings.find((row) => row.source_table === 'articles')
    assert.equal(article.source_id, '006e3e79-10e1-4d5f-99f5-0a1b46e4c93d')
    assert.equal(article.target_id, '2af74224-c8eb-4fba-9af6-6a7566d0d1f1')
    assert.notEqual(article.source_id, article.target_id)
    assert.equal(await scalar('select count(*)::int from original_source_import_mappings where source_id=$1', [CYCLOSPORA_EVENT.id]), 0)
    assert.equal(await scalar('select count(*)::int from nodes where id=$1', [CYCLOSPORA_EVENT.id]), 0)
    assert.equal(await scalar('select count(*)::int from events where id=$1', [investigation.eventId]), 0)
  })

  await t.test('recorded conflict recovery statuses stay exact', async () => {
    const skipped = conflicts.find((row) => row.conflict_kind === 'existing_import_mapping_skipped')
    const historical = conflicts.find((row) => row.conflict_kind === 'historical_url_upsert_no_snapshot')
    assert.equal(skipped.recovery_status, 'not_applicable_existing_mapping')
    assert.equal(historical.recovery_status, 'not_restorable_no_pre_import_snapshot')
    assert.equal(skipped.run_key, EXPECTED_LEDGER.conflict_kinds.existing_import_mapping_skipped.run_key)
    assert.equal(historical.run_key, EXPECTED_LEDGER.conflict_kinds.historical_url_upsert_no_snapshot.run_key)
    assert.equal(await scalar("select details->>'policy' from original_source_import_conflicts where conflict_kind='existing_import_mapping_skipped'"), 'insert-only; existing Version Two article fields are never updated')
  })

  await t.test('family-mismatch and weakened recovery are rejected before apply', async () => {
    assert.throws(
      () => assertLedgerPageSafe({
        mappings: [{ t: 'events', s: investigation.eventId, g: investigation.eventId, i: '2026-08-20T01:24:07Z' }],
      }, { graphEventIds: [investigation.eventId] }),
      new RegExp(IDENTITY_DECISIONS.family_mismatch),
    )
    assert.throws(
      () => assertLedgerPageSafe({
        conflicts: [{
          ...PAGE.conflicts[1],
          rs: 'restored_by_title',
        }],
      }),
      /recovery_status must stay/,
    )
  })

  await t.test('anonymous readers still cannot read the private ledger', async () => {
    await db.exec('set role anon')
    await assert.rejects(db.exec('select * from original_source_import_mappings'), /permission denied/)
    await assert.rejects(db.exec('select * from original_source_import_conflicts'), /permission denied/)
    await db.exec('reset role')
  })
})
