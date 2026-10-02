// Explicit controlled Chromium test of the real Explore shell and its CSS.
// Long text and controls are synthetic; no renderer/provider admission occurs.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
const {chromium}=createRequire((process.env.MIP_BROWSER_PACKAGE??'/tmp/mip-browser')+'/package.json')('playwright')
const output=process.env.MIP_500_EVIDENCE??'/tmp/mip-500-shell'
await mkdir(output,{recursive:true})
const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import Shell from './src/components/WorldViewExploreShell.jsx';
 let mounts=0;function Globe(){React.useEffect(()=>{mounts++;window.fixtureMounts=mounts},[]);return <div className='wv-stage'><div className='wv-map-panel'><div className='wv-map wv-map-gl'><div className='wv-map-host' data-fixture-map>Controlled globe</div></div></div></div>}
 const controls=<div>{Array.from({length:32},(_,i)=><p key={i}><button>Controlled option {i+1}</button> Full supplied option text remains available.</p>)}</div>;
 const context=<div>{Array.from({length:32},(_,i)=><p key={i}><button>Controlled evidence {i+1}</button> Recorded regional evidence; no current observation or exact feature position supplied.</p>)}</div>;
 const camera=JSON.stringify({version:1,lon:-81.7,lat:41.4,heightMeters:100000,headingDegrees:0,pitchDegrees:-90,rollDegrees:0});window.fixtureRestores=[];
 createRoot(document.getElementById('app')).render(<Shell prototypeEnabled contextToken={{subjectKey:'recorded-area',version:'revision-1',timeToken:'2026-01-01T12:00:00Z'}} recordedTimeLabel='Recorded time: 1 January 2026, 12:00 UTC' cameraAdapter={{getCameraState:()=>camera,setCameraState:s=>{window.fixtureRestores.push(s);return true}}} controls={controls} context={context} preview='Recorded regional observation with supplied provenance — representative area anchor; not an exact position. Current provider observations unavailable.' status={'Source status unavailable: no qualified current capture time or provider observation supplied. '.repeat(5)} attribution='Reference ellipsoid fallback; source dates unknown; background context only.'><Globe/></Shell>);
`},write:false,bundle:true,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}})
const css=(await Promise.all(['tokens.css','world-view-explore.css'].map(n=>readFile(new URL('../src/styles/'+n,import.meta.url),'utf8')))).join('\n')
const browser=await chromium.launch({headless:true,executablePath:process.env.MIP_BROWSER_EXECUTABLE??'/usr/bin/chromium'})
const receipts=[]
try{
 for(const viewport of [{width:480,height:360},{width:486,height:360},{width:500,height:360},{width:589,height:360},{width:590,height:360},{width:390,height:844},{width:844,height:390}]){
  const page=await browser.newPage({viewport,hasTouch:true})
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:var(--font-sans,Arial,sans-serif)}.wv-map-host{height:100%;min-height:0}${css}</style><div id='app'></div>`)
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  const entry=page.getByRole('button',{name:'Explore World View',exact:true})
  const measure=()=>page.evaluate(()=>{
   const r=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}},surface=document.querySelector('.wv-explore-surface'),sr=r(surface)
   const g=n=>{const b=r(n);return{rect:b,full:b.x>=sr.x+1&&b.y>=sr.y+1&&b.right<=sr.right-1&&b.bottom<=sr.bottom-1,hit:n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),text:n.textContent,scrollTop:n.scrollTop,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,overflow:getComputedStyle(n).overflow}}
   return{surface:sr,direction:surface.dataset.exploreDirection,toolbar:[...document.querySelectorAll('.wv-explore-toolbar button,.wv-explore-page-strip')].map(g),actions:[...document.querySelectorAll('.wv-explore-actions button')].map(g),map:r(document.querySelector('.wv-explore-map')),preview:g(document.querySelector('.wv-explore-preview')),context:g(document.querySelector('.wv-explore-context-body')),options:g(document.querySelector('.wv-explore-options')),source:g(document.querySelector('.wv-explore-source')),focused:g(document.activeElement),mounts:window.fixtureMounts,active:document.activeElement.textContent}
  })
  const save=async(label)=>{const value=await measure(),path=output+'/'+viewport.width+'x'+viewport.height+'-'+label+'.png';await page.screenshot({path,fullPage:false});receipts.push({viewport,label,path,...value});await writeFile(output+'/500-shell-allocation.json',JSON.stringify({runtime:process.version,receipts},null,2)+'\n');return value}
  const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)
  for(const [mode,button] of [['immersive','A · Immersive'],['dock','B · Split dock']]){
   await entry.click();await page.getByRole('button',{name:button,exact:true}).click()
   const controls=page.getByRole('navigation',{name:'Explore controls',exact:true})
   await controls.getByRole('button',{name:'Interact',exact:true}).click()
   const paused=await save(mode+'-interacting')
   assert.equal(paused.direction,mode);assert.equal(paused.mounts,1);assert.ok(paused.map.height>=80)
   for(const target of [...paused.toolbar,...paused.actions]){assert.equal(target.full,true,target.text+' fully painted');assert.equal(target.hit,true,target.text+' center hit');if(viewport.width<768)assert.ok(target.rect.height>=44,target.text+' >=44px high')}
   for(let i=0;i<paused.toolbar.length;i++)for(let j=i+1;j<paused.toolbar.length;j++)assert.ok(!overlap(paused.toolbar[i].rect,paused.toolbar[j].rect),'complete toolbar targets never overlap')
   if(viewport.width>=480&&viewport.width<590&&viewport.height<480){assert.equal(paused.map.width,Math.max(402,viewport.width-84));assert.ok(paused.actions.every(n=>n.rect.width>=44));assert.ok(paused.actions.every(n=>!overlap(paused.map,n.rect)))}
   await controls.getByRole('button',{name:'Done — scroll',exact:true}).click()
   const evidence=page.getByRole('button',{name:'Evidence & context',exact:true});await evidence.click()
   const context=await save(mode+'-long-context');assert.ok(context.context.clientHeight>=16);assert.equal(context.context.overflow,'auto');assert.ok(context.preview.text.includes('representative area anchor; not an exact position'));if(viewport.width>viewport.height&&viewport.width<768)assert.ok(context.preview.scrollHeight>context.preview.clientHeight,'long precision/scope preview remains scrollable')
   const collapse=page.getByRole('button',{name:'Collapse evidence',exact:true});await collapse.focus();await page.keyboard.press('Tab')
   assert.equal(await page.getByRole('button',{name:'Controlled evidence 1',exact:true}).evaluate(n=>document.activeElement===n),true)
   for(let i=0;i<20;i++)await page.keyboard.press('Tab')
   const scrolled=await save(mode+'-context-keyboard-scroll');assert.ok(scrolled.context.scrollTop>0,'normal Tab scrolls only evidence body');assert.equal(scrolled.active,'Controlled evidence 21');assert.equal(scrolled.focused.hit,true);assert.ok(scrolled.focused.rect.y>=scrolled.context.rect.y&&scrolled.focused.rect.bottom<=scrolled.context.rect.bottom,'focused evidence target fully inside own scroll body')
   await collapse.click();await controls.getByRole('button',{name:'Options',exact:true}).click()
   await page.getByRole('button',{name:'Close options',exact:true}).focus();await page.keyboard.press('Tab');for(let i=0;i<20;i++)await page.keyboard.press('Tab')
   const options=await save(mode+'-options-keyboard-scroll');assert.ok(options.options.clientHeight>=44);assert.equal(options.options.overflow,'auto');assert.ok(options.options.scrollTop>0);assert.equal(options.active,'Controlled option 21');assert.equal(options.focused.hit,true);assert.ok(options.focused.rect.y>=options.options.rect.y&&options.focused.rect.bottom<=options.options.rect.bottom,'focused option target fully inside own scroll panel')
   for(let i=0;i<21;i++)await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'Close options',exact:true}).evaluate(n=>document.activeElement===n),true);await page.keyboard.press('Enter')
   const pageButton=page.getByRole('button',{name:'Return to page and resume scrolling',exact:true});await pageButton.focus();await page.keyboard.press('Enter')
   assert.equal(await entry.evaluate(n=>document.activeElement===n),true);assert.equal(await page.evaluate(()=>document.body.style.overflow||document.documentElement.style.overflow),'');assert.equal(await page.evaluate(()=>window.fixtureMounts),1)
  }
  assert.equal(await page.evaluate(()=>window.fixtureRestores.length),2)
  await page.close()
 }
 console.log(JSON.stringify({runtime:process.version,status:'PASS',viewports:7,receipts:receipts.length}))
}finally{await browser.close()}
