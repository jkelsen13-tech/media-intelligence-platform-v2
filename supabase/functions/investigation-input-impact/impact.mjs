// Server-only projection of an authorized immutable workspace read.
// Membership is recorded context, not support or a withdrawal reassessment.
export const INPUT_IMPACT_CONTRACT = 'investigation-input-impact-1'
export const validPosition = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
// Duplicate saved identities are unresolved, regardless of row order or payload.
function unambiguousRows(rows, key) {
  const result = new Map()
  for (const row of rows) {
    const id = row?.[key]
    if (typeof id !== 'string' || !id.trim()) continue
    result.set(id, result.has(id) ? null : row)
  }
  return result
}
const unique = values => [...new Set(values)]
const citationIndices = (evidence, position) => evidence.flatMap((ref, index) => ref.position === position ? [index] : [])

export function retainedInputImpact(bundle, position) {
  if (!validPosition(position)) throw new Error('invalid_position')
  const snapshot = bundle?.observation?.snapshot, state = bundle?.version?.state
  if (bundle?.contract_version !== 'investigation-workspace-1' || bundle.publicly_eligible !== false || !snapshot || !state)
    throw new Error('invalid_workspace')
  const inputs = unambiguousRows(snapshot.inputs, 'position')
  if (!inputs.has(position)) throw new Error('input_unavailable')
  if (!inputs.get(position)) throw new Error('ambiguous_input')
  const byId = unambiguousRows(snapshot.assessments, 'id')
  const contextIds = [], unknownIds = []
  for (const id of unique(snapshot.selected_assessment_ids)) {
    const assessment = byId.get(id)
    if (!Array.isArray(assessment?.context_positions)) unknownIds.push(id)
    else if (assessment.context_positions.includes(position)) contextIds.push(id)
  }
  const contextSet = new Set(contextIds)
  const hypotheses = state.hypotheses.flatMap(hypothesis => {
    const indices = citationIndices(hypothesis.evidence, position)
    const ids = unique(hypothesis.assessment_ids.filter(id => contextSet.has(id)))
    return indices.length || ids.length ? [{ id: hypothesis.id, citation_indices: indices, assessment_ids: ids }] : []
  })
  const stages = state.commitments.flatMap(commitment => commitment.stages.flatMap(stage => {
    const indices = citationIndices(stage.evidence, position)
    return indices.length ? [{ commitment_id: commitment.id, id: stage.id, citation_indices: indices }] : []
  }))
  return {
    contract_version: INPUT_IMPACT_CONTRACT,
    investigation_id: bundle.investigation_id, version_id: bundle.version.id,
    observation_id: bundle.observation.id, position,
    context_assessment_ids: contextIds, unknown_context_assessment_ids: unknownIds,
    hypotheses, stages, assessment_effect: 'none', scope: 'saved_references_only', publicly_eligible: false,
  }
}
