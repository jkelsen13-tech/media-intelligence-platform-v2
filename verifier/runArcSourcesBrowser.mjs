// Production UI and live public reads. A synthetic arc and failed response exist only in this browser; never seed the database.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
const {chromium,webkit}=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')('playwright')
const live=process.env.MIP_LIVE_SITE==='1'
const origin=live?'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/':'http://127.0.0.1:4173/media-intelligence-platform-v2/'
const server=live?null:spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
try {
  for(let i=0;i<40;i++){try{if((await fetch(origin)).ok)break}catch{}await delay(250)}
  for(const [engine,launcher] of Object.entries({chromium,webkit})) {
    const browser=await launcher.launch({headless:true})
    try {
      const page=await browser.newPage({viewport:{width:1280,height:1000}})
      const errors=[];page.on('pageerror',e=>errors.push(e.message))
      let deny=true, inventory=null, arcId=null, calls=0
      // The live public arc inventory is currently empty. Verify that baseline,
      // then exercise the dormant source UI with an explicitly synthetic arc.
      const arcResponses=[]
      page.on('response',async response=>{
        if(new URL(response.url()).pathname.endsWith('/rest/v1/story_arcs') && response.ok())
          arcResponses.push(await response.json())
      })
      await page.goto(origin+'#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/arcs')
      for(let i=0;i<100 && !arcResponses.length;i++)await delay(100)
      assert.ok(arcResponses.length,'live public arc read completed')
      assert.deepEqual(arcResponses[0],[],'current public arc inventory is empty')
      assert.equal(await page.locator('.ap-source').count(),0)
      await page.route('**/rest/v1/story_arcs?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
        id:'00000000-0000-4000-8000-000000000001',slug:'verification-only-arc',category:'unclassified',summary:'Synthetic browser verification only',started_at:'2024-04-08'
      }])}))
      await page.route('**/rest/v1/articles?**',async route=>{
        const url=new URL(route.request().url())
        if(!url.searchParams.has('arc_id'))return route.continue()
        calls++;arcId=url.searchParams.get('arc_id')
        if(deny)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Browser verification injected unavailable read'})})
        const response=await route.fetch();assert.equal(response.ok(),true)
        inventory=await response.json()
        return route.fulfill({response})
      })
      await page.reload()
      await page.locator('.arcs-view').waitFor({timeout:60000})
      await page.locator('.arc-panel').getByRole('tab',{name:'Evidence',exact:true}).click()
      const panel=page.getByRole('tabpanel')
      await panel.getByText('Attached source records are unavailable. This does not mean the arc has no sources.',{exact:true}).waitFor()
      assert.equal(await panel.locator('.ap-source').count(),0)
      assert.equal(await panel.getByText(/No attached publisher/).count(),0)
      deny=false
      const retry=panel.getByRole('button',{name:'Retry attached sources',exact:true})
      await retry.focus();await page.keyboard.press('Enter')
      await page.waitForFunction(()=>!document.querySelector('.arc-source-availability'))
      assert.ok(calls>=2);assert.ok(arcId?.startsWith('eq.'));assert.ok(Array.isArray(inventory))
      assert.equal(await panel.locator('.ap-source').count(),inventory.length)
      for(const article of inventory)await panel.getByRole('button',{name:article.title,exact:true}).waitFor()
      const title=await page.locator('.arc-panel .ep-report-title').innerText()
      for(const width of [1280,768,390,320]){
        await page.setViewportSize({width,height:1000})
        assert.equal(await page.locator('.arc-panel .ep-report-title').innerText(),title)
        const sources=panel.getByRole('region',{name:'Attached source records'})
        assert.equal(await sources.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
        console.log('MIP_ARC_SOURCES_'+engine+'_'+width+'='+(await panel.screenshot({type:'jpeg',quality:65})).toString('base64'))
      }
      assert.deepEqual(errors,[])
      console.log('MIP_ARC_SOURCES_PASS='+JSON.stringify({engine,live,injectedFailure:true,keyboardRetry:true,publicReadRecovered:true,syntheticArcOnly:true,liveBaselineEmpty:true,records:inventory.length,arcId,widths:[1280,768,390,320]}))
    } finally {await browser.close()}
  }
} finally {server?.kill()}
