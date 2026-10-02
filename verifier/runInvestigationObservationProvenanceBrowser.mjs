import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { observationProvenanceFixture } from '../tests/investigationObservationProvenanceFixture.mjs'

// Production workspace/hook compiled unchanged against a real local SQL response.
// Controlled synthetic rows only. No credential, provider or live database traffic.
const root = fileURLToPath(new URL('../', import.meta.url))
const out = process.env.MIP_DIAGNOSTICS_RECEIPTS ?? '/workspace/mip-lane-diagnostics-receipts/browser'
await mkdir(out, { recursive: true })
const fixture = await observationProvenanceFixture()
await writeFile(out + '/private-owner-fixture.json', JSON.stringify(fixture, null, 2) + '\n')
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Workspace,{PrivateInvestigationInspector as Inspector}from'./src/components/PrivateInvestigationWorkspace.jsx';import{usePrivateInvestigationWorkspace}from'./src/lib/usePrivateInvestigationWorkspace.js';import'./src/index.css';const f=${JSON.stringify(fixture)};window.fixtureCalls=[];const fail=()=>{throw Error('Read-only provenance attempted a write')};const client={list:async()=>({data:{items:[{investigation_id:f.current.investigation_id,version_id:f.current.version.id,revision:f.current.version.revision,question:f.current.version.state.question,access_role:'reviewer'}],has_more:false,next_after:null}}),read:async(id,v)=>{window.fixtureCalls.push(v??'current');return{data:v===f.before.version.id?f.before:f.current}},markReviewed:fail};const checksClient={read:async(id,v)=>({data:v===f.before.version.id?{...f.notRunChecks,version_id:f.before.version.id,observation_id:f.before.observation.id}:f.checks}),run:fail};const reviewsClient={read:async()=>({data:f.reviews}),decide:fail};function Harness(){const[user,setUser]=useState(f.uid);const workspace=usePrivateInvestigationWorkspace({client,checksClient,reviewsClient,userId:user,active:true,initialInvestigationId:f.current.investigation_id});window.fixtureWorkspace=workspace;return <main><button onClick={()=>setUser(null)}>Controlled sign out</button><Workspace workspace={workspace}/><Inspector workspace={workspace}/></main>}createRoot(document.getElementById('root')).render(<Harness/>);`
await esbuild.build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: 'jsx' }, outfile: out + '/harness.js', bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', external: ['node:crypto'], define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } })
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs')
const server = createServer(async (req, res) => {
  const file = req.url === '/harness.js' ? 'harness.js' : req.url === '/harness.css' ? 'harness.css' : null
  if (file) { res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(await readFile(out + '/' + file)); return }
  if (req.url !== '/') { res.statusCode = 404; res.end(); return }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try { browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] }) }
catch (error) { await new Promise(resolve => server.close(resolve)); throw error }
const report = { candidate: execFileSync('git',['rev-parse','HEAD'], { cwd: root, encoding: 'utf8' }).trim(), browser: browser.version(), proposalSha256: fixture.proposalSha256, qualification: 'Actual local PGlite/RPC/handler/client response; actual compiled private workspace/hook; synthetic rows only. No live backend, source rights/bytes, physical device or release qualification.', checks: [], blockedRequests: [] }
try {
  for (const viewport of [{ width: 1280, height: 900 },{ width: 390, height: 844 },{ width: 640, height: 360 }]) {
    const page = await browser.newPage({ viewport }); const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin) return route.continue(); report.blockedRequests.push(url.origin + url.pathname); return route.abort() })
    await page.goto(origin)
    await page.getByRole('button', { name: 'Inspect declared input', exact: true }).first().waitFor()
    assert.equal(await page.locator('[data-relevance-position]').count(), 2)
    assert.ok((await page.locator('#piw-changed').innerText()).includes('Relevance declaration newly recorded'))
    assert.ok((await page.locator('#piw-overview').innerText()).includes('Retained assessment dependency candidate; outside selected scope'))
    const gaps = await page.locator('#piw-gaps').innerText()
    for (const kind of ['not_retained','not_searched','rejected','unknown']) assert.ok(gaps.includes(kind))
    assert.ok(gaps.includes('Declared not_run')); assert.ok(gaps.includes('not a measured retrieval receipt'))
    await page.screenshot({ path: out + `/${viewport.width}-current.png`, fullPage: true })
    const calls = await page.evaluate(() => window.fixtureCalls.length)
    const inspect = page.getByRole('button', { name: 'Inspect declared input', exact: true }).first(); await inspect.focus(); await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => window.fixtureWorkspace.state.inspector.selection.position), fixture.position)
    assert.equal(await page.evaluate(() => window.fixtureCalls.length), calls)
    await page.screenshot({ path: out + `/${viewport.width}-inspector.png`, fullPage: true })
    const baseline = page.getByRole('button', { name: 'Open the compared version', exact: true }); await baseline.focus(); await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('#piw-overview')?.textContent.includes('No usable relevance declarations'))
    assert.equal(await page.locator('[data-relevance-position]').count(), 0)
    assert.equal(await page.evaluate(() => window.fixtureWorkspace.state.inspector), null)
    await page.screenshot({ path: out + `/${viewport.width}-baseline.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const signout = page.getByRole('button', { name: 'Controlled sign out', exact: true }); await signout.focus(); await page.keyboard.press('Enter')
    await page.locator('#piw-overview').waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    report.checks.push({ viewport, ownerDeclarationVisible: true, scopedDispositionsVisible: true, keyboardInspectorExact: true, baselineImmutable: true, signoutClearsPrivate: true, overflow: false, errors })
    await page.close()
  }
  report.pass = true
} catch (error) { report.pass = false; report.failure = error.stack; throw error }
finally { await writeFile(out + '/report.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ pass: report.pass, checks: report.checks.length, receipt: out + '/report.json', failure: report.failure })); }
