import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDisplayPresentation, displayPresentationSignature, displayPresentationProbe,
  globeDisplayMarkers, applyGlobeDisplayPresentation,
} from '../src/lib/worldViewDisplayPresentation.js'
import { displayMarkerKey, projectionRowDisplayKey } from '../src/lib/worldViewDisplayClusters.js'
import { dispatchGlobeMarkerPick } from '../src/lib/worldViewMarkerLayout.js'

const viewport = { width: 800, height: 500, cameraHeightMeters: 100000 }
function projectionRow(id, extra = {}) {
  return Object.freeze({
    projection_contract_version: 'spatial_projection_v1', mip_object_id: id,
    revision_id: 'revision-' + id, subject_graph_node_id: 'node-' + id,
    precision_class: 'city', evidence_refs: Object.freeze([{ evidence_snapshot_id: 'evidence-' + id }]),
    display_geometry: Object.freeze({ type: 'Point', coordinates: Object.freeze([-81.7, 41.4]) }),
    ...extra,
  })
}
function marker(row, x = 100, y = 100, extra = {}) {
  const positionIndex = extra.positionIndex ?? 0
  return Object.freeze({
    id: displayMarkerKey(row, positionIndex), row,
    position: row.display_geometry.coordinates, positionIndex,
    label: 'Source location', x, y, visible: true, selected: false, ...extra,
  })
}
function globeFixture(markers, points = markers.map(() => Object.freeze({ x: 2, y: 0, z: 0 }))) {
  const screens = new Map(points.map((point, i) => [point, { x: markers[i].x, y: markers[i].y }]))
  const entities = markers.map((original, i) => {
    let labelShown = true
    const label = {
      text: { getValue: () => original.label }, font: { getValue: () => '12px sans-serif' },
    }
    Object.defineProperty(label, 'show', {
      enumerable: true, get: () => ({ getValue: () => labelShown }),
      set: next => { labelShown = Boolean(next) },
    })
    const entity = {
      id: original.id, __mipRow: original.row, __mipMarker: original,
      __mipSelected: Boolean(original.selected), show: true, label,
      position: Object.freeze({ getValue: () => points[i] }),
    }
    entity.rendererOwner = entity // Cyclic renderer objects must never cross the probe seam.
    return entity
  })
  const viewer = {
    isDestroyed: () => false, clock: { currentTime: Object.freeze({ tick: 1 }) },
    scene: {
      globe: { ellipsoid: { radii: Object.freeze({ x: 2, y: 2, z: 1 }) } },
      canvas: { clientWidth: viewport.width, clientHeight: viewport.height },
      pick: () => ({ id: entities[0] }),
    },
    camera: { positionWC: Object.freeze({ x: 4, y: 0, z: 0 }), positionCartographic: { height: 100000 } },
  }
  const C = { SceneTransforms: { worldToWindowCoordinates: (_scene, point) => screens.get(point) } }
  return { viewer, C, entities, points, screens }
}
function assertDetached(value, forbidden) {
  if (!value || typeof value !== 'object') return
  assert.ok(!forbidden.has(value), 'probe must contain no retained row, marker, edge or renderer object')
  for (const child of Object.values(value)) assertDetached(child, forbidden)
}

test('presentation retains originals while the serializable probe separates projection-row and location counts', () => {
  const positions = Object.freeze(Array.from({ length: 500 }, (_, i) => Object.freeze([i / 1000, 1])))
  const row = projectionRow('multipoint', {
    display_geometry: Object.freeze({ type: 'MultiPoint', coordinates: positions }),
  })
  const originals = Object.freeze(positions.map((position, positionIndex) =>
    marker(row, 100 + positionIndex % 3, 100 + positionIndex % 4, { position, positionIndex })))
  const before = JSON.stringify(originals)
  const state = createDisplayPresentation(originals, viewport)
  assert.equal(state.markers, originals)
  assert.equal(state.layout.clusters.length, 1); assert.equal(state.layout.singles.length, 0)
  assert.equal(state.layout.clusters[0].rowMembers[0], row)
  assert.ok(state.layout.clusters[0].members.every(m => originals.includes(m)))
  const probe = displayPresentationProbe(state, 'ellipsoid-globe', { layoutMs: 2 })
  assert.equal(probe.layout.clusters[0].rowCount, 1)
  assert.equal(probe.layout.clusters[0].locationCount, 500)
  assert.equal(probe.layout.stats.admittedRows, 1)
  assert.equal(probe.layout.stats.visibleCount, 500)
  assert.equal(probe.layout.stats.targetCount, 1)
  assert.equal(probe.layout.stats.labelCount, 0)
  assert.ok(probe.markers.every(m => m.eligible && !m.visible && !m.displayed))
  assertDetached(probe, new Set([...originals, row, positions, ...positions]))
  assert.doesNotThrow(() => JSON.stringify(probe))
  assert.equal(JSON.stringify(originals), before)
})

test('globe admission rechecks the current horizon before hidden far-side originals can join a cluster', () => {
  const originals = [marker(projectionRow('near')), marker(projectionRow('far'))]
  const points = [Object.freeze({ x: 2, y: 0, z: 0 }), Object.freeze({ x: -2, y: 0, z: 0 })]
  const fixture = globeFixture(originals, points)
  const admitted = globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities)
  assert.equal(admitted[0].visible, true); assert.equal(admitted[1].visible, false)
  assert.equal(admitted[0].row, originals[0].row); assert.equal(admitted[1].row, originals[1].row)
  const state = createDisplayPresentation(admitted, viewport)
  assert.equal(state.layout.clusters.length, 0)
  assert.equal(state.layout.singles[0], admitted[0])
  assert.equal(state.layout.stats.filteredLocations, 1)
  applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, state)
  assert.equal(fixture.entities[0].show, true); assert.equal(fixture.entities[1].show, false)
  assert.equal(fixture.entities[1].position.getValue(), points[1])
})

test('clustered globe symbols and labels are hidden without moving any original world position or selecting a member', () => {
  const originals = Array.from({ length: 6 }, (_, i) => marker(projectionRow(String(i)), 100 + i, 100))
  const fixture = globeFixture(originals), calls = []
  const state = createDisplayPresentation(globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities), viewport)
  assert.equal(state.layout.clusters.length, 1)
  assert.equal(applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, state), true)
  fixture.entities.forEach((entity, i) => {
    assert.equal(entity.show, false); assert.equal(entity.label.show.getValue(), false)
    assert.equal(entity.position.getValue(), fixture.points[i])
    assert.equal(entity.__mipRow, originals[i].row)
    assert.equal(entity.__mipMarker.position, originals[i].position)
  })
  assert.equal(dispatchGlobeMarkerPick(fixture.viewer, { x: 100, y: 100 }, row => calls.push(row)), false)
  assert.deepEqual(calls, [])
  assert.equal(applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, state), false)
})

test('singleton globe activation keeps Wave1 original-row picking semantics and rechecks stale visibility at pick time', () => {
  const original = marker(projectionRow('singleton'), 100, 100, { selected: true })
  const fixture = globeFixture([original]), measured = []
  const screen = globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities, (text, font) => {
    measured.push([text, font]); return { labelWidth: 80, labelHeight: 16 }
  })
  const state = createDisplayPresentation(screen, viewport)
  assert.equal(state.layout.singles[0].row, original.row)
  assert.deepEqual(measured, [[original.label, '12px sans-serif']])
  applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, state)
  assert.equal(fixture.entities[0].show, true); assert.equal(fixture.entities[0].label.show.getValue(), true)
  const calls = []
  assert.equal(dispatchGlobeMarkerPick(fixture.viewer, { x: 100, y: 100 }, row => calls.push(row)), true)
  assert.equal(calls[0], original.row)
  fixture.viewer.camera.positionWC = { x: -4, y: 0, z: 0 }
  assert.equal(dispatchGlobeMarkerPick(fixture.viewer, { x: 100, y: 100 }, row => calls.push(row)), false)
  assert.equal(calls.length, 1)
})

test('probe reports the exact drawn singleton, excluding hidden and offscreen wrapped copies sharing its stable ID', () => {
  const row = projectionRow('wrapped'), visible = marker(row, 400, 100)
  const hidden = marker(row, 400, 100, { visible: false }), offscreen = marker(row, -400, 100)
  const invalid = marker(projectionRow('invalid'), '100', 100)
  const state = createDisplayPresentation([hidden, offscreen, visible, invalid], viewport)
  assert.equal(state.layout.singles.length, 1); assert.equal(state.layout.singles[0], visible)
  const probe = displayPresentationProbe(state, 'maplibre-deck.gl')
  assert.deepEqual(probe.markers.map(m => m.visible), [false, false, true, false])
  assert.deepEqual(probe.markers.map(m => m.displayed), [false, false, true, false])
  assert.deepEqual(probe.markers.map(m => m.eligible), [false, false, true, false])
})

test('probe metadata is detached from retained rows, edges, marker arrays and cyclic Cesium objects', () => {
  const originals = [marker(projectionRow('a')), marker(projectionRow('b'), 105, 100)]
  const fixture = globeFixture(originals)
  const state = createDisplayPresentation(globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities), viewport)
  const before = displayPresentationSignature(state), beforeRows = JSON.stringify(originals.map(m => m.row))
  const probe = displayPresentationProbe(state, 'ellipsoid-globe', { layoutMs: 4 })
  assertDetached(probe, new Set([...originals, ...state.markers, ...originals.map(m => m.row), ...fixture.entities, ...fixture.points]))
  assert.doesNotThrow(() => JSON.stringify(probe))
  probe.layout.clusters[0].memberIds.push('probe-only')
  probe.layout.clusters[0].rowKeys[0] = 'probe-only'
  probe.layout.clusters[0].x = -999
  probe.layout.stats.admittedRows = 999
  probe.markers[0].x = -999
  probe.relationshipSummary.counts.unmapped = 999
  assert.equal(displayPresentationSignature(state), before)
  assert.equal(JSON.stringify(originals.map(m => m.row)), beforeRows)
  assert.equal(state.layout.clusters[0].members.length, 2)
})

test('same pose and membership retain the display signature and applying the same globe state causes no idle change', () => {
  const originals = [marker(projectionRow('a')), marker(projectionRow('b'), 105, 100)]
  const fixture = globeFixture(originals)
  const first = createDisplayPresentation(globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities), viewport)
  const signature = displayPresentationSignature(first)
  applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, first)
  const second = createDisplayPresentation(globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities), viewport)
  assert.equal(displayPresentationSignature(second), signature)
  assert.equal(applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, second), false)
  fixture.screens.set(fixture.points[0], { x: 110, y: 100 })
  const moved = createDisplayPresentation(globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities), viewport)
  assert.notEqual(displayPresentationSignature(moved), signature)
})

test('recorded relationship discovery keeps exact original edges and explicit suppression counts independently of label visibility', () => {
  const a = marker(projectionRow('a'), 100, 100), b = marker(projectionRow('b'), 600, 100)
  const hidden = marker(projectionRow('hidden'), 300, 300, { visible: false })
  const edges = Object.freeze([
    Object.freeze({ id: 'edge-display', source: 'node-a', target: 'node-b', type: 'sequence', claimed_by: 'source_document', label: 'Recorded sequence' }),
    Object.freeze({ id: 'edge-hidden', source: 'node-a', target: 'node-hidden', type: 'association' }),
    Object.freeze({ id: 'edge-unmapped', source: 'node-a', target: 'not-projected', type: 'association' }),
    Object.freeze({ id: 'edge-hypothesis', source: 'node-a', target: 'node-b', type: 'association', claimed_by: 'MIP_inferred' }),
  ])
  const state = createDisplayPresentation([a, b, hidden], { ...viewport, relationships: edges })
  assert.equal(state.relationshipSummary.total, 4)
  assert.equal(state.relationshipSummary.displayed, 1); assert.equal(state.relationshipSummary.hidden, 3)
  assert.equal(state.relationshipSummary.counts.hiddenEndpoints, 1)
  assert.equal(state.relationshipSummary.counts.unmapped, 1); assert.equal(state.relationshipSummary.counts.hypothesis, 1)
  assert.equal(state.relationshipSummary.lines[0].edge, edges[0])
  assert.equal(state.relationshipSummary.lines[0].sourceMarker, a)
  state.relationshipSummary.dispositions.forEach((disposition, i) => assert.equal(disposition.edge, edges[i]))
  assert.deepEqual([...state.relationshipLabels], [0])
  const probe = displayPresentationProbe(state, 'atlas-fallback')
  assert.equal(probe.relationshipSummary.total, 4)
  assert.equal(probe.relationshipSummary.temporalValidity, 'not_supplied_by_graph_reader')
  assertDetached(probe, new Set([...edges, a, b, hidden, a.row, b.row, hidden.row]))
  const high = createDisplayPresentation([a, b, hidden], { ...viewport, cameraHeightMeters: 12000000, relationships: edges })
  assert.equal(high.relationshipLabels.size, 0)
  assert.equal(high.relationshipSummary.total, 4)
  assert.equal(high.relationshipSummary.lines[0].edge, edges[0])
})

test('empty, destroyed and unavailable globe inputs return honest empty state and detached zero probes', () => {
  const empty = createDisplayPresentation([], viewport)
  assert.equal(empty.layout.items.length, 0)
  const probe = displayPresentationProbe(empty, 'atlas-fallback')
  assert.equal(probe.layout.stats.targetCount, 0); assert.equal(probe.relationshipSummary.total, 0)
  assert.deepEqual(globeDisplayMarkers(null, null, []), [])
  assert.equal(applyGlobeDisplayPresentation(null, [], empty), false)
  const fixture = globeFixture([marker(projectionRow('a'))])
  fixture.viewer.isDestroyed = () => true
  assert.deepEqual(globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities), [])
  assert.equal(applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, empty), false)
  const missing = displayPresentationProbe(null, 'ellipsoid-globe')
  assert.equal(missing.layout.stats.targetCount, 0); assert.equal(missing.selectedRowKey, null)
})

test('canonical display marker identity works with legacy Cesium entity IDs while original-row picking remains valid', () => {
  const original = marker(projectionRow('legacy-entity'), 100, 100, { selected: true })
  const fixture = globeFixture([original])
  fixture.entities[0].id = 'legacy-cesium-entity-0'
  const screenMarkers = globeDisplayMarkers(fixture.C, fixture.viewer, fixture.entities)
  assert.equal(screenMarkers[0].id, original.id)
  const state = createDisplayPresentation(screenMarkers, viewport)
  fixture.entities[0].show = false
  fixture.entities[0].label.show = false
  assert.equal(applyGlobeDisplayPresentation(fixture.viewer, fixture.entities, state), true)
  assert.equal(fixture.entities[0].show, true)
  assert.equal(fixture.entities[0].label.show.getValue(), true)
  assert.equal(fixture.entities[0].id, 'legacy-cesium-entity-0')
  const calls = []
  assert.equal(dispatchGlobeMarkerPick(fixture.viewer, { x: 100, y: 100 }, row => calls.push(row)), true)
  assert.equal(calls[0], original.row)
})

test('cluster hit boxes reserve label space while suppressed relationship text retains its original inspectable edge', () => {
  const groups = [marker(projectionRow('cluster-a'), 300, 200), marker(projectionRow('cluster-b'), 305, 200)]
  const overlapsBadge = marker(projectionRow('over-label'), 210, 180, {
    labelWidth: 60, labelHeight: 16, selected: true,
  })
  const endpoints = [
    marker(projectionRow('left'), 100, 200, { labelWidth: 80, labelHeight: 16 }),
    marker(projectionRow('right'), 500, 200, { labelWidth: 80, labelHeight: 16 }),
    marker(projectionRow('outside-left'), 100, 350, { labelWidth: 80, labelHeight: 16 }),
    marker(projectionRow('outside-right'), 500, 350, { labelWidth: 80, labelHeight: 16 }),
  ]
  const edges = [
    Object.freeze({ id: 'over-badge', source: 'node-left', target: 'node-right', type: 'sequence' }),
    Object.freeze({ id: 'outside-badge', source: 'node-outside-left', target: 'node-outside-right', type: 'sequence' }),
  ]
  const settings = { ...viewport, radiusPx: 64, relationships: edges }
  const control = createDisplayPresentation([overlapsBadge, ...endpoints], settings)
  assert.ok(control.labels.has(overlapsBadge.id), 'selected singleton text fits before reserving the badge')
  assert.ok(control.relationshipLabels.has(0), 'fixture relationship text fits before reserving the badge')
  const state = createDisplayPresentation([...groups, overlapsBadge, ...endpoints], settings)
  assert.equal(state.layout.clusters.length, 1)
  assert.ok(state.layout.singles.includes(overlapsBadge), 'only the label is suppressed; the original location stays drawn')
  assert.equal(state.labels.has(overlapsBadge.id), false, 'selected text cannot cover a 44px cluster hit box')
  assert.ok(state.labels.has(endpoints[2].id), 'an unrelated label outside the badge stays visible')
  assert.equal(state.relationshipLabels.has(0), false)
  assert.equal(state.relationshipLabels.has(1), true)
  assert.equal(state.relationshipSummary.total, 2); assert.equal(state.relationshipSummary.displayed, 2)
  assert.equal(state.relationshipSummary.lines.find(line => line.edgeIndex === 0).edge, edges[0])
  assert.equal(state.relationshipSummary.dispositions[0].edge, edges[0])
  assert.equal(state.relationshipSummary.dispositions[0].displayed, true)
})

test('wrapped copies count one canonical relationship endpoint and one eligible probe location, retaining hidden-endpoint discovery', () => {
  const sourceRow = projectionRow('wrapped-source'), targetRow = projectionRow('wrapped-target')
  const fartherCopy = marker(sourceRow, 100, 100), admittedCopy = marker(sourceRow, 400, 100)
  const hiddenCopy = marker(sourceRow, 400, 100, { visible: false })
  const offscreenCopy = marker(sourceRow, -400, 100)
  const target = marker(targetRow, 700, 100)
  const hiddenRow = projectionRow('hidden-endpoint')
  const hiddenEndpoints = [marker(hiddenRow, 200, 200, { visible: false }), marker(hiddenRow, 400, 200, { visible: false })]
  const edges = [
    Object.freeze({ id: 'recorded-line', source: 'node-wrapped-source', target: 'node-wrapped-target', type: 'sequence' }),
    Object.freeze({ id: 'recorded-hidden', source: 'node-wrapped-source', target: 'node-hidden-endpoint', type: 'association' }),
  ]
  const originals = [hiddenCopy, fartherCopy, offscreenCopy, admittedCopy, target, ...hiddenEndpoints]
  const state = createDisplayPresentation(originals, { ...viewport, relationships: edges })
  const line = state.relationshipSummary.lines[0]
  assert.equal(line.edge, edges[0])
  assert.equal(line.sourceMarker, admittedCopy); assert.equal(line.targetMarker, target)
  assert.deepEqual(line.endpointCounts, { source: 1, target: 1, visibleSource: 1, visibleTarget: 1 })
  assert.equal(state.relationshipSummary.total, 2); assert.equal(state.relationshipSummary.displayed, 1)
  assert.equal(state.relationshipSummary.counts.hiddenEndpoints, 1)
  assert.equal(state.relationshipSummary.dispositions[1].edge, edges[1])
  assert.equal(state.relationshipSummary.dispositions[1].endpointCounts.target, 1)
  const probe = displayPresentationProbe(state, 'maplibre-deck.gl')
  assert.equal(probe.layout.stats.visibleCount, 2)
  assert.equal(probe.markers.filter(m => m.eligible).length, 2)
  assert.equal(probe.markers.filter(m => m.displayed).length, 2)
  assert.deepEqual(probe.markers.map(m => m.eligible), [false, false, false, true, true, false, false])
  assert.equal(state.layout.singles[0], admittedCopy)
  const reversed = createDisplayPresentation([...originals].reverse(), { ...viewport, relationships: edges })
  assert.equal(reversed.relationshipSummary.lines[0].sourceMarker, admittedCopy)
  assert.deepEqual(reversed.relationshipSummary.lines[0].endpointCounts, line.endpointCounts)
})

test('a selected relationship label cannot cover an unselected singleton label that remains drawn', () => {
  const left = marker(projectionRow('priority-left'), 100, 100, { labelWidth: 80, labelHeight: 16 })
  const right = marker(projectionRow('priority-right'), 600, 100, { labelWidth: 80, labelHeight: 16 })
  const middle = marker(projectionRow('priority-middle'), 240, 100, { labelWidth: 120, labelHeight: 16 })
  const edge = Object.freeze({
    id: 'selected-edge', source: 'node-priority-left', target: 'node-priority-right',
    type: 'sequence', claimed_by: 'source_document',
  })
  const settings = { ...viewport, relationships: [edge], selectedKeys: new Set(['node-priority-left']) }
  const control = createDisplayPresentation([left, right], settings)
  assert.equal(control.relationshipLabels.has(0), true, 'centered edge text fits without the third marker label')
  const state = createDisplayPresentation([left, right, middle], settings)
  assert.equal(state.layout.clusters.length, 0)
  assert.equal(middle.selected, false)
  assert.ok(state.layout.singles.includes(middle))
  assert.equal(state.labels.has(middle.id), true)
  assert.equal(state.relationshipSummary.lines[0].selected, true)
  assert.equal(state.relationshipLabels.has(0), false, 'selected edge text must respect all actually drawn marker labels')
  assert.equal(state.relationshipSummary.lines[0].edge, edge)
  assert.equal(state.relationshipSummary.dispositions[0].edge, edge)
  assert.equal(state.relationshipSummary.displayed, 1)
  const withoutEdge = createDisplayPresentation([left, right, middle], viewport)
  assert.deepEqual([...state.labels], [...withoutEdge.labels])
})
