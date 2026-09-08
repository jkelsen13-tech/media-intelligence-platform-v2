// Inject only a failed HTTP response. Recovery reads the real released projection.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {observeBackendBoundary} from './backendBoundary.mjs'
const {chromium,webkit}=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')('playwright')
const live=process.env.MIP_LIVE_SITE==='1'
const origin=live?'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/':'http://127.0.0.1:4173/media-intelligence-platform-v2/'
const subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const server=live?null:spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
try {
  for(let i=0;i<40;i++){try{if((await fetch(origin)).ok)break}catch{}await delay(250)}
  for(const [engine,launcher] of Object.entries({chromium,webkit})) {
    const browser=await launcher.launch({headless:true})
    try {
      const page=await browser.newPage({viewport:{width:1280,height:1000}})
      const verifyBackend=observeBackendBoundary(page), errors=[]
      page.on('pageerror',e=>errors.push(e.message))
      let deny=true, rows=[], calls=0
      await page.route('**/rest/v1/comparison_public?**',async route=>{
        calls++
        if(deny)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Browser-only unavailable read'})})
        const response=await route.fetch();assert.ok(response.ok())
        const data=await response.json();assert.ok(Array.isArray(data));rows.push(...data)
        return route.fulfill({response})
      })
      const identity=()=>page.locator('.ws-canonical[data-investigation-context]').getAttribute('data-canonical-subject-id')
      for(const width of [1280,768,390,320]){
        deny=true;rows=[]
        await page.setViewportSize({width,height:1000})
        if(width===1280)await page.goto(origin+'#/event/'+subject+'/sources',{waitUntil:'networkidle'})
        else await page.reload({waitUntil:'networkidle'})
        const recovery=page.getByRole('region',{name:'Comparison recovery'})
        await recovery.waitFor({timeout:60000})
        assert.equal(await identity(),subject)
        assert.equal(await page.locator('.sc-event,.sc-empty').count(),0)
        assert.equal(await recovery.getByText(/No validated|No released/).count(),0)
        assert.equal(await recovery.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
        if(width===390)console.log('MIP_COMPARISON_UNAVAILABLE_'+engine+'='+(await recovery.screenshot({type:'jpeg',quality:65})).toString('base64'))
        const before=calls;deny=false;rows=[]
        const retry=recovery.getByRole('button',{name:'Retry comparison',exact:true})
        await retry.focus();await page.keyboard.press('Enter')
        await page.locator('.sc-view').waitFor({timeout:60000})
        assert.ok(calls>before);assert.equal(await identity(),subject)
        assert.equal(await recovery.count(),0)
        const expected=rows.filter(row=>row.event_key===subject && new Set((row.articles??[]).map(a=>a.outlet)).size>=2)
        assert.equal(await page.locator('.sc-event').count(),expected.length)
        if(!expected.length)await page.getByRole('heading',{name:'No released comparison is linked to this investigation',exact:true}).waitFor()
        assert.equal(await page.locator('.sc-view').evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
        await page.waitForLoadState('networkidle')
        if(width===1280)console.log('MIP_COMPARISON_RECOVERED_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
      }
      assert.deepEqual(errors,[])
      console.log('MIP_COMPARISON_RECOVERY_PASS='+JSON.stringify({engine,live,widths:[1280,768,390,320],keyboardRetry:true,subjectPreserved:true,realProjectionRecovery:true,backend:verifyBackend()}))
    } finally {await browser.close()}
  }
} finally {server?.kill()}
