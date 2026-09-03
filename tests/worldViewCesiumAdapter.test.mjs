// R4 World View — Cesium ellipsoid adapter contract tests (no GPU).
//
// These tests validate:
// - Adapter selection and fallback order
// - Camera-to-height mapping by precision class
// - Max inspect range contract
// - Pick returns the original row (identity preserved)
// - Camera never mutates geometry or precision
// - Attribution present
// - No ion token / banned provider strings in adapter source
// - Destroy/cleanup contract

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  projectionMarkerRecords,
  rendererKindForStackId,
  rendererPlanForStackId,
  stackAttribution,
} from '../src/lib/worldViewRendererAdapter.js'

import {
  cesiumMarkerEntityDescriptors,
  destroyCesiumResources,
} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

import {
  DEFAULT_MAP_STACK_ID,
  ELLIPSOID_GLOBE_STACK_ID,
  FALLBACK_MAP_STACK_ID,
  heightMetersForPrecisionClass,
  maxInspectRangeInMetersForPrecisionClass,
  maxZoomForPrecisionClass,
  minCameraDistanceFromCenterMetersForPrecisionClass,
  nextMapStackOnFailure,
  subjectEllipsoidCamera,
  geometryAfterCamera,
  EARTH_SEMI_MAJOR_METERS,
} from '../src/lib/worldViewMapStack.js'

const ADAPTER = readFileSync(
  new URL('../src/lib/worldViewRendererAdapter.js', import.meta.url),
  'utf8',
)
const CESIUM_ADAPTER = readFileSync(
  new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js', import.meta.url),
  'utf8',
)

const LIVE_ROW = Object.freeze({
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: '777b3951-4a82-4dd7-befb-958991b1318f',
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
  precision_class: 'city',
  display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] },
  geometry_status: 'coarsened_to_precision_class',
  source_native_time: { location_label: 'Cleveland, Ohio' },
})

// ---- Adapter selection and fallback ----

test('default stack is ellipsoid-globe', () => {
  assert.equal(DEFAULT_MAP_STACK_ID, ELLIPSOID_GLOBE_STACK_ID)
})

test('rendererKindForStackId returns ellipsoid-globe for the ellipsoid stack', () => {
  assert.equal(rendererKindForStackId(ELLIPSOID_GLOBE_STACK_ID), 'ellipsoid-globe')
  assert.equal(rendererKindForStackId('openfreemap-positron'), 'maplibre-deck.gl')
  assert.equal(rendererKindForStackId('osm'), 'maplibre-deck.gl')
  assert.equal(rendererKindForStackId(FALLBACK_MAP_STACK_ID), 'maplibre-deck.gl')
})

test('rendererPlanForStackId: WebGL available -> ellipsoid; unavailable -> MapLibre fallback', () => {
  const withGl = rendererPlanForStackId({ stackId: ELLIPSOID_GLOBE_STACK_ID, webglAvailable: true })
  assert.equal(withGl.rendererKind, 'ellipsoid-globe')
  assert.equal(withGl.mountStackId, ELLIPSOID_GLOBE_STACK_ID)

  const noGl = rendererPlanForStackId({ stackId: ELLIPSOID_GLOBE_STACK_ID, webglAvailable: false })
  assert.equal(noGl.rendererKind, 'maplibre-deck.gl')
  assert.equal(noGl.mountStackId, 'openfreemap-positron')
})

test('fallback chain: ellipsoid -> positron -> osm -> atlas', () => {
  assert.equal(nextMapStackOnFailure(ELLIPSOID_GLOBE_STACK_ID), 'openfreemap-positron')
  assert.equal(nextMapStackOnFailure('openfreemap-positron'), 'osm')
  assert.equal(nextMapStackOnFailure('osm'), FALLBACK_MAP_STACK_ID)
})

// ---- Camera-to-height mapping ----

test('heightMetersForPrecisionClass: city height reproduces ~5km ceiling', () => {
  const cityHeight = heightMetersForPrecisionClass('city')
  // 5km ground scale -> camera height ~34.6km (at fovy 60deg, 25% fraction)
  assert.ok(cityHeight > 20000, `city height ${cityHeight} should be > 20km`)
  assert.ok(cityHeight < 50000, `city height ${cityHeight} should be < 50km`)

  // Coarser precision classes produce higher altitudes.
  assert.ok(heightMetersForPrecisionClass('country') > heightMetersForPrecisionClass('region'))
  assert.ok(heightMetersForPrecisionClass('region') > heightMetersForPrecisionClass('city'))
  assert.ok(heightMetersForPrecisionClass('city') > heightMetersForPrecisionClass('area'))
  assert.ok(heightMetersForPrecisionClass('area') > heightMetersForPrecisionClass('facility'))
})

// ---- Max inspect range in meters ----

test('maxInspectRangeInMetersForPrecisionClass: city ceiling is ~5km', () => {
  assert.equal(maxInspectRangeInMetersForPrecisionClass('city'), 5000)
  assert.ok(maxInspectRangeInMetersForPrecisionClass('country') > maxInspectRangeInMetersForPrecisionClass('city'))
  assert.ok(maxInspectRangeInMetersForPrecisionClass('city') > maxInspectRangeInMetersForPrecisionClass('facility'))
})

test('minCameraDistanceFromCenterMetersForPrecisionClass is above Earth surface', () => {
  for (const pc of ['country', 'region', 'city', 'area', 'facility']) {
    const dist = minCameraDistanceFromCenterMetersForPrecisionClass(pc)
    assert.ok(dist > EARTH_SEMI_MAJOR_METERS, `${pc} camera distance ${dist} must be above surface`)
  }
})

// ---- subjectEllipsoidCamera ----

test('subjectEllipsoidCamera returns correct fields for Cleveland city', () => {
  const cam = subjectEllipsoidCamera([-81.7, 41.4], 'city')
  assert.equal(cam.lon, -81.7)
  assert.equal(cam.lat, 41.4)
  assert.ok(cam.heightMeters > 0)
  assert.equal(cam.headingDegrees, 346)
  assert.equal(cam.pitchDegrees, -32)
  assert.equal(cam.rollDegrees, 0)
  assert.ok(cam.minZoomDistanceMeters > EARTH_SEMI_MAJOR_METERS)
})

test('subjectEllipsoidCamera returns null for invalid coordinates', () => {
  assert.equal(subjectEllipsoidCamera([NaN, 1], 'city'), null)
  assert.equal(subjectEllipsoidCamera(null, 'city'), null)
  assert.equal(subjectEllipsoidCamera([], 'city'), null)
})

// ---- Pick returns original row (identity preserved) ----

test('cesiumMarkerEntityDescriptors retains original row object reference', () => {
  const features = projectionMarkerRecords([LIVE_ROW], new Set())
  const descriptors = cesiumMarkerEntityDescriptors(features)
  assert.equal(descriptors.length, 1)
  assert.equal(descriptors[0].row, LIVE_ROW, 'descriptor.row must be the original row object')
  assert.deepEqual(descriptors[0].position, [-81.7, 41.4])
  assert.equal(descriptors[0].precisionClass, 'city')
})

test('cesiumMarkerEntityDescriptors returns empty for no-plot rows', () => {
  const empty = cesiumMarkerEntityDescriptors([])
  assert.equal(empty.length, 0)

  const noRow = cesiumMarkerEntityDescriptors([{ row: null, positions: [] }])
  assert.equal(noRow.length, 0)
})

// ---- Camera never mutates geometry or precision ----

test('geometryAfterCamera: camera changes do not rewrite precision or coordinates', () => {
  const after = geometryAfterCamera(LIVE_ROW, { zoom: 18, pitch: 60, heightMeters: 500 })
  assert.equal(after.precisionClass, 'city')
  assert.deepEqual(after.coordinates, [-81.7, 41.4])
  assert.equal(after.geometryStatus, 'coarsened_to_precision_class')
  assert.equal(after.invented, false)
})

// ---- Attribution present ----

test('ellipsoid-globe stack has visible attribution text', () => {
  const attrib = stackAttribution(ELLIPSOID_GLOBE_STACK_ID)
  assert.match(attrib, /OpenStreetMap/i)
  assert.match(attrib, /OpenFreeMap|OpenMapTiles/i)
})

// ---- No ion token / banned provider strings ----

test('Cesium adapter source has no ion token or banned provider strings', () => {
  const bannedIon = /Ion\.defaultAccessToken|defaultAccessToken\s*=|CESIUM_ION|ion\s*access\s*token/i
  assert.doesNotMatch(CESIUM_ADAPTER, bannedIon)

  const bannedProviders = /photorealistic 3d|google 3d tiles|ion\.cesium/i
  assert.doesNotMatch(CESIUM_ADAPTER, bannedProviders)

  // No terrain, 3D buildings, or 3D Tiles.
  assert.doesNotMatch(CESIUM_ADAPTER, /CesiumTerrainProvider|createWorldTerrain|Cesium3DTileset/i)

  // No paid imagery keys.
  assert.doesNotMatch(CESIUM_ADAPTER, /api[_-]?key|apikey|accessToken\b/i)
})

test('main adapter source has no ion token strings', () => {
  const bannedIon = /Ion\.defaultAccessToken|defaultAccessToken\s*=|CESIUM_ION/i
  assert.doesNotMatch(ADAPTER, bannedIon)
})

// ---- Destroy / cleanup ----

test('destroyCesiumResources is safe with null/empty args', () => {
  assert.doesNotThrow(() => destroyCesiumResources({ eventHandler: null, viewer: null }))
  assert.doesNotThrow(() => destroyCesiumResources({}))

  let destroyed = 0
  destroyCesiumResources({
    eventHandler: { destroy: () => destroyed++ },
    viewer: { destroy: () => destroyed++ },
  })
  assert.equal(destroyed, 2)
})

// ---- Source guard: adapter dispatcher mentions Cesium only via dynamic import ----

test('adapter dispatcher imports Cesium only via dynamic import path', () => {
  // The dispatcher should not statically import Cesium (lazy load only)
  assert.doesNotMatch(
    ADAPTER,
    /^import\s.*cesium/im,
    'adapter must not statically import cesium (dynamic import only)',
  )
  // It should dynamically import the cesium adapter module
  assert.match(ADAPTER, /import\('\.\/worldViewCesiumEllipsoidRendererAdapter\.js'\)/)
})
