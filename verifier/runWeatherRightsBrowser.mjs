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
    await page.setViewportSize({ width, height: 844 })
    await weather.scrollIntoViewIfNeeded()
    const bounds = await weather.boundingBox()
    assert.ok(bounds && bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'weather panel fits viewport ' + width)
    const overflow = await weather.evaluate(element => element.scrollWidth > element.clientWidth + 1)
    assert.equal(overflow, false, 'weather content must not clip horizontally')
    // Public, anonymous weather panel only; encoded in logs for remote visual review.
    const screenshot = await weather.screenshot({ type: 'jpeg', quality: 65, animations: 'disabled' })
    console.log('MIP_WEATHER_SCREENSHOT_' + width + '=' + screenshot.toString('base64'))
    console.log('MIP_WEATHER_VIEWPORT=' + JSON.stringify({ width, bounds, status: 'unavailable' }))
  }
  assert.deepEqual(restrictedRequests, [], 'no restricted hosted weather requests')
  assert.deepEqual(pageErrors, [], 'no uncaught application errors')
  console.log('MIP_WEATHER_PREVIEW_PASS=' + JSON.stringify({ widths: [320, 390, 1280], restrictedRequests: 0, loadedReleasedGeometry: true, pageErrors: 0 }))
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
