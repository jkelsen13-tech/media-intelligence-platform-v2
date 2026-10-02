import test from 'node:test'
import assert from 'node:assert/strict'
import { runCanonicalIntakeReaderJourney } from '../verifier/runCanonicalIntakeReaderJourney.mjs'

test('actual adapter, native queue/capture SQL and bound SDK reader form one isolated publication journey', async () => {
  const receipt = await runCanonicalIntakeReaderJourney()
  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.checks.length, 11)
  assert.ok(receipt.checks.every(check => check.status === 'PASS'))
  assert.equal(receipt.live_operations, 0)
  assert.ok(receipt.executed_sql.some(query => query.role === 'service_role' && query.sql.includes('mip_pipeline_v1')))
  for (const role of ['anon', 'authenticated']) {
    assert.ok(receipt.requests.some(request => request.role === role && request.path.endsWith('news_reviewed_articles_public')))
    assert.ok(receipt.executed_sql.some(query => query.role === role && query.sql.includes('evidence_pipeline')))
  }
  const report = receipt.checks.find(check => check.detail?.eligibility_alone_did_not_publish)
  assert.ok(report); assert.equal(report.detail.admission, 'attributed_source_report_only')
  assert.ok(receipt.checks.some(check => check.detail?.pending_revision_notice_available === true))
  assert.ok(receipt.artifacts.every(file => /^[0-9a-f]{64}$/.test(file.sha256)))
})
