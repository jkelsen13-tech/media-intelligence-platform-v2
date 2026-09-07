import { readPrivateInvestigationFunction } from './investigationInputImpactClient.js'

const FIELDS = ['title', 'summary', 'body_text']
const TEXT_LIMIT = 200000
export function createInvestigationSourceSpansClient(supabase) {
  return { read: (investigationId, versionId, left, right) => readPrivateInvestigationFunction(supabase, 'investigation-source-spans', {
    investigation_id: investigationId, version_id: versionId, left_position: left, right_position: right,
  }) }
}
const validSpan = (span, length) => span && Number.isInteger(span.start) && Number.isInteger(span.end)
  && span.start >= 0 && span.end >= span.start && span.end <= length

export function sourceSpansMatch(bundle, left, right, data) {
  if (!bundle || !data || left === right || data.contract_version !== 'investigation-source-spans-1'
    || data.investigation_id !== bundle.investigation_id || data.version_id !== bundle.version?.id
    || data.observation_id !== bundle.observation?.id || data.left_position !== left || data.right_position !== right
    || data.publicly_eligible !== false || data.assessment_effect !== 'none' || data.offset_unit !== 'unicode_code_point'
    || data.method !== 'enclosing_changed_interval' || data.text_limit !== TEXT_LIMIT) return false
  const inputs = bundle.observation.snapshot.inputs
  const a = inputs.find(input => input.position === left)?.capture, b = inputs.find(input => input.position === right)?.capture
  if (!a?.id || !b?.id || !a.article_id || a.article_id !== b.article_id || data.article_id !== a.article_id
    || !Array.isArray(data.fields) || data.fields.length !== FIELDS.length) return false
  return data.fields.every((row, index) => {
    if (row?.field !== FIELDS[index]) return false
    const x = a.payload?.[row.field], y = b.payload?.[row.field]
    if (row.status !== 'different' && (row.left !== undefined || row.right !== undefined)) return false
    if (typeof x !== 'string' || typeof y !== 'string') return row.status === 'text_unavailable'
    if (x === y) return row.status === 'equal'
    if (x.length > TEXT_LIMIT || y.length > TEXT_LIMIT) return row.status === 'limit_exceeded'
    const xp = Array.from(x), yp = Array.from(y)
    // Binding only: both intervals must enclose every difference, with exactly
    // matching text outside them. The browser does not run a second diff engine.
    return row.status === 'different' && validSpan(row.left, xp.length) && validSpan(row.right, yp.length)
      && row.left.start === row.right.start
      && xp.slice(0, row.left.start).join('') === yp.slice(0, row.right.start).join('')
      && xp.slice(row.left.end).join('') === yp.slice(row.right.end).join('')
      && xp.slice(row.left.start, row.left.end).join('') !== yp.slice(row.right.start, row.right.end).join('')
  })
}

export function sourceSpanSelection(bundle, position, field, span) {
  const input = bundle?.observation?.snapshot?.inputs?.find(input => input.position === position)
  const raw = input?.capture?.payload?.[field]
  if (!FIELDS.includes(field) || typeof raw !== 'string' || raw.length > TEXT_LIMIT) return null
  const points = Array.from(raw)
  if (!validSpan(span, points.length)) return null
  return { input, raw, points, reference: { position, source_field: field, span_start: span.start, span_end: span.end,
    excerpt: points.slice(span.start, span.end).join('') } }
}
