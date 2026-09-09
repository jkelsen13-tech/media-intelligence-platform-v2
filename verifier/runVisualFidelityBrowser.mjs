// Anonymous browser acceptance in ephemeral Actions storage, using real eligible
// Cleveland geography. Fault injection is confined to the disposable browser.
import assert from 'node:assert/strict'
import { sameCameraPose } from './cameraPoseComparison.mjs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { observeBackendBoundary } from './backendBoundary.mjs'
const require = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')
const { chromium, webkit } = require('playwright')
const origin = process.env.MIP_LIVE_SITE === '1' ? 'https://jkelsen13-tech.github.io' : 'http://127.0.0.1:4173'
const server = process.env.MIP_LIVE_SITE === '1' ? null : spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const url = origin + '/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world'
let browser
try {
  let ready=false
  for(let i=0;i<40;i++){
    try { ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok } catch {}
    if(ready)break
    await delay(250)
  }
  assert.ok(ready,'preview starts')
  for(const engine of ['chromium','webkit']){
    browser=await ({chromium,webkit}[engine]).launch({headless:true})
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
      const verifyBackend=observeBackendBoundary(page)
      const errors=[]
      page.on('pageerror',error=>errors.push(error.message))
      await page.goto(url)
      await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
      const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
      await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
      const relief=panel.getByRole('checkbox',{name:'Terrain relief shading',exact:true})
      await page.waitForFunction(()=>document.querySelector('[data-fidelity-effect="reliefShading"]')?.dataset.effectStatus!=='unavailable'
        || document.querySelector('[data-map-stack]')?.dataset.mapStack!=='ellipsoid-globe')
      const supported=await relief.isEnabled()
      assert.equal(supported,true,'normal verification must exercise active globe relief, not only fallback')
      const profile=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getProfile())
      const camera=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
      const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
      const route=page.url()
      const beforeProfile=await profile()
      await delay(1800) // complete existing subject flight before comparing fixed camera
      const before=await camera()
      const canvas=page.locator('.wv-map-host canvas').first()
      const originalCanvas=await canvas.elementHandle()
      const beforeTerrain=await page.evaluate(()=>window.__MIP_WORLD_VIEW_TERRAIN_PROBE__.getTerrainStatus())
      assert.equal(beforeTerrain.status,'active','same-camera comparison needs actual approved terrain')
      const started=Date.now()
      let requestsDuringToggle=0
      const countRequest=request=>{if (/terrarium/.test(request.url())) requestsDuringToggle++}
      page.on('request',countRequest)
      const master=panel.getByRole('checkbox',{name:'Photoreal',exact:true})
      await master.uncheck()
      assert.equal(await relief.isChecked(),false,'master off reports actual inactive relief')
      const offProfile=await profile()
      assert.deepEqual(offProfile.categories,beforeProfile.categories,'master retains children')
      assert.equal(offProfile.preset,beforeProfile.preset)
      await delay(300)
      const neutral=await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:65})
      await master.check()
      assert.deepEqual(await profile(),beforeProfile,'master restores exact profile')
      assert.equal(await camera(),before,'master never moves camera')
      await delay(300)
      const enhanced=await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:65})
      page.off('request',countRequest)
      assert.equal(neutral.equals(enhanced),false,'relief changes canvas pixels at the same camera')
      console.log('MIP_FIDELITY_SAME_CAMERA='+JSON.stringify({engine,width,supported,requestsDuringToggle,camera:before,pixelsDiffer:!neutral.equals(enhanced)}))
      console.log('MIP_FIDELITY_ENHANCED_'+engine+'_'+width+'='+enhanced.toString('base64'))
      assert.ok(await originalCanvas.evaluate(node=>node.isConnected),'profile must not remount the viewer')
      if(supported){
        assert.equal(await relief.isChecked(),true)
        const terrain=panel.getByRole('checkbox',{name:'Terrain effects',exact:true})
        await terrain.uncheck()
        assert.equal(await relief.isChecked(),false)
        assert.equal((await profile()).categories.terrain.reliefShading,true)
        await terrain.check()
        await relief.uncheck()
        assert.equal((await profile()).preset,'custom')
        await modes.getByRole('tab',{name:'Graph',exact:true}).click()
        assert.equal(await relief.isChecked(),false)
        assert.equal(await relief.isDisabled(),true)
        await modes.getByRole('tab',{name:'Map',exact:true}).click()
        await page.waitForFunction(()=>document.querySelector('[data-fidelity-effect="reliefShading"]')?.dataset.effectStatus==='supported')
        assert.equal(await relief.isChecked(),false,'Map/Graph/Map restores leaf off')
        await relief.check()
        await modes.getByRole('tab',{name:'Split',exact:true}).click()
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
        assert.equal(await relief.isChecked(),true,'Split keeps preference')
        await modes.getByRole('tab',{name:'Map',exact:true}).click()
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
      } else {
        assert.equal(await relief.isChecked(),false,'fallback never pretends relief is active')
      }
      const preset=panel.getByRole('combobox',{name:'Visual Fidelity preset',exact:true})
      await preset.selectOption('performance')
      assert.equal(await relief.isChecked(),false)
      await preset.selectOption('maximum')
      assert.equal(await relief.isChecked(),supported)
      for(const category of ['Lighting','Atmosphere','Image Quality','Depth & Materials']){
        await panel.getByRole('button',{name:'Show '+category+' settings',exact:true}).click()
      }
      const deferred=panel.locator('[data-effect-status="deferred"] input')
      assert.equal(await deferred.count(),7)
      for(const control of await deferred.all()){
        assert.equal(await control.isChecked(),false)
        assert.equal(await control.isDisabled(),true)
      }
      const fxaa=panel.getByRole('checkbox',{name:'FXAA',exact:true})
      assert.equal(await fxaa.isChecked(),false,'FXAA stays off in Maximum')
      const imageQuality=panel.getByRole('checkbox',{name:'Image Quality effects',exact:true})
      await imageQuality.check()
      await delay(1800)
      const fxaaCamera=await camera()
      const fxaaCanvas=await page.locator('.wv-map-host canvas').first().elementHandle()
      const fxaaNeutral=await page.locator('.wv-map-host').screenshot({type:'png'})
      const renderState=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
      assert.equal((await renderState()).fxaa.enabled,false)
      let fxaaRequests=0
      const countFxaa=request=>{if(/terrarium/.test(request.url()))fxaaRequests++}
      page.on('request',countFxaa)
      const fxaaStart=Date.now()
      await fxaa.check()
      await page.waitForFunction(()=> {
        const state=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()
        return state?.fxaa.enabled && state.fxaa.ready
      })
      await delay(300)
      const fxaaEnhanced=await page.locator('.wv-map-host').screenshot({type:'png'})
      page.off('request',countFxaa)
      assert.equal(fxaaNeutral.equals(fxaaEnhanced),false,'FXAA changes actual pixels')
      assert.equal((await renderState()).requestRenderMode,true)
      assert.equal(await camera(),fxaaCamera)
      assert.equal(await fxaaCanvas.evaluate(node=>node.isConnected),true)
      assert.equal((await profile()).preset,'custom')
      const fxaaProfile=await profile()
      await master.uncheck()
      assert.equal((await renderState()).fxaa.enabled,false)
      await master.check()
      assert.deepEqual(await profile(),fxaaProfile)
      assert.equal((await renderState()).fxaa.enabled,true)
      await imageQuality.uncheck()
      assert.equal((await renderState()).fxaa.enabled,false)
      await imageQuality.check()
      assert.equal((await renderState()).fxaa.enabled,true)
      await modes.getByRole('tab',{name:'Graph',exact:true}).click()
      assert.equal(await fxaa.isChecked(),false)
      assert.equal(await fxaa.isDisabled(),true)
      await modes.getByRole('tab',{name:'Map',exact:true}).click()
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.fxaa.enabled)
      assert.equal(await fxaa.isChecked(),true,'FXAA returns after renderer remount')
      console.log('MIP_FXAA_PASS='+JSON.stringify({engine,width,pixelsDiffer:true,requestsDuringToggle:fxaaRequests,elapsedMs:Date.now()-fxaaStart,requestRenderMode:true,preferencesRetained:true}))
      console.log('MIP_FXAA_NEUTRAL_'+engine+'_'+width+'='+fxaaNeutral.toString('base64'))
      console.log('MIP_FXAA_ENHANCED_'+engine+'_'+width+'='+fxaaEnhanced.toString('base64'))
      await preset.selectOption('balanced')
      assert.equal((await renderState()).fxaa.enabled,false,'Balanced does not silently opt in')

      // Bounded resolution: neutral defaults, actual framebuffer scale, same
      // camera/canvas/route, no pixel-density multiplier, retained gates/remount.
      const resolution=panel.getByRole('combobox',{name:'Render resolution',exact:true})
      await imageQuality.check()
      assert.equal(await resolution.inputValue(),'1')
      await delay(1800) // finish the preceding Map remount/subject flight
      await page.waitForLoadState('networkidle',{timeout:30000})
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:30000})
      await page.waitForLoadState('networkidle',{timeout:30000})
      const resolutionCamera=await camera()
      const resolutionCanvas=await page.locator('.wv-map-host canvas').first().elementHandle()
      const baseline=(await renderState()).resolution
      const resolutionSamples=[]
      let resolutionRequests=0
      const resolutionRequestUrls=[]
      const countResolution=request=>{if(/terrarium|tile.openstreetmap.org/.test(request.url())){resolutionRequests++;resolutionRequestUrls.push(request.url())}}
      page.on('request',countResolution)
      for(const scale of [0.75,1.25,1]){
        const start=Date.now()
        await resolution.selectOption(String(scale))
        await page.waitForFunction(expected=>{
          const r=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.resolution
          return r?.scale===expected && Math.abs(r.width-Math.floor(r.cssWidth*expected))<=1
            && Math.abs(r.height-Math.floor(r.cssHeight*expected))<=1
        },scale)
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:30000})
        await delay(350)
        const state=(await renderState()).resolution
        assert.equal(state.browserRecommended,true)
        assert.equal(state.cssWidth,baseline.cssWidth);assert.equal(state.cssHeight,baseline.cssHeight)
        assert.equal(await camera(),resolutionCamera)
        assert.equal(await resolutionCanvas.evaluate(n=>n.isConnected),true)
        assert.equal(page.url(),route)
        assert.equal((await renderState()).requestRenderMode,true)
        resolutionSamples.push({scale,...state,requestsSoFar:resolutionRequests,elapsedMs:Date.now()-start})
        console.log('MIP_RESOLUTION_IMAGE_'+engine+'_'+width+'_'+scale+'='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:70})).toString('base64'))
      }
      page.off('request',countResolution)
      console.log('MIP_RESOLUTION_REQUESTS='+JSON.stringify({engine,width,resolutionSamples,resolutionRequests,resolutionRequestUrls}))
      assert.equal(resolutionRequests,0,'settled resolution toggles must not fetch more terrain/imagery')
      await resolution.selectOption('1.25')
      const rememberedResolution=await profile()
      for(const gate of [master,imageQuality]){
        await gate.uncheck()
        assert.equal((await renderState()).resolution.scale,1)
        assert.equal(await resolution.inputValue(),'1')
        await gate.check()
        assert.deepEqual(await profile(),rememberedResolution)
        assert.equal((await renderState()).resolution.scale,1.25)
      }
      await modes.getByRole('tab',{name:'Graph',exact:true}).click()
      assert.equal(await resolution.isDisabled(),true)
      assert.equal(await resolution.inputValue(),'1')
      await modes.getByRole('tab',{name:'Map',exact:true}).click()
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.resolution.scale===1.25)
      assert.equal(await resolution.inputValue(),'1.25')
      await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
      await delay(1800)
      await page.waitForFunction(()=>{
        const r=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()
        const t=window.__MIP_WORLD_VIEW_TERRAIN_PROBE__?.getTerrainStatus()
        return r?.globeTilesLoaded && r.resolution.scale===1.25 && t?.status==='active' && t.fetchSuccesses>0
      },{},{timeout:30000})
      await page.waitForLoadState('networkidle',{timeout:30000})
      console.log('MIP_RESOLUTION_REMOUNT_IMAGE_'+engine+'_'+width+'='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:70})).toString('base64'))
      console.log('MIP_RESOLUTION_REMOUNT_PASS='+JSON.stringify({engine,width,state:await renderState(),terrain:await page.evaluate(()=>window.__MIP_WORLD_VIEW_TERRAIN_PROBE__.getTerrainStatus())}))
      await preset.selectOption('balanced')
      assert.equal((await renderState()).resolution.scale,1)
      console.log('MIP_RESOLUTION_PASS='+JSON.stringify({engine,width,resolutionSamples,resolutionRequests,remembered:true,remount:true,routePreserved:page.url()===route}))


      // Atmosphere uses public display switches only. The high camera is a
      // disposable verifier view, never a change made by a fidelity control.
      const atmosphereGate=panel.getByRole('checkbox',{name:'Atmosphere effects',exact:true})
      await atmosphereGate.check()
      const atmosphereControls={
        groundAtmosphere:panel.getByRole('checkbox',{name:'Ground atmosphere',exact:true}),
        distanceHaze:panel.getByRole('checkbox',{name:'Distance haze / fog',exact:true}),
      }
      const localCamera=await camera()
      for(const [effect,control] of Object.entries(atmosphereControls)){
        assert.equal(await control.isChecked(),false,'atmosphere defaults off')
        const target=effect==='groundAtmosphere'
          ? JSON.stringify({...JSON.parse(localCamera),heightMeters:12000000,pitchDegrees:-90,rollDegrees:0}) : localCamera
        assert.equal(await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(value),target),true)
        await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
        await delay(1000)
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:30000})
        await page.waitForLoadState('networkidle',{timeout:30000})
        const fixedCanvas=await page.locator('.wv-map-host canvas').first().elementHandle()
        const policy=(await renderState()).atmosphere.fogPolicy
        const beforeImage=await page.locator('.wv-map-host').screenshot({type:'png'})
        const fixedPose=(await renderState()).cameraPose
        let requests=0
        const counter=req=>{if(/terrarium|tile.openstreetmap.org/.test(req.url()))requests++}
        page.on('request',counter)
        const start=Date.now()
        await control.check()
        await page.waitForFunction(name=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.atmosphere[name]===true,effect)
        await delay(400)
        const afterImage=await page.locator('.wv-map-host').screenshot({type:'png'})
        await control.uncheck()
        await delay(200)
        page.off('request',counter)
        assert.equal(beforeImage.equals(afterImage),false,effect+' changes actual pixels')
        assert.equal(sameCameraPose((await renderState()).cameraPose,fixedPose),true,'effect preserves exact position and orientation within 16 machine epsilons')
        assert.equal(await fixedCanvas.evaluate(node=>node.isConnected),true)
        assert.deepEqual((await renderState()).atmosphere.fogPolicy,policy)
        assert.equal((await renderState()).atmosphere.lightingEnabled,false)
        assert.equal((await renderState()).requestRenderMode,true)
        assert.equal(page.url(),route)
        console.log('MIP_ATMOSPHERE_PASS='+JSON.stringify({engine,width,effect,requests,elapsedMs:Date.now()-start,policy,sameCamera:true,pixelsDiffer:true}))
        assert.equal(requests,0,'settled atmosphere toggles preserve terrain/imagery requests')
        console.log('MIP_ATMOSPHERE_NEUTRAL_'+engine+'_'+width+'_'+effect+'='+beforeImage.toString('base64'))
        console.log('MIP_ATMOSPHERE_ON_'+engine+'_'+width+'_'+effect+'='+afterImage.toString('base64'))
      }
      for(const control of Object.values(atmosphereControls))await control.check()
      const rememberedAtmosphere=await profile()
      for(const gate of [master,atmosphereGate]){
        await gate.uncheck()
        for(const effect of Object.keys(atmosphereControls))assert.equal((await renderState()).atmosphere[effect],false)
        await gate.check()
        assert.deepEqual(await profile(),rememberedAtmosphere)
        for(const effect of Object.keys(atmosphereControls))assert.equal((await renderState()).atmosphere[effect],true)
      }
      await modes.getByRole('tab',{name:'Graph',exact:true}).click()
      for(const control of Object.values(atmosphereControls)){assert.equal(await control.isDisabled(),true);assert.equal(await control.isChecked(),false)}
      await modes.getByRole('tab',{name:'Map',exact:true}).click()
      await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
      await delay(1800)
      await page.waitForFunction(()=>{
        const s=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()
        const t=window.__MIP_WORLD_VIEW_TERRAIN_PROBE__?.getTerrainStatus()
        return s?.globeTilesLoaded && s.atmosphere.groundAtmosphere && s.atmosphere.distanceHaze && t?.status==='active' && t.fetchSuccesses>0
      },{},{timeout:30000})
      console.log('MIP_ATMOSPHERE_REMOUNT_'+engine+'_'+width+'='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:70})).toString('base64'))
      await preset.selectOption('balanced')
      for(const effect of Object.keys(atmosphereControls))assert.equal((await renderState()).atmosphere[effect],false)
      console.log('MIP_ATMOSPHERE_MEMORY_PASS='+JSON.stringify({engine,width,master:true,category:true,remount:true,presetNeutral:true}))


      // Calculated lighting uses the recorded instant; shader qualification is
      // planetary because Cesium intentionally fades day/night shading nearby.
      const sun=panel.getByRole('checkbox',{name:'Sun lighting',exact:true})
      const lightingGate=panel.getByRole('checkbox',{name:'Lighting effects',exact:true})
      assert.equal(await sun.isChecked(),false)
      assert.equal(await sun.isDisabled(),true,'lighting category starts off')
      await lightingGate.check()
      const sunLocal=await camera()
      const sunPlanet=JSON.stringify({...JSON.parse(sunLocal),heightMeters:25000000,pitchDegrees:-90,rollDegrees:0})
      assert.equal(await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(value),sunPlanet),true)
      await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
      await delay(1000)
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:30000})
      await page.waitForLoadState('networkidle',{timeout:30000})
      const sunCamera=(await renderState()).cameraPose
      const sunCanvas=await page.locator('.wv-map-host canvas').first().elementHandle()
      const clockBefore=(await renderState()).recordedLighting
      assert.equal(clockBefore.available,true)
      assert.equal(clockBefore.frozen,true)
      const sunNeutral=await page.locator('.wv-map-host').screenshot({type:'png'})
      let sunRequests=0
      const sunCounter=req=>{if(/terrarium|tile.openstreetmap.org/.test(req.url()))sunRequests++}
      page.on('request',sunCounter)
      const sunStart=Date.now()
      await sun.check()
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.recordedLighting?.lightingEnabled)
      await delay(500)
      const sunOn=await page.locator('.wv-map-host').screenshot({type:'png'})
      console.log('MIP_RECORDED_SUN_CAMERA='+JSON.stringify({engine,width,before:sunCamera,after:(await renderState()).cameraPose,
        clock:(await renderState()).recordedLighting,requests:sunRequests,route:page.url()}))
      console.log('MIP_RECORDED_SUN_NEUTRAL_'+engine+'_'+width+'='+sunNeutral.toString('base64'))
      console.log('MIP_RECORDED_SUN_ON_'+engine+'_'+width+'='+sunOn.toString('base64'))
      assert.equal(sunNeutral.equals(sunOn),false,'sun lighting changes actual globe pixels')
      assert.equal(sameCameraPose((await renderState()).cameraPose,sunCamera),true)
      assert.equal(await sunCanvas.evaluate(n=>n.isConnected),true)
      const litClock=(await renderState()).recordedLighting
      assert.deepEqual({...litClock,lightingEnabled:false},clockBefore)
      assert.equal(litClock.dynamicAtmosphere,false)
      assert.equal(litClock.sunDirectedAtmosphere,false)
      // Existing atmosphere switches remain independent with lighting active.
      await atmosphereGate.check()
      for(const control of Object.values(atmosphereControls))await control.check()
      for(const effect of Object.keys(atmosphereControls))assert.equal((await renderState()).atmosphere[effect],true)
      for(const control of Object.values(atmosphereControls))await control.uncheck()
      assert.equal((await renderState()).recordedLighting.lightingEnabled,true)
      const sunProfile=await profile()
      for(const gate of [master,lightingGate]){
        await gate.uncheck()
        assert.equal((await renderState()).recordedLighting.lightingEnabled,false)
        await gate.check()
        assert.deepEqual(await profile(),sunProfile)
        assert.equal((await renderState()).recordedLighting.lightingEnabled,true)
      }
      page.off('request',sunCounter)
      console.log('MIP_RECORDED_SUN_PASS='+JSON.stringify({engine,width,clock:litClock,sameCamera:true,sameCanvas:true,
        pixelsDiffer:true,requests:sunRequests,elapsedMs:Date.now()-sunStart}))
      assert.equal(sunRequests,0,'settled light toggles add no terrain or imagery requests')
      console.log('MIP_RECORDED_SUN_NEUTRAL_'+engine+'_'+width+'='+sunNeutral.toString('base64'))
      console.log('MIP_RECORDED_SUN_ON_'+engine+'_'+width+'='+sunOn.toString('base64'))
      await modes.getByRole('tab',{name:'Graph',exact:true}).click()
      assert.equal(await sun.isDisabled(),true);assert.equal(await sun.isChecked(),false)
      await modes.getByRole('tab',{name:'Map',exact:true}).click()
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.recordedLighting?.lightingEnabled)
      assert.deepEqual((await renderState()).recordedLighting,litClock,'remount restores source and frozen clock')
      for(const presetName of ['performance','maximum','balanced']){
        await preset.selectOption(presetName)
        assert.equal((await renderState()).recordedLighting.lightingEnabled,false)
        assert.equal((await renderState()).recordedLighting.sourceText,clockBefore.sourceText)
      }
      console.log('MIP_RECORDED_SUN_MEMORY_PASS='+JSON.stringify({engine,width,master:true,category:true,remount:true,presetsNeutral:true}))

      assert.equal(page.url(),route,'all controls preserve canonical/time route')
      await panel.scrollIntoViewIfNeeded()
      const bounds=await panel.boundingBox()
      assert.ok(bounds.width>0 && bounds.x>=0 && bounds.x+bounds.width<=width+1,'panel fits viewport')
      assert.equal(await panel.evaluate(node=>node.scrollWidth>node.clientWidth+1),false)
      await master.focus()
      await master.press('Space')
      assert.equal(await master.isChecked(),false,'keyboard master works')
      await master.press('Space')
      const afterTerrain=await page.evaluate(()=>window.__MIP_WORLD_VIEW_TERRAIN_PROBE__.getTerrainStatus())
      for(const category of ['lighting','terrain','atmosphere','imageQuality','depthMaterials']){
        const section=panel.locator('.wv-fidelity-category:has(#wv-fidelity-'+category+')')
        await section.scrollIntoViewIfNeeded()
        const last=section.locator('p').last()
        await last.scrollIntoViewIfNeeded()
        assert.ok(await last.isVisible(),'last effect description remains reachable')
        console.log('MIP_FIDELITY_CATEGORY_'+engine+'_'+width+'_'+category+'='+(await section.screenshot({type:'jpeg',quality:65})).toString('base64'))
      }
      console.log('MIP_FIDELITY_NEUTRAL_'+engine+'_'+width+'='+neutral.toString('base64'))
      console.log('MIP_FIDELITY_PASS='+JSON.stringify({engine,width,supported,elapsedMs:Date.now()-started,beforeTerrain,afterTerrain,backend:verifyBackend(),errors}))
      assert.deepEqual(errors,[])
      await page.close()
    }
    const fallback=await browser.newPage({viewport:{width:390,height:844}})
    await fallback.addInitScript(()=>{
      const getContext=HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext=function(kind,...args){
        return /webgl/i.test(kind) ? null : getContext.call(this,kind,...args)
      }
    })
    await fallback.goto(url)
    await fallback.waitForFunction(()=>document.querySelector('[data-map-stack]')?.dataset.mapStack==='atlas-fallback')
    const fallbackPanel=fallback.getByRole('region',{name:'Visual Fidelity',exact:true})
    await fallbackPanel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
    const fallbackRelief=fallbackPanel.getByRole('checkbox',{name:'Terrain relief shading',exact:true})
    assert.equal(await fallbackRelief.isChecked(),false)
    assert.equal(await fallbackRelief.isDisabled(),true)
    await fallbackPanel.getByRole('button',{name:'Show Image Quality settings',exact:true}).click()
    await fallbackPanel.getByRole('button',{name:'Show Atmosphere settings',exact:true}).click()
    for(const name of ['Ground atmosphere','Distance haze / fog']){
      const control=fallbackPanel.getByRole('checkbox',{name,exact:true})
      assert.equal(await control.isChecked(),false);assert.equal(await control.isDisabled(),true)
    }
    await fallbackPanel.getByRole('button',{name:'Show Lighting settings',exact:true}).click()
    const fallbackSun=fallbackPanel.getByRole('checkbox',{name:'Sun lighting',exact:true})
    assert.equal(await fallbackSun.isDisabled(),true);assert.equal(await fallbackSun.isChecked(),false)
    const fallbackFxaa=fallbackPanel.getByRole('checkbox',{name:'FXAA',exact:true})
    assert.equal(await fallbackFxaa.isDisabled(),true)
    assert.equal(await fallbackFxaa.isChecked(),false)
    const fallbackResolution=fallbackPanel.getByRole('combobox',{name:'Render resolution',exact:true})
    assert.equal(await fallbackResolution.isDisabled(),true)
    assert.equal(await fallbackResolution.inputValue(),'1')
    assert.equal(await fallback.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getProfile().categories.terrain.reliefShading),true)
    console.log('MIP_FIDELITY_FORCED_FALLBACK='+JSON.stringify({engine,webglUnavailable:true,overviewFallback:true,preferenceRetained:true,unavailable:true}))
    await fallback.close()
    await browser.close();browser=null
  }
} finally {await browser?.close();server?.kill('SIGTERM')}
