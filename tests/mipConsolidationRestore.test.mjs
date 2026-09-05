import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import {
  applyFoundation,
  restoreEclipseInvestigation,
  restoreIdentityLedger,
  restoreSourceRegisters,
} from '../scripts/mipConsolidationRestore.mjs'
import { ECLIPSE_ARTICLE } from '../scripts/mipConsolidationRestore.mjs'

test('isolated restore proves source registers, identity gaps, and one investigation', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]

  const registers = restoreSourceRegisters()
  assert.equal(registers.collection_enabled, false)
  assert.equal(await scalar('select count(*)::int from ingest_sources'), 7)
  assert.equal(await scalar('select count(*)::int from ingestion_sources'), 7)
  assert.equal(await scalar('select count(*)::int from ingest_sources where collection_enabled or enabled'), 0)
  assert.equal(await scalar("select count(*)::int from source_register_reconciliation where relationship='discovery_not_publisher'"), 4)
  assert.equal(await scalar('select auto_approval_enabled from algorithm_release_policies where algorithm=$1', ['arc']), false)
  assert.equal(await scalar('select auto_approval_threshold from algorithm_release_policies where algorithm=$1', ['source_comparison']), null)

  const ledger = restoreIdentityLedger()
  assert.equal(ledger.preservedGaps[0].recovery_status, 'not_restorable_no_pre_import_snapshot')
  assert.equal(await scalar("select recorded_count from identity_reconciliation_gaps where gap_kind='historical_url_upsert_no_snapshot'"), 752)

  const investigation = await restoreEclipseInvestigation(db, rpc)
  assert.equal(investigation.finished.outcome, 'existing')
  assert.equal(investigation.finished.article_id, 'e5a84674-0176-4704-b56f-e01c8ffa84f4')
  assert.equal(await scalar('select reader_state from articles where id=$1', [investigation.finished.article_id]), 'pending_review')
  assert.equal(await scalar('select count(*)::int from evidence_pipeline.evidence_candidates'), 3)
  assert.equal(await scalar("select count(*)::int from evidence_pipeline.evidence_candidates where review_state='pending'"), 3)

  await t.test('duplicate enqueue is idempotent and does not change eligibility', async () => {
    const again = await rpc('enqueue', { run_id: 'eclipse-duplicate', article: ECLIPSE_ARTICLE })
    assert.equal(again, investigation.jobId)
    assert.equal(await scalar('select count(*)::int from articles'), 1)
    assert.equal(await scalar('select reader_state from articles'), 'pending_review')
  })

  await t.test('stale lease cannot finish; retry remains bounded', async () => {
    await rpc('enqueue', { run_id: 'retry-path', article: { ...ECLIPSE_ARTICLE, url: 'https://example.org/retry-lease', title: 'Lease retry' } })
    const job = await rpc('claim')
    await assert.rejects(rpc('finish', { job_id: job.id, lease_token: '00000000-0000-4000-8000-000000000000' }), /lease/)
    assert.equal(await rpc('fail', { job_id: job.id, lease_token: job.lease_token, code: 'http_503', retryable: true }), 'retry_wait')
    assert.equal(await rpc('claim'), null)
  })

  await t.test('anonymous readers see the event and released geography, not the pending article', async () => {
    await db.exec('set role anon')
    assert.equal(await scalar('select count(*)::int from articles'), 0)
    const surface = (await db.query("select * from investigation_surface_public where canonical_event_id='acc55cb2-5ac2-4aed-be36-3f576d2bc443'")).rows[0]
    assert.equal(surface.public_article_count, 0)
    assert.equal(surface.has_released_geography, true)
    assert.equal(surface.auto_approval_enabled, false)
    assert.equal(surface.reviewed_claim_count, 0)
    await assert.rejects(db.exec('select * from evidence_pipeline.evidence_candidates'), /permission denied/)
    await assert.rejects(db.exec('update algorithm_release_policies set auto_approval_enabled=true'), /permission denied/)
    await db.exec('reset role')
  })

  await t.test('correction keeps the original pending article and appends history', async () => {
    await rpc('enqueue', { run_id: 'correction', article: { ...ECLIPSE_ARTICLE, title: 'Corrected eclipse table' } })
    const job = await rpc('claim')
    const result = await rpc('finish', { job_id: job.id, lease_token: job.lease_token })
    assert.equal(result.outcome, 'revision_pending')
    assert.equal(await scalar('select title from articles where id=$1', [result.article_id]), ECLIPSE_ARTICLE.title)
    assert.ok(await scalar('select count(*)::int from evidence_pipeline.record_versions where record_kind=$1', ['article']) >= 1)
  })
})
