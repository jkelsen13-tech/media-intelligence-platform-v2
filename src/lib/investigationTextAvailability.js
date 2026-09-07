import { retainedInputIndex } from './investigationRetainedInputs.js'

export const TEXT_AVAILABILITY = Object.freeze({
  body: 'Body text retained',
  summary: 'Summary retained; no body text',
  title: 'Title or label only',
  missing: 'No title, label, summary or body text',
})

const hasText = value => typeof value === 'string' && value.trim().length > 0

// Describe stored fields only. A body field does not prove full publisher text,
// and a missing field says nothing about the underlying source's existence.
export function retainedTextAvailability(bundle) {
  const index = retainedInputIndex(bundle)
  const groups = Object.keys(TEXT_AVAILABILITY).map(kind => ({ kind, label: TEXT_AVAILABILITY[kind], rows: [] }))
  for (const row of index.rows) {
    const payload = (row.input.capture ?? row.input.record_version).payload
    const kind = hasText(payload?.body_text) ? 'body'
      : hasText(payload?.summary) ? 'summary'
        : hasText(payload?.title) || hasText(payload?.label) ? 'title' : 'missing'
    groups.find(group => group.kind === kind).rows.push({ ...row,
      displayTitle: hasText(payload?.title) ? payload.title : hasText(payload?.label) ? payload.label : 'No title or label retained' })
  }
  return { available: index.available, total: index.rows.length, excluded: index.excluded, groups }
}
