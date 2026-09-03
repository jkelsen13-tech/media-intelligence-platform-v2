// R4.75 Step 4 — Discovery filters (DISPLAY / client state only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §7 / §16 Step 4. Discovery scope and investigation evidence scope are
// separate concepts. A News / Explore chip such as Region: Europe must not
// hide US-origin evidence already attached to the selected subject.
//
// This module is the named discovery-state contract. It never writes V2,
// never invents events or articles, never ranks a second feed, and never
// grows Investigation Context. Graph / World View / Timeline / Arcs must
// not consume these fields to filter subject evidence.

export const DISCOVERY_FILTERS_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

// News / Explore feed scope only. Investigation Context must not gain these.
export const DISCOVERY_FILTER_FIELDS = Object.freeze([
  'region',
  'topic',
  'status',
  'dateRange',
  'customDateStart',
  'customDateEnd',
  'evidenceBasis',
  'outlet',
])

export const EMPTY_DISCOVERY_FILTERS = Object.freeze({
  region: 'all',
  topic: 'all',
  status: 'all',
  dateRange: 'all',
  customDateStart: '',
  customDateEnd: '',
  evidenceBasis: 'all',
  outlet: null,
})

export function emptyDiscoveryFilters() {
  return { ...EMPTY_DISCOVERY_FILTERS }
}

/**
 * Patch discovery state. Unknown keys are ignored so this cannot grow
 * Investigation Context fields.
 */
export function applyDiscoveryFilters(current, patch = {}) {
  const next = { ...(current ?? emptyDiscoveryFilters()) }
  for (const key of DISCOVERY_FILTER_FIELDS) {
    if (Object.hasOwn(patch, key)) next[key] = patch[key]
  }
  return next
}

export function discoveryFiltersAreActive(filters) {
  const f = filters ?? EMPTY_DISCOVERY_FILTERS
  return (
    f.region !== 'all' ||
    f.topic !== 'all' ||
    f.status !== 'all' ||
    f.dateRange !== 'all' ||
    f.evidenceBasis !== 'all' ||
    f.outlet !== null
  )
}

/**
 * Apply a discovery patch beside an Investigation Context.
 * Returns the same IC reference. Does not call applySubject or resetJumpContext.
 */
export function applyDiscoveryBesideInvestigation(ic, discovery, patch) {
  return {
    investigationContext: ic,
    discovery: applyDiscoveryFilters(discovery, patch),
  }
}

/**
 * §7.3 no-leakage: discovery filters must not strip investigation evidence.
 * A US-origin supporting item on the selected subject remains visible when
 * the News / Explore region chip is Europe. This is not a ranking engine
 * and does not score, sort, drop, or invent rows.
 */
export function investigationEvidenceUnfilteredByDiscovery(evidence, discoveryFilters) {
  void discoveryFilters
  return evidence
}

/** Graph region / depth — investigation view-slice, not discovery, not identity. */
export const EMPTY_GRAPH_INVESTIGATION_SLICE = Object.freeze({
  graphRegion: 'all',
  focusExpansion: 0,
})

export function emptyGraphInvestigationSlice() {
  return { ...EMPTY_GRAPH_INVESTIGATION_SLICE }
}

export function applyGraphInvestigationSlice(slice, patch = {}) {
  return {
    graphRegion: Object.hasOwn(patch, 'graphRegion')
      ? patch.graphRegion
      : (slice?.graphRegion ?? 'all'),
    focusExpansion: Object.hasOwn(patch, 'focusExpansion')
      ? patch.focusExpansion
      : (slice?.focusExpansion ?? 0),
  }
}

/**
 * Graph region/depth sit beside the subject. The IC object is returned
 * unchanged — these controls must not replace canonical_subject_id.
 */
export function applyGraphSliceBesideSubject(ic, slice, patch) {
  return {
    investigationContext: ic,
    slice: applyGraphInvestigationSlice(slice, patch),
  }
}
