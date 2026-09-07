import { validPosition } from '../investigation-input-impact/impact.mjs'

export const SOURCE_SPAN_CONTRACT = 'investigation-source-spans-1'
export const SPAN_TEXT_LIMIT = 200000 // UTF-16 units, checked before allocating code points.
const FIELDS = ['title', 'summary', 'body_text']

// One encompassing changed interval, not a minimal edit script. Internal equal
// words may remain inside it. No normalization or semantic label is applied.
export function changedTextInterval(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return { status: 'text_unavailable' }
  if (left === right) return { status: 'equal' }
  if (left.length > SPAN_TEXT_LIMIT || right.length > SPAN_TEXT_LIMIT) return { status: 'limit_exceeded' }
  const a = Array.from(left), b = Array.from(right)
  let start = 0, suffix = 0
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++
  while (suffix < Math.min(a.length, b.length) - start && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++
  return { status: 'different', left: { start, end: a.length - suffix }, right: { start, end: b.length - suffix } }
}

export function retainedSourceSpans(bundle, leftPosition, rightPosition) {
  if (bundle?.contract_version !== 'investigation-workspace-1' || bundle.publicly_eligible !== false) throw new Error('invalid_workspace')
  if (!validPosition(leftPosition) || !validPosition(rightPosition) || leftPosition === rightPosition) throw new Error('input_unavailable')
  const inputs = bundle.observation.snapshot.inputs
  const left = inputs.find(input => input.position === leftPosition)?.capture
  const right = inputs.find(input => input.position === rightPosition)?.capture
  if (!left?.id || !right?.id || typeof left.article_id !== 'string' || !left.article_id || left.article_id !== right.article_id) throw new Error('input_unavailable')
  return { contract_version: SOURCE_SPAN_CONTRACT, investigation_id: bundle.investigation_id,
    version_id: bundle.version.id, observation_id: bundle.observation.id,
    left_position: leftPosition, right_position: rightPosition, article_id: left.article_id,
    method: 'enclosing_changed_interval', offset_unit: 'unicode_code_point', text_limit: SPAN_TEXT_LIMIT,
    fields: FIELDS.map(field => ({ field, ...changedTextInterval(left.payload?.[field], right.payload?.[field]) })),
    assessment_effect: 'none', publicly_eligible: false }
}
