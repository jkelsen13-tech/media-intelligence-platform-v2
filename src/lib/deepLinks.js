// R4.75 Step 6 — Deterministic joined deep links (DISPLAY / client only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §10 / §16 Step 6.
//
// GitHub Pages has no SPA path fallback, and this app has no existing
// router. Shareable state lives in the hash:
//   #/event/<canonical_subject_id>/<graph|sources|timeline|arc|arcs|world|news>
//   ?claim=&entity=&source=&time=&place=
//
// Canonical §10 slug for Story Arcs is `arc` (serialized). The App view
// key is `arcs`. Live hash `#/event/<id>/arcs` (plural) aliases to that
// same Arcs view — it is not an unknown slug and must not fall back to Graph.
//
// Canonical identity is the path id only. Display title / label / name / q
// are never read as identity. Invalid or stale sub-selection ids fall back
// to the parent Investigation Context — they do not select a different
// subject and they do not invent one.
//
// Reconstruction goes through commitNewSubject / applySubject. This module
// never writes V2.

import { commitNewSubject } from './newSubjectPropagation.js'
import { emptyInvestigationContext } from './investigationContext.js'

export const DEEP_LINK_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

export const DEEP_LINK_ROUTE_SHAPE = 'hash'

/** Conceptual §10 slugs → existing App view keys. `arcs` aliases `arc`. */
export const DEEP_LINK_SLUG_TO_VIEW = Object.freeze({
  graph: 'graph',
  sources: 'compare',
  timeline: 'timeline',
  arc: 'arcs',
  arcs: 'arcs',
  world: 'world',
  news: 'news',
  investigations: 'investigations',
})

export const VIEW_TO_DEEP_LINK_SLUG = Object.freeze({
  graph: 'graph',
  compare: 'sources',
  timeline: 'timeline',
  arcs: 'arc',
  world: 'world',
  news: 'news',
  investigations: 'investigations',
})

export const DEEP_LINK_SELECTION_KEYS = Object.freeze(['claim', 'entity', 'source', 'time', 'place', 'at'])

const MAX_ROUTE_LENGTH = 8192

function hasControlCharacters(value) {
  return [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

function decodeRouteSegment(value) {
  if (!value) return null
  try {
    const decoded = decodeURIComponent(value)
    return decoded.length <= 512 && decoded.trim() !== '' && !decoded.includes('/')
      && !decoded.includes(String.fromCharCode(92)) && !hasControlCharacters(decoded) ? decoded : null
  } catch {
    return null
  }
}

function ownView(table, key) {
  return Object.hasOwn(table, key) ? table[key] : null
}

const DISPLAY_TEXT_QUERY_KEYS = Object.freeze(['title', 'label', 'name', 'q', 'text'])

export function emptyDeepLinkSelection() {
  return {
    claim: null,
    entity: null,
    source: null,
    time: null,
    place: null,
  }
}

export function isInvestigationDeepLink(input) {
  const raw = String(input ?? '')
  const hash = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw
  const path = hash.split('?')[0]
  return /(?:^|\/)event(?:\/|$)/.test(path)
}

/**
 * Display text is never an identity. Always null — callers must use an id.
 */
export function canonicalSubjectIdFromDisplayText(text) {
  void text
  return null
}

function splitPathAndSearch(input) {
  const raw = String(input ?? '')
  let path = ''
  let search = ''
  const hashIdx = raw.indexOf('#')
  if (hashIdx >= 0) {
    const hash = raw.slice(hashIdx + 1)
    const q = hash.indexOf('?')
    path = q >= 0 ? hash.slice(0, q) : hash
    search = q >= 0 ? hash.slice(q + 1) : ''
    return { path, search }
  }
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(raw, 'https://local.invalid')
    path = url.pathname
    search = url.search.startsWith('?') ? url.search.slice(1) : url.search
    if (url.hash) {
      const inner = url.hash.replace(/^#/, '')
      const q = inner.indexOf('?')
      path = q >= 0 ? inner.slice(0, q) : inner
      search = q >= 0 ? inner.slice(q + 1) : ''
    }
  } catch {
    const q = raw.indexOf('?')
    path = q >= 0 ? raw.slice(0, q) : raw
    search = q >= 0 ? raw.slice(q + 1) : ''
  }
  return { path, search }
}

function normalizeRoutePath(path) {
  return String(path ?? '')
    .replace(/^\/+/, '')
    .replace(/^media-intelligence-platform-v2\/?/, '')
    .replace(/^\/+/, '')
}

function emptyParse() {
  return {
    subjectId: null,
    viewSlug: null,
    view: null,
    unknownView: false,
    selection: emptyDeepLinkSelection(),
    ignoredDisplayText: false,
  }
}

/**
 * Parse a shareable hash (or path-shaped string) into ids only.
 * Never derives canonical_subject_id from display text.
 */
export function parseDeepLink(input) {
  if (typeof input !== 'string' || input.length > MAX_ROUTE_LENGTH || input.trim() === '') return emptyParse()
  const { path, search } = splitPathAndSearch(input)
  const parts = normalizeRoutePath(path).split('/').filter(Boolean)
  if (parts[0] !== 'event' || parts.length > 3) return emptyParse()

  const subjectId = decodeRouteSegment(parts[1])
  const viewSlug = decodeRouteSegment(parts[2])
  if ((parts[1] && !subjectId) || (parts[2] && !viewSlug)) return emptyParse()
  const params = new URLSearchParams(search)
  const selection = emptyDeepLinkSelection()
  for (const key of DEEP_LINK_SELECTION_KEYS) {
    const values = params.getAll(key)
    const value = values.length === 1 ? values[0] : null
    selection[key] = value && value.length <= 1024 && value.trim() !== ''
      && !hasControlCharacters(value) ? value : null
  }
  const ignoredDisplayText = DISPLAY_TEXT_QUERY_KEYS.some((key) => params.has(key))
  const knownView = viewSlug ? ownView(DEEP_LINK_SLUG_TO_VIEW, viewSlug) : subjectId ? 'graph' : null
  return {
    subjectId,
    viewSlug,
    view: knownView,
    unknownView: Boolean(viewSlug && !ownView(DEEP_LINK_SLUG_TO_VIEW, viewSlug)),
    selection,
    ignoredDisplayText,
  }
}

export function formatTimeQuery(asOfTime, selectedTimeRange) {
  const range = selectedTimeRange
  if (range && (range.from != null || range.to != null)) {
    return `${range.from ?? ''}..${range.to ?? ''}`
  }
  if (asOfTime != null && String(asOfTime).trim() !== '') return String(asOfTime)
  return null
}

export function parseTimeQuery(time) {
  if (time == null || String(time).trim() === '') return {}
  const raw = String(time)
  if (raw.includes('..')) {
    const [fromRaw, toRaw] = raw.split('..')
    const from = fromRaw && fromRaw.trim() !== '' ? fromRaw : null
    const to = toRaw && toRaw.trim() !== '' ? toRaw : null
    if (!from && !to) return {}
    return {
      as_of_time: from,
      selected_time_range: { from, to },
    }
  }
  return {
    as_of_time: raw,
    selected_time_range: { from: raw, to: null },
  }
}

/**
 * A sub-selection is valid only when its id is already in the caller-supplied
 * catalog for that kind. Missing catalog for a kind = not yet known (pending).
 * Empty catalog = representable but nothing valid (honest fallback).
 * Entries may be ids or { id, parentId }. A parent mismatch is invalid —
 * we never jump to a different subject to satisfy the sub-selection.
 */
export function selectionIdIsValid(kind, id, catalog, parentSubjectId) {
  if (id == null || String(id).trim() === '') return false
  if (!catalog || !Object.hasOwn(catalog, kind)) return false
  const entries = catalog[kind]
  if (entries == null) return false
  const list = entries instanceof Set ? [...entries] : Array.isArray(entries) ? entries : []
  return list.some((item) => {
    if (item == null) return false
    if (typeof item === 'string' || typeof item === 'number') {
      return String(item) === String(id)
    }
    if (String(item.id) !== String(id)) return false
    if (item.parentId != null && parentSubjectId != null && String(item.parentId) !== String(parentSubjectId)) {
      return false
    }
    return true
  })
}

/**
 * Apply optional query selections against a catalog.
 * catalog == null → keep ids pending (graph not loaded yet).
 * Invalid ids fall back to parent — they are dropped, not replaced.
 */

// Optional exact inspection instant, independent of the investigation's time range.
export function parseInspectionInstant(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T.*(?:Z|[+-]\\d{2}:\\d{2})$/i.test(value)) return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

export function applySelectionAgainstCatalog(selection, catalog, parentSubjectId) {
  const incoming = selection ?? emptyDeepLinkSelection()
  if (catalog == null) {
    return { selection: { ...emptyDeepLinkSelection(), ...incoming }, fallbacks: [], pending: true }
  }
  const next = emptyDeepLinkSelection()
  const fallbacks = []
  for (const key of DEEP_LINK_SELECTION_KEYS) {
    const value = incoming[key]
    if (value == null || String(value).trim() === '') continue
    if (key === 'at') {
      const instant = parseInspectionInstant(value)
      if (instant) next.at = instant
      else fallbacks.push({ kind: 'at', requestedId: value, reason: 'unparseable', action: 'parent_context' })
      continue
    }
    if (key === 'time') {
      const parsed = parseTimeQuery(value)
      if (parsed.as_of_time || parsed.selected_time_range) {
        next.time = value
      } else {
        fallbacks.push({
          kind: 'time',
          requestedId: value,
          reason: 'unparseable',
          action: 'parent_context',
        })
      }
      continue
    }
    if (!Object.hasOwn(catalog, key) || catalog[key] == null) {
      next[key] = value
      continue
    }
    if (selectionIdIsValid(key, value, catalog, parentSubjectId)) {
      next[key] = value
    } else {
      fallbacks.push({
        kind: key,
        requestedId: value,
        reason: 'not_in_parent_context',
        action: 'parent_context',
      })
    }
  }
  return { selection: next, fallbacks, pending: false }
}

/**
 * §10 reconstruct: one commitNewSubject for the path id, then bounded
 * selection apply. No resolvable id → no commit, no invented subject.
 */
export function reconstructFromDeepLink(parsed, { currentIc, catalog } = {}) {
  const landingView = parsed?.view ?? (parsed?.unknownView ? 'graph' : null) ?? 'graph'
  const base = currentIc ?? emptyInvestigationContext(landingView)
  if (!parsed?.subjectId) {
    return {
      investigationContext: base,
      committed: false,
      selection: emptyDeepLinkSelection(),
      fallbacks: [],
      invented: false,
    }
  }

  const timeFields = parseTimeQuery(parsed.selection?.time)
  const inspectionInstant = parseInspectionInstant(parsed.selection?.at)
  if (inspectionInstant) timeFields.as_of_time = inspectionInstant
  const payload = {
    canonical_subject_type: 'event',
    canonical_subject_id: parsed.subjectId,
    ...timeFields,
  }
  const result = commitNewSubject(base, payload, { landingView })
  const applied = applySelectionAgainstCatalog(parsed.selection, catalog, parsed.subjectId)
  const fallbacks = [...applied.fallbacks]
  if (parsed.unknownView) {
    fallbacks.push({
      kind: 'view',
      requestedId: parsed.viewSlug,
      reason: 'unknown_view',
      action: 'parent_context',
    })
  }
  return {
    investigationContext: result.investigationContext,
    committed: result.committed,
    selection: applied.selection,
    fallbacks,
    invented: false,
    pendingSelection: applied.pending === true,
  }
}

/**
 * Write the current IC + supported selections as a hash. Never writes
 * display title. Empty IC → `#/` (no invented event segment).
 */
export function serializeDeepLink(ic, selection = {}) {
  const id = ic?.canonical_subject_id
  if (!id) return '#/'
  const slug = ownView(VIEW_TO_DEEP_LINK_SLUG, ic.active_view) ?? 'graph'
  const params = new URLSearchParams()
  const merged = { ...emptyDeepLinkSelection(), ...selection }
  if (!merged.time) {
    merged.time = formatTimeQuery(ic.as_of_time, ic.selected_time_range)
  }
  // Shared context is authoritative; never retain a stale at= from a prior selection.
  const instant = parseInspectionInstant(ic.as_of_time)
  if (instant && instant !== parseTimeQuery(merged.time).as_of_time) merged.at = instant
  else delete merged.at
  for (const key of DEEP_LINK_SELECTION_KEYS) {
    const value = merged[key]
    if (value != null && String(value).trim() !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  const path = `#/event/${encodeURIComponent(String(id))}/${slug}`
  return qs ? `${path}?${qs}` : path
}

export function hydrateDeepLink(input, { currentIc, catalog } = {}) {
  const parsed = parseDeepLink(input)
  return {
    parsed,
    ...reconstructFromDeepLink(parsed, { currentIc, catalog }),
  }
}
