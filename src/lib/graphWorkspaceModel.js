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

// Geography is intentionally a record list rather than a drawn map: MIP’s
// graph read path provides optional location labels, not verified coordinates.
// Only a named, nonempty field is shown; an absent field is an honest absence.
export function recordedGeography(nodes) {
  const rows = []
  for (const node of nodes ?? []) {
    const metadata = node?.metadata && typeof node.metadata === 'object' ? node.metadata : {}
    const location = LOCATION_KEYS.map((key) => text(metadata[key])).find(Boolean) ?? null
    if (location) rows.push({ key: nodeKey(node), label: node.label ?? nodeKey(node), location })
  }
  return rows.sort((a, b) => a.location.localeCompare(b.location) || a.label.localeCompare(b.label))
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
