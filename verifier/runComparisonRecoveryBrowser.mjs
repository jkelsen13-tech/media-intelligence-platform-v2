// Real projection recovery plus browser-only temporal fixtures; never seed production.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {observeBackendBoundary} from './backendBoundary.mjs'
import {comparisonRow} from '../tests/comparisonBackendFixture.mjs'
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
      let deny=true, rows=[], calls=0, fixture=null
      await page.route('**/rest/v1/comparison_public?**',async route=>{
        calls++
        if(fixture)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([fixture])})
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
        const methods=page.locator('.sc-methods')
        const summary=methods.locator('summary')
        assert.equal(await methods.getAttribute('open'),null)
        await summary.focus();await page.keyboard.press('Enter')
        assert.notEqual(await methods.getAttribute('open'),null)
        assert.ok((await methods.innerText()).includes('no composite score'))
        assert.equal(await identity(),subject)
        await page.keyboard.press('Enter')
        assert.equal(await methods.getAttribute('open'),null)
        assert.ok(await page.locator('.sc-scope').isVisible())
        assert.ok(await page.locator('.sc-evidence-notice').isVisible())
        if(width===1280)assert.ok((await page.locator('.sc-banner').boundingBox()).height<200)
        if(width===390)console.log('MIP_COMPARISON_COMPACT_'+engine+'='+(await page.locator('.sc-banner').screenshot({type:'jpeg',quality:65})).toString('base64'))
        await page.waitForLoadState('networkidle')
        if(width===1280)console.log('MIP_COMPARISON_RECOVERED_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
      }
      // Dormant date/claim UI uses a browser-only fixture; never write it to Supabase.
      fixture=comparisonRow()
      fixture.event_key=subject
      fixture.canonical_title='Browser-only timestamp verification'
      fixture.occurred_at_start='2026-08-03'
      fixture.occurred_at_end='2026-08-04'
      fixture.articles[0].published_at='2026-08-05'
      fixture.claims[0].surfaces[0].explanation.reviewed_at='2026-08-06T00:00:00.123456+05:30'
      await page.reload({waitUntil:'networkidle'})
      await page.getByRole('heading',{name:fixture.canonical_title,exact:true}).waitFor()
      for(const width of [1280,390,320]){
        await page.setViewportSize({width,height:1000})
        await page.getByText('Source publication: 2026-08-05 (date only)',{exact:true}).waitFor()
        await page.getByText('Recorded event time: 2026-08-03 (date only) → 2026-08-04 (date only)',{exact:true}).waitFor()
        assert.ok((await page.locator('.sc-view').innerText()).includes('2026-08-06 00:00:00.123456 UTC+05:30'))
        assert.ok((await page.locator('.sc-view').innerText()).includes('order not established from these records'))
        assert.equal(await identity(),subject)
        assert.equal(await page.locator('.sc-view').evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
        const surface=page.locator('.sc-surface').first()
        await surface.scrollIntoViewIfNeeded()
        if(width===390)console.log('MIP_COMPARISON_DATE_FIXTURE_'+engine+'='+(await surface.screenshot({type:'jpeg',quality:65})).toString('base64'))
      }
      fixture.occurred_at_start='2026-08-03T00:00:00.123456+05:30'
      fixture.occurred_at_end=null
      fixture.articles[0].published_at='2026-08-05T09:00:00-04:00'
      fixture.articles[1].published_at='2026-08-05T12:00:00Z'
      fixture.articles[2].published_at='2026-08-05T14:00:00Z'
      await page.reload({waitUntil:'networkidle'})
      await page.getByRole('heading',{name:fixture.canonical_title,exact:true}).waitFor()
      const timing=await page.locator('.sc-view').innerText()
      assert.ok(timing.includes('Recorded event time: 2026-08-03 00:00:00.123456 UTC+05:30'))
      assert.ok(timing.includes('earliest in this ingested sample — Publisher B'))
      assert.ok(timing.includes('Publisher A (about +1h)'))
      assert.ok(timing.includes('Source publication: 2026-08-05 09:00:00 UTC-04:00'))
      assert.ok(!timing.includes('(same hour)'))
      fixture=null
      await page.reload({waitUntil:'networkidle'})
      await page.locator('.sc-view').waitFor()
      assert.equal(await page.getByRole('heading',{name:'Browser-only timestamp verification',exact:true}).count(),0)
      console.log('MIP_COMPARISON_HIERARCHY_PASS='+JSON.stringify({engine,live,keyboardDisclosure:true,scopeVisible:true,evidenceLimitsVisible:true,eventBoundsPrecision:true,widths:[1280,768,390,320]}))
      console.log('MIP_COMPARISON_TEMPORAL_PASS='+JSON.stringify({engine,live,browserFixtureOnly:true,dateOnly:true,offsetOrder:true,reviewMicroseconds:true,realProjectionRestored:true}))
      assert.deepEqual(errors,[])
      console.log('MIP_COMPARISON_RECOVERY_PASS='+JSON.stringify({engine,live,widths:[1280,768,390,320],keyboardRetry:true,subjectPreserved:true,realProjectionRecovery:true,backend:verifyBackend()}))
    } finally {await browser.close()}
  }
} finally {server?.kill()}
