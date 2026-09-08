import {createHash} from 'node:crypto'

// Offline diagnostics only. No network, database, qualification or publication API.
const SHA = /^[a-f0-9]{64}$/
const labels = ['supporting', 'disconfirming', 'unrelated']
const groups = ['event_groups', 'arc_groups', 'origin_groups', 'duplicate_groups']
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex')
const fingerprint = value => typeof value === 'string' && SHA.test(value)
const fail = message => { throw Error(message) }
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
function parse(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 2 * 1024 * 1024) fail('bounded JSON text required')
  const value = JSON.parse(raw)
  let nodes = 0
  function check(node, depth) {
    if (++nodes > 60000 || depth > 12) fail('JSON structure budget exceeded')
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe JSON key')
        check(child, depth + 1)
      }
    }
  }
  check(value, 0)
  return value
}
const ratio = (numerator, denominator) => ({numerator, denominator, value: denominator ? numerator / denominator : null})

export function evaluateRecordCandidates(manifestJson, predictionsJson) {
  const manifest = parse(manifestJson), run = parse(predictionsJson)
  if (!exact(manifest, ['contract', 'development_until', 'heldout_from', 'cases'])
      || manifest.contract !== 'record-candidate-corpus-1'
      || !utc(manifest.development_until) || !utc(manifest.heldout_from)
      || manifest.development_until >= manifest.heldout_from) fail('invalid corpus boundary')
  if (!Array.isArray(manifest.cases) || manifest.cases.length < 2 || manifest.cases.length > 1000) fail('expected 2..1000 cases')
  const ids = new Set(), partitions = new Set(), ownership = new Map()
  for (const item of manifest.cases) {
    if (!exact(item, ['id', 'partition', 'observed_at', 'input_sha256', 'retained_reference',
      ...groups, 'label', 'adjudication'])) fail('invalid case shape')
    if (!text(item.id) || ids.has(item.id)) fail('duplicate or invalid case identity')
    ids.add(item.id)
    if (!['development', 'heldout'].includes(item.partition)) fail('invalid partition')
    partitions.add(item.partition)
    if (!utc(item.observed_at) || (item.partition === 'development'
      ? item.observed_at > manifest.development_until : item.observed_at < manifest.heldout_from)) fail('temporal split leakage')
    if (!fingerprint(item.input_sha256) || !text(item.retained_reference)) fail('retained input identity required')
    const keys = ['input:' + item.input_sha256]
    for (const group of groups) {
      if (!Array.isArray(item[group]) || item[group].length < 1 || item[group].length > 32
          || item[group].some(value => !text(value)) || new Set(item[group]).size !== item[group].length) fail('explicit split groups required')
      keys.push(...item[group].map(value => group + ':' + value))
    }
    for (const key of keys) {
      if (ownership.has(key) && ownership.get(key) !== item.partition) fail('cross-partition group or input leakage')
      ownership.set(key, item.partition)
    }
    if (![...labels, 'unresolved'].includes(item.label)) fail('invalid reference label')
    if (!exact(item.adjudication, ['status', 'reference', 'rationale', 'sha256'])
      || !text(item.adjudication.reference) || !text(item.adjudication.rationale)
      || !fingerprint(item.adjudication.sha256)
      || item.adjudication.status !== (item.label === 'unresolved' ? 'unresolved' : 'independently_adjudicated')) fail('adjudication required')
  }
  if (partitions.size !== 2) fail('both development and heldout partitions required')
  if (!exact(run, ['contract', 'manifest_sha256', 'implementation_sha256', 'algorithm_version', 'predictions'])
      || run.contract !== 'record-candidate-predictions-1' || run.manifest_sha256 !== hash(manifestJson)
      || !fingerprint(run.implementation_sha256) || !text(run.algorithm_version)
      || !Array.isArray(run.predictions)) fail('invalid run identity')
  const heldout = manifest.cases.filter(item => item.partition === 'heldout')
  const byId = new Map(heldout.map(item => [item.id, item]))
  const seen = new Set()
  const counts = {population: heldout.length, resolved: 0, unresolved: 0, retrieved: 0,
    retrieved_unresolved: 0, relevant: 0, retrieved_relevant: 0, retrieval_misses: 0,
    decisions: 0, correct: 0, incorrect: 0, abstentions: 0, unresolved_decisions: 0,
    wrong_polarity: 0, false_relation: 0, missed_relation: 0}
  const confusion = Object.fromEntries(labels.map(label => [label,
    Object.fromEntries([...labels, 'abstain'].map(decision => [decision, 0]))]))
  for (const prediction of run.predictions) {
    if (!exact(prediction, ['case_id', 'retrieved', 'decision']) || !byId.has(prediction.case_id)
      || seen.has(prediction.case_id) || typeof prediction.retrieved !== 'boolean'
      || ![...labels, 'abstain'].includes(prediction.decision)
      || (!prediction.retrieved && prediction.decision !== 'abstain')) fail('invalid or duplicate prediction')
    seen.add(prediction.case_id)
    const item = byId.get(prediction.case_id)
    counts.retrieved += Number(prediction.retrieved)
    counts.abstentions += Number(prediction.decision === 'abstain')
    if (item.label === 'unresolved') {
      counts.unresolved++
      counts.retrieved_unresolved += Number(prediction.retrieved)
      counts.unresolved_decisions += Number(prediction.decision !== 'abstain')
      continue
    }
    counts.resolved++
    const relevant = item.label !== 'unrelated'
    counts.relevant += Number(relevant)
    counts.retrieved_relevant += Number(relevant && prediction.retrieved)
    counts.retrieval_misses += Number(relevant && !prediction.retrieved)
    confusion[item.label][prediction.decision]++
    if (prediction.decision === 'abstain') continue
    counts.decisions++
    counts.correct += Number(prediction.decision === item.label)
    counts.incorrect += Number(prediction.decision !== item.label)
    counts.wrong_polarity += Number(relevant && prediction.decision !== 'unrelated' && prediction.decision !== item.label)
    counts.false_relation += Number(!relevant && prediction.decision !== 'unrelated')
    counts.missed_relation += Number(relevant && prediction.decision === 'unrelated')
  }
  if (seen.size !== heldout.length) fail('every heldout case requires a prediction, including misses and abstentions')
  return {
    contract: 'record-candidate-diagnostic-report-1',
    manifest_sha256: hash(manifestJson), predictions_sha256: hash(predictionsJson),
    implementation_sha256: run.implementation_sha256, algorithm_version: run.algorithm_version,
    counts, confusion,
    retrieval_recall: ratio(counts.retrieved_relevant, counts.relevant),
    retrieval_precision: ratio(counts.retrieved_relevant, counts.retrieved - counts.retrieved_unresolved),
    verifier_accuracy: ratio(counts.correct, counts.decisions),
    resolved_decision_coverage: ratio(counts.decisions, counts.resolved),
    useful_population_coverage: ratio(counts.correct, counts.population),
    unresolved_population: ratio(counts.unresolved, counts.population),
    abstention_rate: ratio(counts.abstentions, counts.population),
    qualification: 'not_assessed',
    limitations: [
      'Input references, independent adjudication and grouping are operator assertions, not authenticated or fetched.',
      'Group and exact-input overlap checks cannot detect undisclosed near duplicates or source relationships.',
      'Case-level ratios are descriptive; correlated cases are not independent trials and no confidence bound is asserted.',
      'This bounded corpus is not proof of complete admission-population coverage or semantic readiness.',
      'No passing threshold, worker qualification, reassessment or publication is issued.'
    ]
  }
}
