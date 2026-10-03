import test from 'node:test'
import assert from 'node:assert/strict'
import { loadOfficialKevBenchmark, parseKevCatalog } from '../scripts/officialKevBenchmark20261003.mjs'
import { replayRetainedNewsCorpus } from '../scripts/retainedNewsReplay20261003.mjs'
import { NEWS_STATE_POLICY } from '../src/lib/newsStatePolicy.js'

test('actual retained official bytes and rights hashes verify independently; exact catalog differences replay with simulated authority', async () => {
  const { corpus, receipt } = await loadOfficialKevBenchmark()
  assert.equal(receipt.source_bytes, 1303886)
  assert.equal(receipt.repository_revision_interval_seconds, 346394)
  assert.equal(receipt.actual_mip_admissions, 0)
  assert.equal(receipt.rights.license, 'CC0-1.0')
  const diff = receipt.observed_source_difference
  assert.equal(diff.before_rows, 1311); assert.equal(diff.after_rows, 1312)
  assert.deepEqual(diff.added, ['CVE-2024-20439'])
  assert.equal(diff.unchanged_common_records, 1308)
  assert.equal(diff.changed.length, 3)
  assert.deepEqual(diff.changed[0].fields.knownRansomwareCampaignUse, { before: 'Unknown', after: 'Known' })
  assert.equal(receipt.records[0].issued_at_utc, null)
  const replay = replayRetainedNewsCorpus(corpus, [NEWS_STATE_POLICY])
  assert.equal(replay.real_corpus.supplied_cases, 0)
  assert.equal(replay.threshold_selection_performed, false)
  for (const item of replay.candidates[0].cases) {
    assert.equal(item.classification, 'retained_real_simulated_review')
    assert.ok(item.intervals.every(row => row.state === 'UNAVAILABLE' && row.report_labels[0] === 'SOURCE REPORT'))
    assert.equal(item.metrics.report_label_error_ms, 0)
    assert.equal(item.metrics.material_binding_error_ms, 0)
    assert.equal(item.intervals[0].source_reports[0].capture_hash, receipt.records[1].content_sha256)
  }
  assert.equal(replay.candidates[0].cases[1].intervals[0].source_reports[0].reason_code, 'source_report_time_missing')
})

test('CSV parser preserves quoted commas, quotes and newlines and refuses malformed or duplicate identifiers', () => {
  const rows = parseKevCatalog(Buffer.from('cveID,notes\r\nCVE-2025-1,"line one, with ""quotes""\nline two"\r\n'))
  assert.equal(rows.get('CVE-2025-1').notes, 'line one, with "quotes"\nline two')
  assert.throws(() => parseKevCatalog(Buffer.from('cveID,notes\nCVE-2025-1,"unfinished')), /unterminated_csv_quote/)
  assert.throws(() => parseKevCatalog(Buffer.from('cveID,notes\nCVE-2025-1,a\nCVE-2025-1,b')), /duplicate_cve/)
})
