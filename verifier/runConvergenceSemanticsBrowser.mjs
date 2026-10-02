import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs')
const origin = process.env.MIP_SEMANTICS_ORIGIN ?? 'http://127.0.0.1:4317'
const base = origin + '/media-intelligence-platform-v2/'
const receipts = resolve(process.env.MIP_SEMANTICS_RECEIPTS ?? '/workspace/mip-lane-semantics-receipts')
await mkdir(receipts, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const report = { environment: 'Unconfigured local app; bundled demo corpus; all nonlocal browser requests blocked.', checks: [], failures: [], blockedRequests: [] }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    report.blockedRequests.push(url.origin + url.pathname)
    return route.abort()
  })
  const time = '2026-09-03 01:51:20.123456+00'
  const range = '2025-11-02..2025-11-03'
  await page.goto(base + '#/event/evt-theft/graph?entity=act-soldier-1&time=' + encodeURIComponent(range) + '&at=' + encodeURIComponent(time))
  await page.locator('.article-panel').waitFor({ state: 'visible' })
  const canonical = async () => page.locator('[data-investigation-context]').first().evaluate(el => ({
    subject: el.dataset.canonicalSubjectId, time: el.dataset.asOfTime, range: el.dataset.selectedTimeRange,
  }))
  const initial = await canonical()
  assert.equal(initial.subject, 'evt-theft'); assert.equal(initial.time, time); assert.equal(initial.range, range)
  await page.screenshot({ path: receipts + '/graph-selected-context.png', fullPage: true })
  report.checks.push('Graph reconstructs the named event, entity, exact SQL timestamp and independently selected date range.')
  const explore = page.getByRole('button', { name: 'Explore / Change Topic', exact: true }).filter({ visible: true }).first()
  await explore.click()
  await page.getByRole('dialog', { name: 'Explore / Change Topic' }).waitFor()
  await page.getByRole('dialog', { name: 'Explore / Change Topic' }).screenshot({ path: receipts + '/explore-preserved-context.png' })
  await page.keyboard.press('Escape')
  assert.deepEqual(await canonical(), initial)
  assert.equal(await explore.evaluate(el => el === document.activeElement), true)
  report.checks.push('Explore open/dismiss preserves exact investigation state and restores trigger focus.')
  for (const name of ['Timeline', 'World View', 'Graph']) {
    await page.locator('.ws-nav').getByRole('button', { name, exact: true }).click()
    await page.waitForTimeout(150)
    assert.deepEqual(await canonical(), initial)
  }
  report.checks.push('Graph → Timeline → World View → Graph preserves exact subject, inspection instant and range.')
  await page.evaluate(() => { location.hash = '#/event/evt-arrests/graph' })
  await page.waitForFunction(() => document.querySelector('[data-canonical-subject-id="evt-arrests"]'))
  assert.equal((await canonical()).subject, 'evt-arrests')
  await page.waitForFunction(() => !location.hash.includes('act-soldier-1'))
  report.checks.push('External new-event deep link removes the previous entity selection.')
  const info = page.getByRole('button', { name: 'About this app', exact: true }).filter({ visible: true }).first()
  await info.focus(); await info.click()
  const about = page.getByRole('dialog', { name: 'About', exact: true })
  assert.equal(await about.getAttribute('aria-modal'), 'true')
  assert.equal(await about.evaluate(el => el.contains(document.activeElement)), true)
  await page.keyboard.press('Shift+Tab')
  assert.equal(await about.evaluate(el => el.contains(document.activeElement)), true)
  await page.keyboard.press('Escape')
  assert.equal(await info.evaluate(el => el === document.activeElement), true)
  report.checks.push('About dialog announces modal state, focuses inside, traps reverse Tab and restores origin on Escape.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Explore / Change Topic', exact: true }).filter({ visible: true }).first().click()
  const mobileBefore = await canonical()
  await page.keyboard.press('Escape')
  assert.deepEqual(await canonical(), mobileBefore)
  await page.screenshot({ path: receipts + '/mobile-preserved-context.png', fullPage: true })
  report.checks.push('Narrow-screen Explore dismissal preserves the current event.')
  await context.close()
} catch (error) {
  report.failures.push(error.stack ?? String(error))
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(receipts + '/browser-semantics.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ checks: report.checks, failures: report.failures, blockedRequests: report.blockedRequests.length }, null, 2))
}
