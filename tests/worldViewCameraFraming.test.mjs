import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCameraFraming, selectedCameraTarget } from '../src/lib/worldViewCameraFraming.js'
import { createWorldViewRendererAdapter, flyToSubject } from '../src/lib/worldViewRendererAdapter.js'
import { mapRowsForSelection } from '../src/lib/spatialProjection.js'
import { maxZoomForPrecisionClass } from '../src/lib/worldViewMapStack.js'

const feature = (id, coordinate = [-81.7, 41.4], precision = 'city') => ({
  selected: true, positions: [coordinate], row: { mip_object_id: id, precision_class: precision },
})

test('ordinary refresh preserves manual camera position; changed subject, location or precision reframes', () => {
  const framing = createCameraFraming()
  const calls = []
  const adapter = { flyToSubjectCamera: (args) => { calls.push(args); return true } }
  framing.select([feature('a')])
  assert.equal(framing.apply(adapter), true)
  framing.select([feature('a')])
  assert.equal(framing.apply(adapter), false)
  framing.select([feature('b')])
  assert.equal(framing.apply(adapter), true, 'identity change matters even at same coordinates')
  framing.select([feature('b', [10, 20])])
  assert.equal(framing.apply(adapter), true)
  framing.select([feature('b', [10, 20], 'country')])
  assert.equal(framing.apply(adapter), true)
  assert.equal(calls.length, 4)
  assert.equal(calls.at(-1).nextPrecisionClass, 'country')
  assert.equal(framing.apply(adapter, { force: true }), true, 'explicit Return overrides refresh suppression')
  framing.resetRenderer()
  assert.equal(framing.apply(adapter), true, 'replacement renderer needs framing')
})

test('missing or unrelated geometry never becomes a camera target', () => {
  assert.equal(selectedCameraTarget([{ ...feature('other'), selected: false }]), null)
  assert.equal(selectedCameraTarget([feature('bad', [NaN, 0])]), null)
  const framing = createCameraFraming()
  let calls = 0
  const adapter = { flyToSubjectCamera: () => { calls++; return true }, cancelCameraFlight: () => true }
  framing.select([feature('a')])
  framing.apply(adapter)
  framing.select([])
  assert.equal(framing.apply(adapter, { force: true }), false)
  framing.select([feature('a')])
  framing.apply(adapter)
  assert.equal(calls, 2)
})

for (const stackId of ['ellipsoid-globe', 'openfreemap-positron']) {
  test(`${stackId}: latest subject frames after startup; obsolete subject is never flown to`, async () => {
    let ready
    const startup = new Promise((resolve) => { ready = resolve })
    const calls = []
    const factory = () => ({ mount: () => startup, flyToSubjectCamera: (args) => { calls.push(args); return true } })
    const adapter = createWorldViewRendererAdapter({ stackId }, {
      loadGlobeAdapter: async () => ({ createCesiumEllipsoidRendererAdapter: factory }),
      createMapAdapter: factory,
    })
    const framing = createCameraFraming()
    const mounting = adapter.mount()
    framing.select([feature('old')])
    assert.equal(framing.apply(adapter), false)
    framing.select([feature('new', [10, 20])])
    await Promise.resolve()
    assert.equal(framing.apply(adapter), false)
    ready()
    await mounting
    framing.apply(adapter)
    assert.deepEqual(calls, [{ nextCoordinate: [10, 20], nextPrecisionClass: 'city' }])
    adapter.destroy()
    assert.equal(framing.apply(adapter, { force: true }), false)
  })
}

test('selection cleared during loading cancels pending camera framing', () => {
  const framing = createCameraFraming()
  framing.select([feature('old')])
  framing.apply({ flyToSubjectCamera: () => false })
  framing.select([])
  assert.equal(framing.apply({ flyToSubjectCamera: () => { throw Error('unexpected camera move') } }), false)
})

test('MapLibre zoom limit follows the selected location precision before flying', () => {
  const calls = []
  const map = { setMaxZoom: (limit) => calls.push(['limit', limit]), flyTo: (args) => calls.push(['fly', args]) }
  for (const precision of ['city', 'country']) {
    assert.equal(flyToSubject(map, [-81.7, 41.4], precision), true)
    assert.deepEqual(calls.at(-2), ['limit', maxZoomForPrecisionClass(precision)])
    assert.ok(calls.at(-1)[1].zoom <= calls.at(-2)[1])
  }
})

test('selected subject without current geography never receives unrelated or obsolete pins', () => {
  const row = { mip_object_id: 'a', subject_graph_node_id: 'node-a', precision_class: 'city', display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] } }
  const loaded = { status: 'ok', rows: [row] }
  assert.deepEqual(mapRowsForSelection(loaded, { id: 'node-b' }, null), [])
  assert.deepEqual(mapRowsForSelection(loaded, { id: 'node-b' }, row), [])
  assert.deepEqual(mapRowsForSelection(loaded, { id: 'node-a' }, null), [], 'no spatial version at requested time')
  assert.equal(mapRowsForSelection(loaded, { id: 'node-a' }, row)[0], row, 'exact selected revision')
  assert.deepEqual(mapRowsForSelection({ status: 'ok', rows: [] }, { id: 'node-a' }, row), [], 'withdrawn row cannot linger')
  assert.deepEqual(mapRowsForSelection({ status: 'unavailable', rows: [row] }, null, row), [])
  assert.equal(mapRowsForSelection(loaded, null, null)[0], row, 'unselected browse map remains available')
})
