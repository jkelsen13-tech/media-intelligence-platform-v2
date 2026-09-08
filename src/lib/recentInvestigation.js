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
  VIEW_TO_DEEP_LINK_SLUG,
} from './deepLinks.js'

export const RECENT_INVESTIGATION_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

export const RECENT_INVESTIGATION_STORAGE_KEY = 'mip.recentInvestigations.v1'
export const RECENT_INVESTIGATION_MAX = 8

const SUB_OBJECT_KINDS = Object.freeze(['claim', 'entity', 'source', 'place'])

// Bound the serialized input before parsing; never retain arbitrary object payloads.
export const RECENT_INVESTIGATION_MAX_STORAGE_LENGTH = 32768

function navigationString(value, max = 512) {
  return typeof value === 'string' && value.length <= max && value.trim() !== ''
    && ![...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    ? value : null
}

export function snapshotRecentInvestigation(ic, subObject = null) {
  const id = navigationString(ic?.canonical_subject_id)
  if (!id) return null
  const from = navigationString(ic?.selected_time_range?.from, 96)
  const to = navigationString(ic?.selected_time_range?.to, 96)
  const subId = navigationString(subObject?.id)
  return {
    canonical_subject_id: id,
    canonical_subject_type: navigationString(ic.canonical_subject_type, 64),
    parent_event_id: navigationString(ic.parent_event_id),
    active_view: typeof ic.active_view === 'string' && Object.hasOwn(VIEW_TO_DEEP_LINK_SLUG, ic.active_view)
      ? ic.active_view : 'news',
    as_of_time: navigationString(ic.as_of_time, 96),
    selected_time_range: from || to ? { from, to } : null,
    subObject: SUB_OBJECT_KINDS.includes(subObject?.kind) && subId
      ? { kind: subObject.kind, id: subId } : null,
  }
}

export function boundRecentInvestigationStack(stack, max = RECENT_INVESTIGATION_MAX) {
  const limit = Number.isFinite(max) && max >= 1
    ? Math.min(Math.floor(max), RECENT_INVESTIGATION_MAX) : RECENT_INVESTIGATION_MAX
  if (!Array.isArray(stack)) return []
  return stack.slice(0, limit).map(sanitizeStoredItem).filter(Boolean)
}

/**
 * Most-recent-first. Same canonical id is moved to the front (updated),
 * never duplicated. Empty / title-only snapshots are ignored.
 */
export function pushRecentInvestigation(stack, snapshot, max = RECENT_INVESTIGATION_MAX) {
  const safe = sanitizeStoredItem(snapshot)
  if (!safe) return boundRecentInvestigationStack(stack, max)
  const without = boundRecentInvestigationStack(stack, max)
    .filter(item => item.canonical_subject_id !== safe.canonical_subject_id)
  return boundRecentInvestigationStack([safe, ...without], max)
}

export function restoreRecentInvestigation(item, { currentIc, catalog } = {}) {
  item = sanitizeStoredItem(item)
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
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  return snapshotRecentInvestigation(item, item.subObject)
}

export function readRecentInvestigations(storage) {
  try {
    const raw = storage?.getItem?.(RECENT_INVESTIGATION_STORAGE_KEY)
    if (typeof raw !== 'string' || !raw || raw.length > RECENT_INVESTIGATION_MAX_STORAGE_LENGTH) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return boundRecentInvestigationStack(parsed)
  } catch {
    return []
  }
}

export function writeRecentInvestigations(storage, stack) {
  try {
    if (typeof storage?.setItem !== 'function') return false
    const serialized = JSON.stringify(boundRecentInvestigationStack(stack))
    if (serialized.length > RECENT_INVESTIGATION_MAX_STORAGE_LENGTH) return false
    storage.setItem(RECENT_INVESTIGATION_STORAGE_KEY, serialized)
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
