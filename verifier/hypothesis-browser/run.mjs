import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
const require=createRequire(import.meta.url)
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild')
const {chromium,webkit}=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')('playwright')
const bundle=await build({entryPoints:['verifier/hypothesis-browser/fixture.jsx'],bundle:true,write:false,
 format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const css=await readFile('src/styles/investigation-workspace-panels.css','utf8')
for(const [engine,launcher] of Object.entries({chromium,webkit})){
 const browser=await launcher.launch({headless:true})
 try{
  const page=await browser.newPage(),requests=[],errors=[]
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort()})
  page.on('pageerror',e=>errors.push(e.message))
  for(const width of [1280,768,390,320]){
   await page.setViewportSize({width,height:1000})
   await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic hypothesis worker inspection</title><div id="root"></div>')
   await page.addStyleTag({content:css})
   await page.addScriptTag({content:bundle.outputFiles[0].text})
   const region=page.getByRole('region',{name:'Hypothesis worker attempts'})
   await region.waitFor()
   assert.equal(await page.evaluate(()=>window.synthetic.calls),0)
   const inspect=region.getByRole('button',{name:'Inspect worker attempts',exact:true})
   await inspect.focus();await page.keyboard.press('Enter')
   await region.getByText('Failed; retained for reconciliation',{exact:true}).waitFor()
   assert.equal(await page.evaluate(()=>window.synthetic.calls),1)
   assert.equal(await region.locator('li').count(),3)
   assert.ok((await region.innerText()).includes('Linked fresh generation'))
   assert.ok((await region.innerText()).includes('Fresh recovery of retained generation'))
   const recover=region.getByRole('button',{name:'Prepare fresh-generation recovery',exact:true})
   assert.equal(await recover.count(),1)
   await recover.focus();await page.keyboard.press('Enter')
   assert.deepEqual(await page.evaluate(()=>window.synthetic.recoveries),['00000000-0000-4000-8000-000000000023'])
   assert.equal(await page.evaluate(()=>window.synthetic.calls),1)
   assert.equal(await region.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   if(width===390)console.log('MIP_SYNTHETIC_WORKER_LEDGER_'+engine+'='+(await region.screenshot({type:'jpeg',quality:65})).toString('base64'))
   await page.evaluate(()=>window.synthetic.mode='denied')
   await region.getByRole('button',{name:'Refresh worker attempts',exact:true}).click()
   await region.getByText('Worker attempts are unavailable under the current access context.',{exact:true}).waitFor()
   assert.equal(await region.locator('li').count(),0)
   assert.equal(await recover.count(),0)
   await page.evaluate(()=>window.renderSynthetic(null))
   await region.waitFor({state:'detached'})
  }
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[])
  console.log('MIP_SYNTHETIC_HYPOTHESIS_BROWSER_PASS='+JSON.stringify({engine,widths:[1280,768,390,320],
   keyboardInspection:true,reciprocalRecoveryLinks:true,onlyUnlinkedFailureRecoverable:true,
   noAutomaticRetry:true,deniedRecordsCleared:true,logoutCleared:true,networkRequests:0,
   scope:'synthetic_generation_ledger_only',productionQualified:false}))
 }finally{await browser.close()}
}
