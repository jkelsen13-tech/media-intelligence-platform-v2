// Explicit controlled-Chromium qualification of the real selected reader and
// styles. This fixture supplies display text; it admits no source/provider data.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
const {chromium}=createRequire((process.env.MIP_BROWSER_PACKAGE ?? '/tmp/mip-browser')+'/package.json')('playwright')
const output=process.env.MIP_CARD_SCROLL_EVIDENCE ?? '/tmp/mip-selected-card-css'
await mkdir(output,{recursive:true})
const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx',contents:`
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import Overlay from './src/components/WorldViewBillboardOverlay.jsx';
 import {layoutWorldBillboards} from './src/lib/worldViewBillboardLayout.js';
 import {updateSelectedBillboardEnvelope} from './src/lib/worldViewBillboardPresentation.js';
 import {buildWorldBillboardModel} from './src/lib/worldViewBillboardModules.js';
 const root=createRoot(document.getElementById('reader'));
 window.mountReader=({viewport,title,precision='city',occluded=false,scope})=>{
  const record={key:'record',label:title,precision,canonicalCoordinates:[-81.7,41.4],
   suppliedModules:[{id:'sources',label:'Sources',content:[{label:'Controlled long source status',value:'Unavailable — no qualified capture time or current provider observation supplied. '.repeat(8)}]}]};
  const model=buildWorldBillboardModel(record,{inspectionTime:'2026-01-01T12:00:00Z'});
  if(scope)model.locationScope=scope;
  const layout=layoutWorldBillboards({items:[{key:'record',anchor:{x:140,y:110},canonicalCoordinates:record.canonicalCoordinates,precision,distanceMeters:100000,canonicalOccluded:occluded,displayOccluded:false}],viewport,selectedKey:'record'});
  layout.selected=updateSelectedBillboardEnvelope({selected:layout.selected,viewport}).selected;
  window.fixtureLayout=layout; window.fixtureCalls=[];
  root.render(<Overlay layout={layout} selectedKey='record' model={model} interactionEnabled onClose={()=>{window.fixtureCalls.push('close');root.render(null)}} onInspect={()=>window.fixtureCalls.push('inspect')}/>);
 };
`},write:false,bundle:true,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}})
const css=(await Promise.all(['tokens.css','world-view-explore.css','world-view-billboard-prototype.css'].map(n=>readFile(new URL('../src/styles/'+n,import.meta.url),'utf8')))).join('\n')
const browser=await chromium.launch({headless:true,executablePath:process.env.MIP_BROWSER_EXECUTABLE??'/usr/bin/chromium'})
const receipts=[]
try{
 for(const caseSpec of [
  {width:640,height:360,nativeWidth:620,nativeHeight:224,coarse:false,title:'Synthetic clustering fixture row 2'},
  {width:640,height:360,nativeWidth:620,nativeHeight:224,coarse:true,title:'Recorded regional observation',precision:'region',occluded:true},
  {width:690,height:360,nativeWidth:604,nativeHeight:224,coarse:true,title:'Recorded city observation with supplied provenance'},
  {width:640,height:360,nativeWidth:554,nativeHeight:224,coarse:true,title:'Recorded city observation',scope:'city scope · representative area anchor; not exact position'},
  {width:390,height:844,nativeWidth:370,nativeHeight:620,coarse:true,title:'Recorded city observation',occluded:true},
  {width:844,height:390,nativeWidth:736,nativeHeight:238,coarse:true,title:'Recorded regional observation',precision:'region',occluded:true}
 ]){
  const page=await browser.newPage({viewport:{width:caseSpec.width,height:caseSpec.height},hasTouch:caseSpec.coarse})
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:var(--font-sans,Arial,sans-serif)}${css}</style><div class='wv-explore-shell'><div id='reader' style='position:absolute;left:10px;top:62px;width:${caseSpec.nativeWidth}px;height:${caseSpec.nativeHeight}px'></div></div>`)
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  await page.evaluate(v=>window.mountReader({...v,viewport:{width:v.nativeWidth,height:v.nativeHeight}}),caseSpec)
  await page.locator('.wv-billboard-card').waitFor();await page.waitForTimeout(300)
  const measure=()=>page.evaluate(()=>{
   const c=document.querySelector('.wv-billboard-card'),r=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}},cr=r(c)
   const geometry=n=>{const b=r(n);return{rect:b,full:b.x>=cr.x+1&&b.y>=cr.y+1&&b.right<=cr.right-1&&b.bottom<=cr.bottom-1,hit:n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),text:n.textContent}}
   const body=c.querySelector('.wv-billboard-module-body');return{card:cr,scrollTop:c.scrollTop,clientHeight:c.clientHeight,scrollHeight:c.scrollHeight,precision:geometry(c.querySelector('.wv-billboard-eyebrow')),scope:geometry(c.querySelector('.wv-billboard-scope-cue')),status:geometry(c.querySelector('.wv-billboard-stem-cue')),occlusion:c.querySelector('.wv-billboard-occlusion-cue')?geometry(c.querySelector('.wv-billboard-occlusion-cue')):null,title:geometry(c.querySelector('h3')),close:geometry(c.querySelector('[aria-label="Close selected card"]')),inspector:geometry(c.querySelector('.wv-billboard-inspect')),body:{rect:r(body),scrollTop:body.scrollTop,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,lineHeight:getComputedStyle(body).lineHeight,overflow:getComputedStyle(body).overflow},active:document.activeElement.getAttribute('aria-label')??document.activeElement.textContent?.slice(0,40),layout:window.fixtureLayout}
  })
  const before=await measure()
  const tabs=page.getByRole('tablist',{name:'Selected record modules'})
  // Close is focused by the actual component mount. Exercise native Tab,
  // roving arrow navigation, module-body scroll and footer focus.
  await page.keyboard.press('Tab');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('Tab')
  await page.keyboard.press('End');await page.waitForTimeout(250);const bodyScrolled=await measure()
  await page.keyboard.press('Tab');const focused=await measure()
  const label=`${caseSpec.width}x${caseSpec.height}-${caseSpec.nativeWidth}-${caseSpec.coarse?'coarse':'fine'}`
  await page.screenshot({path:output+'/'+label+'.png',fullPage:false})
  receipts.push({caseSpec,before,bodyScrolled,focused})
  await writeFile(output+'/controlled-reader-allocation.json',JSON.stringify({runtime:process.version,receipts},null,2)+'\n')
  assert.equal(focused.active,'Open inspector',label+' ordinary Tab reaches Inspector')
  for(const k of ['precision','scope','status','title','close','inspector'])assert.equal(focused[k].full,true,label+' '+k+' is fully painted')
  if(focused.occlusion)assert.equal(focused.occlusion.full,true,label+' canonical occlusion is fully painted');
  assert.equal(focused.close.hit,true);assert.equal(focused.inspector.hit,true)
  assert.equal(focused.scrollTop,0,label+' outer card never owns focus scroll')
  assert.ok(focused.body.clientHeight>=parseFloat(focused.body.lineHeight),label+' body visibly owns at least one text line')
  assert.equal(focused.body.overflow,'auto');assert.ok(bodyScrolled.body.scrollTop>0,label+' actual End scrolls module content')
  assert.deepEqual(focused.layout.selected.anchor,{x:140,y:110});assert.deepEqual(focused.layout.selected.canonicalCoordinates,[-81.7,41.4])
  if(caseSpec.coarse)assert.equal(focused.close.rect.height,44)
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('button',{name:'Close selected card'}).evaluate(n=>document.activeElement===n),true)
  await page.keyboard.press('Enter');await page.locator('.wv-billboard-card').waitFor({state:'hidden'})
  assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),['close'])
  await page.close()
 }
 console.log(JSON.stringify({runtime:process.version,status:'PASS',cases:receipts.length,receipt:output+'/controlled-reader-allocation.json'}))
}finally{await browser.close()}
