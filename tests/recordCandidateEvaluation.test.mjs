import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {evaluateRecordCandidates} from '../scripts/evaluateRecordCandidates.mjs'
const sha = text => createHash('sha256').update(text).digest('hex')
const item = (id, label, partition = 'heldout') => ({
  id, partition, observed_at: partition === 'heldout' ? '2026-02-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
  input_sha256: sha(id), retained_reference: 'synthetic:' + id,
  event_groups: [id], arc_groups: [id], origin_groups: [id], duplicate_groups: [id],
  label, adjudication: {status: label === 'unresolved' ? 'unresolved' : 'independently_adjudicated',
    reference: 'synthetic:label:' + id, rationale: 'Synthetic test only; not a qualification.', sha256: sha('label:' + id)}
})
function fixture() {
  const manifest = {contract: 'record-candidate-corpus-1', development_until: '2026-01-31T23:59:59.999Z',
    heldout_from: '2026-02-01T00:00:00.000Z',
    cases: [item('dev', 'unrelated', 'development'), item('a', 'supporting'),
      item('b', 'disconfirming'), item('c', 'unrelated'), item('d', 'unresolved'), item('e', 'supporting')]}
  const run = {contract: 'record-candidate-predictions-1', manifest_sha256: '',
    implementation_sha256: sha('synthetic-implementation'), algorithm_version: 'synthetic-1',
    predictions: [
      {case_id: 'a', retrieved: true, decision: 'supporting'},
      {case_id: 'b', retrieved: true, decision: 'supporting'},
      {case_id: 'c', retrieved: true, decision: 'supporting'},
      {case_id: 'd', retrieved: true, decision: 'supporting'},
      {case_id: 'e', retrieved: false, decision: 'abstain'}]}
  return {manifest, run}
}
function evaluate(f = fixture()) {
  const raw = JSON.stringify(f.manifest)
  return evaluateRecordCandidates(raw, JSON.stringify({...f.run, manifest_sha256: sha(raw)}))
}
test('separates retrieval, decision errors, unresolved labels and full-population coverage', () => {
  const report = evaluate()
  assert.deepEqual(report.retrieval_recall, {numerator: 2, denominator: 3, value: 2 / 3})
  assert.equal(report.retrieval_precision.value, 2 / 3)
  assert.equal(report.verifier_accuracy.value, 1 / 3)
  assert.equal(report.useful_population_coverage.value, 1 / 5)
  assert.equal(report.resolved_decision_coverage.value, 3 / 4)
  assert.equal(report.counts.wrong_polarity, 1)
  assert.equal(report.counts.false_relation, 1)
  assert.equal(report.counts.retrieval_misses, 1)
  assert.equal(report.counts.unresolved_decisions, 1)
  assert.equal(report.confusion.supporting.abstain, 1)
  assert.equal(report.qualification, 'not_assessed')
})
test('rejects leakage through each declared grouping and repeated input hash', () => {
  for (const key of ['event_groups', 'arc_groups', 'origin_groups', 'duplicate_groups', 'input_sha256']) {
    const f = fixture()
    f.manifest.cases[1][key] = f.manifest.cases[0][key]
    assert.throws(() => evaluate(f), /leakage/)
  }
})
test('checks real UTC boundaries and requires both partitions', () => {
  for (const value of ['2026-02-30T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00-05:00']) {
    const f = fixture(); f.manifest.cases[1].observed_at = value
    assert.throws(() => evaluate(f), /temporal/)
  }
  const f = fixture(); f.manifest.cases.shift()
  assert.throws(() => evaluate(f), /both/)
})
test('requires every heldout result and rejects development, duplicate and unknown results', () => {
  const f = fixture(); f.run.predictions.pop()
  assert.throws(() => evaluate(f), /every heldout/)
  for (const id of ['dev', 'unknown', 'a']) {
    const g = fixture(); g.run.predictions.push({...g.run.predictions[0], case_id: id})
    assert.throws(() => evaluate(g), /prediction/)
  }
})
test('retrieval misses cannot carry an unexecuted verifier decision', () => {
  const f = fixture(); f.run.predictions[4].decision = 'supporting'
  assert.throws(() => evaluate(f), /prediction/)
})
test('unresolved and abstaining populations retain null rather than invented accuracy', () => {
  const f = fixture()
  f.manifest.cases.slice(1).forEach(x => {x.label = 'unresolved'; x.adjudication.status = 'unresolved'})
  f.run.predictions.forEach(x => {x.retrieved = false; x.decision = 'abstain'})
  const r = evaluate(f)
  assert.equal(r.retrieval_recall.value, null)
  assert.equal(r.retrieval_precision.value, null)
  assert.equal(r.verifier_accuracy.value, null)
  assert.equal(r.unresolved_population.value, 1)
  assert.equal(r.abstention_rate.value, 1)
  assert.equal(r.useful_population_coverage.value, 0)
})
test('binds exact manifest bytes and rejects missing adjudication and malformed groups', () => {
  const f = fixture(), raw = JSON.stringify(f.manifest)
  assert.throws(() => evaluateRecordCandidates(raw, JSON.stringify(f.run)), /run identity/)
  for (const edit of [
    x => {x.adjudication.status = 'model_output'},
    x => {x.origin_groups = []},
    x => {x.adjudication.sha256 = 'not-a-hash'},
    x => {x.extra = true}
  ]) {
    const g = fixture(); edit(g.manifest.cases[1])
    assert.throws(() => evaluate(g))
  }
})
test('bounded JSON rejects unsafe keys, oversized input and excessive nesting', () => {
  assert.throws(() => evaluateRecordCandidates('{"__proto__":{}}', '{}'), /unsafe/)
  assert.throws(() => evaluateRecordCandidates(' '.repeat(2 * 1024 * 1024 + 1), '{}'), /bounded/)
  assert.throws(() => evaluateRecordCandidates('['.repeat(14) + '0' + ']'.repeat(14), '{}'), /structure/)
})
test('reports a false negative separately from wrong polarity', () => {
  const f = fixture(); f.run.predictions[0].decision = 'unrelated'
  const r = evaluate(f)
  assert.equal(r.counts.missed_relation, 1)
  assert.equal(r.counts.wrong_polarity, 1)
})
