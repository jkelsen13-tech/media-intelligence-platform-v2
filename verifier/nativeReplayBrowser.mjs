// Synthetic-only browser integration and responsive verifier. Never reads private artifacts.
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { replayPrivateInput } from '../scripts/nativeOfflineReplay.mjs'
import { syntheticReplayInput } from '../tests/fixtures/nativeReplaySynthetic.mjs'
const require=createRequire(import.meta.url)
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild')
const {chromium}=process.argv[2]?await import(pathToFileURL(process.argv[2]).href):await import('playwright')
const input=syntheticReplayInput(6), replay=replayPrivateInput(input,{expectedCount:6})
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {ReplayComparison,ReplayWorkspace} from './scripts/nativeReplayWorkspace.jsx';import GraphView from './src/graph/GraphView.jsx';import {replayGraph} from './scripts/privateReplayClient.mjs';import './src/index.css';import './scripts/demo-corpus-preview.css';const replay=${JSON.stringify(replay)};const sources=replay.candidates.map(c=>({...c,preview_id:c.capture_id}));const investigation={sources,topic:'all'};const graph=replayGraph(replay,sources);function App(){const [surface,setSurface]=React.useState('context');return <div className="demo-native-app"><nav><button onClick={()=>setSurface('context')}>Context fixture</button><button onClick={()=>setSurface('compare')}>Comparison fixture</button><button onClick={()=>setSurface('graph')}>Graph fixture</button></nav><main>{surface==='context'?<ReplayWorkspace replay={replay} investigation={investigation}/>:surface==='compare'?<ReplayComparison replay={replay} investigation={investigation} onSelect={()=>{}}/>:<div style={{height:600}}><h2>Pending candidate graph fixture</h2><GraphView nodes={graph.nodes} edges={graph.edges} focused panelOpen={false}/></div>}</main></div>};createRoot(document.getElementById('root')).render(<App/>);`
const bundled=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'synthetic-browser-output',format:'esm',jsx:'automatic',loader:{'.png':'dataurl'},logLevel:'silent'})
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text
const css=bundled.outputFiles.find(f=>f.path.endsWith('.css')).text.replace(/@import[^;]+;/g,'')
const server=createServer((req,res)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css)}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined})
const errors=[],external=[]
try {
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url())})
  await mkdir('.private-demo/synthetic-browser',{recursive:true})
  const checks=[]
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByText('Private native offline replay',{exact:true}).waitFor()
    await page.getByRole('button',{name:'What Changed',exact:true}).click();assert.ok(await page.getByText('Artifacts added by this isolated run',{exact:false}).isVisible())
    await page.getByRole('button',{name:'Evidence Checks',exact:true}).click();assert.ok(await page.getByText('capture_payload_hash: retained_unverified',{exact:true}).first().isVisible())
    await page.getByRole('button',{name:'Comparison fixture',exact:true}).click();await page.getByRole('heading',{name:'Pending lexical claim comparison'}).waitFor()
    await page.getByText('Exact source membership and evidence',{exact:true}).first().click();assert.ok(await page.getByText('Exact bounded excerpt',{exact:false}).first().isVisible())
    await page.getByRole('combobox',{name:'Claim groups'}).selectOption('unique');await page.getByRole('combobox',{name:'Claim groups'}).selectOption('all')
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false,`overflow at ${width}`)
    await page.screenshot({path:`.private-demo/synthetic-browser/comparison-${width}.png`,fullPage:true})
    await page.getByRole('button',{name:'Graph fixture',exact:true}).click();await page.locator('canvas').first().waitFor()
    await page.waitForFunction(()=>document.querySelector('.graph-canvas')?._cyreg?.cy?.scratch('initialFitState')==='complete')
    const graphState=await page.evaluate(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy;return {nodes:cy.nodes().length,edges:cy.edges().length,pending:cy.edges().every(e=>e.style('line-style')==='dashed'&&e.style('target-arrow-shape')==='none'&&e.style('source-arrow-shape')==='none'),zoom:cy.zoom()}})
    assert.equal(graphState.pending,true);assert.ok(graphState.edges>0)
    await page.screenshot({path:`.private-demo/synthetic-browser/graph-${width}.png`})
    checks.push({width,comparison:true,context:true,graph:true,overflow:false})
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  console.log(JSON.stringify({synthetic:true,checks,counts:replay.counts,browser_errors:errors.length,external_requests:external.length}))
} finally {await browser.close();await new Promise(r=>server.close(r))}
