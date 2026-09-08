// Production browser checks on an ephemeral CI runner; public records only.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const { chromium, webkit } = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')('playwright')
const origin = process.env.MIP_LIVE_SITE === '1' ? 'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/' : 'http://127.0.0.1:4173/media-intelligence-platform-v2/'
const subject='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const label='2024 Total Solar Eclipse, Cleveland, Ohio'
const server = process.env.MIP_LIVE_SITE === '1' ? null : spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
let browser
try {
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(origin)).ok}catch{};if(ready)break;await delay(250)}
  assert.ok(ready)
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    browser=await engine.launch({headless:true})
    const page=await browser.newPage()
    const errors=[]
    page.on('pageerror',e=>{errors.push(e.message);console.log('MIP_GRAPH_PAGE_ERROR='+e.stack)})
    for(const width of [1280,768,390,320]){
      await page.setViewportSize({width,height:width>=768?900:844})
      await page.goto(origin+'#/event/'+subject+'/graph')
      const modes=page.getByRole('tablist',{name:'Focused Graph views',exact:true})
      await modes.getByRole('tab',{name:'Time',exact:true}).waitFor({timeout:60000})
      // A subject deep link opens its inspector; dismiss that real overlay
      // before attempting background navigation on tablet/phone.
      const closePanel=page.getByRole('button',{name:'Close panel',exact:true})
      if(await closePanel.count())await closePanel.click()
      await modes.getByRole('tab',{name:'Time',exact:true}).click()
      const record=page.getByRole('button',{name:'Open node evidence: '+label,exact:true})
      await record.waitFor()
      assert.equal(await record.getByText('Recorded date: 2024-04-08',{exact:true}).isVisible(),true)
      assert.equal(await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id'),subject)
      const geometry=await record.evaluate(e=>({width:e.getBoundingClientRect().width,row:e.parentElement.getBoundingClientRect().width,height:e.getBoundingClientRect().height,client:e.clientWidth,scroll:e.scrollWidth}))
      console.log('MIP_GRAPH_TIME_GEOMETRY='+JSON.stringify({engineName,viewportWidth:width,...geometry}))
      assert.ok(geometry.height>=44)
      assert.ok(geometry.width>=geometry.row-2,'full-width record '+JSON.stringify(geometry))
      assert.ok(geometry.scroll<=geometry.client+1,'no record overflow')
      if(width<768){
        const panel=await page.locator('.graph-time-panel').boundingBox()
        assert.ok(panel.height>=geometry.height+80,'phone Time panel has reading height')
        const inspector=await page.locator('.ws-inspector').boundingBox()
        assert.ok(inspector.y>=panel.y+panel.height-1,'phone context follows Time records')
      }
      await record.focus()
      console.log('MIP_GRAPH_TIME_'+engineName+'_'+width+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
      await page.keyboard.press('Enter')
      await page.getByRole('dialog',{name:'Article panel: '+label,exact:true}).waitFor()
      assert.equal(await modes.getByRole('tab',{name:'Relationships',exact:true}).getAttribute('aria-selected'),'true')
      assert.equal(await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id'),subject)
      await page.getByRole('button',{name:'Close panel',exact:true}).click()
      await modes.getByRole('tab',{name:'Time',exact:true}).click()
      await record.waitFor()
      await record.click()
      await page.getByRole('dialog',{name:'Article panel: '+label,exact:true}).waitFor()
      console.log('MIP_GRAPH_TIME_INSPECTOR_'+engineName+'_'+width+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
    }
    assert.deepEqual(errors,[])
    console.log('MIP_GRAPH_TIME_PASS='+JSON.stringify({engineName,widths:[1280,768,390,320],keyboardSelection:true,pointerSelection:true,exactInspector:true,subjectPreserved:true,pageErrors:0}))
    await browser.close()
    browser=null
  }
}finally{await browser?.close();server?.kill('SIGTERM')}
