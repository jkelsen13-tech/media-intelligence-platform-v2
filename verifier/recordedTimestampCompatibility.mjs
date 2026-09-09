import assert from 'node:assert/strict'
import { observeBackendBoundary } from './backendBoundary.mjs'

// Existing public event only; these are link representations, not backend fixtures.
export async function verifyRecordedTimestampCompatibility(browser, origin, engine) {
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const verifyBackend=observeBackendBoundary(page)
  let phase='initial navigation'
  const errors=[]
  const errorStacks=[]
  page.on('pageerror',error=>{
    errors.push(error.message)
    errorStacks.push(error.stack ?? '')
    console.log('MIP_TIMESTAMP_PAGE_ERROR='+JSON.stringify({engine,phase,url:page.url(),message:error.message,stack:error.stack}))
  })
  page.on('requestfailed',request=>console.log('MIP_TIMESTAMP_REQUEST_FAILED='+JSON.stringify({engine,url:request.url(),error:request.failure()?.errorText})))
  page.on('worker',worker=>console.log('MIP_TIMESTAMP_WORKER='+JSON.stringify({engine,phase,url:worker.url()})))
  page.on('response',response=>{
    if(response.request().resourceType()==='script')
      console.log('MIP_TIMESTAMP_SCRIPT='+JSON.stringify({engine,phase,url:response.url(),status:response.status()}))
  })
  page.on('console',message=>{
    if(message.type()==='error') console.log('MIP_TIMESTAMP_CONSOLE='+JSON.stringify({engine,phase,text:message.text(),location:message.location()}))
  })
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker
    window.Worker=class extends NativeWorker {
      constructor(url,options){
        super(url,options)
        this.addEventListener('error',event=>console.error('MIP_WORKER_IMPORT_ERROR',JSON.stringify({url:String(url),message:event.message,filename:event.filename,line:event.lineno})))
      }
    }
    window.addEventListener('unhandledrejection',event=>{
      console.error('MIP_IMPORT_REJECTION',JSON.stringify({message:event.reason?.message,stack:event.reason?.stack}))
    })
    window.addEventListener('vite:preloadError',event=>{
      console.error('MIP_PRELOAD_ERROR',JSON.stringify({message:event.payload?.message,stack:event.payload?.stack}))
    })
  })
  const subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
  const base=origin+'/media-intelligence-platform-v2/#/event/'+subject+'/world'
  const from='2024-04-08 17:59:00+00', to='2024-04-08 20:29:00+00'
  const scope=from+'..'+to
  // A retained timestamp inspection is qualified after its renderer is ready.
  // Keep page-error assertions intact while tracing the failing navigation phase.
  const mapReady=()=>page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:60000})
  const clockReady=async expected=>{
    await page.waitForFunction(value=>{
      const c=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.recordedLighting
      return c?.sourceText===value && c.applied && c.frozen && c.available
    },expected,{timeout:60000})
  }
  try {
    for(const selected of [from,'2024-04-08 23:29:00+0530']) {
      phase='select '+selected
      await page.goto(base+'?time='+encodeURIComponent(scope)+'&at='+encodeURIComponent(selected))
      // Hash navigation may return before React applies the new route.
      await page.waitForFunction(expected =>
        document.querySelector('.wv-view')?.getAttribute('data-as-of-time') === expected,
        selected)
      const inspector=page.getByRole('complementary',{name:'Selected-event inspector'})
      await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
      const slider=page.getByRole('slider',{name:'Recorded time',exact:true})
      assert.equal(await slider.inputValue(),'0')
      assert.equal(await page.locator('.wv-view').getAttribute('data-as-of-time'),selected)
      await mapReady()
      await clockReady(selected)
      const tabs=page.getByRole('tablist',{name:'Evidence views',exact:true})
      phase='open Timeline '+selected
      await tabs.getByRole('tab',{name:'Timeline',exact:true}).click()
      await page.waitForLoadState('networkidle',{timeout:30000})
      phase='return World View '+selected
      await tabs.getByRole('tab',{name:'World View',exact:true}).click()
      await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor()
      await mapReady()
      await clockReady(selected)
      phase='reload '+selected
      await page.reload()
      await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor()
      await mapReady()
      await clockReady(selected)
      assert.equal(await slider.inputValue(),'0')
      assert.equal(await page.locator('.wv-view').getAttribute('data-as-of-time'),selected)
      assert.equal(await page.locator('.wv-view').getAttribute('data-selected-time-range'),scope)
      assert.equal(await page.locator('.wv-view').getAttribute('data-canonical-subject-id'),subject)
      assert.equal(await page.getByRole('button',{name:'Return to selected location',exact:true}).isEnabled(),true)
      if (selected===from) console.log('MIP_SQL_TIME_SCREENSHOT_'+engine+'='+(await page.locator('.wv-scrubber').screenshot({type:'jpeg',quality:65})).toString('base64'))
    }
    phase='precise time then date scope'
    const precise='2024-04-08 18:00:00.123456+00'
    await page.goto(base+'?at='+encodeURIComponent(precise))
    await clockReady(precise)
    const panel=page.getByRole('region',{name:'Visual Fidelity',exact:true})
    await panel.getByRole('button',{name:'Visual Fidelity settings',exact:true}).click()
    await panel.getByRole('button',{name:'Show Lighting settings',exact:true}).click()
    const sun=panel.getByRole('checkbox',{name:'Sun lighting',exact:true})
    await panel.getByRole('checkbox',{name:'Lighting effects',exact:true}).check()
    await sun.check()
    await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.recordedLighting?.lightingEnabled)
    await page.goto(base+'?time=2024-04-08')
    await page.waitForFunction(()=>{
      const c=window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.recordedLighting
      return c?.sourceText===null && !c.available && !c.lightingEnabled
    })
    assert.equal(await sun.isDisabled(),true);assert.equal(await sun.isChecked(),false)
    assert.equal(await page.locator('.wv-view').getAttribute('data-as-of-time'),'2024-04-08')
    await page.goto(base+'?at='+encodeURIComponent(precise))
    await clockReady(precise)
    assert.equal(await sun.isChecked(),true,'exact time restores remembered sunlight after date-only scope')
    console.log('MIP_RECORDED_LIGHTING_TIME_PASS='+JSON.stringify({engine,precise,sourcePrecisionRetained:true,
      dateOnlyUnavailable:true,exactTimeRecovery:true,state:await page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().recordedLighting)}))
    phase='invalid local time'
    await page.goto(base+'?time='+encodeURIComponent('2024-04-08 17:59:00'))
    await page.getByRole('combobox',{name:'Choose a recorded time',exact:true}).waitFor()
    await page.getByText('No spatial state recorded at this time.',{exact:true}).first().waitFor()
    assert.equal(await page.getByRole('button',{name:'Return to selected location',exact:true}).isDisabled(),true)
    await mapReady()
    const invalidClock=await page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__.getRenderState().recordedLighting)
    assert.equal(invalidClock.available,false);assert.equal(invalidClock.sourceText,null)
    assert.equal(invalidClock.lightingEnabled,false)
    // Preserve assertions. Map intermittent bundled errors to actual public
    // build code so future failures can be diagnosed without guessing symbols.
    const locations=new Set(errorStacks.flatMap(stack=>stack.match(/https?:\/\/[^\s)]+\.js:\d+:\d+/g)??[]))
    for(const location of locations){
      const match=location.match(/^(.*\.js):(\d+):(\d+)$/)
      if(!match || !match[1].startsWith(origin+'/media-intelligence-platform-v2/assets/'))continue
      const source=await (await fetch(match[1])).text()
      const line=source.split('\n')[Number(match[2])-1]??''
      const column=Number(match[3])-1
      console.log('MIP_TIMESTAMP_ERROR_SOURCE='+JSON.stringify({location,code:line.slice(Math.max(0,column-250),column+450)}))
    }
    assert.deepEqual(errors,[])
    console.log('MIP_RECORDED_TIMESTAMP_COMPATIBILITY_PASS='+JSON.stringify({engine,sqlOffset:true,offsetEquivalent:true,
     viewRoundTrip:true,reload:true,sourceTextPreserved:true,scopePreserved:true,localTimeRejected:true,backend:verifyBackend()}))
  } catch(error) {
    console.log('MIP_TIMESTAMP_FAILURE_STATE='+JSON.stringify({engine,url:page.url(),state:await page.locator('.wv-view').evaluate(el=>({attributes:[...el.attributes].map(a=>[a.name,a.value]),text:el.innerText})).catch(()=>null),errors}))
    console.log('MIP_TIMESTAMP_FAILURE_IMAGE_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  } finally {await page.close()}
}
