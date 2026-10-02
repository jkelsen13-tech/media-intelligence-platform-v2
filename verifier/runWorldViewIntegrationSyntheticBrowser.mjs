import {assertMountedWorldViewExploreStack} from './assertWorldViewExploreStack.mjs'
import {spawnSync} from 'node:child_process'
import {cameraStatesEqual} from '../src/lib/worldViewCameraState.js'
// Synthetic full-App execution only. No live reader/auth or source qualification.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {writeFile} from 'node:fs/promises'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'
const require=createRequire('/tmp/mip-browser/package.json'),{chromium}=require('playwright')
const candidate=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
const scenario=process.env.MIP_INTEGRATION_SCENARIO ?? 'city'
const evidenceDir=process.env.MIP_INTEGRATION_EVIDENCE_DIR ?? '/workspace/mip-oct02/evidence/lane1-2'
const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(k=>[k,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:'2026-01-01T12:00:00Z',release_effective_at_utc:'2025-12-01T00:00:00Z',precision_class:scenario==='facility'?'facility':'city',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
const rows=makeClusteringContractRows(template,'US-local',{count:12}),graph=clusteringGraphContractRows(rows)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
const receipts=[]
try{
for(const viewport of scenario==='city'?[{width:1280,height:900},{width:390,height:844},{width:844,height:390}]:[{width:1280,height:900}]){
 const page=await browser.newPage({viewport}),errors=[],requests=[]
 page.on('pageerror',e=>errors.push(e.message))
 if(scenario==='atlas')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args)}})
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
 await page.evaluate(kind=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify({version:1,lon:-81.7,lat:41.4,heightMeters:kind==='facility'?9000:100000,headingDegrees:0,pitchDegrees:-90,rollDegrees:0})),scenario)
 await page.waitForTimeout(700)
 await page.getByRole('button',{name:'Explore World View',exact:true}).click()
 const panel=page.getByRole('region',{name:'Spatial groups',exact:true})
 const summary=panel.locator('summary').first();if(await summary.count()&&!await summary.evaluate(n=>n.parentElement.open))await summary.click()
 const group=panel.locator('button[data-cluster-id]').first()
 await group.click()
 const member=panel.locator('button[data-row-key]').filter({hasText:rows[1].mip_object_id}).first()
 await member.press('Space')
 await page.waitForTimeout(1000)
 const chosenHeight=await page.locator('.wv-explore-map .wv-map-host,.wv-explore-map .wv-map-svg').first().evaluate(n=>n.clientHeight)
 assert.ok(chosenHeight>=80,'member choice inside bounded Explore chooser retains map viewport')
 await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
 const selected=await page.locator('[data-canonical-subject-id]').first().getAttribute('data-canonical-subject-id')
 assert.ok(selected,'full App member choice commits canonical original endpoint')
 if(scenario!=='atlas')await page.getByRole('button',{name:'Stop camera flight',exact:true}).click()
 const native=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState()?.native ?? null)
 if(scenario!=='atlas')assert.ok(native.markers.every(marker=>marker.disableDepthTestDistance===0 && marker.heightReference===2))
 if(scenario==='facility')assert.ok(native.markers.some(marker=>marker.width===132&&marker.height===32),'facility precision floor permits native medium ribbon')
 const before=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())


 if(scenario!=='atlas'){
 const open=page.getByRole('button',{name:'Open selected spatial context',exact:true})
 await page.locator('.wv-billboard-tabs,button[aria-label="Open selected spatial context"]').first().waitFor({state:'visible'})
 if(!await page.getByRole('tablist',{name:'Selected record modules',exact:true}).count())await open.click()
 await page.getByRole('tablist',{name:'Selected record modules',exact:true}).waitFor()
 for(const tab of ['Context','Sources','Evidence'])await page.getByRole('tablist',{name:'Selected record modules',exact:true}).getByRole('tab',{name:tab,exact:true}).click()
 assert.ok(await page.locator('.wv-billboard-tether-anchor').count(),'selected reader preserves continuous canonical tether')
 await page.getByRole('button',{name:'Open inspector',exact:true}).click()
 }
 const after=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 assert.equal(after,before,'reader tabs and explicit inspector do not move camera')
 const time=page.getByRole('slider',{name:'Recorded time',exact:true});await time.focus();await time.press('ArrowRight')
 const context=()=>page.locator('.wv-view').evaluate(n=>Object.fromEntries([...n.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])))
 const bound=await context();assert.equal(bound['data-as-of-time'],'2026-01-01T12:00:00.000Z')
 const relationship=page.getByLabel('Documented relationships',{exact:true});await relationship.locator('summary').first().click()
 await relationship.locator('.wv-relationship-record > summary').first().click()
 await relationship.getByRole('button',{name:'Inspect Target: Synthetic clustering fixture row 2',exact:true}).first().click()
 await page.waitForTimeout(150)
 assert.deepEqual(await context(),bound,'same-endpoint App relationship inspection retains bound recorded instant and range')
 await page.getByRole('button',{name:'Explore World View',exact:true}).click()
 const exploreGeometry=await page.locator('.wv-explore-map').evaluate(surface=>{
  const viewport=surface.querySelector('.wv-map-gl') ?? surface.querySelector('.wv-map')
  const host=surface.querySelector('.wv-map-host') ?? surface.querySelector('.wv-map-svg')
  const native=surface.querySelector('.cesium-widget canvas')
  const chooser=surface.querySelector('.wv-spatial-groups')
  const rect=node=>{const b=node?.getBoundingClientRect();return b?{width:b.width,height:b.height,top:b.top,bottom:b.bottom}:null}
  return {surface:rect(surface),viewport:rect(viewport),host:rect(host),native:rect(native),chooser:rect(chooser)}
 })
 assert.ok(exploreGeometry.host.height>=80,'opened group chooser must not collapse Explore map viewport')
 if(scenario!=='atlas')assert.ok(exploreGeometry.native.height>=80,'native Explore canvas remains usable before hidden/resume')
 assert.ok(exploreGeometry.chooser.bottom<=exploreGeometry.surface.bottom-40,'group chooser retains native attribution floor')
 const exploreChooser=page.locator('.wv-explore-map .wv-spatial-groups')
 if(await exploreChooser.evaluate(details=>details.open)){
  const summary=exploreChooser.locator('summary');await summary.focus();await summary.press('Space')
 }
 assert.equal(await exploreChooser.evaluate(details=>details.open),false,'original chooser summary remains keyboard closable')
 await assertMountedWorldViewExploreStack(page)

 if(scenario!=='atlas'){
  const tabs=page.getByRole('tablist',{name:'Selected record modules',exact:true})
  for(const tab of ['Context','Sources','Evidence'])await tabs.getByRole('tab',{name:tab,exact:true}).click()
  await page.locator('.wv-explore-map').screenshot({path:`${evidenceDir}/selected-reader-${scenario}-${viewport.width}x${viewport.height}.png`})
  await page.getByRole('button',{name:'Open inspector',exact:true}).click()
  assert.ok(await page.locator('.wv-explore-context-body:not([hidden])').count(),'explicit inspector remains reachable after chooser collapse')
  const nativeHeight=await page.locator('.cesium-widget canvas').evaluate(canvas=>canvas.clientHeight)
  assert.ok(nativeHeight>=80,'native map remains usable beside explicit Explore inspector')
 }

 await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
 assert.deepEqual(await context(),bound,'Explore entry/exit preserves canonical/time context')
 const beforeRemount=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 for(const mode of ['Graph','Map']){await modes.getByRole('tab',{name:mode,exact:true}).click();await page.waitForTimeout(300)}
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount===1)
 assert.deepEqual(await context(),bound,'renderer remount preserves selection and recorded time')
 const afterRemount=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 if(scenario!=='atlas')assert.ok(cameraStatesEqual(JSON.parse(beforeRemount),JSON.parse(afterRemount)),'full App map remount preserves camera')
 else assert.equal(afterRemount,null,'Atlas honestly exposes no unsupported native camera')

 assert.deepEqual(errors,[])
 // Existing read-only HEAD count queries are mocked; other non-GETs are aborted.
 const screenshot=`${evidenceDir}/full-app-${scenario}-synthetic-${viewport.width}x${viewport.height}.png`
 await page.screenshot({path:screenshot,fullPage:true})
 receipts.push({candidate,scenario,viewport,native,qualification:'synthetic-full-App-only-no-live-reader-or-provider',renderer:state.rendererKind,inputs:state.layout.stats.inputCount,selectedKey:selected,exploreGeometry,journeys:scenario==='atlas'?['Map/Graph/Split forced native failure→Atlas','Atlas group inspect/member Space choice','bound time/same-endpoint relationship inspection','Explore positive viewport/attribution floor','Atlas remount context/no unsupported camera']:['Map/Graph/Split','native group inspect/member Space choice','selected modules/tether/explicit inspector camera retention','bound time/same-endpoint relationship inspection','Explore positive native viewport/attribution floor/keyboard chooser collapse/reader tabs/explicit inspector','Graph→native Map remount camera/context retention'],errors,nonlocalGETs:requests.filter(r=>r.method==='GET').length,mockedHEADs:requests.filter(r=>r.method==='HEAD'),blockedNonReadMethods:requests.filter(r=>!['GET','HEAD'].includes(r.method)),screenshot})
 await page.close()
}
await writeFile(`${evidenceDir}/full-app-${scenario}-synthetic.json`,JSON.stringify({candidate,receipts},null,2))
}finally{await browser.close()}
