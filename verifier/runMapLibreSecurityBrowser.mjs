// Remote-run browser qualification. Faults and synthetic attribution exist only
// in disposable browser routes; no backend state or published source is changed.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { observeBackendBoundary } from './backendBoundary.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {chromium,webkit}=require('playwright')
const live=process.env.MIP_LIVE_SITE==='1'
const origin=live?'https://jkelsen13-tech.github.io':'http://127.0.0.1:4173'
const base=origin+'/media-intelligence-platform-v2/'
const url=base+'#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world'
const server=live?null:spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const payload='<details open onload="void 0" ontoggle="window.__MIP_ATTR_EXECUTED__=(window.__MIP_ATTR_EXECUTED__||0)+1">Synthetic attribution security fixture</details>'
const credit='<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'
let browser
try {
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(base)).ok}catch{}if(ready)break;await delay(250)}
  assert.ok(ready)
  for(const engine of ['chromium','webkit']){
    browser=await ({chromium,webkit}[engine]).launch({headless:true})
    // Positive control: the harmless marker executes in this browser without
    // sanitization, so zero executions below cannot pass on disabled scripting.
    const control=await browser.newPage()
    await control.setContent(payload)
    await control.waitForFunction(()=>window.__MIP_ATTR_EXECUTED__>0)
    await control.close()
    for(const width of [1280,390]){
      for(const injected of [false,true]){
        const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
        const verifyBackend=observeBackendBoundary(page)
        const errors=[], workers=[]
        let styleResponses=0
        page.on('pageerror',e=>errors.push(e.message))
        page.on('worker',w=>workers.push(w.url()))
        page.on('response',r=>{if(r.url().includes('tiles.openfreemap.org/styles/positron')&&r.ok())styleResponses++})
        // Reject contexts only on Cesium-owned canvases. Aborting its shared
        // chunk can also abort the route module and would not test fallback.
        await page.addInitScript(()=>{
          const original=HTMLCanvasElement.prototype.getContext
          HTMLCanvasElement.prototype.getContext=function(kind,...args){
            if(/webgl/i.test(kind)&&this.closest('.cesium-widget'))return null
            return original.call(this,kind,...args)
          }
        })
        if(injected)await page.route('https://tiles.openfreemap.org/styles/positron',r=>r.fulfill({
          json:{version:8,sources:{fixture:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:credit+payload}},
            layers:[{id:'fixture',type:'raster',source:'fixture'}]}
        }))
        try {
        await page.goto(url)
        await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
        await page.waitForFunction(()=>document.querySelector('[data-map-stack]')?.dataset.mapStack==='openfreemap-positron'
          && window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
        await page.locator('.maplibregl-ctrl-attrib').waitFor()
        await page.waitForFunction(()=>document.querySelector('.maplibregl-ctrl-attrib')?.textContent.includes('OpenStreetMap'))
        await delay(2000)
        const route=page.url()
        const camera=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
        const before=await camera()
        const canvas=await page.locator('.maplibregl-canvas').elementHandle()
        assert.ok(canvas)
        if(injected){
          assert.ok((await page.locator('.maplibregl-ctrl-attrib').textContent()).includes('Synthetic attribution security fixture'))
          const attributes=await page.locator('.maplibregl-ctrl-attrib').evaluate(el=>[...el.querySelectorAll('*')].flatMap(n=>[...n.attributes].map(a=>a.name)))
          assert.equal(attributes.some(a=>a.toLowerCase().startsWith('on')),false)
          assert.equal(await page.evaluate(()=>window.__MIP_ATTR_EXECUTED__||0),0)
          assert.equal(await page.locator('.maplibregl-ctrl-attrib a').filter({hasText:'OpenStreetMap contributors'}).first().getAttribute('href'),'https://www.openstreetmap.org/copyright')
        }else{
          assert.ok(styleResponses>0,'real upstream style loaded')
          assert.ok(workers.some(w=>w.startsWith(base)&&w.includes('maplibre-gl-worker')),'bundled same-origin MapLibre worker started')
        }
        await page.getByRole('button',{name:'Zoom in',exact:true}).click()
        await delay(500)
        assert.notEqual(await camera(),before,'MapLibre navigation responds')
        const restored=await page.evaluate(state=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(state),before)
        assert.equal(restored,true)
        assert.equal(await camera(),before,'renderer-neutral restore retains exact camera')
        assert.equal(page.url(),route)
        assert.equal(await canvas.evaluate(n=>n.isConnected),true)
        const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
        await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
        const relief=panel.getByRole('checkbox',{name:'Terrain relief shading',exact:true})
        assert.equal(await relief.isDisabled(),true)
        assert.equal(await relief.isChecked(),false)
        assert.deepEqual(errors,[])
        console.log('MIP_MAPLIBRE_PASS='+JSON.stringify({engine,width,injected,positiveControl:true,errors,workers,backend:verifyBackend(),attributionPreserved:true,cameraRestored:true}))
        console.log('MIP_MAPLIBRE_IMAGE_'+engine+'_'+width+'_'+injected+'='+(await page.locator('.wv-map-host').screenshot({type:'jpeg',quality:65})).toString('base64'))
        } catch(error) {
          console.log('MIP_MAPLIBRE_FAILURE='+JSON.stringify({engine,width,injected,url:page.url(),errors,workers,text:await page.locator('body').innerText()}))
          console.log('MIP_MAPLIBRE_FAILURE_IMAGE='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
          throw error
        } finally {await page.close()}
      }
    }
    await browser.close();browser=null
  }
}finally{await browser?.close();server?.kill('SIGTERM')}
