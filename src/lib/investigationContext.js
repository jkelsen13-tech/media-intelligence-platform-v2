// R4.75 Step 1 — Investigation Context (DISPLAY / client state only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §3 and §16 Step 1. One shared subject survives ordinary view changes.
// This module never writes V2, never invents events, and never recomputes
// Temporal Intelligence. `temporal_assessment_reference` is the existing
// DISPLAY object key from temporalAssessment.js.

import { temporalAssessmentConfigKey } from './temporalAssessment.js'

export const INVESTIGATION_CONTEXT_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

// Minimum fields from §3 / CoS Step 1. Absence stays explicit (null).
export const INVESTIGATION_CONTEXT_FIELDS = Object.freeze([
  'canonical_subject_type',
  'canonical_subject_id',
  'parent_event_id',
  'as_of_time',
  'selected_time_range',
  'active_view',
  'temporal_assessment_reference',
])

export const EMPTY_INVESTIGATION_CONTEXT = Object.freeze({
  canonical_subject_type: null,
  canonical_subject_id: null,
  parent_event_id: null,
  as_of_time: null,
  selected_time_range: null,
  active_view: 'news',
  temporal_assessment_reference: null,
})

export function emptyInvestigationContext(activeView = 'news') {
  return {
    ...EMPTY_INVESTIGATION_CONTEXT,
    active_view: activeView ?? 'news',
  }
}

/** Existing Temporal Intelligence DISPLAY key. Do not recompute the assessment. */
export function temporalAssessmentReferenceFor(canonicalSubjectId) {
  return temporalAssessmentConfigKey(canonicalSubjectId)
}

/**
 * Ordinary nav / tab switch. Updates `active_view` only.
 * MUST NOT clear or replace the canonical subject.
 */
export function setInvestigationActiveView(ic, view) {
  const base = ic ?? emptyInvestigationContext(view)
  if (base.active_view === view) return base
  return { ...base, active_view: view ?? base.active_view }
}

/**
 * Recorded-time scrub on the current subject. Does not change identity.
 */
export function setInvestigationAsOfTime(ic, asOfTime) {
  const base = ic ?? emptyInvestigationContext()
  if (!base.canonical_subject_id) return base
  if (base.as_of_time === asOfTime) return base
  return { ...base, as_of_time: asOfTime ?? null }
}

function recordedTimeRange(from, to) {
  if (from == null && to == null) return null
  return { from: from ?? null, to: to ?? null }
}

/**
 * Explicit new-subject select. Replaces identity fields. Does not invent
 * ids, types, parents, or time bounds that the caller did not supply.
 * Explore / News result select goes through commitNewSubject (Step 5),
 * which calls this once.
 */
export function applySubject(ic, subject = {}) {
  const base = ic ?? emptyInvestigationContext()
  const id = subject.canonical_subject_id ?? null
  return {
    ...base,
    canonical_subject_type: subject.canonical_subject_type ?? null,
    canonical_subject_id: id,
    parent_event_id: subject.parent_event_id ?? null,
    as_of_time: Object.hasOwn(subject, 'as_of_time') ? subject.as_of_time ?? null : null,
    selected_time_range: Object.hasOwn(subject, 'selected_time_range')
      ? subject.selected_time_range ?? null
      : null,
    temporal_assessment_reference:
      subject.temporal_assessment_reference ?? temporalAssessmentReferenceFor(id),
  }
}

/**
 * Seed from World View / spatial projection.
 * Canonical id is the graph subject (`subject_graph_node_id`), not the
 * spatial `mip_object_id`. Cleveland live row → acc55cb2-… . Empty input
 * stays empty — this never invents that event.
 */
export function subjectFromWorldViewSelection({ node = null, row = null } = {}) {
  const id =
    row?.subject_graph_node_id ??
    node?.subject_graph_node_id ??
    (node && !node.fromSpatialProjection ? node.id ?? node.slug : null) ??
    null
  const type =
    node && !node.fromSpatialProjection && node.type
      ? node.type
      : row?.spatial_role ?? node?.type ?? null
  return {
    canonical_subject_type: type ?? null,
    canonical_subject_id: id,
    parent_event_id: row?.parent_event_id ?? node?.parent_event_id ?? null,
    as_of_time: row?.valid_from_utc ?? null,
    selected_time_range: recordedTimeRange(row?.valid_from_utc, row?.valid_to_utc),
    temporal_assessment_reference: temporalAssessmentReferenceFor(id),
  }
}

export function subjectFromGraphNode(node) {
  if (!node) {
    return {
      canonical_subject_type: null,
      canonical_subject_id: null,
      parent_event_id: null,
      as_of_time: null,
      selected_time_range: null,
      temporal_assessment_reference: null,
    }
  }
  if (node.fromSpatialProjection) return subjectFromWorldViewSelection({ node })
  const id = node.subject_graph_node_id ?? node.id ?? node.slug ?? null
  return {
    canonical_subject_type: node.type ?? null,
    canonical_subject_id: id,
    parent_event_id: node.parent_event_id ?? null,
    as_of_time: node.occurred_at ?? null,
    selected_time_range: recordedTimeRange(node.occurred_at, null),
    temporal_assessment_reference: temporalAssessmentReferenceFor(id),
  }
}

export function subjectFromNamedTarget({ type, id, parentEventId = null } = {}) {
  const canonicalId = id ?? null
  return {
    canonical_subject_type: type ?? null,
    canonical_subject_id: canonicalId,
    parent_event_id: parentEventId ?? null,
    as_of_time: null,
    selected_time_range: null,
    temporal_assessment_reference: temporalAssessmentReferenceFor(canonicalId),
  }
}

/** Tab-cycle helper for tests: subject identity must be unchanged. */
export function preserveSubjectAcrossViews(ic, views) {
  return (views ?? []).reduce((acc, view) => setInvestigationActiveView(acc, view), ic)
}

export function investigationContextDomProps(ic) {
  const range = ic?.selected_time_range
  return {
    'data-investigation-context': 'true',
    'data-canonical-subject-type': ic?.canonical_subject_type ?? '',
    'data-canonical-subject-id': ic?.canonical_subject_id ?? '',
    'data-parent-event-id': ic?.parent_event_id ?? '',
    'data-as-of-time': ic?.as_of_time ?? '',
    'data-selected-time-range': range ? `${range.from ?? ''}..${range.to ?? ''}` : '',
    'data-active-view': ic?.active_view ?? '',
    'data-temporal-assessment-reference': ic?.temporal_assessment_reference ?? '',
  }
}

/** Restore Graph `selected` from IC only when a live node already exists. */
export function graphNodeMatchingInvestigation(nodes, ic) {
  const id = ic?.canonical_subject_id
  if (!id || !nodes?.length) return null
  const type = ic.canonical_subject_type
  if (type === 'arc' || type === 'article' || type === 'topic' || type === 'location') return null
  return nodes.find((n) => String(n.id ?? n.slug) === String(id)) ?? null
}

/** World View matching fallback when `selected` is empty but IC is not. */
export function selectionStubFromInvestigation(ic) {
  const id = ic?.canonical_subject_id
  if (!id) return null
  return {
    id,
    subject_graph_node_id: id,
    type: ic.canonical_subject_type,
    fromInvestigationContext: true,
  }
}

/**
 * Initial World View auto-select is only for an empty investigation.
 * An established subject — including an article with no released geography —
 * must not be replaced by the unique live Cleveland row.
 */
export function shouldAutoSelectWorldView({ selected = null, investigationContext = null } = {}) {
  if (selected) return false
  if (investigationContext?.canonical_subject_id) return false
  return true
}

/**
 * Bind World View to the current investigation. A leftover graph/spatial
 * pick from a prior subject does not override an established IC id.
 */
export function worldViewSelectionForMatch(selected, investigationContext) {
  const stub = selectionStubFromInvestigation(investigationContext)
  if (!stub) return selected ?? null
  if (!selected) return stub
  const selectedKeys = new Set(
    [selected.id, selected.slug, selected.mip_object_id, selected.subject_graph_node_id]
      .filter(Boolean)
      .map(String),
  )
  if (selectedKeys.has(String(stub.id)) || selectedKeys.has(String(stub.subject_graph_node_id))) {
    return selected
  }
  return stub
}

/** Automatic projection commit may proceed only when IC is empty or already this object. */
export function mayCommitWorldViewProjection({ investigationContext = null, row = null, node = null } = {}) {
  const id = investigationContext?.canonical_subject_id
  if (!id) return true
  const keys = new Set(
    [row?.subject_graph_node_id, row?.mip_object_id, node?.subject_graph_node_id, node?.id, node?.slug]
      .filter(Boolean)
      .map(String),
  )
  return keys.has(String(id))
}

export function releasedGeographyUnavailableCopy() {
  return 'Released geography is unavailable for this investigation. The selected subject is preserved. No location is invented.'
}
