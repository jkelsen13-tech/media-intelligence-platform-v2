// Representative built tablet browser qualification. Touch-enabled emulation,
// not physical iPad certification. Original anonymous reader; no evidence writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { cameraStatesEqual, parseCameraState } from '../src/lib/worldViewCameraState.js'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { sameCameraPose } from './cameraPoseComparison.mjs'
import { observeBackendBoundary } from './backendBoundary.mjs'
import { QUALIFICATION_SUBJECT } from './worldViewProjectionFixture.mjs'
import { decodeScreenshotPng, rasterSummary, verifyRasterEvidence } from './worldViewRasterEvidence.mjs'

const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json'),{chromium,webkit}=require('playwright')
const origin='http://127.0.0.1:4173',recordedInstant='2024-04-08T17:59:00.000Z'
const route=origin+'/media-intelligence-platform-v2/#/event/'+QUALIFICATION_SUBJECT+'/world?time='+encodeURIComponent(recordedInstant)
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const orientations=[{width:768,height:1024},{width:1024,height:768}]
const camera=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
const state=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
const profile=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getProfile())
const context=page=>page.locator('.ws-canonical[data-investigation-context]').evaluate(node=>
  Object.fromEntries(['canonical-subject-type','canonical-subject-id','parent-event-id','as-of-time','selected-time-range','temporal-assessment-reference']
    .map(key=>[key,node.getAttribute('data-'+key)])))
const sourceFields=page=>page.getByRole('complementary',{name:'Selected-event inspector'}).evaluate(node=>{
  const keep=new Set(['When','Valid-time precision','Location','Precision class','Geometry status','Uncertainty','Uncertainty note','Review','Release'])
  return Object.fromEntries([...node.querySelectorAll('.wv-field')].map(n=>[n.querySelector('dt')?.textContent,n.querySelector('dd')?.textContent]).filter(([key])=>keep.has(key)))
})
const recordedTime=page=>page.locator('.wv-scrubber .wv-section-head .num').innerText()
const setCamera=async(page,value)=>assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),value),true)
const angularGap=(a,b)=>Math.abs(((a-b+180)%360+360)%360-180)
function assertOrientation(actual,expected,label){
  assert.ok(angularGap(actual.headingDegrees,expected.headingDegrees)<1e-6,label+' heading')
  assert.ok(Math.abs(actual.pitchDegrees-expected.pitchDegrees)<1e-6,label+' pitch')
  assert.ok(angularGap(actual.rollDegrees,expected.rollDegrees)<1e-6,label+' roll')
}
function assertSelectedBoot(actual){
  assert.ok(angularGap(actual.headingDegrees,0)<0.01,'selected tablet boot is north-up')
  assert.ok(Math.abs(actual.pitchDegrees+90)<0.01,'selected tablet boot is nadir within the established default framing tolerance')
  assert.ok(angularGap(actual.rollDegrees,0)<1e-6,'selected tablet boot has no spurious roll')
}
function rectanglesOverlap(a,b){
  return a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom
}
function assertRawPoseRetained(actual,before,label){
  assert.ok(sameCameraPose(actual.cameraPose,before.cameraPose),label+' retains raw physical position/orientation')
  assert.equal(actual.cameraGovernance.minimumZoomDistanceMeters,before.cameraGovernance.minimumZoomDistanceMeters,label+' retains actual controller floor')
  assert.ok(Math.abs(actual.cameraGovernance.rawHeightMeters-before.cameraGovernance.rawHeightMeters)<1e-8,label+' retains actual raw ellipsoid height')
}
async function settle(page){
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:45000})
  await page.waitForLoadState('networkidle',{timeout:30000})
  let previous=(await state(page)).renderedFrames,stable=0
  for(let i=0;i<40&&stable<4;i++){await delay(100);const next=(await state(page)).renderedFrames;stable=next===previous?stable+1:0;previous=next}
  assert.equal(stable,4,'settled request-only renderer stops producing frames')
}

async function assertCameraGovernance(page,tag,log=true){
  const actual=(await state(page)).cameraGovernance
  const expectedClass=await page.getByRole('complementary',{name:'Selected-event inspector'}).evaluate(node=>
    [...node.querySelectorAll('.wv-field')].find(n=>n.querySelector('dt')?.textContent==='Precision class')?.querySelector('dd')?.textContent?.trim())
  assert.ok(expectedClass,'original selected row has a published precision class')
  assert.equal(actual?.precisionClass,expectedClass,'actual globe governance binds the original precision class')
  const floor=heightMetersForPrecisionClass(expectedClass)
  assert.ok(Number.isFinite(actual.minimumZoomDistanceMeters)&&Number.isFinite(actual.rawHeightMeters),'controller floor/raw height are actual finite scalars')
  assert.ok(Math.abs(actual.minimumZoomDistanceMeters-floor)<1e-8,'actual controller floor matches the class meter floor')
  assert.ok(actual.rawHeightMeters>=floor-0.01,'raw ellipsoid height cannot hide below-floor zoom through serialized camera clamping')
  if(log)console.log('MIP_WORLD_TABLET_GOVERNANCE='+JSON.stringify({tag,precisionClass:actual.precisionClass,floorMeters:floor,
    actualControllerFloorMeters:actual.minimumZoomDistanceMeters,rawHeightMeters:actual.rawHeightMeters,evidenceLayer:'representative-built-actions'}))
  return actual
}


async function assertGlobeCredits(page,engine,width){
  const credits=page.locator('.cesium-widget-credits'),disclosure=page.locator('.wv-terrain-disclosure')
  await credits.scrollIntoViewIfNeeded()
  await credits.waitFor({state:'visible'})
  const rights=await disclosure.innerText()
  for(const source of ['USGS 3DEP/SRTM/GMTED2010','NOAA ETOPO1','NRCan CDEM','Mapzen/AWS Terrain Tiles','Open Government Licence – Canada','never evidence'])
    assert.ok(rights.includes(source),'terrain disclosure retains '+source)
  const geometry=await page.evaluate(()=>{
    const c=document.querySelector('.cesium-widget-credits'),d=document.querySelector('.wv-terrain-disclosure')
    const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
    return{credits:rect(c),terrain:rect(d)}
  })
  const a=geometry.credits,b=geometry.terrain
  assert.ok(a.width>0&&a.height>0,'native imagery credit has a visible rectangle')
  assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'terrain disclosure never covers native imagery credit')
  const attribution=credits.locator('a[href="https://www.openstreetmap.org/copyright"]').first()
  await attribution.waitFor({state:'visible'})
  assert.match(await attribution.innerText(),/OpenStreetMap.*contributors/i,'imagery rights text is visible without opening a dialog')
  const activateTouch=await page.getByRole('button',{name:'Interact with map',exact:true}).isVisible()&&!(await page.locator('.wv-stage').getAttribute('class')).includes('wv-touch-active')
  if(activateTouch){
    await page.getByRole('button',{name:'Interact with map',exact:true}).click()
    await credits.scrollIntoViewIfNeeded()
  }
  const unobscured=await attribution.evaluate(node=>{
    const fragments=[...node.getClientRects()]
    return fragments.length>0&&fragments.every(r=>{
      const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y)
      return r.width>0&&r.height>0&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&(hit===node||node.contains(hit))
    })
  })
  assert.equal(unobscured,true,'actual imagery rights text is visible and unobscured')
  if(activateTouch)await page.getByRole('button',{name:'Done — scroll page',exact:true}).click()
  console.log('MIP_WORLD_TABLET_CREDITS='+JSON.stringify({engine,width,geometry,imagery:'©OpenStreetMap contributors',visibleWithoutDialog:true,terrainRightsPreserved:true}))
  return geometry
}

async function assertEvidence(page,baseline,label){
  const actualContext=await context(page),actualFields=await sourceFields(page)
  assert.deepEqual(actualContext,baseline.context,label+' keeps canonical/source time context')
  assert.equal(actualContext['canonical-subject-id'],QUALIFICATION_SUBJECT)
  assert.equal(page.url(),baseline.url,label+' keeps exact recorded-time URL')
  assert.equal(await recordedTime(page),baseline.recordedTime,label+' keeps recorded marker')
  const changed=Object.keys(baseline.fields).filter(key=>actualFields[key]!==baseline.fields[key])
  assert.equal(Object.keys(actualFields).length,9)
  assert.equal(changed.length,0,label+' keeps nine original reader fields; changed keys: '+changed.join(', '))
}
async function assertLayout(page,label){
  const layout=await page.locator('.wv-view').evaluate(node=>({
    viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,
    viewWidth:node.clientWidth,viewScrollWidth:node.scrollWidth,
    stage:[...node.querySelectorAll('.wv-stage > .wv-map-panel,.wv-stage > .wv-graph')].map(n=>{
      const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}
    })
  }))
  assert.ok(layout.documentWidth<=layout.viewport.width+1,label+' shared shell fits tablet viewport')
  assert.ok(layout.viewScrollWidth<=layout.viewWidth+1,label+' World View does not overflow horizontally')
  assert.ok(layout.stage.length>0,label+' has an actual map/graph stage')
  for(const r of layout.stage)assert.ok(r.width>0&&r.height>0,label+' stage remains measurable')
  if(layout.stage.length===2)assert.equal(rectanglesOverlap(...layout.stage),false,label+' Split map and graph never overlap')
  return layout
}
async function switchMode(page,name){
  const tab=page.getByRole('tablist',{name:'World View mode',exact:true}).getByRole('tab',{name,exact:true})
  await tab.tap()
  assert.equal(await tab.getAttribute('aria-selected'),'true','actual touch tap activates '+name+' tab')
  if(name==='Graph'){
    assert.equal(await page.locator('.wv-map-host').count(),0,'Graph disposes hidden map host')
    await page.locator('.wv-graph').waitFor({state:'visible'})
  }else{
    await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:45000})
    assert.equal(await page.locator('[data-map-stack]').getAttribute('data-map-stack'),'ellipsoid-globe','normal tablet journey uses real globe')
    await settle(page)
  }
}
async function fidelityJourney(page,baseline){
  const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
  await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).tap()
  await panel.getByRole('button',{name:'Show Image Quality settings',exact:true}).tap()
  const category=panel.getByRole('checkbox',{name:'Image Quality effects',exact:true})
  const fxaa=panel.getByRole('checkbox',{name:'FXAA',exact:true}),master=panel.getByRole('checkbox',{name:'Photoreal',exact:true})
  assert.equal(await master.isChecked(),true)
  if(!await category.isChecked())await category.tap()
  await page.waitForFunction(()=>document.querySelector('[data-fidelity-effect="fxaa"]')?.dataset.effectStatus==='supported')
  assert.equal(await fxaa.isEnabled(),true)
  if(await fxaa.isChecked())await fxaa.tap()
  await settle(page)
  const before=await state(page),serialized=parseCameraState(await camera(page)),canvas=await page.locator('.wv-map-host canvas').first().elementHandle()
  const neutral=decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({type:'png'}))
  const transitions=[]
  const sameViewer=async label=>{
    const actual=await state(page)
    assertRawPoseRetained(actual,before,label)
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),serialized,1e-9),label+' keeps serialized camera')
    assert.equal(await canvas.evaluate(n=>n.isConnected&&n===document.querySelector('.wv-map-host canvas')),true,label+' keeps the same viewer/canvas')
    await assertEvidence(page,baseline,label)
    return actual
  }
  await fxaa.tap()
  await page.waitForFunction(()=>{const s=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState();return s?.fxaa.enabled&&s.fxaa.ready})
  await settle(page)
  const enabled=await sameViewer('FXAA leaf on'),remembered=await profile(page)
  assert.equal(await fxaa.isChecked(),true)
  assert.equal(enabled.fxaa.enabled,true)
  const metrics=rasterSummary(decodeScreenshotPng(await page.locator('.wv-map-host').screenshot({type:'png'})),neutral)
  transitions.push({action:'leaf-on',actualFxaaEnabled:true,ready:enabled.fxaa.ready,changedPixels:metrics.whole.changedPixels})
  await master.tap();await settle(page)
  const off=await sameViewer('Photoreal master off')
  assert.equal(await master.isChecked(),false);assert.equal(off.fxaa.enabled,false);assert.equal(await fxaa.isChecked(),false)
  assert.deepEqual((await profile(page)).categories,remembered.categories,'master off remembers exact leaf/category preferences')
  transitions.push({action:'master-off',actualFxaaEnabled:off.fxaa.enabled})
  await master.tap()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.fxaa.enabled)
  await settle(page)
  const on=await sameViewer('Photoreal master on')
  assert.deepEqual(await profile(page),remembered,'master restores exact remembered profile')
  assert.equal(await fxaa.isChecked(),true);assert.equal(on.fxaa.enabled,true)
  transitions.push({action:'master-on',actualFxaaEnabled:on.fxaa.enabled})
  await fxaa.tap();await settle(page)
  const final=await sameViewer('FXAA leaf off')
  assert.equal(final.fxaa.enabled,false);assert.equal(await fxaa.isChecked(),false)
  transitions.push({action:'leaf-off',actualFxaaEnabled:final.fxaa.enabled})
  return{transitions,rawCameraPreserved:true,sameCanvas:true,pixelInterpretation:'Pixel differences are measured; this tablet package asserts actual enabled/ready render state, not a minimum visual magnitude.'}
}
async function touchSurface(page,engine,baseline){
  const interact=page.getByRole('button',{name:'Interact with map',exact:true}),needsActivation=await interact.isVisible()
  if(needsActivation)await interact.tap()
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  const surface=await page.locator('.wv-map-host').boundingBox(),viewport=page.viewportSize()
  assert.ok(surface&&surface.width>0&&surface.height>0)
  const left=Math.max(surface.x,0),right=Math.min(surface.x+surface.width,viewport.width)
  const top=Math.max(surface.y,0),bottom=Math.min(surface.y+surface.height,viewport.height)
  assert.ok(right-left>80&&bottom-top>80,'touch surface is actually inside the viewport')
  // Use an empty off-center area rather than activating a canonical marker.
  const x=left+(right-left)*0.78,y=top+(bottom-top)*0.72
  await page.touchscreen.tap(x,y);await delay(150)
  await assertEvidence(page,baseline,'canvas touch tap')
  let dragVerified=false
  const scroll=()=>page.evaluate(()=>({x:scrollX,y:scrollY,view:document.querySelector('.wv-view').scrollTop}))
  const scrollBefore=await scroll(),before=parseCameraState(await camera(page))
  if(engine==='chromium'){
    const cdp=await page.context().newCDPSession(page)
    try{
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
      for(let i=1;i<=8;i++){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*5,y:y-i*2}]});await delay(16)
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    }finally{await cdp.detach()}
    await delay(700)
    assert.equal(cameraStatesEqual(parseCameraState(await camera(page)),before,1e-6),false,'actual touch drag navigates globe')
    assert.deepEqual(await scroll(),scrollBefore,'active touch drag does not scroll the page/shared view')
    await assertCameraGovernance(page,engine+'-touch-drag',false)
    await assertEvidence(page,baseline,'canvas touch drag')
    dragVerified=true
  }
  if(needsActivation)await page.getByRole('button',{name:'Done — scroll page',exact:true}).tap()
  return{tapVerified:true,dragVerified,nativeDragLimitation:dragVerified?null:'WebKit driver supports actual tap; native touch drag is not exercised. Mouse movement is not substituted.',hardware:'Touch-enabled desktop browser emulation; physical iPad, Safari hardware/GPU and native multi-touch are not qualified.'}
}
async function journey(browser,engine,initialViewport){
  const other=orientations.find(v=>v.width!==initialViewport.width)
  const page=await browser.newPage({viewport:initialViewport,hasTouch:true}),verifyBoundary=observeBackendBoundary(page),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const label=engine+'_'+initialViewport.width+'x'+initialViewport.height
  try{
    await page.goto(route)
    await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
    await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:45000})
    await delay(1800);await settle(page)
    assert.equal(await page.locator('[data-map-stack]').getAttribute('data-map-stack'),'ellipsoid-globe')
    const capability=await page.evaluate(()=>({maxTouchPoints:navigator.maxTouchPoints,coarsePointer:matchMedia('(pointer:coarse)').matches}))
    assert.ok(capability.maxTouchPoints>0,'browser actually exposes touch input')
    assert.ok((await state(page)).markers.length>0,'original reader creates actual evidence markers')
    const baseline={context:await context(page),fields:await sourceFields(page),recordedTime:await recordedTime(page),url:page.url()}
    assert.equal(Object.keys(baseline.fields).length,9)
    assert.equal(baseline.context['canonical-subject-id'],QUALIFICATION_SUBJECT)
    assert.ok(baseline.context['canonical-subject-type']&&baseline.context['temporal-assessment-reference'])
    assert.equal(Date.parse(baseline.context['as-of-time']),Date.parse(recordedInstant),'time-scoped route has a meaningful canonical as-of instant')
    assert.equal(Date.parse(baseline.recordedTime),Date.parse(recordedInstant),'actual recorded marker matches the canonical as-of instant')
    const lighting=(await state(page)).recordedLighting
    assert.equal(lighting.available,true);assert.equal(lighting.frozen,true);assert.equal(Date.parse(lighting.sourceText),Date.parse(recordedInstant))
    const bootGovernance=await assertCameraGovernance(page,label+'-boot')
    const bootCamera=parseCameraState(await camera(page))
    assertSelectedBoot(bootCamera)
    const manual={version:1,lon:-81.7,lat:41.4,heightMeters:150000,headingDegrees:23,pitchDegrees:-65,rollDegrees:0}
    await setCamera(page,manual);await settle(page)
    const saved=parseCameraState(await camera(page))
    assertOrientation(saved,manual,'tablet manual navigation')
    const manualGovernance=await assertCameraGovernance(page,label+'-manual')
    const lifecycle=[]
    for(const mode of ['Graph','Split','Map']){
      await switchMode(page,mode)
      await assertEvidence(page,baseline,'touch mode '+mode)
      const layout=await assertLayout(page,mode)
      if(mode!=='Graph'){
        assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-6),mode+' restores saved camera across map lifecycle')
        await assertCameraGovernance(page,label+'-'+mode,false)
      }
      lifecycle.push({mode,layout,savedCameraRetained:mode==='Graph'?null:true})
    }
    const canvas=await page.locator('.wv-map-host canvas').first().elementHandle(),beforeResize=await state(page),viewports=[]
    for(const viewport of [initialViewport,other,initialViewport]){
      await page.setViewportSize(viewport);await settle(page)
      const actual=await state(page)
      assertRawPoseRetained(actual,beforeResize,'tablet orientation change')
      assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-9),'orientation retains saved camera')
      assert.equal(await canvas.evaluate(n=>n.isConnected&&n===document.querySelector('.wv-map-host canvas')),true,'orientation keeps same viewer')
      await assertEvidence(page,baseline,'tablet orientation')
      const layout=await assertLayout(page,'tablet orientation'),creditGeometry=await assertGlobeCredits(page,engine,viewport.width)
      viewports.push({viewport,layout,creditGeometry})
      console.log('MIP_WORLD_TABLET_CONTEXT_'+engine+'_'+viewport.width+'x'+viewport.height+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    }
    const fidelity=await fidelityJourney(page,baseline)
    const touch=await touchSurface(page,engine,baseline)
    await setCamera(page,manual);await settle(page)
    await assertEvidence(page,baseline,'restored after touch')
    await assertCameraGovernance(page,label+'-restored',false)
    const idleBefore=await state(page),start=Date.now()
    await delay(1000)
    const idleAfter=await state(page),idle={elapsedMs:Date.now()-start,frames:idleAfter.renderedFrames-idleBefore.renderedFrames}
    assert.equal(idle.frames,0,'settled tablet has no continuous render loop')
    assertRawPoseRetained(idleAfter,idleBefore,'tablet idle')
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_TABLET_PASS='+JSON.stringify({evidenceLayer:'representative-built-actions',engine,initialViewport,touchCapability:capability,
      canonicalContext:baseline.context,recordedTime:baseline.recordedTime,originalRowFieldCount:9,sourceRowFieldsRetained:true,
      bootCamera,bootGovernance,manualGovernance,savedCamera:saved,lifecycle,viewports,fidelity,touch,idle,backend:verifyBoundary(),
      limitations:['Original row, no synthetic geography or new reader request. Mode/navigation does not activate a different source row.',
        'No hosted preview or deployed live site is exercised. No physical iPad/hardware performance claim. Shared shell/source styles are unchanged.']}))
  }catch(error){
    const failureCamera=await camera(page).then(parseCameraState).catch(()=>null)
    const failureGovernance=await state(page).then(s=>s?.cameraGovernance??null).catch(()=>null)
    console.log('MIP_WORLD_TABLET_FAILURE='+JSON.stringify({engine,initialViewport,error:error.message,pageErrors:errors,camera:failureCamera,cameraGovernance:failureGovernance}))
    console.log('MIP_WORLD_TABLET_FAILURE_IMAGE_'+label+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}
let browser
try{
  verifyRasterEvidence()
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok}catch{}if(ready)break;await delay(250)}
  assert.ok(ready,'built preview starts')
  for(const engine of ['chromium','webkit']){
    browser=await {chromium,webkit}[engine].launch({headless:true})
    for(const viewport of orientations)await journey(browser,engine,viewport)
    await browser.close();browser=null
  }
  console.log('MIP_WORLD_TABLET_BROWSER_PASS')
}finally{await browser?.close();server.kill('SIGTERM')}
