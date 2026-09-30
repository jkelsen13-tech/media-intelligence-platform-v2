import test from 'node:test'
import assert from 'node:assert/strict'
import {
  displayMarkerKey, layoutDisplayClusters, projectionRowDisplayKey, resolveCurrentClusterMember,
} from '../src/lib/worldViewDisplayClusters.js'

const options = { width: 1000, height: 700 }
function row(id, extra = {}) {
  const position = Object.freeze([-81.7, 41.4])
  return Object.freeze({
    projection_contract_version: 'spatial_projection_v1', mip_object_id: id,
    revision_id: 'revision-' + id, precision_class: 'city',
    display_geometry: Object.freeze({ type: 'Point', coordinates: position }), ...extra,
  })
}
function marker(originalRow, x = 100, y = 100, extra = {}) {
  const positionIndex = extra.positionIndex ?? 0
  return Object.freeze({
    id: displayMarkerKey(originalRow, positionIndex), row: originalRow,
    position: originalRow.display_geometry.coordinates, positionIndex,
    x, y, visible: true, selected: false, ...extra,
  })
}
function signature(layout) {
  return layout.items.map(item => item.kind === 'cluster'
    ? [item.id, item.members.map(member => displayMarkerKey(member.row, member.positionIndex)),
      item.rowCount, item.locationCount, item.selected, item.x, item.y]
    : [displayMarkerKey(item.row, item.positionIndex), item.x, item.y])
}

test('row and geometry-location keys encode object/version identity without input-order or delimiter collisions', () => {
  const a = row('a'), same = { ...a }, next = { ...a, revision_id: 'next' }
  assert.equal(projectionRowDisplayKey(a), projectionRowDisplayKey(same))
  assert.notEqual(projectionRowDisplayKey(a), projectionRowDisplayKey(next))
  assert.notEqual(displayMarkerKey(a, 0), displayMarkerKey(a, 1))
  assert.notEqual(projectionRowDisplayKey(row('a:b', { revision_id: 'c' })),
    projectionRowDisplayKey(row('a', { revision_id: 'b:c' })))
  assert.equal(projectionRowDisplayKey({ revision_id: 'unknown' }), null)
  for (const index of [-1, NaN, 0.5, '0']) assert.equal(displayMarkerKey(a, index), null)
  const legacy = { mip_object_id: 'legacy', display_geometry: { coordinates: [1, 2], type: 'Point' } }
  const reordered = { display_geometry: { type: 'Point', coordinates: [1, 2] }, mip_object_id: 'legacy' }
  assert.equal(projectionRowDisplayKey(legacy), projectionRowDisplayKey(reordered))
  assert.notEqual(projectionRowDisplayKey(legacy), projectionRowDisplayKey({ ...legacy, precision_class: 'region' }))
  const cyclic = { mip_object_id: 'legacy' }; cyclic.self = cyclic
  assert.equal(projectionRowDisplayKey(cyclic), null)
})

test('500 independent rows at the same display point become one cluster retaining every original reference', () => {
  const originals = Array.from({ length: 500 }, (_, i) => marker(row(String(i).padStart(4, '0'))))
  const before = JSON.stringify(originals)
  const layout = layoutDisplayClusters(Object.freeze(originals), options)
  assert.equal(layout.singles.length, 0); assert.equal(layout.clusters.length, 1)
  const cluster = layout.clusters[0]
  assert.equal(cluster.rowCount, 500); assert.equal(cluster.locationCount, 500)
  assert.equal(cluster.members.length, 500); assert.equal(cluster.rowMembers.length, 500)
  assert.ok(cluster.members.every(member => originals.includes(member)))
  assert.ok(cluster.rowMembers.every(original => originals.some(member => member.row === original)))
  assert.equal(cluster.anchor, originals[0]); assert.equal(cluster.x, cluster.anchor.x)
  assert.equal(cluster.y, cluster.anchor.y); assert.equal(layout.items[0], cluster)
  assert.equal(JSON.stringify(originals), before)
  assert.equal(layout.stats.admittedRows, 500); assert.equal(layout.stats.admittedLocations, 500)
  assert.ok(layout.stats.distanceChecks <= 500)
})

test('one MultiPoint projection row reports one row and many geometry locations without coordinate mutation', () => {
  const positions = Object.freeze(Array.from({ length: 500 }, (_, i) => Object.freeze([i / 1000, 1])))
  const original = row('many-positions', { display_geometry: Object.freeze({ type: 'MultiPoint', coordinates: positions }) })
  const points = Object.freeze(positions.map((position, positionIndex) =>
    marker(original, 100 + positionIndex % 3, 100 + positionIndex % 4, { positionIndex, position })))
  const before = JSON.stringify(original)
  const cluster = layoutDisplayClusters(points, options).clusters[0]
  assert.equal(cluster.rowCount, 1); assert.equal(cluster.locationCount, 500)
  assert.equal(cluster.rowMembers[0], original)
  assert.ok(cluster.members.every(member => member.position === positions[member.positionIndex]))
  assert.equal(JSON.stringify(original), before)
})

test('sparse points stay exact singleton markers and different rows sharing coordinates are never deduplicated', () => {
  const a = marker(row('a'), 100, 100), b = marker(row('b'), 200, 100)
  const layout = layoutDisplayClusters([b, a], options)
  assert.equal(layout.singles[0], a); assert.equal(layout.singles[1], b)
  assert.equal(layout.items[0], a); assert.equal(layout.items[1], b)
  const shared = layoutDisplayClusters([a, marker(row('other'), 100, 100)], options).clusters[0]
  assert.equal(shared.rowCount, 2); assert.equal(shared.locationCount, 2)
})

test('wrapped screen copies deduplicate by canonical row/index and choose the viewport-nearest admitted copy deterministically', () => {
  const original = row('a'), left = marker(original, 5, 100), middle = marker(original, 505, 100)
  const right = marker(original, 995, 100), hidden = marker(original, 500, 100, { visible: false })
  const other = marker(row('b'), 505, 100)
  const input = [right, hidden, left, other, middle]
  const layout = layoutDisplayClusters(input, options)
  assert.equal(layout.clusters[0].members[0], middle)
  assert.equal(layout.clusters[0].rowCount, 2); assert.equal(layout.clusters[0].locationCount, 2)
  assert.equal(layout.stats.duplicateLocations, 2); assert.equal(layout.stats.filteredLocations, 1)
  assert.deepEqual(signature(layout), signature(layoutDisplayClusters([...input].reverse(), options)))
})

test('hidden, far-side, offscreen, malformed and identityless markers are filtered before grouping', () => {
  const a = row('a')
  const invalid = [
    marker(a, 100, 100, { visible: false }), marker(row('far-side'), 101, 100, { visible: false }),
    marker(row('west'), -1, 100), marker(row('east'), 1001, 100),
    marker(row('north'), 100, -1), marker(row('south'), 100, 701),
    marker(row('nan'), NaN, 100), marker(row('infinite'), 100, Infinity),
    marker(Object.freeze({ display_geometry: a.display_geometry })),
    marker(row('bad-index'), 100, 100, { positionIndex: -1 }),
  ]
  const admitted = marker(row('edge'), 0, 0)
  const layout = layoutDisplayClusters([...invalid, admitted], options)
  assert.equal(layout.singles[0], admitted); assert.equal(layout.stats.filteredLocations, invalid.length)
  assert.equal(layout.stats.admittedLocations, 1); assert.equal(layout.stats.duplicateLocations, 0)
})

test('selection emphasizes a cluster while preserving grouping, membership and display anchor', () => {
  const a = marker(row('a')), b = marker(row('b'), 101, 100), c = marker(row('c'), 102, 100)
  const original = layoutDisplayClusters([a, b, c], options).clusters[0]
  const selected = { ...b, selected: true }
  const next = layoutDisplayClusters([a, selected, c], options).clusters[0]
  assert.equal(next.selected, true); assert.equal(next.anchor, a); assert.equal(next.id, original.id)
  assert.deepEqual(next.members.map(m => m.id), original.members.map(m => m.id))
  assert.equal(next.members[1], selected)
})

test('arbitrary input permutations preserve groups, anchor choices and member order', () => {
  const points = Array.from({ length: 1200 }, (_, i) =>
    marker(row(String(i).padStart(5, '0')), (i * 97) % 990, (i * 41) % 690, { selected: i % 211 === 0 }))
  const expected = signature(layoutDisplayClusters(points, options))
  const shuffled = [...points].sort((a, b) => ((Number(a.row.mip_object_id) * 997) % 1201) - ((Number(b.row.mip_object_id) * 997) % 1201))
  assert.deepEqual(signature(layoutDisplayClusters([...points].reverse(), options)), expected)
  assert.deepEqual(signature(layoutDisplayClusters(shuffled, options)), expected)
})

test('nearby chains cannot transitively collect locations outside the seed radius', () => {
  const points = Array.from({ length: 15 }, (_, i) => marker(row(String(i).padStart(3, '0')), 20 + i * 25, 100))
  const layout = layoutDisplayClusters(points, { ...options, radiusPx: 36 })
  assert.ok(layout.items.length > 1)
  for (const cluster of layout.clusters) for (const member of cluster.members) {
    assert.ok(Math.hypot(member.x - cluster.anchor.x, member.y - cluster.anchor.y) <= 36)
  }
  assert.equal(layout.clusters[0].locationCount, 2)
  const exact = layoutDisplayClusters([marker(row('a'), 100, 100), marker(row('b'), 136, 100)], options)
  assert.equal(exact.clusters.length, 1, 'radius boundary is inclusive')
})

test('nearest-seed ties resolve by canonical seed identity', () => {
  const a = marker(row('a'), 100, 100), b = marker(row('b'), 160, 100), c = marker(row('c'), 130, 100)
  const layout = layoutDisplayClusters([c, b, a], options)
  assert.equal(layout.clusters[0].anchor, a)
  assert.equal(layout.clusters[0].members[1], c)
  assert.equal(layout.singles[0], b)
})

test('current-layout member resolution rejects removed, hidden and changed versions after viewport/time/dataset updates', () => {
  const a = marker(row('a')), b = marker(row('b'), 101, 100)
  const first = layoutDisplayClusters([a, b], options), id = first.clusters[0].id, key = projectionRowDisplayKey(b.row)
  assert.equal(resolveCurrentClusterMember(first, id, key), b.row)
  for (const current of [
    layoutDisplayClusters([], options), layoutDisplayClusters([a], options),
    layoutDisplayClusters([a, { ...b, visible: false }], options),
    layoutDisplayClusters([a, { ...b, x: 1001 }], options),
    layoutDisplayClusters([a, marker({ ...b.row, revision_id: 'new-version' }, 101, 100)], options),
  ]) assert.equal(resolveCurrentClusterMember(current, id, key), null)
  const replacementRow = { ...b.row }, replacement = marker(replacementRow, 101, 100)
  assert.equal(resolveCurrentClusterMember(layoutDisplayClusters([a, replacement], options), id, key), replacementRow,
    'same version after refresh resolves the current original row reference')
  assert.equal(resolveCurrentClusterMember(first, 'missing', key), null)
  assert.equal(resolveCurrentClusterMember(first, id, null), null)
})

test('spatial hash bounds candidate checks for sparse and dense populations instead of pairwise scans', () => {
  const sparse = Array.from({ length: 10000 }, (_, i) => marker(row(String(i).padStart(5, '0')),
    (i % 100) * 100 + 10, Math.floor(i / 100) * 100 + 10))
  const sparseLayout = layoutDisplayClusters(sparse, { width: 10000, height: 10000 })
  assert.equal(sparseLayout.singles.length, sparse.length)
  assert.ok(sparseLayout.stats.distanceChecks <= sparse.length * 8)
  const dense = sparse.map(m => ({ ...m, x: 100, y: 100 }))
  const denseLayout = layoutDisplayClusters(dense, options)
  assert.equal(denseLayout.clusters[0].rowCount, dense.length)
  assert.equal(denseLayout.stats.distanceChecks, dense.length - 1)
  const mixed = layoutDisplayClusters(sparse.map((m, i) => ({ ...m, x: i % 1000, y: (i * 73) % 700 })), options)
  assert.ok(mixed.stats.distanceChecks < sparse.length * 30)
})

test('invalid viewports/radii fail closed and empty input has honest zero counts', () => {
  const points = [marker(row('a'))]
  for (const invalid of [
    { width: 0, height: 700 }, { width: NaN, height: 700 }, { width: 1000, height: Infinity },
    { ...options, radiusPx: 0 }, { ...options, radiusPx: -1 }, { ...options, radiusPx: NaN },
    { ...options, radiusPx: Number.MIN_VALUE },
  ]) {
    const layout = layoutDisplayClusters(points, invalid)
    assert.equal(layout.items.length, 0); assert.equal(layout.stats.filteredLocations, 1)
  }
  const empty = layoutDisplayClusters([], options)
  assert.equal(empty.stats.admittedRows, 0); assert.equal(empty.stats.displayCount, 0)
  assert.equal(empty.stats.radiusPx, 36)
})
