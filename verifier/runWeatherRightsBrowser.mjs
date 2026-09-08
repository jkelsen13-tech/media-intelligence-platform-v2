import { observeBackendBoundary } from './backendBoundary.mjs'
// Runs only in an ephemeral GitHub Actions runner against the built application.
// Uses the existing public read API. No login, database writes or provider fetches.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')
const { chromium } = require('playwright')
const origin = process.env.MIP_LIVE_SITE === '1' ? 'https://jkelsen13-tech.github.io' : 'http://127.0.0.1:4173'
const server = process.env.MIP_LIVE_SITE === '1' ? null : spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
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
  const verifyBackend = observeBackendBoundary(page)
  const restrictedRequests = []
  const pageErrors = []
  page.on('request', request => {
    if (new URL(request.url()).hostname.endsWith('open-meteo.com')) restrictedRequests.push(request.url())
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  // Seed only this disposable anonymous browser's navigation key.
  await page.addInitScript(() => {
    localStorage.setItem('mip.recentInvestigations.v1', JSON.stringify([{
      canonical_subject_id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
      canonical_subject_type: 'event', active_view: 'graph',
      selected_time_range: {from:'2024-04-08',to:null,unexpected:'synthetic-extra'},
      unexpected: 'synthetic-extra'
    }]))
  })
  await page.goto(origin + '/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world')
  await page.getByText('Investigation details & recent history', {exact:true}).click()
  const recent = page.getByRole('navigation', {name:'Recent investigations',exact:true})
  await recent.getByRole('button').click()
  await page.waitForFunction(() => {
    const context = document.querySelector('[data-investigation-context]')
    return context?.getAttribute('data-active-view') === 'graph'
      && context.getAttribute('data-canonical-subject-id') === 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
      && context.getAttribute('data-selected-time-range') === '2024-04-08..'
  })
  const storedRecent = await page.evaluate(() => localStorage.getItem('mip.recentInvestigations.v1'))
  assert.doesNotMatch(storedRecent, /synthetic-extra|unexpected/)
  await recent.scrollIntoViewIfNeeded()
  console.log('MIP_RECENT_RESTORE_SCREENSHOT=' + (await recent.screenshot({type:'jpeg',quality:70})).toString('base64'))
  console.log('MIP_RECENT_RESTORE_PASS=' + JSON.stringify({exactSubject:true,view:'graph',timePreserved:true,extraFieldsRemoved:true}))
  await page.getByRole('tablist',{name:'Evidence views',exact:true}).getByRole('tab',{name:'World View',exact:true}).click()
  const inspector = page.getByRole('complementary', { name: 'Selected-event inspector' })
  // Prove we tested a loaded eligible event, not only an empty/error panel.
  await inspector.getByText('coarsened_to_precision_class', { exact: true }).waitFor({ timeout: 60000 })
  const weather = page.getByRole('region', { name: 'Weather', exact: true })
  await weather.getByText('Weather not sourced. No present-day value is substituted.', { exact: true }).waitFor()
  assert.equal(await weather.getAttribute('data-weather-status'), 'unavailable')
  assert.equal(await weather.locator('dd').filter({ hasText: /^Not sourced$/ }).count(), 5)
  // Reproduce the live reset race: choosing End used to publish the new time
  // and immediately reset it to the default through the projection-array effect.
  const timeSlider=page.getByRole('slider',{name:'Recorded time',exact:true})
  await timeSlider.press('End')
  await page.waitForFunction(()=>{
    const slider=document.querySelector('.wv-scrubber input[type="range"]')
    return slider && slider.value===slider.max && slider.max!=='0'
      && document.querySelector('.wv-view')?.getAttribute('data-as-of-time')===slider.getAttribute('aria-valuetext')
  })
  const chosenTime=await timeSlider.getAttribute('aria-valuetext')
  const chosenRange=await page.locator('.wv-view').getAttribute('data-selected-time-range')
  const evidenceTabs=page.getByRole('tablist',{name:'Evidence views',exact:true})
  await evidenceTabs.getByRole('tab',{name:'Timeline',exact:true}).click()
  await evidenceTabs.getByRole('tab',{name:'World View',exact:true}).click()
  await page.waitForFunction(expected=>{
    const slider=document.querySelector('.wv-scrubber input[type="range"]')
    return slider && slider.getAttribute('aria-valuetext')===expected
      && document.querySelector('.wv-view')?.getAttribute('data-as-of-time')===expected
  },chosenTime)
  assert.equal(await timeSlider.inputValue(),await timeSlider.getAttribute('max'),'remount restores the chosen marker')
  await page.getByText('No spatial state recorded at this time.',{exact:true}).first().waitFor()
  await page.reload()
  await page.waitForFunction(expected=>document.querySelector('.wv-scrubber input[type="range"]')?.getAttribute('aria-valuetext')===expected,chosenTime)
  assert.equal(await page.locator('.wv-view').getAttribute('data-as-of-time'),chosenTime)
  assert.equal(await page.locator('.wv-view').getAttribute('data-selected-time-range'),chosenRange,'reload preserves the original scope independently')
  await timeSlider.press('Home')
  await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor()
  await weather.getByText('Weather not sourced. No present-day value is substituted.',{exact:true}).waitFor()
  console.log('MIP_RECORDED_TIME_RETENTION_PASS='+JSON.stringify({explicitChoice:true,viewRoundTrip:true,reload:true,scopePreserved:true,outsideTimeUnplotted:true,homeRestoresRecordedGeometry:true}))
  // A short desktop viewport used to shrink the grid below its children:
  // inspector bottom 701px, layout bottom 622px, review footer top 650px.
  // Test actual rendered boundaries, not particular CSS declarations.
  for (const [width,height] of [[1440,740],[1024,768],[768,900],[390,844]]) {
    await page.setViewportSize({width,height})
    for (const mode of ['Split','Map']) {
      await page.getByRole('tablist',{name:'World View mode',exact:true}).getByRole('tab',{name:mode,exact:true}).click()
      await page.waitForFunction(expected=>document.querySelector('.wv-view')?.dataset.wvMode===expected,mode.toLowerCase())
      const boxes=await page.evaluate(()=>{
        const box=selector=>{
          const r=document.querySelector(selector).getBoundingClientRect()
          return {top:r.top,bottom:r.bottom,height:r.height}
        }
        return {layout:box('.wv-layout'),main:box('.wv-main'),stage:box('.wv-stage'),
          inspector:box('.wv-inspector'),scrubber:box('.wv-scrubber'),footer:box('.wv-view > .ep-trust'),
          surfaces:[...document.querySelectorAll('.wv-stage > .wv-map-panel, .wv-stage > .wv-graph')].map(e=>{
            const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}
          })}
      })
      for (const child of [boxes.main,boxes.inspector]) {
        assert.ok(child.top>=boxes.layout.top-1 && child.bottom<=boxes.layout.bottom+1,'World View row contains its columns '+width+' '+mode)
      }
      assert.ok(boxes.surfaces.length>0,'the rendered map/graph must be present')
      for (const surface of boxes.surfaces) {
        assert.ok(surface.height>=320,'map/graph keeps its reading area')
        assert.ok(surface.top>=boxes.stage.top-1 && surface.bottom<=boxes.stage.bottom+1,'stage contains map/graph '+width+' '+mode)
      }
      assert.ok(boxes.scrubber.top>=boxes.stage.bottom-1,'time controls follow the map/graph '+width+' '+mode)
      assert.ok(boxes.main.bottom>=boxes.scrubber.bottom-1,'main column contains time controls '+width+' '+mode)
      assert.ok(boxes.footer.top>=boxes.layout.bottom-1,'review footer cannot cover inspector or map '+width+' '+mode)
      console.log('MIP_WORLD_VIEW_FLOW_PASS='+JSON.stringify({width,height,mode,boxes}))
    }
  }
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
  // Corrupt only the response in this disposable browser; production rows stay untouched.
  const spatialRoute = 'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/spatial_projection_v1?*'
  let fixtureGeometry = {type:'Polygon',coordinates:{}}
  let fixtureRows = 0
  await page.route(spatialRoute, async route => {
    const response = await route.fetch()
    assert.equal(response.status(),200)
    const rows = await response.json()
    fixtureRows += rows.length
    await route.fulfill({response,json:rows.map(row=>({...row,display_geometry:fixtureGeometry}))})
  })
  const subjectBeforeMalformed = await page.locator('.wv-view').getAttribute('data-canonical-subject-id')
  for (const geometry of [{type:'Polygon',coordinates:{}},{type:'Point',coordinates:['invalid',95]}]) {
    fixtureGeometry=geometry
    await page.reload()
    await inspector.getByText('Insufficient evidence to display a location',{exact:true}).waitFor()
    await page.getByText('No display_geometry available to plot.',{exact:true}).first().waitFor()
    assert.equal(await page.getByRole('button',{name:'Return to selected location',exact:true}).isDisabled(),true)
    assert.equal(await page.locator('.wv-view').getAttribute('data-canonical-subject-id'),subjectBeforeMalformed)
    assert.deepEqual(pageErrors,[],'malformed geometry must not crash the workspace')
  }
  assert.ok(fixtureRows>=2,'malformed checks must exercise loaded public rows')
  console.log('MIP_MALFORMED_GEOMETRY_SCREENSHOT='+(await inspector.screenshot({type:'jpeg',quality:60})).toString('base64'))
  await page.unroute(spatialRoute)
  await page.reload()
  await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor()
  await page.waitForFunction(()=>!document.querySelector('.wv-return-to-selected')?.disabled &&
    document.querySelector('.wv-active-event')?.textContent.includes('Cleveland'))
  assert.equal(await page.getByRole('button',{name:'Return to selected location',exact:true}).isEnabled(),true)
  assert.equal(await page.locator('.wv-view').getAttribute('data-canonical-subject-id'),subjectBeforeMalformed)
  console.log('MIP_GEOMETRY_BOUNDARY_PASS='+JSON.stringify({browserFixtureOnly:true,invalidShapeUnavailable:true,invalidCoordinatesUnavailable:true,subjectPreserved:true,realProjectionRecovered:true}))
  assert.deepEqual(restrictedRequests, [], 'no restricted hosted weather requests')
  console.log('MIP_BACKEND_BOUNDARY_PASS='+JSON.stringify(verifyBackend()))
  assert.deepEqual(pageErrors, [], 'no uncaught application errors')
  console.log('MIP_WEATHER_PREVIEW_PASS=' + JSON.stringify({ widths: [320, 390, 1280], restrictedRequests: 0, loadedReleasedGeometry: true, pageErrors: 0 }))
} finally {
  await browser?.close()
  server?.kill('SIGTERM')
}
