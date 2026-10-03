import test from 'node:test'
import assert from 'node:assert/strict'
import { replayRetainedNewsCorpus, replayValueSha256, REQUIRED_SCENARIOS, auditRetainedNewsSourceIndex } from '../scripts/retainedNewsReplay20261003.mjs'
import { retainedNewsRegressionCorpus } from './fixtures/retainedNewsReplay20261003.mjs'
import { NEWS_STATE_POLICY } from '../src/lib/newsStatePolicy.js'

test('point-in-time replay binds exact versions and measures policy boundaries by interval duration', () => {
  const corpus = retainedNewsRegressionCorpus(), before = JSON.stringify(corpus)
  const receipt = replayRetainedNewsCorpus(corpus)
  assert.equal(receipt.real_corpus.supplied_cases, 0)
  assert.equal(receipt.threshold_selection_performed, false)
  assert.equal(receipt.thresholds_approved_for_live_use, false)
  assert.deepEqual([...new Set(corpus.cases.flatMap(item => item.scenarios))].sort(), [...REQUIRED_SCENARIOS].sort())
  const selected = receipt.candidates.find(item => item.policy.version === NEWS_STATE_POLICY.version)
  for (const key of Object.keys(selected.metrics_by_classification.synthetic_regression).filter(key => key !== 'observed_ms')) assert.equal(selected.metrics_by_classification.synthetic_regression[key], 0, key)
  assert.ok(receipt.candidates[0].metrics_by_classification.synthetic_regression.premature_breaking_decay_ms > 0)
  assert.ok(receipt.candidates[2].metrics_by_classification.synthetic_regression.false_breaking_persistence_ms > 0)
  assert.deepEqual(replayRetainedNewsCorpus(corpus), receipt)
  assert.equal(JSON.stringify(corpus), before)
  const correction = selected.cases.find(item => item.id === 'backdated-correction-notice')
  assert.deepEqual(correction.transitions.map(row => row.state), ['UpdatedEstablished', 'Historical'])
  assert.equal(correction.transitions[0].effective_at, '2026-09-26T20:00:00.000Z')
  assert.ok(correction.transitions.every(row => row.context_sha256 && row.material_change_id && row.policy_version && row.review_refs.length))
})

test('missing, foreign or changed capture/review/context bindings fail without a replay verdict', () => {
  const edits = [
    corpus => corpus.cases[0].snapshots[0].context.story.sequence = '999',
    corpus => corpus.cases[0].snapshots[0].source_receipts[0].owner_capture_hash = 'f'.repeat(64),
    corpus => corpus.cases[0].snapshots[0].source_receipts[0].published_at = '2026-10-02T00:00:00Z',
    corpus => corpus.cases[0].snapshots[0].source_receipts[0].retained_base64 = Buffer.from('changed retained bytes').toString('base64'),
    corpus => corpus.cases[0].snapshots[0].source_receipts[0].rights_ref = null,
    corpus => corpus.cases[0].snapshots[0].review_receipts = [],
    corpus => corpus.cases[0].intervals[0].from = '2026-10-01',
    corpus => corpus.cases[0].intervals[0].from = '2026-10-01T00:00:00.000000001Z',
    corpus => corpus.cases[0].snapshots[0].observed_at = '2026-09-30T23:00:00Z',
    corpus => corpus.cases[0].intervals[1].from = '2026-10-01T01:00:00Z',
    corpus => {
      const snapshot = corpus.cases[0].snapshots[0]
      snapshot.context.material_changes[0].declared_at = '2026-10-01T01:00:00Z'
      snapshot.context_sha256 = replayValueSha256(snapshot.context)
    },
  ]
  for (const edit of edits) { const corpus = retainedNewsRegressionCorpus(); edit(corpus); assert.throws(() => replayRetainedNewsCorpus(corpus)) }
})

test('source report urgency, correction and repeated reads produce distinct recorded transitions', () => {
  const { candidates } = replayRetainedNewsCorpus(retainedNewsRegressionCorpus(), [NEWS_STATE_POLICY])
  const retraction = candidates[0].cases.find(item => item.id === 'attributed-retraction')
  assert.deepEqual(retraction.transitions.map(row => row.report_labels), [['BREAKING • SOURCE REPORT'], ['SOURCE REPORT']])
  assert.ok(retraction.transitions.every(row => row.state === 'UNAVAILABLE'))
  const supersession = candidates[0].cases.find(item => item.id === 'attributed-supersession')
  assert.deepEqual(supersession.transitions.map(row => row.report_labels), [['BREAKING • SOURCE REPORT'], ['SOURCE REPORT']])
  assert.equal(supersession.transitions[1].source_reports[0].reason_code, 'supporting_source_version_superseded')
  const reread = candidates[0].cases.find(item => item.id === 'repeated-fetch-observation')
  assert.deepEqual(reread.transitions.map(row => row.state), ['Breaking', 'UpdatedEstablished', 'Historical'])
  assert.equal(new Set(reread.intervals.map(row => row.material_change_id)).size, 1)
  assert.equal(new Set(reread.intervals.map(row => row.public_version_id)).size, 1)
})

test('fixture labels cannot acquire real classification implicitly; invalid policy is rejected', () => {
  const corpus = retainedNewsRegressionCorpus()
  corpus.cases[0].classification = 'retained_real'
  assert.throws(() => replayRetainedNewsCorpus(corpus), /independent_retained_labels/)
  corpus.cases[0].label_provenance = 'independent_retained_review'
  assert.throws(() => replayRetainedNewsCorpus(corpus), /review_authority_classification_mismatch/)
  const policy = { ...NEWS_STATE_POLICY, breakingFreshMs: NaN }
  assert.throws(() => replayRetainedNewsCorpus(retainedNewsRegressionCorpus(), [policy]), /invalid_policy/)
  assert.equal(replayValueSha256({ b: 2, a: 1 }), replayValueSha256({ a: 1, b: 2 }))
})

test('retained metadata inventory preserves source clocks as metadata without inferring a replay corpus', () => {
  const bytes = Buffer.from(JSON.stringify({ items: [{ title: 'Metadata', published_at: 'Wed, 29 Jan 2025 08:00:00 GMT', url: 'https://example.invalid/rss' }] }))
  const receipt = auditRetainedNewsSourceIndex({ path: 'fixture.json', bytes })
  assert.equal(receipt.records_with_publication_metadata, 1)
  assert.equal(receipt.replay_eligible_cases, 0)
  assert.match(receipt.qualification, /metadata_only/)
  assert.ok(receipt.absent_required_bindings.includes('independent_label_intervals'))
})

test('as-of replay cannot borrow later correction evidence, version or review labels', () => {
  const corpus = retainedNewsRegressionCorpus()
  const input = corpus.cases.find(item => item.id === 'correction-novelty-update')
  const beforeSnapshot = input.snapshots[0], laterSnapshot = input.snapshots[1]
  const beforeChange = beforeSnapshot.context.material_changes[0], laterChange = laterSnapshot.context.material_changes.at(-1)
  const result = replayRetainedNewsCorpus({ ...corpus, cases: [input] }, [NEWS_STATE_POLICY]).candidates[0].cases[0]
  const prior = result.intervals.find(row => row.from === '2026-10-01T00:00:00.000Z')
  assert.equal(prior.public_version_id, beforeSnapshot.context.story.public_version_id)
  assert.equal(prior.context_sha256, beforeSnapshot.context_sha256)
  assert.equal(prior.material_change_id, beforeChange.material_change_id)
  assert.deepEqual(prior.evidence_refs, beforeChange.evidence_refs)
  assert.equal(prior.state, 'Breaking')
  assert.ok(!prior.evidence_refs.includes(laterChange.evidence_refs[0]))
  const corrected = result.intervals.find(row => row.from === '2026-10-01T01:00:00.000Z')
  assert.equal(corrected.public_version_id, laterSnapshot.context.story.public_version_id)
  assert.equal(corrected.material_change_id, laterChange.material_change_id)
  assert.equal(corrected.state, 'UpdatedEstablished')
  // Retrospective evaluation labels are an oracle only; they are never supplied
  // to the engine. Changing a later interval cannot change earlier decisions.
  input.intervals[1].allowed_states = ['Historical']
  const relabeled = replayRetainedNewsCorpus({ ...corpus, cases: [input] }, [NEWS_STATE_POLICY]).candidates[0].cases[0]
  assert.deepEqual(relabeled.intervals[0], prior)
  assert.equal(relabeled.intervals.find(row => row.from === corrected.from).state, corrected.state)
})
