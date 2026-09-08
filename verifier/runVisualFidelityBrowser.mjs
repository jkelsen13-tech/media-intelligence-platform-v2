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
      const neutral=await page.locator('.wv-map').screenshot({type:'jpeg',quality:65})
      await master.check()
      assert.deepEqual(await profile(),beforeProfile,'master restores exact profile')
      assert.equal(await camera(),before,'master never moves camera')
      await delay(300)
      const enhanced=await page.locator('.wv-map').screenshot({type:'jpeg',quality:65})
      page.off('request',countRequest)
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
      assert.equal(await deferred.count(),12)
      for(const control of await deferred.all()){
        assert.equal(await control.isChecked(),false)
        assert.equal(await control.isDisabled(),true)
      }
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
      console.log('MIP_FIDELITY_PANEL_'+engine+'_'+width+'='+(await panel.screenshot({type:'jpeg',quality:65})).toString('base64'))
      console.log('MIP_FIDELITY_NEUTRAL_'+engine+'_'+width+'='+neutral.toString('base64'))
      console.log('MIP_FIDELITY_PASS='+JSON.stringify({engine,width,supported,elapsedMs:Date.now()-started,beforeTerrain,afterTerrain,backend:verifyBackend(),errors}))
      assert.deepEqual(errors,[])
      await page.close()
    }
    await browser.close();browser=null
  }
} finally {await browser?.close();server?.kill('SIGTERM')}
