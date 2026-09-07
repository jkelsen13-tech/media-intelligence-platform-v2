import { exactInputPosition } from './investigationEvidenceTrail.js'

export const RETAINED_SEARCH_FIELDS = Object.freeze({ title: 'Title', summary: 'Summary', body_text: 'Body text', label: 'Label', outlet: 'Outlet', url: 'Source URL', source_status: 'Recorded source status' })
const text = v => typeof v === 'string' && v.length ? v : null
const fold = v => v.normalize('NFC').toLowerCase()
export function retainedInputIndex(bundle) {
  const snapshot = bundle?.observation?.snapshot
  if (bundle?.contract_version !== 'investigation-workspace-1' || bundle.publicly_eligible !== false
    || !text(bundle.investigation_id) || !text(bundle.version?.id) || !text(bundle.observation?.id) || bundle.version.investigation_id !== bundle.investigation_id
    || bundle.version.observation_id !== bundle.observation?.id || !Array.isArray(snapshot?.inputs)) return { available: false, rows: [], excluded: 0 }
  const counts = new Map()
  for (const input of snapshot.inputs) counts.set(input?.position, (counts.get(input?.position) ?? 0) + 1)
  let excluded = 0
  const rows = []
  for (const input of snapshot.inputs) {
    const capture = text(input?.capture?.id), record = text(input?.record_version?.id)
    if (!exactInputPosition(input?.position) || counts.get(input.position) !== 1 || Boolean(capture) === Boolean(record)
      || (input.capture != null && input.record_version != null)) { excluded++; continue }
    const saved = capture ? input.capture : input.record_version
    const payload = saved.payload
    const fields = Object.keys(RETAINED_SEARCH_FIELDS).filter(key => text(payload?.[key]))
    rows.push({ position: input.position, kind: capture ? 'capture' : 'record_version', id: saved.id, input,
      title: text(payload?.title) ?? text(payload?.label) ?? (capture ? 'Untitled retained capture' : 'Untitled retained record version'),
      fields, searchable: fields.map(key => [key, fold(payload[key])]) })
  }
  rows.sort((a, b) => a.position.length - b.position.length || a.position.localeCompare(b.position))
  return { available: true, rows, excluded }
}

export function searchRetainedInputs(index, query = '', kind = 'all') {
  if (typeof query !== 'string' || query.length > 200 || !['all','capture','record_version'].includes(kind)) return { valid: false, rows: [] }
  const needle = fold(query.trim())
  const rows = index.rows.filter(row => kind === 'all' || row.kind === kind).map(row => ({ ...row,
    matchedFields: needle ? row.searchable.filter(([,value]) => value.includes(needle)).map(([key]) => key) : [] }))
    .filter(row => !needle || row.matchedFields.length)
  return { valid: true, rows }
}

export function selectedRetainedInput(bundle, selection) {
  if (selection?.investigationId !== bundle?.investigation_id || selection?.versionId !== bundle?.version?.id || selection?.observationId !== bundle?.observation?.id) return null
  return retainedInputIndex(bundle).rows.find(row => row.position === selection.position) ?? null
}
