import { REGION_META, regionOf } from '../graph/cardRegions.js'

export const GRAPH_WORKSPACE_MODES = Object.freeze([
  Object.freeze({ id: 'relationships', label: 'Relationships' }),
  Object.freeze({ id: 'geography', label: 'Geography' }),
  Object.freeze({ id: 'time', label: 'Time' }),
])

const LOCATION_KEYS = Object.freeze(['location', 'place', 'country', 'geography'])

function nodeKey(node) {
  return node?.id ?? node?.slug ?? null
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isConfirmedLocation(row) {
  return (
    row?.reviewState === 'confirmed' &&
    row?.literalStatus === 'literal' &&
    (row?.resolutionMethod === 'source_record' || row?.resolutionMethod === 'human_verified') &&
    row?.place
  )
}

function hasCoordinates(row) {
  return numberOrNull(row?.latitude) !== null && numberOrNull(row?.longitude) !== null
}

// Semantic graph regions are data-derived from node type/entity type. The
// "ungrouped" option is explicit so institutions and other entities are never
// silently forced into a mockup region.
export function graphRegionOptions(nodes) {
  const counts = new Map()
  for (const node of nodes ?? []) {
    const region = regionOf(node) ?? 'ungrouped'
    counts.set(region, (counts.get(region) ?? 0) + 1)
  }
  return [
    { id: 'all', label: 'All', count: (nodes ?? []).length },
    ...Object.entries(REGION_META)
      .filter(([id]) => (counts.get(id) ?? 0) > 0)
      .map(([id, meta]) => ({ id, label: meta.label, count: counts.get(id) ?? 0 })),
    ...(counts.get('ungrouped')
      ? [{ id: 'ungrouped', label: 'Ungrouped', count: counts.get('ungrouped') }]
      : []),
  ]
}

export function filterGraphRegion(nodes, edges, region = 'all') {
  const allNodes = Array.isArray(nodes) ? nodes : []
  const allEdges = Array.isArray(edges) ? edges : []
  const shownNodes =
    region === 'all'
      ? allNodes
      : allNodes.filter((node) => (regionOf(node) ?? 'ungrouped') === region)
  const ids = new Set(shownNodes.map(nodeKey).filter(Boolean))
  return {
    nodes: shownNodes,
    edges: allEdges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  }
}

// Geography starts with source-span records produced by the explicit
// geographic-provenance model. A map dot can appear only for a literal,
// confirmed record resolved from the source itself or by a human verifier.
// Legacy text metadata remains a list-only disclosure and never gains a map
// coordinate in the browser.
export function recordedGeography(nodes, locationMentions = null) {
  const nodeByKey = new Map((nodes ?? []).map((node) => [nodeKey(node), node]))
  const scopedRows = []

  if (Array.isArray(locationMentions) && locationMentions.length > 0) {
    for (const mention of locationMentions) {
      const node = nodeByKey.get(mention?.node_id)
      if (!node) continue
      const place = text(mention?.place?.canonical_name)
      if (!place) continue
      scopedRows.push({
        id: mention.id ?? `${mention.node_id}-${mention.place_id ?? place}`,
        key: nodeKey(node),
        label: node.label ?? nodeKey(node),
        place,
        mentionText: text(mention.mention_text),
        textField: text(mention.text_field),
        locationRole: text(mention.location_role),
        literalStatus: text(mention.literal_status),
        resolutionMethod: text(mention.resolution_method),
        reviewState: text(mention.review_state),
        remainingUncertainty: text(mention.remaining_uncertainty),
        precision: text(mention?.place?.precision),
        latitude: numberOrNull(mention?.place?.latitude),
        longitude: numberOrNull(mention?.place?.longitude),
        source: 'provenance record',
      })
    }
  } else {
    for (const node of nodes ?? []) {
      const metadata = node?.metadata && typeof node.metadata === 'object' ? node.metadata : {}
      const place = LOCATION_KEYS.map((key) => text(metadata[key])).find(Boolean) ?? null
      if (!place) continue
      scopedRows.push({
        id: `legacy-${nodeKey(node)}`,
        key: nodeKey(node),
        label: node.label ?? nodeKey(node),
        place,
        mentionText: null,
        textField: null,
        locationRole: null,
        literalStatus: null,
        resolutionMethod: null,
        reviewState: 'recorded_legacy',
        remainingUncertainty: 'Recorded metadata has no source-span provenance or map coordinate in this view.',
        precision: null,
        latitude: null,
        longitude: null,
        source: 'legacy metadata',
      })
    }
  }

  return scopedRows.sort((a, b) => a.place.localeCompare(b.place) || a.label.localeCompare(b.label))
}

export function summarizeGeography(nodes, rows) {
  const geographicRows = rows ?? []
  const locatedNodeKeys = new Set(geographicRows.map((row) => row.key).filter(Boolean))
  const confirmed = geographicRows.filter(isConfirmedLocation)
  const candidates = geographicRows.filter(
    (row) => row.reviewState === 'review_pending' || row.resolutionMethod === 'automated_candidate',
  )
  return {
    confirmed,
    confirmedMappable: confirmed.filter(hasCoordinates),
    automatedCandidates: candidates,
    ambiguous: geographicRows.filter((row) => row.reviewState === 'ambiguous'),
    legacy: geographicRows.filter((row) => row.reviewState === 'recorded_legacy'),
    unlocatedNodeCount: (nodes ?? []).filter((node) => !locatedNodeKeys.has(nodeKey(node))).length,
  }
}

export function isMappableConfirmedLocation(row) {
  return isConfirmedLocation(row) && hasCoordinates(row)
}

// Time order preserves undated nodes as explicit unknowns rather than placing
// them at an invented point on the chronology.
export function recordedTime(nodes) {
  return [...(nodes ?? [])]
    .map((node) => ({
      key: nodeKey(node),
      label: node.label ?? nodeKey(node),
      occurredAt: text(node?.occurred_at),
    }))
    .sort((a, b) => {
      if (!a.occurredAt && !b.occurredAt) return a.label.localeCompare(b.label)
      if (!a.occurredAt) return 1
      if (!b.occurredAt) return -1
      return a.occurredAt.localeCompare(b.occurredAt) || a.label.localeCompare(b.label)
    })
}
