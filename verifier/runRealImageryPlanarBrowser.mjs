import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire('/opt/codex/cua_node/lib/node_modules/package.json')
const { chromium } = require('playwright')
const directory = resolve(process.env.MIP_REAL_IMAGERY_INSPECTION ?? '/workspace/mip-real-imagery-evidence/planar-inspection')
const receipt = JSON.parse(await readFile(resolve(directory, 'consumer-receipt.json'), 'utf8'))
const names = new Set(['index.html', 'consumer-receipt.json', ...receipt.manifest.tiles.map(t => t.name)])
assert.equal(receipt.originalTiffBytesVerifiedLocally, false)
assert.equal(receipt.coverageAdmitted, false)
let bytesServed = 0
const requests = [], blocked = [], errors = []
const server = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
  if (!names.has(name)) { response.writeHead(404); response.end(); return }
  try {
    const data = await readFile(resolve(directory, name))
    if (bytesServed + data.byteLength + receipt.decodedRgbaBytes > receipt.resourceCeilingBytes) {
      response.writeHead(413); response.end(); return
    }
    bytesServed += data.byteLength; requests.push({ name, bytes: data.byteLength })
    response.writeHead(200, { 'Content-Type': name.endsWith('.png') ? 'image/png' : name.endsWith('.json') ? 'application/json' : 'text/html',
      'Cache-Control': 'no-store' })
    response.end(data)
  } catch { response.writeHead(500); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1120, height: 1900 } })
  await context.route('**/*', route => {
    const url = route.request().url()
    if (new URL(url).origin === origin) return route.continue()
    blocked.push(url); return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${origin}/index.html`)
  await page.waitForFunction(() => window.__MIP_REAL_IMAGERY_RESEARCH_OBSERVATION__?.browserImageDecodeComplete === true)
  const observed = await page.evaluate(() => ({ ...window.__MIP_REAL_IMAGERY_RESEARCH_OBSERVATION__,
    images: [...document.images].map(i => ({ src: new URL(i.src).pathname, width: i.naturalWidth, height: i.naturalHeight,
      complete: i.complete, renderedWidth: i.getBoundingClientRect().width, renderedHeight: i.getBoundingClientRect().height })) }))
  assert.equal(observed.images.length, 4)
  assert.equal(observed.images.reduce((n, i) => n + i.width * i.height * 4, 0), receipt.decodedRgbaBytes)
  assert.ok(observed.images.every(i => i.complete && i.width === i.renderedWidth && i.height === i.renderedHeight))
  assert.equal(observed.applicationAdmitted, false)
  assert.equal(observed.geographicRendererQualified, false)
  assert.equal(observed.evidencePointRegistered, false)
  const text = await page.locator('main').innerText()
  assert.match(text, /2023-03-07, day precision/)
  assert.match(text, /planning purposes only/)
  assert.match(text, /legal or cadastral purposes/)
  assert.match(text, /0\.372071057 metres/)
  assert.match(text, /unknown datum/)
  assert.deepEqual(blocked, [])
  assert.deepEqual(errors, [])
  const screenshot = resolve(directory, '../planar-browser.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  const report = { schema: 'mip.real-imagery-planar-browser.v1',
    evidenceLayer: 'cloud Chromium private planar DOM RGB images; no geographic renderer or physical GPU/device proof',
    packageSha256: receipt.packageSha256, observed, requests, bytesServed,
    decodedRgbaBytes: receipt.decodedRgbaBytes, resourceCeilingBytes: receipt.resourceCeilingBytes,
    externalRequestsBlocked: blocked, pageErrors: errors, screenshot,
    appSourceActivated: false, sourceAdmitted: false, originalSourceDecodedLocally: false,
    geographicRendererQualified: false, physicalDeviceQualified: false }
  await writeFile(resolve(directory, '../planar-browser-receipt.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
