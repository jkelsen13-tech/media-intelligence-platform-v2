// Actual post-startup context loss; no private Viewer/Scene or synthetic renderError.
// A native loss which never activates fatal fallback is explicitly UNQUALIFIED.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { cameraStatesEqual, parseCameraState } from '../src/lib/worldViewCameraState.js'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { observeBackendBoundary } from './backendBoundary.mjs'
import { QUALIFICATION_SUBJECT } from './worldViewProjectionFixture.mjs'
import { decodeScreenshotPng, rasterSummary, verifyRasterEvidence } from './worldViewRasterEvidence.mjs'

const require = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')
const { chromium } = require('playwright')
const origin = 'http://127.0.0.1:4173'
const route = origin + '/media-intelligence-platform-v2/#/event/' + QUALIFICATION_SUBJECT + '/world'
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
const savedTarget = Object.freeze({ version: 1, lon: -81.7, lat: 41.4, heightMeters: 500000,
  headingDegrees: 346, pitchDegrees: -32, rollDegrees: 0 })
const state = page => page.evaluate(() => window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState() ?? null)
const camera = page => page.evaluate(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState() ?? null)
const stack = page => page.locator('[data-map-stack]').getAttribute('data-map-stack')
const setCamera = async (page, value) => assert.equal(await page.evaluate(s =>
  window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)), value), true)
const publicContext = page => page.locator('.ws-canonical[data-investigation-context]').evaluate(node =>
  Object.fromEntries(['canonical-subject-type', 'canonical-subject-id', 'parent-event-id', 'as-of-time',
    'selected-time-range', 'temporal-assessment-reference'].map(key => [key, node.getAttribute('data-' + key)])))
// Compare the displayed original geometry/precision and recorded time in memory.
// Do not log article content, provenance payloads, reader responses or credentials.
const evidenceFields = page => page.locator('.wv-inspector').evaluate(node => {
  const wanted = ['When', 'Valid-time precision', 'Location', 'Precision class', 'Geometry status', 'Uncertainty', 'Review', 'Release']
  return Object.fromEntries([...node.querySelectorAll('.wv-field')].map(field =>
    [field.querySelector('dt')?.textContent, field.querySelector('dd')?.textContent]).filter(([key]) => wanted.includes(key)))
})
function periodicDifference(a, b) { return Math.abs(((a - b + 180) % 360 + 360) % 360 - 180) }
function assertRetainedMapCamera(actual, saved, precisionClass) {
  assert.ok(actual, 'fallback exposes actual public scalar MapLibre camera')
  for (const key of ['lon', 'lat', 'zoom', 'bearing', 'pitch', 'bridgeHeightMeters', 'viewportWidthPx', 'minZoom', 'maxZoom'])
    assert.ok(Number.isFinite(actual[key]), 'actual map ' + key + ' is finite')
  assert.equal(actual.precisionClass, precisionClass)
  assert.ok(periodicDifference(actual.lon, saved.lon) < 1e-6, 'fallback retains saved longitude')
  assert.ok(Math.abs(actual.lat - saved.lat) < 1e-6, 'fallback retains saved latitude')
  assert.ok(periodicDifference(actual.bearing, saved.headingDegrees) < 1e-6, 'fallback retains nondefault heading')
  assert.ok(Math.abs(actual.pitch - (90 + saved.pitchDegrees)) < 1e-6, 'fallback uses nadir-to-map pitch bridge')
  assert.ok(Math.abs(actual.bridgeHeightMeters - saved.heightMeters) < 0.01, 'actual raw bridge retains saved height')
  assertPrecisionFloor(actual, precisionClass)
}
function assertPrecisionFloor(actual, precisionClass) {
  assert.ok(actual.zoom <= actual.maxZoom + 1e-8, 'actual user zoom does not exceed live precision cap')
  assert.ok(actual.zoom >= actual.minZoom - 1e-8)
  assert.ok(actual.bridgeHeightMeters >= heightMetersForPrecisionClass(precisionClass) - 0.001,
    'uncapped raw map bridge stays above recorded-precision floor')
}
function sampledColors(image) {
  const colors = new Set(), count = image.width * image.height
  for (let p = 0; p < count; p += Math.max(1, Math.floor(count / 4096))) {
    const i = p * image.channels
    colors.add([image.pixels[i] >> 4, image.pixels[i + 1] >> 4, image.pixels[i + 2] >> 4].join(','))
  }
  return colors.size
}
async function settleGlobe(page) {
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,
    {}, { timeout: 45000 })
  await page.waitForLoadState('networkidle', { timeout: 30000 })
  let previous = (await state(page)).renderedFrames, stable = 0
  for (let i = 0; i < 40 && stable < 4; i++) {
    await delay(100)
    const next = (await state(page)).renderedFrames
    stable = next === previous ? stable + 1 : 0; previous = next
  }
  assert.equal(stable, 4, 'fully rendered globe settles before inducing loss')
}
async function settleMap(page) {
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.waitForLoadState('networkidle', { timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  let previous = (await state(page)).labelLayout?.passes, stable = 0
  assert.ok(Number.isFinite(previous), 'fallback marker layout is actually mounted')
  for (let i = 0; i < 40 && stable < 4; i++) {
    await delay(100)
    const next = (await state(page)).labelLayout?.passes
    stable = next === previous ? stable + 1 : 0; previous = next
  }
  assert.equal(stable, 4, 'fallback lifecycle settles without a layout loop')
}
// This touches only the already-rendered canvas's PUBLIC WebGL API. The browser
// delivers its native loss event; no application callback is invoked or patched.
// Context handles remain local to this evaluate and are never put on window.
async function loseRunningContext(page) {
  return page.locator('.cesium-widget canvas').first().evaluate(canvas => new Promise(resolve => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!gl || !extension) {
      resolve({ extensionAvailable: false, canvasConnected: canvas.isConnected, lostBefore: gl?.isContextLost() ?? null })
      return
    }
    const lostBefore = gl.isContextLost()
    let finished = false
    const finish = receipt => {
      if (finished) return
      finished = true; clearTimeout(timer); canvas.removeEventListener('webglcontextlost', onLost)
      resolve(receipt)
    }
    const onLost = event => {
      // Leave cancellation/restoration policy exactly as the application has it.
      // A task simulating a browser context loss is not a physical GPU crash.
      setTimeout(() => finish({ extensionAvailable: true, lostBefore,
        eventObserved: true, eventTrusted: event.isTrusted, eventType: event.type,
        defaultPrevented: event.defaultPrevented, lostAfter: gl.isContextLost(),
        canvasConnected: canvas.isConnected }), 0)
    }
    const timer = setTimeout(() => finish({ extensionAvailable: true, lostBefore,
      eventObserved: false, lostAfter: gl.isContextLost(), canvasConnected: canvas.isConnected }), 5000)
    canvas.addEventListener('webglcontextlost', onLost)
    try { extension.loseContext() }
    catch { finish({ extensionAvailable: true, lostBefore, triggerThrew: true, canvasConnected: canvas.isConnected }) }
  }))
}

// Vite's current manualChunks puts the adapter and Cesium in cesium-globe.
// Pause that ACTUAL observed lazy chunk response, then destroy its pending host.
// This exercises public browser/network scheduling, not a fabricated lifecycle.
async function delayedBootJourney(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const verifyBoundary = observeBackendBoundary(page), errors = []
  let resolveObserved, release, resolveCompleted, held = false, receipt = null
  const observed = new Promise(resolve => { resolveObserved = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const completed = new Promise(resolve => { resolveCompleted = resolve })
  const rendererRequests = { imagery: 0, terrain: 0, failures: 0 }
  page.on('pageerror', error => errors.push(error.name))
  page.on('console', message => {
    if (message.type() === 'error' && /^Cesium (?:render failure|failed to load)/.test(message.text())) rendererRequests.failures++
  })
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.hostname === 'tile.openstreetmap.org') rendererRequests.imagery++
    if (url.pathname.includes('/terrarium/')) rendererRequests.terrain++
  })
  await page.route('**/assets/*.js', async intercepted => {
    const asset = new URL(intercepted.request().url()).pathname.split('/').at(-1)
    if (held || !/^cesium-globe-[^.]+\.js$/.test(asset)) {
      await intercepted.continue(); return
    }
    held = true
    try {
      const response = await intercepted.fetch()
      receipt = { asset, resourceType: intercepted.request().resourceType(), status: response.status() }
      resolveObserved(receipt)
      await gate
      await intercepted.fulfill({ response })
    } finally { resolveCompleted() }
  })
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    const actualRequest = await Promise.race([observed, delay(15000).then(() => null)])
    assert.ok(actualRequest, 'UNQUALIFIED: no actual lazy Cesium adapter request was observed and paused')
    assert.equal(actualRequest.status, 200); assert.equal(actualRequest.resourceType, 'script')
    await page.getByRole('complementary', { name: 'Selected-event inspector' })
      .getByText('coarsened_to_precision_class', { exact: true }).waitFor({ timeout: 60000 })
    const originalContext = await publicContext(page), originalEvidence = await evidenceFields(page)
    assert.equal(originalContext['canonical-subject-id'], QUALIFICATION_SUBJECT)
    assert.equal(await page.locator('.wv-map-host').count(), 1, 'pending map host actually exists before cancellation')
    assert.equal(await page.locator('.cesium-widget').count(), 0, 'adapter response is paused before Viewer construction')
    await page.getByRole('tab', { name: 'Graph', exact: true }).click()
    assert.equal(await page.getByRole('tab', { name: 'Graph', exact: true }).getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('.wv-map-host').count(), 0, 'Graph actually unmounts pending canvas')
    release(); await completed; await delay(1500)
    assert.equal(await page.locator('.cesium-widget').count(), 0, 'released lazy import cannot resurrect a stale visible Viewer')
    assert.equal(await page.locator('[data-map-stack]').count(), 0, 'cancelled boot cannot switch a hidden renderer stack')
    assert.deepEqual(rendererRequests, { imagery: 0, terrain: 0, failures: 0 }, 'cancelled boot starts no imagery/terrain work or renderer failure')
    assert.deepEqual(await publicContext(page), originalContext); assert.deepEqual(await evidenceFields(page), originalEvidence)
    assert.equal(page.url(), route); assert.deepEqual(errors, [])
    await page.getByRole('tab', { name: 'Map', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-map-stack]')?.dataset.mapStack === 'ellipsoid-globe'
      && window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.renderedFrames > 0, {}, { timeout: 45000 })
    await settleGlobe(page)
    assert.equal(await page.locator('.cesium-widget canvas').count(), 1, 'return to Map creates exactly one active globe')
    assert.ok((await state(page)).markers.length > 0)
    assert.deepEqual(await publicContext(page), originalContext); assert.deepEqual(await evidenceFields(page), originalEvidence)
    assert.equal(rendererRequests.failures, 0); assert.deepEqual(errors, [])
    console.log('MIP_WORLD_DELAYED_BOOT_PASS=' + JSON.stringify({ engine: 'chromium', observedRequest: receipt,
      rendererRequests, canonicalSubject: QUALIFICATION_SUBJECT, backend: verifyBoundary(),
      limitation: 'Checks actual visible canvas resurrection, requests and console failures; private detached Viewer allocation is not directly observable.' }))
  } catch (error) {
    console.log('MIP_WORLD_DELAYED_BOOT_UNQUALIFIED=' + JSON.stringify({ error: error.message, observedRequest: receipt,
      rendererRequests, pageErrorCount: errors.length }))
    throw error
  } finally { release(); await page.close() }
}

async function journey(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 600 })
  const verifyBoundary = observeBackendBoundary(page), errors = [], transitions = []
  const counts = { imagery: 0, terrain: 0, renderFailures: 0 }
  let lossReceipt = null, before = null, saved = null, originalContext = null
  page.on('pageerror', error => errors.push({ name: error.name, message: error.message }))
  page.on('console', message => {
    if (message.type() === 'error' && message.text().startsWith('Cesium render failure; falling back to MapLibre:'))
      counts.renderFailures++
  })
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.hostname === 'tile.openstreetmap.org') counts.imagery++
    if (url.pathname.includes('/terrarium/')) counts.terrain++
  })
  try {
    await page.goto(route)
    await page.getByRole('complementary', { name: 'Selected-event inspector' })
      .getByText('coarsened_to_precision_class', { exact: true }).waitFor({ timeout: 60000 })
    await page.waitForFunction(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
    assert.equal(await stack(page), 'ellipsoid-globe', 'loss starts on a running globe, not startup fallback')
    await setCamera(page, savedTarget); await settleGlobe(page)
    before = await state(page); saved = parseCameraState(await camera(page))
    assert.ok(saved && cameraStatesEqual(saved, savedTarget, 1e-6), 'running globe actually attains nondefault saved orientation/height')
    assert.ok(before.renderedFrames > 0 && before.globeTilesLoaded && before.markers.length > 0,
      'real globe has completed rendered frames, terrain/imagery tiles, and original markers')
    assert.equal(before.requestRenderMode, true)
    assert.equal(counts.renderFailures, 0); assert.deepEqual(errors, [])
    originalContext = await publicContext(page)
    const originalEvidence = await evidenceFields(page), precisionClass = originalEvidence['Precision class']
    assert.equal(originalContext['canonical-subject-id'], QUALIFICATION_SUBJECT)
    assert.equal(precisionClass, 'city'); assert.equal(originalEvidence['Geometry status'], 'coarsened_to_precision_class')
    assert.ok(originalEvidence.Location && originalEvidence.When, 'original location and recorded time are displayed')
    const oldCanvas = await page.locator('.cesium-widget canvas').first().elementHandle()
    const pixels = decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({ type: 'png' }))
    assert.ok(sampledColors(pixels) > 4, 'before-loss map screenshot contains nonuniform rendered content')
    console.log('MIP_WORLD_CONTEXT_LOSS_BEFORE_IMAGE_' + width + '=' +
      (await page.locator('.wv-map-host').screenshot({ type: 'jpeg', quality: 65 })).toString('base64'))
    lossReceipt = await loseRunningContext(page)
    assert.equal(lossReceipt.extensionAvailable, true, 'public WEBGL_lose_context extension must be available')
    assert.equal(lossReceipt.lostBefore, false, 'loss is induced only after a healthy running context')
    assert.equal(lossReceipt.triggerThrew, undefined)
    assert.equal(lossReceipt.eventObserved, true, 'actual native webglcontextlost event observed')
    assert.equal(lossReceipt.eventTrusted, true, 'browser event is trusted, not dispatchEvent')
    assert.equal(lossReceipt.lostAfter, true, 'actual public context reports lost')
    // Request an actual draw through the approved camera contract at the SAME
    // orientation, without private scene access or fabricating renderError.
    if (await stack(page) === 'ellipsoid-globe') await setCamera(page, saved)
    const started = Date.now()
    let current = await stack(page), last = null
    while (Date.now() - started < 25000) {
      if (current !== last) { transitions.push(current); last = current }
      const renderState = await state(page)
      if (current !== 'ellipsoid-globe' && (renderState?.mapCamera || current === 'atlas-fallback')) break
      await delay(100); current = await stack(page)
    }
    if (current === 'ellipsoid-globe') {
      const diagnostic = await state(page)
      throw new Error('UNQUALIFIED: native context loss did not reach fatal fallback; renderFailures=' +
        counts.renderFailures + ', postLossFrames=' + ((diagnostic?.renderedFrames ?? 0) - before.renderedFrames))
    }
    assert.ok(counts.renderFailures > 0, 'observed actual application render failure activates fallback')
    assert.ok(['openfreemap-positron', 'osm'].includes(current),
      'interactive camera continuity requires supported MapLibre fallback; static Atlas cannot attest it')
    await settleMap(page)
    const restored = await state(page)
    assert.equal(restored.rendererKind, 'maplibre-deck.gl')
    assert.equal(await oldCanvas.evaluate(canvas => canvas.isConnected), false, 'failed globe canvas is torn down')
    assertRetainedMapCamera(restored.mapCamera, saved, precisionClass)
    assert.deepEqual(await publicContext(page), originalContext)
    assert.deepEqual(await evidenceFields(page), originalEvidence); assert.equal(page.url(), route)
    const fallbackCanvas = await page.locator('.maplibregl-canvas').elementHandle()
    assert.ok(fallbackCanvas, 'replacement is an actual MapLibre canvas')
    const interact = page.getByRole('button', { name: 'Interact with map', exact: true })
    if (await interact.isVisible().catch(() => false)) await interact.click()
    await page.locator('.maplibregl-canvas').hover()
    await page.mouse.wheel(0, -6000); await delay(1800); await settleMap(page)
    const zoomed = await state(page)
    assert.ok(zoomed.mapCamera.zoom > restored.mapCamera.zoom + 0.5, 'real wheel navigation reaches a closer fallback scale')
    assertPrecisionFloor(zoomed.mapCamera, precisionClass)
    assert.deepEqual(await publicContext(page), originalContext); assert.deepEqual(await evidenceFields(page), originalEvidence)
    await setCamera(page, saved); await settleMap(page)
    const idleBefore = await state(page), idlePixels = decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({ type: 'png' }))
    assertRetainedMapCamera(idleBefore.mapCamera, saved, precisionClass)
    const requestsBefore = { ...counts }
    await delay(1000)
    const idleAfter = await state(page)
    const idleRaster = rasterSummary(decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({ type: 'png' })), idlePixels)
    assert.equal(idleAfter.labelLayout.passes, idleBefore.labelLayout.passes, 'settled fallback has no layout/repaint loop')
    assert.equal(idleRaster.whole.changedPixels, 0, 'settled replacement pixels remain stable')
    assert.equal(counts.imagery, requestsBefore.imagery); assert.equal(counts.terrain, requestsBefore.terrain)
    assert.equal(counts.renderFailures, requestsBefore.renderFailures, 'no repeated fatal transition')
    assert.equal(await fallbackCanvas.evaluate(canvas => canvas.isConnected), true, 'settled fallback does not remount')
    assert.equal(await stack(page), current); assertRetainedMapCamera(idleAfter.mapCamera, saved, precisionClass)
    assert.deepEqual(await publicContext(page), originalContext); assert.deepEqual(await evidenceFields(page), originalEvidence)
    assert.equal(page.url(), route); assert.deepEqual(errors, [])
    console.log('MIP_WORLD_CONTEXT_LOSS_AFTER_IMAGE_' + width + '=' +
      (await page.locator('.wv-map-host').screenshot({ type: 'jpeg', quality: 65 })).toString('base64'))
    console.log('MIP_WORLD_CONTEXT_LOSS_PASS=' + JSON.stringify({ engine: 'chromium', width,
      trigger: 'native WEBGL_lose_context on already-rendered Cesium canvas', lossReceipt, transitions,
      before: { renderedFrames: before.renderedFrames, tilesLoaded: before.globeTilesLoaded, camera: saved },
      fallback: { stack: current, mapCamera: restored.mapCamera, closerMapCamera: zoomed.mapCamera },
      idle: { layoutPasses: idleAfter.labelLayout.passes - idleBefore.labelLayout.passes, changedPixels: idleRaster.whole.changedPixels },
      canonicalSubject: QUALIFICATION_SUBJECT, precisionClass, requests: counts, backend: verifyBoundary(),
      limitation: 'Simulates browser context loss, not physical GPU failure. Height is the approved raw MapLibre display-scale bridge, not physical camera altitude. Idle layout/pixels measure observed behavior, not GPU/FPS.' }))
  } catch (error) {
    console.log('MIP_WORLD_CONTEXT_LOSS_UNQUALIFIED=' + JSON.stringify({ engine: 'chromium', width,
      error: error.message, lossReceipt, transitions, requests: counts, pageErrorCount: errors.length,
      stack: await stack(page).catch(() => null), renderState: await state(page).catch(() => null),
      camera: await camera(page).catch(() => null), originalCanonicalSubject: originalContext?.['canonical-subject-id'] ?? null,
      limitation: 'No success is claimed when actual native loss fails to activate the fatal fallback, or when only static Atlas is available.' }))
    console.log('MIP_WORLD_CONTEXT_LOSS_FAILURE_IMAGE_' + width + '=' +
      (await page.locator('.wv-map-host').screenshot({ type: 'jpeg', quality: 65 }).catch(() => page.screenshot({ type: 'jpeg', quality: 65 }))).toString('base64'))
    throw error
  } finally { await page.close() }
}
let browser
try {
  verifyRasterEvidence()
  let ready = false
  for (let i = 0; i < 40; i++) {
    try { ready = (await fetch(origin + '/media-intelligence-platform-v2/')).ok } catch {}
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, 'built preview is reachable')
  browser = await chromium.launch({ headless: true })
  const failures = []
  try { await delayedBootJourney(browser) } catch (error) { failures.push({ journey: 'delayed-boot', error: error.message }) }
  for (const width of [1280, 390]) {
    try { await journey(browser, width) } catch (error) { failures.push({ width, error: error.message }) }
  }
  assert.deepEqual(failures, [], 'all actual context-loss journeys must qualify; diagnostics above preserve failures')
  console.log('MIP_WORLD_CONTEXT_LOSS_BROWSER_PASS')
} finally { await browser?.close(); server.kill('SIGTERM') }
