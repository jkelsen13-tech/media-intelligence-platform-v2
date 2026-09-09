import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyRecordedTimestampCompatibility } from './recordedTimestampCompatibility.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {webkit}=require('playwright')
const origin='http://127.0.0.1:4173'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
let browser
try {
  let ready=false
  for(let i=0;i<40;i++){
    try {ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok} catch {}
    if(ready)break
    await delay(250)
  }
  assert.ok(ready)
  browser=await webkit.launch({headless:true})
  for(let repetition=0;repetition<1;repetition++){
    console.log('MIP_ISOLATION_START='+JSON.stringify({application:process.env.MIP_APPLICATION_SHA,repetition}))
    await verifyRecordedTimestampCompatibility(browser,origin,'webkit')
  }
  const page=await browser.newPage({viewport:{width:390,height:844}})
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(origin+'/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world')
  await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
  await page.getByRole('tablist',{name:'World View mode',exact:true}).getByRole('tab',{name:'Map',exact:true}).click()
  await page.getByRole('button',{name:'Return to selected location',exact:true}).click()
  await delay(2200)
  const local=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
  assert.equal(await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(value),JSON.stringify({...JSON.parse(local),heightMeters:12000000,pitchDegrees:-90,rollDegrees:0})),true)
  await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:30000})
  await page.waitForLoadState('networkidle',{timeout:30000})
  for(const wait of [500,2000,4000]){
    await delay(wait)
    console.log('MIP_POLAR_IMAGE_'+wait+'='+(await page.locator('.wv-map-host').screenshot({type:'png'})).toString('base64'))
  }
  console.log('MIP_POLAR_STATE='+JSON.stringify({application:process.env.MIP_APPLICATION_SHA,camera:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),errors}))
  assert.deepEqual(errors,[])
  await page.close()
  console.log('MIP_ISOLATION_PASS='+JSON.stringify({application:process.env.MIP_APPLICATION_SHA,repetitions:1}))
} finally {
  await browser?.close()
  server.kill()
}
