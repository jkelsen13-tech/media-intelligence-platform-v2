import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { cameraStatesEqual, parseCameraState } from '../src/lib/worldViewCameraState.js'
import { createWorldViewPilotBookmarks } from '../src/lib/worldViewPilotBookmarks.js'
const require = createRequire((process.env.MIP_BROWSER_PACKAGE ?? '/tmp/mip-browser') + '/package.json')
const { chromium } = require('playwright')
const output = process.env.MIP_REALISM_EVIDENCE ?? '/workspace/mip-realism-evidence'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.MIP_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const receipt = { evidenceLayer: 'cloud-chromium-isolated-display-fixture', sourceCoverageQualified: false,
  actualLiveVerified: false, physicalDeviceQualified: false, journeys: [] }
const camera = page => page.evaluate(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
const identity = page => page.locator('.wv-view').evaluate(node => Object.fromEntries([...node.attributes]
  .filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])))
const creditsUnobscured = page => page.locator('[data-world-credits]').evaluate(node =>
  [...node.querySelectorAll('a')].filter(link => link.getClientRects().length).every(link =>
    [...link.getClientRects()].some(r => {
      const front = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return Boolean(front && (front === link || link.contains(front)))
    })))
const readableEvidenceText = node => {
  const body = node.closest('.wv-explore-context-body')
  const clip = body.getBoundingClientRect()
  const range = document.createRange()
  range.selectNodeContents(node)
  return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).some(rect => {
    const front = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return rect.top >= Math.max(0, clip.top) && rect.bottom <= Math.min(innerHeight, clip.bottom)
      && rect.left >= Math.max(0, clip.left) && rect.right <= Math.min(innerWidth, clip.right)
      && Boolean(front && body.contains(front))
  })
}
const unobscuredControl = node => {
  const rect = node.getBoundingClientRect()
  return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
    && [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75]].every(([x, y]) => {
      const front = document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y)
      return Boolean(front && (front === node || node.contains(front)))
    })
}
async function qualifyExpandedEvidence(page) {
  const body = page.locator('.wv-explore-context-body')
  await body.evaluate(node => { node.scrollTop = 0 })
  const globeViewport = await page.locator('.wv-explore-map').boundingBox()
  const viewport = page.viewportSize()
  assert.ok(globeViewport.width > viewport.width * 0.4 && globeViewport.height > Math.min(300, viewport.height * 0.35),
    'expanded evidence retains a substantial globe viewport')
  const geometry = await body.evaluate(node => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
    rect: node.getBoundingClientRect().toJSON(), overflowY: getComputedStyle(node).overflowY }))
  assert.ok(geometry.clientHeight >= 64, 'expanded evidence needs room for several readable text lines')
  assert.equal(geometry.overflowY, 'auto', 'long evidence has its own bounded scroll surface')
  assert.ok(geometry.scrollHeight > geometry.clientHeight, 'qualification fixture exercises scrolling evidence')
  assert.equal(await body.locator('h4').first().evaluate(readableEvidenceText), true, 'evidence heading is visibly readable')
  assert.equal(await body.locator('p').first().evaluate(readableEvidenceText), true, 'evidence availability is visibly readable')
  for (const field of [body.locator('dd').first(), body.locator('dd').last()]) {
    await field.evaluate(node => {
      const scrollBody = node.closest('.wv-explore-context-body')
      scrollBody.scrollTop += node.getBoundingClientRect().top - scrollBody.getBoundingClientRect().top - 8
    })
    assert.equal(await field.evaluate(readableEvidenceText), true, 'evidence values remain readable throughout the bounded scroll surface')
  }
  await body.evaluate(node => { node.scrollTop = 0 })
  for (const name of ['Interact', 'Options', 'Collapse evidence']) {
    assert.equal(await page.getByRole('button', { name, exact: true }).evaluate(unobscuredControl), true,
      `${name} remains accessible with expanded evidence`)
  }
  await page.getByRole('button', { name: 'Interact', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Done — scroll', exact: true }).evaluate(unobscuredControl), true,
    'expanded evidence preserves the gesture release control')
  assert.equal(await page.getByRole('button', { name: 'Options', exact: true }).evaluate(unobscuredControl), true)
  await page.getByRole('button', { name: 'Done — scroll', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Return to page and resume scrolling', exact: true }).evaluate(unobscuredControl), true,
    'expanded evidence preserves access to page restoration')
  assert.equal(await creditsUnobscured(page), true, 'expanded evidence preserves unobscured native attribution')
  return { ...geometry, readableHeading: true, readableAvailability: true, firstAndLastValuesReadable: true,
    globeViewport, controlsAndGestureReleaseAccessible: true, nativeAttribution: true }
}
try {
  for (const [width, height] of [[1180, 900], [390, 844], [834, 900], [844, 390], [667, 375], [740, 360], [568, 320]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 })
    page.setDefaultTimeout(15000)
    console.log(`Starting ${width}px runtime journey`)
    const errors = [], requests = { imagery: 0, terrain: 0, backendWrites: 0 }
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.hostname === 'tile.openstreetmap.org') requests.imagery += 1
      if (url.pathname.includes('/terrarium/')) requests.terrain += 1
      if (url.hostname.endsWith('.supabase.co') && request.method() !== 'GET') requests.backendWrites += 1
    })
    const route = 'http://127.0.0.1:4175/media-intelligence-platform-v2/verifier/worldViewRealismHarness.html?worldViewPrototype=1'
    await page.goto(route)
    await page.waitForFunction(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
    await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
    const beforeIdentity = await identity(page)
    assert.equal(await page.locator('[data-map-stack]').getAttribute('data-map-stack'), 'ellipsoid-globe')
    await page.waitForTimeout(1000)
    const heading = createWorldViewPilotBookmarks({ coordinate: [-81.7, 41.4], precisionClass: 'city' })[3].cameraState
    assert.equal(await page.evaluate(state => window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(state), heading), true)
    await page.waitForTimeout(250)
    const initial = parseCameraState(await camera(page))
    const canvas = await page.locator('.wv-map-host canvas').first().elementHandle()
    await page.getByRole('button', { name: 'Explore World View', exact: true }).click()
    await page.getByRole('dialog', { name: 'Explore World View' }).waitFor()
    await page.waitForTimeout(350)
    const screenshots = []
    for (const [direction, button] of [['immersive', 'A · Immersive'], ['dock', 'B · Split dock']]) {
      await page.getByRole('button', { name: button, exact: true }).click()
      await page.waitForTimeout(250)
      assert.equal(await canvas.evaluate(node => node.isConnected), true, 'layout keeps the same renderer canvas')
      assert.deepEqual(await identity(page), beforeIdentity)
      const geometry = await page.locator('.wv-explore-map').boundingBox()
      assert.ok(geometry.width > width * (width <= 640 ? 0.6 : 0.4) && geometry.height > Math.min(300, height * 0.35), 'prototype preserves a substantial globe viewport')
      const host = await page.locator('.wv-map-host').boundingBox()
      assert.ok(host.height >= geometry.height - 4, 'renderer fills the Explore map, including narrow layouts')
      assert.equal(await creditsUnobscured(page), true, 'native attribution remains unobscured')
      const file = `${output}/explore-${direction}-${width}.png`
      await page.screenshot({ path: file })
      screenshots.push({ direction, file, globeViewport: geometry })
      await page.getByRole('button', { name: 'Evidence & context', exact: true }).click()
      await page.getByRole('button', { name: 'Collapse evidence', exact: true }).waitFor()
      assert.match(await page.locator('.wv-explore-context-body').innerText(), /city/)
      const evidenceGeometry = await qualifyExpandedEvidence(page)
      const expandedFile = `${output}/explore-${direction}-expanded-${width}.png`
      await page.screenshot({ path: expandedFile })
      screenshots.push({ direction, expanded: true, file: expandedFile, evidenceGeometry })
      await page.getByRole('button', { name: 'Collapse evidence', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Interact', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Done — scroll', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Done — scroll', exact: true }).click()
    await page.getByRole('button', { name: 'Close Explore World View', exact: true }).click()
    await page.waitForTimeout(350)
    assert.equal(await canvas.evaluate(node => node.isConnected), true)
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)), initial), 'exit restores the captured camera')
    assert.deepEqual(await identity(page), beforeIdentity)
    await page.getByRole('button', { name: 'Explore World View', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Options', exact: true, includeHidden: true }).count(), 1)
    await page.getByRole('region', { name: 'Visual Fidelity', exact: true }).getByRole('button', { name: 'Visual Fidelity settings', exact: true }).waitFor()
    const map = page.locator('.wv-map-host')
    await map.scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(state => window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(state),
      { ...initial, lon: -81.7, lat: 41.4, heightMeters: 60000, headingDegrees: 0, pitchDegrees: -90 }), true)
    await page.waitForTimeout(500)
    const icon = page.getByRole('button', { name: 'Open selected spatial context', exact: true })
    assert.equal(await icon.count(), 1, 'the selected context must be exercised')
    {
      await icon.click()
      await page.getByRole('complementary', { name: 'Selected spatial context', exact: true }).waitFor()
      await page.screenshot({ path: `${output}/context-${width}.png` })
      if (width === 390) {
        await page.getByRole('button', { name: /Explore context ·/ }).click()
        await page.getByRole('complementary', { name: 'Selected context details', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Evidence & provenance', exact: false }).last().click()
        assert.equal(await creditsUnobscured(page), true, 'expanded mobile context preserves attribution')
        await page.screenshot({ path: `${output}/context-expanded-${width}.png` })
        await page.getByRole('button', { name: 'Collapse context details', exact: true }).click()
      }
      await page.getByRole('button', { name: 'Close spatial context', exact: true }).click()
    }
    await page.getByText('Pilot camera bookmarks', { exact: true }).click()
    for (const label of ['Globe', 'Regional', 'City', 'Close oblique', 'City', 'Regional', 'Globe']) {
      await page.getByRole('group', { name: 'Pilot camera bookmarks', exact: true }).getByRole('button', { name: label, exact: true }).click()
      await page.waitForTimeout(120)
      assert.deepEqual(await identity(page), beforeIdentity)
      const state = parseCameraState(await camera(page))
      assert.ok(state.heightMeters >= 34641 - 0.01)
      if (label === 'Close oblique') {
        await page.getByRole('button', { name: 'Open selected spatial context', exact: true }).waitFor({ state: 'visible' })
        const anchored = await page.getByRole('button', { name: 'Open selected spatial context', exact: true }).boundingBox()
        const globe = await map.boundingBox()
        assert.ok(anchored.x >= globe.x && anchored.x + anchored.width <= globe.x + globe.width
          && anchored.y >= globe.y && anchored.y + anchored.height <= globe.y + globe.height,
        'close-oblique retains the selected point inside the actual globe viewport')
      }
    }
    const usage = await page.evaluate(() => ({ ...window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot(), device: window.__MIP_WORLD_VIEW_USAGE_PROBE__.device() }))
    assert.equal(usage.highCostProviderActive, undefined)
    assert.equal(usage.highFidelityMinutes, 0)
    assert.equal(requests.backendWrites, 0)
    assert.deepEqual(errors, [])
    const idleBefore = await page.evaluate(() => window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
    await page.waitForTimeout(400)
    const idleAfter = await page.evaluate(() => window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
    assert.equal(idleAfter.requestRenderMode, true)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    assert.equal(await page.evaluate(() => window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().state), 'hidden')
    const suspended = await page.evaluate(() => window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().renderedFrames)
    await page.waitForTimeout(400)
    assert.equal(await page.evaluate(() => window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().renderedFrames), suspended,
      'fixture hidden transition suspends deliberate globe rendering')
    await page.evaluate(() => {
      delete document.hidden
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().state), 'visible-idle')
    receipt.journeys.push({ width, height, screenshots, errors, requests, usage,
      idleObservation: { durationMs: 400, frameDelta: idleAfter.renderedFrames - idleBefore.renderedFrames,
        requestRenderMode: idleAfter.requestRenderMode, layoutTiming: idleAfter.layoutTiming },
      cameraRestoration: 'PASS', canonicalAndTimePreserved: 'PASS',
      selectedContext: 'PASS', nativeAttribution: 'PASS', closeObliquePoiInViewport: 'PASS',
      syntheticVisibilitySuspendResume: 'PASS' })
    await page.close()
  }
  receipt.status = 'passed'
} catch (error) {
  receipt.status = 'failed'; receipt.error = error.stack
  for (const context of browser.contexts()) for (const page of context.pages()) {
    try { await page.screenshot({ path: `${output}/failure.png` }); console.log((await page.locator('body').innerText()).slice(-3500)) } catch { /* preserve original failure */ }
  }
  throw error
} finally {
  await writeFile(`${output}/runtime-receipt.json`, JSON.stringify(receipt, null, 2) + '\n')
  await browser.close()
  console.log(JSON.stringify(receipt, null, 2))
}
