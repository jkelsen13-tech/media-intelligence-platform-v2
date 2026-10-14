import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'))
const evidence = path.join(root,'evidence')
await mkdir(evidence,{recursive:true})
const require = createRequire('C:/Users/joseph/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium} = require('playwright')
const base='http://127.0.0.1:4178/media-intelligence-platform-v2/'
const label='MIP — Media Intelligence Platform'
const cases=[
 {name:'tablet',width:1024,height:900,dpr:1},
 {name:'tablet-narrow',width:768,height:900,dpr:1},
 {name:'mobile-portrait',width:390,height:844,dpr:2},
 {name:'mobile-narrow',width:320,height:740,dpr:3},
 {name:'mobile-landscape',width:740,height:390,dpr:2},
 {name:'mobile-wide-landscape',width:844,height:390,dpr:2},
]
const receipt={scope:'Actual production-built App with bundled synthetic demo data; all external page requests blocked',
 environment:{node:process.version,playwright:require('playwright/package.json').version,browser:'Installed Chrome; fresh task-owned profile',physicalDeviceTest:false},
 startedAt:new Date().toISOString(),cases:[],status:'RUNNING'}
await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n')
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',downloadsPath:path.join(root,'runtime-temp/downloads'),args:['--disable-background-networking']})
try{
 receipt.environment.browserVersion=browser.version()
 for(const config of cases){
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr})
  const page=await context.newPage()
  const item={...config,status:'RUNNING',errors:[],blockedExternalRequests:[],screenshots:[],checks:[]}
  receipt.cases.push(item)
  await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n')
  page.on('pageerror',e=>item.errors.push(e.message))
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url())
    if(url.origin==='http://127.0.0.1:4178')return route.continue()
    item.blockedExternalRequests.push({origin:url.origin,path:url.pathname})
    return route.abort()
  })
  const check=(name,condition)=>{assert.ok(condition,name+' ('+config.name+')');item.checks.push(name)}
  const shot=async name=>{
    const file=name+'.png'
    await page.screenshot({path:path.join(evidence,file),fullPage:false})
    const bytes=await readFile(path.join(evidence,file))
    item.screenshots.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
  }
  const bounds=async locator=>locator.evaluate(n=>{
    const r=n.getBoundingClientRect(),style=getComputedStyle(n)
    return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:style.display,flexBasis:style.flexBasis,objectFit:style.objectFit,imageRendering:style.imageRendering}
  })
  const inspectBrand=async container=>{
    const mark=container.locator('img.ws-mobius')
    await mark.waitFor({state:'visible'})
    await mark.evaluate(n=>n.decode())
    const image=await mark.evaluate(n=>({src:n.currentSrc,width:n.width,height:n.height,naturalWidth:n.naturalWidth,complete:n.complete,attributeWidth:n.getAttribute('width'),attributeHeight:n.getAttribute('height')}))
    const box=await bounds(mark),parent=await bounds(container)
    check('48px reserved square',Math.abs(box.width-48)<0.1&&Math.abs(box.height-48)<0.1&&image.attributeWidth==='48'&&image.attributeHeight==='48')
    check('48px flex basis and normal smoothing',box.flexBasis==='48px'&&box.objectFit==='contain'&&box.imageRendering==='auto')
    check('density source selection',image.src.endsWith('MIP_B_Square_'+48*config.dpr+'px.png'))
    check('logo fits brand bounds',box.x>=parent.x-0.1&&box.right<=parent.right+0.1&&box.y>=parent.y-0.1&&box.bottom<=parent.bottom+0.1)
    check('one accessible brand announcement',await container.getByRole('img',{name:label,exact:true}).count()===1||await container.getAttribute('aria-label')===label)
    check('existing brand stays noninteractive',await container.locator('a,button').count()===0)
    const word=container.locator('.ws-brand-wordmark')
    if(await word.count()&&await word.isVisible()){
      const w=await bounds(word)
      check('wordmark fits brand bounds',w.x>=parent.x-0.1&&w.right<=parent.right+0.1)
      const clipped=await word.evaluate(n=>[n,...n.children].some(c=>c.scrollWidth>c.clientWidth+1))
      check('wordmark avoids horizontal text clipping',!clipped)
    }
    item.brandObservations??=[]
    item.brandObservations.push({image,box,parent})
  }
  try{
   await page.goto(base,{waitUntil:'networkidle'})
   await page.locator('.ws-shell').waitFor({state:'visible',timeout:30000})
   await page.locator('.ws-nav-btn').first().waitFor({state:'attached',timeout:30000})
   const shell=page.locator('.ws-shell')
   const subjectBefore=await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id')
   const menu=page.getByRole('button',{name:'Open investigation navigation',exact:true})
   const isMobile=await menu.isVisible()
   item.actualNavigationMode=isMobile?'drawer':'rail'
   if(isMobile){
    await shot(config.name+'-closed')
    await menu.focus();await page.keyboard.press('Enter')
    const drawer=page.getByRole('dialog',{name:'Investigation navigation',exact:true})
    await drawer.waitFor({state:'visible'})
    const brand=drawer.locator('.ws-drawer-brand')
    await inspectBrand(brand)
    const close=drawer.getByRole('button',{name:'Close navigation',exact:true})
    const c=await bounds(close)
    check('44px drawer close target',c.width>=44&&c.height>=44)
    check('close control is unobstructed',await close.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}))
    check('drawer opens with keyboard focus on close',await close.evaluate(n=>document.activeElement===n))
    const buttons=drawer.locator('button')
    await buttons.last().focus();await page.keyboard.press('Tab')
    check('drawer Tab trap wraps to close',await close.evaluate(n=>document.activeElement===n))
    await page.keyboard.press('Shift+Tab')
    check('drawer reverse Tab trap wraps to last control',await buttons.last().evaluate(n=>document.activeElement===n))
    await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'})
    check('Escape restores menu focus',await menu.evaluate(n=>document.activeElement===n))
    await page.keyboard.press('Enter');await drawer.waitFor({state:'visible'})
    await shot(config.name+'-drawer')
    await drawer.getByRole('button',{name:'Timeline',exact:true}).click()
    await drawer.waitFor({state:'hidden'})
    check('drawer navigation selects Timeline',await shell.getAttribute('data-workspace-view')==='timeline')
    check('drawer navigation preserves investigation',await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id')===subjectBefore)
   }else{
    const nav=page.locator('.ws-nav'),brand=nav.locator('.ws-nav-brand')
    await inspectBrand(brand)
    item.expandedRail=await bounds(nav)
    check('existing expanded rail width',Math.abs(item.expandedRail.width-(config.width<=1023?160:190))<0.1)
    await shot(config.name+'-expanded')
    const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true})
    await collapse.focus();await page.keyboard.press('Enter')
    await page.waitForFunction(()=>document.querySelector('.ws-shell').classList.contains('ws-nav-collapsed'))
    await inspectBrand(brand)
    item.compactRail=await bounds(nav)
    check('compact rail remains72px',Math.abs(item.compactRail.width-72)<0.1)
    check('compact rail brand remains named',await brand.getAttribute('aria-label')===label)
    await shot(config.name+'-compact')
    const expand=page.getByRole('button',{name:'Expand navigation',exact:true})
    check('collapse preserves control focus',await expand.evaluate(n=>document.activeElement===n))
    check('collapse keyboard focus remains visible',await expand.evaluate(n=>getComputedStyle(n).outlineStyle!=='none'))
    await page.keyboard.press('Enter')
    const navigation=page.getByRole('navigation',{name:'Evidence views',exact:true})
    await navigation.getByRole('button',{name:'Timeline',exact:true}).click()
    check('desktop navigation selects Timeline',await shell.getAttribute('data-workspace-view')==='timeline')
    await navigation.getByRole('button',{name:'Graph',exact:true}).click()
    check('desktop navigation returns to Graph',await shell.getAttribute('data-workspace-view')==='graph')
    check('desktop navigation preserves investigation',await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id')===subjectBefore)
   }
   check('no application page errors',item.errors.length===0)
   check('no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   item.status='PASS'
  }catch(error){
   item.status='FAIL';item.failure=error.message
   await shot(config.name+'-failure')
   throw error
  }finally{
   await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n')
   await context.close()
  }
 }
 receipt.status='PASS'
}catch(error){receipt.status='FAIL';receipt.error=error.message;throw error}
finally{
 receipt.finishedAt=new Date().toISOString()
 await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n')
 await browser.close()
 console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.map(c=>({name:c.name,status:c.status,checks:c.checks.length})),error:receipt.error}))
}

