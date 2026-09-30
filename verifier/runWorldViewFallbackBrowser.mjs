// Bounded real MapLibre fallback qualification. Requires the integrated width
// governor and public raw-map snapshot; no renderer objects or backend writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { formatTimeQuery, serializeDeepLink } from '../src/lib/deepLinks.js'
import { temporalAssessmentReferenceFor } from '../src/lib/investigationContext.js'
import { parseCameraState } from '../src/lib/worldViewCameraState.js'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { observeBackendBoundary } from './backendBoundary.mjs'
import { installProjectionFixture, QUALIFICATION_SUBJECT } from './worldViewProjectionFixture.mjs'
import { decodeScreenshotPng, rasterSummary, verifyRasterEvidence } from './worldViewRasterEvidence.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json'),{chromium}=require('playwright')
const origin='http://127.0.0.1:4173',subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const route=origin+'/media-intelligence-platform-v2/#/event/'+subject+'/world'
const contextScreenshot=page=>(page.viewportSize().width<600?page:page.locator('.wv-view')).screenshot({type:'jpeg',quality:65})
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

function assertMapControlBoxes(actual,label){
  const boxes=[actual.navigation,actual.scale,actual.attribution]
  const fits=(box,bounds)=>box.left>=bounds.left-0.75&&box.right<=bounds.right+0.75
    &&box.top>=bounds.top-0.75&&box.bottom<=bounds.bottom+0.75
  for(const [index,box] of boxes.entries()){
    assert.ok(box?.visible&&box.width>0&&box.height>0,label+' control '+index+' is painted')
    assert.ok(fits(box,actual.mapViewport)&&fits(box,actual.browserViewport),label+' control '+index+' fits map and browser viewports')
    for(const other of boxes.slice(index+1))assert.ok(box.right<=other.left||other.right<=box.left
      ||box.bottom<=other.top||other.bottom<=box.top,label+' navigation, scale and expanded copyright do not overlap')
  }
  assert.equal(actual.compact,false,label+' copyright remains fully expanded')
  assert.ok(actual.innerVisible,label+' attribution text is painted')
  assert.match(actual.attributionText,/OpenFreeMap/)
  assert.match(actual.attributionText,/OpenMapTiles/)
  assert.match(actual.attributionText,/OpenStreetMap/)
  for(const provider of ['openfreemap.org','openmaptiles.org','openstreetmap.org']){
    const links=actual.links.filter(link=>link.host===provider||link.host==='www.'+provider)
    assert.ok(links.length>0,label+' retains '+provider+' copyright link')
    for(const link of links)assert.ok(link.visible&&link.text&&link.protocol==='https:'
      &&fits(link,actual.attribution)&&fits(link,actual.mapViewport),label+' copyright link is visible inside its control')
  }
}
async function qualifyMapControls(page,label){
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.evaluate(()=>document.fonts.ready)
  const actual=await page.locator('.wv-map-host').evaluate(host=>{
    const painted=node=>{
      if(!node)return false
      const style=getComputedStyle(node)
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0
    }
    const box=node=>{
      if(!node)return null
      const r=node.getBoundingClientRect()
      return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,visible:painted(node)}
    }
    const attribution=host.querySelector('.maplibregl-ctrl-attrib'),inner=host.querySelector('.maplibregl-ctrl-attrib-inner')
    return{
      mapViewport:box(host.querySelector('.maplibregl-canvas')),
      browserViewport:{left:0,top:0,right:innerWidth,bottom:innerHeight},
      navigation:box(host.querySelector('.maplibregl-ctrl-top-left .maplibregl-ctrl-group')),
      scale:box(host.querySelector('.maplibregl-ctrl-scale')),
      attribution:box(attribution),
      compact:attribution?.classList.contains('maplibregl-compact')??true,
      innerVisible:painted(inner),attributionText:inner?.textContent??'',
      links:[...host.querySelectorAll('.maplibregl-ctrl-attrib-inner a')].map(node=>{
        const url=new URL(node.href)
        return{...box(node),text:node.textContent.trim(),host:url.hostname,protocol:url.protocol}
      }),
    }
  })
  assertMapControlBoxes(actual,label)
  return actual
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
    const viewports=[{width:1280,state:initial,controls:await qualifyMapControls(page,kind+' 1280')}]
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
      viewports.push({width,state:actual,controls:await qualifyMapControls(page,kind+' '+width)})
    }
    const resizeElapsedMs=Date.now()-resizeStarted
    assert.ok(viewports.at(-1).state.labelLayout.passes>initial.labelLayout.passes,'responsive layout actually recomputes')
    const before=await fallbackState(page),pixels=decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({type:'png'})),start=Date.now()
    await delay(1000)
    const after=await fallbackState(page),comparison=rasterSummary(decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({type:'png'})),pixels)
    const idleElapsedMs=Date.now()-start
    assert.equal(after.labelLayout.passes,before.labelLayout.passes,'settled idle has no new layout/repaint passes')
    assert.equal(after.labelLayout.labels,before.labelLayout.labels)
    assert.equal(comparison.whole.changedPixels,0,'settled idle retains rendered label membership and map pixels')
    assertMapPose(after.mapCamera,before.mapCamera,'idle')
    assert.deepEqual(await publicContext(page),originalContext);assert.equal(page.url(),route)
    assert.ok(fixture.matchedRows>0&&fixture.readerRequests>0,'fixture exercised the exact anonymous reader contract')
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_MAP_LABEL_CONTEXT_'+kind+'='+(await contextScreenshot(page)).toString('base64'))
    console.log('MIP_WORLD_MAP_LABEL_PASS='+JSON.stringify({engine:'chromium',kind,fixture,viewports,resizeElapsedMs,
      idle:{elapsedMs:idleElapsedMs,passes:after.labelLayout.passes-before.labelLayout.passes,changedPixels:comparison.whole.changedPixels},backend:verifyBoundary(),
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
  const selectionNodes=[],pendingNodeReads=[]
  let nodeReadFailures=0
  page.on('response',response=>{
    const url=new URL(response.url())
    if(url.origin!=='https://qikvmopbtijoebdqosyq.supabase.co'||url.pathname!=='/rest/v1/nodes'||response.status()!==200)return
    pendingNodeReads.push((async()=>{
      const rows=await response.json()
      if(!Array.isArray(rows))return
      for(const node of rows)if(String(node.id??node.slug)===subject)
        selectionNodes.push({id:node.id??node.slug,type:node.type??null,parent_event_id:node.parent_event_id??null})
    })().catch(()=>{nodeReadFailures++}))
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
      if(width===390)console.log('MIP_WORLD_ATLAS_CONTEXT_'+kind+'_390='+(await contextScreenshot(page)).toString('base64'))
    }
    await page.mouse.move(0,0);await delay(250)
    const pixels=decodeScreenshotPng(await atlas.screenshot({type:'png'})),before=await snapshot(),start=Date.now()
    await delay(1000)
    const after=await snapshot(),comparison=rasterSummary(decodeScreenshotPng(await atlas.screenshot({type:'png'})),pixels)
    const idleElapsedMs=Date.now()-start
    assert.deepEqual(after,before,'idle Atlas retains label membership and exact point layout')
    assert.equal(comparison.whole.changedPixels,0,'idle Atlas retains rendered pixels')
    const point=atlas.locator('.wv-feature[role="button"]').first(),name=await point.getAttribute('aria-label')
    const inspector=page.getByRole('complementary',{name:'Selected-event inspector'})
    const inspectorFields=()=>inspector.evaluate(node=>{
      const keep=new Set(['When','Valid-time precision','Location','Precision class','Geometry status','Uncertainty','Uncertainty note','Review','Release'])
      return Object.fromEntries([...node.querySelectorAll('.wv-field')].map(n=>[n.querySelector('dt')?.textContent,n.querySelector('dd')?.textContent]).filter(([key])=>keep.has(key)))
    })
    const inspectorBefore=await inspectorFields()
    assert.equal(Object.keys(inspectorBefore).length,9,'selected inspector exposes the original row fields')
    const changedInspectorFields=[]
    await page.waitForLoadState('networkidle',{timeout:30000})
    await Promise.all(pendingNodeReads)
    assert.equal(nodeReadFailures,0,'public graph type response is readable')
    assert.equal(fixture.selectionRows.length,1,'qualification binds the one original projection row')
    assert.ok(selectionNodes.length>0,'qualification observes the existing public graph node type without another request')
    const sourceRow=fixture.selectionRows[0],node=selectionNodes[0]
    assert.ok(selectionNodes.every(n=>n.type===node.type&&n.parent_event_id===node.parent_event_id),'reader graph type/parent is consistent')
    const expectedContext={
      'canonical-subject-type':node.type||sourceRow.spatial_role||'',
      'canonical-subject-id':sourceRow.subject_graph_node_id,
      'parent-event-id':sourceRow.parent_event_id??node.parent_event_id??'',
      'as-of-time':sourceRow.valid_from_utc??'',
      'selected-time-range':sourceRow.valid_from_utc!=null||sourceRow.valid_to_utc!=null
        ?(sourceRow.valid_from_utc??'')+'..'+(sourceRow.valid_to_utc??''):'',
      'temporal-assessment-reference':temporalAssessmentReferenceFor(sourceRow.subject_graph_node_id),
    }
    assert.equal(expectedContext['canonical-subject-id'],subject)
    const sourceIc={
      canonical_subject_type:expectedContext['canonical-subject-type'],
      canonical_subject_id:sourceRow.subject_graph_node_id,
      parent_event_id:expectedContext['parent-event-id']||null,
      as_of_time:sourceRow.valid_from_utc??null,
      selected_time_range:sourceRow.valid_from_utc!=null||sourceRow.valid_to_utc!=null
        ?{from:sourceRow.valid_from_utc,to:sourceRow.valid_to_utc}:null,
      active_view:'world',
      temporal_assessment_reference:expectedContext['temporal-assessment-reference'],
    }
    const expectedSelectionUrl=new URL(serializeDeepLink(sourceIc,{
      entity:node.id,time:formatTimeQuery(sourceIc.as_of_time,sourceIc.selected_time_range),
    }),route).href
    let pickedContext=null,pickedUrl=null
    const keyResults=[]
    for(const key of ['Enter','Space']){
      await point.focus();assert.equal(await point.evaluate(n=>n===document.activeElement),true,'original point is keyboard focusable')
      const scrollBefore=await page.evaluate(()=>({x:scrollX,y:scrollY}))
      await point.press(key);await delay(250)
      assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),scrollBefore,'Enter/Space activation prevents unintended page scrolling')
      const inspectorAfter=await inspectorFields()
      changedInspectorFields.push(...Object.keys(inspectorBefore).filter(key=>inspectorAfter[key]!==inspectorBefore[key]))
      assert.ok(changedInspectorFields.length===0,'keyboard activation retains original row fields; changed fields: '+changedInspectorFields.join(', '))
      const actualContext=await publicContext(page)
      const invalidContextFields=Object.keys(expectedContext).filter(key=>actualContext[key]!==expectedContext[key])
      assert.ok(invalidContextFields.length===0,'explicit map pick obeys source-derived canonical/time contract; invalid fields: '+invalidContextFields.join(', '))
      if(pickedContext)assert.ok(JSON.stringify(actualContext)===JSON.stringify(pickedContext),'repeated same-row keyboard pick is exactly idempotent')
      pickedContext=actualContext
      assert.equal(await publicContext(page).then(c=>c['canonical-subject-id']),subject,'keyboard picking retains original canonical row identity')
      await page.waitForURL(url=>url.href===expectedSelectionUrl,{timeout:10000})
      if(pickedUrl)assert.equal(page.url(),pickedUrl,'repeated same-row activation retains its serialized source-bound URL')
      pickedUrl=page.url()
      assert.equal(await point.getAttribute('aria-label'),name,'keyboard picking preserves original source label/coordinate detail')
      assert.equal(await atlas.locator('.wv-feature.is-selected').count(),fixture.coordinateCount,'original selected projection remains bound to all geometry members')
      keyResults.push({key,canonicalSubject:subject,selectedPoints:fixture.coordinateCount,preventedScroll:true,originalRowFieldsRetained:true,derivedTitleCompared:false,
        sourceContext:actualContext,selectionUrl:pickedUrl,changedFromRouteSeed:Object.keys(actualContext).filter(field=>actualContext[field]!==originalContext[field])})
    }
    assert.ok(fixture.readerRequests>0&&fixture.matchedRows>0)
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_ATLAS_CONTEXT_'+kind+'_1280='+(await contextScreenshot(page)).toString('base64'))
    console.log('MIP_WORLD_ATLAS_LABEL_PASS='+JSON.stringify({engine:'chromium',kind,fixture,viewports,keyResults,
      idle:{elapsedMs:idleElapsedMs,changedPixels:comparison.whole.changedPixels},backend:verifyBoundary(),
      limitation:'SVG overview fits the entire synthetic geometry, so separated local points may cluster at world scale and all sparse labels may be hidden when original edge anchors cannot fit. Zero painted labels is reported explicitly, not described as readable. Keyboard activation exercises the already selected original row. Exact source row fields are retained. First activation binds source-derived graph type/parent and recorded valid-time bounds, which may differ from a named route seed. The URL serializes the same subject/world with source time bounds and picked graph node. The repeated same-row activation is idempotent. Graph-node matching may expand its derived title; no distinct subject transition is claimed. No interactive camera or GPU timing is fabricated.'}))
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
      const controls=await qualifyMapControls(page,'saved-camera fallback '+width)
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
      console.log('MIP_WORLD_FALLBACK_CONTEXT_'+width+'='+(await contextScreenshot(page)).toString('base64'))
      console.log('MIP_WORLD_FALLBACK_PASS='+JSON.stringify({engine:'chromium',width,savedGlobeCamera:saved,initialFallback:initial,controls,cases,canonicalSubject:subject,backend:verifyBoundary(),
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
