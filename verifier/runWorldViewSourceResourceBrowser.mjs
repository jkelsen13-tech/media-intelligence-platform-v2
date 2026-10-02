// Synthetic cloud-browser fault qualification of production controller and canvas.
// Detached TEST receipts below establish no live provider/source admission.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn,spawnSync} from 'node:child_process'
import {mkdir,writeFile,unlink} from 'node:fs/promises'
const require=createRequire((process.env.MIP_BROWSER_PACKAGE??'/tmp/mip-browser')+'/package.json')
const {chromium}=require('playwright')
const output=process.env.MIP_RESOURCE_EVIDENCE??'/tmp/mip-resource-evidence'
await mkdir(output,{recursive:true})
const html='verifier/.source-resource.html',jsx='verifier/.source-resource.jsx'
await writeFile(html,'<html><body><div id="root"></div><script type="module" src="/verifier/.source-resource.jsx"></script></body></html>')
await writeFile(jsx,`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import WorldMapCanvas from '../src/views/WorldMapCanvas.jsx';
import{createWorldViewRealismController}from'../src/lib/worldViewRealismController.js';
import{createWorldViewLocalResourceBudget}from'../src/lib/worldViewLocalResourceBudget.js';
import{WORLD_VIEW_REALISM_RIGHTS}from'../src/lib/worldViewRealismAdmission.js';
import '../src/index.css';
const source={id:'TEST',kind:'imagery',contentKind:'cartographic',costTier:'cheap',admission:{approved:true,reference:'TEST only'},rights:{reference:'TEST only',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(k=>[k,true]))},attribution:[{text:'TEST only'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'TEST only',assetCrs:'TEST',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},resolutionMeters:1,lod:{min:1,max:15}};
const request={kind:'imagery',bounds:[-81.8,41.1,-81.2,41.8],level:10};
let callback=null,mode='ok',scope=request,clock=0,loads=0,attaches=0,loadedDisposals=0,renderDisposals=0,subscriptions=0,unsubscriptions=0;
const deferred=[];
const transport={load:async(d)=>{loads++;if(mode==='defer')await new Promise(resolve=>deferred.push(resolve));return{observedBytes:10,dispose(){loadedDisposals++}}}};
const renderer={attach:async(l,d)=>{attaches++;return{dispose(){renderDisposals++}}}};
const services={sources:[source],transport,renderer,estimateBytes:()=>{if(mode==='throw')throw Error('TEST estimator');return 100},getRequest:()=>scope,subscribeRequestChanges:cb=>{callback=cb;subscriptions++;return()=>{callback=null;unsubscriptions++}},budgetOptions:{now:()=>clock,idleSuspendMs:10,idleDisposeMs:20}};
const row={mip_object_id:'TEST-row',revision_id:'TEST-rev',spatial_role:'event',subject_graph_node_id:'TEST-event',object_type:'event',precision_class:'city',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},geometry_status:'coarsened_to_precision_class',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_hint:{label:'TEST'}};
const rows=[row],keys=new Set(['TEST-row']);
function Harness(){const[explore,setExplore]=useState(false),[mounted,setMounted]=useState(true),[empty,setEmpty]=useState(false);return <main><button onClick={()=>setExplore(v=>!v)}>Toggle Explore</button><button onClick={()=>setMounted(v=>!v)}>Toggle mount</button><button onClick={()=>setEmpty(true)}>Empty defaults</button>{mounted&&<WorldMapCanvas rows={rows} selectedKeys={keys} realismServices={empty?null:services} explorationActive={explore}/>}</main>};
window.__SOURCE_TEST__={mode:v=>{mode=v},scope:v=>{scope=v;callback?.()},clock:v=>{clock=v},refresh:()=>callback?.(),settle:()=>deferred.splice(0).forEach(fn=>fn()),stats:()=>({loads,attaches,loadedDisposals,renderDisposals,subscriptions,unsubscriptions}),request,
async reserveFault(){let releases=0;const budget={reserve(){throw Error('TEST reserve')},release(){releases++},transition(){}};const c=createWorldViewRealismController({sources:[source],transport,renderer,estimateBytes:()=>100,localBudget:budget});c.interact();await c.select(request);const result={snapshot:c.snapshot(),releases};c.dispose();return result},
async perSessionSettlement(){let settle,oldDisposed=0,newLoads=0;const oldBudget=createWorldViewLocalResourceBudget({maxConcurrent:1}),newBudget=createWorldViewLocalResourceBudget({maxConcurrent:1});const old=createWorldViewRealismController({sources:[source],localBudget:oldBudget,estimateBytes:()=>100,transport:{load:()=>new Promise(resolve=>{settle=resolve})},renderer:{attach:async()=>({dispose(){}})}});old.interact();const pending=old.select(request);old.dispose();const released=oldBudget.snapshot();const fresh=createWorldViewRealismController({sources:[source],localBudget:newBudget,estimateBytes:()=>100,transport:{load:async()=>{newLoads++;return{dispose(){}}}},renderer:{attach:async()=>({dispose(){}})}});fresh.interact();await fresh.select(request);settle({observedBytes:15,dispose(){oldDisposed++}});await pending;const result={released,old:old.snapshot(),fresh:fresh.snapshot(),newLoads,oldDisposed};fresh.dispose();return result},
async controllerJourney(){let fault=false,n=0,disposed=0;const c=createWorldViewRealismController({sources:[source],localBudget:createWorldViewLocalResourceBudget(),estimateBytes:()=>{if(fault)throw Error('TEST estimate');return 100},transport:{load:async()=>{n++;return{dispose(){disposed++}}}},renderer:{attach:async()=>({dispose(){}})}});c.interact();await c.select(request);fault=true;await c.select({...request,bounds:[-81.7,41.2,-81.3,41.7]});const covering=c.snapshot();await c.select({...request,bounds:[-81.1,41.1,-81.01,41.8]});const stale=c.snapshot();c.dispose();return{covering,stale,n,disposed}}};
createRoot(document.getElementById('root')).render(<Harness/>);
`)
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4176','--strictPort'],{stdio:'ignore'})
let browser
const receipts=[]
try{
 const base='http://127.0.0.1:4176/media-intelligence-platform-v2/'
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.MIP_BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort()})
 await page.goto(base+'verifier/.source-resource.html')
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot().localSourceResource)
 const sessions=await page.evaluate(()=>window.__SOURCE_TEST__.perSessionSettlement());assert.equal(sessions.released.pendingRequests,0);assert.equal(sessions.fresh.activeSourceId,'TEST');assert.equal(sessions.old.disposed,true);assert.equal(sessions.old.activeSourceId,null);assert.equal(sessions.newLoads,1);assert.equal(sessions.oldDisposed,1)
 const direct=await page.evaluate(()=>window.__SOURCE_TEST__.controllerJourney())
 assert.equal(direct.covering.activeSourceId,'TEST','covering handle retained when replacement estimator throws')
 assert.equal(direct.covering.reason,'local-admission-failed')
 assert.equal(direct.stale.activeSourceId,null,'out-of-loaded-coverage old handle cannot remain attached')
 assert.equal(direct.stale.status,'fallback');assert.equal(direct.n,1);assert.equal(direct.disposed,1)
 const reserve=await page.evaluate(()=>window.__SOURCE_TEST__.reserveFault())
 assert.equal(reserve.snapshot.reason,'local-admission-failed');assert.equal(reserve.snapshot.activeSourceId,null);assert.equal(reserve.releases,1)
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
 // A real selection key is supplied through the component's canonical helper.
 const selected=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getState())
 assert.equal(selected.layout.stats.inputCount,1)
 await page.evaluate(()=>{window.__SOURCE_TEST__.mode('throw');window.__SOURCE_TEST__.scope({kind:'imagery',bounds:[-81.7,41.2,-81.3,41.7],level:10})})
 await page.getByRole('button',{name:'Toggle Explore',exact:true}).click()
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.reason==='local-admission-failed')
 assert.equal(await page.evaluate(()=>window.__SOURCE_TEST__.stats().loads),1)
 await page.evaluate(()=>{window.__SOURCE_TEST__.mode('defer');window.__SOURCE_TEST__.refresh()})
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.status==='loading')
 await page.evaluate(()=>{window.__SOURCE_TEST__.refresh();window.__SOURCE_TEST__.refresh()})
 assert.equal(await page.evaluate(()=>window.__SOURCE_TEST__.stats().loads),2,'duplicate Explore/refresh admission must not start another transport')
 assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.localBudget.requests),2)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
 await page.evaluate(()=>window.__SOURCE_TEST__.settle())
 await page.waitForFunction(()=>window.__SOURCE_TEST__.stats().loadedDisposals===2)
 assert.equal(await page.evaluate(()=>window.__SOURCE_TEST__.stats().attaches),1,'late hidden completion must not attach')
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));window.__SOURCE_TEST__.mode('ok');window.__SOURCE_TEST__.refresh()})
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.activeSourceId==='TEST')
 await page.evaluate(()=>window.__SOURCE_TEST__.clock(25))
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.disposed===true)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
 assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.lifecycle),'disposed','hidden must not overwrite terminal disposal')
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
 await page.getByRole('button',{name:'Empty defaults',exact:true}).click()
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.localBudget.requests===0)
 const beforeEmpty=await page.evaluate(()=>window.__SOURCE_TEST__.stats().loads)
 await page.getByRole('button',{name:'Toggle Explore',exact:true}).click();await page.getByRole('button',{name:'Toggle Explore',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.__SOURCE_TEST__.stats().loads),beforeEmpty,'empty default bridge starts no transport')
 await page.getByRole('button',{name:'Toggle mount',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.__SOURCE_TEST__.stats().unsubscriptions),1)
 assert.deepEqual(errors,[])
 receipts.push({sessions,localCapsArePerSession:true,direct,reserve,stats:await page.evaluate(()=>window.__SOURCE_TEST__.stats()),pageErrors:errors,externalRequestsBlocked:external.length,throwingEstimator:true,throwingReserve:true,staleCoverage:true,noDoubleReservations:true,hiddenLateSettlement:true,terminalDisposalPreserved:true,emptyDefaults:true,subscriptionCleanup:true})
 await page.screenshot({path:output+'/source-resource.png'})
}finally{
 await browser?.close();server.kill();await unlink(html);await unlink(jsx)
 await writeFile(output+'/receipt.json',JSON.stringify({candidate:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),qualification:'synthetic-cloud-browser-production-controller-and-canvas-only',sourceAdmissionQualified:false,liveAppReaderQualified:false,receipts},null,2))
}
console.log(JSON.stringify({output,receipts}))
