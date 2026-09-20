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
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {ReplayComparison,ReplayWorkspace,ReplayEvidenceLedger,ReplayClusterDetails} from './scripts/nativeReplayWorkspace.jsx';import GraphView from './src/graph/GraphView.jsx';import {replayGraph,replaySearchHint} from './scripts/privateReplayClient.mjs';import './src/index.css';import './scripts/demo-corpus-preview.css';const replay=${JSON.stringify(replay)};const sources=replay.candidates.map(c=>({...c,preview_id:c.capture_id}));const investigation={sources,topic:'all'};const graph=replayGraph(replay,sources);function App(){const [surface,setSurface]=React.useState('context');const [cluster,setCluster]=React.useState(null);const [member,setMember]=React.useState(null);const selectMember=React.useCallback(s=>{location.hash='#/fixture/member/'+s.capture_id;setMember(s);setCluster(null)},[]);const selectGraphNode=React.useCallback(n=>setCluster(replay.clusters.some(c=>c.id===n?.id)?n.id:null),[]);return <div className="demo-native-app"><nav><button onClick={()=>setSurface('context')}>Context fixture</button><button onClick={()=>setSurface('compare')}>Comparison fixture</button><button onClick={()=>setSurface('graph')}>Graph fixture</button><button onClick={()=>setSurface('evidence')}>Evidence fixture</button></nav><p>{replaySearchHint(replay)}</p><p data-selected-member={member?.capture_id}>{member?.candidate_id}</p><main>{surface==='context'?<ReplayWorkspace replay={{...replay,dependencies:[]}} investigation={investigation}/>:surface==='compare'?<ReplayComparison replay={replay} investigation={investigation} onSelect={()=>{}}/>:surface==='evidence'?<ReplayEvidenceLedger replay={replay} investigation={investigation}/>:<><div style={{height:600}}><h2>Pending candidate graph fixture</h2><GraphView nodes={graph.nodes} edges={graph.edges} selectedId={cluster??member?.preview_id} onSelect={selectGraphNode} focused panelOpen={false}/></div><ReplayClusterDetails replay={replay} clusters={replay.clusters} selectedId={cluster} onSelectCluster={setCluster} sources={sources} onSelectSource={selectMember}/></>}</main></div>};createRoot(document.getElementById('root')).render(<App/>);`
const bundled=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'synthetic-browser-output',format:'esm',jsx:'automatic',loader:{'.png':'dataurl'},logLevel:'silent'})
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text
const css=bundled.outputFiles.find(f=>f.path.endsWith('.css')).text.replace(/@import[^;]+;/g,'')
const native=await build({entryPoints:['scripts/demo-corpus-preview.jsx'],bundle:true,write:false,outdir:'synthetic-native-output',format:'esm',jsx:'automatic',define:{'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:false})},loader:{'.png':'dataurl'},logLevel:'silent'})
const nativeJs=native.outputFiles.find(f=>f.path.endsWith('.js')).text
const nativeCss=native.outputFiles.find(f=>f.path.endsWith('.css')).text.replace(/@import[^;]+;/g,'')
const server=createServer((req,res)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");if(req.url==='/private/native-replay.json'){return}else if(req.url==='/native.js'){res.setHeader('Content-Type','application/javascript');res.end(nativeJs)}else if(req.url==='/native.css'){res.setHeader('Content-Type','text/css');res.end(nativeCss)}else if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css)}else{res.setHeader('Content-Type','text/html');res.end((req.url==='/fallback'?'<script type="module" src="/native.js"></script><link rel="stylesheet" href="/native.css">':'')+'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div></body></html>'+(req.url==='/fallback'?'':'<script type="module" src="/app.js"></script>'))}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined})
const errors=[],external=[]
try {
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url())})
  await mkdir('.private-demo/synthetic-browser',{recursive:true})
  const checks=[]
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000})
    const aborted=page.waitForEvent('requestfailed',{predicate:r=>r.url().endsWith('/private/native-replay.json'),timeout:8000}).catch(e=>({timeout:true,message:e.message}))
    await page.goto(`http://127.0.0.1:${server.address().port}/fallback#/demo/all/context`,{waitUntil:'domcontentloaded'})
    await page.getByRole('heading',{name:'Retained evidence workspace',exact:true}).waitFor({timeout:2000})
    assert.ok(await page.locator('.ws-app').isVisible())
    assert.equal((await aborted).timeout,undefined)
    assert.ok(await page.getByRole('heading',{name:'Retained evidence workspace',exact:true}).isVisible())
    await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByText('Private native offline replay',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Source Links',exact:true}).click();assert.equal(await page.locator('a[href^="https://example.test/"]').count(),6)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`source link overflow at ${width}`)
    await page.getByRole('button',{name:'Evidence fixture',exact:true}).click();await page.getByRole('heading',{name:'Pending replay evidence ledger'}).waitFor()
    assert.ok(await page.getByText('6 candidates in scope',{exact:false}).isVisible());assert.equal(await page.getByText('93 exact-field checks blocked',{exact:false}).count(),0)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`evidence ledger overflow at ${width}`)
    assert.ok(await page.getByText('not searched here.',{exact:false}).isVisible())
    await page.getByRole('button',{name:'Context fixture',exact:true}).click()
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
    await page.evaluate(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy;cy.zoom(cy.zoom()*0.9);cy.pan({x:40,y:50});window.__graphBaseline={cy,zoom:cy.zoom(),pan:cy.pan(),nodes:cy.nodes().length,ids:cy.nodes().map(n=>n.id()).sort().join(',')}})
    const firstCluster=replay.clusters[0].id
    await page.evaluate(id=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy;cy.getElementById(id).emit('tap')},firstCluster)
    await page.getByRole('region',{name:'Selected pending cluster'}).waitFor()
    const clusterButton=page.getByRole('button',{name:firstCluster+' · '+replay.clusters[0].capture_ids.length+' member sources · pending',exact:true})
    assert.equal(await clusterButton.getAttribute('aria-pressed'),'true')
    await clusterButton.focus();await page.keyboard.press('Enter')
    const preserved=await page.evaluate(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy,b=window.__graphBaseline;return {instance:cy===b.cy,zoom:cy.zoom()===b.zoom,pan:JSON.stringify(cy.pan())===JSON.stringify(b.pan)}})
    assert.deepEqual(preserved,{instance:true,zoom:true,pan:true})
    await page.getByRole('region',{name:'Selected pending cluster'}).locator('summary').first().click()
    await page.getByRole('button',{name:/Select member source/}).first().click()
    assert.ok(await page.locator('[data-selected-member]').getAttribute('data-selected-member'))
    await page.waitForFunction(()=>location.hash.startsWith('#/fixture/member/')&&location.hash.endsWith(document.querySelector('[data-selected-member]').dataset.selectedMember))
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,120)))))
    const memberPreserved=await page.evaluate(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy,b=window.__graphBaseline;return {instance:cy===b.cy,alive:!b.cy.destroyed(),zoom:cy.zoom()===b.zoom,pan:JSON.stringify(cy.pan())===JSON.stringify(b.pan),nodes:cy.nodes().length===b.nodes,membership:cy.nodes().map(n=>n.id()).sort().join(',')===b.ids}})
    assert.deepEqual(memberPreserved,{instance:true,alive:true,zoom:true,pan:true,nodes:true,membership:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`cluster evidence overflow at ${width}`)
    await page.screenshot({path:`.private-demo/synthetic-browser/graph-${width}.png`})
    checks.push({width,comparison:true,context:true,graph:true,overflow:false,immediate_shell:true,timeout_fallback:true,graph_instance_preserved:true,viewport_preserved:true})
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  console.log(JSON.stringify({synthetic:true,checks,counts:replay.counts,browser_errors:errors.length,external_requests:external.length}))
} catch(error) { console.error(JSON.stringify({browser_errors:errors}));throw error }
finally {await browser.close();await new Promise(r=>server.close(r))}
