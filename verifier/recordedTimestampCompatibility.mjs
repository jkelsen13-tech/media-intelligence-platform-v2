import assert from 'node:assert/strict'
import { observeBackendBoundary } from './backendBoundary.mjs'

// Existing public event only; these are link representations, not backend fixtures.
export async function verifyRecordedTimestampCompatibility(browser, origin, engine) {
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const verifyBackend=observeBackendBoundary(page)
  const errors=[]
  const errorStacks=[]
  page.on('pageerror',error=>{
    errors.push(error.message)
    errorStacks.push(error.stack ?? '')
    console.log('MIP_TIMESTAMP_PAGE_ERROR='+JSON.stringify({engine,url:page.url(),message:error.message,stack:error.stack}))
  })
  page.on('requestfailed',request=>console.log('MIP_TIMESTAMP_REQUEST_FAILED='+JSON.stringify({engine,url:request.url(),error:request.failure()?.errorText})))
  const subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
  const base=origin+'/media-intelligence-platform-v2/#/event/'+subject+'/world'
  const from='2024-04-08 17:59:00+00', to='2024-04-08 20:29:00+00'
  const scope=from+'..'+to
  try {
    for(const selected of [from,'2024-04-08 23:29:00+0530']) {
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
      const tabs=page.getByRole('tablist',{name:'Evidence views',exact:true})
      await tabs.getByRole('tab',{name:'Timeline',exact:true}).click()
      await tabs.getByRole('tab',{name:'World View',exact:true}).click()
      await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor()
      await page.reload()
      await inspector.getByText('coarsened_to_precision_class',{exact:true}).waitFor()
      assert.equal(await slider.inputValue(),'0')
      assert.equal(await page.locator('.wv-view').getAttribute('data-as-of-time'),selected)
      assert.equal(await page.locator('.wv-view').getAttribute('data-selected-time-range'),scope)
      assert.equal(await page.locator('.wv-view').getAttribute('data-canonical-subject-id'),subject)
      assert.equal(await page.getByRole('button',{name:'Return to selected location',exact:true}).isEnabled(),true)
      if (selected===from) console.log('MIP_SQL_TIME_SCREENSHOT_'+engine+'='+(await page.locator('.wv-scrubber').screenshot({type:'jpeg',quality:65})).toString('base64'))
    }
    await page.goto(base+'?time='+encodeURIComponent('2024-04-08 17:59:00'))
    await page.getByRole('combobox',{name:'Choose a recorded time',exact:true}).waitFor()
    await page.getByText('No spatial state recorded at this time.',{exact:true}).first().waitFor()
    assert.equal(await page.getByRole('button',{name:'Return to selected location',exact:true}).isDisabled(),true)
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
  } finally {await page.close()}
}
