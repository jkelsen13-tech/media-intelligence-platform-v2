// Read only the supplied saved observation. Context membership is not an
// evidence relation, a source-origin judgment, or a counterfactual reassessment.
const unique = values => [...new Set(Array.isArray(values) ? values.filter(v => typeof v === 'string') : [])]
export const exactInputPosition = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null

export function savedAssessmentTrail(bundle, assessmentId) {
  const snapshot = bundle?.observation?.snapshot
  const assessments = new Map(snapshot?.assessments?.map(row => [row.id, row]) ?? [])
  const assessment = assessments.get(assessmentId)
  if (!assessment) return null
  const inputs = new Map(snapshot.inputs?.map(row => [row.position, row]) ?? [])
  const parents = unique(assessment.parent_ids)
  const ancestors = unique(assessment.ancestor_ids).filter(id => !parents.includes(id))
  const link = (id, kind) => ({ id, kind, assessment: id === assessmentId ? null : assessments.get(id) ?? null })
  return {
    assessment,
    contextRecorded: Array.isArray(assessment.context_positions),
    inputs: unique(assessment.context_positions).map(position => ({
      position,
      input: exactInputPosition(position) ? inputs.get(position) ?? null : null,
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

// Display recorded precision directly. Date.parse would invent midnight/timezone
// details and normalize some impossible calendar dates.
export function retainedDateDisplay(value) {
  if (typeof value !== 'string' || !value) return { label: 'Not recorded', dateTime: null }
  const invalid = { label: 'Unrecognized retained date', dateTime: null }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/.exec(value)
  if (!match) return invalid
  const [, year, month, day, hour, minute, second, fraction = '', zone] = match
  const y = Number(year), m = Number(month), d = Number(day)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return invalid
  const date = year + '-' + month + '-' + day
  if (hour === undefined) return { label: date + ' (date only)', dateTime: date }
  if (Number(hour) > 23 || Number(minute) > 59 || (second !== undefined && Number(second) > 59)) return invalid
  const clock = hour + ':' + minute + (second === undefined ? '' : ':' + second + fraction)
  if (!zone) return { label: date + ' ' + clock + ' (time zone not recorded)', dateTime: null }
  let offset = zone
  if (zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '')
    const hours = digits.slice(0, 2), minutes = digits.slice(2) || '00'
    if (Number(hours) > 23 || Number(minutes) > 59) return invalid
    offset = zone[0] + hours + ':' + minutes
  }
  // Retain the explicitly unknown local offset while preserving the known UTC time.
  if (offset === '-00:00') return {
    label: date + ' ' + clock + ' UTC (local offset unknown)', dateTime: date + 'T' + clock + 'Z',
  }
  return {
    label: date + ' ' + clock + (zone === 'Z' || offset === '+00:00' ? ' UTC' : ' UTC' + offset),
    dateTime: date + 'T' + clock + offset,
  }
}

export function retainedDateLabel(value) {
  return retainedDateDisplay(value).label
}
