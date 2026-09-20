import test from 'node:test'
import assert from 'node:assert/strict'
import retained from '../verifier/demo-corpus-20260916/retained-source-receipts.json' with { type: 'json' }
import expanded from '../verifier/demo-corpus-20260916/expanded-source-receipts.json' with { type: 'json' }
import { createDemoUniverse, searchDemoUniverseWithCoverage, analyzeSources } from '../scripts/demoCorpus.mjs'
import { PROPAGATION_STAGES } from '../scripts/demoPropagation.mjs'
import ownerContract from './fixtures/demoOwnerContract.json' with { type: 'json' }
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

// Independent owner inventory, intentionally not produced from PROPAGATION_STAGES.
function assertOwnerFamilies(propagation) {
  for (const [name, requirement] of Object.entries(ownerContract.required_families)) {
    assert.ok(propagation.accounting[name], `Missing aggregate: ${requirement}`)
    assert.equal(propagation.accounting[name].inputs, 93)
    assert.ok(propagation.accounting[name].unit.length > 0)
    assert.equal(propagation.accounting[name].input_unit, 'receipt records')
    assert.equal(propagation.accounting[name].state_count_unit, 'receipt records')
    for (const source of propagation.sourceReceipts) {
      assert.ok(source.stages[name], `Missing source family: ${requirement}`)
      assert.ok(source.stages[name].state.length > 0)
      assert.ok(source.stages[name].reason.length > 0)
      assert.equal(source.stages[name].unit, propagation.accounting[name].unit)
      assert.equal(source.stages[name].publication_allowed, false)
    }
  }
}

test('independent owner inventory covers every source and aggregate, and detects each removed family', () => {
  assertOwnerFamilies(p)
  for (const family of Object.keys(ownerContract.required_families)) {
    const aggregateMissing = { ...p, accounting: { ...p.accounting } }
    delete aggregateMissing.accounting[family]
    assert.throws(() => assertOwnerFamilies(aggregateMissing), /Missing aggregate/)
    const stages = { ...p.sourceReceipts[0].stages }
    delete stages[family]
    assert.throws(() => assertOwnerFamilies({ ...p, sourceReceipts: [{ ...p.sourceReceipts[0], stages }, ...p.sourceReceipts.slice(1)] }), /Missing source family/)
  }
})

test('distinct groups, memberships, typed graph objects and accepted relationships have separate units', () => {
  for (const [key, expected] of Object.entries(ownerContract.distinct_objects)) {
    assert.equal(p.objectAccounting[key].count, expected)
    assert.match(p.objectAccounting[key].unit, /distinct/)
    assert.ok(p.objectAccounting[key].meaning.length > 0)
  }
  for (const [key, expected] of Object.entries(ownerContract.memberships)) assert.equal(p.objectAccounting[key].count, expected)
  assert.equal(p.accounting.source_lineage.unit, 'origin declarations')
  assert.equal(p.accounting.dependency_lineage.unit, 'dependency declarations')
  assert.equal(p.accounting.collections.unit, 'collection memberships')
  assert.equal(p.groups.origins.length, 32)
  assert.equal(p.groups.dependencies.length, 80)
  assert.equal(p.objectAccounting.graph_nodes_by_type.document.count, 93)
  assert.equal(p.objectAccounting.graph_nodes_by_type.declared_origin_identity.count, 2)
  assert.equal(p.objectAccounting.graph_edges_by_type.receipt_provenance.count, 17)
  assert.equal(p.objectAccounting.graph_edges_by_type.documentary.count, 0)
  for (const type of ownerContract.accepted_relationship_types) {
    assert.equal(p.objectAccounting.accepted_relationships_by_type[type].count, 0)
    assert.equal(p.objectAccounting.accepted_relationships_by_type[type].state, 'gated')
    for (const source of p.sourceReceipts) assert.equal(source.records.accepted_relationships_by_type[type].count, 0)
  }
  for (const name of Object.keys(p.counts)) assert.ok(p.count_units[name], `Missing count unit: ${name}`)
})

test('all supported metadata fields are searchable and the returned allowlist bounds every no-hit result', () => {
  const coverage = searchDemoUniverseWithCoverage(universe, '')
  for (const field of ownerContract.required_search_fields) assert.ok(coverage.searched_fields.includes(field), field)
  for (const field of coverage.searched_fields) {
    const source = universe.sources.find(row => row[field] !== null && row[field] !== '')
    if (!source) continue
    const result = searchDemoUniverseWithCoverage(universe, String(source[field]))
    assert.ok(result.results.some(row => row.source.capture_id === source.capture_id), `Not searchable: ${field}`)
    assert.equal(result.exact_text_sources_searched, 0)
  }
  for (const field of ['url', 'article_id', 'content_hash', 'dependency_id']) {
    for (const source of universe.sources) assert.ok(searchDemoUniverseWithCoverage(universe, source[field]).results.some(row => row.source === source), field)
  }
  assert.match(coverage.synopsis_basis, /never exact evidence/)
  assert.match(coverage.no_results_meaning, /listed receipt metadata fields/)
  assert.match(coverage.no_results_meaning, /exact evidence was not searched/)
})

test('missing native prerequisites remain explicit, with no fabricated decisions, reviews or withheld artifacts', () => {
  assert.equal(p.discovery.operation, 'structural_enumeration')
  assert.equal(p.discovery.semantic_stage, 'blocked')
  for (const source of p.sourceReceipts) {
    for (const name of ['outlet_framing', 'contradiction_candidates', 'correction_candidates', 'candidate_relationships', 'unresolved_identity_candidates', 'cross_investigation_candidate_relationships']) {
      assert.equal(source.stages[name].state, 'not_run')
      assert.equal(source.stages[name].output_count, 0)
    }
    for (const name of ['assumptions', 'unresolved_alternatives', 'linked_assessments', 'assessment_dependencies', 'review_baseline', 'review_current', 'review_prior', 'rejected', 'deferred', 'versioned_states', 'withheld_artifacts']) assert.equal(source.stages[name].output_count, null)
    assert.equal(source.records.evidence_check.hash_check, 'not_run')
    assert.equal(source.records.search_coverage.exact_text_state, 'not_run')
    assert.equal(source.records.historical_current.current_state, 'unknown')
    assert.equal(source.records.source_link.url, records.find(row => row.capture_id === source.capture_id).url)
    assert.equal(source.records.gates.publication, 'forbidden')
  }
  assert.equal(p.outletFraming.reduce((sum, row) => sum + row.receipt_coverage.count, 0), 93)
  assert.ok(p.outletFraming.every(row => row.analyses.count === 0 && row.analyses.state === 'not_run'))
})
