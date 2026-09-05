// Investigation workspace presentation — DISPLAY / client only.
//
// Light canvas, separate evidence dimensions, canonical-subject header,
// and honest availability copy. This module never invents events, arcs,
// sources, weather, or an aggregated truth or bias score. Investigation Context
// identity fields are consumed, never rewritten.

import { isPostgrestPermissionDenied, isPostgrestSchemaGap } from './supabase.js'
import { buildNodeEvidenceAxes } from './nodeEvidence.js'
import { applyTheme, cacheTheme } from './themeFlag.js'

export const WORKSPACE_PRESENTATION = 'investigation_workspace_light_v1'

export const LOCATION_UNRECORDED = 'Location not recorded'
export const EVIDENCE_UNRECORDED = 'Not recorded'
export const NODE_EVIDENCE_UNRECORDED = 'Not yet recorded for this node'
export const TIME_UNRECORDED = 'Time not recorded'

export const TIMELINE_SPACING_NOTE = 'Recorded order — spacing does not represent elapsed time.'
export const MISSING_EVIDENCE_GUIDANCE =
  'Missing evidence is not a contradiction. A geographic location or a chronological sequence does not establish causation.'

export const CALM_RELATIONSHIP_UNAVAILABLE =
  'Relationship evidence is unavailable. The recorded event is shown.'
export const CALM_TIMELINE_CONTEXT_UNAVAILABLE =
  'Some timeline context is unavailable. Recorded events remain visible.'
export const CALM_SOURCES_UNAVAILABLE = 'Node-level source records are unavailable.'
export const TECHNICAL_DETAILS_LABEL = 'Technical details'
export const AVAILABILITY_DETAILS_LABEL = 'Availability details'

export const WORKSPACE_TAB_VIEWS = Object.freeze([
  { key: 'graph', label: 'Graph' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'arcs', label: 'Arcs' },
  { key: 'world', label: 'World View' },
  { key: 'compare', label: 'Source Comparison' },
])

export const WORKSPACE_NAV_ITEMS = Object.freeze([
  { key: 'news', label: 'Feed' },
  { key: 'graph', label: 'Graph' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'arcs', label: 'Arcs' },
  { key: 'world', label: 'World View' },
  { key: 'compare', label: 'Source Comparison' },
  { key: 'phase3', label: 'Methods & evidence' },
])

const EMPTY_DIMENSIONS = Object.freeze([
  { key: 'evidence_strength', label: 'Evidence strength' },
  { key: 'source_reliability', label: 'Source reliability' },
  { key: 'authentication', label: 'Authentication' },
  { key: 'review_status', label: 'Review status' },
  { key: 'remaining_uncertainty', label: 'Remaining uncertainty' },
])

export function applyWorkspaceLightPresentation(root, storage) {
  applyTheme('light', root)
  cacheTheme('light', storage)
  return 'light'
}

export function formatWorkspaceDate(iso) {
  if (iso == null || String(iso).trim() === '') return TIME_UNRECORDED
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return TIME_UNRECORDED
  const d = new Date(ms)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · UTC`
}

export function recordedLocationLabel(node, extras = {}) {
  const place = extras.place ?? node?.place ?? node?.location_label ?? node?.location
  if (typeof place === 'string' && place.trim()) return place.trim()
  return LOCATION_UNRECORDED
}

export function workspaceEvidenceDimensions(node, { forNode = false } = {}) {
  const empty = forNode ? NODE_EVIDENCE_UNRECORDED : EVIDENCE_UNRECORDED
  if (!node) {
    return EMPTY_DIMENSIONS.map((dim) => ({
      ...dim,
      value: empty,
      tone: 'unavailable',
    }))
  }
  return buildNodeEvidenceAxes(node).map((axis) => {
    const recorded = axis.tone === 'value'
    return {
      ...axis,
      value: recorded ? axis.value : empty,
    }
  })
}

/**
 * Canonical investigation header. `selectedChild` is accepted so callers can
 * pass the graph selection, but it must never replace the subject title,
 * location, date, or description.
 */
export function canonicalWorkspaceHeader({
  investigationContext,
  canonicalNode = null,
  selectedChild = null,
} = {}) {
  void selectedChild
  const ic = investigationContext ?? {}
  const hasSubject = Boolean(ic.canonical_subject_id)
  const title = hasSubject
    ? (canonicalNode?.label ?? 'Recorded investigation')
    : 'No canonical subject'
  const description = hasSubject
    ? (canonicalNode?.summary ?? canonicalNode?.description ?? null)
    : 'Absence is explicit — no event is invented.'
  const occurred = canonicalNode?.occurred_at ?? ic.as_of_time
  return Object.freeze({
    eyebrow: 'Investigation workspace',
    title,
    location: hasSubject ? recordedLocationLabel(canonicalNode) : LOCATION_UNRECORDED,
    when: hasSubject ? formatWorkspaceDate(occurred) : TIME_UNRECORDED,
    description,
    subjectType: ic.canonical_subject_type ?? null,
    subjectId: ic.canonical_subject_id ?? null,
    dimensions: workspaceEvidenceDimensions(hasSubject ? canonicalNode : null),
    selectedChildReplacedHeader: false,
  })
}

export function shouldRestoreGraphInspector({
  dismissed = false,
  dismissedSubjectId = null,
  canonicalSubjectId = null,
} = {}) {
  if (!dismissed) return true
  if (canonicalSubjectId != null && String(dismissedSubjectId ?? '') !== String(canonicalSubjectId)) {
    return true
  }
  return false
}

export function graphInspectorDismissalAfter({
  action,
  dismissedSubjectId = null,
  canonicalSubjectId = null,
} = {}) {
  if (action === 'explicit_select') {
    return { dismissed: false, dismissedSubjectId: null }
  }
  if (action === 'dismiss') {
    return { dismissed: true, dismissedSubjectId: canonicalSubjectId ?? null }
  }
  if (action === 'subject_change') {
    if (String(dismissedSubjectId ?? '') !== String(canonicalSubjectId ?? '')) {
      return { dismissed: false, dismissedSubjectId: null }
    }
    return { dismissed: true, dismissedSubjectId }
  }
  return { dismissed: false, dismissedSubjectId: null }
}

/** Optional denied/missing arc metadata must not block a valid global timeline. */
export function isOptionalDeniedArcMetadata(error) {
  return isPostgrestSchemaGap(error) || isPostgrestPermissionDenied(error)
}

export function timelinePresentationMode(mode) {
  return mode === 'list' ? 'list' : 'chronology'
}

export const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function focusableWorkspaceControls(dialogEl) {
  if (!dialogEl?.querySelectorAll) return []
  return [...dialogEl.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.disabled !== true)
}

export function handleWorkspaceDrawerKeyDown(event, { dialogEl, onDismiss } = {}) {
  if (!event) return false
  if (event.key === 'Escape') {
    onDismiss?.()
    return true
  }
  if (event.key !== 'Tab' || !dialogEl) return false
  const nodes = focusableWorkspaceControls(dialogEl)
  if (nodes.length === 0) return false
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = dialogEl.ownerDocument?.activeElement
  if (event.shiftKey && active === first) {
    event.preventDefault?.()
    last.focus?.()
    return true
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault?.()
    first.focus?.()
    return true
  }
  return false
}

export function restoreWorkspaceDrawerFocus(triggerEl) {
  triggerEl?.focus?.()
  return triggerEl ?? null
}

export function workspaceAvailabilityCopy(kind) {
  if (kind === 'arcs') {
    return {
      kicker: 'Evidence availability',
      title: 'No story arc is available yet',
      body: 'This view populates when released arc records are available. The selected investigation is preserved. No arc is invented.',
    }
  }
  if (kind === 'compare') {
    return {
      kicker: 'Evidence availability',
      title: 'No validated source comparison yet',
      body: 'Candidate event clusters are withheld until article membership passes same-event review. Until then, outlet counts, claim comparisons, and source-independence metrics remain unavailable.',
    }
  }
  return {
    kicker: 'Evidence availability',
    title: 'Recorded evidence is unavailable',
    body: 'Absence is explicit. No record is invented.',
  }
}
