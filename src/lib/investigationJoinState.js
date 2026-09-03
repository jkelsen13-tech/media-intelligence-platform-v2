// R4.75 Step 7 — Failure / freshness / a11y / performance (DISPLAY only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §13 (honest empty / missing / unsupported joins), §14 (a11y / mobile /
// performance), §16 Step 7.
//
// Join failures never invent a subject, Arc, News row, edge, or weather.
// Unsupported joins fall back to the parent Investigation Context with an
// explicit disclosure. Freshness uses existing as-of / revision markers
// only — this module does not add a backend revision API.
//
// Explore dismiss stays non-mutating (Step 3). Invalid selection ids fail
// closed through deepLinks (Step 6). Recent history stays bounded (max 8).

import { preserveSubjectAcrossViews } from './investigationContext.js'
import { preserveInvestigationThroughExplore } from './exploreShell.js'
import {
  applySelectionAgainstCatalog,
  reconstructFromDeepLink,
  parseDeepLink,
} from './deepLinks.js'
import {
  RECENT_INVESTIGATION_MAX,
  boundRecentInvestigationStack,
} from './recentInvestigation.js'
import { revisionCoverageAt, weatherPanelState } from './spatialProjection.js'

export const INVESTIGATION_JOIN_STATE_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

export const JOIN_STATE_KINDS = Object.freeze([
  'no_joined_data',
  'insufficient_evidence',
  'unsupported_object_type',
  'withheld',
  'request_failed',
  'stale_cached',
  'invalid_selection',
])

export const JOIN_STATE_COPY = Object.freeze({
  no_joined_data:
    'No joined data for this subject on this view. Absence is explicit — no subject, Arc, News row, edge, or weather is invented.',
  insufficient_evidence:
    'Insufficient evidence to represent this join. The parent investigation context is unchanged.',
  unsupported_object_type:
    'This object type is not representable on this view. Showing the parent investigation context. No subject, Arc, News row, edge, or weather is invented.',
  withheld:
    'This representation is withheld (private, review-gated, or permission-denied). The parent investigation context is unchanged.',
  request_failed:
    'The request for this joined representation failed. The parent investigation context is unchanged. No rows are invented.',
  stale_cached:
    'This is a stale cached representation. Recorded as-of / revision markers are existing fields, not a new revision API.',
  invalid_selection:
    'Sub-selection is not valid on this subject. Showing the parent investigation context.',
})

/** Views whose primary join can bind these subject types. Unmatched → honest miss. */
export const VIEW_JOIN_TYPES = Object.freeze({
  news: Object.freeze({ types: Object.freeze(['article']), unmatched: 'no_joined_data' }),
  graph: Object.freeze({
    types: Object.freeze(['event', 'actor', 'policy', 'organization', 'person', 'institution']),
    unmatched: 'unsupported_object_type',
  }),
  timeline: Object.freeze({ types: Object.freeze(['event', 'arc']), unmatched: 'unsupported_object_type' }),
  arcs: Object.freeze({ types: Object.freeze(['arc']), unmatched: 'unsupported_object_type' }),
  world: Object.freeze({ types: Object.freeze(['event']), unmatched: 'unsupported_object_type' }),
  compare: Object.freeze({ types: Object.freeze(['event']), unmatched: 'unsupported_object_type' }),
})

export const SEARCH_DEBOUNCE_MS = 350
export const CONTEXT_HISTORY_MAX = RECENT_INVESTIGATION_MAX

export const EXPLORE_A11Y = Object.freeze({
  triggerLabel: 'Explore / Change Topic',
  dialogLabel: 'Explore / Change Topic',
  dialogId: 'mip-explore-dialog',
  closeLabel: 'Close Explore / Change Topic',
  searchLabel: 'Search headlines, summaries, article text',
  searchAttr: 'data-explore-search',
  triggerAttr: 'data-explore-trigger',
  dialogAttr: 'data-explore-dialog',
  filtersLabel: 'Open discovery filters',
})

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function emptyInventionFlags() {
  return {
    invented: false,
    inventedSubject: false,
    inventedArc: false,
    inventedNewsRow: false,
    inventedEdge: false,
    inventedWeather: false,
  }
}

function makeJoin(kind, extra = {}) {
  return {
    kind,
    copy: extra.copy ?? JOIN_STATE_COPY[kind],
    action: extra.action ?? (kind === 'unsupported_object_type' || kind === 'invalid_selection' ? 'parent_context' : 'disclose'),
    ...emptyInventionFlags(),
    view: extra.view ?? null,
    subjectType: extra.subjectType ?? null,
    requestedId: extra.requestedId ?? null,
    selectionKind: extra.selectionKind ?? null,
    reason: extra.reason ?? null,
    coverage: extra.coverage ?? null,
    weather: extra.weather === true,
  }
}

export function viewCanRepresentSubject(view, subjectType) {
  if (!subjectType || !view) return true
  const spec = VIEW_JOIN_TYPES[view]
  if (!spec) return true
  return spec.types.includes(subjectType)
}

export function joinKindForViewSubject(view, subjectType) {
  if (!subjectType || !view) return null
  const spec = VIEW_JOIN_TYPES[view]
  if (!spec) return null
  if (spec.types.includes(subjectType)) return null
  return spec.unmatched
}

/**
 * Classify a join / empty / failure / stale miss. Never invents rows.
 * Caller-supplied flags only — no V2 read.
 */
export function classifyJoinState(input = {}) {
  const {
    failed = false,
    failureReason = null,
    withheld = false,
    reviewGated = false,
    permissionDenied = false,
    stale = false,
    coverage = null,
    availableCount = null,
    insufficientEvidence = false,
    view = null,
    subjectType = null,
    weatherRequested = false,
  } = input

  if (weatherRequested) {
    return makeJoin('no_joined_data', { weather: true, view, subjectType })
  }
  if (failed) {
    return makeJoin('request_failed', { reason: failureReason, view, subjectType })
  }
  if (withheld || reviewGated || permissionDenied) {
    return makeJoin('withheld', { reason: failureReason, view, subjectType })
  }
  if (stale || coverage === 'outside' || coverage === 'time_not_recorded') {
    return makeJoin('stale_cached', { coverage, view, subjectType })
  }
  const typeKind = joinKindForViewSubject(view, subjectType)
  if (typeKind === 'unsupported_object_type') {
    return makeJoin('unsupported_object_type', { view, subjectType, action: 'parent_context' })
  }
  if (insufficientEvidence) {
    return makeJoin('insufficient_evidence', { view, subjectType })
  }
  if (availableCount === 0 || typeKind === 'no_joined_data') {
    return makeJoin('no_joined_data', { view, subjectType })
  }
  return null
}

/**
 * Unsupported join: same IC reference, disclosure, nothing invented.
 * Landing view is the caller's view (Arcs for `/arc` and `/arcs`).
 */
export function applyUnsupportedJoin(ic, view) {
  const join = classifyJoinState({ view, subjectType: ic?.canonical_subject_type })
  return {
    investigationContext: ic,
    join,
    action: join?.action ?? null,
    landingView: view,
    ...emptyInventionFlags(),
  }
}

export function selectionFallbackCopy(fallback) {
  const kind = fallback?.kind ?? fallback?.selectionKind ?? 'selection'
  const id = fallback?.requestedId ?? 'unknown'
  return `Sub-selection ${kind} ${id} is not valid on this subject. Showing the parent investigation context.`
}

export function selectionFallbackDisclosure(fallback) {
  return makeJoin('invalid_selection', {
    copy: selectionFallbackCopy(fallback),
    selectionKind: fallback?.kind ?? null,
    requestedId: fallback?.requestedId ?? null,
    reason: fallback?.reason ?? 'not_in_parent_context',
    action: 'parent_context',
  })
}

/**
 * IC bar previously painted the same parent-fallback copy twice: once from
 * `selectionFallbacks` and again from `shellJoinDisclosures` which re-wraps
 * those fallbacks. Keep one line. Spatial `mip_object_id` as an entity
 * sub-selection is honest parent-fallback — not a fail and not a new subject.
 */
export function visibleJoinDisclosures(selectionFallbacks = [], joinDisclosures = []) {
  const seen = new Set()
  for (const fallback of selectionFallbacks ?? []) {
    seen.add(selectionFallbackCopy(fallback))
  }
  const out = []
  for (const join of joinDisclosures ?? []) {
    const copy = join?.copy
    if (copy && seen.has(copy)) continue
    if (copy) seen.add(copy)
    out.push(join)
  }
  return out
}

export function invalidSelectionAgainstParent(selection, catalog, parentSubjectId) {
  const applied = applySelectionAgainstCatalog(selection, catalog, parentSubjectId)
  return {
    selection: applied.selection,
    fallbacks: applied.fallbacks,
    disclosures: applied.fallbacks.map(selectionFallbackDisclosure),
    pending: applied.pending === true,
    invented: false,
  }
}

/**
 * Existing as-of / revision fields only. Does not fetch or invent a revision API.
 */
export function freshnessFromExistingMarkers({
  asOfTime = null,
  revisionRow = null,
  atMs = null,
  stale = false,
  cachedRepresentationAsOf = null,
} = {}) {
  const cues = []
  if (asOfTime != null && String(asOfTime).trim() !== '') {
    cues.push({ kind: 'as_of', label: `as of ${asOfTime}` })
  }
  if (revisionRow?.revision_ordinal != null) {
    cues.push({ kind: 'revision_ordinal', label: `revision ${revisionRow.revision_ordinal}` })
  }
  if (revisionRow?.revision_known_at_utc) {
    cues.push({ kind: 'revision_known_at', label: `known at ${revisionRow.revision_known_at_utc}` })
  }

  let coverage = null
  if (revisionRow && Number.isFinite(atMs)) {
    coverage = revisionCoverageAt(revisionRow, atMs)
  }
  const cacheMismatch =
    cachedRepresentationAsOf != null &&
    asOfTime != null &&
    String(cachedRepresentationAsOf) !== String(asOfTime)
  const staleKind =
    stale || cacheMismatch || coverage === 'outside' || coverage === 'time_not_recorded'

  return {
    kind: staleKind ? 'stale_cached' : cues.length ? 'current_with_markers' : 'no_markers',
    cues,
    coverage,
    inventsRevisionApi: false,
    summary: staleKind
      ? JOIN_STATE_COPY.stale_cached
      : cues.length
        ? `Recorded ${cues.map((cue) => cue.label).join(' · ')}. Existing as-of / revision markers only — no backend revision API is queried.`
        : null,
  }
}

export function weatherJoinState() {
  const weather = weatherPanelState()
  return {
    ...makeJoin('no_joined_data', { weather: true }),
    copy: weather.copy,
    fields: weather.fields,
    temperature: weather.fields.temperature,
    status: weather.status,
  }
}

export function shellJoinDisclosures({
  investigationContext,
  view,
  selectionFallbacks = [],
  graphError = null,
  edgesUnavailable = null,
  nodeCount = null,
  staleCached = false,
  revisionRow = null,
  atMs = null,
} = {}) {
  const disclosures = []
  const subjectType = investigationContext?.canonical_subject_type ?? null

  for (const fallback of selectionFallbacks ?? []) {
    disclosures.push(selectionFallbackDisclosure(fallback))
  }

  if (view === 'graph' && graphError) {
    disclosures.push(classifyJoinState({ failed: true, failureReason: graphError, view, subjectType }))
  } else if (view === 'graph' && edgesUnavailable) {
    const withheld = /permission|denied|review|withheld|gated/i.test(String(edgesUnavailable))
    disclosures.push(
      classifyJoinState({
        withheld,
        failed: !withheld,
        failureReason: edgesUnavailable,
        view,
        subjectType,
      }),
    )
  } else if (view === 'graph' && nodeCount === 0) {
    disclosures.push(classifyJoinState({ availableCount: 0, view, subjectType }))
  }

  const typeJoin = classifyJoinState({ view, subjectType })
  if (typeJoin && !disclosures.some((item) => item?.kind === typeJoin.kind && item?.view === typeJoin.view)) {
    disclosures.push(typeJoin)
  }

  const freshness = freshnessFromExistingMarkers({
    asOfTime: investigationContext?.as_of_time,
    revisionRow,
    atMs,
    stale: staleCached,
  })
  if (freshness.kind === 'stale_cached') {
    const staleJoin = classifyJoinState({ stale: true, coverage: freshness.coverage, view, subjectType })
    if (staleJoin && !disclosures.some((item) => item?.kind === 'stale_cached')) disclosures.push(staleJoin)
  }

  return disclosures.filter(Boolean)
}

/**
 * Rapid view / subject-selection burst. Subject identity is unchanged unless
 * the caller already replaced it. Never invents a second subject.
 */
export function rapidViewBurst(ic, views, { catalog, selection } = {}) {
  const after = preserveSubjectAcrossViews(ic, views ?? [])
  const applied = selection
    ? invalidSelectionAgainstParent(selection, catalog, after.canonical_subject_id)
    : { selection: null, fallbacks: [], disclosures: [], pending: false, invented: false }
  const joinDisclosures = (views ?? []).map((view) => classifyJoinState({ view, subjectType: after.canonical_subject_type })).filter(Boolean)
  return {
    investigationContext: after,
    subjectUnchanged: after.canonical_subject_id === ic?.canonical_subject_id,
    invented: false,
    disclosures: [...applied.disclosures, ...joinDisclosures],
    selection: applied.selection,
    fallbacks: applied.fallbacks,
  }
}

export function exploreDismissPreserves(ic) {
  return preserveInvestigationThroughExplore(ic, 'dismiss')
}

export function boundContextHistory(stack) {
  return boundRecentInvestigationStack(stack, CONTEXT_HISTORY_MAX)
}

export function filterChipA11y(active) {
  return {
    'aria-pressed': active ? true : false,
    'data-filter-active': active ? 'true' : 'false',
  }
}

export function focusableExploreControls(dialogEl) {
  if (!dialogEl?.querySelectorAll) return []
  return [...dialogEl.querySelectorAll(FOCUSABLE)].filter((el) => el.disabled !== true)
}

export function exploreFocusOpen(dialogEl) {
  if (!dialogEl) return null
  const search = dialogEl.querySelector?.(`[${EXPLORE_A11Y.searchAttr}]`)
  const target = search ?? dialogEl
  target.focus?.()
  return target
}

export function exploreFocusClose(triggerEl) {
  triggerEl?.focus?.()
  return triggerEl ?? null
}

export function handleExploreDialogKeyDown(event, { dialogEl, onDismiss } = {}) {
  if (!event) return false
  if (event.key === 'Escape') {
    onDismiss?.()
    return true
  }
  if (event.key !== 'Tab' || !dialogEl) return false
  const nodes = focusableExploreControls(dialogEl)
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

export function createCancellableSearch(run, { debounceMs = SEARCH_DEBOUNCE_MS } = {}) {
  let seq = 0
  let timer = null
  let pending = []
  const flushCancelled = () => {
    const waiting = pending
    pending = []
    for (const resolve of waiting) resolve({ cancelled: true, result: null })
  }
  return {
    request(args) {
      const token = ++seq
      clearTimeout(timer)
      flushCancelled()
      return new Promise((resolve) => {
        pending.push(resolve)
        timer = setTimeout(async () => {
          pending = pending.filter((item) => item !== resolve)
          if (token !== seq) {
            resolve({ cancelled: true, result: null })
            return
          }
          const result = await run(args)
          if (token !== seq) {
            resolve({ cancelled: true, result: null })
            return
          }
          resolve({ cancelled: false, result })
        }, debounceMs)
      })
    },
    cancel() {
      seq += 1
      clearTimeout(timer)
      flushCancelled()
    },
  }
}

/**
 * Hash `#/event/<id>/arc` and `#/event/<id>/arcs` both land on Arcs.
 * Canonical identity is the path id. Plural `arcs` is an alias, not Graph.
 */
export function reconstructArcsDeepLink(input, options) {
  return reconstructFromDeepLink(parseDeepLink(input), options)
}
