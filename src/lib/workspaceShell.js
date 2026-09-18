// Pure presentation contract shared by the production shell and isolated
// static previews. Keep this module free of backend, auth, and Supabase imports.
export const MISSING_EVIDENCE_GUIDANCE =
  'Missing evidence is not a contradiction. A geographic location or a chronological sequence does not establish causation.'

export const WORKSPACE_TAB_VIEWS = Object.freeze([
  { key: 'graph', label: 'Graph' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'arcs', label: 'Arcs' },
  { key: 'world', label: 'World View' },
  { key: 'investigations', label: 'Investigations' },
  { key: 'compare', label: 'Source Comparison' },
])

export const WORKSPACE_NAV_ITEMS = Object.freeze([
  { key: 'news', label: 'Feed' },
  { key: 'investigations', label: 'Investigations' },
  { key: 'graph', label: 'Graph' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'arcs', label: 'Arcs' },
  { key: 'world', label: 'World View' },
  { key: 'compare', label: 'Source Comparison' },
  { key: 'phase3', label: 'Methods & evidence' },
])

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
