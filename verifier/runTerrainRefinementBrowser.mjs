// Real approved terrain; no source fixtures or evidence writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { tileApproval } from '../src/lib/worldViewCesiumTerrariumTerrainProvider.js'
import { sameCameraPose } from './cameraPoseComparison.mjs'
import { observeBackendBoundary } from './backendBoundary.mjs'
const require = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')
const { chromium, webkit } = require('playwright')
const live = process.env.MIP_LIVE_SITE === '1'
const origin = live ? 'https://jkelsen13-tech.github.io' : 'http://127.0.0.1:4173'
const root = origin + '/media-intelligence-platform-v2/'
const url = root + '#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world'
const server = live ? null : spawn('npm', ['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'], {stdio:'ignore'})
let browser
try {
  let ready = false
  for (let i=0;i<40;i++) { try { ready=(await fetch(root)).ok } catch {} if(ready)break; await delay(250) }
  assert.ok(ready)
  for (const engine of ['chromium','webkit']) {
    browser = await ({chromium,webkit}[engine]).launch({headless:true})
    for (const width of [1280,390]) {
      const page = await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
      const verifyBackend = observeBackendBoundary(page)
      const errors=[], requests=[], responses=[], failures=[]
      let phase='initial'
      page.on('pageerror', e=>errors.push(e.message))
      page.on('request', r=>{
        if (/terrarium|tile.openstreetmap.org/.test(r.url())) requests.push({phase,url:r.url()})
      })
      page.on('response', r=>{
        if (/terrarium/.test(r.url())) responses.push({phase,url:r.url(),status:r.status()})
      })
      page.on('requestfailed', r=>{
        if (/terrarium/.test(r.url())) failures.push({phase,url:r.url(),error:r.failure()?.errorText})
      })
      try {
        await page.goto(url)
        await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
        const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
        await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
        const control=panel.getByRole('combobox',{name:'Terrain refinement',exact:true})
        await page.waitForFunction(()=>document.querySelector('[data-fidelity-effect="refinement"]')?.dataset.effectStatus==='supported')
        const state=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
        const profile=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getProfile())
        const camera=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
        const settle=async()=>{
          await delay(250)
          await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:45000})
          await page.waitForLoadState('networkidle',{timeout:30000})
          await delay(250)
        }
        await delay(1800);await settle()
        await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
        const before=await state(), route=page.url(), originalCamera=await camera()
        const canvas=await page.locator('.wv-map-host canvas').first().elementHandle()
        assert.equal(before.refinement.screenSpaceError,2)
        assert.equal(await control.inputValue(),'neutral')
        const images={}, measurements=[]
        for (const [mode,value] of [['coarse',4],['fine',1],['neutral',2]]) {
          phase=mode
          const start=Date.now(), requestStart=requests.length
          await control.selectOption(mode)
          await page.waitForFunction(expected=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.refinement?.screenSpaceError===expected,value)
          await settle()
          const actual=await state()
          assert.ok(sameCameraPose(actual.cameraPose,before.cameraPose),'detail choice must not move the camera')
          assert.equal(await camera(),originalCamera)
          assert.equal(page.url(),route)
          assert.equal(actual.requestRenderMode,true)
          assert.deepEqual(actual.recordedLighting,before.recordedLighting)
          assert.ok(await canvas.evaluate(node=>node.isConnected),'same viewer/canvas')
          images[mode]=await page.locator('.wv-map-host').screenshot({type:'png'})
          measurements.push({mode,screenSpaceError:actual.refinement.screenSpaceError,
            elapsedMs:Date.now()-start,requests:requests.slice(requestStart),
            terrain:await page.evaluate(()=>window.__MIP_WORLD_VIEW_TERRAIN_PROBE__.getTerrainStatus())})
          console.log('MIP_REFINEMENT_IMAGE_'+engine+'_'+width+'_'+mode+'='+images[mode].toString('base64'))
        }
        assert.equal(images.coarse.equals(images.fine),false,'qualified camera must show an actual level-of-detail difference')
        phase='memory'
        const master=panel.getByRole('checkbox',{name:'Photoreal',exact:true})
        const terrain=panel.getByRole('checkbox',{name:'Terrain effects',exact:true})
        await control.selectOption('fine');await settle()
        for(const gate of [master,terrain]) {
          await gate.uncheck()
          assert.equal(await control.isDisabled(),true)
          assert.equal(await control.inputValue(),'neutral')
          assert.equal((await state()).refinement.screenSpaceError,2)
          assert.equal((await profile()).categories.terrain.refinement,'fine')
          await gate.check()
          assert.equal(await control.inputValue(),'fine')
          assert.equal((await state()).refinement.screenSpaceError,1)
        }
        phase='remount'
        const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
        await modes.getByRole('tab',{name:'Graph',exact:true}).click()
        assert.equal(await control.isDisabled(),true)
        assert.equal(await control.inputValue(),'neutral')
        await modes.getByRole('tab',{name:'Map',exact:true}).click()
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.refinement?.screenSpaceError===1)
        await delay(1800) // complete the existing subject flight before checking the remounted camera
        await settle()
        assert.equal(await control.inputValue(),'fine')
        assert.equal((await profile()).categories.terrain.refinement,'fine')
        assert.equal(await camera(),originalCamera)
        assert.equal(page.url(),route)
        assert.equal((await page.evaluate(()=>window.__MIP_WORLD_VIEW_TERRAIN_PROBE__.getTerrainStatus())).status,'active')
        console.log('MIP_REFINEMENT_REMOUNT_'+engine+'_'+width+'='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:70})).toString('base64'))
        phase='presets'
        for (const preset of ['performance','balanced','maximum']) {
          await panel.getByRole('combobox',{name:'Visual Fidelity preset',exact:true}).selectOption(preset)
          assert.equal(await control.inputValue(),'neutral')
          assert.equal((await state()).refinement.screenSpaceError,2)
        }
        await settle()
        for (const request of requests.filter(r=>r.url.includes('terrarium'))) {
          const u=new URL(request.url)
          const match=u.pathname.match(/^\/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/)
          assert.equal(u.hostname,'s3.amazonaws.com')
          assert.ok(match,'known terrain URL shape')
          assert.equal(tileApproval(Number(match[2]),Number(match[3]),Number(match[1])).approved,true,'every network tile stays inside the existing approved boundary/zoom band')
        }
        const box=await control.boundingBox()
        assert.ok(box.width>0&&box.x>=0&&box.x+box.width<=width+1)
        assert.equal(await panel.evaluate(node=>node.scrollWidth>node.clientWidth+1),false)
        const section=panel.locator('.wv-fidelity-category:has(#wv-fidelity-terrain)')
        await section.scrollIntoViewIfNeeded()
        console.log('MIP_REFINEMENT_CONTROL_'+engine+'_'+width+'='+(await section.screenshot({type:'jpeg',quality:70})).toString('base64'))
        assert.deepEqual(errors,[])
        console.log('MIP_REFINEMENT_PASS='+JSON.stringify({engine,width,live,measurements,responses,failures,
          sameCamera:true,sameCanvas:true,remembered:true,remount:true,presetsNeutral:true,
          sourceBoundaryRetained:true,pixelsDiffer:true,backend:verifyBackend()}))
      } catch(error) {
        console.log('MIP_REFINEMENT_FAILURE='+JSON.stringify({engine,width,phase,error:error.message,errors,requests,responses,failures}))
        console.log('MIP_REFINEMENT_FAILURE_IMAGE_'+engine+'_'+width+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
        throw error
      } finally {await page.close()}
    }
    await browser.close();browser=null
  }
} finally {await browser?.close();server?.kill('SIGTERM')}
