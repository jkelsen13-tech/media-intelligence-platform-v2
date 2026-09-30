import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createMapPrecisionGovernor, maxMapZoomForPrecisionClassAtLatitude,
  cameraStateFromMapCamera, mapCameraForCameraState, flyToSubject,
} from '../src/lib/worldViewRendererAdapter.js'
import { heightMetersForPrecisionClass, heightMetersFromMapZoom, maxZoomForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { makeCameraState } from '../src/lib/worldViewCameraState.js'

function rawHeight(zoom, lat, width) {
  return heightMetersFromMapZoom(zoom, lat) * Math.min(width, 800) / 800
}
function fakeMap({ lat = 41.4, width = 800, zoom = 10 } = {}) {
  const handlers = new Map()
  let minimum = 0.8, maximum = 12, sets = 0
  const map = {
    lat, width, zoom,
    getCenter: () => ({ lng: -81.7, lat: map.lat }),
    getCanvas: () => ({ clientWidth: map.width }),
    getMinZoom: () => minimum, getMaxZoom: () => maximum,
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn) },
    off(type, fn) { handlers.get(type)?.delete(fn) },
    emit(type) { for (const fn of [...(handlers.get(type) ?? [])]) fn({ type }) },
    setMinZoom(next) { assert.ok(next <= maximum); minimum = next; map.zoom = Math.max(map.zoom, minimum); sets++; map.emit('move') },
    setMaxZoom(next) { assert.ok(next >= minimum); maximum = next; map.zoom = Math.min(map.zoom, maximum); sets++; map.emit('move') },
    userZoom(next) { map.zoom = Math.min(maximum, Math.max(minimum, next)); map.emit('move') },
    flyTo(camera) { map.lat = camera.center[1]; map.zoom = camera.zoom; map.flight = camera; map.emit('move') },
    stats: () => ({ sets, listeners: [...handlers.values()].reduce((n, set) => n + set.size, 0) }),
  }
  return map
}

test('fallback actual zoom stays above the meter floor for every precision, latitude and supported panel width', () => {
  for (const precision of ['country', 'region', 'city', 'area', 'facility']) {
    for (const lat of [0, 19.4, 41.4, 62.5, 85.05112878, -85.05112878]) {
      for (const width of [160, 390, 800, 1280]) {
        const cap = maxMapZoomForPrecisionClassAtLatitude(precision, lat, width)
        assert.ok(cap <= maxZoomForPrecisionClass(precision))
        assert.ok(rawHeight(cap, lat, width) >= heightMetersForPrecisionClass(precision) - 1e-6)
      }
    }
  }
  assert.equal(maxMapZoomForPrecisionClassAtLatitude('city', NaN), null)
})

test('user zoom, poleward pan, resize and later precision changes enforce the actual map cap', () => {
  let precision = 'city'
  const map = fakeMap()
  const governor = createMapPrecisionGovernor(map, { getPrecisionClass: () => precision })
  assert.equal(governor.update(), true)
  assert.ok(map.zoom < 10, 'old fixed cap10 allowed finer-than-recorded inspection')
  map.userZoom(20)
  assert.ok(rawHeight(map.zoom, map.lat, map.width) >= heightMetersForPrecisionClass(precision) - 1e-6)
  map.lat = 85.05112878; map.emit('move')
  assert.ok(rawHeight(map.zoom, map.lat, map.width) >= heightMetersForPrecisionClass(precision) - 1e-6)
  map.width = 160; map.emit('resize')
  precision = 'country'; governor.update()
  assert.ok(map.getMinZoom() < 0.8, 'small high-latitude panel requires a lower minimum')
  assert.ok(rawHeight(map.zoom, map.lat, map.width) >= heightMetersForPrecisionClass(precision) - 1e-6)
  map.lat = 19.4; map.width = 800; map.emit('move')
  assert.equal(map.getMinZoom(), 0.8)
  assert.ok(map.stats().sets < 20, 'synchronous setter move events must not recurse')
  const before = map.stats().sets
  map.emit('move'); map.emit('resize')
  assert.equal(map.stats().sets, before, 'unchanged bound does not trigger extra setters')
  governor.destroy()
  assert.equal(map.stats().listeners, 0)
})

test('hidden zero-width resize retains the last real width; unusably small viewport fails safely', () => {
  const map = fakeMap({ width: 390 })
  let unavailable = 0
  const governor = createMapPrecisionGovernor(map, { getPrecisionClass: () => 'country', onUnavailable: () => unavailable++ })
  governor.update()
  map.width = 0; map.emit('resize')
  assert.equal(governor.width(), 390)
  map.width = 1; map.lat = 85.05112878
  assert.equal(governor.update(), false)
  assert.equal(unavailable, 1)
  governor.destroy()
})

test('read and restore use the same width bridge without masking a finer live zoom', () => {
  for (const width of [160, 390, 800, 1280]) {
    const cap = maxMapZoomForPrecisionClassAtLatitude('city', 62.5, width)
    const state = cameraStateFromMapCamera({ lng: -114.4, lat: 62.5, zoom: cap, pitch: 32, bearing: 15 }, 'city', width)
    const restored = mapCameraForCameraState(state, 'city', width)
    assert.ok(Math.abs(restored.zoom - cap) < 1e-9)
    assert.equal(restored.pitch, 32)
    assert.ok(rawHeight(restored.zoom, restored.center[1], width) >= heightMetersForPrecisionClass('city') - 1e-6)
  }
})

test('subject flight constrains only fallback presentation, retaining canonical pole coordinates', () => {
  const coordinate = Object.freeze([179.9, 90])
  const map = fakeMap({ lat: 0, width: 390 })
  assert.equal(flyToSubject(map, coordinate, 'city'), true)
  assert.deepEqual(coordinate, [179.9, 90])
  assert.deepEqual(map.flight.center, [179.9, 85.05112878])
  assert.equal(map.flight.pitch, 0)
  assert.equal(map.flight.bearing, 0)
  assert.ok(rawHeight(map.flight.zoom, map.flight.center[1], map.width) >= heightMetersForPrecisionClass('city') - 1e-6)
  const state = makeCameraState({ lon: 179.9, lat: 90, heightMeters: 2000000, headingDegrees: 10, pitchDegrees: -90 })
  assert.equal(mapCameraForCameraState(state, 'city', 390).center[1], 85.05112878)
  assert.equal(state.lat, 90)
})

test('synchronous zoom constraints changing latitude cannot leave a stale unsafe cap', () => {
  const map = fakeMap()
  const originalSetMaxZoom = map.setMaxZoom.bind(map)
  let first = true
  map.setMaxZoom = cap => {
    if (first) { map.lat = 85.05112878; first = false }
    originalSetMaxZoom(cap)
  }
  const governor = createMapPrecisionGovernor(map, { getPrecisionClass: () => 'city' })
  assert.equal(governor.update(), true)
  assert.ok(rawHeight(map.zoom, map.lat, map.width) >= heightMetersForPrecisionClass('city') - 1e-6)
  governor.destroy()
})
