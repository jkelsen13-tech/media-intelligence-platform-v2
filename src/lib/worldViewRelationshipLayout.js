// DISPLAY-only layout of existing authorized graph edges. No graph or time inference.
export const MAX_RELATIONSHIP_LINES = 80
export const RELATIONSHIP_TEMPORAL_DISCLOSURE =
  'The current graph reader does not supply relationship valid-time bounds. These records are not attributed to the selected recorded time.'

function identity(value) {
  return (typeof value === 'string' && value.trim() !== '') || typeof value === 'number'
    ? String(value) : null
}

function keysOf(values) {
  return new Set(Array.from(values ?? []).map(identity).filter(value => value !== null))
}

export function relationshipTouchesSelection(edge, selectedKeys) {
  const keys = keysOf(selectedKeys)
  return keys.has(identity(edge?.source)) || keys.has(identity(edge?.target))
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareMarkers(a, b) {
  return compareText(String(a.id ?? ''), String(b.id ?? ''))
    || compareText(String(a.row?.revision_id ?? ''), String(b.row?.revision_id ?? ''))
    || (a.positionIndex ?? 0) - (b.positionIndex ?? 0)
    || a.x - b.x || a.y - b.y
}

function shareDisplayGroup(source, target) {
  const group = source.displayGroupId
  return typeof group === 'string' && group.trim() !== '' && group === target.displayGroupId
}

function drawable(marker, width, height) {
  return marker.visible !== false && marker.farSide !== true
    && Number.isFinite(marker.x) && Number.isFinite(marker.y)
    && (width === undefined || (Number.isFinite(width) && width > 0 && marker.x >= 0 && marker.x <= width))
    && (height === undefined || (Number.isFinite(height) && height > 0 && marker.y >= 0 && marker.y <= height))
}

/**
 * Input markers are CURRENT admitted original projection members supplied by
 * the renderer: {id,row,position,positionIndex,x,y,visible,selected}.
 * Endpoints join only row.subject_graph_node_id. Optional nodeKeys must be
 * explicit authorized aliases resolved by the caller from that graph node.
 * Marker ids, mip object ids, labels, place ids and proximity are never joins.
 *
 * Returns exact original edge and marker references; one visible original
 * endpoint per side, deterministic by marker id/revision/position. Never
 * expands MultiPoints into an endpoint Cartesian product. Optional displayGroupId
 * on the chosen original marker DTOs suppresses a line when both endpoints are
 * in the same nonempty display group; a group anchor never replaces endpoints.
 * Endpoint counts
 * disclose when this bounded presentation uses one of several locations.
 * Geometry and graph temporal validity are independent: no time is inferred.
 */
export function projectRelationshipDisplay(edges = [], markers = [], options = {}) {
  const { selectedKeys = [], width, height } = options
  const requested = options.maxLines ?? MAX_RELATIONSHIP_LINES
  const maxLines = Number.isFinite(requested)
    ? Math.min(MAX_RELATIONSHIP_LINES, Math.max(0, Math.floor(requested))) : MAX_RELATIONSHIP_LINES
  const selected = keysOf(selectedKeys)
  const endpoints = new Map()
  for (const marker of markers ?? []) {
    if (!marker?.row) continue
    const subject = identity(marker.row.subject_graph_node_id)
    if (subject === null) continue
    const aliases = new Set([subject, ...Array.from(marker.nodeKeys ?? []).map(identity).filter(key => key !== null)])
    for (const key of aliases) {
      if (!endpoints.has(key)) endpoints.set(key, { all: [], visible: [] })
      const endpoint = endpoints.get(key)
      endpoint.all.push(marker)
      if (drawable(marker, width, height)) endpoint.visible.push(marker)
    }
  }
  for (const endpoint of endpoints.values()) endpoint.visible.sort(compareMarkers)

  const sourceEdges = Array.isArray(edges) ? edges : []
  const counts = { unmapped: 0, hiddenEndpoints: 0, groupedEndpoints: 0, budget: 0, hypothesis: 0, coincidentEndpoints: 0, invalidEdge: 0 }
  const lines = []
  const dispositions = new Array(sourceEdges.length)
  let multipleEndpointEdges = 0
  const ordered = sourceEdges.map((edge, edgeIndex) => ({
    edge, edgeIndex,
    selected: selected.has(identity(edge?.source)) || selected.has(identity(edge?.target)),
  })).sort((a, b) => Number(b.selected) - Number(a.selected)
    || compareText(String(a.edge?.id ?? ''), String(b.edge?.id ?? '')) || a.edgeIndex - b.edgeIndex)

  for (const entry of ordered) {
    const { edge, edgeIndex } = entry
    const sourceKey = identity(edge?.source)
    const targetKey = identity(edge?.target)
    const source = endpoints.get(sourceKey)
    const target = endpoints.get(targetKey)
    const endpointCounts = {
      source: source?.all.length ?? 0, target: target?.all.length ?? 0,
      visibleSource: source?.visible.length ?? 0, visibleTarget: target?.visible.length ?? 0,
    }
    if (endpointCounts.source > 1 || endpointCounts.target > 1) multipleEndpointEdges++
    let reason = null
    if (sourceKey === null || targetKey === null) reason = 'invalidEdge'
    else if (edge.claimed_by === 'MIP_inferred') reason = 'hypothesis'
    else if (!source || !target) reason = 'unmapped'
    else if (!source.visible.length || !target.visible.length) reason = 'hiddenEndpoints'
    else if (shareDisplayGroup(source.visible[0], target.visible[0])) reason = 'groupedEndpoints'
    else if (source.visible[0].x === target.visible[0].x && source.visible[0].y === target.visible[0].y) reason = 'coincidentEndpoints'
    else if (lines.length >= maxLines) reason = 'budget'

    const disposition = { ...entry, reason, displayed: reason === null, endpointCounts }
    dispositions[edgeIndex] = disposition
    if (reason) { counts[reason]++; continue }
    const sourceMarker = source.visible[0]
    const targetMarker = target.visible[0]
    lines.push({
      ...entry, sourceMarker, targetMarker, endpointCounts,
      x1: sourceMarker.x, y1: sourceMarker.y, x2: targetMarker.x, y2: targetMarker.y,
      // These are recorded endpoint direction/type, never a causal relabeling.
      type: edge.type, label: edge.label,
    })
  }
  return {
    lines, dispositions, total: sourceEdges.length, displayed: lines.length,
    hidden: sourceEdges.length - lines.length, counts, multipleEndpointEdges,
    maxLines, temporalValidity: 'not_supplied_by_graph_reader',
  }
}
