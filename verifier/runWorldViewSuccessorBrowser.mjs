// Existing anonymous reader contract; remote ephemeral browser only.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { cameraStatesEqual, parseCameraState } from '../src/lib/worldViewCameraState.js'
import { observeBackendBoundary } from './backendBoundary.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {chromium,webkit}=require('playwright')
const origin='http://127.0.0.1:4173', route=origin+'/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const cameraState=(lon,lat,heightMeters=200000)=>({version:1,lon,lat,heightMeters,headingDegrees:0,pitchDegrees:-90,rollDegrees:0})
let browser
try{
 let ready=false
 for(let i=0;i<40;i++){try{ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok}catch{}if(ready)break;await delay(250)}
 assert.ok(ready)
 for(const engine of ['chromium','webkit']){
  browser=await {chromium,webkit}[engine].launch({headless:true})
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
   const verifyBoundary=observeBackendBoundary(page), errors=[];page.on('pageerror',e=>errors.push(e.message))
   const counts={imagery:0,terrain:0}
   page.on('request',r=>{if(r.url().includes('tile.openstreetmap.org'))counts.imagery++;if(r.url().includes('/terrarium/'))counts.terrain++})
   await page.goto(route)
   await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
   await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
   await delay(2000)
   const camera=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
   const state=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
   assert.equal(await page.locator('[data-map-stack]').getAttribute('data-map-stack'),'ellipsoid-globe')
   const initial=parseCameraState(await camera())
   assert.ok(Math.abs(initial.pitchDegrees+90)<0.01,'selected reset is nadir')
   const context=()=>page.locator('[data-investigation-context]').first().getAttribute('data-canonical-subject-id')
   const beforeContext=await context(),beforeRoute=page.url()
   const free={...cameraState(-80,42,700000),headingDegrees:23,pitchDegrees:-65}
   assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),free),true)
   const saved=parseCameraState(await camera())
   const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
   await modes.getByRole('tab',{name:'Graph',exact:true}).click()
   await modes.getByRole('tab',{name:'Map',exact:true}).click()
   await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
   await delay(300)
   assert.ok(cameraStatesEqual(parseCameraState(await camera()),saved,0.001),'Graph round trip keeps manual camera')
   await modes.getByRole('tab',{name:'Split',exact:true}).click()
   assert.ok(cameraStatesEqual(parseCameraState(await camera()),saved,0.001),'Split preserves camera')
   await modes.getByRole('tab',{name:'Map',exact:true}).click()
   await page.getByRole('button',{name:'North America overview',exact:true}).click()
   const overview=parseCameraState(await camera());assert.ok(Math.abs(overview.lon+100)<0.001);assert.ok(overview.heightMeters>10000000)
   assert.equal(await context(),beforeContext);assert.equal(page.url(),beforeRoute)
   await page.getByRole('button',{name:'Return to selected location',exact:true}).click()
   await delay(100)
   await page.getByRole('button',{name:'Stop camera flight',exact:true}).click()
   const stopped=parseCameraState(await camera());await delay(1800)
   assert.ok(cameraStatesEqual(parseCameraState(await camera()),stopped,0.001),'stop prevents flight completion')
   const cases=[['Cleveland',-81.7,41.4],['coastal',-74,40.7],['mountain',-121.5,40],['desert',-112,33.4],
     ['Plains',-97.5,35.5],['hurricane',-80.2,25.8],['Canada',-123.1,49.3],['high-latitude',-114.4,62.5],
     ['Mexico',-99.1,19.4],['border',-106.5,31.7],['dateline',179.9,51],['north-pole',0,90],['south-pole',0,-90]]
   // All classes on desktop; touch viewport exercises Canada/Mexico and overview.
   for(const [name,lon,lat] of (width===1280?cases:cases.filter(c=>['Canada','Mexico'].includes(c[0])))){
    const target=cameraState(lon,lat)
    assert.equal(await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),target),true)
    await delay(150)
    const actual=parseCameraState(await camera())
    assert.ok(Math.abs(actual.lat-lat)<0.001,name+' latitude')
    assert.ok(Math.abs(actual.pitchDegrees+90)<0.01,name+' nadir')
    assert.equal(await context(),beforeContext);assert.equal(page.url(),beforeRoute)
    console.log('MIP_WORLD_GEOGRAPHY='+JSON.stringify({engine,width,name,camera:actual,terrainCoverage:'approved Ohio only'}))
   }
   // Real Cleveland projection must disappear from the opposite hemisphere.
   await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),cameraState(98.3,-41.4,12000000))
   await delay(300)
   assert.ok((await state()).markers.every(m=>!m.visible&&!m.labelVisible),'far-side evidence and labels are hidden')
   await page.evaluate(s=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(s)),cameraState(-81.7,41.4,100000))
   await delay(800)
   assert.ok((await state()).markers.some(m=>m.selected&&m.visible&&m.labelVisible),'selected Cleveland remains legible')
   if(width===390){
    await page.getByRole('button',{name:'Interact with map',exact:true}).click()
    const box=await page.locator('.wv-map-host').boundingBox()
    const before=await camera()
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2)
    // Real touch gesture through Chromium DevTools; WebKit uses touch tap plus controls.
    if(engine==='chromium'){
      const cdp=await page.context().newCDPSession(page),x=box.x+box.width/2,y=box.y+box.height/2
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y:y+20}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      await delay(300);assert.notEqual(await camera(),before,'touch drag navigates')
    }
    await page.getByRole('button',{name:'Done — scroll page',exact:true}).click()
   }
   await page.getByRole('button',{name:'Return to selected location',exact:true}).click();await delay(2000)
   const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
   await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
   await panel.getByRole('button',{name:'Show Atmosphere settings',exact:true}).click()
   await panel.getByRole('button',{name:'Show Lighting settings',exact:true}).click()
   const relief=panel.getByRole('checkbox',{name:'Terrain relief shading',exact:true})
   const atmosphere=panel.getByRole('checkbox',{name:'Atmosphere effects',exact:true})
   const ground=panel.getByRole('checkbox',{name:'Ground atmosphere',exact:true}),haze=panel.getByRole('checkbox',{name:'Distance haze / fog',exact:true})
   const lighting=panel.getByRole('checkbox',{name:'Lighting effects',exact:true}),sun=panel.getByRole('checkbox',{name:'Sun lighting',exact:true})
   await relief.uncheck();await atmosphere.check();await ground.uncheck();await haze.uncheck()
   const fixed=await camera(),fogPolicy=(await state()).atmosphere.fogPolicy
   const capture=async name=>{
    await delay(300)
    assert.ok(cameraStatesEqual(parseCameraState(await camera()),parseCameraState(fixed),0.001),name+' same camera')
    const image=await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:65})
    console.log('MIP_WORLD_RENDER_IMAGE_'+engine+'_'+width+'_'+name+'='+image.toString('base64'))
    return image
   }
   const neutral=await capture('neutral'),baseCounts={...counts},frames=(await state()).renderedFrames
   await relief.check();const reliefImage=await capture('relief')
   await relief.uncheck();await ground.check();const groundImage=await capture('ground')
   await ground.uncheck();await haze.check();const hazeImage=await capture('haze')
   await haze.uncheck();await lighting.check();await sun.check();const sunImage=await capture('sun')
   await ground.check();await haze.check();await relief.check();await capture('combined')
   const final=await state()
   assert.deepEqual(final.atmosphere.fogPolicy,fogPolicy,'visual fog does not change culling/request policy')
   assert.equal(final.requestRenderMode,true)
   console.log('MIP_WORLD_RENDER_OBSERVATIONS='+JSON.stringify({engine,width,frames:final.renderedFrames-frames,
     requests:{imagery:counts.imagery-baseCounts.imagery,terrain:counts.terrain-baseCounts.terrain},
     reliefPixelsDiffer:!neutral.equals(reliefImage),groundPixelsDiffer:!neutral.equals(groundImage),
     hazePixelsDiffer:!neutral.equals(hazeImage),sunPixelsDiffer:!neutral.equals(sunImage),
     fixedCamera:fixed,fogPolicy}))
   const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
   assert.ok(layout.scroll<=layout.width+1)
   assert.deepEqual(errors,[]);verifyBoundary()
   await page.close()
  }
  await browser.close();browser=null
 }
 console.log('MIP_WORLD_SUCCESSOR_BROWSER_PASS')
}finally{await browser?.close();server.kill('SIGTERM')}
