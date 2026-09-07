import { definitionChangeSummary } from './investigationWorkspaceSession.js'

const FIELDS = {
  hypotheses: ['statement', 'assumptions', 'would_strengthen', 'would_weaken', 'assessment_ids', 'evidence', 'remaining_uncertainty'],
  commitments: ['actor', 'statement', 'scope', 'conditions', 'deadline_text', 'success_criterion', 'remaining_uncertainty'],
  coverage: ['label', 'status', 'source_classes', 'languages', 'regions', 'from', 'to', 'retained_text', 'search_status', 'searched_at', 'method', 'limitations'],
  stages: ['kind', 'status', 'depends_on', 'coverage_ids', 'note', 'evidence'],
  question: ['question'], scope: ['scope_note', 'canonical_subject', 'time_range'], unresolved_questions: ['unresolved_questions'],
}

// JSONB object-key order is immaterial; array order and missing/null values are
// preserved. This formats server-declared edits, not an assessment of meaning.
export function sameDefinitionValue(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => sameDefinitionValue(v, b[i]))
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameDefinitionValue(a[k], b[k]))
}
const changedFields = (group, before, after) => FIELDS[group].filter(key => !sameDefinitionValue(before?.[key], after?.[key]))
  .map(key => ({ key, before: before?.[key], after: after?.[key] }))
const name = row => row?.statement ?? row?.label ?? row?.kind ?? 'Saved record'
const record = (state, group, id) => id == null ? state : state[group]?.find(row => row.id === id)

export function definitionRevisionBinding(after, before) {
  const comparison = after?.comparison
  if (!['comparable', 'scope_changed'].includes(comparison?.mode)) return 'not_comparable'
  if (!before) return 'not_loaded'
  if ([after, before].some(b => b?.contract_version !== 'investigation-workspace-1' || b.publicly_eligible !== false
    || b.version?.investigation_id !== b.investigation_id || b.version?.observation_id !== b.observation?.id)
    || after.investigation_id !== before.investigation_id
    || comparison.after_version_id !== after.version.id || comparison.after_observation_id !== after.observation.id
    || comparison.before_version_id !== before.version.id || comparison.before_observation_id !== before.observation.id
    || after.review?.version_id !== before.version.id
    || !Number.isInteger(before.version.revision) || !Number.isInteger(after.version.revision)
    || before.version.revision > after.version.revision) return 'identity_mismatch'
  return 'ready'
}

export function savedDefinitionRevisions(afterBundle, beforeBundle) {
  const status = definitionRevisionBinding(afterBundle, beforeBundle)
  if (status !== 'ready') return { status, rows: [] }
  const beforeState = beforeBundle.version.state, afterState = afterBundle.version.state
  const declared = definitionChangeSummary(afterBundle.comparison.definition_changes)
  const rows = declared.map(change => {
    const before = record(beforeState, change.group, change.id), after = record(afterState, change.group, change.id)
    if ((change.action === 'added' && (before || !after)) || (change.action === 'removed' && (!before || after))
      || (change.action === 'updated' && (!before || !after))) return { ...change, status: 'record_unavailable' }
    const fields = changedFields(change.group, before, after)
    const stages = []
    if (change.group === 'commitments') {
      const ids = [...new Set([...(before?.stages ?? []).map(s => s.id), ...(after?.stages ?? []).map(s => s.id)])]
      for (const id of ids) {
        const b = before?.stages.find(s => s.id === id), a = after?.stages.find(s => s.id === id)
        const stageFields = changedFields('stages', b, a)
        if (stageFields.length) stages.push({ id, before: b, after: a, fields: stageFields, action: !b ? 'added' : !a ? 'removed' : 'updated' })
      }
      const bOrder = before?.stages.map(s => s.id), aOrder = after?.stages.map(s => s.id)
      if (!sameDefinitionValue(bOrder, aOrder)) fields.push({ key: 'stage_order', before: bOrder, after: aOrder })
    }
    return { ...change, before, after, fields, stages, title: change.id ? name(after ?? before) : change.group,
      status: fields.length || stages.length ? 'changed' : 'no_field_difference' }
  })
  return { status: 'ready', rows, before: beforeBundle, after: afterBundle, scopeChanged: afterBundle.comparison.mode === 'scope_changed' }
}
