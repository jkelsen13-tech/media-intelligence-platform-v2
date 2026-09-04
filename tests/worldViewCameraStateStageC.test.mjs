// R4.9 Stage C — navigation & camera contract tests.
//
// Governing spec: MIP_WORLD_VIEW_TRUE_GLOBE_AND_PROGRESSIVE_3D_v0.1_2026-09-03.md
// §5.6 (meter-denominated ceiling), §5.7 (adapter seam), §16 Stage C,
// §17 tests 2–7 (multi-revolution east/west, both poles, planet→~5 km,
// selection/time preservation).
//
// Scope pins:
// - Camera state is renderer-neutral and serializable; it round-trips
//   through the adapter without touching canonical subject, time range,
//   precision class, or investigation state.
// - Camera state stays OUT of Investigation Context and the hash/deep-link
//   route.
// - Invalid/unsupported camera state fails safe (null/false, no mutation).
// - The ~5 km city ceiling is a meters floor, never a zoom integer.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CAMERA_STATE_VERSION,
  cameraStatesEqual,
  clampLatitudeDegrees,
  clampPitchDegrees,
  makeCameraState,
  minCameraHeightMetersForPrecisionClass,
  normalizeHeadingDegrees,
  normalizeLongitudeDegrees,
  parseCameraState,
  serializeCameraState,
} from '../src/lib/worldViewCameraState.js'
import {
  heightMetersForPrecisionClass,
  heightMetersFromMapZoom,
  mapZoomForHeightMeters,
  maxInspectRangeInMetersForPrecisionClass,
  maxZoomForPrecisionClass,
  subjectEllipsoidCamera,
  geometryAfterCamera,
} from '../src/lib/worldViewMapStack.js'
import {
  cameraStateFromMapCamera,
  mapCameraForCameraState,
} from '../src/lib/worldViewRendererAdapter.js'
import {
  applyCameraStateToGlobeViewer,
  cameraStateFromGlobeCamera,
} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

const CAMERA_MODULE = readFileSync(new URL('../src/lib/worldViewCameraState.js', import.meta.url), 'utf8')
const STACK = readFileSync(new URL('../src/lib/worldViewMapStack.js', import.meta.url), 'utf8')
const ADAPTER = readFileSync(new URL('../src/lib/worldViewRendererAdapter.js', import.meta.url), 'utf8')
const GLOBE_ADAPTER = readFileSync(
  new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js', import.meta.url),
  'utf8',
)
const MAP_CANVAS = readFileSync(new URL('../src/views/WorldMapCanvas.jsx', import.meta.url), 'utf8')
const DEEP_LINKS = readFileSync(new URL('../src/lib/deepLinks.js', import.meta.url), 'utf8')
const INVESTIGATION_CONTEXT = readFileSync(
  new URL('../src/lib/investigationContext.js', import.meta.url),
  'utf8',
)

const CLEVELAND = Object.freeze([-81.7, 41.4])

const LIVE_ROW = Object.freeze({
  mip_object_id: '777b3951-4a82-4dd7-befb-958991b1318f',
  precision_class: 'city',
  display_geometry: { type: 'Point', coordinates: [...CLEVELAND] },
  geometry_status: 'coarsened_to_precision_class',
})

const FAKE_MATH = Object.freeze({
  toDegrees: (r) => (r * 180) / Math.PI,
  toRadians: (d) => (d * Math.PI) / 180,
})

test('camera contract: serialize/parse round-trips the Cleveland subject camera', () => {
  const cam = subjectEllipsoidCamera(CLEVELAND, 'city')
  const state = makeCameraState(
    {
      lon: cam.lon,
      lat: cam.lat,
      heightMeters: cam.heightMeters,
      headingDegrees: cam.headingDegrees,
      pitchDegrees: cam.pitchDegrees,
      rollDegrees: cam.rollDegrees,
    },
    'city',
  )
  assert.ok(state)
  const serialized = serializeCameraState(state)
  assert.equal(typeof serialized, 'string')
  // Stable key order, version pinned.
  assert.equal(
    serialized,
    `{"version":1,"lon":${state.lon},"lat":${state.lat},"heightMeters":${state.heightMeters},"headingDegrees":346,"pitchDegrees":-32,"rollDegrees":0}`,
  )
  const parsed = parseCameraState(serialized, { precisionClass: 'city' })
  assert.ok(cameraStatesEqual(state, parsed))
  assert.equal(CAMERA_STATE_VERSION, 1)
})

test('east/west: longitude wraps through multiple revolutions with no world edge', () => {
  assert.equal(normalizeLongitudeDegrees(190), -170)
  assert.equal(normalizeLongitudeDegrees(-190), 170)
  assert.ok(Math.abs(normalizeLongitudeDegrees(720 - 81.7) - -81.7) < 1e-9)
  assert.ok(Math.abs(normalizeLongitudeDegrees(-720 - 81.7) - -81.7) < 1e-9)
  assert.equal(normalizeLongitudeDegrees(-540), -180)
  assert.equal(normalizeLongitudeDegrees(180), -180)
  assert.equal(normalizeLongitudeDegrees(0), 0)
  // Multi-revolution camera states normalize to the same place.
  const a = makeCameraState({ lon: -81.7, lat: 41.4, heightMeters: 40000 })
  const b = makeCameraState({ lon: -81.7 + 5 * 360, lat: 41.4, heightMeters: 40000 })
  const c = makeCameraState({ lon: -81.7 - 7 * 360, lat: 41.4, heightMeters: 40000 })
  assert.ok(cameraStatesEqual(a, b))
  assert.ok(cameraStatesEqual(a, c))
})

test('poles: both poles are valid, navigable camera states (no clamp below 90)', () => {
  assert.equal(clampLatitudeDegrees(95), 90)
  assert.equal(clampLatitudeDegrees(-95), -90)
  const north = makeCameraState({ lon: 0, lat: 90, heightMeters: 2000000, headingDegrees: 10 })
  const south = makeCameraState({ lon: 0, lat: -90, heightMeters: 2000000, headingDegrees: 190 })
  assert.equal(north.lat, 90)
  assert.equal(south.lat, -90)
  // Traversal onto the opposite side is representable: same meridian continued.
  const beyond = makeCameraState({ lon: 180, lat: 90, heightMeters: 2000000, headingDegrees: 190 })
  assert.equal(beyond.lon, -180)
  // Pole states serialize and restore.
  assert.ok(cameraStatesEqual(north, parseCameraState(serializeCameraState(north))))
  assert.ok(cameraStatesEqual(south, parseCameraState(serializeCameraState(south))))
})

test('orientation: heading wraps, pitch/roll clamp, garbage numbers rejected', () => {
  assert.equal(normalizeHeadingDegrees(-14), 346)
  assert.equal(normalizeHeadingDegrees(720 + 346), 346)
  assert.equal(clampPitchDegrees(-120), -90)
  assert.equal(clampPitchDegrees(120), 90)
  assert.equal(normalizeLongitudeDegrees(Number.NaN), null)
  assert.equal(makeCameraState({ lon: 'x', lat: 41.4, heightMeters: 5000 }), null)
  assert.equal(makeCameraState({ lon: -81.7, lat: 41.4, heightMeters: Number.NaN }), null)
  assert.equal(makeCameraState(null), null)
})

test('ceiling: restored camera height is floored to the ~5 km city ceiling in meters', () => {
  const floor = minCameraHeightMetersForPrecisionClass('city')
  assert.equal(floor, heightMetersForPrecisionClass('city'))
  // The floor derives from the 5000 m ground-range ceiling, not a zoom integer.
  assert.equal(maxInspectRangeInMetersForPrecisionClass('city'), 5000)
  const tooLow = makeCameraState({ lon: -81.7, lat: 41.4, heightMeters: 1000 }, 'city')
  assert.equal(tooLow.heightMeters, floor)
  const higher = makeCameraState({ lon: -81.7, lat: 41.4, heightMeters: 20_000_000 }, 'city')
  assert.equal(higher.heightMeters, 20_000_000)
  // Serialized state that tries to go finer is clamped on parse.
  const sneaky = JSON.stringify({
    version: 1,
    lon: -81.7,
    lat: 41.4,
    heightMeters: 50,
    headingDegrees: 0,
    pitchDegrees: -89,
    rollDegrees: 0,
  })
  const parsed = parseCameraState(sneaky, { precisionClass: 'city' })
  assert.equal(parsed.heightMeters, floor)
  // No precision class known -> no floor, but still finite/valid.
  assert.equal(minCameraHeightMetersForPrecisionClass(null), 0)
})

test('fail-safe: invalid or unsupported camera state returns null and never throws', () => {
  const bad = [
    undefined,
    null,
    42,
    'garbage',
    '{invalid json',
    '[object Object]',
    '"string"',
    '[]',
    '{}',
    JSON.stringify([]),
    JSON.stringify({ version: 2, lon: 0, lat: 0, heightMeters: 1 }),
    JSON.stringify({ version: '1', lon: 0, lat: 0, heightMeters: 1 }),
    JSON.stringify({ version: 1, lon: null, lat: 0, heightMeters: 1 }),
    JSON.stringify({ version: 1, lon: 0, lat: 0, heightMeters: 'NaN' }),
  ]
  for (const input of bad) {
    assert.equal(parseCameraState(input), null, String(input))
  }
  assert.equal(serializeCameraState(null), null)
  assert.equal(serializeCameraState({ lon: 'nope' }), null)
})

test('zoom<->height bridge: MapLibre zoom and ellipsoid meters agree both ways', () => {
  const h = heightMetersFromMapZoom(7.1, 41.4)
  assert.ok(h > 0)
  const z = mapZoomForHeightMeters(h, 41.4)
  assert.ok(Math.abs(z - 7.1) < 1e-9)
  assert.equal(heightMetersFromMapZoom('x', 41.4), null)
  assert.equal(mapZoomForHeightMeters(-5, 41.4), null)
  assert.equal(mapZoomForHeightMeters(1000, 90), null) // cos(90°) = 0 guard
})

test('map camera: state round-trips and restore is capped at the precision ceiling', () => {
  const state = cameraStateFromMapCamera({ lng: -81.7, lat: 41.4, zoom: 7.1, bearing: -14, pitch: 32 }, 'city')
  assert.ok(state)
  assert.ok(Math.abs(state.lon - -81.7) < 1e-9)
  assert.ok(Math.abs(state.headingDegrees - 346) < 1e-9)
  assert.equal(state.pitchDegrees, -32)
  const cam = mapCameraForCameraState(state, 'city')
  assert.ok(Math.abs(cam.center[0] - -81.7) < 1e-9)
  assert.ok(Math.abs(cam.center[1] - 41.4) < 1e-9)
  assert.ok(Math.abs(cam.bearing - -14) < 1e-9)
  assert.equal(cam.pitch, 32)
  assert.ok(cam.zoom <= maxZoomForPrecisionClass('city'))
  // A serialized state far below the meter ceiling is floored, so the map
  // zoom can never exceed the recorded precision-class cap.
  const fine = parseCameraState(
    JSON.stringify({ version: 1, lon: -81.7, lat: 41.4, heightMeters: 10, headingDegrees: 0, pitchDegrees: 0, rollDegrees: 0 }),
    { precisionClass: 'city' },
  )
  const capped = mapCameraForCameraState(fine, 'city')
  assert.ok(capped.zoom <= maxZoomForPrecisionClass('city'))
})

test('globe camera: state extraction and restore through the adapter helpers', () => {
  const fakeCamera = {
    positionCartographic: { longitude: (-81.7 * Math.PI) / 180, latitude: (41.4 * Math.PI) / 180, height: 2_000_000 },
    heading: (346 * Math.PI) / 180,
    pitch: (-32 * Math.PI) / 180,
    roll: 0,
  }
  const state = cameraStateFromGlobeCamera(FAKE_MATH, fakeCamera, 'city')
  assert.ok(state)
  assert.ok(Math.abs(state.lon - -81.7) < 1e-9)
  assert.ok(Math.abs(state.headingDegrees - 346) < 1e-9)
  assert.equal(cameraStateFromGlobeCamera(FAKE_MATH, null, 'city'), null)

  const calls = []
  const fakeCesium = {
    Math: FAKE_MATH,
    Cartesian3: { fromDegrees: (...args) => ({ args }) },
  }
  const fakeViewer = {
    camera: { setView: (v) => calls.push(v) },
    scene: { requestRender: () => calls.push('render') },
  }
  // Restore works for valid state...
  assert.equal(applyCameraStateToGlobeViewer(fakeCesium, fakeViewer, state), true)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].destination.args, [state.lon, state.lat, state.heightMeters])
  assert.ok(Math.abs(calls[0].orientation.pitch - (-32 * Math.PI) / 180) < 1e-12)
  // ...and fails safe without touching the viewer for invalid state.
  calls.length = 0
  assert.equal(applyCameraStateToGlobeViewer(fakeCesium, fakeViewer, null), false)
  assert.equal(applyCameraStateToGlobeViewer(fakeCesium, null, state), false)
  assert.equal(calls.length, 0)
})

test('selection preservation: camera movement never rewrites row identity or precision', () => {
  const after = geometryAfterCamera(LIVE_ROW, { lon: 0, lat: 90, heightMeters: 10 })
  assert.equal(after.precisionClass, 'city')
  assert.deepEqual(after.coordinates, CLEVELAND)
  assert.equal(after.geometryStatus, 'coarsened_to_precision_class')
  assert.equal(after.invented, false)
  // The camera contract module depends only on the map-stack contract.
  assert.doesNotMatch(CAMERA_MODULE, /investigationContext|deepLinks|newSubjectPropagation/)
  assert.match(CAMERA_MODULE, /worldViewMapStack\.js/)
})

test('camera state stays out of Investigation Context and deep-link routes', () => {
  for (const src of [DEEP_LINKS, INVESTIGATION_CONTEXT]) {
    assert.doesNotMatch(src, /cameraState|heightMeters|headingDegrees|pitchDegrees/)
    assert.doesNotMatch(src, /__MIP_WORLD_VIEW_CAMERA_PROBE__/)
  }
  // The canvas exposes the probe but never writes the hash/route.
  assert.doesNotMatch(MAP_CANVAS, /location\.hash|window\.history|navigate\(/)
  assert.match(MAP_CANVAS, /__MIP_WORLD_VIEW_CAMERA_PROBE__/)
})

test('adapter wiring: both renderers and the dispatcher expose the camera contract', () => {
  // Dispatcher passthrough.
  assert.match(ADAPTER, /getCameraState:\s*\(\)\s*=>\s*impl\?\.getCameraState/)
  assert.match(ADAPTER, /setCameraState:\s*\(serialized\)\s*=>\s*impl\?\.setCameraState/)
  // MapLibre adapter restores via jumpTo with the precision-capped camera.
  assert.match(ADAPTER, /mapCameraForCameraState\(parsed, activePrecisionClass\(\)\)/)
  assert.match(ADAPTER, /map\.jumpTo/)
  // Globe adapter parses through the shared contract and applies via setView.
  assert.match(GLOBE_ADAPTER, /parseCameraState\(serialized, \{ precisionClass: activePrecisionClass\(\) \}\)/)
  assert.match(GLOBE_ADAPTER, /applyCameraStateToGlobeViewer\(Cesium, viewer, parsed\)/)
  assert.match(GLOBE_ADAPTER, /cameraStateFromGlobeCamera\(Cesium\.Math, viewer\.camera, activePrecisionClass\(\)\)/)
})

test('ceiling clamp: Cesium minimumZoomDistance is the meter ceiling above the surface', () => {
  // Live-verified regression (Stage C walk): wiring minimumZoomDistance to
  // Earth-radius + ceiling made the controller push any camera below ~6.41M m
  // back out — the ~5 km city ceiling became unreachable and ceiling restores
  // were bounced to planetary height. minimumZoomDistance is a HEIGHT in
  // meters above the ellipsoid surface, not a distance from Earth center.
  assert.match(GLOBE_ADAPTER, /minimumZoomDistance =\s*\n\s*heightMetersForPrecisionClass\(precisionClass\)/)
  assert.doesNotMatch(GLOBE_ADAPTER, /minimumZoomDistance =\s*\n\s*minCameraDistanceFromCenterMetersForPrecisionClass/)
  const cam = subjectEllipsoidCamera([-81.7, 41.4], 'city')
  assert.ok(Math.abs(cam.minZoomDistanceMeters - heightMetersForPrecisionClass('city')) < 1e-6)
})

test('precision class is resolved live at call time, not stale from mount', () => {
  // Rows load asynchronously, so the class may be unknown at adapter mount.
  // Camera-state get/set must read it through the live getter or the ~5 km
  // ceiling floor is silently dropped (found in the Stage C live walk: a
  // 50 m restore was accepted before this fix).
  assert.match(MAP_CANVAS, /getPrecisionClass: \(\) => first\?\.row\?\.precision_class/)
  for (const src of [ADAPTER, GLOBE_ADAPTER]) {
    assert.match(src, /getPrecisionClass,/)
    assert.match(src, /const activePrecisionClass = \(\) => getPrecisionClass\?\.\(\) \?\? precisionClass/)
    assert.match(src, /parseCameraState\(serialized, \{ precisionClass: activePrecisionClass\(\) \}\)/)
  }
  // Behavioral: the floor follows the class supplied at call time.
  const lateCity = parseCameraState(
    JSON.stringify({ version: 1, lon: -81.7, lat: 41.4, heightMeters: 50, headingDegrees: 0, pitchDegrees: -80, rollDegrees: 0 }),
    { precisionClass: 'city' },
  )
  assert.equal(lateCity.heightMeters, heightMetersForPrecisionClass('city'))
})

test('Stage B protections are intact: base URL ordering and honest fatal fallback', () => {
  // CESIUM_BASE_URL is still assigned before the lazy renderer import.
  const assignIdx = GLOBE_ADAPTER.indexOf('globalThis.CESIUM_BASE_URL = resolveCesiumBaseUrl(viteDeploymentBase())')
  const importIdx = GLOBE_ADAPTER.indexOf("await import('cesium')")
  assert.ok(assignIdx > 0 && importIdx > 0 && assignIdx < importIdx)
  // Fatal render failure still advances honestly to the MapLibre stack.
  assert.match(GLOBE_ADAPTER, /renderError\.addEventListener/)
  assert.match(GLOBE_ADAPTER, /onStackIdChange\?\.\('openfreemap-positron'\)/)
  assert.match(GLOBE_ADAPTER, /showRenderLoopError = \(\) => \{\}/)
  // Fallback chain unchanged.
  assert.match(STACK, /if \(currentId === ELLIPSOID_GLOBE_STACK_ID\) return 'openfreemap-positron'/)
})
