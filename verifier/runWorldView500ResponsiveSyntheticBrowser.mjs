import {spawnSync} from 'node:child_process'
// Bounded 500px responsive qualification of the actual App.
// Inherits the selected-reader fixture/intercepts; all external reads synthetic.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'
const require=createRequire((process.env.MIP_BROWSER_PACKAGE ?? '/tmp/mip-browser')+'/package.json'),{chromium}=require('playwright')
const output=process.env.MIP_INTEGRATION_EVIDENCE ?? '/tmp/mip-500-responsive'
await mkdir(output,{recursive:true})
const base=process.env.MIP_INTEGRATION_BASE ?? 'http://127.0.0.1:4178/media-intelligence-platform-v2/'
const touchTaps=process.env.MIP_500_TOUCH_TAPS==='1'
const candidate=process.env.MIP_INTEGRATION_CANDIDATE ?? spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
assert.match(candidate,/^[a-f0-9]{40}$/)
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const harnessSha256=sha(await readFile(new URL(import.meta.url)))
const provenance={inheritedHarnessSha256:sha(await readFile(new URL('./runWorldViewSelectedCardScrollSyntheticBrowser.mjs',import.meta.url))),fixtureSha256:sha(await readFile(new URL('./worldViewProjectionFixture.mjs',import.meta.url))),productCssSha256:sha(await readFile(new URL('../src/styles/world-view-explore.css',import.meta.url))),workingTreeStatus:spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim()}
const scenario='city' // This changed-scope harness qualifies native city reader allocation only.
const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(k=>[k,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:'2026-01-01T12:00:00Z',release_effective_at_utc:'2025-12-01T00:00:00Z',precision_class:scenario==='facility'?'facility':'city',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
const rows=makeClusteringContractRows(template,'US-local',{count:12}),graph=clusteringGraphContractRows(rows)
const browser=await chromium.launch({headless:true,executablePath:process.env.MIP_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
const receipts=[]; const measurements=[]; const tree=spawnSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).stdout.trim();
let activePage=null
try{
const viewports=process.env.MIP_INTEGRATION_VIEWPORTS ? JSON.parse(process.env.MIP_INTEGRATION_VIEWPORTS) : [{width:640,height:360},{width:640,height:360,coarse:true},{width:690,height:360,coarse:true},{width:590,height:360,coarse:true},{width:390,height:844},{width:844,height:390}]
assert.ok(Array.isArray(viewports)&&viewports.length>0&&viewports.length<=8&&viewports.every(v=>Number.isInteger(v.width)&&v.width>=320&&v.width<=1920&&Number.isInteger(v.height)&&v.height>=320&&v.height<=1200))
for(const viewport of viewports){
 const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},hasTouch:viewport.coarse===true}),errors=[],requests=[]
 activePage=page
 page.on('pageerror',e=>errors.push(e.message))
 if(scenario==='atlas')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args)}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1'){
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


 const tabs=page.getByRole('tablist',{name:'Selected record modules',exact:true})
 const read=()=>page.evaluate(()=>{
  const card=document.querySelector('.wv-billboard-card'),rect=n=>{const b=n?.getBoundingClientRect();return b?{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}:null}
  const fixed=document.querySelector('.wv-explore-surface'),fixedAncestors=[]
  for(let a=fixed?.parentElement;a;a=a.parentElement){const st=getComputedStyle(a);fixedAncestors.push({tag:a.tagName,classes:a.className,transform:st.transform,filter:st.filter,perspective:st.perspective,contain:st.contain,willChange:st.willChange,contentVisibility:st.contentVisibility,containerType:st.containerType})}
  const viewportBound=getComputedStyle(fixed).position==='fixed'&&fixedAncestors.every(st=>st.transform==='none'&&st.filter==='none'&&st.perspective==='none'&&st.contain==='none'&&st.willChange==='auto'&&st.contentVisibility==='visible'&&st.containerType==='normal')
  const geometry=n=>{
   if(!n)return null
   const b=rect(n);let visible={left:Math.max(0,b.x),top:Math.max(0,b.y),right:Math.min(innerWidth,b.right),bottom:Math.min(innerHeight,b.bottom)}
   for(let p=n.parentElement;p;p=p.parentElement){const st=getComputedStyle(p),r=rect(p);if(['hidden','clip','auto','scroll'].includes(st.overflowX)){visible.left=Math.max(visible.left,r.x);visible.right=Math.min(visible.right,r.right)}if(['hidden','clip','auto','scroll'].includes(st.overflowY)){visible.top=Math.max(visible.top,r.y);visible.bottom=Math.min(visible.bottom,r.bottom)}if(p===fixed&&viewportBound)break}
   return {rect:b,visible,full:visible.left<=b.x&&visible.top<=b.y&&visible.right>=b.right&&visible.bottom>=b.bottom,hit:n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,computed:{overflow:getComputedStyle(n).overflow,lineHeight:getComputedStyle(n).lineHeight,outline:getComputedStyle(n).outline,transformOrigin:getComputedStyle(n).transformOrigin}}
  }
  return {fixedSurface:{rect:rect(fixed),viewportBound,ancestors:fixedAncestors},coarse:matchMedia('(pointer:coarse)').matches,active:{ariaLabel:document.activeElement.getAttribute('aria-label'),role:document.activeElement.getAttribute('role'),text:document.activeElement.textContent?.slice(0,60)},card:geometry(card),header:geometry(card?.querySelector('header')),title:geometry(card?.querySelector('h3')),precision:geometry(card?.querySelector('.wv-billboard-eyebrow')),scope:geometry(card?.querySelector('.wv-billboard-scope-cue')),status:geometry(card?.querySelector('.wv-billboard-stem-cue')),occlusion:geometry(card?.querySelector('.wv-billboard-occlusion-cue')),close:geometry(card?.querySelector('[aria-label="Close selected card"]')),body:geometry(card?.querySelector('.wv-billboard-module-body')),inspector:geometry(card?.querySelector('.wv-billboard-inspect')),page:geometry(document.querySelector('.wv-explore-page-strip')),toolbarHeading:geometry(document.querySelector('.wv-explore-toolbar h3')),toolbarButtons:[...document.querySelectorAll('.wv-explore-toolbar button')].map(n=>({text:n.textContent,...geometry(n)})),contextBody:geometry(document.querySelector('.wv-explore-context-body')),options:geometry(document.querySelector('.wv-explore-options')),source:{...geometry(document.querySelector('.wv-explore-source')),text:document.querySelector('.wv-explore-source').textContent},gestureButtons:[...document.querySelectorAll('.wv-explore-actions button')].map(n=>({text:n.textContent,...geometry(n)})),tetherAnchor:card?{x:Number(document.querySelector('.wv-billboard-tether-anchor')?.getAttribute('cx')),y:Number(document.querySelector('.wv-billboard-tether-anchor')?.getAttribute('cy'))}:null,entranceOrigin:card?.style.transformOrigin,declaredCard:card?{x:parseFloat(card.style.left),y:parseFloat(card.style.top),width:parseFloat(card.style.width),height:parseFloat(card.style.maxHeight)}:null,credits:geometry(document.querySelector('[data-world-credits]')),map:rect(document.querySelector('.wv-explore-map')),canvas:rect(document.querySelector('.cesium-widget canvas')),native:window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState()?.native}
 })
 const capture=async(label)=>{const value=await read(),path=output+'/'+viewport.width+'x'+viewport.height+'-'+(viewport.coarse?'coarse':'fine')+'-'+label+'.png';await page.screenshot({path,fullPage:false});measurements.push({label,viewport,path,...value});return value}
 const assertPaint=(value,label)=>{
  assert.equal(value.fixedSurface.viewportBound,true,label+' fixed Explore escapes upstream overflow; no ancestor containing-block properties')
  for(const key of ['precision','scope','status','title','close','inspector'])assert.equal(value[key]?.full,true,label+' '+key+' fully painted')
  if(value.occlusion)assert.equal(value.occlusion.full,true,label+' canonical occlusion fully painted')
  assert.equal(value.card.scrollTop,0,label+' outer card never scrolls')
  assert.ok(value.body.clientHeight>=parseFloat(value.body.computed.lineHeight),label+' module body owns at least one visible text line')
  assert.equal(value.body.computed.overflow,'auto');assert.equal(value.close.hit,true);assert.equal(value.inspector.hit,true)
  assert.deepEqual(value.tetherAnchor,value.native.selected.anchor,label+' immutable canonical projected tether');
  const intersects=(a,b)=>Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y);
  assert.ok(!intersects(value.card.rect,value.page.rect),label+' Page target clear of card');
  assert.ok(value.gestureButtons.every(n=>!intersects(value.card.rect,n.rect)),label+' complete gesture targets clear of card');
  for(const control of value.toolbarButtons){assert.equal(control.full,true,label+' toolbar '+control.text+' fully painted');assert.equal(control.hit,true,label+' toolbar '+control.text+' hit');assert.ok(!intersects(control.rect,value.page.rect),label+' Page clear of complete toolbar '+control.text+' target');if(viewport.coarse&&viewport.width<768)assert.ok(control.rect.height>=44,label+' toolbar target >=44px')}
  for(let i=0;i<value.toolbarButtons.length;i++)for(let j=i+1;j<value.toolbarButtons.length;j++)assert.ok(!intersects(value.toolbarButtons[i].rect,value.toolbarButtons[j].rect),label+' toolbar targets do not overlap');
  if(viewport.width<590&&viewport.height<480&&viewport.width>viewport.height){assert.equal(value.toolbarHeading.full,true);assert.ok(!intersects(value.toolbarHeading.rect,value.page.rect),label+' Page clear of heading');assert.ok(value.page.rect.width>=44&&value.page.rect.height>=44);assert.ok(value.gestureButtons.every(n=>n.rect.width>=44&&n.rect.height>=44),label+' rail targets >=44px')}
  assert.equal(value.page.hit,true,label+' Page target hit');assert.ok(value.gestureButtons.every(n=>n.hit),label+' gesture target hits')
  if(viewport.coarse){assert.equal(value.close.rect.height,44);assert.equal(value.inspector.rect.height,44)}
  const n=value.native.selected;assert.ok(n,'native selected envelope remains bound')
  assert.deepEqual(n.canonicalCoordinates,rows[1].display_geometry.coordinates);assert.ok(value.card.rect.bottom<=value.canvas.bottom-44+0.1,'native attribution floor retained')
 }
 const openNative=async()=>{
  if(await controls.getByRole('button',{name:'Interact',exact:true}).count())await controls.getByRole('button',{name:'Interact',exact:true}).click()
  const n=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState()?.native),m=n.markers.find(m=>m.key===n.selected?.key),b=await page.locator('.cesium-widget canvas').boundingBox()
  assert.ok(m?.screen&&m.key===n.selected?.key,'selected admitted native marker retains its projected pick pixel')
  if(touchTaps&&viewport.coarse)await page.touchscreen.tap(b.x+m.screen.x,b.y+m.screen.y)
  else await page.mouse.click(b.x+m.screen.x,b.y+m.screen.y)
  await tabs.waitFor({state:'visible'})
  const entrance=await read();await page.waitForTimeout(450);return entrance
 }
 const modeReceipts=[]
 const directions=(process.env.MIP_CARD_DIRECTIONS??'immersive,dock').split(',');assert.ok(directions.length&&directions.every(v=>['immersive','dock'].includes(v)))
 for(const [name,button] of [['immersive',/A · Immersive/],['dock',/B · Split dock/]].filter(([name])=>directions.includes(name))){
  if(await tabs.count())await page.getByRole('button',{name:'Close selected card',exact:true}).click()
  await page.getByRole('button',{name:button}).click();await page.waitForTimeout(450)
  const entrance=await openNative(),entry=await capture(name+'-selected')
  assertPaint(entry,name+' selected')
  const camera=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
  const e=await tabs.getByRole('tab',{name:'Evidence',exact:true}).boundingBox();await page.mouse.click(e.x+e.width/2,e.y+e.height/2)
  for(const key of ['ArrowRight','ArrowRight','ArrowRight','Tab'])await page.keyboard.press(key)
  assert.equal((await read()).active.role,'tabpanel','ordinary Tab reaches the body')
  await page.keyboard.press('End');await page.waitForTimeout(250);const scrolled=await read()
  assert.ok(scrolled.body.scrollTop>0,'ordinary End scrolls module body')
  await page.keyboard.press('Tab');const focused=await capture(name+'-ordinary-Tab-Inspector')
  assert.equal(focused.active.text,'Open inspector');assertPaint(focused,name+' Inspector focus')
  await page.waitForTimeout(350);const idle=await capture(name+'-Inspector-focus-idle');assertPaint(idle,name+' persistent focus')
  assert.equal(idle.active.text,'Open inspector')
  for(let i=0;i<3;i++)await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('button',{name:'Close selected card',exact:true}).evaluate(n=>document.activeElement===n),true)
  const keyboardClose=await capture(name+'-keyboard-Close');assert.equal(keyboardClose.close.computed.outline.includes('solid'),true)
  await page.keyboard.press('Enter');await tabs.waitFor({state:'hidden'})
  const reopenedEntrance=await openNative(),reopened=await capture(name+'-native-reopened');assertPaint(reopened,name+' reopen')
  const close=reopened.close.rect
  if(touchTaps&&viewport.coarse)await page.touchscreen.tap(close.x+close.width/2,close.y+close.height/2)
  else await page.mouse.click(close.x+close.width/2,close.y+close.height/2)
  await tabs.waitFor({state:'hidden'})
  const pointerClosed=await capture(name+'-pointer-closed')
  await controls.getByRole('button',{name:'Done — scroll',exact:true}).click();assert.equal(await controls.getByRole('button',{name:'Interact',exact:true}).count(),1,'Done releases gesture ownership');
  await controls.getByRole('button',{name:'Options',exact:true}).click();const options=page.locator('.wv-explore-options');await options.waitFor({state:'visible'});const optionGeometry=await capture(name+'-options');assert.equal(optionGeometry.options.full,true,'Options fully painted in owned Surface');assert.ok(optionGeometry.options.clientHeight>=44);assert.equal(optionGeometry.options.computed.overflow,'auto');await controls.getByRole('button',{name:'Options',exact:true}).click();
  assert.deepEqual(await context(),bound);assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),camera,'selection/Tab/Close never changes camera')
  // Explicit Inspector still changes context ownership, followed by a real
  // Explore remount; preserve the canonical record and recorded time.
  await openNative();await page.getByRole('button',{name:'Open inspector',exact:true}).click();await tabs.waitFor({state:'hidden'});const inspectorContext=await capture(name+'-explicit-Inspector-context');assert.ok(inspectorContext.contextBody.clientHeight>=16,'explicit Inspector visibly owns a scroll body');assert.equal(inspectorContext.contextBody.computed.overflow,'auto');assert.equal(await controls.getByRole('button',{name:'Interact',exact:true}).count(),1,'Inspector releases gesture ownership')
  await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
  assert.deepEqual(await context(),bound)
  assert.equal(await page.locator('.wv-explore-source').evaluate(n=>n.hasAttribute('tabindex')),false,'inactive hidden source footer adds no tab stop');assert.equal(await page.evaluate(()=>document.body.style.overflow==='hidden'||document.documentElement.style.overflow==='hidden'),false,'exit releases document scroll lock');assert.equal(await page.getByRole('button',{name:'Explore World View',exact:true}).evaluate(n=>document.activeElement===n),true,'exit restores entry focus');
  await page.getByRole('button',{name:'Explore World View',exact:true}).click();await page.waitForTimeout(300)
  assert.deepEqual(await context(),bound)
  const sourceCamera=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState());
  const pageExit=page.getByRole('button',{name:'Return to page and resume scrolling',exact:true});await pageExit.focus();await page.keyboard.press('Shift+Tab');const sourceFooter=page.getByRole('region',{name:'Active sources and attribution',exact:true});assert.equal(await sourceFooter.evaluate(n=>document.activeElement===n),true,'ordinary ShiftTab from Page reaches named source scroll surface');await page.keyboard.press('End');await page.waitForTimeout(250);const sourceRead=await capture(name+'-source-keyboard-End');assert.equal(sourceRead.source.full,true);if(sourceRead.source.scrollHeight>sourceRead.source.clientHeight)assert.ok(sourceRead.source.scrollTop>0,'source text beyond short viewport remains keyboard reachable');assert.ok(sourceRead.source.text.includes('Open Government Licence'));assert.ok(sourceRead.source.computed.outline.includes('solid'),'source region has visible keyboard focus');await page.keyboard.press('Home');await page.waitForTimeout(250);await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);const arrowSource=await capture(name+'-source-keyboard-ArrowDown');if(sourceRead.source.scrollHeight>sourceRead.source.clientHeight)assert.ok(arrowSource.source.scrollTop>0,'source ArrowDown scrolls owned viewport');await page.keyboard.press('Home');await page.waitForTimeout(250);const sb=await sourceFooter.boundingBox();await page.mouse.move(sb.x+sb.width/2,sb.y+sb.height/2);await page.mouse.wheel(0,400);await page.waitForTimeout(250);if(sourceRead.source.scrollHeight>sourceRead.source.clientHeight)assert.ok((await read()).source.scrollTop>0,'source text remains pointer-scroll reachable');
  if(touchTaps&&viewport.coarse&&sourceRead.source.scrollHeight>sourceRead.source.clientHeight){await sourceFooter.focus();await page.keyboard.press('Home');await page.waitForTimeout(250);const cdp=await page.context().newCDPSession(page),point={x:sb.x+sb.width/2,y:sb.y+sb.height-8,radiusX:1,radiusY:1,force:1};try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});for(let step=1;step<=8;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-step*(sb.height-16)/8}]});await page.waitForTimeout(20)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);const touchSource=await capture(name+'-source-touch-scroll');assert.ok(touchSource.source.scrollTop>0,'real Chromium touch pan scrolls only source region');assert.equal(touchSource.source.full,true)}finally{await cdp.detach()}}
  assert.deepEqual(await context(),bound,'source scroll retains canonical selection/time');assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),sourceCamera,'source keyboard/pointer/touch scrolling retains camera');
  modeReceipts.push({name,entrance,entry,scrolled,focused,idle,keyboardClose,reopenedEntrance,reopened,pointerClosed})
 }
 assert.deepEqual(errors,[])
 receipts.push({viewport,status:'PASS',renderContext:'headless Chromium SwiftShader native ellipsoid fallback; controlled synthetic records, no physical-device/live qualification',modeReceipts,errors,nonlocalGETs:requests.filter(r=>r.method==='GET').length,mockedHEADs:requests.filter(r=>r.method==='HEAD'),blockedNonReadMethods:requests.filter(r=>!['GET','HEAD'].includes(r.method))})
 console.log(JSON.stringify({viewport,status:'PASS'}))
 await page.close()
}
 await writeFile(output+'/500-responsive-full-app.json',JSON.stringify({candidate,tree,harnessSha256,provenance,touchTaps,runtime:process.version,status:'PASS',qualification:'controlled full-App actual native centered pointer/touch and ordinary keyboard selected-reader flow; full viewport screenshots only',receipts,measurements},null,2)+'\n')
}catch(e){
 await writeFile(output+'/500-responsive-partial.json',JSON.stringify({candidate,tree,harnessSha256,provenance,status:'FAILED_INCOMPLETE',error:e.message,receipts,measurements},null,2)+'\n')
 if(activePage)await activePage.screenshot({path:output+'/failure.png',fullPage:false});throw e
}finally{await browser.close()}
