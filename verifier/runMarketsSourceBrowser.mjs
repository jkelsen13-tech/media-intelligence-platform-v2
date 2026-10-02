import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { marketsSourceFixture, marketFixtureId as id } from '../tests/fixtures/marketsSourceFixture.mjs'
// Actual local App, synthetic supplied source projection only. Every nonlocal
// request is blocked. This does not qualify a directory, provider or admission.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs')
const origin = process.env.MIP_MARKETS_ORIGIN ?? 'http://127.0.0.1:4186'
const out = process.env.MIP_MARKETS_RECEIPTS ?? '/workspace/mip-lane-markets-receipts/browser'
await mkdir(out, { recursive: true })
const fixture = marketsSourceFixture()
const moduleFor = available => `import {createPublicDataBackend} from './publicDataBackend.js';import {createInvestigationBackend} from './investigationBackend.js';const original=createPublicDataBackend(null);export const mipBackend={investigations:createInvestigationBackend(null),publicData:{...original,marketSourceSnapshot:${available ? JSON.stringify(fixture) : 'null'},loadGraph:async()=>({nodes:[],edges:[],source:'synthetic-empty-graph'}),loadCorpusMeta:async()=>null,loadGraphCoverage:async()=>null,loadNodeLocations:async()=>[],loadTopics:async()=>null,loadInvestigationSurface:async()=>null}};`
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
const report = { baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browser: browser.version(), qualification: 'Local actual App; synthetic source-only projection; external requests blocked; no real directory, provider, source bytes or rights qualification.', checks: [], failures: [], blockedRequestCount: 0, fixtureModuleReads: 0 }
try {
 for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 640, height: 360 }]) {
  for (const available of [true, false]) {
   const page = await browser.newPage({ viewport, hasTouch: viewport.width <= 767 }), errors = []
   page.on('pageerror', error => errors.push(error.message))
   await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) {
     if (url.pathname.endsWith('/src/lib/mipBackend.js')) { report.fixtureModuleReads++; return route.fulfill({ status: 200, contentType: 'application/javascript', body: moduleFor(available) }) }
     return route.continue()
    }
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue()
    report.blockedRequestCount++; return route.abort()
   })
   const range = `${fixture.validAt}..2024-04-09T18:00:00.000001Z`
   const link = `#/event/${id(1)}/markets?subject_type=equity&source=${id(300)}&time=${encodeURIComponent(range)}`
   await page.goto(origin + '/media-intelligence-platform-v2/' + link)
   await page.locator('.markets-view').waitFor()
   await page.screenshot({ path: `${out}/${viewport.width}x${viewport.height}-${available ? 'source' : 'unavailable'}.png`, fullPage: true })
   const canonical = () => page.locator('[data-investigation-context]').first().evaluate(n => ({ id: n.dataset.canonicalSubjectId, type: n.dataset.canonicalSubjectType, at: n.dataset.asOfTime, range: n.dataset.selectedTimeRange, assessment: n.dataset.temporalAssessmentReference }))
   const initial = await canonical()
   assert.equal(initial.id, id(1)); assert.equal(initial.type, 'equity'); assert.equal(initial.range, range); assert.equal(initial.assessment, '')
   await page.getByRole('heading', { name: 'Price context', exact: true }).waitFor()
   assert.equal(await page.locator('.market-price').getByText('Prices unavailable', { exact: true }).count(), 1)
   const check = { viewport, available, initial, errors }
   if (available) {
    await page.locator('.market-asset').screenshot({path: `${out}/${viewport.width}x${viewport.height}-identity.png`})
    await page.locator('.market-price').screenshot({path: `${out}/${viewport.width}x${viewport.height}-price-unavailable.png`})
    await page.locator('.market-reporting-record').first().screenshot({path: `${out}/${viewport.width}x${viewport.height}-retained-reporting.png`})
    for (const name of ['Direct reporting', 'Connected developments', 'Broader context']) await page.getByRole('heading', { name, exact: true }).waitFor()
    const input = page.getByLabel('Asset name or symbol', { exact: true }); await input.fill('SAME')
    assert.deepEqual(await canonical(), initial)
    assert.equal(await page.getByRole('region', { name: 'Asset search results' }).getByRole('button').count(), 4)
    const form = page.getByRole('search', { name: 'Find a market asset' })
    await form.getByRole('button', { name: 'Search assets', exact: true }).focus(); await page.keyboard.press('Enter')
    assert.deepEqual(await canonical(), initial)
    await page.getByRole('button', { name: 'Open news timeline', exact: true }).click()
    await page.getByText('This surface has no supported asset join.', { exact: false }).waitFor()
    assert.deepEqual(await canonical(), initial)
    const nav = page.getByRole('navigation', { name: 'Evidence views', exact: true })
    await nav.getByRole('button', { name: 'Graph', exact: true }).click()
    assert.deepEqual(await canonical(), initial)
    if (viewport.width <= 767) {
     await page.getByRole('button', { name: 'Open investigation navigation', exact: true }).click()
     await page.getByRole('dialog', { name: 'Investigation navigation', exact: true }).getByRole('button', { name: 'Markets', exact: true }).focus(); await page.keyboard.press('Enter')
    } else {
     await page.getByRole('complementary', { name: 'Investigation views', exact: true }).getByRole('button', { name: 'Markets', exact: true }).focus(); await page.keyboard.press('Enter')
    }
    await page.locator('.markets-view').waitFor(); assert.deepEqual(await canonical(), initial)
    assert.ok(new URL(page.url()).hash.includes('source=' + id(300)))
    await page.locator('.market-reporting-record').first().getByRole('button', { name: 'Explore this recorded event', exact: true }).click()
    assert.equal((await canonical()).type, 'event'); assert.equal((await canonical()).id, id(900))
    await page.getByRole('button', { name: 'Return to market asset', exact: true }).focus(); await page.keyboard.press('Enter')
    assert.deepEqual(await canonical(), initial)
    await page.reload(); await page.locator('.markets-view').waitFor()
    assert.deepEqual(await canonical(), initial)
    assert.ok(new URL(page.url()).hash.includes('source=' + id(300)))
    await page.getByLabel('Asset name or symbol', { exact: true }).fill('SAME')
    await page.getByRole('region', { name: 'Asset search results' }).getByRole('button').filter({ hasText: 'Synthetic major coin' }).focus(); await page.keyboard.press('Enter')
    assert.equal((await canonical()).id, id(3)); assert.equal((await canonical()).type, 'cryptoasset'); assert.equal((await canonical()).assessment, '')
    await page.reload(); await page.locator('.markets-view').waitFor(); assert.equal((await canonical()).id, id(3))
    check.searchPreviewPreserved = true; check.exactSourceRangeReturnReload = true; check.explicitCryptoSelection = true
   } else {
    await page.getByText('Asset directory unavailable', { exact: true }).waitFor()
    await page.getByLabel('Asset name or symbol', { exact: true }).fill('SAME')
    await page.getByRole('button', { name: 'Search assets', exact: true }).click()
    assert.equal(await page.getByRole('region', { name: 'Asset search results' }).count(), 0)
    assert.deepEqual(await canonical(), initial); check.unavailableNoFabricatedAssets = true
   }
   const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
   assert.equal(overflow, false); assert.deepEqual(errors, [])
   check.overflow = overflow; report.checks.push(check); await page.close()
  }
 }
} catch (error) { report.failures.push(error.stack ?? String(error)); process.exitCode = 1 }
finally { await browser.close(); await writeFile(out + '/report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)) }
