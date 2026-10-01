// Entirely synthetic component journey. Does not qualify live App reader wiring.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {chromium}=require('playwright')
const rowTime='2026-01-01T00:00:00Z'
const candidate=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
const html='verifier/.world-view-repair.html',jsx='verifier/.world-view-repair.jsx'
await writeFile(html,'<html><body><div id="root"></div><script type="module" src="/verifier/.world-view-repair.jsx"></script></body></html>')
await writeFile(jsx,`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import WorldMapCanvas from '../src/views/WorldMapCanvas.jsx';
import WorldViewRelationshipPanel from '../src/components/WorldViewRelationshipPanel.jsx';
import{applySubject,emptyInvestigationContext,subjectFromWorldViewSelection,subjectFromGraphInspection,setInvestigationAsOfTime,investigationContextDomProps}from'../src/lib/investigationContext.js';
import '../src/views/worldview.css';
const row={mip_object_id:'synthetic-a',revision_id:'revision-a',spatial_role:'event',subject_graph_node_id:'event-a',object_type:'event',precision_class:'city',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},geometry_status:'coarsened_to_precision_class',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_hint:{label:'Synthetic A'}};
const other={...row,mip_object_id:'synthetic-b',revision_id:'revision-b',subject_graph_node_id:'event-b'};
const rows=[row,other],nodes=[{id:'event-a',type:'event',label:'Synthetic A',occurred_at:null},{id:'event-b',type:'event',label:'Synthetic B',occurred_at:null}],edges=[{id:'edge-a',source:'event-a',target:'event-b',type:'association'}];
const memory={getStackId:()=> 'atlas-fallback'};const keys=new Set();
function Harness(){const[ic,setIc]=useState(emptyInvestigationContext('world'));const[picks,setPicks]=useState(0);return <div>
<div id="context" {...investigationContextDomProps(ic)} data-picks={picks}/>
<WorldMapCanvas cameraMemory={memory} rows={rows} selectedKeys={keys} onSelectRow={value=>{setPicks(n=>n+1);setIc(current=>applySubject(current,subjectFromWorldViewSelection({row:value})))}}/>
<button onClick={()=>setIc(current=>setInvestigationAsOfTime(current,'2026-01-01T12:00:00Z'))}>Scrub recorded time</button>
<WorldViewRelationshipPanel nodes={nodes} edges={edges} onSelectNode={node=>setIc(current=>applySubject(current,subjectFromGraphInspection(node,current)))}/></div>};createRoot(document.getElementById('root')).render(<Harness/>);
`)
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4174','--strictPort'],{stdio:'ignore'})
let browser
try{
 const base='http://127.0.0.1:4174/media-intelligence-platform-v2/'
 for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.MIP_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'})
 const receipts=[]
 for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:844,height:390}]){
  const page=await browser.newPage({viewport}),errors=[]
  page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE_ERROR='+m.text())})
  page.on('response',r=>{if(r.status()>=400)console.error('HTTP_ERROR='+r.status()+' '+new URL(r.url()).pathname)})
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR='+e.message)})
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
  await page.goto(base+'verifier/.world-view-repair.html')
  const hidden=page.locator('.wv-feature[aria-hidden="true"]');await hidden.first().waitFor({state:'attached'})
  assert.equal(await hidden.count(),2)
  const context=()=>page.locator('#context').evaluate(n=>Object.fromEntries([...n.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])))
  const empty=await context()
  await hidden.evaluateAll(nodes=>{for(const node of nodes){node.dispatchEvent(new MouseEvent('click',{bubbles:true}));for(const key of ['Enter',' '])node.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))}})
  assert.deepEqual(await context(),empty,'hidden grouped original click/Enter/Space cannot activate')
  await page.getByRole('button',{name:'Inspect group: 2 projection rows, 2 display locations',exact:true}).click()
  assert.deepEqual(await context(),empty,'group inspection cannot choose a member')
  const member=page.locator('button[data-row-key]').filter({hasText:'synthetic-a'}).first()
  await member.press('Space')
  let picked=await context();assert.equal(picked['data-picks'],'1');assert.equal(picked['data-canonical-subject-id'],'event-a');assert.equal(picked['data-as-of-time'],rowTime)
  await page.getByRole('button',{name:'Scrub recorded time',exact:true}).click()
  const bound=await context();assert.equal(bound['data-as-of-time'],'2026-01-01T12:00:00Z')
  await page.getByLabel('Documented relationships',{exact:true}).locator('summary').first().click()
  await page.locator('.wv-relationship-record > summary').click()
  await page.getByRole('button',{name:'Inspect Source: Synthetic A',exact:true}).click()
  assert.deepEqual(await context(),bound,'same endpoint inspection retains bound recorded time/range')
  await page.getByRole('button',{name:'Inspect Target: Synthetic B',exact:true}).click()
  const changed=await context();assert.equal(changed['data-canonical-subject-id'],'event-b');assert.equal(changed['data-as-of-time'],'');assert.equal(changed['data-selected-time-range'],'')
  assert.deepEqual(errors,[])
  receipts.push({viewport,hiddenOriginalEvents:['click','Enter','Space'],inspectThenChoose:true,memberNativeSpace:true,boundTimeSameEndpoint:true,newEndpointTimeReset:true,pageErrors:errors})
  await page.close()
 }
 console.log(JSON.stringify({candidate,evidenceLayer:'synthetic-mounted-production-components',receipts,liveAppReaderQualified:false,backendRequestsAllowed:false}))
}finally{await browser?.close();server.kill();await unlink(html);await unlink(jsx)}
