// Read only retained private owners. No inferred collection measurement or live lookup.
import { retainedInputIndex } from './investigationRetainedInputs.js'
import { exactInputPosition } from './investigationEvidenceTrail.js'
import { investigationEvidenceCheckPanels } from './investigationEvidenceChecksClient.js'
import { investigationEvidenceReviewPanels } from './investigationEvidenceReviewsClient.js'

const text = value => typeof value === 'string' && value.trim().length > 0
export function savedRelevanceDeclarations(bundle) {
  const index = retainedInputIndex(bundle)
  const snapshot = bundle?.observation?.snapshot
  if (!index.available || !Array.isArray(snapshot?.relevance_declarations)) return { available: false, rows: [], excluded: 0 }
  const scopeKnown = Array.isArray(snapshot.scope_candidate_ids)
  const scope = new Set(scopeKnown ? snapshot.scope_candidate_ids : [])
  const candidates = new Map()
  for (const candidate of Array.isArray(snapshot.candidates) ? snapshot.candidates : []) {
    if (text(candidate?.id)) candidates.set(candidate.id, (candidates.get(candidate.id) ?? 0) + 1)
  }
  const counts = new Map()
  for (const row of snapshot.relevance_declarations) {
    const key = `${row?.candidate_id}:${row?.change_position}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const rows = []; let excluded = 0
  for (const row of snapshot.relevance_declarations) {
    if (candidates.get(row?.candidate_id) !== 1 || !exactInputPosition(row?.change_position)
      || counts.get(`${row.candidate_id}:${row.change_position}`) !== 1
      || !['selection_method','selection_ref','rationale','declared_at'].every(key => text(row[key]))) { excluded++; continue }
    rows.push({ ...row, scopeRole: !scopeKnown ? 'Selected scope membership not recorded' : scope.has(row.candidate_id) ? 'Selected candidate' : 'Retained assessment dependency candidate; outside selected scope', input: index.rows.find(input => input.position === row.change_position) ?? null })
  }
  return { available: true, rows, excluded }
}

export function collectionDiagnostics(bundle, checks = null, reviews = null) {
  const index = retainedInputIndex(bundle)
  if (!index.available) return [{ kind: 'unavailable', scope: 'Saved observation input inventory', owner: 'Saved observation', reference: bundle?.observation?.id ?? 'not recorded', basis: 'Input records cannot be resolved here. This is not a count of zero or source unavailability.' }]
  const rows = []
  const add = (kind, scope, owner, reference, basis) => rows.push({ kind, scope, owner, reference, basis })
  for (const row of index.rows) {
    const saved = row.input.capture ?? row.input.record_version
    if (row.kind !== 'capture' && saved.record_kind !== 'article') continue
    if (!text(saved.payload?.body_text)) add('not_retained', `Body text field at position ${row.position}`, 'Saved observation input', `${bundle.observation.id} / ${row.kind} ${row.id}`, 'No nonblank body_text field in this retained record. This does not establish missing publisher text, failed extraction or unavailable source bytes.')
  }
  for (const declaration of Array.isArray(bundle.version.state?.coverage) ? bundle.version.state.coverage : []) {
    if (declaration.search_status === 'not_run') add('not_searched', declaration.label, 'Analyst collection declaration', `${bundle.version.id} / coverage ${declaration.id}`, `Declared not_run. Method: ${declaration.method}. This is a scoped analyst declaration, not a measured retrieval receipt.`)
  }
  const panels = investigationEvidenceCheckPanels(bundle, checks)
  if (panels?.status === 'not_run') add('not_searched', 'Retained evidence checks for this saved version', 'Private evidence-check response', `${bundle.version.id} / ${bundle.observation.id}`, 'Checks status is not_run; no saved check report exists for this version. This says nothing about external searches.')
  if (panels?.coverage?.external_retrieval === 'not_run') add('not_searched', 'External retrieval in the retained evidence-check report', 'Saved evidence-check report', panels.reportId, 'The retained report records external_retrieval: not_run. Its bounded input scan is separate from external retrieval and analyst collection declarations.')
  const reviewPanels = investigationEvidenceReviewPanels(bundle, checks, reviews)
  for (const target of reviewPanels?.targets ?? []) {
    if (target.decision !== 'not_relevant' || !target.latest_event) continue
    const event = target.latest_event
    add('rejected', `${target.target_kind} ${target.target_id}`, 'Saved assigned-reviewer decision', `${reviewPanels.reportId} / event ${event.id} / revision ${event.revision}`, `Dismissed for this investigation. Rationale preview: ${event.rationale_preview ?? 'not recorded'}. This is a target relevance decision, not a factual verdict or evidence of real-world absence.`)
  }
  add('unknown', 'Reporting, extraction and rights/privacy disposition', 'No typed disposition receipt in these retained owners', bundle.observation.id, 'Not reported, not extracted and rights/privacy blocked are not established. Missing records do not supply those decisions. Collection coverage and real-world absence remain unknown.')
  return rows
}
