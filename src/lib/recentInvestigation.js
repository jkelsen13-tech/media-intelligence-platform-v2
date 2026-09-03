// R4.75 Step 6 — Bounded recent-investigation stack (DISPLAY / client only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §11.1 launch minimum / §16 Step 6.
//
// Remember per item: canonical subject, last active view, selected time
// range, selected sub-object where still valid. Persist session/local for
// unauthenticated visitors only. No account-store sync, no cross-device
// restore, no full multi-investigation workspace.
//
// Identity is the stored id. Display title is never stored as identity and
// is never read back as identity. Restore goes through commitNewSubject.

import { commitNewSubject } from './newSubjectPropagation.js'
import { emptyInvestigationContext } from './investigationContext.js'
import {
  applySelectionAgainstCatalog,
  emptyDeepLinkSelection,
  formatTimeQuery,
} from './deepLinks.js'

export const RECENT_INVESTIGATION_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

export const RECENT_INVESTIGATION_STORAGE_KEY = 'mip.recentInvestigations.v1'
export const RECENT_INVESTIGATION_MAX = 8

const SUB_OBJECT_KINDS = Object.freeze(['claim', 'entity', 'source', 'place'])

export function snapshotRecentInvestigation(ic, subObject = null) {
  if (!ic?.canonical_subject_id) return null
  const kind = subObject?.kind
  const subId = subObject?.id
  return {
    canonical_subject_id: ic.canonical_subject_id,
    canonical_subject_type: ic.canonical_subject_type ?? null,
    parent_event_id: ic.parent_event_id ?? null,
    active_view: ic.active_view ?? 'news',
    as_of_time: ic.as_of_time ?? null,
    selected_time_range: ic.selected_time_range ?? null,
    subObject:
      kind && SUB_OBJECT_KINDS.includes(kind) && subId != null && String(subId).trim() !== ''
        ? { kind, id: String(subId) }
        : null,
  }
}

export function boundRecentInvestigationStack(stack, max = RECENT_INVESTIGATION_MAX) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : RECENT_INVESTIGATION_MAX
  return (stack ?? []).filter((item) => item?.canonical_subject_id).slice(0, limit)
}

/**
 * Most-recent-first. Same canonical id is moved to the front (updated),
 * never duplicated. Empty / title-only snapshots are ignored.
 */
export function pushRecentInvestigation(stack, snapshot, max = RECENT_INVESTIGATION_MAX) {
  if (!snapshot?.canonical_subject_id) return boundRecentInvestigationStack(stack, max)
  const id = String(snapshot.canonical_subject_id)
  const without = (stack ?? []).filter((item) => String(item.canonical_subject_id) !== id)
  return boundRecentInvestigationStack([snapshot, ...without], max)
}

export function restoreRecentInvestigation(item, { currentIc, catalog } = {}) {
  const landingView = item?.active_view ?? 'news'
  const base = currentIc ?? emptyInvestigationContext(landingView)
  if (!item?.canonical_subject_id) {
    return {
      investigationContext: base,
      committed: false,
      selection: emptyDeepLinkSelection(),
      fallbacks: [],
      invented: false,
    }
  }
  const payload = {
    canonical_subject_type: item.canonical_subject_type ?? null,
    canonical_subject_id: item.canonical_subject_id,
    parent_event_id: item.parent_event_id ?? null,
    as_of_time: item.as_of_time ?? null,
    selected_time_range: item.selected_time_range ?? null,
  }
  const result = commitNewSubject(base, payload, { landingView })
  const incoming = emptyDeepLinkSelection()
  incoming.time = formatTimeQuery(item.as_of_time, item.selected_time_range)
  if (item.subObject?.kind && item.subObject?.id) {
    incoming[item.subObject.kind] = item.subObject.id
  }
  const applied = applySelectionAgainstCatalog(incoming, catalog, item.canonical_subject_id)
  return {
    investigationContext: result.investigationContext,
    committed: result.committed,
    selection: applied.selection,
    fallbacks: applied.fallbacks,
    invented: false,
    pendingSelection: applied.pending === true,
  }
}

/**
 * Step 5 commit + §11.1 remember. Pushes the prior IC only when a new
 * canonical id actually replaces a previous one.
 */
export function commitNewSubjectRememberingRecent(ic, payload, options = {}, recentStack = [], subObject = null) {
  const result = commitNewSubject(ic, payload, options)
  let nextStack = recentStack ?? []
  if (
    result.committed &&
    ic?.canonical_subject_id &&
    String(ic.canonical_subject_id) !== String(result.investigationContext.canonical_subject_id)
  ) {
    const snap = snapshotRecentInvestigation(ic, subObject)
    nextStack = pushRecentInvestigation(nextStack, snap)
  }
  return { ...result, recentInvestigations: nextStack }
}

function sanitizeStoredItem(item) {
  if (!item || typeof item !== 'object') return null
  const id = item.canonical_subject_id
  if (id == null || String(id).trim() === '') return null
  return snapshotRecentInvestigation(
    {
      canonical_subject_id: id,
      canonical_subject_type: item.canonical_subject_type ?? null,
      parent_event_id: item.parent_event_id ?? null,
      active_view: item.active_view ?? 'news',
      as_of_time: item.as_of_time ?? null,
      selected_time_range: item.selected_time_range ?? null,
    },
    item.subObject ?? null,
  )
}

export function readRecentInvestigations(storage) {
  try {
    const raw = storage?.getItem?.(RECENT_INVESTIGATION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return boundRecentInvestigationStack(parsed.map(sanitizeStoredItem).filter(Boolean))
  } catch {
    return []
  }
}

export function writeRecentInvestigations(storage, stack) {
  try {
    storage?.setItem?.(
      RECENT_INVESTIGATION_STORAGE_KEY,
      JSON.stringify(boundRecentInvestigationStack(stack)),
    )
    return true
  } catch {
    return false
  }
}

/** Unauthenticated only. localStorage, then sessionStorage. Never account sync. */
export function unauthenticatedRecentStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    /* private mode */
  }
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage
  } catch {
    /* private mode */
  }
  return null
}
