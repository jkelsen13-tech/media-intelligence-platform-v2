// Anonymous browser acceptance in ephemeral Actions storage, using real eligible
// Cleveland geography. Fault injection is confined to the disposable browser.
import assert from 'node:assert/strict'
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
      assert.equal(await deferred.count(),11)
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
    const fallbackFxaa=fallbackPanel.getByRole('checkbox',{name:'FXAA',exact:true})
    assert.equal(await fallbackFxaa.isDisabled(),true)
    assert.equal(await fallbackFxaa.isChecked(),false)
    assert.equal(await fallback.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getProfile().categories.terrain.reliefShading),true)
    console.log('MIP_FIDELITY_FORCED_FALLBACK='+JSON.stringify({engine,webglUnavailable:true,overviewFallback:true,preferenceRetained:true,unavailable:true}))
    await fallback.close()
    await browser.close();browser=null
  }
} finally {await browser?.close();server?.kill('SIGTERM')}
