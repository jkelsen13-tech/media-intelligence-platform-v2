// Real anonymous reader qualification and explicitly synthetic display fixtures.
// All execution/images remain in ephemeral Actions logs; no evidence writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { cameraStatesEqual, parseCameraState } from '../src/lib/worldViewCameraState.js'
import { sameCameraPose } from './cameraPoseComparison.mjs'
import { observeBackendBoundary } from './backendBoundary.mjs'
import { decodeScreenshotPng, rasterSummary, verifyRasterEvidence } from './worldViewRasterEvidence.mjs'
import { installProjectionFixture, QUALIFICATION_SUBJECT } from './worldViewProjectionFixture.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {chromium,webkit}=require('playwright')
const origin='http://127.0.0.1:4173',route=origin+'/media-intelligence-platform-v2/#/event/'+QUALIFICATION_SUBJECT+'/world'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const contextScreenshot=page=>(page.viewportSize().width<600?page:page.locator('.wv-view')).screenshot({type:'jpeg',quality:65})
const cameraState=(lon,lat,heightMeters=200000)=>({version:1,lon,lat,heightMeters,headingDegrees:0,pitchDegrees:-90,rollDegrees:0})
const angularGap=(a,b)=>Math.abs(((a-b+180)%360+360)%360-180)
function assertOrientation(actual,target,label){
  assert.ok(actual,label+' valid camera capture')
  assert.ok(angularGap(actual.headingDegrees,target.headingDegrees)<1e-6,label+' captures requested heading')
  assert.ok(Math.abs(actual.pitchDegrees-target.pitchDegrees)<1e-6,label+' captures requested pitch')
  assert.ok(angularGap(actual.rollDegrees,target.rollDegrees)<1e-6,label+' captures requested roll without a spurious half-turn')
}
const camera=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
const state=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
const clusterState=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()??null)
const identity=page=>page.locator('.ws-canonical[data-investigation-context]').getAttribute('data-canonical-subject-id')
const context=page=>page.locator('.ws-canonical[data-investigation-context]').evaluate(node=>
  Object.fromEntries(['canonical-subject-type','canonical-subject-id','parent-event-id','as-of-time','selected-time-range','temporal-assessment-reference']
    .map(key=>[key,node.getAttribute('data-'+key)])))
const setCamera=async(page,value)=>{
  assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),value),true)
}
function observeRequests(page){
  const counts={imagery:0,terrain:0}
  page.on('request',r=>{const url=new URL(r.url());if(url.hostname==='tile.openstreetmap.org')counts.imagery++;if(url.pathname.includes('/terrarium/'))counts.terrain++})
  return counts
}
const deltaRequests=(counts,before)=>({imagery:counts.imagery-before.imagery,terrain:counts.terrain-before.terrain})
async function settle(page){
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:45000})
  await page.waitForLoadState('networkidle',{timeout:30000})
  let previous=(await state(page)).renderedFrames,stable=0
  for(let i=0;i<40&&stable<4;i++){await delay(100);const next=(await state(page)).renderedFrames;stable=next===previous?stable+1:0;previous=next}
  assert.equal(stable,4,'settled request-only renderer stops producing frames')
}
async function idleSample(page,counts,tag){
  await settle(page)
  const before=await state(page),requests={...counts},pose=before.cameraPose,start=Date.now()
  await delay(1000)
  const after=await state(page),sample={tag,elapsedMs:Date.now()-start,frames:after.renderedFrames-before.renderedFrames,requests:deltaRequests(counts,requests)}
  assert.equal(sample.frames,0,'settled idle has no marker-layout render loop')
  assert.deepEqual(sample.requests,{imagery:0,terrain:0})
  assert.ok(sameCameraPose(after.cameraPose,pose),'idle retains camera pose')
  assert.equal(after.requestRenderMode,true)
  console.log('MIP_WORLD_IDLE='+JSON.stringify(sample))
  return sample
}
async function openWorld(page){
  await page.goto(route)
  await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
  await delay(1800)
  assert.equal(await page.locator('[data-map-stack]').getAttribute('data-map-stack'),'ellipsoid-globe')
  assert.equal(await identity(page),QUALIFICATION_SUBJECT,'qualification binds the actual nonempty canonical subject')
  assert.ok((await state(page)).markers.length>0,'real reader creates marker evidence')
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
  if(log)console.log('MIP_WORLD_GLOBE_GOVERNANCE='+JSON.stringify({tag,precisionClass:actual.precisionClass,floorMeters:floor,
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
  const activateTouch=width===390&&!(await page.locator('.wv-stage').getAttribute('class')).includes('wv-touch-active')
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
  console.log('MIP_WORLD_CREDITS='+JSON.stringify({engine,width,geometry,imagery:'©OpenStreetMap contributors',visibleWithoutDialog:true,terrainRightsPreserved:true}))
}

async function appearanceAblations(page,engine,width,counts){
  const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
  await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
  await panel.getByRole('button',{name:'Show Atmosphere settings',exact:true}).click()
  await panel.getByRole('button',{name:'Show Lighting settings',exact:true}).click()
  await panel.getByRole('checkbox',{name:'Atmosphere effects',exact:true}).check()
  await panel.getByRole('checkbox',{name:'Lighting effects',exact:true}).check()
  const controls={
    relief:panel.getByRole('checkbox',{name:'Terrain relief shading',exact:true}),
    ground:panel.getByRole('checkbox',{name:'Ground atmosphere',exact:true}),
    haze:panel.getByRole('checkbox',{name:'Distance haze / fog',exact:true}),
    sun:panel.getByRole('checkbox',{name:'Sun lighting',exact:true}),
  }
  const original=parseCameraState(await camera(page)),beforeContext=await context(page)
  const scenes=[
    ['nadir',{...original,headingDegrees:0,pitchDegrees:-90,rollDegrees:0}],
    ['oblique',{...original,headingDegrees:346,pitchDegrees:-32,rollDegrees:0}],
    ['planetary',cameraState(0,0,25000000)],
  ]
  for(const [sceneName,target] of scenes){
    for(const control of Object.values(controls))await control.uncheck()
    await setCamera(page,target);await settle(page)
    const fixed=await camera(page),fixedState=await state(page),fogPolicy=fixedState.atmosphere.fogPolicy
    const fixedGovernance=await assertCameraGovernance(page,engine+'-'+width+'-'+sceneName+'-appearance')
    assertOrientation(parseCameraState(fixed),target,sceneName)
    assert.equal(fixedState.recordedLighting.available,true,'lighting has a real recorded instant')
    assert.equal(fixedState.recordedLighting.frozen,true)
    const canvas=await page.locator('.wv-map-host canvas').first().elementHandle()
    const capture=async(name,reference=null)=>{
      await delay(250)
      const actual=await state(page)
      assert.ok(sameCameraPose(actual.cameraPose,fixedState.cameraPose),name+' preserves position/orientation')
      const actualGovernance=await assertCameraGovernance(page,sceneName+'-'+name,false)
      assert.equal(actualGovernance.minimumZoomDistanceMeters,fixedGovernance.minimumZoomDistanceMeters,'appearance keeps the actual controller floor')
      assert.ok(Math.abs(actualGovernance.rawHeightMeters-fixedGovernance.rawHeightMeters)<1e-8,'appearance keeps raw ellipsoid height')
      assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),parseCameraState(fixed),1e-9))
      assert.equal(await canvas.evaluate(node=>node.isConnected),true)
      assert.deepEqual(actual.atmosphere.fogPolicy,fogPolicy)
      assert.equal(actual.requestRenderMode,true)
      const png=await page.locator('.wv-map-host').screenshot({type:'png'})
      const decoded=decodeScreenshotPng(png),metrics=rasterSummary(decoded,reference)
      const handle='MIP_WORLD_APPEARANCE_'+engine+'_'+width+'_'+sceneName+'_'+name
      console.log(handle+'='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:75})).toString('base64'))
      return {decoded,metrics,handle}
    }
    const baseline=await capture('neutral'),results=[]
    if(sceneName==='nadir')await assertGlobeCredits(page,engine,width)
    if(sceneName==='nadir')console.log('MIP_WORLD_CONTEXT_'+engine+'_'+width+'='+(await contextScreenshot(page)).toString('base64'))
    for(const name of ['relief','ground','haze','sun','combined']){
      for(const control of Object.values(controls))await control.uncheck()
      await delay(250)
      const requests={...counts},frames=(await state(page)).renderedFrames,start=Date.now()
      for(const [key,control] of Object.entries(controls))if(name==='combined'||name===key)await control.check()
      const image=await capture(name,baseline.decoded),actual=await state(page)
      const result={effect:name,elapsedMs:Date.now()-start,frames:actual.renderedFrames-frames,requests:deltaRequests(counts,requests),metrics:image.metrics,imageHandle:image.handle,
        recordedLighting:{frozen:actual.recordedLighting.frozen,lightingEnabled:actual.recordedLighting.lightingEnabled}}
      assert.deepEqual(result.requests,{imagery:0,terrain:0},'settled appearance switches fetch no more terrain/imagery')
      if(sceneName==='oblique'&&name==='haze')assert.ok(image.metrics.whole.changedPixels>0,'oblique haze must change actual decoded canvas pixels')
      if(sceneName==='planetary'&&name==='sun')assert.ok(image.metrics.whole.changedPixels>0,'recorded lighting must change actual planetary pixels')
      results.push(result)
    }
    assert.deepEqual(await context(page),beforeContext);assert.equal(page.url(),route)
    console.log('MIP_WORLD_APPEARANCE_METRICS='+JSON.stringify({engine,width,scene:sceneName,fixedCamera:fixed,neutral:baseline.metrics,neutralHandle:baseline.handle,results,fogPolicy,
      interpretation:'Changes are attributed to individual switches at one camera. No-change in a faded view is reported. Neutral includes the real imagery and terrain mesh; this does not separately isolate those two inputs.'}))
    await idleSample(page,counts,engine+'-'+width+'-'+sceneName)
  }
}
async function realJourney(browser,engine,width){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
  const verifyBoundary=observeBackendBoundary(page),errors=[],counts=observeRequests(page)
  page.on('pageerror',e=>errors.push(e.message))
  try{
    await openWorld(page)
    await assertCameraGovernance(page,engine+'-'+width+'-selected-ready')
    const initial=parseCameraState(await camera(page))
    assert.ok(Math.abs(initial.pitchDegrees+90)<0.01,'selected reset is nadir')
    assert.ok(Math.min(initial.headingDegrees,360-initial.headingDegrees)<0.01,'selected reset is north-up')
    const beforeContext=await context(page),beforeRoute=page.url()
    const free={...cameraState(-80,42,700000),headingDegrees:23,pitchDegrees:-65}
    await setCamera(page,free)
    await assertCameraGovernance(page,engine+'-'+width+'-manual-free')
    const saved=parseCameraState(await camera(page)),modes=page.getByRole('tablist',{name:'World View mode',exact:true})
    assertOrientation(saved,free,'manual globe camera')
    await modes.getByRole('tab',{name:'Graph',exact:true}).click()
    await modes.getByRole('tab',{name:'Map',exact:true}).click()
    await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
    await delay(300)
    await assertCameraGovernance(page,engine+'-'+width+'-graph-restoration')
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-6),'Graph round trip keeps manual camera')
    await modes.getByRole('tab',{name:'Split',exact:true}).click()
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-6),'Split preserves camera')
    await modes.getByRole('tab',{name:'Map',exact:true}).click()
    await page.getByRole('button',{name:'North America overview',exact:true}).click()
    const overview=parseCameraState(await camera(page))
    assert.ok(Math.abs(overview.lon+100)<0.001);assert.ok(overview.heightMeters>10000000)
    assert.deepEqual(await context(page),beforeContext);assert.equal(page.url(),beforeRoute)
    await page.getByRole('button',{name:'Return to selected location',exact:true}).click();await delay(100)
    await page.getByRole('button',{name:'Stop camera flight',exact:true}).click()
    const stopped=parseCameraState(await camera(page));await delay(1800)
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),stopped,1e-6),'stop prevents flight completion')
    const cases=[['Cleveland',-81.7,41.4],['coastal',-74,40.7],['mountain',-121.5,40],['desert',-112,33.4],
      ['Plains',-97.5,35.5],['hurricane',-80.2,25.8],['Canada',-123.1,49.3],['high-latitude',-114.4,62.5],
      ['Mexico',-99.1,19.4],['border',-106.5,31.7],['dateline',179.9,51],['north-pole',0,90],['south-pole',0,-90]]
    for(const [name,lon,lat] of(width===1280?cases:cases.filter(c=>['Canada','Mexico'].includes(c[0])))){
      await setCamera(page,cameraState(lon,lat));await delay(150)
      const actual=parseCameraState(await camera(page))
      await assertCameraGovernance(page,engine+'-'+width+'-'+name)
      assert.ok(Math.abs(actual.lat-lat)<0.001,name+' latitude')
      if(Math.abs(lat)<90)assert.ok(Math.abs(actual.lon-lon)<0.001,name+' longitude')
      assert.ok(Math.abs(actual.pitchDegrees+90)<0.01,name+' nadir')
      assert.deepEqual(await context(page),beforeContext);assert.equal(page.url(),beforeRoute)
      console.log('MIP_WORLD_GEOGRAPHY='+JSON.stringify({engine,width,name,camera:actual,terrainCoverage:'approved Ohio only'}))
    }
    await setCamera(page,cameraState(98.3,-41.4,12000000));await delay(300)
    assert.ok((await state(page)).markers.every(m=>!m.visible&&!m.labelVisible),'far-side evidence and labels are hidden')
    await setCamera(page,cameraState(-81.7,41.4,100000));await delay(800)
    assert.ok((await state(page)).markers.some(m=>m.selected&&m.visible&&m.labelVisible),'selected Cleveland remains legible')
    if(width===390){
      await page.getByRole('button',{name:'Interact with map',exact:true}).click()
      assert.ok((await page.locator('.wv-stage').getAttribute('class')).includes('wv-touch-active'))
      await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
      const box=await page.locator('.wv-map-host').boundingBox(),before=await camera(page)
      await page.touchscreen.tap(box.x+box.width*.6,box.y+box.height*.7)
      let dragVerified=false
      if(engine==='chromium'){
        const cdp=await page.context().newCDPSession(page),x=box.x+box.width*.6,y=box.y+box.height*.7
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
        for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*5,y:y+i*2}]});await delay(16)}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(300)
        assert.notEqual(await camera(page),before,'real touch drag navigates');dragVerified=true
      }
      await page.getByRole('button',{name:'Done — scroll page',exact:true}).click()
      assert.ok(!(await page.locator('.wv-stage').getAttribute('class')).includes('wv-touch-active'))
      console.log('MIP_WORLD_TOUCH='+JSON.stringify({engine,width,tapVerified:true,dragVerified,limitation:dragVerified?null:'WebKit exposes tap; native multi-touch drag is not qualified by this driver.'}))
    }
    await page.getByRole('button',{name:'Return to selected location',exact:true}).click();await delay(1800)
    await assertCameraGovernance(page,engine+'-'+width+'-selected-reset')
    await appearanceAblations(page,engine,width,counts)
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
    assert.ok(layout.scroll<=layout.width+1,'controls fit viewport')
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_REAL_PASS='+JSON.stringify({engine,width,canonicalSubject:await identity(page),requests:counts,backend:verifyBoundary()}))
  }catch(error){
    console.log('MIP_WORLD_FAILURE='+JSON.stringify({engine,width,error:error.message,errors,requests:counts}))
    console.log('MIP_WORLD_FAILURE_IMAGE_'+engine+'_'+width+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}
async function fixtureJourney(browser,engine,kind){
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const verifyBoundary=observeBackendBoundary(page),counts=observeRequests(page),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const receipt=await installProjectionFixture(page,kind)
  try{
    await openWorld(page);assert.ok(receipt.matchedRows>0,'synthetic fixture actually applied')
    await setCamera(page,cameraState(-81.7,41.4,100000));await settle(page)
    const original=await camera(page),originalContext=await context(page),canvas=await page.locator('.wv-map-host canvas').first().elementHandle()
    const baseline=await state(page),clusterBaseline=await clusterState(page),labels=baseline.markers.filter(m=>m.labelVisible)
    assert.ok(clusterBaseline?.layout,'canonical grouping probe supplies separate eligibility metadata')
    assert.equal(clusterBaseline.markers.length,receipt.coordinateCount,'canonical location records retain original geometry count')
    const visible=clusterBaseline.markers.filter(marker=>marker.eligible),grouping=clusterBaseline.layout
    assert.equal(new Set(clusterBaseline.markers.map(marker=>marker.id)).size,receipt.coordinateCount,'each canonical geometry location has one versioned display ID')
    if(baseline.layoutTiming){
      assert.equal(baseline.layoutTiming.entityCount,receipt.coordinateCount)
      for(const key of ['lastMs','maxMs','passes'])assert.ok(Number.isFinite(baseline.layoutTiming[key])&&baseline.layoutTiming[key]>=0)
      assert.ok(baseline.layoutTiming.passes>0)
    }
    assert.equal(baseline.markers.length,receipt.coordinateCount,'no marker deduplication/coordinate relocation')
    if(kind==='dense'){
      assert.equal(visible.length,500,'all original dense locations remain eligible')
      assert.ok(grouping,'dense marker grouping exposes actual target membership')
      assert.equal(grouping.clusters.length,1,'dense original locations form one inspectable group')
      assert.equal(grouping.clusters[0].rowCount,1,'500 display locations remain one original row')
      assert.equal(grouping.clusters[0].locationCount,500)
      assert.equal(grouping.stats.targetCount,1,'grouping reduces500 eligible locations to one actual target')
      assert.equal(baseline.markers.filter(m=>m.visible).length,0,'group badge replaces original overlapping symbols')
      assert.ok(grouping.clusters[0].selected,'selected original row remains discoverable')
    }
    else{assert.equal(visible.length,4,'far hemisphere point suppressed');assert.ok(labels.length>=2,'separate sparse labels remain readable')}
    const beforeResizeFrames=baseline.renderedFrames,start=Date.now()
    await page.setViewportSize({width:320,height:900});await settle(page)
    const small=await state(page)
    assert.ok(small.renderedFrames>beforeResizeFrames,'responsive resize causes actual renderer update')
    const smallGrouping=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout??null)
    assert.ok(small.markers.some(m=>m.visible&&m.labelVisible)||smallGrouping?.clusters.some(group=>group.selected),'resize keeps an on-screen selected label or inspectable selected group')
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),parseCameraState(original),1e-9),'resize retains camera')
    assert.equal(await canvas.evaluate(n=>n.isConnected),true,'resize retains viewer')
    const smallLayout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
    assert.ok(smallLayout.scroll<=smallLayout.width+1)
    console.log('MIP_WORLD_FIXTURE_IMAGE_'+engine+'_'+kind+'_320='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:75})).toString('base64'))
    await page.setViewportSize({width:1280,height:900});await settle(page)
    const resizeElapsedMs=Date.now()-start
    assert.deepEqual((await state(page)).markers,baseline.markers,'resize round trip restores marker/label arbitration')
    await idleSample(page,counts,engine+'-'+kind+'-resize')
    // Locate one marker's real viewport edge, then cross it with less than
    // 0.0001 degrees of motion. This exercises changes below the former 1%
    // camera.changed threshold, using public visibility results only.
    const anchorMarker=visible[0],anchor=anchorMarker.id
    const markerTuple=JSON.parse(anchor),positionIndex=markerTuple[1]
    assert.ok(Number.isSafeInteger(positionIndex)&&positionIndex>=0,'canonical marker ID supplies its original geometry index')
    const originalSource=receipt.selectionRows[0]
    assert.equal(JSON.parse(anchorMarker.rowKey)[3],originalSource.revision_id,'canonical anchor binds the retained original revision')
    // The unchanged Fidelity probe uses actual Cesium entity IDs, not canonical
    // display IDs. Bridge only the published revision/index naming contract to
    // retain the original entity's drawn/label assertions without inventing an
    // eligibility field on that historical probe.
    const fidelityAnchorId=originalSource.revision_id+'-'+positionIndex
    assert.ok(baseline.markers.some(marker=>marker.id===fidelityAnchorId),'original retained entity exists for the canonical anchor')
    const visibleAt=async lon=>{
      const before=(await state(page)).renderedFrames
      await setCamera(page,cameraState(lon,41.4,100000))
      await page.waitForFunction(frames=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().renderedFrames>frames,before)
      await delay(70)
      const marker=(await clusterState(page)).markers.find(marker=>marker.id===anchor)
      assert.ok(marker,'canonical geometry member remains retained during clipping')
      return marker.eligible
    }
    let inside=-81.7,outside=-79.7
    assert.equal(await visibleAt(inside),true);assert.equal(await visibleAt(outside),false)
    for(let i=0;i<17;i++){const middle=(inside+outside)/2;if(await visibleAt(middle))inside=middle;else outside=middle}
    assert.ok(Math.abs(outside-inside)<0.0001)
    assert.equal(await visibleAt(inside),true)
    const beforeMotion=await state(page)
    assert.equal(await visibleAt(outside),false,'small motion updates clipping without stale marker visibility')
    const afterMotion=await state(page)
    const clipped=(await clusterState(page)).markers.find(marker=>marker.id===anchor)
    assert.equal(clipped.eligible,false,'canonical geometry member crosses its actual viewport boundary')
    assert.equal(clipped.displayed,false,'clipped canonical geometry member supplies no drawn target')
    const clippedEntity=afterMotion.markers.find(marker=>marker.id===fidelityAnchorId)
    assert.equal(clippedEntity.visible,false,'clipped original Cesium entity is not drawn')
    assert.equal(clippedEntity.labelVisible,false,'clipped original Cesium entity cannot retain a label')
    assert.ok(afterMotion.renderedFrames>beforeMotion.renderedFrames)
    await idleSample(page,counts,engine+'-'+kind+'-small-motion')
    await setCamera(page,parseCameraState(original));await settle(page)
    assert.deepEqual((await state(page)).markers,baseline.markers,'restoration keeps deterministic fixture labels')
    assert.deepEqual(await context(page),originalContext);assert.equal(page.url(),route)
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_FIXTURE_PASS='+JSON.stringify({engine,kind,synthetic:true,receipt,
      baseline:{markers:baseline.markers.length,eligible:visible.length,drawnOriginals:baseline.markers.filter(m=>m.visible).length,labels:grouping?.stats.labelCount??labels.length,groupTargets:grouping?.stats.targetCount??null},
      resize:{width:320,visible:small.markers.filter(m=>m.visible).length,labels:small.markers.filter(m=>m.labelVisible).length,elapsedMs:resizeElapsedMs},
      layoutTiming:(await state(page)).layoutTiming??null,
      smallMotion:{deltaLongitude:outside-inside,frames:afterMotion.renderedFrames-beforeMotion.renderedFrames},
      requests:counts,backend:verifyBoundary(),
      limitation:'MultiPoint members of one selected original row exercise marker density. Group targets reduce drawn overlap; original coordinate records remain retained. Independent-row selection is qualified separately by the isolated clustering contract verifier.'}))
  }catch(error){
    console.log('MIP_WORLD_FIXTURE_FAILURE='+JSON.stringify({engine,kind,error:error.message,receipt,errors,requests:counts}))
    console.log('MIP_WORLD_FIXTURE_FAILURE_IMAGE_'+engine+'_'+kind+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}
let browser
try{
  verifyRasterEvidence()
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok}catch{}if(ready)break;await delay(250)}
  assert.ok(ready)
  for(const engine of ['chromium','webkit']){
    browser=await {chromium,webkit}[engine].launch({headless:true})
    for(const width of [1280,390])await realJourney(browser,engine,width)
    for(const kind of ['dense','sparse'])await fixtureJourney(browser,engine,kind)
    await browser.close();browser=null
  }
  console.log('MIP_WORLD_SUCCESSOR_BROWSER_PASS')
}finally{await browser?.close();server.kill('SIGTERM')}
