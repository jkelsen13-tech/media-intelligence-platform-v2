import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRetainedRealNewsClockReplay, runRetainedRealNewsClockReplay, validateSupplementalClockBindings } from '../scripts/qualification/retained-real-news-replay/replay.mjs'
import { replayRetainedNewsCorpus, replayValueSha256 } from '../scripts/retainedNewsReplay20261003.mjs'
import { NEWS_STATE_POLICY } from '../src/lib/newsStatePolicy.js'

const built = await buildRetainedRealNewsClockReplay()
const replay = await runRetainedRealNewsClockReplay()
const cases = replay.supplemental_replay.candidates[0].cases
const find = id => cases.find(item => item.id === id)
const durationErrors = ['state_error_ms', 'false_breaking_persistence_ms', 'premature_breaking_decay_ms', 'report_label_error_ms', 'false_report_breaking_ms', 'material_binding_error_ms', 'correction_error_ms']

test('retained actual bytes retain their original two benchmark cases and separate five simulated clock cases', () => {
  assert.equal(replay.receipt.actual_source_bytes, 1303886)
  assert.equal(replay.receipt.actual_source_revisions, 2)
  assert.equal(replay.receipt.original_benchmark_cases_unchanged, 2)
  assert.equal(replay.receipt.supplemental_cases, 5)
  assert.equal(replay.receipt.original_benchmark_corpus_sha256, replayValueSha256(built.original.corpus))
  assert.equal(replay.original_replay.corpus_sha256, replayValueSha256(built.original.corpus))
  assert.equal(replay.receipt.actual_mip_admissions, 0)
  assert.equal(replay.receipt.authoritative_event_or_report_clock_cases, 0)
  assert.equal(replay.receipt.provider_designated_corrections, 0)
  assert.equal(replay.supplemental_replay.real_corpus.supplied_cases, 0)
  assert.equal(replay.receipt.representative_longitudinal_calibration_gate, 'OPEN')
  assert.equal(replay.receipt.numerical_calibration_performed, false)
  assert.equal(replay.receipt.numerical_policy_changed, false)
  assert.equal(replay.supplemental_replay.candidates[0].policy.qualification, 'synthetic_calibrated_candidate')
  for (const item of cases) {
    assert.ok(item.intervals.every(row => row.state === 'UNAVAILABLE' && row.report_labels.every(label => label === 'SOURCE REPORT')))
    for (const metric of durationErrors) assert.equal(item.metrics[metric], 0, `${item.id}: ${metric}`)
  }
})

test('as-of revision selection retains exact capture identity without borrowing the later material ID or bytes', () => {
  const result = find('cisa-retained-revision-as-of-isolation')
  const before = result.intervals[0], after = result.intervals.find(row => row.snapshot_observed_at.endsWith('05:19:48.000Z'))
  assert.notEqual(before.public_version_id, after.public_version_id)
  assert.notEqual(before.material_change_id, after.material_change_id)
  assert.equal(before.source_reports[0].capture_hash, built.original.receipt.records[0].content_sha256)
  assert.equal(after.source_reports[0].capture_hash, built.original.receipt.records[1].content_sha256)
  assert.deepEqual(before.source_reports[0].evidence_refs, [before.source_reports[0].public_version_id])
  assert.ok(!before.source_reports[0].evidence_refs.includes(after.source_reports[0].public_version_id))
  const input = built.corpus.cases[0]
  input.intervals[1].allowed_report_labels = ['BREAKING • SOURCE REPORT']
  const relabeled = replayRetainedNewsCorpus({ ...built.corpus, cases: [input] }, [NEWS_STATE_POLICY]).candidates[0].cases[0]
  assert.deepEqual(relabeled.intervals[0], before)
  input.intervals[1].allowed_report_labels = ['SOURCE REPORT']
})

test('stale actual repository source time cannot become Breaking under a simulated fresh major declaration or repeated fetch', () => {
  const result = find('cisa-stale-source-clock-simulated-material-decay')
  assert.deepEqual(result.transitions.map(row => row.source_reports[0].reason_code), [
    'source_report_clock_stale', 'established_material_update', 'material_change_phase_quiet',
  ])
  assert.deepEqual(result.transitions.map(row => row.from), [
    '2026-10-03T04:19:48.000Z', '2026-10-03T06:19:48.000Z', '2026-10-06T04:19:48.000Z',
  ])
  assert.equal(new Set(result.intervals.map(row => row.material_change_id)).size, 1)
  assert.equal(new Set(result.intervals.map(row => row.public_version_id)).size, 1)
  assert.ok(result.intervals.every(row => row.source_reports[0].report_time === '2025-03-31T18:47:50Z'))
  const clockRows = replay.clock_bindings.find(item => item.id === result.id).snapshots
  assert.equal(clockRows.at(-1).simulated_fetch_observation_at, '2026-10-06T05:19:48.000Z')
  assert.ok(clockRows.every(row => row.sources[0].actual_retrieved_at === '2026-10-03T04:19:48Z'))
})

test('unknown authoritative source time stays unknown despite simulated current material and observation clocks', () => {
  const result = find('cisa-unknown-report-clock-simulated-rapid-declaration')
  assert.ok(result.intervals.every(row => row.source_reports[0].report_time === null
    && row.source_reports[0].reason_code === 'source_report_time_missing'))
  for (const entry of replay.clock_bindings) for (const snapshot of entry.snapshots) for (const source of snapshot.sources) {
    assert.equal(source.authoritative_event_time, null)
    assert.equal(source.authoritative_report_time, null)
    assert.equal(source.canonical_publication_available_at, null)
  }
})

test('simulated backdated correction uses declaration decay and retains old effective clock without creating Breaking', () => {
  const result = find('cisa-simulated-backdated-correction-notice-decay')
  assert.deepEqual(result.transitions.map(row => row.source_reports[0].reason_code), [
    'source_report_clock_stale', 'reviewed_correction', 'material_change_phase_quiet',
  ])
  assert.deepEqual(result.transitions.map(row => row.from), [
    '2026-10-03T04:19:48.000Z', '2026-10-03T05:19:48.000Z', '2026-10-06T05:19:48.000Z',
  ])
  const correction = result.transitions[1].source_reports[0]
  assert.equal(correction.effective_at, '2025-03-31T18:47:50Z')
  assert.equal(correction.declared_at, '2026-10-03T05:19:48.000Z')
  assert.match(built.corpus.cases[3].snapshots[1].context.material_changes.at(-1).reason, /provider did not designate/)
  assert.ok(result.intervals.every(row => row.source_reports[0].assertion_scope === 'attributed_source_report_only'))
})

test('a superseded selected version keeps its selected bytes and explicit reason without substituting latest source', () => {
  const result = find('cisa-superseded-selected-source-no-latest-fallback')
  assert.ok(result.intervals.every(row => row.source_reports[0].reason_code === 'supporting_source_version_superseded'))
  assert.ok(result.intervals.every(row => row.source_reports[0].capture_hash === built.original.receipt.records[0].content_sha256))
})

test('adapter refuses actual-byte digest, authoritative clock and source report clock promotion', () => {
  const edits = [
    [item => { item.snapshots[0].source_receipts[0].retained_base64 = Buffer.from('different bytes').toString('base64') }, /capture_digest_binding/],
    [item => { item.snapshots[0].clock_bindings.sources[0].authoritative_event_time = '2025-03-31T18:47:50Z' }, /authoritative_clock_not_established/],
    [item => { item.snapshots[0].clock_bindings.sources[0].authoritative_report_time = '2025-03-31T18:47:50Z' }, /authoritative_clock_not_established/],
    [item => { item.snapshots[0].context.story.members[0].published_at = item.snapshots[0].observed_at }, /source_report_clock_promoted/],
    [item => { item.snapshots[0].clock_bindings.sources[0].published_at_mapping = 'authoritative_report_time' }, /source_report_clock_promoted/],
    [item => { item.snapshots[0].context.story.members[0].fetched_at = '2026-10-04T04:19:48Z' }, /retention_clock_changed/],
    [item => { item.snapshots[0].clock_bindings.observation_mapping = 'actual_historical_reader_observation' }, /observation_clock_binding_mismatch/],
  ]
  for (const [edit, expected] of edits) {
    const input = structuredClone(built.corpus.cases[0]); edit(input)
    assert.throws(() => validateSupplementalClockBindings([input], built.original.receipt), expected)
  }
})

test('adapter refuses real-review relabeling and provider correction designation while the existing verifier rejects unbound reviews', () => {
  const item = structuredClone(built.corpus.cases[0])
  item.classification = 'retained_real'
  assert.throws(() => validateSupplementalClockBindings([item], built.original.receipt), /simulated_review_classification/)
  item.classification = 'retained_real_simulated_review'
  item.provider_correction_designation = 'PROVIDER_CORRECTION'
  assert.throws(() => validateSupplementalClockBindings([item], built.original.receipt), /correction_designation_not_established/)
  const unbound = structuredClone(built.corpus)
  unbound.cases[0].snapshots[0].review_receipts = []
  assert.throws(() => replayRetainedNewsCorpus(unbound, [NEWS_STATE_POLICY]), /unbound_review_reference/)
})
