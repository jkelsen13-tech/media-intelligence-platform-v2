// Optional local Chromium qualification; no hosted URL, account or activation.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { storyArticleVersionJourneyFixture, storyArticleBackend, compileStoryArticleApp } from './fixtures/storyArticleVersionJourney.mjs'

const receipts = resolve(process.env.MIP_STORY_ARTICLE_RECEIPTS ?? '/workspace/mip-launch-story-article-evidence/browser')
await mkdir(receipts, { recursive: true })
const f = await storyArticleVersionJourneyFixture()
const bundlePath = new URL('./.compiled/App-story-article-browser.mjs', import.meta.url).pathname
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/rest/v1/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const response = await f.dispatch(new Request(origin + req.url, { method: req.method, headers: req.headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }))
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return
    }
    if (req.url === '/app.mjs') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(await readFile(bundlePath)); return }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body><div id="root"></div><script>globalThis.__storyArticleBackend={}</script><script type="module" src="/app.mjs"></script></body></html>')
  } catch (error) { res.writeHead(500); res.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
await compileStoryArticleApp(bundlePath, { platform: 'browser', stdin: { resolveDir: new URL('..', import.meta.url).pathname,
  sourcefile: 'story-article-browser-entry.jsx', loader: 'jsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {createClient} from '@supabase/supabase-js';
import App from './src/App.jsx';import {createNewsBackend} from './src/lib/newsBackend.js';
const ancillary=[];globalThis.__ancillary=ancillary;globalThis.__actor=${JSON.stringify(f.viewer)};
const client=createClient(${JSON.stringify(origin)},'synthetic-public-key',{accessToken:async()=>globalThis.__actor});
Object.assign(globalThis.__storyArticleBackend,(${storyArticleBackend.toString()})(createNewsBackend(client),ancillary,()=> 'service_unavailable',${JSON.stringify(f.graph_node_id)}));
const root=createRoot(document.getElementById('root'));globalThis.__setReader=(actor,ready=true)=>{globalThis.__actor=actor;root.render(<App authSessionOverride={{user:actor?{id:actor}:null,loading:!ready}}/>)};
globalThis.__setReader(globalThis.__actor);` } })
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] })
const report = { qualification: 'Actual App/News/Story/Following DOM; installed SDK over local HTTP to restored SQL publication owners. Personal Following and unrelated analytical views are bounded probes. All nonlocal browser requests blocked.', checks: [], blockedRequests: [], errors: [] }
let context
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || ['blob:','data:'].includes(url.protocol)) return route.continue()
    report.blockedRequests.push(url.origin + url.pathname); return route.abort()
  })
  const route = story => `${origin}/#/story/${story.story_id}?version=${story.public_version_id}`
  const selected = page.getByRole('region', { name: 'Selected reviewed source', exact: true })
  await page.goto(route(f.v1))
  await page.getByRole('button', { name: 'Open article evidence', exact: true }).click()
  await selected.getByText('Analytical links for this exact source version are unavailable.', { exact: true }).waitFor()
  await selected.getByText('Selected source and capture', { exact: true }).click()
  assert.match(await selected.textContent(), new RegExp(f.firstVersion))
  assert.match(await selected.textContent(), new RegExp(f.first.capture_id))
  assert.match(await selected.textContent(), new RegExp(f.first.capture_hash))
  assert.doesNotMatch(await selected.textContent(), /NEWER_REPORT_|CURRENT_ANALYTICAL_HEAD_TOKEN/)
  assert.deepEqual(f.calls.filter(c => c.name === 'read_reviewed_public_article_v1').at(-1).input,
    { p_article_id: f.first.article_id, p_public_version_id: f.firstVersion })
  assert.equal(await page.evaluate(() => __ancillary.length), 0)
  await page.screenshot({ path: receipts + '/historical-story-exact-article.png', fullPage: true })
  report.checks.push('Historical Story button requests its exact admitted article/capture/hash and displays older authorized notice; current analytical joins are never requested.')

  await page.getByRole('button', { name: 'Investigate in graph', exact: true }).click()
  await page.getByRole('button', { name: 'Fixture News', exact: true }).click()
  await selected.getByText('Analytical links for this exact source version are unavailable.', { exact: true }).waitFor()
  assert.match(page.url(), new RegExp(`version=${f.v1.public_version_id}$`))
  assert.match(await selected.textContent(), new RegExp(f.firstVersion))
  assert.equal(await page.evaluate(() => __ancillary.length), 0)
  report.checks.push('Production Story graph action and News return retain exact historical collection and article member without latest mapping.')

  f.holdNextArticle()
  await page.getByRole('button', { name: 'Open article evidence', exact: true }).click()
  // The selection may be the same object, so explicitly force an account read.
  await page.evaluate(actor => __setReader(actor, false), f.viewer)
  await page.waitForFunction(() => !document.querySelector('[aria-label="Selected reviewed source"]')?.textContent.includes('Exact capture digest'))
  await page.evaluate(actor => __setReader(actor), f.viewer)
  for (let i = 0; i < 30 && !f.held(); i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(f.held(), 'actual article SDK response reached controlled hold')
  f.held().data.is_current_source_version = true; f.held().data.superseded_by_public_version_id = null
  await page.evaluate(actor => __setReader(actor), f.secondUser)
  for (let i = 0; i < 30 && f.calls.filter(c => c.name === 'read_reviewed_public_article_v1').at(-1)?.actor !== `Bearer ${f.secondUser}`; i++) await new Promise(resolve => setTimeout(resolve, 10))
  await selected.getByText('Analytical links for this exact source version are unavailable.', { exact: true }).waitFor()
  f.held().release()
  assert.equal(f.calls.filter(c => c.name === 'read_reviewed_public_article_v1').at(-1).actor, `Bearer ${f.secondUser}`)
  await selected.getByText('This earlier reviewed decision remains authorized. A newer reviewed decision is available.', { exact: true }).waitFor()
  report.checks.push('Readiness immediately withholds old detail and account change rechecks exact public evidence, dropping the delayed prior response.')

  await f.db.query('update public.article_claims set is_current=false where id=$1', [f.article_claim_id])
  assert.equal((await f.readArticle(f.first.article_id)).public_version_id, f.secondArticleVersion)
  await page.getByRole('button', { name: 'Open article evidence', exact: true }).click()
  await page.getByText('The selected reviewed source version is unavailable. No newer source decision is substituted.', { exact: true }).waitFor()
  assert.doesNotMatch(await page.locator('body').textContent(), /NEWER_REPORT_|A source reports a vessel arrival|earlier reviewed decision remains authorized/)
  assert.equal(await page.evaluate(() => __ancillary.length), 0)
  await page.screenshot({ path: receipts + '/withdrawn-historical-article-closed.png', fullPage: true })
  report.checks.push('Actual source-claim withdrawal clears cached historical Story and article detail even while a newer attributed report stays independently readable.')
  assert.deepEqual(report.errors, [])
} catch (error) { report.errors.push(error.stack ?? String(error)); process.exitCode = 1 }
finally {
  f.held()?.release(); await context?.close(); await browser.close()
  await new Promise(resolve => server.close(resolve)); await f.db.close()
  report.requests = f.calls
  await writeFile(receipts + '/receipt.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ checks: report.checks, errors: report.errors, blockedRequests: report.blockedRequests.length, receipt: receipts + '/receipt.json' }, null, 2))
}
