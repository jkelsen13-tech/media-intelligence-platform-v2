// Real public projection, calculated display effect only; no production fixtures or writes.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {sameCameraPose} from './cameraPoseComparison.mjs'
import {observeBackendBoundary} from './backendBoundary.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {chromium,webkit}=require('playwright')
const live=process.env.MIP_LIVE_SITE==='1'
const root=(live?'https://jkelsen13-tech.github.io':'http://127.0.0.1:4173')+'/media-intelligence-platform-v2/'
const url=root+'#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world'
const server=live?null:spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
let browser
try{
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(root)).ok}catch{}if(ready)break;await delay(250)}
  assert.ok(ready)
  for(const engine of ['chromium','webkit']){
    browser=await({chromium,webkit}[engine]).launch({headless:true})
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390})
      const boundary=observeBackendBoundary(page),errors=[]
      page.on('pageerror',e=>errors.push(e.message))
      try{
        await page.goto(url)
        await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
        const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
        await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
        const checkbox=name=>panel.getByRole('checkbox',{name,exact:true})
        const dynamic=checkbox('Dynamic atmosphere lighting'),sun=checkbox('Sun lighting')
        const ground=checkbox('Ground atmosphere'),haze=checkbox('Distance haze / fog')
        const lighting=checkbox('Lighting effects'),atmosphere=checkbox('Atmosphere effects'),master=checkbox('Photoreal')
        const state=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState())
        const profile=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getProfile())
        const camera=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
        await page.waitForFunction(()=>document.querySelector('[data-fidelity-effect="dynamicAtmosphere"]')?.dataset.effectStatus==='supported')
        await delay(1800)
        await lighting.check()
        await dynamic.check()
        assert.equal((await profile()).categories.lighting.dynamicAtmosphere,true)
        assert.equal((await state()).recordedLighting.dynamicAtmosphere,false)
        assert.equal(await sun.isChecked(),false)
        await sun.check()
        assert.equal((await state()).recordedLighting.dynamicAtmosphere,false)
        await atmosphere.check();await ground.check()
        assert.equal((await state()).recordedLighting.dynamicAtmosphere,true)
        await dynamic.uncheck()
        const local=await camera()
        const planet=JSON.stringify({...JSON.parse(local),lon:0,lat:0,headingDegrees:0,heightMeters:25000000,pitchDegrees:-90,rollDegrees:0})
        assert.equal(await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(value),planet),true)
        await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
        await delay(1000)
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().globeTilesLoaded,{},{timeout:30000})
        await page.waitForLoadState('networkidle',{timeout:30000})
        const before=await state(),route=page.url(),pose=await camera()
        const canvas=await page.locator('.wv-map-host canvas').first().elementHandle()
        let requests=0
        const count=r=>{if(/terrarium|tile.openstreetmap.org/.test(r.url()))requests++}
        page.on('request',count)
        const start=Date.now()
        const off=await page.locator('.wv-map-host').screenshot({type:'png'})
        await dynamic.check();await delay(500)
        const after=await state(),on=await page.locator('.wv-map-host').screenshot({type:'png'})
        assert.equal(off.equals(on),false,'dynamic atmosphere must change actual pixels at the qualification pose')
        assert.equal(after.recordedLighting.dynamicAtmosphere,true)
        assert.deepEqual({...after.recordedLighting,dynamicAtmosphere:false},before.recordedLighting)
        assert.deepEqual(after.atmosphere.fogPolicy,before.atmosphere.fogPolicy)
        assert.deepEqual(after.refinement,before.refinement)
        assert.ok(sameCameraPose(before.cameraPose,after.cameraPose))
        assert.equal(await camera(),pose);assert.ok(await canvas.evaluate(n=>n.isConnected))
        assert.equal(after.requestRenderMode,true);assert.equal(page.url(),route)
        const remembered=await profile()
        for(const gate of [master,lighting,atmosphere,sun,ground]){
          await gate.uncheck()
          assert.equal((await state()).recordedLighting.dynamicAtmosphere,false)
          assert.equal((await profile()).categories.lighting.dynamicAtmosphere,true)
          await gate.check()
          assert.equal((await state()).recordedLighting.dynamicAtmosphere,true)
          assert.deepEqual(await profile(),remembered)
        }
        await ground.uncheck();await haze.check()
        assert.equal((await state()).recordedLighting.dynamicAtmosphere,true,'haze can supply the visible atmosphere dependency')
        await haze.uncheck();await ground.check()
        page.off('request',count)
        assert.equal(requests,0,'settled lighting choices do not change terrain/imagery requests')
        console.log('MIP_DYNAMIC_OFF_'+engine+'_'+width+'='+off.toString('base64'))
        console.log('MIP_DYNAMIC_ON_'+engine+'_'+width+'='+on.toString('base64'))
        const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
        await modes.getByRole('tab',{name:'Graph',exact:true}).click()
        assert.equal(await dynamic.isDisabled(),true);assert.equal(await dynamic.isChecked(),false)
        await modes.getByRole('tab',{name:'Map',exact:true}).click()
        await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.recordedLighting?.dynamicAtmosphere===true)
        assert.equal((await state()).recordedLighting.sourceText,before.recordedLighting.sourceText)
        assert.equal((await state()).recordedLighting.frozen,true)
        for(const preset of ['performance','balanced','maximum']){
          await panel.getByRole('combobox',{name:'Visual Fidelity preset',exact:true}).selectOption(preset)
          assert.equal((await state()).recordedLighting.dynamicAtmosphere,false)
          assert.equal((await profile()).categories.lighting.dynamicAtmosphere,false)
        }
        const section=panel.locator('.wv-fidelity-category:has(#wv-fidelity-lighting)')
        await section.scrollIntoViewIfNeeded()
        assert.equal(await panel.evaluate(n=>n.scrollWidth>n.clientWidth+1),false)
        console.log('MIP_DYNAMIC_CONTROL_'+engine+'_'+width+'='+(await section.screenshot({type:'jpeg',quality:70})).toString('base64'))
        assert.deepEqual(errors,[])
        console.log('MIP_DYNAMIC_PASS='+JSON.stringify({engine,width,live,requests,elapsedMs:Date.now()-start,clock:after.recordedLighting,dependencies:true,remembered:true,remount:true,presetsOff:true,pixelsDiffer:true,backend:boundary()}))
      }catch(e){
        console.log('MIP_DYNAMIC_FAILURE='+JSON.stringify({engine,width,error:e.message,errors}))
        throw e
      }finally{await page.close()}
    }
    await browser.close();browser=null
  }
}finally{await browser?.close();server?.kill('SIGTERM')}
