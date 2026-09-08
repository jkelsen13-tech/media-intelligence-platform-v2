import {evaluateRecordCandidates} from './evaluateRecordCandidates.mjs'

// Offline paired diagnostics. Reuse the full corpus/run gate before pairing by identity.
const referenceLabels = ['supporting', 'disconfirming', 'unrelated', 'unresolved']
const decisions = ['supporting', 'disconfirming', 'unrelated', 'abstain']
const ratio = (numerator, denominator) => ({numerator, denominator, value: denominator ? numerator / denominator : null})
const transitions = () => ({retained: 0, gained: 0, lost: 0, neither: 0})
function recordTransition(counts, before, after) {
  counts[before ? (after ? 'retained' : 'lost') : (after ? 'gained' : 'neither')]++
}
function labelSummary(cases, predictions, label) {
  let retrieved = 0, decided = 0, correct = 0
  for (const item of cases) {
    const prediction = predictions.get(item.id)
    retrieved += Number(prediction.retrieved)
    decided += Number(prediction.decision !== 'abstain')
    correct += Number(label !== 'unresolved' && prediction.decision === label)
  }
  return {
    population: cases.length,
    retrieval_coverage: ratio(retrieved, cases.length),
    decision_coverage: ratio(decided, cases.length),
    abstention_rate: ratio(cases.length - decided, cases.length),
    // Unresolved reference labels cannot support correctness judgments.
    verifier_accuracy: label === 'unresolved' ? null : ratio(correct, decided),
    correct_population_coverage: label === 'unresolved' ? null : ratio(correct, cases.length),
  }
}

export function compareRecordCandidateRuns(manifestJson, baselineJson, candidateJson) {
  const baseline = evaluateRecordCandidates(manifestJson, baselineJson)
  const candidate = evaluateRecordCandidates(manifestJson, candidateJson)
  // All three strings passed bounded parsing, exact manifest binding and complete-case validation.
  const cases = JSON.parse(manifestJson).cases.filter(item => item.partition === 'heldout')
  const before = new Map(JSON.parse(baselineJson).predictions.map(item => [item.case_id, item]))
  const after = new Map(JSON.parse(candidateJson).predictions.map(item => [item.case_id, item]))
  const by_label = Object.fromEntries(referenceLabels.map(label => {
    const members = cases.filter(item => item.label === label)
    const retrieval = transitions()
    const correctness = label === 'unresolved' ? null : transitions()
    const decision_transitions = Object.fromEntries(decisions.map(from =>
      [from, Object.fromEntries(decisions.map(to => [to, 0]))]))
    for (const item of members) {
      const old = before.get(item.id), next = after.get(item.id)
      recordTransition(retrieval, old.retrieved, next.retrieved)
      if (correctness) recordTransition(correctness, old.decision === label, next.decision === label)
      decision_transitions[old.decision][next.decision]++
    }
    return [label, {
      baseline: labelSummary(members, before, label),
      candidate: labelSummary(members, after, label),
      retrieval_transitions: retrieval,
      correctness_transitions: correctness,
      decision_transitions,
    }]
  }))
  return {
    contract: 'record-candidate-paired-diagnostic-report-1',
    manifest_sha256: baseline.manifest_sha256,
    baseline, candidate, by_label,
    qualification: 'not_assessed',
    model_selection: 'not_assessed',
    limitations: [
      'Both runs are compared on the same exact manifest bytes and every held-out case; run order has no matching role.',
      'Per-label retrieval coverage for unrelated or unresolved cases is not relevant-evidence recall.',
      'Correctness gains and losses are descriptive case transitions, not independent-trial significance or source corroboration.',
      'Reference labels, grouping, artifacts and rights remain unauthenticated operator assertions under the underlying evaluator.',
      'No source text, references, case identities or adjudication rationales are copied into the comparison.',
      'No automatic winner, threshold, worker qualification, evidence reassessment or publication is issued.'
    ],
  }
}
