// R4.9 Stage D — bounded Terrarium terrain provider contract tests (no GPU).
//
// Covers the Stage D0 test plan:
// - Terrarium decode vectors (incl. negative/bathymetric values)
// - Tile-coordinate and orientation math
// - Geographic coverage enforcement (fully-inside rule; no global dataset fetches)
// - Below-band ancestry served locally as the reference ellipsoid (quadtree
//   renderability) and the definitive getTileDataAvailable policy the
//   quadtree refinement gate requires
// - Approved-source enforcement via the provenance header (fail closed)
// - Zoom-cap behavior (levels 8..15 only)
// - Missing, blocked, malformed, aborted, and non-PNG responses
// - Resampling and edge behavior
// - Attribution presence
// - Terrain failure -> ellipsoid degradation + camera-state equality
// - Exact Cleveland floor untouched by terrain
// - No terrain influence on precision_class or evidence geometry
// - No ion token or ion endpoint; guard-allowlist scope

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  APPROVED_TERRAIN_COVERAGE,
  APPROVED_TERRAIN_SOURCE_PREFIXES,
  TERRAIN_CREDIT_TEXT,
  TERRAIN_HEIGHTMAP_SIZE,
  TERRAIN_MAX_ZOOM,
  TERRAIN_MIN_ZOOM,
  approvedSourcesFromHeader,
  createTerrariumTerrainProvider,
  decodeTerrariumPixel,
  fetchTerrariumTileHeights,
  resampleHeightmapBilinear,
  terrariumTileUrl,
  tileApproval,
  tileXYForLongitudeLatitudeDegrees,
  tileFullyInsideCoverage,
  tileRectangleDegrees,
} from '../src/lib/worldViewCesiumTerrariumTerrainProvider.js'

import {
  cameraStateFromGlobeCamera,
  degradeGlobeToEllipsoid,
} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

import {
  TERRAIN_DISCLOSURE_TEXT,
  TERRAIN_UNAVAILABLE_TEXT,
  heightMetersForPrecisionClass,
} from '../src/lib/worldViewMapStack.js'

const PROVIDER_SRC = readFileSync(
  new URL('../src/lib/worldViewCesiumTerrariumTerrainProvider.js', import.meta.url),
  'utf8',
)
const ADAPTER_SRC = readFileSync(
  new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js', import.meta.url),
  'utf8',
)
const DISPATCHER_SRC = readFileSync(
  new URL('../src/lib/worldViewRendererAdapter.js', import.meta.url),
  'utf8',
)
const CANVAS_SRC = readFileSync(new URL('../src/views/WorldMapCanvas.jsx', import.meta.url), 'utf8')

// ---- mocks ----

function makeMockCesium() {
  const captured = {}
  class CustomHeightmapTerrainProvider {
    constructor(opts) {
      Object.assign(this, opts)
      captured.terrainOpts = opts
    }
  }
  class WebMercatorTilingScheme {
    constructor(opts) {
      this.opts = opts
      captured.schemeOpts = opts
    }
  }
  class EllipsoidTerrainProvider {
    constructor(opts) {
      this.opts = opts
    }
  }
  class Credit {
    constructor(text) {
      this.text = text
    }
  }
  return {
    CustomHeightmapTerrainProvider,
    WebMercatorTilingScheme,
    EllipsoidTerrainProvider,
    Credit,
    captured,
  }
}

/** Terrarium-encode an integer height into RGB (b = 0, exact round-trip). */
function encodeTerrariumInteger(h) {
  const v = h + 32768
  const r = Math.floor(v / 256)
  const g = v - r * 256
  return [r, g, 0]
}

/** Build a 256x256 RGBA buffer encoding heights h(i, j) = i + 10 * j. */
function makeGradientPngPixels() {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let j = 0; j < 256; j += 1) {
    for (let i = 0; i < 256; i += 1) {
      const [r, g, b] = encodeTerrariumInteger(i + 10 * j)
      const o = (j * 256 + i) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  return data
}

function makeOkFetch({ sourceHeader = 'ned/test_ned19.tif', pixels = makeGradientPngPixels() } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return {
      ok: true,
      status: 200,
      headers: {
        get: (k) =>
          ({
            'content-type': 'image/png',
            'x-amz-meta-x-imagery-sources': sourceHeader,
          })[k] ?? null,
      },
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
    }
  }
  const decodeImageImpl = async () => ({ width: 256, height: 256, data: pixels })
  return { fetchImpl, decodeImageImpl, calls }
}

// ---- decode vectors ----

test('terrarium decode matches the documented example and round-trips', () => {
  // joerd formats doc: 2523.266 m -> rgb(137, 219, 68)
  const h = decodeTerrariumPixel(137, 219, 68)
  assert.ok(Math.abs(h - 2523.266) <= 1 / 256, `decoded ${h}`)
  // zero elevation
  assert.equal(decodeTerrariumPixel(128, 0, 0), 0)
  // integer round-trips across the range (incl. negatives)
  for (const v of [-9794, -500, -1, 0, 1, 173, 265, 1000, 8848]) {
    const [r, g, b] = encodeTerrariumInteger(v)
    assert.equal(decodeTerrariumPixel(r, g, b), v)
  }
})

test('terrarium decode handles negative/bathymetric values', () => {
  // ETOPO1 bathymetry regime: deep negative heights
  const deep = decodeTerrariumPixel(89, 190, 0)
  assert.equal(deep, -9794)
  assert.ok(deep < 0)
  // fractional precision is 1/256 m
  assert.ok(Math.abs(decodeTerrariumPixel(128, 0, 128) - 0.5) < 1e-9)
})

// ---- tile coordinates and orientation ----

test('tile rectangles use the 1x1 level-zero slippy tree with north-up rows', () => {
  const world = tileRectangleDegrees(0, 0, 0)
  assert.equal(world.west, -180)
  assert.equal(world.east, 180)
  assert.ok(Math.abs(world.north - 85.05112878) < 1e-6)
  assert.ok(Math.abs(world.south + 85.05112878) < 1e-6)
  assert.ok(world.north > world.south) // row 0 is the northern edge

  const nw = tileRectangleDegrees(0, 0, 1)
  assert.equal(nw.west, -180)
  assert.equal(nw.east, 0)
  assert.ok(Math.abs(nw.south) < 1e-9) // y row 0..0.5 spans the equator at its south edge
  // adjacent tiles share exact edges (seam consistency)
  const left = tileRectangleDegrees(0, 0, 5)
  const right = tileRectangleDegrees(1, 0, 5)
  assert.equal(left.east, right.west)
  const up = tileRectangleDegrees(0, 0, 5)
  const down = tileRectangleDegrees(0, 1, 5)
  assert.equal(up.south, down.north)
})

test('cleveland anchor tile contains the released coordinate at z15', () => {
  // tile containing the released (coarsened) Cleveland anchor -81.7, 41.4
  const n = 2 ** 15
  const x = Math.floor(((-81.7 + 180) / 360) * n)
  const latR = (41.4 * Math.PI) / 180
  const y = Math.floor(((1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2) * n)
  const rect = tileRectangleDegrees(x, y, 15)
  assert.ok(rect.west <= -81.7 && rect.east >= -81.7)
  assert.ok(rect.south <= 41.4 && rect.north >= 41.4)
  assert.ok(tileFullyInsideCoverage(rect))
})

test('position-to-tile lookup is the exact inverse of the tile rectangle', () => {
  // Cleveland city center resolves to the live-observed tile 11/559/764
  assert.deepEqual(tileXYForLongitudeLatitudeDegrees(-81.6944, 41.4993, 11), { x: 559, y: 764 })
  // released anchor at the zoom cap, inside coverage
  const a = tileXYForLongitudeLatitudeDegrees(-81.7, 41.4, 15)
  const rectA = tileRectangleDegrees(a.x, a.y, 15)
  assert.ok(rectA.west <= -81.7 && rectA.east >= -81.7)
  assert.ok(rectA.south <= 41.4 && rectA.north >= 41.4)
  // mid-Pacific is far outside the approved boundary
  const p = tileXYForLongitudeLatitudeDegrees(-150, 0, 11)
  assert.equal(tileFullyInsideCoverage(tileRectangleDegrees(p.x, p.y, 11)), false)
  // poles and antimeridian stay inside the tile tree (clamped, never NaN)
  for (const [lon, lat] of [[-180, 85.3], [180, -85.3], [0, 90], [0, -90], [-180, 0], [179.9999, 85.05112878]]) {
    const t = tileXYForLongitudeLatitudeDegrees(lon, lat, 15)
    const n = 2 ** 15
    assert.ok(Number.isInteger(t.x) && t.x >= 0 && t.x < n, `${lon},${lat} x=${t.x}`)
    assert.ok(Number.isInteger(t.y) && t.y >= 0 && t.y < n, `${lon},${lat} y=${t.y}`)
  }
})

// ---- coverage enforcement ----

test('coverage policy approves only fully-inside Ohio tiles at levels 8..15', () => {
  assert.equal(TERRAIN_MIN_ZOOM, 8)
  assert.equal(TERRAIN_MAX_ZOOM, 15)
  assert.equal(APPROVED_TERRAIN_COVERAGE.id, 'cleveland-ohio-dev-v1')

  // fully inside at z8: tile x=68 spans [-84.375, -82.8125]; find a y inside Ohio
  const inside = tileApproval(68, 96, 8)
  assert.equal(inside.approved, true, JSON.stringify(inside))

  // straddler at the west boundary: x=67 spans [-85.78125, -84.375]
  const straddle = tileApproval(67, 96, 8)
  assert.equal(straddle.approved, false)
  assert.equal(straddle.reason, 'outside-coverage')
  assert.ok(straddle.rect.west < APPROVED_TERRAIN_COVERAGE.west)

  // fully outside (Texas)
  const outside = tileApproval(56, 105, 8)
  assert.equal(outside.approved, false)

  // level band: no global root/parent tiles, no over-zoom
  assert.equal(tileApproval(0, 0, 0).reason, 'below-min-level')
  assert.equal(tileApproval(100, 100, 7).reason, 'below-min-level')
  assert.equal(tileApproval(0, 0, 16).reason, 'above-max-level')
})

test('unapproved in-band and over-zoom tiles return synchronous undefined without any fetch', async () => {
  const Cesium = makeMockCesium()
  const { fetchImpl, decodeImageImpl, calls } = makeOkFetch()
  const { provider } = createTerrariumTerrainProvider(Cesium, { fetchImpl, decodeImageImpl })
  // outside coverage
  assert.equal(provider.callback(56, 105, 8), undefined)
  // above max level
  assert.equal(provider.callback(0, 0, 16), undefined)
  assert.equal(calls.length, 0)
})

test('below-band ancestry tiles serve the reference ellipsoid from memory without any fetch', async () => {
  const Cesium = makeMockCesium()
  const { fetchImpl, decodeImageImpl, calls } = makeOkFetch()
  const { provider, getStatus } = createTerrariumTerrainProvider(Cesium, { fetchImpl, decodeImageImpl })
  // Levels below the approved band are never requested from the dataset,
  // but the quadtree needs renderable ancestry to descend through. The
  // answer is the reference ellipsoid itself: an all-zero 65x65 heightmap
  // generated locally (height zero === WGS84 ellipsoid surface).
  for (const [x, y, level] of [
    [0, 0, 0],
    [200, 90, 7],
    [35, 47, 7],
  ]) {
    const grid = provider.callback(x, y, level)
    assert.ok(grid instanceof Float32Array, `level ${level}`)
    assert.equal(grid.length, 65 * 65)
    assert.ok(grid.every((h) => h === 0), 'ellipsoid ancestry must be exactly zero height')
  }
  // no network, no fetch accounting, no status flip
  assert.equal(calls.length, 0)
  assert.deepEqual(getStatus(), {
    status: 'idle',
    fetchAttempts: 0,
    fetchSuccesses: 0,
    fetchFailures: 0,
    sourceRejections: 0,
  })
})

test('provider publishes definitive tile availability so the quadtree can refine', () => {
  const Cesium = makeMockCesium()
  const { fetchImpl, decodeImageImpl } = makeOkFetch()
  const { provider } = createTerrariumTerrainProvider(Cesium, { fetchImpl, decodeImageImpl })
  // Regression: the stock provider answers undefined ("unknown"), and the
  // engine's canRefine gate (GlobeSurfaceTileProvider) refuses to refine a
  // dataless tile on an unknown answer — traversal stalls at the root and
  // terrain never activates. Every answer must be a definitive boolean.
  for (const level of [0, 1, 5, 7, 8, 11, 15, 16, 20]) {
    for (const [x, y] of [
      [0, 0],
      [2 ** level - 1, 2 ** level - 1],
    ]) {
      const answer = provider.getTileDataAvailable(x, y, level)
      assert.equal(typeof answer, 'boolean', `(${x}, ${y}, ${level}) -> ${answer}`)
    }
  }
  // below the approved band: ellipsoid ancestry is always servable
  assert.equal(provider.getTileDataAvailable(0, 0, 0), true)
  assert.equal(provider.getTileDataAvailable(200, 90, 7), true)
  // approved in-coverage tiles
  assert.equal(provider.getTileDataAvailable(68, 96, 8), true)
  assert.equal(provider.getTileDataAvailable(560, 764, 11), true)
  // boundary straddler (x=67 spans west of the boundary) and far outside
  assert.equal(provider.getTileDataAvailable(67, 96, 8), false)
  assert.equal(provider.getTileDataAvailable(56, 105, 8), false)
  // above the zoom cap the real level-15 parent is upsampled instead
  assert.equal(provider.getTileDataAvailable(0, 0, 16), false)
  // non-integer / negative levels are not servable
  assert.equal(provider.getTileDataAvailable(0, 0, -1), false)
  assert.equal(provider.getTileDataAvailable(0, 0, 8.5), false)
})

// ---- approved-source enforcement ----

test('source policy accepts US federal public-domain sources only and fails closed', () => {
  assert.deepEqual(APPROVED_TERRAIN_SOURCE_PREFIXES, [
    'ned/',
    'ned13/',
    'ned_topobathy/',
    'srtm/',
    'gmted/',
    'etopo1/',
  ])
  assert.equal(approvedSourcesFromHeader('ned/a.tif, srtm/b.tif').approved, true)
  assert.equal(approvedSourcesFromHeader('etopo1/ETOPO1_Bed_g.tif').approved, true)
  assert.equal(approvedSourcesFromHeader('ned_topobathy/ca.tif').approved, true)
  assert.equal(approvedSourcesFromHeader('ned13/imgn42w082_13.tif').approved, true)
  // exact provenance header observed live on the Cleveland tile
  // (terrarium/11/559/764.png): NED 1/9" + NED 1/3" — all USGS 3DEP
  const liveOhioHeader =
    'ned/ned19_n41x50_w081x75_oh_north_2006.tif, ned/ned19_n41x75_w081x75_oh_north_2006.tif, ned13/imgn42w082_13.tif'
  assert.equal(approvedSourcesFromHeader(liveOhioHeader).approved, true)
  // non-US / nationally licensed sources rejected
  for (const bad of ['cdem/x.tif', 'eudem/x.tif', 'linz/x.tif', 'kartverket/x.tif', 'arcticdem/x.tif', 'inegi/x.tif']) {
    assert.equal(approvedSourcesFromHeader(bad).approved, false, bad)
  }
  // mixed approved + unapproved rejected
  const mixed = approvedSourcesFromHeader('ned/a.tif, eudem/b.tif')
  assert.equal(mixed.approved, false)
  assert.deepEqual(mixed.rejected, ['eudem/b.tif'])
  // missing / empty header fails closed
  assert.equal(approvedSourcesFromHeader(null).approved, false)
  assert.equal(approvedSourcesFromHeader('').approved, false)
  assert.equal(approvedSourcesFromHeader('   ').approved, false)
})

// ---- fetch + decode pipeline failures ----

test('fetch failures reject: 404, non-PNG, malformed, decode error, unapproved source', async () => {
  const base = { z: 11, x: 560, y: 764 }
  const decodeImageImpl = async () => ({ width: 256, height: 256, data: makeGradientPngPixels() })

  // 404
  await assert.rejects(
    fetchTerrariumTileHeights({ ...base, fetchImpl: async () => ({ ok: false, status: 404 }), decodeImageImpl }),
    /404/,
  )
  // non-PNG content type
  await assert.rejects(
    fetchTerrariumTileHeights({
      ...base,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new ArrayBuffer(4),
      }),
      decodeImageImpl,
    }),
    /not a PNG/,
  )
  // malformed decode (wrong dimensions)
  await assert.rejects(
    fetchTerrariumTileHeights({
      ...base,
      fetchImpl: makeOkFetch().fetchImpl,
      decodeImageImpl: async () => ({ width: 10, height: 10, data: new Uint8ClampedArray(400) }),
    }),
    /malformed/,
  )
  // decoder throws (corrupt bytes)
  await assert.rejects(
    fetchTerrariumTileHeights({
      ...base,
      fetchImpl: makeOkFetch().fetchImpl,
      decodeImageImpl: async () => {
        throw new Error('corrupt png')
      },
    }),
    /corrupt png/,
  )
  // unapproved source header
  await assert.rejects(
    fetchTerrariumTileHeights({
      ...base,
      fetchImpl: makeOkFetch({ sourceHeader: 'eudem/eu.tif' }).fetchImpl,
      decodeImageImpl,
    }),
    (err) => err.code === 'unapproved-source',
  )
  // missing source header fails closed
  await assert.rejects(
    fetchTerrariumTileHeights({
      ...base,
      fetchImpl: makeOkFetch({ sourceHeader: null }).fetchImpl,
      decodeImageImpl,
    }),
    (err) => err.code === 'unapproved-source',
  )
})

test('successful fetch decodes terrarium pixels into a 256x256 height grid', async () => {
  const { fetchImpl, decodeImageImpl, calls } = makeOkFetch()
  const { heights, sources } = await fetchTerrariumTileHeights({ z: 11, x: 560, y: 764, fetchImpl, decodeImageImpl })
  assert.equal(calls.length, 1)
  assert.equal(calls[0], terrariumTileUrl('https://s3.amazonaws.com/elevation-tiles-prod/terrarium', 11, 560, 764))
  assert.equal(heights.length, 256 * 256)
  assert.deepEqual(sources, ['ned/test_ned19.tif'])
  // row-major, row 0 = north: h(i, j) = i + 10*j
  assert.equal(heights[0], 0)
  assert.equal(heights[1], 1)
  assert.equal(heights[256], 10)
  assert.equal(heights[255 * 256 + 255], 255 + 10 * 255)
})

// ---- resampling ----

test('bilinear resample preserves edges and interpolates interior', () => {
  // 2x2 -> 3x3: corners preserved, center is the mean
  const src = new Float32Array([0, 10, 20, 30]) // [h00, h10, h01, h11]
  const out = resampleHeightmapBilinear(src, 2, 3)
  assert.equal(out.length, 9)
  assert.equal(out[0], 0)
  assert.equal(out[2], 10)
  assert.equal(out[6], 20)
  assert.equal(out[8], 30)
  assert.equal(out[4], 15)
  assert.equal(out[1], 5)

  // 256 -> 65 edge equality: out edges map exactly onto src edges
  const big = new Float32Array(256 * 256)
  for (let j = 0; j < 256; j += 1) for (let i = 0; i < 256; i += 1) big[j * 256 + i] = i + 10 * j
  const res = resampleHeightmapBilinear(big, 256, 65)
  assert.equal(res.length, 65 * 65)
  assert.equal(res[0], big[0])
  assert.equal(res[64], big[255])
  assert.equal(res[64 * 65], big[255 * 256])
  assert.equal(res[64 * 65 + 64], big[255 * 256 + 255])
  // interior midpoint: src(127.5, 127.5) -> mean of 1397, 1398, 1407, 1408
  assert.ok(Math.abs(res[32 * 65 + 32] - 1402.5) < 1e-6)
})

// ---- provider construction, attribution, status, degradation ----

test('provider uses a 65x65 heightmap on a 1x1 level-zero mercator tree with required credit', () => {
  const Cesium = makeMockCesium()
  createTerrariumTerrainProvider(Cesium, {})
  assert.equal(Cesium.captured.terrainOpts.width, TERRAIN_HEIGHTMAP_SIZE)
  assert.equal(Cesium.captured.terrainOpts.height, TERRAIN_HEIGHTMAP_SIZE)
  assert.equal(Cesium.captured.schemeOpts.numberOfLevelZeroTilesX, 1)
  assert.equal(Cesium.captured.schemeOpts.numberOfLevelZeroTilesY, 1)
  const credit = Cesium.captured.terrainOpts.credit
  const creditText = typeof credit === 'string' ? credit : credit?.text
  assert.match(creditText, /USGS 3DEP\/SRTM\/GMTED2010/)
  assert.match(creditText, /NOAA ETOPO1/)
  assert.match(creditText, /Mapzen\/AWS Terrain Tiles/)
  assert.equal(TERRAIN_CREDIT_TEXT, creditText)
})

test('approved tile callback returns a 65x65 Float32Array and reports active status', async () => {
  const Cesium = makeMockCesium()
  const { fetchImpl, decodeImageImpl } = makeOkFetch()
  const statuses = []
  const { provider, getStatus } = createTerrariumTerrainProvider(Cesium, {
    fetchImpl,
    decodeImageImpl,
    onStatusChange: (s) => statuses.push(s),
  })
  const result = provider.callback(560, 764, 11)
  assert.ok(result instanceof Promise)
  const heights = await result
  assert.ok(heights instanceof Float32Array)
  assert.equal(heights.length, 65 * 65)
  assert.equal(getStatus().status, 'active')
  assert.equal(getStatus().fetchSuccesses, 1)
  assert.equal(getStatus().fetchFailures, 0)
  assert.ok(statuses.some((s) => s.status === 'active'))
})

test('sustained approved-fetch failure reports unavailable exactly once and never fabricates', async () => {
  const Cesium = makeMockCesium()
  const statuses = []
  const failingFetch = async () => ({ ok: false, status: 503 })
  const { provider, getStatus, isUnavailable } = createTerrariumTerrainProvider(Cesium, {
    fetchImpl: failingFetch,
    decodeImageImpl: async () => {
      throw new Error('unreachable')
    },
    onStatusChange: (s) => statuses.push(s),
    maxFailuresBeforeUnavailable: 3,
  })
  // individual tile promises reject (engine upsamples the real parent)
  await assert.rejects(provider.callback(560, 764, 11))
  await assert.rejects(provider.callback(561, 764, 11))
  await assert.rejects(provider.callback(560, 765, 11))
  await assert.rejects(provider.callback(561, 765, 11))
  const st = getStatus()
  assert.equal(st.status, 'unavailable')
  assert.equal(st.fetchSuccesses, 0)
  assert.equal(isUnavailable(), true)
  const unavailables = statuses.filter((s) => s.status === 'unavailable')
  assert.equal(unavailables.length, 1)
})

test('unapproved-source tiles reject and count as source rejections', async () => {
  const Cesium = makeMockCesium()
  const { fetchImpl, decodeImageImpl } = makeOkFetch({ sourceHeader: 'cdem/canada.tif' })
  const { provider, getStatus } = createTerrariumTerrainProvider(Cesium, { fetchImpl, decodeImageImpl })
  await assert.rejects(provider.callback(560, 764, 11), (err) => err.code === 'unapproved-source')
  assert.equal(getStatus().sourceRejections, 1)
})

test('degradeGlobeToEllipsoid swaps terrain off without touching the camera', () => {
  const Cesium = makeMockCesium()
  let renders = 0
  const viewer = {
    isDestroyed: () => false,
    scene: { globe: { terrainProvider: { old: true } }, requestRender: () => { renders += 1 } },
  }
  assert.equal(degradeGlobeToEllipsoid(Cesium, viewer), true)
  assert.ok(viewer.scene.globe.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)
  assert.equal(renders, 1)
  assert.equal(degradeGlobeToEllipsoid(Cesium, null), false)
  assert.equal(degradeGlobeToEllipsoid(null, viewer), false)
})

test('camera state is identical through terrain degradation', () => {
  const Cesium = makeMockCesium()
  const math = { toDegrees: (r) => (r * 180) / Math.PI }
  const rad = (d) => (d * Math.PI) / 180
  const camera = {
    positionCartographic: { longitude: rad(-81.7), latitude: rad(41.4), height: 34641.016 },
    heading: rad(346),
    pitch: rad(-32),
    roll: rad(0),
  }
  const before = cameraStateFromGlobeCamera(math, camera, 'city')
  const viewer = { isDestroyed: () => false, scene: { globe: {}, requestRender: () => {} } }
  degradeGlobeToEllipsoid(Cesium, viewer)
  const after = cameraStateFromGlobeCamera(math, camera, 'city')
  assert.deepEqual(before, after)
  // restore floor is the exact computed city ceiling (no terrain term)
  assert.ok(Math.abs(after.heightMeters - heightMetersForPrecisionClass('city')) < 1e-6)
})

// ---- Stage C floor contract remains terrain-independent ----

test('the 34,641.016 m city floor carries no terrain term', () => {
  const floor = heightMetersForPrecisionClass('city')
  assert.ok(Math.abs(floor - 34641.016) < 1e-3)
  // every minimumZoomDistance assignment (possibly wrapped to a second line)
  // must derive only from the precision-class helpers — never terrain heights
  const assignments = ADAPTER_SRC.match(/minimumZoomDistance\s*=\s*[^\n]*(\n\s+[^\n]*)?/g) ?? []
  assert.ok(assignments.length >= 2, 'expected mount + fly-to clamp assignments')
  for (const a of assignments) {
    assert.match(a, /heightMetersForPrecisionClass|cam\.minZoomDistanceMeters/)
  }
  assert.doesNotMatch(ADAPTER_SRC, /globeHeight/)
  // terrain module code contains no camera/precision concepts (comments stripped)
  const providerCode = PROVIDER_SRC.split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  assert.doesNotMatch(providerCode, /precision_class|minimumZoomDistance|investigationContext/i)
})

// ---- epistemic + governance guards ----

test('terrain module is display-only and governance-clean', () => {
  assert.doesNotMatch(PROVIDER_SRC, /Ion\.defaultAccessToken|defaultAccessToken\s*=|ion\s*access\s*token|CESIUM_ION_ACCESS_TOKEN|ION_ACCESS_TOKEN/i)
  assert.doesNotMatch(PROVIDER_SRC, /GEV\b|ion\.cesium|photorealistic 3d|google 3d tiles/i)
  assert.doesNotMatch(PROVIDER_SRC, /api[_-]?key|apikey|accessToken\b|access[_-]?token/i)
  assert.doesNotMatch(PROVIDER_SRC, /spatialProjection|investigationContext|supabase/i)
  // never zero-fills missing tiles: the only undefined returns are synchronous
  assert.doesNotMatch(PROVIDER_SRC, /fill\(0\)|new Float32Array\([^)]*\)\s*\/\//)
})

test('adapter and dispatcher expose terrain status + probe passthrough; canvas renders disclosure', () => {
  assert.match(ADAPTER_SRC, /onTerrainStatusChange/)
  assert.match(ADAPTER_SRC, /createTerrariumTerrainProvider\(Cesium/)
  assert.match(ADAPTER_SRC, /terrainProvider: terrainPlan\.provider/)
  assert.match(ADAPTER_SRC, /degradeGlobeToEllipsoid/)
  assert.match(ADAPTER_SRC, /getTerrainStatus/)
  assert.match(ADAPTER_SRC, /sampleTerrainHeights/)
  // the sampler must consult the bounded availability policy before calling
  // the engine sampling helper, which retries deferred (unserved) tiles
  // indefinitely — an out-of-coverage sample would otherwise never resolve
  assert.match(ADAPTER_SRC, /getTileDataAvailable\?\.\(tile\.x, tile\.y, level\) === true/)
  assert.match(DISPATCHER_SRC, /getTerrainStatus: \(\) => impl\?\.getTerrainStatus/)
  assert.match(DISPATCHER_SRC, /sampleTerrainHeights: \(pairs, level\) => impl\?\.sampleTerrainHeights/)
  assert.match(CANVAS_SRC, /TERRAIN_DISCLOSURE_TEXT/)
  assert.match(CANVAS_SRC, /TERRAIN_UNAVAILABLE_TEXT/)
  assert.match(CANVAS_SRC, /data-terrain-status/)
  assert.match(CANVAS_SRC, /__MIP_WORLD_VIEW_TERRAIN_PROBE__/)
  assert.match(TERRAIN_DISCLOSURE_TEXT, /display-only/)
  assert.match(TERRAIN_DISCLOSURE_TEXT, /never evidence/)
  assert.match(TERRAIN_UNAVAILABLE_TEXT, /reference ellipsoid/)
})
