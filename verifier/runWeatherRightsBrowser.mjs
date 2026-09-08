// Runs only in an ephemeral GitHub Actions runner against the built application.
// Uses the existing public read API. No login, database writes or provider fetches.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')
const { chromium } = require('playwright')
const origin = 'http://127.0.0.1:4173'
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
let browser
try {
  let ready = false
  for (let i = 0; i < 40; i++) {
    try { ready = (await fetch(origin + '/media-intelligence-platform-v2/')).ok } catch {}
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, 'built application preview must start')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const restrictedRequests = []
  const pageErrors = []
  page.on('request', request => {
    if (new URL(request.url()).hostname.endsWith('open-meteo.com')) restrictedRequests.push(request.url())
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(origin + '/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world')
  const inspector = page.getByRole('complementary', { name: 'Selected-event inspector' })
  // Prove we tested a loaded eligible event, not only an empty/error panel.
  await inspector.getByText('coarsened_to_precision_class', { exact: true }).waitFor({ timeout: 60000 })
  const weather = page.getByRole('region', { name: 'Weather', exact: true })
  await weather.getByText('Weather not sourced. No present-day value is substituted.', { exact: true }).waitFor()
  assert.equal(await weather.getAttribute('data-weather-status'), 'unavailable')
  assert.equal(await weather.locator('dd').filter({ hasText: /^Not sourced$/ }).count(), 5)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width >= 1000 ? 1440 : 844 })
    await weather.evaluate(element => element.scrollIntoView({ block: 'center' }))
    const bounds = await weather.boundingBox()
    assert.ok(bounds && bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'weather panel fits viewport ' + width)
    const overflow = await weather.evaluate(element => element.scrollWidth > element.clientWidth + 1)
    assert.equal(overflow, false, 'weather content must not clip horizontally')
    // Public, anonymous weather panel only; encoded in logs for remote visual review.
    const screenshot = await weather.screenshot({ type: 'jpeg', quality: 65, animations: 'disabled' })
    console.log('MIP_WEATHER_SCREENSHOT_' + width + '=' + screenshot.toString('base64'))
    const unoccluded = await weather.evaluate(element => {
      return [element.querySelector('h3'), [...element.querySelectorAll('dd')].at(-1)].every(item => {
        if (!item) return false
        const box = item.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return item === hit || item.contains(hit)
      })
    })
    assert.ok(unoccluded, 'weather heading and last field must be unobscured at ' + width)
    console.log('MIP_WEATHER_VIEWPORT=' + JSON.stringify({ width, bounds, status: 'unavailable' }))
  }
  // Exercise the existing DISPLAY-only acceptance seam in the built app.
  // Public anonymous data only; never access auth state or alter evidence.
  await page.waitForFunction(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
  const beforeRoute = page.url()
  const savedCamera = await page.evaluate(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
  const restored = {version: 1, lon: 10, lat: 40, heightMeters: 2000000,
    headingDegrees: 0, pitchDegrees: -90, rollDegrees: 0}
  await page.getByRole('button', {name: 'Return to selected location', exact: true}).click()
  assert.equal(await page.evaluate(state => window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(state)), restored), true)
  await delay(2000) // Longer than the 1.6-second subject flight.
  const after = JSON.parse(await page.evaluate(() => window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()))
  assert.ok(Math.abs(after.lon - restored.lon) < 0.001 && Math.abs(after.lat - restored.lat) < 0.001,
    'older flight must not overwrite restored camera')
  assert.equal(page.url(), beforeRoute, 'camera restore must preserve subject and time route')
  assert.equal(await page.evaluate(state => window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(state), savedCamera), true)
  await page.getByRole('button', {name: 'Return to selected location', exact: true}).click()
  await delay(2000)
  const map = page.locator('.wv-map-gl')
  await map.scrollIntoViewIfNeeded()
  console.log('MIP_CAMERA_SCREENSHOT=' + (await map.screenshot({type: 'jpeg', quality: 60})).toString('base64'))
  console.log('MIP_CAMERA_RESTORE_PASS=' + JSON.stringify({routePreserved: true, restoredCameraRetained: true}))
  assert.deepEqual(restrictedRequests, [], 'no restricted hosted weather requests')
  assert.deepEqual(pageErrors, [], 'no uncaught application errors')
  console.log('MIP_WEATHER_PREVIEW_PASS=' + JSON.stringify({ widths: [320, 390, 1280], restrictedRequests: 0, loadedReleasedGeometry: true, pageErrors: 0 }))
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
