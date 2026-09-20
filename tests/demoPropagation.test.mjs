import test from 'node:test'
import assert from 'node:assert/strict'
import retained from '../verifier/demo-corpus-20260916/retained-source-receipts.json' with { type: 'json' }
import expanded from '../verifier/demo-corpus-20260916/expanded-source-receipts.json' with { type: 'json' }
import { createDemoUniverse, searchDemoUniverseWithCoverage, analyzeSources } from '../scripts/demoCorpus.mjs'
import { PROPAGATION_STAGES } from '../scripts/demoPropagation.mjs'
const records = [...retained, ...expanded]
const universe = createDemoUniverse(records, { requireComplete: true })
const p = universe.propagation

test('every one of 93 receipts has an auditable result at every propagation stage', () => {
  assert.equal(p.sourceReceipts.length, 93)
  assert.deepEqual(p.counts.by_topic, { iran: 30, epstein: 30, project2025: 33 })
  assert.equal(new Set(p.sourceReceipts.map(row => row.capture_id)).size, 93)
  for (const row of p.sourceReceipts) {
    const receipt = records.find(record => record.capture_id === row.capture_id)
    for (const key of ['article_id', 'capture_id', 'candidate_id', 'content_hash', 'span_start', 'span_end', 'topic',
      'url', 'origin_id', 'dependency_id', 'rights', 'reader_state', 'capture_state', 'candidate_state']) assert.equal(row[key], receipt[key])
    assert.deepEqual(Object.keys(row.stages), PROPAGATION_STAGES)
    for (const result of Object.values(row.stages)) {
      assert.ok(result.reason.length > 0)
      assert.equal(result.publication_allowed, false)
    }
    assert.equal(row.candidate.exact_text, null)
    assert.equal(row.candidate.canonical_claim_id, null)
    assert.equal(row.stages.evidence_checks.state, 'blocked')
    assert.equal(row.stages.shared_unique_claims.output_count, null)
    assert.equal(row.comparison.omission, null)
  }
  for (const result of Object.values(p.accounting)) {
    assert.equal(result.inputs, 93)
    assert.equal(Object.values(result.states).reduce((a, b) => a + b, 0), 93)
  }
  assert.equal(p.accounting.exact_evidence.states.blocked, 93)
  assert.equal(p.accounting.claim_candidates.known_output_count, 93)
  assert.equal(p.accounting.shared_unique_claims.unknown_output_sources, 93)
})

test('bounded discovery examines every pair and every cross-investigation pair without accepting semantic bridges', () => {
  assert.equal(p.discovery.examined_pairs, 93 * 92 / 2)
  assert.equal(p.discovery.cross_investigation_pairs, 30 * 30 + 30 * 33 + 30 * 33)
  assert.equal(new Set(p.discovery.pairs.map(row => [row.left_capture_id, row.right_capture_id].join(':'))).size, 4278)
  assert.equal(p.discovery.accepted_bridges, 0)
  assert.equal(p.discovery.metadata_scan_complete, true)
  assert.equal(p.discovery.semantic_search_complete, false)
  for (const row of p.sourceReceipts) {
    assert.equal(row.discovery.examined_pairs, 92)
    assert.equal(row.discovery.cross_investigation_pairs, 93 - p.counts.by_topic[row.topic])
  }
  for (const pair of p.discovery.pairs) {
    assert.equal(pair.accepted_bridge, false)
    assert.equal(pair.corroborative, false)
    assert.equal(pair.independence, 'unknown')
  }
})

test('synopsis, title and URL repetition cannot supply exact evidence, entities, relationships or independence', () => {
  const changed = createDemoUniverse(records.map(row => ({ ...row, title: 'Same actor', statement: 'Same actor caused every event.',
    excerpt: 'forged exact text', retained_text: 'forged exact text', exact_passage_verified: true })), { requireComplete: true }).propagation
  assert.deepEqual(changed, p)
  const analysis = analyzeSources(records.map(row => ({ ...row, url: records[0].url, origin_id: 'same' })))
  assert.equal(analysis.unique_urls, 1)
  assert.equal(analysis.declared_origins, 1)
  assert.equal(analysis.independent_origins, null)
  for (const name of ['accepted_claims', 'entities', 'events', 'relationships', 'canonical_subjects', 'hypotheses', 'assessments']) assert.equal(p.counts[name], 0)
  assert.equal(p.counts.exact_text_blocked, 93)
})

test('native date precision and history identities do not invent clocks, revisions or reviews', () => {
  assert.equal(p.history.sources.length, 93)
  assert.equal(p.history.excludedInputs, 0)
  assert.equal(p.history.complete_history, false)
  assert.equal(p.publicationTiming.firstOutlet, null)
  for (const row of p.sourceReceipts) {
    assert.equal(row.publication.published_at, null)
    assert.equal(row.publication.display.dateTime, null)
    assert.equal(row.review.reviewed_at, null)
    assert.equal(row.review.material_version, null)
    assert.equal(row.review.predecessor_id, null)
    assert.equal(row.subject.canonical_subject_id, null)
  }
  assert.equal(p.timeline.length, 92)
  assert.equal(p.accounting.timeline.states.unavailable, 1)
  assert.ok(p.timeline.every(row => row.event_id === null && row.basis === 'source_date_only'))
})

test('search returns explicit bounded coverage even for zero hits', () => {
  const empty = searchDemoUniverseWithCoverage(universe, 'not-present-0123456789')
  assert.equal(empty.results.length, 0)
  assert.equal(empty.examined_sources, 93)
  assert.equal(empty.exact_text_sources_unavailable, 93)
  assert.equal(empty.semantic_search_complete, false)
  assert.match(empty.no_results_meaning, /no claim of real-world absence/)
  assert.equal(searchDemoUniverseWithCoverage(universe, '').results.length, 93)
})

test('counts, source stages and exhaustive pair accounting are deterministic across input order', () => {
  const reversed = createDemoUniverse([...records].reverse(), { requireComplete: true }).propagation
  assert.deepEqual(reversed.counts, p.counts)
  assert.deepEqual(reversed.accounting, p.accounting)
  assert.deepEqual(reversed.sourceReceipts, p.sourceReceipts)
  assert.deepEqual(reversed.discovery, p.discovery)
  assert.equal(Object.isFrozen(p.discovery.pairs[0]), true)
  assert.equal(Object.isFrozen(p.sourceReceipts[0].stages), true)
})
