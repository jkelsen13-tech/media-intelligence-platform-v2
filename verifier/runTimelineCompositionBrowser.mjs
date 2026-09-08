// Production-build UI checks on an ephemeral CI runner; public reads only.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const { chromium } = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')('playwright')
const origin='http://127.0.0.1:4173/media-intelligence-platform-v2/'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
let browser
try {
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(origin)).ok}catch{};if(ready)break;await delay(250)}
  assert.ok(ready)
  browser=await chromium.launch({headless:true})
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/timeline')
  await page.locator('.timeline-view .ep-tl-card').first().waitFor({timeout:60000})
  if(await page.getByRole('combobox',{name:'Choose story arc',exact:true}).count()===0){
    assert.equal(await page.getByRole('button',{name:'← Back to the arc timeline',exact:true}).count(),0,'no dead arc-return control without arc selection')
  }
  const initialCount=await page.locator('.timeline-view .ep-tl-card').count()
  assert.ok(initialCount>0,'real public timeline records loaded')
  const context=()=>page.locator('.ws-canonical').getAttribute('data-canonical-subject-id')
  const subject=await context()
  const methods=page.locator('.timeline-method-note')
  const summary=methods.locator('summary')
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:width>=768?900:844})
    await delay(600) // Let the existing selected-record smooth scroll finish.
    await page.evaluate(()=>{for(const s of document.querySelectorAll('.ws-shell,.ws-content,.app-main,.timeline-view'))s.scrollTop=0})
    assert.equal(await methods.getAttribute('open'),null)
    assert.equal(await page.getByRole('heading',{name:'All events — global corpus',exact:true}).isVisible(),true)
    const box=await page.locator('.timeline-heading-row').boundingBox()
    assert.ok(box.height<=(width>=768?90:130),'compact scope heading '+width)
    console.log('MIP_TIMELINE_COMPACT_'+width+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
    await summary.focus()
    await page.keyboard.press('Enter')
    await methods.getByText('POLICY CHANGE OVER TIME',{exact:true}).waitFor()
    assert.equal(await methods.getByText('Legislation, rulings, incidents, and reporting in one auditable sequence.',{exact:true}).isVisible(),true)
    console.log('MIP_TIMELINE_METHODS_'+width+'='+(await methods.screenshot({type:'jpeg',quality:75})).toString('base64'))
    await summary.click()
    assert.equal(await methods.getAttribute('open'),null)
    assert.equal(await context(),subject)
  }
  // Search changes displayed records, not the selected investigation.
  const search=page.getByRole('searchbox',{name:'Search timeline events',exact:true})
  await search.fill('mip-ui-check-no-matching-record-93')
  await page.waitForFunction(()=>document.querySelectorAll('.timeline-view .ep-tl-card').length===0)
  assert.equal(await context(),subject)
  await search.fill('')
  await page.locator('.timeline-view .ep-tl-card').first().waitFor()
  assert.equal(await page.locator('.timeline-view .ep-tl-card').count(),initialCount)
  const presentation=page.getByRole('group',{name:'Timeline presentation',exact:true})
  await presentation.getByRole('button',{name:'List',exact:true}).click()
  assert.equal(await presentation.getByRole('button',{name:'List',exact:true}).getAttribute('aria-pressed'),'true')
  await presentation.getByRole('button',{name:'Chronology',exact:true}).click()

  // Regression: hidden date/spine tracks must not squeeze List cards to 72px.
  for(const width of [1280,1024,768,390,320]){
    await page.setViewportSize({width,height:width>=768?900:844})
    for(const collapsed of [false,true]){
      const inspector=page.locator('.ws-inspector-toggle')
      if((await inspector.getAttribute('aria-expanded')==='false')!==collapsed)await inspector.click()
      await presentation.getByRole('button',{name:'List',exact:true}).click()
      const cards=page.locator('.timeline-view .ep-tl-list-alt .ep-tl-card')
      await cards.first().waitFor()
      const geometry=await cards.evaluateAll(nodes=>nodes.map(card=>{
        const entry=card.parentElement
        const c=card.getBoundingClientRect(),e=entry.getBoundingClientRect()
        return {card:c.width,entry:e.width,left:c.left,right:c.right,entryLeft:e.left,entryRight:e.right,
          client:card.clientWidth,scroll:card.scrollWidth}
      }))
      for(const g of geometry){
        assert.ok(g.card>=g.entry-2,'List card fills available row '+JSON.stringify({width,collapsed,...g}))
        assert.ok(g.left>=g.entryLeft-1&&g.right<=g.entryRight+1,'card fits row')
        assert.ok(g.scroll<=g.client+1,'card contents do not overflow')
      }
      assert.equal(await context(),subject)
      const toggle=cards.first().getByRole('button')
      await toggle.click()
      assert.equal(await toggle.getAttribute('aria-expanded'),'true')
      assert.equal(await cards.first().locator('.ep-tdetail').isVisible(),true)
      await toggle.click()
      await cards.first().scrollIntoViewIfNeeded()
      console.log('MIP_TIMELINE_LIST_'+width+'_'+(collapsed?'collapsed':'open')+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
      console.log('MIP_TIMELINE_LIST_GEOMETRY='+JSON.stringify({width,collapsed,geometry}))
      await presentation.getByRole('button',{name:'Chronology',exact:true}).click()
      assert.equal(await page.locator('.timeline-view .ep-tl-chronology').count(),1)
      const chronology=await page.locator('.timeline-view .ep-tl-chronology .ep-tl-card').first().boundingBox()
      assert.ok(chronology.width>=280&&chronology.width<=290,'Chronology retains its card layout')
    }
  }

  const tabs=page.getByRole('tablist',{name:'Timeline sections',exact:true})
  for(const name of ['Connections','Evidence','Timeline']){
    await tabs.getByRole('tab',{name,exact:true}).click()
    assert.equal(await tabs.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true')
    assert.equal(await context(),subject)
  }
  assert.equal(await methods.getAttribute('open'),null)
  assert.deepEqual(errors,[])
  console.log('MIP_TIMELINE_COMPOSITION_PASS='+JSON.stringify({widths:[1280,768,390,320],scopeVisible:true,keyboardDisclosure:true,searchRoundTrip:true,presentation:true,evidenceTabs:true,subjectPreserved:true,pageErrors:0}))
}finally{await browser?.close();server.kill('SIGTERM')}
