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

function assertDeliveredSettingsInput(before,after,touch){
  if(touch){
    assert.ok(after.trustedStart>before.trustedStart&&after.trustedEnd>before.trustedEnd,
      'phone expander receives actual trusted touchstart/touchend')
  }else assert.ok(after.trustedClick>before.trustedClick,'desktop expander receives an actual trusted click')
}
async function openSettingsExpander(page,panel,name,touch){
  const opener=panel.getByRole('button',{name,exact:true}),id=await opener.getAttribute('aria-controls')
  assert.match(id,/^wv-fidelity-[a-z-]+$/,'expander controls the source-defined settings panel')
  const stable=panel.locator('button[aria-controls="'+id+'"]'),controlled=panel.locator('[id="'+id+'"]')
  assert.equal(await stable.getAttribute('aria-expanded'),'false','settings begin collapsed')
  assert.equal(await controlled.isVisible(),false,'controlled settings begin hidden')
  const sample=()=>page.evaluate(key=>({
    start:0,end:0,trustedStart:0,trustedEnd:0,click:0,trustedClick:0,
    ...window.__MIP_DYNAMIC_VERIFIER_SETTINGS_INPUT__[key],
  }),id)
  const before=await sample()
  if(touch)await opener.tap()
  else await opener.click()
  // One real input only. A returned click/tap is not proof React expanded it.
  // Require the existing aria and hidden-panel contract before the next action.
  await panel.locator('button[aria-controls="'+id+'"][aria-expanded="true"]').waitFor({state:'visible',timeout:5000})
  await controlled.waitFor({state:'visible',timeout:5000})
  const after=await sample()
  assertDeliveredSettingsInput(before,after,touch)
  const input=Object.fromEntries(Object.keys(before).map(key=>[key,after[key]-before[key]]))
  return{name,controlledId:id,inputMethod:touch?'touchscreen-tap':'mouse-click',input,ariaExpanded:true,controlledPanelVisible:true}
}

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
      // Observe actual driver input in this disposable page; never dispatch
      // events, modify application handling, or retain source/backend payloads.
      await page.addInitScript(()=>{
        const inputs={}
        window.__MIP_DYNAMIC_VERIFIER_SETTINGS_INPUT__=inputs
        for(const [eventName,key] of [['touchstart','start'],['touchend','end'],['click','click']])
          window.addEventListener(eventName,event=>{
            const button=event.target?.closest?.('button[aria-controls]'),id=button?.getAttribute('aria-controls')
            if(!id?.startsWith('wv-fidelity-'))return
            const counts=inputs[id]??={start:0,end:0,trustedStart:0,trustedEnd:0,click:0,trustedClick:0}
            counts[key]++
            if(event.isTrusted)counts['trusted'+key[0].toUpperCase()+key.slice(1)]++
          },{capture:true,passive:true})
      })
      try{
        await page.goto(url)
        await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
        await page.waitForFunction(()=>{
          const globe=document.querySelector('[data-map-stack]'),canvas=document.querySelector('.wv-map-host canvas')
          const camera=window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState()
          const render=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()
          return globe?.dataset.mapStack==='ellipsoid-globe'&&camera&&render?.cameraPose?.length===4
            &&render.renderedFrames>0&&canvas?.clientWidth>0&&canvas?.clientHeight>0
        },{},{timeout:45000})
        await page.evaluate(()=>document.fonts.ready)
        const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true}),openers=[]
        openers.push(await openSettingsExpander(page,panel,'Visual Fidelity settings',width===390))
        for(const category of ['Lighting','Atmosphere'])
          openers.push(await openSettingsExpander(page,panel,'Show '+category+' settings',width===390))
        console.log('MIP_DYNAMIC_SETTINGS_READY='+JSON.stringify({engine,width,live,actualGlobe:true,fontsReady:true,openers}))
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

        // Checkbox actions scroll the phone viewport away from the globe.
        // Restore the viewport before waiting for the request-render scene to settle.
        // A different PNG is insufficient: a blank globe also differs from the baseline.
        async function captureVisibleGlobe(label){
          await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
          await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().globeTilesLoaded,{},{timeout:30000})
          await delay(500)
          const png=await page.locator('.wv-map-host').screenshot({type:'png'})
          const coverage=await page.evaluate(async data=>{
            const img=new Image();img.src=data;await img.decode()
            const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height
            const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
            const x=Math.floor(img.width*0.40),y=Math.floor(img.height*0.30)
            const w=Math.floor(img.width*0.20),h=Math.floor(img.height*0.40)
            const pixels=ctx.getImageData(x,y,w,h).data
            let visible=0
            for(let i=0;i<pixels.length;i+=4){
              const max=Math.max(pixels[i],pixels[i+1],pixels[i+2]),min=Math.min(pixels[i],pixels[i+1],pixels[i+2])
              if(max>50&&max-min>10)visible++
            }
            return visible/(w*h)
          },'data:image/png;base64,'+png.toString('base64'))
          console.log('MIP_DYNAMIC_GLOBE_COVERAGE='+JSON.stringify({engine,width,live,label,coverage}))
          assert.ok(coverage>0.10,label+' must contain the visible globe, not only stars or UI')
          return png
        }
        const start=Date.now()
        const off=await captureVisibleGlobe('off')
        await dynamic.check();await delay(500)
        const on=await captureVisibleGlobe('on'),after=await state()
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
        const panelResponse=await page.getByRole('region',{name:'Visual Fidelity',exact:true}).evaluate(node=>({
          settingsInputs:window.__MIP_DYNAMIC_VERIFIER_SETTINGS_INPUT__??null,
          expanders:[...node.querySelectorAll('button[aria-controls]')].map(n=>({
            id:n.getAttribute('aria-controls'),expanded:n.getAttribute('aria-expanded'),
            controlledVisible:(()=>{const target=document.getElementById(n.getAttribute('aria-controls'));return Boolean(target&&!target.hidden&&target.getClientRects().length>0)})(),
          })),
        })).catch(()=>null)
        console.log('MIP_DYNAMIC_FAILURE='+JSON.stringify({engine,width,error:e.message,errors,panelResponse}))
        console.log('MIP_DYNAMIC_FAILURE_IMAGE_'+engine+'_'+width+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
        throw e
      }finally{await page.close()}
    }
    await browser.close();browser=null
  }
}finally{await browser?.close();server?.kill('SIGTERM')}
