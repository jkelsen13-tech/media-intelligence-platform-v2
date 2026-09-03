// R4.9 Stage B repair — regression tests for the GitHub Pages base-path bug.
//
// Live failure being pinned down (2026-09-03): the deployed Pages build
// resolved CESIUM_BASE_URL to domain-root '/cesium/' (404 for Workers and
// Assets) instead of the deployment-subpath 'cesium/' URL (200), and
// the resulting fatal Cesium render error showed a black canvas with
// Cesium's raw error modal instead of falling back to MapLibre.
//
// Root cause: the optional-chained member-expression form of
// import.meta.env access is not statically replaced by Vite in production
// builds, so it evaluated to undefined in the bundle and fell back to '/'.
//
// These tests lock in:
// - subpath URL formation (with/without trailing slash, root, unset)
// - CESIUM_BASE_URL is set BEFORE the lazy Cesium import
// - plain (statically replaceable) import.meta.env access, no `?.` anti-pattern
// - fatal boot/render errors fall back to MapLibre honestly (no black canvas)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  resolveCesiumBaseUrl,
} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

const CESIUM_ADAPTER = readFileSync(
  new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js', import.meta.url),
  'utf8',
)

// ---- Subpath URL formation ----

test('resolveCesiumBaseUrl: deployment subpath keeps the base path', () => {
  assert.equal(
    resolveCesiumBaseUrl('/some-deploy-subpath/'),
    '/some-deploy-subpath/cesium/',
  )
})

test('resolveCesiumBaseUrl: missing trailing slash is normalized', () => {
  assert.equal(
    resolveCesiumBaseUrl('/some-deploy-subpath'),
    '/some-deploy-subpath/cesium/',
  )
})

test('resolveCesiumBaseUrl: root deployment stays at domain root', () => {
  assert.equal(resolveCesiumBaseUrl('/'), '/cesium/')
})

test('resolveCesiumBaseUrl: unset/empty base falls back to root (local dev)', () => {
  assert.equal(resolveCesiumBaseUrl(undefined), '/cesium/')
  assert.equal(resolveCesiumBaseUrl(''), '/cesium/')
  assert.equal(resolveCesiumBaseUrl(null), '/cesium/')
})

// ---- Initialization ordering ----

test('CESIUM_BASE_URL is assigned before the lazy Cesium import', () => {
  const assignIdx = CESIUM_ADAPTER.indexOf('globalThis.CESIUM_BASE_URL =')
  const importIdx = CESIUM_ADAPTER.indexOf("await import('cesium')")
  assert.ok(assignIdx !== -1, 'adapter must assign globalThis.CESIUM_BASE_URL')
  assert.ok(importIdx !== -1, 'adapter must lazy-import cesium')
  assert.ok(
    assignIdx < importIdx,
    'CESIUM_BASE_URL must be set before the lazy Cesium import/initialization',
  )
})

test('base URL source is the statically replaceable import.meta.env form', () => {
  // The optional-chained form defeats Vite static replacement in production
  // builds and was the verified root cause of the live 404s.
  assert.doesNotMatch(CESIUM_ADAPTER, /import\.meta\?\.env/)
  assert.match(CESIUM_ADAPTER, /import\.meta\.env\b/)
  // The deployment subpath must come from Vite, never a hard-coded repo slug.
  assert.doesNotMatch(CESIUM_ADAPTER, /media-intelligence-platform-v2/)
})

// ---- Honest fatal fallback ----

test('fatal Cesium boot/render failure falls back to MapLibre, not a black canvas', () => {
  // Cesium's raw "Rendering has stopped" modal must be suppressed...
  assert.match(CESIUM_ADAPTER, /showRenderLoopError/)
  // ...the scene renderError event must be handled...
  assert.match(CESIUM_ADAPTER, /renderError\.addEventListener/)
  // ...and the handler must request the MapLibre fallback stack.
  const handlerMatch = CESIUM_ADAPTER.match(/renderError\.addEventListener\([\s\S]*?\n    \}\)/)
  assert.ok(handlerMatch, 'renderError handler must exist')
  assert.match(handlerMatch[0], /onStackIdChange/)
  assert.match(handlerMatch[0], /openfreemap-positron/)
  // Viewer construction must also be guarded (boot failure).
  assert.match(CESIUM_ADAPTER, /catch \(bootError\)/)
})

test('fallback diagnostics are honest (real error logged, nothing fabricated)', () => {
  // The real error is logged for diagnosis...
  assert.match(CESIUM_ADAPTER, /console\.error\('Cesium render failure/)
  assert.match(CESIUM_ADAPTER, /console\.error\('Cesium failed to boot/)
  assert.match(CESIUM_ADAPTER, /console\.error\('Cesium failed to load/)
  // ...and the raw '[object Object]' modal path is not user-visible: the
  // default modal is replaced by a no-op before any render error can show it.
  assert.match(CESIUM_ADAPTER, /showRenderLoopError = \(\) => \{\}/)
})

// ---- Base imagery layer (Cesium >= 1.107 Viewer API) ----

test('globe imagery is passed as an explicit baseLayer ImageryLayer, not the removed Viewer imageryProvider option', () => {
  // Cesium >= 1.107 removed the Viewer `imageryProvider` constructor option:
  // passing it only suppresses the default base layer and the provider is
  // silently never added, leaving a black (imageless) ellipsoid with zero
  // tile requests. The adapter must construct an explicit ImageryLayer.
  assert.match(CESIUM_ADAPTER, /baseLayer: new Cesium\.ImageryLayer\(imageryProvider\)/)
  const viewerCtor = CESIUM_ADAPTER.match(/new Cesium\.Viewer\(hostEl, \{[\s\S]*?\}\)/)
  assert.ok(viewerCtor, 'Viewer construction must exist')
  assert.doesNotMatch(viewerCtor[0], /^\s*imageryProvider,$/m)
  // Keyless open imagery only.
  assert.match(CESIUM_ADAPTER, /tile\.openstreetmap\.org/)
})
