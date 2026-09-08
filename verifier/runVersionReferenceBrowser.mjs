// Ephemeral UI harness: exact production component, synthetic versions, no auth/API.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const {chromium} = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')('playwright')
const entry = `
import React from 'react'
import {createRoot} from 'react-dom/client'
import Navigation from './src/components/InvestigationVersionNavigation.jsx'
import {versionNavigationFixture} from './tests/versionNavigationFixture.mjs'
const versions = versionNavigationFixture(), root = createRoot(document.getElementById('root'))
function show(bundle) {
  root.render(<Navigation bundle={bundle} state={{}} onSelectVersion={(investigationId, versionId) => {
    const found = versions.find(v => v.investigation_id === investigationId && v.version.id === versionId)
    if (found) { show(found); document.getElementById('result').textContent = 'Opened exact saved version' }
    else document.getElementById('result').textContent = 'Reference unavailable'
  }} />)
}
show(versions[2])
`
const compiled = await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const css = await readFile('src/styles/investigation-workspace-panels.css','utf8')
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:16px;color:#172235;background:white}*{box-sizing:border-box}' + css + '</style></head><body><main id="root"></main><p id="result" role="status"></p><script src="/preview.js"></script></body></html>'
const server = createServer((req,res) => {
  res.setHeader('content-type', req.url === '/preview.js' ? 'text/javascript' : 'text/html')
  res.end(req.url === '/preview.js' ? compiled.outputFiles[0].text : html)
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
let browser
try {
  browser = await chromium.launch({headless:true})
  const page = await browser.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.getByText('Saved version details',{exact:true}).click()
  await page.getByLabel('Saved-version reference',{exact:true}).fill('revision 1')
  await page.getByRole('button',{name:'Open referenced version',exact:true}).click()
  await page.getByRole('alert').waitFor()
  const reference = await page.locator('dd').first().innerText()
  await page.getByLabel('Saved-version reference',{exact:true}).fill(reference.toUpperCase())
  await page.getByRole('button',{name:'Open referenced version',exact:true}).click()
  await page.getByRole('status').filter({hasText:'Opened exact saved version'}).waitFor()
  assert.equal(await page.getByRole('alert').count(),0)
  for (const width of [320,390,1280]) {
    await page.setViewportSize({width,height:900})
    const form = page.locator('.piw-version-reference')
    const box = await form.boundingBox()
    assert.ok(box && box.x >= 0 && box.x + box.width <= width)
    assert.equal(await form.evaluate(el => el.scrollWidth > el.clientWidth + 1),false)
    const button = await form.getByRole('button').boundingBox()
    assert.ok(button.height >= 44)
    console.log('MIP_VERSION_REFERENCE_SCREENSHOT_' + width + '=' + (await form.screenshot({type:'jpeg',quality:70})).toString('base64'))
  }
  assert.deepEqual(errors,[])
  console.log('MIP_VERSION_REFERENCE_PASS=' + JSON.stringify({widths:[320,390,1280],invalidRejected:true,validAccepted:true,pageErrors:0,syntheticOnly:true}))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
