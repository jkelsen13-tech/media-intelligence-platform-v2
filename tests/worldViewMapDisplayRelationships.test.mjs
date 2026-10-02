import test from 'node:test'
import assert from 'node:assert/strict'
import { createMapMarkerLabelLayout, requestRepaint } from '../src/lib/worldViewRendererAdapter.js'
import { displayPresentationSignature } from '../src/lib/worldViewDisplayPresentation.js'

function feature(id, x, y) {
  const position = Object.freeze([x, y])
  const row = Object.freeze({
    projection_contract_version: 'spatial_projection_v1', mip_object_id: id,
    subject_graph_node_id: 'node-' + id, revision_id: 'revision-' + id,
    precision_class: 'city',
  })
  return Object.freeze({ row, positions: Object.freeze([position]), selected: false, label: 'Recorded location' })
}
function relationship(extra = {}) {
  return Object.freeze({
    id: 'same-reader-edge', source: 'node-a', target: 'node-b',
    type: 'sequence', label: 'Recorded sequence', claimed_by: 'source_document', ...extra,
  })
}
function harness(initialEdges = []) {
  const listeners = new Map(), publications = [], projections = [], cameraWrites = []
  let edges = initialEdges, cancelled = false, changes = 0, repaints = 0, reads = 0, clock = 0
  const map = {
    getCanvas: () => ({ clientWidth: 800, clientHeight: 500 }),
    getZoom: () => 8, getCenter: () => ({ lng: 0, lat: 0 }),
    project(position) { projections.push(position); return { x: position[0], y: position[1] } },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(listener)
    },
    off(event, listener) { listeners.get(event)?.delete(listener) },
    triggerRepaint() { repaints++ },
  }
  for (const method of ['flyTo', 'jumpTo', 'easeTo', 'stop', 'setZoom', 'setCenter']) {
    map[method] = () => { cameraWrites.push(method); throw new Error('Relationship publication must not alter the camera') }
  }
  const layout = createMapMarkerLabelLayout(map, {
    displayClustering: true, isCancelled: () => cancelled,
    getRelationships: () => { reads++; return edges },
    getSelectedKeys: () => new Set(), now: () => ++clock,
    createContext: () => ({
      font: '', measureText: () => ({ width: 32, actualBoundingBoxAscent: 48, actualBoundingBoxDescent: 16 }),
    }),
    onDisplayLayout: state => publications.push(state),
    onChange: () => { changes++; requestRepaint(map) },
  })
  return {
    map, layout, listeners, publications, projections, cameraWrites,
    setEdges(next) { edges = next }, cancel() { cancelled = true },
    emit(event) { for (const listener of listeners.get(event) ?? []) listener({ type: event }) },
    counts: () => ({ changes, repaints, reads, projections: projections.length }),
  }
}

test('explicit relationship refresh publishes the current original edge when identity, type, label and coordinates stay unchanged', () => {
  const oldMetadata = Object.freeze({ evidence_snapshot_id: 'evidence-before', provenance: 'reader-before' })
  const oldEdge = relationship({ metadata: oldMetadata })
  const newMetadata = Object.freeze({ evidence_snapshot_id: 'evidence-after', provenance: 'reader-after' })
  const newEdge = relationship({ metadata: newMetadata })
  const originals = Object.freeze([feature('a', 100, 100), feature('b', 600, 100)])
  const before = JSON.stringify(originals), h = harness([oldEdge])
  h.layout.setFeatures(originals, new Set())
  assert.equal(h.publications.length, 1)
  const first = h.publications[0], signature = displayPresentationSignature(first)
  assert.equal(first.relationshipSummary.lines[0].edge, oldEdge)
  assert.equal(first.relationshipSummary.lines[0].edge.metadata, oldMetadata)
  assert.equal(h.counts().repaints, 0, 'feature caller already owns initial layer publication')
  h.setEdges([newEdge])
  assert.equal(h.layout.refreshRelationships(), true)
  assert.equal(h.publications.length, 2)
  const current = h.publications[1]
  assert.equal(displayPresentationSignature(current), signature, 'metadata-only refresh is invisible to the display signature')
  assert.equal(current.relationshipSummary.lines[0].edge, newEdge)
  assert.equal(current.relationshipSummary.dispositions[0].edge, newEdge)
  assert.equal(current.relationshipSummary.lines[0].edge.metadata, newMetadata)
  assert.equal(first.relationshipSummary.lines[0].edge, oldEdge, 'previous reader snapshot remains untouched')
  assert.equal(h.counts().changes, 1); assert.equal(h.counts().repaints, 1)
  for (const original of originals) {
    const retained = h.layout.getLayerData().pointData.find(point => point.row === original.row)
    assert.ok(retained)
    assert.equal(retained.row, original.row); assert.equal(retained.position, original.positions[0])
  }
  h.emit('render'); h.emit('render'); h.emit('move')
  assert.equal(h.publications.length, 2)
  assert.equal(h.counts().repaints, 1, 'same-pose renders do not start an idle repaint loop')
  assert.deepEqual(h.cameraWrites, [])
  for (const method of ['setTerrain', 'queryTerrainElevation', 'addSource', 'setStyle']) assert.equal(h.map[method], undefined)
  assert.equal(JSON.stringify(originals), before)
  h.layout.destroy()
})

test('metadata-only refresh preserves current original suppressed edges for honest relationship discovery', () => {
  const oldEdge = relationship({ target: 'not-projected', metadata: Object.freeze({ evidence_snapshot_id: 'before' }) })
  const currentEdge = relationship({ target: 'not-projected', metadata: Object.freeze({ evidence_snapshot_id: 'after' }) })
  const h = harness([oldEdge])
  h.layout.setFeatures([feature('a', 100, 100)], new Set())
  const initial = h.publications[0]
  assert.equal(initial.relationshipSummary.lines.length, 0)
  assert.equal(initial.relationshipSummary.dispositions[0].reason, 'unmapped')
  h.setEdges([currentEdge])
  assert.equal(h.layout.refreshRelationships(), true)
  const current = h.publications[1]
  assert.equal(displayPresentationSignature(current), displayPresentationSignature(initial))
  assert.equal(current.relationshipSummary.dispositions[0].edge, currentEdge)
  assert.equal(current.relationshipSummary.counts.unmapped, 1)
  assert.equal(current.relationshipSummary.total, 1); assert.equal(current.relationshipSummary.hidden, 1)
  assert.equal(initial.relationshipSummary.dispositions[0].edge, oldEdge)
  h.emit('render')
  assert.equal(h.publications.length, 2); assert.equal(h.counts().repaints, 1)
  assert.deepEqual(h.cameraWrites, [])
  h.layout.destroy()
})

test('destroyed and cancelled relationship refreshes reject publication, repaint and stale event callbacks', () => {
  for (const mode of ['destroyed', 'cancelled']) {
    const oldEdge = relationship({ metadata: Object.freeze({ evidence_snapshot_id: 'before' }) })
    const h = harness([oldEdge])
    h.layout.setFeatures([feature('a', 100, 100), feature('b', 600, 100)], new Set())
    const staleRender = [...h.listeners.get('render')][0]
    h.setEdges([relationship({ metadata: Object.freeze({ evidence_snapshot_id: 'after' }) })])
    const before = h.counts()
    if (mode === 'destroyed') h.layout.destroy()
    else h.cancel()
    assert.equal(h.layout.refreshRelationships(), false)
    staleRender()
    h.emit('render'); h.emit('move'); h.emit('resize')
    assert.equal(h.publications.length, 1)
    assert.deepEqual(h.counts(), before)
    assert.deepEqual(h.cameraWrites, [])
    if (mode === 'destroyed') {
      assert.equal([...h.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0)
      assert.equal(h.layout.getDisplayLayout(), null)
    }
    h.layout.destroy()
  }
})


test('map current grouping suppresses same-badge edges and restores exact paths after display regrouping without camera writes', () => {
  const edge = relationship(), h = harness([edge])
  const close = Object.freeze([feature('a', 100, 100), feature('b', 130, 100)])
  const before = JSON.stringify(close)
  h.layout.setFeatures(close, new Set())
  const grouped = h.publications.at(-1)
  assert.equal(grouped.layout.clusters.length, 1)
  assert.equal(grouped.relationshipSummary.displayed, 0)
  assert.equal(grouped.relationshipSummary.dispositions[0].reason, 'groupedEndpoints')
  assert.equal(grouped.relationshipSummary.dispositions[0].edge, edge)
  const firstPass = h.counts()
  h.emit('render'); h.emit('resize')
  assert.equal(h.counts().repaints, firstPass.repaints, 'stable grouped state must not start a repaint loop')
  const separated = Object.freeze([close[0], Object.freeze({ ...close[1], positions: Object.freeze([Object.freeze([600, 100])]) })])
  h.layout.setFeatures(separated, new Set())
  const current = h.publications.at(-1), line = current.relationshipSummary.lines[0]
  assert.equal(current.relationshipSummary.counts.groupedEndpoints, 0)
  assert.equal(line.edge, edge); assert.equal(line.sourceMarker.row, close[0].row); assert.equal(line.targetMarker.row, close[1].row)
  assert.equal('displayGroupId' in line.sourceMarker, false); assert.equal('displayGroupId' in line.targetMarker, false)
  assert.deepEqual([line.x1, line.y1, line.x2, line.y2], [100, 100, 600, 100])
  assert.notEqual(displayPresentationSignature(current), displayPresentationSignature(grouped))
  assert.equal(JSON.stringify(close), before); assert.deepEqual(h.cameraWrites, [])
  h.layout.destroy()
})
