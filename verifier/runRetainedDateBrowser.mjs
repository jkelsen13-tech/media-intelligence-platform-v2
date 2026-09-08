// Ephemeral UI harness: production retained-date component, synthetic clocks, no auth/API.
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
import {RetainedInputDates} from './src/components/InvestigationAssessmentTrail.jsx'
const scenarios = [
  ['day', 'Date-only publication', {capture:{payload:{published_at:'2024-04-08'}}}],
  ['microseconds', 'Recorded offset and precision', {capture:{payload:{published_at:'2024-04-08T00:15:00+05:30'},captured_at:'2024-04-08 17:59:00.123456+00'}}],
  ['unqualified', 'Time zone missing', {record_version:{recorded_at:'2024-04-08T03:04:05'}}],
  ['invalid', 'Invalid retained calendar', {record_version:{recorded_at:'2024-02-30T00:00:00Z'}}],
]
createRoot(document.getElementById('root')).render(<div>{scenarios.map(([id,title,input]) =>
  <section id={id} key={id}><h2>{title}</h2><RetainedInputDates input={input}/></section>)}</div>)
`
const compiled = await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const css = await readFile('src/styles/investigation-workspace-panels.css','utf8')
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:16px;color:#172235;background:white}section{max-width:480px;margin-bottom:24px}*{box-sizing:border-box}' + css + '</style></head><body><main id="root"></main><p id="result" role="status"></p><script src="/preview.js"></script></body></html>'
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
  await page.getByText('2024-04-08 (date only)',{exact:true}).waitFor()
  assert.equal(await page.locator('#day time').getAttribute('datetime'),'2024-04-08')
  assert.equal(await page.locator('#unqualified time').count(),0)
  assert.equal(await page.locator('#invalid time').count(),0)
  await page.getByText('2024-04-08 17:59:00.123456 UTC',{exact:true}).waitFor()
  await page.getByText('2024-04-08 00:15:00 UTC+05:30',{exact:true}).waitFor()
  await page.getByText('2024-04-08 03:04:05 (time zone not recorded)',{exact:true}).waitFor()
  await page.getByText('Unrecognized retained date',{exact:true}).waitFor()
  for (const width of [320,390,1280]) {
    await page.setViewportSize({width,height:1000})
    for (const section of await page.locator('section').all()) {
      const box = await section.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width)
      assert.equal(await section.evaluate(el=>el.scrollWidth > el.clientWidth+1),false)
    }
    console.log('MIP_RETAINED_DATE_SCREENSHOT_' + width + '=' + (await page.locator('main').screenshot({type:'jpeg',quality:70})).toString('base64'))
  }
  assert.deepEqual(errors,[])
  console.log('MIP_RETAINED_DATE_PASS=' + JSON.stringify({widths:[320,390,1280],dayPrecision:true,microseconds:true,explicitOffset:true,missingZone:true,invalidRejected:true,pageErrors:0,syntheticOnly:true}))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
