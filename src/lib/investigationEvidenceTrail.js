// Read only the supplied saved observation. Context membership is not an
// evidence relation, a source-origin judgment, or a counterfactual reassessment.
const unique = values => [...new Set(Array.isArray(values) ? values.filter(v => typeof v === 'string') : [])]
export const exactInputPosition = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null

export function savedAssessmentTrail(bundle, assessmentId) {
  const snapshot = bundle?.observation?.snapshot
  const assessment = snapshot?.assessments?.find(row => row.id === assessmentId)
  if (!assessment) return null
  const parents = unique(assessment.parent_ids)
  const ancestors = unique(assessment.ancestor_ids).filter(id => !parents.includes(id))
  const link = (id, kind) => ({ id, kind, assessment: id === assessmentId ? null : snapshot.assessments.find(row => row.id === id) ?? null })
  return {
    assessment,
    contextRecorded: Array.isArray(assessment.context_positions),
    inputs: unique(assessment.context_positions).map(position => ({
      position,
      input: exactInputPosition(position) ? snapshot.inputs?.find(row => row.position === position) ?? null : null,
      explicitlyAdded: assessment.extra_positions?.includes(position) === true,
    })),
    dependenciesRecorded: Array.isArray(assessment.parent_ids) && Array.isArray(assessment.ancestor_ids),
    dependencies: [...parents.map(id => link(id, 'Direct dependency')), ...ancestors.map(id => link(id, 'Earlier dependency'))],
    revisions: [
      ...(assessment.predecessor_id ? [link(assessment.predecessor_id, 'Previous revision')] : []),
      ...unique(assessment.superseded_by).map(id => link(id, 'Recorded replacement')),
    ],
  }
}

export function selectedContextUsers(bundle, position) {
  if (!exactInputPosition(position)) return []
  const snapshot = bundle?.observation?.snapshot
  const ids = unique(snapshot?.selected_assessment_ids)
  return ids.map(id => snapshot?.assessments?.find(row => row.id === id))
    .filter(row => row?.context_positions?.includes(position))
}

export function retainedInputDates(input) {
  if (!input) return []
  return [
    ...(input.capture ? [
      { label: 'Source publication', value: input.capture.payload?.published_at },
      { label: 'Capture saved', value: input.capture.captured_at },
    ] : []),
    ...(input.record_version ? [{ label: 'Record version saved', value: input.record_version.recorded_at }] : []),
    { label: 'Change queued', value: input.queued_at },
  ]
}

export function retainedDateLabel(value) {
  if (typeof value !== 'string' || !value) return 'Not recorded'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().replace('T', ' ').replace('Z', ' UTC') : 'Unrecognized retained date'
}
