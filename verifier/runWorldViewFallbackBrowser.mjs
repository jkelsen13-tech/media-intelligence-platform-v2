// Bounded real MapLibre fallback qualification. Requires the integrated width
// governor and public raw-map snapshot; no renderer objects or backend writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { parseCameraState } from '../src/lib/worldViewCameraState.js'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { observeBackendBoundary } from './backendBoundary.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json'),{chromium}=require('playwright')
const origin='http://127.0.0.1:4173',subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const route=origin+'/media-intelligence-platform-v2/#/event/'+subject+'/world'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
let browser
try{
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
}finally{await browser?.close();server.kill('SIGTERM')}
