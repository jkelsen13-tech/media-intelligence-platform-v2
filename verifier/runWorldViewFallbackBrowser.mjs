// Bounded real MapLibre fallback qualification. Requires the integrated width
// governor and public raw-map snapshot; no renderer objects or backend writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { parseCameraState } from '../src/lib/worldViewCameraState.js'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { observeBackendBoundary } from './backendBoundary.mjs'
import { installProjectionFixture, QUALIFICATION_SUBJECT } from './worldViewProjectionFixture.mjs'
import { decodeScreenshotPng, rasterSummary, verifyRasterEvidence } from './worldViewRasterEvidence.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json'),{chromium}=require('playwright')
const origin='http://127.0.0.1:4173',subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const route=origin+'/media-intelligence-platform-v2/#/event/'+subject+'/world'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const publicContext=page=>page.locator('.ws-canonical[data-investigation-context]').evaluate(node=>
  Object.fromEntries(['canonical-subject-type','canonical-subject-id','parent-event-id','as-of-time','selected-time-range','temporal-assessment-reference'].map(key=>[key,node.getAttribute('data-'+key)])))
const fallbackState=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
function assertMapPose(actual,expected,label){
  for(const key of ['lon','lat','zoom','bearing','pitch'])assert.ok(Math.abs(actual[key]-expected[key])<1e-9,label+' retains raw '+key)
}
function assertLabelStats(stats,count){
  for(const key of ['points','labels','passes','lastMs','maxMs'])assert.ok(Number.isFinite(stats?.[key])&&stats[key]>=0,key+' detached layout measurement')
  assert.equal(stats.points,count,'all flattened evidence points are retained, including offscreen members')
  assert.ok(stats.labels<=stats.points&&stats.passes>0)
}
async function settleFallback(page){
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.waitForLoadState('networkidle',{timeout:30000})
  await page.evaluate(()=>document.fonts.ready)
  let previous=(await fallbackState(page)).labelLayout.passes,stable=0
  for(let i=0;i<40&&stable<4;i++){await delay(100);const next=(await fallbackState(page)).labelLayout.passes;stable=next===previous?stable+1:0;previous=next}
  assert.equal(stable,4,'settled fallback stops repaint/layout passes')
}
async function mapLabelJourney(browser,kind){
  const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true}),errors=[]
  const verifyBoundary=observeBackendBoundary(page),fixture=await installProjectionFixture(page,kind)
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(kind,...args){
      if(/webgl/i.test(kind)&&this.closest('.cesium-widget'))return null
      return original.call(this,kind,...args)
    }
  })
  try{
    await page.goto(route)
    await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
    await page.waitForFunction(()=>document.querySelector('[data-map-stack]')?.dataset.mapStack==='openfreemap-positron'
      &&window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.labelLayout?.points>0,{},{timeout:45000})
    assert.equal(subject,QUALIFICATION_SUBJECT)
    const originalContext=await publicContext(page)
    assert.equal(originalContext['canonical-subject-id'],subject)
    const local={version:1,lon:-81.7,lat:41.4,heightMeters:100000,headingDegrees:0,pitchDegrees:-90,rollDegrees:0}
    assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),local),true)
    await page.mouse.move(0,0);await settleFallback(page)
    const initial=await fallbackState(page),canvas=await page.locator('.wv-map-host canvas').first().elementHandle()
    assertLabelStats(initial.labelLayout,fixture.coordinateCount)
    if(kind==='dense')assert.equal(initial.labelLayout.labels,1,'selected overlapping dense scene retains one legible label')
    else assert.ok(initial.labelLayout.labels>1,'local sparse scene displays multiple independent labels')
    const viewports=[{width:1280,state:initial}]
    const resizeStarted=Date.now()
    for(const width of [390,320,1280]){
      await page.setViewportSize({width,height:900});await settleFallback(page)
      const actual=await fallbackState(page)
      assertLabelStats(actual.labelLayout,fixture.coordinateCount)
      assertMapPose(actual.mapCamera,initial.mapCamera,'responsive resize')
      assert.equal(await canvas.evaluate(node=>node.isConnected),true,'resize retains the same renderer canvas')
      assert.deepEqual(await publicContext(page),originalContext);assert.equal(page.url(),route)
      if(kind==='dense')assert.equal(actual.labelLayout.labels,1,'dense selected label survives responsive layout')
      if(width===1280)assert.equal(actual.labelLayout.labels,initial.labelLayout.labels,'round trip restores deterministic label count')
      viewports.push({width,state:actual})
    }
    const resizeElapsedMs=Date.now()-resizeStarted
    assert.ok(viewports.at(-1).state.labelLayout.passes>initial.labelLayout.passes,'responsive layout actually recomputes')
    const before=await fallbackState(page),pixels=decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({type:'png'})),start=Date.now()
    await delay(1000)
    const after=await fallbackState(page),comparison=rasterSummary(decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({type:'png'})),pixels)
    assert.equal(after.labelLayout.passes,before.labelLayout.passes,'settled idle has no new layout/repaint passes')
    assert.equal(after.labelLayout.labels,before.labelLayout.labels)
    assert.equal(comparison.whole.changedPixels,0,'settled idle retains rendered label membership and map pixels')
    assertMapPose(after.mapCamera,before.mapCamera,'idle')
    assert.deepEqual(await publicContext(page),originalContext);assert.equal(page.url(),route)
    assert.ok(fixture.matchedRows>0&&fixture.readerRequests>0,'fixture exercised the exact anonymous reader contract')
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_MAP_LABEL_CONTEXT_'+kind+'='+(await page.locator('.wv-view').screenshot({type:'jpeg',quality:65})).toString('base64'))
    console.log('MIP_WORLD_MAP_LABEL_PASS='+JSON.stringify({engine:'chromium',kind,fixture,viewports,resizeElapsedMs,
      idle:{elapsedMs:Date.now()-start,passes:after.labelLayout.passes-before.labelLayout.passes,changedPixels:comparison.whole.changedPixels},backend:verifyBoundary(),
      limitation:'Synthetic display geometry clones one real reader row without changing its identity/time. Points includes offscreen members. Timing measures layout CPU, not GPU/FPS. Probe exposes counts, so unchanged passes plus pixels qualify idle membership rather than reporting hidden label IDs.'}))
  }catch(error){
    console.log('MIP_WORLD_MAP_LABEL_FAILURE='+JSON.stringify({kind,error:error.message,errors,renderState:await fallbackState(page).catch(()=>null)}))
    console.log('MIP_WORLD_MAP_LABEL_FAILURE_IMAGE_'+kind+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}

async function atlasLabelJourney(browser,kind){
  const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true}),errors=[]
  const verifyBoundary=observeBackendBoundary(page),fixture=await installProjectionFixture(page,kind)
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(kind,...args){
      if(/webgl/i.test(kind))return null
      return original.call(this,kind,...args)
    }
  })
  const atlas=page.locator('[data-map-stack="atlas-fallback"]')
  const snapshot=()=>atlas.evaluate(node=>{
    const svg=node.querySelector('svg'),groups=[...node.querySelectorAll('.wv-atlas-labels[visibility="visible"]')]
    const scale=n=>{const m=n.getScreenCTM();return Math.hypot(m.c,m.d)}
    const labels=groups.map(group=>{
      const texts=[...group.querySelectorAll('text')].filter(n=>getComputedStyle(n).visibility==='visible')
      const boxes=texts.map(n=>n.getBoundingClientRect())
      return{left:Math.min(...boxes.map(r=>r.left))-1.5,right:Math.max(...boxes.map(r=>r.right))+1.5,
        top:Math.min(...boxes.map(r=>r.top))-1.5,bottom:Math.max(...boxes.map(r=>r.bottom))+1.5,
        texts:texts.map(n=>({detail:n.classList.contains('wv-map-coords'),text:n.textContent,fontCssPx:parseFloat(getComputedStyle(n).fontSize)*scale(n)}))}
    })
    const firstPoint=node.querySelector('.wv-atlas-point')
    const viewport=svg.getBoundingClientRect()
    return{viewport:{left:viewport.left,right:viewport.right,top:viewport.top,bottom:viewport.bottom},viewBox:svg.getAttribute('viewBox'),pointRadiusCssPx:Number(firstPoint.getAttribute('r'))*scale(firstPoint),
      points:[...node.querySelectorAll('.wv-feature')].map(n=>({x:n.querySelector('.wv-atlas-point').getAttribute('cx'),y:n.querySelector('.wv-atlas-point').getAttribute('cy'),role:n.getAttribute('role'),tabIndex:n.getAttribute('tabindex'),name:n.getAttribute('aria-label')})),
      labels}
  })
  const validate=actual=>{
    assert.equal(actual.points.length,fixture.coordinateCount,'Atlas retains every original geometry member')
    assert.ok(actual.labels.length>=0&&actual.labels.length<=actual.points.length,'painted Atlas labels form a bounded subset; clipping may hide every sparse label')
    if(kind==='dense')assert.equal(actual.labels.length,1,'dense selected Atlas overlap has one readable label')
    for(const point of actual.points){
      assert.equal(point.role,'button');assert.equal(point.tabIndex,'0')
      assert.match(point.name,/city/);assert.match(point.name,/coarsened_to_precision_class/)
      assert.ok(Number.isFinite(Number(point.x))&&Number.isFinite(Number(point.y)))
    }
    assert.ok(Math.abs(actual.pointRadiusCssPx-7)<0.1,'Atlas point radius remains7 CSS pixels without moving its center')
    for(let i=0;i<actual.labels.length;i++){
      const a=actual.labels[i]
      assert.ok(a.right>a.left&&a.bottom>a.top&&a.texts.length>0,'only actually painted text is measured')
      assert.ok(a.left>=actual.viewport.left-0.1&&a.right<=actual.viewport.right+0.1&&a.top>=actual.viewport.top-0.1&&a.bottom<=actual.viewport.bottom+0.1,'painted text and stroke fit the actual SVG viewport')
      for(const text of a.texts)assert.ok(Math.abs(text.fontCssPx-(text.detail?9:11))<0.1,'responsive Atlas keeps main11px/detail9px CSS font size')
      for(const b of actual.labels.slice(i+1))assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'accepted Atlas label/coordinate unions do not overlap')
    }
  }
  try{
    await page.goto(route)
    await atlas.waitFor({timeout:45000})
    await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
    await page.evaluate(()=>document.fonts.ready);await atlas.scrollIntoViewIfNeeded();await delay(500)
    const originalContext=await publicContext(page),original=await snapshot()
    assert.equal(originalContext['canonical-subject-id'],subject);validate(original)
    const cameraBefore=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
    assert.equal(cameraBefore,null,'static overview truthfully has no interactive camera')
    const viewports=[{width:1280,labels:original.labels.length,allLabelsHidden:original.labels.length===0,fontCssPx:original.labels.flatMap(l=>l.texts.map(t=>t.fontCssPx))}]
    for(const width of [390,320,1280]){
      await page.setViewportSize({width,height:900});await atlas.scrollIntoViewIfNeeded();await delay(250)
      const actual=await snapshot();validate(actual)
      assert.deepEqual(actual.points,original.points,'responsive Atlas never moves SVG evidence coordinates or changes accessible row bindings')
      assert.equal(actual.viewBox,original.viewBox)
      assert.deepEqual(await publicContext(page),originalContext);assert.equal(page.url(),route)
      assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState()),cameraBefore)
      viewports.push({width,labels:actual.labels.length,allLabelsHidden:actual.labels.length===0,fontCssPx:actual.labels.flatMap(l=>l.texts.map(t=>t.fontCssPx))})
      if(width===390)console.log('MIP_WORLD_ATLAS_CONTEXT_'+kind+'_390='+(await page.locator('.wv-view').screenshot({type:'jpeg',quality:65})).toString('base64'))
    }
    await page.mouse.move(0,0);await delay(250)
    const pixels=decodeScreenshotPng(await atlas.screenshot({type:'png'})),before=await snapshot(),start=Date.now()
    await delay(1000)
    const after=await snapshot(),comparison=rasterSummary(decodeScreenshotPng(await atlas.screenshot({type:'png'})),pixels)
    assert.deepEqual(after,before,'idle Atlas retains label membership and exact point layout')
    assert.equal(comparison.whole.changedPixels,0,'idle Atlas retains rendered pixels')
    const point=atlas.locator('.wv-feature[role="button"]').first(),name=await point.getAttribute('aria-label')
    const inspector=page.getByRole('complementary',{name:'Selected-event inspector'})
    const inspectorBefore=await inspector.innerText()
    const keyResults=[]
    for(const key of ['Enter','Space']){
      await point.focus();assert.equal(await point.evaluate(n=>n===document.activeElement),true,'original point is keyboard focusable')
      const scrollBefore=await page.evaluate(()=>({x:scrollX,y:scrollY}))
      await point.press(key);await delay(250)
      assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),scrollBefore,'Enter/Space activation prevents unintended page scrolling')
      assert.equal(await inspector.innerText(),inspectorBefore,'keyboard activation retains the original selected projection inspector')
      assert.equal(await publicContext(page).then(c=>c['canonical-subject-id']),subject,'keyboard picking retains original canonical row identity')
      assert.equal(page.url(),route)
      assert.equal(await point.getAttribute('aria-label'),name,'keyboard picking preserves original source label/coordinate detail')
      assert.equal(await atlas.locator('.wv-feature.is-selected').count(),fixture.coordinateCount,'original selected projection remains bound to all geometry members')
      keyResults.push({key,canonicalSubject:subject,selectedPoints:fixture.coordinateCount,preventedScroll:true,originalInspectorRetained:true})
    }
    assert.ok(fixture.readerRequests>0&&fixture.matchedRows>0)
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_ATLAS_CONTEXT_'+kind+'_1280='+(await page.locator('.wv-view').screenshot({type:'jpeg',quality:65})).toString('base64'))
    console.log('MIP_WORLD_ATLAS_LABEL_PASS='+JSON.stringify({engine:'chromium',kind,fixture,viewports,keyResults,
      idle:{elapsedMs:Date.now()-start,changedPixels:comparison.whole.changedPixels},backend:verifyBoundary(),
      limitation:'SVG overview fits the entire synthetic geometry, so separated local points may cluster at world scale and all sparse labels may be hidden when original edge anchors cannot fit. Zero painted labels is reported explicitly, not described as readable. Keyboard activation exercises the already selected original row; unchanged selection alone does not prove a distinct subject transition. No interactive camera or GPU timing is fabricated.'}))
  }catch(error){
    console.log('MIP_WORLD_ATLAS_LABEL_FAILURE='+JSON.stringify({kind,error:error.message,errors}))
    console.log('MIP_WORLD_ATLAS_LABEL_FAILURE_IMAGE_'+kind+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}

let browser
try{
  verifyRasterEvidence()
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok}catch{}if(ready)break;await delay(250)}
  assert.ok(ready)
  browser=await chromium.launch({headless:true})
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
    const verifyBoundary=observeBackendBoundary(page),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    // Established fault-injection pattern: reject only Cesium-owned contexts,
    // after a good manual globe camera has been saved by the Graph transition.
    // Aborting a shared vendor chunk would also abort the route module.
    await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext=function(kind,...args){
        if(window.__MIP_VERIFIER_FAIL_GLOBE__&&/webgl/i.test(kind)&&this.closest('.cesium-widget'))return null
        return original.call(this,kind,...args)
      }
    })
    const camera=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
    const raw=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
    const identity=()=>page.locator('.ws-canonical[data-investigation-context]').getAttribute('data-canonical-subject-id')
    try{
      await page.goto(route)
      await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
      await delay(1800)
      assert.equal(await page.locator('[data-map-stack]').getAttribute('data-map-stack'),'ellipsoid-globe')
      assert.equal(await identity(),subject)
      const target={version:1,lon:-81.7,lat:41.4,heightMeters:150000,headingDegrees:23,pitchDegrees:-65,rollDegrees:0}
      assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),target),true)
      const saved=parseCameraState(await camera()),modes=page.getByRole('tablist',{name:'World View mode',exact:true})
      assert.ok(Math.abs(saved.rollDegrees)<1e-6,'manual globe capture cannot invent a 180-degree roll')
      await modes.getByRole('tab',{name:'Graph',exact:true}).click()
      await page.evaluate(()=>{window.__MIP_VERIFIER_FAIL_GLOBE__=true})
      await modes.getByRole('tab',{name:'Map',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-map-stack]')?.dataset.mapStack==='openfreemap-positron'
        && window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.rendererKind==='maplibre-deck.gl'
        && window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:45000})
      await page.locator('.maplibregl-ctrl-attrib').waitFor()
      await delay(500)
      const initial=(await raw()).mapCamera
      for(const key of ['lon','lat','zoom','bearing','pitch','bridgeHeightMeters','viewportWidthPx','minZoom','maxZoom'])assert.ok(Number.isFinite(initial[key]),key+' real raw map field')
      assert.ok(Math.abs(initial.lon-saved.lon)<1e-6,'fallback preserves longitude')
      assert.ok(Math.abs(initial.lat-saved.lat)<1e-6,'fallback preserves latitude')
      assert.ok(Math.abs(initial.bearing-saved.headingDegrees)<1e-6,'fallback preserves manual heading')
      assert.ok(Math.abs(initial.pitch-(saved.pitchDegrees+90))<1e-6,'fallback bridges pitch conventions')
      assert.ok(Math.abs(initial.bridgeHeightMeters-saved.heightMeters)<=saved.heightMeters*1e-6,'supported camera height survives renderer conversion')
      assert.equal(await identity(),subject);assert.equal(page.url(),route)
      assert.equal(await page.locator('.cesium-widget-errorPanel').count(),0,'failed globe DOM is removed')
      const cases=[]
      for(const lat of [41.4,62.5]){
        const free={...target,lat,heightMeters:150000,pitchDegrees:-58}
        assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),free),true)
        await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
        if(width===390&&!((await page.locator('.wv-stage').getAttribute('class')).includes('wv-touch-active')))
          await page.getByRole('button',{name:'Interact with map',exact:true}).click()
        const box=await page.locator('.wv-map-host').boundingBox(),before=(await raw()).mapCamera
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
        for(let i=0;i<6;i++){await page.mouse.wheel(0,-900);await delay(100)}
        await delay(1200)
        const actual=(await raw()).mapCamera,floor=heightMetersForPrecisionClass(actual.precisionClass)
        assert.equal(actual.precisionClass,'city')
        assert.ok(actual.zoom>before.zoom,'real wheel input attempts finer zoom')
        assert.ok(actual.zoom<=actual.maxZoom+1e-6,'manual input remains at measured zoom ceiling')
        assert.ok(actual.bridgeHeightMeters>=floor-0.01,'raw camera height cannot bypass the precision floor')
        assert.ok(actual.viewportWidthPx>0&&actual.viewportWidthPx<=800)
        assert.ok(Math.abs(actual.pitch-32)<1e-6,'manual zoom retains tilt')
        assert.ok(Math.abs(actual.lat-lat)<0.02,'manual zoom preserves local region')
        assert.equal(await identity(),subject);assert.equal(page.url(),route)
        cases.push({lat,precisionFloorMeters:floor,before,after:actual})
      }
      if(width===390)await page.getByRole('button',{name:'Done — scroll page',exact:true}).click()
      assert.deepEqual(errors,[])
      console.log('MIP_WORLD_FALLBACK_CONTEXT_'+width+'='+(await page.locator('.wv-view').screenshot({type:'jpeg',quality:65})).toString('base64'))
      console.log('MIP_WORLD_FALLBACK_PASS='+JSON.stringify({engine:'chromium',width,savedGlobeCamera:saved,initialFallback:initial,cases,canonicalSubject:subject,backend:verifyBoundary(),
        limitation:'Qualifies a saved globe view restored through Graph and a Cesium startup failure. Does not inject a fatal draw failure into an already running globe.'}))
    }catch(error){
      console.log('MIP_WORLD_FALLBACK_FAILURE='+JSON.stringify({width,error:error.message,errors,renderState:await raw().catch(()=>null)}))
      console.log('MIP_WORLD_FALLBACK_FAILURE_IMAGE_'+width+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
      throw error
    }finally{await page.close()}
  }
  for(const kind of ['dense','sparse'])await mapLabelJourney(browser,kind)
  for(const kind of ['dense','sparse'])await atlasLabelJourney(browser,kind)
}finally{await browser?.close();server.kill('SIGTERM')}
