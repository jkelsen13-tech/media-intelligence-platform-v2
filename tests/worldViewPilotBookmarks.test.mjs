import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorldViewPilotBookmarks } from '../src/lib/worldViewPilotBookmarks.js'
import { parseCameraState, serializeCameraState, cameraStatesEqual } from '../src/lib/worldViewCameraState.js'
import { heightMetersForPrecisionClass, EARTH_SEMI_MAJOR_METERS } from '../src/lib/worldViewMapStack.js'
import { createCameraMemory } from '../src/lib/worldViewCameraMemory.js'
import { createCameraFraming } from '../src/lib/worldViewCameraFraming.js'

const coordinate = [-81.7, 41.4]

test('four reproducible pilot views use supplied coordinates and stable camera serialization', () => {
  const first = createWorldViewPilotBookmarks({ coordinate, precisionClass: 'city' })
  assert.deepEqual(first, createWorldViewPilotBookmarks({ coordinate: [...coordinate], precisionClass: 'city' }))
  assert.deepEqual(first.map(view => view.id), ['globe', 'regional', 'city', 'close-oblique'])
  for (const view of first) {
    const camera = parseCameraState(view.cameraState, { precisionClass: 'city' })
    // The shared wrapping contract has tiny floating-point roundoff; the
    // source coordinate is checked exactly in the preservation journey below.
    if (view.id !== 'close-oblique') {
      assert.ok(Math.abs(camera.lon - coordinate[0]) < 1e-6)
      assert.equal(camera.lat, coordinate[1])
      assert.equal(view.cameraGroundOffsetMeters, 0)
    }
    assert.deepEqual(view.pointOfInterest, coordinate)
    assert.ok(Object.isFrozen(view.pointOfInterest))
    assert.equal(camera.rollDegrees, 0)
    assert.equal(camera.heightMeters, view.acceptedHeightMeters)
    assert.equal(serializeCameraState(camera, 'city'), view.cameraState)
    assert.ok(Object.isFrozen(view))
  }
  assert.ok(Object.isFrozen(first))
})

test('oblique camera is offset opposite heading at accepted height while exact point of interest remains immutable', () => {
  const input = Object.freeze([...coordinate])
  const close = createWorldViewPilotBookmarks({ coordinate: input, precisionClass: 'city' }).at(-1)
  const state = parseCameraState(close.cameraState)
  const rad = Math.PI / 180
  const lat1 = input[1] * rad, lat2 = state.lat * rad
  const dLon = (state.lon - input[0]) * rad
  const bearing = (Math.atan2(Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)) / rad + 360) % 360
  const haversine = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const distance = 2 * EARTH_SEMI_MAJOR_METERS * Math.asin(Math.sqrt(haversine))
  assert.ok(Math.abs(bearing - (state.headingDegrees + 180)) < 1e-6)
  assert.ok(state.lon < input[0] && state.lat < input[1])
  assert.ok(distance > close.acceptedHeightMeters)
  assert.ok(distance < close.acceptedHeightMeters * 1.02)
  assert.ok(Math.abs(distance - close.cameraGroundOffsetMeters) < 1e-6)
  assert.deepEqual(close.pointOfInterest, input)
  assert.notEqual(close.pointOfInterest, input)
  assert.deepEqual(input, coordinate)
  assert.throws(() => { close.pointOfInterest[0] = 0 }, TypeError)
  assert.match(close.disclosure, /Spherical approximation for camera framing only/)
})

test('close oblique preserves existing city floor and declares requested versus accepted height', () => {
  const close = createWorldViewPilotBookmarks({ coordinate, precisionClass: 'city' }).at(-1)
  const state = parseCameraState(close.cameraState)
  assert.equal(close.requestedHeightMeters, 12000)
  assert.equal(close.acceptedHeightMeters, heightMetersForPrecisionClass('city'))
  assert.equal(close.minHeightMeters, 34641.016151377546)
  assert.equal(close.heightConstrained, true)
  assert.match(close.disclosure, /existing city precision floor/)
  assert.match(close.disclosure, /No finer evidence precision or building detail/)
  assert.equal(state.pitchDegrees, -45)
  assert.equal(state.headingDegrees, 25)
})

test('every precision contract retains its existing floor; no lower floor is introduced', () => {
  for (const precisionClass of ['country', 'region', 'city', 'area', 'facility', 'unknown']) {
    for (const view of createWorldViewPilotBookmarks({ coordinate, precisionClass })) {
      assert.equal(view.precisionClass, precisionClass)
      assert.ok(view.acceptedHeightMeters >= heightMetersForPrecisionClass(precisionClass))
      assert.equal(view.acceptedHeightMeters, Math.max(view.requestedHeightMeters, heightMetersForPrecisionClass(precisionClass)))
      assert.deepEqual(view.pointOfInterest, coordinate)
      if (view.id === 'close-oblique') {
        assert.ok(view.cameraGroundOffsetMeters >= view.acceptedHeightMeters)
        assert.ok(view.cameraGroundOffsetMeters < view.acceptedHeightMeters * 1.08)
      }
    }
  }
})

test('dateline and pole oblique framing yields finite normalized display state without changing the point of interest', () => {
  for (const coordinate of [[179.99, 41.4], [-179.99, -41.4], [0, 90], [0, -90]]) {
    const close = createWorldViewPilotBookmarks({ coordinate, precisionClass: 'city' }).at(-1)
    const state = parseCameraState(close.cameraState, { precisionClass: 'city' })
    assert.ok(state)
    assert.ok(state.lon >= -180 && state.lon < 180)
    assert.ok(state.lat >= -90 && state.lat <= 90)
    assert.equal(state.heightMeters, heightMetersForPrecisionClass('city'))
    assert.deepEqual(close.pointOfInterest, coordinate)
  }
})

test('invalid/missing canonical coordinates give no bookmarks; no Cleveland coordinate is invented', () => {
  for (const coordinate of [null, [], [0], ['-81.7', 41.4], [NaN, 41.4], [0, Infinity], [181, 0], [0, 91]]) {
    assert.deepEqual(createWorldViewPilotBookmarks({ coordinate, precisionClass: 'city' }), [])
  }
  assert.deepEqual(createWorldViewPilotBookmarks(), [])
  const elsewhere = createWorldViewPilotBookmarks({ coordinate: [-99.1, 19.4], precisionClass: 'city' })
  assert.ok(Math.abs(parseCameraState(elsewhere[0].cameraState).lon - (-99.1)) < 1e-6)
  assert.equal(parseCameraState(elsewhere[0].cameraState).lat, 19.4)
})

test('forward/reverse journey, stop, reset and restore stay within existing display seams and preserve canonical/time input', () => {
  // Detached adapter exercises coordination only; it makes no browser/motion claim.
  const row = { mip_object_id: 'cleveland', spatial_revision_id: 'revision-1', precision_class: 'city',
    display_geometry: { type: 'Point', coordinates: [...coordinate] },
    valid_from: '2026-09-01T00:00:00Z', valid_to: '2026-09-02T00:00:00Z' }
  const context = { objectId: row.mip_object_id, version: row.spatial_revision_id, recordedTime: '2026-09-01T12:00:00Z' }
  const before = structuredClone({ row, context })
  let current = serializeCameraState({ lon: coordinate[0], lat: coordinate[1], heightMeters: 150000,
    headingDegrees: 23, pitchDegrees: -65, rollDegrees: 0 }, row.precision_class)
  const original = current
  let stops = 0, resets = 0
  const adapter = {
    setCameraState(value) { const state = parseCameraState(value, { precisionClass: row.precision_class });
      if (!state) return false; current = serializeCameraState(state, row.precision_class); return true },
    cancelCameraFlight() { stops++; return true },
    flyToSubjectCamera() { resets++; return true },
  }
  const framing = createCameraFraming()
  framing.select([{ selected: true, positions: [coordinate], row }])
  const memory = createCameraMemory()
  assert.equal(memory.remember(original, framing.getTargetKey(), 'ellipsoid-globe'), true)
  const bookmarks = createWorldViewPilotBookmarks({ coordinate: row.display_geometry.coordinates, precisionClass: row.precision_class })
  for (const bookmark of [...bookmarks, ...bookmarks.toReversed()]) assert.equal(adapter.setCameraState(bookmark.cameraState), true)
  assert.equal(adapter.cancelCameraFlight(), true)
  assert.equal(memory.restore(adapter, framing.getTargetKey(), 'osm'), true)
  assert.equal(cameraStatesEqual(parseCameraState(current), parseCameraState(original)), true)
  framing.acceptRestoredView()
  assert.equal(framing.apply(adapter), false)
  assert.equal(framing.apply(adapter, { force: true }), true)
  assert.equal(stops, 1); assert.equal(resets, 1)
  assert.deepEqual({ row, context }, before)
})
