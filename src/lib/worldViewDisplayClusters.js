// Screen-space display aggregation only. Retained rows, geometry positions and
// marker objects are never rewritten; renderers draw a cluster at its anchor.
function compareKeys(a, b) { return a < b ? -1 : a > b ? 1 : 0 }

function canonicalSnapshot(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!value || typeof value !== 'object' || ancestors.has(value)) throw new TypeError('Non-JSON projection row')
  ancestors.add(value)
  let result
  if (Array.isArray(value)) result = value.map(item => canonicalSnapshot(item, ancestors))
  else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError('Non-JSON projection row')
    }
    result = Object.create(null)
    for (const key of Object.keys(value).sort(compareKeys)) {
      if (value[key] !== undefined) result[key] = canonicalSnapshot(value[key], ancestors)
    }
  }
  ancestors.delete(value)
  return result
}

/** Object/version identity. Unversioned rows use their full deterministic JSON
 * snapshot; missing object IDs or non-JSON snapshots fail closed with null. */
export function projectionRowDisplayKey(row) {
  if (!row || typeof row.mip_object_id !== 'string' || !row.mip_object_id.trim()) return null
  const contract = typeof row.projection_contract_version === 'string' ? row.projection_contract_version : ''
  if (typeof row.revision_id === 'string' && row.revision_id.trim()) {
    return JSON.stringify([contract, row.mip_object_id, 'revision', row.revision_id])
  }
  try {
    return JSON.stringify([contract, row.mip_object_id, 'snapshot', canonicalSnapshot(row)])
  } catch { return null }
}

/** One canonical geometry location; wrapped screen copies share this key. */
export function displayMarkerKey(row, positionIndex = 0) {
  const rowKey = projectionRowDisplayKey(row)
  return rowKey !== null && Number.isSafeInteger(positionIndex) && positionIndex >= 0
    ? JSON.stringify([rowKey, positionIndex]) : null
}

function emptyLayout(inputLocations, radiusPx) {
  return { singles: [], clusters: [], items: [], stats: {
    inputLocations, filteredLocations: inputLocations, duplicateLocations: 0,
    admittedLocations: 0, admittedRows: 0, singleCount: 0, clusterCount: 0,
    displayCount: 0, distanceChecks: 0, radiusPx,
  } }
}

/**
 * Inputs use CSS-screen pixels and explicit visible flags. positionIndex (or
 * atlas i) is the index within collectPositions; defaults to 0 for a Point.
 * Canonical row/index keys, rather than input-order IDs, identify locations.
 *
 * After deterministic deduplication, each point joins the nearest existing
 * seed within radiusPx. Seeds are indexed in a spatial hash and are more than
 * radiusPx apart. Only seeds enter the hash, bounding dense-scene work after
 * the O(n log n) sort. Members stay within radiusPx of the retained seed;
 * membership never grows by following a transitive chain.
 *
 * Singles are the exact input markers. Cluster members and rowMembers retain
 * original references. rowCount counts distinct object/version projection
 * rows; locationCount counts geometry positions, after wrapped-copy dedup.
 * Selection changes emphasis only, never grouping or anchor choice.
 */
export function layoutDisplayClusters(markers, { width, height, radiusPx = 36 } = {}) {
  const input = Array.isArray(markers) ? markers : []
  const layout = emptyLayout(input.length, radiusPx)
  if (![width, height, radiusPx].every(Number.isFinite) || width <= 0 || height <= 0 || radiusPx <= 0
    || !Number.isSafeInteger(Math.ceil(width / radiusPx))
    || !Number.isSafeInteger(Math.ceil(height / radiusPx))) return layout
  const rows = new Map(), locations = new Map()
  let filtered = 0, duplicates = 0
  const centerDistance = marker => Math.hypot(marker.x - width / 2, marker.y - height / 2)
  const compareCopies = (a, b) => centerDistance(a) - centerDistance(b)
    || a.x - b.x || a.y - b.y
    || Number(Boolean(b.selected)) - Number(Boolean(a.selected))
    || compareKeys(String(a.id ?? ''), String(b.id ?? ''))
  for (const marker of input) {
    if (!marker?.visible || !Number.isFinite(marker.x) || !Number.isFinite(marker.y)
      || marker.x < 0 || marker.x > width || marker.y < 0 || marker.y > height) { filtered++; continue }
    let rowKey = rows.get(marker.row)
    if (rowKey === undefined) {
      rowKey = projectionRowDisplayKey(marker.row)
      rows.set(marker.row, rowKey)
    }
    const index = marker.positionIndex ?? marker.i ?? 0
    if (rowKey === null || !Number.isSafeInteger(index) || index < 0) { filtered++; continue }
    const key = JSON.stringify([rowKey, index])
    const previous = locations.get(key)
    if (previous) {
      duplicates++
      previous.selected ||= Boolean(marker.selected)
      if (compareCopies(marker, previous.marker) < 0) previous.marker = marker
    } else locations.set(key, { key, rowKey, marker, selected: Boolean(marker.selected) })
  }
  const ordered = [...locations.values()].sort((a, b) => compareKeys(a.key, b.key))
  const cells = new Map(), groups = []
  let distanceChecks = 0
  for (const entry of ordered) {
    const cx = Math.floor(entry.marker.x / radiusPx), cy = Math.floor(entry.marker.y / radiusPx)
    let nearest = null, nearestDistance = Infinity
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const group of cells.get((cx + dx) + ',' + (cy + dy)) ?? []) {
        distanceChecks++
        const distance = Math.hypot(entry.marker.x - group.seed.marker.x, entry.marker.y - group.seed.marker.y)
        if (distance <= radiusPx && (distance < nearestDistance
          || (distance === nearestDistance && compareKeys(group.seed.key, nearest.seed.key) < 0))) {
          nearest = group; nearestDistance = distance
        }
      }
    }
    if (!nearest) {
      nearest = { seed: entry, entries: [] }
      groups.push(nearest)
      const cellKey = cx + ',' + cy
      if (!cells.has(cellKey)) cells.set(cellKey, [])
      cells.get(cellKey).push(nearest)
    }
    nearest.entries.push(entry)
  }
  for (const group of groups) {
    if (group.entries.length === 1) {
      layout.singles.push(group.seed.marker)
      layout.items.push(group.seed.marker)
      continue
    }
    const rowMembers = new Map()
    for (const entry of group.entries) if (!rowMembers.has(entry.rowKey)) rowMembers.set(entry.rowKey, entry.marker.row)
    const anchor = group.seed.marker
    const cluster = {
      kind: 'cluster', id: 'display-cluster:' + group.seed.key,
      members: group.entries.map(entry => entry.marker),
      rowMembers: [...rowMembers.values()], rowCount: rowMembers.size,
      locationCount: group.entries.length, selected: group.entries.some(entry => entry.selected),
      x: anchor.x, y: anchor.y, anchor,
    }
    layout.clusters.push(cluster)
    layout.items.push(cluster)
  }
  layout.stats = {
    inputLocations: input.length, filteredLocations: filtered, duplicateLocations: duplicates,
    admittedLocations: ordered.length, admittedRows: new Set(ordered.map(entry => entry.rowKey)).size,
    singleCount: layout.singles.length, clusterCount: layout.clusters.length,
    displayCount: layout.items.length, distanceChecks, radiusPx,
  }
  return layout
}

/** Always pass the current renderer layout. A cluster ID identifies its seed;
 * membership may change with the viewport, time or dataset. Never inspect a
 * row cached when the cluster was opened. A changed/absent member returns null. */
export function resolveCurrentClusterMember(layout, clusterId, rowKey) {
  if (typeof clusterId !== 'string' || typeof rowKey !== 'string') return null
  const cluster = layout?.clusters?.find(item => item.id === clusterId)
  return cluster?.rowMembers?.find(row => projectionRowDisplayKey(row) === rowKey) ?? null
}
