// Controlled cloud full-App listener lifecycle regression, not live source coverage.
// Backend reads are fixtures; injected service counts request routing only.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'
const require=createRequire((process.env.MIP_BROWSER_PACKAGE??'/opt/codex/cua_node')+'/package.json'),{chromium}=require('playwright')
const output=process.env.MIP_HOST_EVIDENCE??'/tmp/mip-host-listener-evidence',base=process.env.MIP_INTEGRATION_BASE??'http://127.0.0.1:4180/media-intelligence-platform-v2/'
await mkdir(output,{recursive:true})
const gitIdentity=ref=>spawnSync('git',['rev-parse',ref],{encoding:'utf8'}).stdout.trim()
const candidate=gitIdentity('HEAD'),tree=gitIdentity('HEAD^{tree}'),sourceBlobs={canvas:gitIdentity('HEAD:src/views/WorldMapCanvas.jsx'),resourceGovernance:gitIdentity('HEAD:src/lib/worldViewResourceGovernance.js')}
const workingTreeClean=spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim()===''
const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(k=>[k,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:'2026-01-01T12:00:00Z',release_effective_at_utc:'2025-12-01T00:00:00Z',precision_class:'city',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
const rows=makeClusteringContractRows(template,'US-local',{count:12}),graph=clusteringGraphContractRows(rows)
const browser=await chromium.launch({headless:true,executablePath:process.env.MIP_BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
const receipt={candidate,tree,sourceBlobs,workingTreeClean,qualification:'controlled-cloud-full-App-test-only-service-injection-and-native-context-loss',sourceAdmissionQualified:false,liveBackendQualified:false,performanceQualification:false,errors:[],requests:[],status:'running'}
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}})
 page.on('pageerror',e=>receipt.errors.push(e.message))
 await page.addInitScript(()=>{
  let requestCalls=0,subscriptions=0,unsubscriptions=0;const entries=[],events=new Set(['pointerdown','pointerup','keydown','keyup','wheel']),names=new Set(['beginInteraction','refreshRequest','wheelInteraction']);
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener=function(type,fn,...rest){if(this instanceof Element&&this.classList.contains('wv-map-host')&&events.has(type)&&names.has(fn?.name)){if(!entries.some(e=>e.host===this&&e.type===type&&e.fn===fn&&e.active))entries.push({host:this,type,fn,active:true})}return add.call(this,type,fn,...rest)};
  EventTarget.prototype.removeEventListener=function(type,fn,...rest){for(const e of entries)if(e.host===this&&e.type===type&&e.fn===fn)e.active=false;return remove.call(this,type,fn,...rest)};
  const original=HTMLCanvasElement.prototype.getContext;let block=false;
  HTMLCanvasElement.prototype.getContext=function(kind,...args){return block&&/webgl/i.test(kind)?null:original.call(this,kind,...args)};
  window.__MIP_HOST_TEST__={services:{sources:[],getRequest(){requestCalls++;return null},subscribeRequestChanges(){subscriptions++;return()=>{unsubscriptions++}}},stats:()=>({requestCalls,subscriptions,unsubscriptions,bindings:entries.map(e=>({type:e.type,active:e.active,connected:e.host.isConnected}))}),currentBindings:host=>entries.filter(e=>e.host===host&&e.active).map(e=>e.type).sort(),block:v=>{block=v}};
 })
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1'){
   if(url.pathname.endsWith('/src/views/WorldView.jsx')){const response=await route.fetch(),body=await response.text(),needle='cameraMemory: cameraMemoryRef.current,';assert.ok(body.includes(needle));return route.fulfill({response,body:body.replace(needle,'realismServices: window.__MIP_HOST_TEST__.services, '+needle)})}
   return route.continue()
  }
  receipt.requests.push({method:req.method(),host:url.hostname,path:url.pathname})
  if(req.method()==='HEAD'&&url.hostname.endsWith('supabase.co'))return route.fulfill({status:200,headers:{'content-range':'*/0','access-control-allow-origin':'*'}})
  if(req.method()==='GET'&&url.hostname.endsWith('supabase.co')){const table=url.pathname.split('/').pop(),body=table==='spatial_projection_v1'?rows:table==='nodes'?graph.nodes:table==='edges'?graph.edges:[];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}})}
  return route.abort()
 })
 await page.goto(base+'?worldViewPrototype=1')
 await page.getByRole('tablist',{name:'Evidence views',exact:true}).getByRole('tab',{name:'World View',exact:true}).click()
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState())
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount===12)
 const panel=page.getByRole('region',{name:'Spatial groups',exact:true});const summary=panel.locator('summary').first();if(!await summary.evaluate(n=>n.parentElement.open))await summary.click()
 await panel.locator('button[data-cluster-id]').first().click()
 await panel.locator('button[data-row-key]').filter({hasText:rows[1].mip_object_id}).first().click()
 await page.waitForFunction(()=>window.__MIP_HOST_TEST__.stats().requestCalls>0)
 const old=await page.locator('.wv-map-host').elementHandle(),types=['keydown','keyup','pointerdown','pointerup','wheel']
 assert.deepEqual(await old.evaluate(host=>window.__MIP_HOST_TEST__.currentBindings(host)),types,'current native host owns exactly one of each source input handler')
 const before=await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())
 // Native public WebGL loss; block subsequent WebGL creation to exercise actual fallback to Atlas.
 receipt.nativeLoss=await page.locator('.cesium-widget canvas').first().evaluate(canvas=>new Promise((resolve,reject)=>{
  const gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_lose_context');if(!ext){resolve({available:false});return}
  const onLost=event=>{clearTimeout(timer);resolve({available:true,trusted:event.isTrusted})};const timer=setTimeout(()=>{canvas.removeEventListener('webglcontextlost',onLost);reject(Error('Native WebGL context loss event did not arrive within 10 seconds'))},10000);canvas.addEventListener('webglcontextlost',onLost,{once:true});window.__MIP_HOST_TEST__.block(true);try{ext.loseContext()}catch(error){clearTimeout(timer);canvas.removeEventListener('webglcontextlost',onLost);reject(error)}
 }))
 assert.equal(receipt.nativeLoss.available,true);assert.equal(receipt.nativeLoss.trusted,true)
 await page.waitForFunction(()=>document.querySelector('[data-map-stack="atlas-fallback"]'),{},{timeout:60000})
 assert.equal(await old.evaluate(host=>host.isConnected),false)
 assert.deepEqual(await old.evaluate(host=>window.__MIP_HOST_TEST__.currentBindings(host)),[],'removed native host releases all source listeners')
 const atlas=await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())
 assert.equal(atlas.subscriptions,before.subscriptions,'Atlas host removal preserves the source session')
 assert.equal(atlas.unsubscriptions,before.unsubscriptions)
 await old.evaluate(host=>{for(const type of ['pointerdown','pointerup','keydown','keyup','wheel'])host.dispatchEvent(new Event(type,{bubbles:true}))})
 assert.equal((await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())).requestCalls,atlas.requestCalls,'detached original cannot route another request')
 // Actual Graph→Map remount, with WebGL restored. This is a new Canvas, not an in-place recovery control.
 await page.evaluate(()=>window.__MIP_HOST_TEST__.block(false))
 const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
 await modes.getByRole('tab',{name:'Graph',exact:true}).click()
 const afterUnmount=await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())
 assert.equal(afterUnmount.bindings.filter(e=>e.active).length,0)
 assert.equal(afterUnmount.subscriptions,afterUnmount.unsubscriptions,'Graph unmount leaves no active service subscription')
 await modes.getByRole('tab',{name:'Map',exact:true}).click()
 await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:60000})
 const nativeRenderer=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getState().rendererKind)
 const fresh=await page.locator('.wv-map-host').elementHandle()
 assert.deepEqual(await fresh.evaluate(host=>window.__MIP_HOST_TEST__.currentBindings(host)),types,'remounted native host owns exactly one of each handler')
 const remount=await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())
 // Dev entrypoint wraps App in React.StrictMode: setup/cleanup/setup replays on remount.
 assert.equal(remount.subscriptions,atlas.subscriptions+2);assert.equal(remount.unsubscriptions,atlas.unsubscriptions+2)
 assert.equal(remount.subscriptions-remount.unsubscriptions,1,'exactly one current service subscription survives StrictMode replay')
 for(const type of ['pointerup','keyup','wheel']){
  const count=(await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())).requestCalls
  await fresh.evaluate((host,type)=>host.dispatchEvent(new Event(type,{bubbles:true})),type)
  assert.ok((await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())).requestCalls>count,'current '+type+' routes source viewport refresh')
 }
 await modes.getByRole('tab',{name:'Graph',exact:true}).click()
 assert.deepEqual(await fresh.evaluate(host=>window.__MIP_HOST_TEST__.currentBindings(host)),[])
 const final=await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())
 assert.equal(final.subscriptions,final.unsubscriptions,'final unmount releases the last service subscription')
 await fresh.evaluate(host=>{for(const type of ['pointerdown','pointerup','keydown','keyup','wheel'])host.dispatchEvent(new Event(type,{bubbles:true}))})
 assert.equal((await page.evaluate(()=>window.__MIP_HOST_TEST__.stats())).requestCalls,final.requestCalls)
 assert.deepEqual(receipt.errors,[])
 receipt.observations={before,atlas,afterUnmount,remount,final};receipt.nativeToAtlasOldHostCleanup=true;receipt.remountedNativeRenderer=nativeRenderer;receipt.atlasToNativeViaAppRemount=true;receipt.atlasToGlobeViaAppRemount=nativeRenderer==='ellipsoid-globe';receipt.sameCanvasAtlasToGlobeQualified=false;receipt.currentInputRouting=true;receipt.finalCleanup=true;receipt.status='passed'
 await page.screenshot({path:output+'/final.png'})
}catch(error){receipt.status='failed';receipt.error=error.stack;throw error}
finally{await browser.close();await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n')}
console.log(JSON.stringify({candidate,status:receipt.status,output}))
