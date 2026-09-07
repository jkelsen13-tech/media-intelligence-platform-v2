import { exactInputPosition } from './investigationEvidenceTrail.js'

const text = value => typeof value === 'string' && value.length > 0 ? value : null
const comparePositions = (a, b) => a.position.length - b.position.length || a.position.localeCompare(b.position)

// Presentation of identities and dependency membership already retained by SQL.
// Never group by URL, outlet, text similarity, publication time or current rows.
export function savedSourceHistory(bundle) {
  const snapshot = bundle?.observation?.snapshot
  const groups = new Map(), seen = new Set()
  let excludedInputs = 0
  for (const input of snapshot?.inputs ?? []) {
    const articleId = text(input.capture?.article_id)
    if (!articleId || !text(input.capture?.id) || !exactInputPosition(input.position) || seen.has(input.position)) {
      excludedInputs++
      continue
    }
    seen.add(input.position)
    if (!groups.has(articleId)) groups.set(articleId, { articleId, captures: [] })
    groups.get(articleId).captures.push(input)
  }
  const sources = [...groups.values()].map(group => ({ ...group, captures: group.captures.sort(comparePositions) }))
    .sort((a, b) => comparePositions(a.captures[0], b.captures[0]))
  return { available: !!snapshot, sources, excludedInputs }
}

export function compareRetainedCaptures(bundle, leftPosition, rightPosition) {
  if (!exactInputPosition(leftPosition) || !exactInputPosition(rightPosition) || leftPosition === rightPosition) return null
  const snapshot = bundle?.observation?.snapshot
  const left = snapshot?.inputs?.find(row => row.position === leftPosition)
  const right = snapshot?.inputs?.find(row => row.position === rightPosition)
  if (!text(left?.capture?.id) || !text(right?.capture?.id) ||
      !text(left.capture.article_id) || left.capture.article_id !== right.capture.article_id) return null
  const fields = ['title', 'summary', 'body_text', 'url', 'outlet', 'published_at'].map(field => {
    const a = left.capture.payload?.[field], b = right.capture.payload?.[field]
    const leftValue = typeof a === 'string' ? a : null, rightValue = typeof b === 'string' ? b : null
    return { field, left: leftValue, right: rightValue,
      status: leftValue === null && rightValue === null ? 'not_recorded'
        : leftValue === null ? 'right_only' : rightValue === null ? 'left_only'
          : leftValue === rightValue ? 'equal' : 'different' }
  })
  const selected = new Set(snapshot.selected_assessment_ids ?? [])
  const assessments = [], seen = new Set()
  let unrecordedContexts = 0
  for (const assessment of snapshot.assessments ?? []) {
    if (!selected.has(assessment.id) || seen.has(assessment.id)) continue
    seen.add(assessment.id)
    if (!Array.isArray(assessment.context_positions)) { unrecordedContexts++; continue }
    const usesLeft = assessment.context_positions.includes(leftPosition)
    const usesRight = assessment.context_positions.includes(rightPosition)
    if (usesLeft || usesRight) assessments.push({ assessment, usesLeft, usesRight })
  }
  return { left, right, fields, assessments,
    unrecordedContexts: unrecordedContexts + [...selected].filter(id => !seen.has(id)).length }
}
