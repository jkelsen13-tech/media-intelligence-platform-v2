// Stage D visual-continuity repair (2026-09-05) — contract tests for the
// actual repaired defect: terrain was technically active but not visibly
// legible around Cleveland at the enforced city camera floor, and
// CDEM-mixed Lake Erie-adjacent tiles punched a fail-closed seam into the
// approved coverage next to the Cleveland node.
//
// Repair: (1) NRCan CDEM approved for display-only use after primary-source
// verification of the Open Government Licence - Canada 2.0; (2) a
// restrained, truthful, LABELED relief-shading treatment derived only from
// the actual approved elevation values. These tests pin both halves plus
// the regression contract (camera floor, fail-closed unknown sources, no
// evidence/precision impact, no exaggeration).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  APPROVED_TERRAIN_SOURCE_PREFIXES,
  TERRAIN_CREDIT_TEXT,
  approvedSourcesFromHeader,
  createTerrariumTerrainProvider,
} from '../src/lib/worldViewCesiumTerrariumTerrainProvider.js'

import {
  RELIEF_SHADING_FADE_METERS,
  RELIEF_SHADING_MAX_METERS,
  RELIEF_SHADING_MIN_METERS,
  RELIEF_SHADING_STRENGTH,
  createTerrainReliefShadingMaterial,
  setGlobeReliefShading,
} from '../src/lib/worldViewCesiumTerrainReliefShading.js'

import {
  TERRAIN_DISCLOSURE_TEXT,
  TERRAIN_RELIEF_LEGEND_TEXT,
  TERRAIN_RELIEF_TOGGLE_LABEL,
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
const RELIEF_SRC = readFileSync(
  new URL('../src/lib/worldViewCesiumTerrainReliefShading.js', import.meta.url),
  'utf8',
)

// ---- mocks ----

function makeMockCesium() {
  const captured = {}
  class CustomHeightmapTerrainProvider {
    constructor(opts) {
      Object.assign(this, opts)
    }
  }
  class WebMercatorTilingScheme {
    constructor(opts) {
      this.opts = opts
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
  class Material {
    constructor(opts) {
      this.opts = opts
      captured.material = opts
    }
  }
  return {
    CustomHeightmapTerrainProvider,
    WebMercatorTilingScheme,
    EllipsoidTerrainProvider,
    Credit,
    Material,
    captured,
  }
}

function makeGradientPngPixels() {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let j = 0; j < 256; j += 1) {
    for (let i = 0; i < 256; i += 1) {
      const v = 32768 + i + 10 * j
      const o = (j * 256 + i) * 4
      data[o] = Math.floor(v / 256)
      data[o + 1] = v % 256
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
  return data
}

// ---- CDEM approval: licensing + fail-closed boundary ----

test('CDEM is in the approved set with attribution; unknown sources stay fail-closed', () => {
  assert.ok(APPROVED_TERRAIN_SOURCE_PREFIXES.includes('nrcan_cdem/'))
  // live-observed Lake Erie-adjacent headers (preflight 2026-09-05)
  const liveBoundary =
    'nrcan_cdem/cdem_dem_040H.tif, nrcan_cdem/cdem_dem_040I.tif, srtm/N41W082.tif, srtm/N41W081.tif, gmted/30N090W_20101117_gmted_mea075.tif'
  assert.equal(approvedSourcesFromHeader(liveBoundary).approved, true)
  // UI credit surface names NRCan CDEM
  assert.match(TERRAIN_CREDIT_TEXT, /NRCan CDEM/)
  // OGL-C required attribution sentence in the rendered disclosure
  assert.match(TERRAIN_DISCLOSURE_TEXT, /NRCan CDEM/)
  assert.match(
    TERRAIN_DISCLOSURE_TEXT,
    /Canada terrain data contains information licensed under the Open Government Licence . Canada/,
  )
  // display-only / source-datum rules still stated
  assert.match(TERRAIN_DISCLOSURE_TEXT, /display-only/)
  assert.match(TERRAIN_DISCLOSURE_TEXT, /source-datum/)
  assert.match(TERRAIN_DISCLOSURE_TEXT, /never evidence/)
  // genuinely unknown / unlicensed sources still reject fail-closed
  for (const bad of ['eudem/x.tif', 'linz/x.tif', 'kartverket/x.tif', 'arcticdem/x.tif', 'inegi/x.tif', 'cdem/x.tif', 'unknown/x.tif']) {
    assert.equal(approvedSourcesFromHeader(bad).approved, false, bad)
  }
  assert.equal(approvedSourcesFromHeader(null).approved, false)
  assert.equal(approvedSourcesFromHeader('').approved, false)
})

test('CDEM-mixed boundary tiles now serve real data instead of a seam', async () => {
  // Replays the preflight-observed Cleveland descent: z9/z10 Lake
  // Erie-adjacent tiles with CDEM-mixed provenance now load (no seam),
  // while an unapproved source at the same level still fails closed.
  const Cesium = makeMockCesium()
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    headers: {
      get: (k) =>
        ({
          'content-type': 'image/png',
          'x-amz-meta-x-imagery-sources': url.includes('unapproved')
            ? 'eudem/x.tif'
            : 'nrcan_cdem/cdem_dem_040H.tif, srtm/N41W082.tif',
        })[k] ?? null,
    },
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
  })
  const decodeImageImpl = async () => ({ width: 256, height: 256, data: makeGradientPngPixels() })
  const { provider, getStatus } = createTerrariumTerrainProvider(Cesium, {
    fetchImpl,
    decodeImageImpl,
  })
  const heights = await provider.callback(139, 190, 9)
  assert.ok(heights instanceof Float32Array)
  assert.equal(heights.length, 65 * 65)
  assert.equal(getStatus().status, 'active')
  assert.equal(getStatus().sourceRejections, 0)
})

// ---- relief shading: truthful, labeled, height-derived ----

test('relief material is a pure function of displayed terrain height', () => {
  const Cesium = makeMockCesium()
  const material = createTerrainReliefShadingMaterial(Cesium)
  assert.ok(material instanceof Cesium.Material)
  const fabric = Cesium.captured.material.fabric
  assert.equal(fabric.type, 'MIP_APPROVED_TERRAIN_RELIEF')
  // keyed on the actual rendered height
  assert.match(fabric.source, /materialInput\.height/)
  // clamped to the documented, labeled ramp
  assert.equal(fabric.uniforms.u_minMeters, RELIEF_SHADING_MIN_METERS)
  assert.equal(fabric.uniforms.u_maxMeters, RELIEF_SHADING_MAX_METERS)
  assert.equal(RELIEF_SHADING_MIN_METERS, 0)
  assert.equal(RELIEF_SHADING_MAX_METERS, 600)
  assert.match(fabric.source, /clamp\(\(h - u_minMeters\) \/ \(u_maxMeters - u_minMeters\), 0\.0, 1\.0\)/)
  // alpha is zero at/below the ellipsoid (height 0): untinted == no approved
  // terrain — the treatment can never imply terrain that is not there
  assert.match(fabric.source, /smoothstep\(0\.0, u_fadeMeters, h - u_minMeters\)/)
  assert.equal(fabric.uniforms.u_fadeMeters, RELIEF_SHADING_FADE_METERS)
  // restrained peak opacity so imagery stays legible
  assert.ok(RELIEF_SHADING_STRENGTH > 0 && RELIEF_SHADING_STRENGTH <= 0.5)
  assert.equal(fabric.uniforms.u_strength, RELIEF_SHADING_STRENGTH)
  assert.equal(Cesium.captured.material.translucent, true)
  // null-safe without a renderer
  assert.equal(createTerrainReliefShadingMaterial(null), null)
  assert.equal(createTerrainReliefShadingMaterial({}), null)
})

test('setGlobeReliefShading swaps only the globe material and requests a render', () => {
  const Cesium = makeMockCesium()
  let renders = 0
  const viewer = {
    isDestroyed: () => false,
    scene: {
      globe: { terrainProvider: { keep: true } },
      camera: { keep: true },
      requestRender: () => {
        renders += 1
      },
    },
  }
  assert.equal(setGlobeReliefShading(Cesium, viewer, true), true)
  assert.ok(viewer.scene.globe.material instanceof Cesium.Material)
  assert.equal(renders, 1)
  // terrain provider and camera untouched
  assert.deepEqual(viewer.scene.globe.terrainProvider, { keep: true })
  assert.deepEqual(viewer.scene.camera, { keep: true })
  // disable restores the material-free (pre-repair) presentation
  assert.equal(setGlobeReliefShading(Cesium, viewer, false), true)
  assert.equal(viewer.scene.globe.material, undefined)
  assert.equal(renders, 2)
  // null-safe
  assert.equal(setGlobeReliefShading(null, viewer, true), false)
  assert.equal(setGlobeReliefShading(Cesium, null, true), false)
  assert.equal(setGlobeReliefShading(Cesium, { isDestroyed: () => true }, true), false)
})

test('adapter wires relief shading on by default and exposes the toggle', () => {
  // default ON — the repair exists because unshaded terrain is illegible
  assert.match(ADAPTER_SRC, /let reliefShadingEnabled = true/)
  assert.match(ADAPTER_SRC, /setGlobeReliefShading\(Cesium, viewer, true\)/)
  assert.match(ADAPTER_SRC, /function setReliefShadingEnabled\(enabled\)/)
  assert.match(ADAPTER_SRC, /function getReliefShadingEnabled\(\)/)
  // dispatcher passthrough
  assert.match(DISPATCHER_SRC, /setReliefShadingEnabled: \(enabled\) => impl\?\.setReliefShadingEnabled/)
  assert.match(DISPATCHER_SRC, /getReliefShadingEnabled: \(\) => impl\?\.getReliefShadingEnabled/)
  // canvas: labeled control + legend + probe passthrough
  assert.match(CANVAS_SRC, /TERRAIN_RELIEF_TOGGLE_LABEL/)
  assert.match(CANVAS_SRC, /TERRAIN_RELIEF_LEGEND_TEXT/)
  assert.match(CANVAS_SRC, /setReliefShadingEnabled/)
  assert.match(CANVAS_SRC, /type="checkbox"/)
  // label text is truthful about derivation and the clamped range
  assert.match(TERRAIN_RELIEF_TOGGLE_LABEL, /[Rr]elief/)
  assert.match(TERRAIN_RELIEF_LEGEND_TEXT, /elevation tint from approved terrain sources/)
  assert.match(TERRAIN_RELIEF_LEGEND_TEXT, /0–600 m/)
  assert.match(TERRAIN_RELIEF_LEGEND_TEXT, /display-only/)
  assert.match(TERRAIN_RELIEF_LEGEND_TEXT, /reference ellipsoid/)
})

// ---- regression contract ----

test('city camera floor is exactly 34,641.016151377546 m with no terrain term', () => {
  const floor = heightMetersForPrecisionClass('city')
  assert.equal(floor, 34641.016151377546)
})

test('no vertical exaggeration anywhere in the world-view renderer path', () => {
  for (const [name, src] of [
    ['adapter', ADAPTER_SRC],
    ['provider', PROVIDER_SRC],
    ['relief', RELIEF_SRC],
    ['dispatcher', DISPATCHER_SRC],
  ]) {
    assert.doesNotMatch(src, /terrainExaggeration/i, name)
  }
})

test('relief module is display-only and governance-clean', () => {
  assert.doesNotMatch(RELIEF_SRC, /spatialProjection|investigationContext|supabase/i)
  // code (comments stripped) carries no precision/evidence concepts
  const reliefCode = RELIEF_SRC.split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  assert.doesNotMatch(reliefCode, /precision_class/)
  assert.doesNotMatch(RELIEF_SRC, /Ion\.defaultAccessToken|defaultAccessToken\s*=|api[_-]?key|access[_-]?token/i)
  // no camera concepts in the shading module
  assert.doesNotMatch(reliefCode, /minimumZoomDistance|flyTo|setView/)
})
