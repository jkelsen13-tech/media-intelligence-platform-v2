import {spawnSync} from 'node:child_process'
import {cameraStatesEqual} from '../src/lib/worldViewCameraState.js'
// Synthetic full-App execution only. No live reader/auth or source qualification.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'
const require=createRequire((process.env.MIP_BROWSER_PACKAGE ?? '/tmp/mip-browser')+'/package.json'),{chromium}=require('playwright')
const output=process.env.MIP_INTEGRATION_EVIDENCE ?? '/workspace/mip-oct02/evidence/lane1-2'
await mkdir(output,{recursive:true})
const base=process.env.MIP_INTEGRATION_BASE ?? 'http://127.0.0.1:4178/media-intelligence-platform-v2/'
const candidate=process.env.MIP_INTEGRATION_CANDIDATE ?? spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
assert.match(candidate,/^[a-f0-9]{40}$/)
const harnessSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')
const scenario=process.env.MIP_INTEGRATION_SCENARIO ?? 'city'
const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(k=>[k,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:'2026-01-01T12:00:00Z',release_effective_at_utc:'2025-12-01T00:00:00Z',precision_class:scenario==='facility'?'facility':'city',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
const faultJourney=process.env.MIP_SOURCE_FAULTS==='1'
const unadmittedPath=process.env.MIP_UNADMITTED_REAL_SOURCE
const unadmittedReceipt=unadmittedPath ? JSON.parse(await readFile(unadmittedPath,'utf8')) : null
if(unadmittedReceipt){
 assert.equal(unadmittedReceipt.applicationAdmitted,false)
 assert.equal(unadmittedReceipt.source.admission.approved,false)
 assert.equal(unadmittedReceipt.source.qualification.bytesVerified,true)
 assert.equal(unadmittedReceipt.source.qualification.pixelsVerified,true)
 assert.equal(faultJourney,false,'failure fixtures and actual unadmitted manifest use separate journeys')
}
const rows=makeClusteringContractRows(template,'US-local',{count:12}),graph=clusteringGraphContractRows(rows)
const browser=await chromium.launch({headless:true,executablePath:process.env.MIP_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
const receipts=[]
let activePage=null
try{
const viewports=process.env.MIP_INTEGRATION_VIEWPORTS ? JSON.parse(process.env.MIP_INTEGRATION_VIEWPORTS) : scenario==='city'?[{width:1280,height:900},{width:390,height:844},{width:844,height:390}]:[{width:1280,height:900}]
assert.ok(Array.isArray(viewports)&&viewports.length>0&&viewports.length<=4&&viewports.every(v=>Number.isInteger(v.width)&&v.width>=320&&v.width<=1920&&Number.isInteger(v.height)&&v.height>=320&&v.height<=1200))
for(const viewport of viewports){
 const page=await browser.newPage({viewport}),errors=[],requests=[]
 activePage=page
 page.on('pageerror',e=>errors.push(e.message))
 if(scenario==='atlas')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args)}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1'){
   if((faultJourney||unadmittedReceipt)&&u.pathname.endsWith('/src/views/WorldView.jsx')){
    const response=await route.fetch(),body=await response.text();assert.ok(body.includes('cameraMemory: cameraMemoryRef.current,'));
    return route.fulfill({response,body:body.replace('cameraMemory: cameraMemoryRef.current,','realismServices: window.__MIP_TEST_BRIDGE__.services, cameraMemory: cameraMemoryRef.current,')})
   }
   if(faultJourney&&u.pathname.endsWith('/src/views/WorldMapCanvas.jsx')){
    const response=await route.fetch(),body=await response.text();const needle='localBudget: createWorldViewLocalResourceBudget(realismServices?.budgetOptions)';assert.ok(body.includes(needle));
    return route.fulfill({response,body:body.replace(needle,'localBudget: window.__MIP_TEST_BRIDGE__.wrapBudget(createWorldViewLocalResourceBudget(realismServices?.budgetOptions))')})
   }
   return route.continue()
  }
  requests.push({method:req.method(),path:u.pathname})
  if(req.method()==='HEAD' && u.hostname.endsWith('supabase.co'))return route.fulfill({status:200,headers:{'content-range':'*/0','access-control-allow-origin':'*'}})
  if(req.method()!=='GET')return route.abort()
  if(u.hostname.endsWith('supabase.co')){
   const table=u.pathname.split('/').pop(),body=table==='spatial_projection_v1'?rows:table==='nodes'?graph.nodes:table==='edges'?graph.edges:[]
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}})
  }
  return route.abort()
 })
 if(unadmittedReceipt)await page.addInitScript(source=>{
  let estimates=0,loads=0,attachments=0
  window.__MIP_TEST_BRIDGE__={services:{sources:[source],
   getRequest:()=>({kind:'imagery',bounds:source.coverage.bounds,level:0}),
   estimateBytes:()=>{estimates++;throw Error('Unadmitted manifest reached resource reservation')},
   transport:{load:async()=>{loads++;throw Error('Unadmitted manifest reached transport')}},
   renderer:{attach:async()=>{attachments++;throw Error('Unadmitted manifest reached renderer')}}},
   stats:()=>({estimates,loads,attachments})}
 },unadmittedReceipt.source)
 if(faultJourney)await page.addInitScript(()=>{
  let mode='ok',callback=null,loads=0,disposals=0,estimates=0,reserves=0,reserveFaults=0,deferred=[],scope={kind:'imagery',bounds:[-81.8,41.1,-81.2,41.8],level:10};
  const source={id:'TEST',kind:'imagery',contentKind:'cartographic',costTier:'cheap',admission:{approved:true,reference:'TEST only'},rights:{reference:'TEST only',commercial:true,publicWeb:true,cache:true,redistribution:true,derivatives:true,analyticalUse:true,attribution:true},attribution:[{text:'TEST only'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'TEST only',assetCrs:'TEST',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},resolutionMeters:1,lod:{min:1,max:15}};
  window.__MIP_TEST_BRIDGE__={services:{sources:[source],estimateBytes:()=>{estimates++;if(mode==='estimate')throw Error('TEST estimator');return 100},getRequest:()=>scope,subscribeRequestChanges:cb=>{callback=cb;return()=>{callback=null}},transport:{load:async()=>{loads++;if(mode==='defer')await new Promise(resolve=>deferred.push(resolve));return{observedBytes:10,dispose(){disposals++}}}},renderer:{attach:async(l,d)=>({observation:{sourceId:d.sourceId,status:'active',rendered:true,successes:1,attributionVisible:true,bounds:d.bounds,level:d.level,ancestry:'direct'},dispose(){}})}},wrapBudget:budget=>({...budget,reserve:value=>{reserves++;if(mode==='reserve'){reserveFaults++;throw Error('TEST reserve')}return budget.reserve(value)}}),mode:v=>{mode=v},scope:v=>{scope=v;callback?.()},refresh:()=>callback?.(),settle:()=>deferred.splice(0).forEach(fn=>fn()),stats:()=>({loads,disposals,estimates,reserves,reserveFaults})}
 })
 await page.goto(base+'?worldViewPrototype=1')
 await page.getByRole('navigation',{name:'Evidence views',exact:true}).getByRole('button',{name:'World View',exact:true}).click()
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
 if(scenario!=='atlas')assert.ok(native.markers.every(marker=>marker.disableDepthTestDistance===0 && marker.heightReference===0))
 if(scenario==='facility')assert.ok(native.markers.some(marker=>marker.width===180&&marker.height===56),'facility legal precision floor permits native scope plaque')
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
 const controls=page.getByRole('navigation',{name:'Explore controls',exact:true})
 for(const name of ['Interact','Options']){
  const button=controls.getByRole('button',{name,exact:true})
  assert.ok(await button.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'collapsed chooser must not intercept '+name)
  await button.click()
  if(name==='Interact')await controls.getByRole('button',{name:'Done — scroll',exact:true}).click()
  else {assert.equal(await button.getAttribute('aria-expanded'),'true');await button.click()}
 }

 if(scenario!=='atlas'){
  const tabs=page.getByRole('tablist',{name:'Selected record modules',exact:true})
  if(!await tabs.count()){
   // Inspector close returns to the compact native plaque. Explicitly pick
   // that same projected marker; opening Explore does not reopen the card.
   await controls.getByRole('button',{name:'Interact',exact:true}).click()
   const nativeState=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState()?.native)
   const marker=nativeState.markers.find(m=>m.key===nativeState.selected?.key) ?? nativeState.markers.find(m=>m.screen)
   assert.ok(marker?.screen,'current native plaque has a projected pick point')
   const canvas=page.locator('.cesium-widget canvas'),box=await canvas.boundingBox()
   await page.mouse.click(box.x+marker.screen.x,box.y+marker.screen.y)
   await tabs.waitFor({state:'visible'})
   await controls.getByRole('button',{name:'Done — scroll',exact:true}).click()
  }
  // A native glyph also has an equivalent keyboard path. The transparent
  // control must leave pointer ownership with Cesium and show keyboard focus.
  const opener=page.getByRole('button',{name:/^Open selected record card:/})
  await page.getByRole('button',{name:'Close selected card',exact:true}).click()
  await page.locator('.wv-explore-map').screenshot({path:`${output}/compact-glyph-${scenario}-${viewport.width}x${viewport.height}.png`})
  await opener.focus()
  await opener.press('Shift+Tab')
  await page.keyboard.press('Tab')
  assert.equal(await opener.evaluate(n=>document.activeElement===n),true,'native equivalent is reachable by sequential keyboard navigation')
  assert.equal(await opener.evaluate(n=>getComputedStyle(n).pointerEvents),'none')
  assert.notEqual(await opener.evaluate(n=>getComputedStyle(n).outlineStyle),'none')
  const beforeKeyboard=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
  await opener.press('Enter')
  await tabs.waitFor({state:'visible'})
  assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),beforeKeyboard,'keyboard expansion preserves camera')
  for(const tab of ['Context','Sources','Evidence'])await tabs.getByRole('tab',{name:tab,exact:true}).click()
  await page.locator('.wv-explore-map').screenshot({path:`${output}/selected-reader-${scenario}-${viewport.width}x${viewport.height}.png`})
  await page.getByRole('button',{name:'Open inspector',exact:true}).click()
  await page.locator('.wv-explore-context-body:not([hidden])').waitFor({state:'visible'})
  assert.ok(await page.locator('.wv-explore-context-body:not([hidden])').count(),'explicit inspector remains reachable after chooser collapse')
  const nativeHeight=await page.locator('.cesium-widget canvas').evaluate(canvas=>canvas.clientHeight)
  assert.ok(nativeHeight>=80,'native map remains usable beside explicit Explore inspector')
 }

 await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
 assert.deepEqual(await context(),bound,'Explore entry/exit preserves canonical/time context')
 if(unadmittedReceipt){
  await page.getByRole('button',{name:'Explore World View',exact:true}).click()
  await page.getByRole('navigation',{name:'Explore controls',exact:true}).getByRole('button',{name:'Interact',exact:true}).click()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.rejected.some(r=>r.reason==='source-not-admitted'))
  const source=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource)
  assert.equal(source.activeSourceId,null)
  assert.equal(source.status,'fallback')
  assert.deepEqual(await page.evaluate(()=>window.__MIP_TEST_BRIDGE__.stats()),{estimates:0,loads:0,attachments:0})
  receipts.push({qualification:'actual received derivative manifest / synthetic full-App controlled journey',sourceAdmissionQualified:false,
   sourceId:unadmittedReceipt.source.id,assetSha256:unadmittedReceipt.source.qualification.sha256,
   deniedBeforeResourceTransportRenderer:true,actualSourceState:source,canonicalContext:await context()})
  await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
  assert.deepEqual(await context(),bound)
 }
 if(faultJourney){
  const local=()=>page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource)
  // Canonical member selection above supplies the production selection to the injected viewport bridge.
  await page.getByRole('button',{name:'Explore World View',exact:true}).click()
  await page.getByRole('navigation',{name:'Explore controls',exact:true}).getByRole('button',{name:'Interact',exact:true}).click()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.activeSourceId==='TEST')
  const initial=await local();assert.equal(initial.status,'active');assert.equal(initial.observedLayer.status,'ACTIVE')
  for(const mode of ['estimate','reserve']){
   const beforeFault=await page.evaluate(()=>window.__MIP_TEST_BRIDGE__.stats())
   await page.evaluate(mode=>{window.__MIP_TEST_BRIDGE__.mode(mode);window.__MIP_TEST_BRIDGE__.scope({kind:'imagery',bounds:mode==='estimate'?[-81.7,41.2,-81.3,41.7]:[-81.65,41.25,-81.35,41.65],level:10})},mode)
   await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.reason==='local-admission-failed')
   const afterFault=await page.evaluate(()=>window.__MIP_TEST_BRIDGE__.stats());assert.equal(afterFault.estimates,beforeFault.estimates+1);if(mode==='reserve')assert.equal(afterFault.reserveFaults,beforeFault.reserveFaults+1)
   assert.equal((await local()).activeSourceId,'TEST','covering old handle survives '+mode+' failure')
  }
  await page.evaluate(()=>window.__MIP_TEST_BRIDGE__.scope({kind:'imagery',bounds:[-81.1,41.1,-81.01,41.8],level:10}))
  assert.equal((await local()).activeSourceId,null,'full App stale loaded coverage detached before failed reservation')
  await page.evaluate(()=>{window.__MIP_TEST_BRIDGE__.mode('defer');window.__MIP_TEST_BRIDGE__.refresh()})
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.status==='loading')
  const pending=await local(),beforeLoads=await page.evaluate(()=>window.__MIP_TEST_BRIDGE__.stats().loads)
  await page.evaluate(()=>{window.__MIP_TEST_BRIDGE__.refresh();window.__MIP_TEST_BRIDGE__.refresh()})
  assert.equal(await page.evaluate(()=>window.__MIP_TEST_BRIDGE__.stats().loads),beforeLoads)
  assert.equal((await local()).localBudget.requests,pending.localBudget.requests)
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.__MIP_TEST_BRIDGE__.settle()})
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.localBudget.pendingRequests===0)
  assert.equal((await local()).activeSourceId,null)
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
  await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
  receipts.push({qualification:'synthetic-full-App-with-test-only-intercepted-module-and-bridge',sourceAdmissionQualified:false,initialRequests:initial.localBudget.requests,throwingEstimator:true,throwingReserve:true,coveringHandlePreserved:true,staleCoverageDetached:true,duplicateLoadingNoReservation:true,hiddenLateSettlement:true,pageErrors:errors})
 }
 const beforeRemount=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 for(const mode of ['Graph','Map']){await modes.getByRole('tab',{name:mode,exact:true}).click();await page.waitForTimeout(300)}
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount===1)
 assert.deepEqual(await context(),bound,'renderer remount preserves selection and recorded time')
 const afterRemount=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
 if(scenario!=='atlas')assert.ok(cameraStatesEqual(JSON.parse(beforeRemount),JSON.parse(afterRemount)),'full App map remount preserves camera')
 else assert.equal(afterRemount,null,'Atlas honestly exposes no unsupported native camera')

 assert.deepEqual(errors,[])
 // Existing read-only HEAD count queries are mocked; other non-GETs are aborted.
 const screenshot=`${output}/full-app-${scenario}-synthetic-${viewport.width}x${viewport.height}.png`
 await page.screenshot({path:screenshot,fullPage:true})
 receipts.push({candidate,scenario,viewport,native,qualification:'synthetic-full-App-only-no-live-reader-or-provider',renderer:state.rendererKind,inputs:state.layout.stats.inputCount,selectedKey:selected,exploreGeometry,journeys:scenario==='atlas'?['Map/Graph/Split forced native failure→Atlas','Atlas group inspect/member Space choice','bound time/same-endpoint relationship inspection','Explore positive viewport/attribution floor','Atlas remount context/no unsupported camera']:['Map/Graph/Split','native group inspect/member Space choice','selected modules/tether/explicit inspector camera retention','bound time/same-endpoint relationship inspection','Explore positive native viewport/attribution floor/keyboard chooser collapse/reader tabs/explicit inspector','Graph→native Map remount camera/context retention'],errors,nonlocalGETs:requests.filter(r=>r.method==='GET').length,mockedHEADs:requests.filter(r=>r.method==='HEAD'),blockedNonReadMethods:requests.filter(r=>!['GET','HEAD'].includes(r.method)),screenshot})
 await page.close()
}
await writeFile(`${output}/full-app-${scenario}-synthetic.json`,JSON.stringify({candidate,harnessSha256,status:'PASS',receipts},null,2))
}catch(error){
 await writeFile(`${output}/full-app-${scenario}-synthetic-partial.json`,JSON.stringify({candidate,harnessSha256,status:'FAILED_INCOMPLETE',completedReceipts:receipts,error:error.message},null,2))
 if(activePage){
  try{await activePage.screenshot({path:output+'/failure.png',fullPage:true})}catch{}
  try{await writeFile(output+'/failure-state.json',JSON.stringify(await activePage.evaluate(()=>({text:document.body.innerText,native:window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getBillboardState?.(),context:document.querySelector('.wv-view')?.outerHTML?.slice(0,3000)})),null,2))}catch{}
 }
 throw error
}finally{await browser.close()}
