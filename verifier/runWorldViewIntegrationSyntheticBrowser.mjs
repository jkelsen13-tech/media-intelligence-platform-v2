// Synthetic full-App execution only. No live reader/auth or source qualification.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {writeFile} from 'node:fs/promises'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'
const require=createRequire('/tmp/mip-browser/package.json'),{chromium}=require('playwright')
const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(k=>[k,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,precision_class:'city',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
const rows=makeClusteringContractRows(template,'US-local',{count:12}),graph=clusteringGraphContractRows(rows)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
const receipts=[]
try{
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:844,height:390}]){
 const page=await browser.newPage({viewport}),errors=[],requests=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1')return route.continue()
  requests.push({method:req.method(),path:u.pathname})
  if(req.method()==='HEAD' && u.hostname.endsWith('supabase.co'))return route.fulfill({status:200,headers:{'content-range':'*/0','access-control-allow-origin':'*'}})
  if(req.method()!=='GET')return route.abort()
  if(u.hostname.endsWith('supabase.co')){
   const table=u.pathname.split('/').pop(),body=table==='spatial_projection_v1'?rows:table==='nodes'?graph.nodes:table==='edges'?graph.edges:[]
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}})
  }
  return route.abort()
 })
 await page.goto('http://127.0.0.1:4178/media-intelligence-platform-v2/?worldViewPrototype=1')
 await page.getByRole('tablist',{name:'Evidence views',exact:true}).getByRole('tab',{name:'World View',exact:true}).click()
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount===12,{},{timeout:60000})
 const state=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getState())
 assert.equal(state.layout.stats.inputCount,12)
 const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
 for(const mode of ['Graph','Split','Map']){await modes.getByRole('tab',{name:mode,exact:true}).click();await page.waitForTimeout(350)}
 await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify({version:1,lon:-81.7,lat:41.4,heightMeters:100000,headingDegrees:0,pitchDegrees:-90,rollDegrees:0})))
 await page.waitForTimeout(700)
 const panel=page.getByRole('region',{name:'Spatial groups',exact:true})
 const summary=panel.locator('summary').first();if(await summary.count()&&!await summary.evaluate(n=>n.parentElement.open))await summary.click()
 const group=panel.locator('button[data-cluster-id]').first()
 await group.click()
 const member=panel.locator('button[data-row-key]').first()
 await member.press('Space')
 await page.waitForTimeout(1000)
 const selected=await page.locator('[data-canonical-subject-id]').first().getAttribute('data-canonical-subject-id')
 assert.ok(selected,'full App member choice commits canonical original endpoint')
 const before=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 const open=page.getByRole('button',{name:'Open selected spatial context',exact:true})
 await open.click()
 await page.getByRole('tablist',{name:'Selected record modules',exact:true}).waitFor()
 for(const tab of ['Context','Sources','Evidence'])await page.getByRole('tablist',{name:'Selected record modules',exact:true}).getByRole('tab',{name:tab,exact:true}).click()
 assert.ok(await page.locator('.wv-billboard-tether-anchor').count(),'selected reader preserves continuous canonical tether')
 await page.getByRole('button',{name:'Open inspector',exact:true}).click()
 const after=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 assert.equal(after,before,'reader tabs and explicit inspector do not move camera')
 assert.deepEqual(errors,[])
 // Every non-GET was aborted above; never fulfill a mutation/auth request.
 const screenshot=`/workspace/mip-oct02/evidence/lane1-2/full-app-synthetic-${viewport.width}x${viewport.height}.png`
 await page.screenshot({path:screenshot,fullPage:true})
 receipts.push({viewport,qualification:'synthetic-full-App-only-no-live-reader-or-provider',renderer:state.rendererKind,inputs:state.layout.stats.inputCount,errors,nonlocalGETs:requests.filter(r=>r.method==='GET').length,blockedNonGETs:requests.filter(r=>r.method!=='GET'),screenshot})
 await page.close()
}
await writeFile('/workspace/mip-oct02/evidence/lane1-2/full-app-synthetic.json',JSON.stringify({receipts},null,2))
}finally{await browser.close()}
