// One local actual-App remount journey. Preparation never launches a browser.
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'

export const BASE_HEAD='0ebf51d80179130c2b05041663c02777c427fcf4'
export const BASE_TREE='aa2b71604f4fd782316b27bc340c88763db4eaad'
export const AUTHORITY='SIMULATED_TEST_AUTHORITY_ONLY'
export const DESCRIPTOR_SHA='21ea5338c49d6b2ae127c420ead3920d260dece13ea09f0fed9889db34aa1e15'
export const PRODUCTION_FILES=['src/App.jsx','src/views/WorldView.jsx','src/views/WorldMapCanvas.jsx','src/lib/worldViewRealismController.js','src/lib/worldViewRendererAdapter.js','src/lib/worldViewCesiumEllipsoidRendererAdapter.js','src/lib/worldViewSourceStatus.js','src/lib/worldViewBoundedRgbImagery.js']
const here=dirname(fileURLToPath(import.meta.url))
const sha=body=>createHash('sha256').update(body).digest('hex')
const git=(args,cwd)=>{const result=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim()}
export function loopbackBase(value){
  assert.ok(value,'explicit loopback base required')
  const base=new URL(value)
  assert.equal(base.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname))
  assert.equal(base.username,'');assert.equal(base.password,'');assert.equal(base.search,'');assert.equal(base.hash,'')
  assert.equal(base.pathname,'/media-intelligence-platform-v2/');return base
}
export function frozenIdentity({head,tree,dirty},{expectedHead,expectedTree}){
  assert.match(expectedHead??'',/^[a-f0-9]{40}$/,'parent-frozen exact head required')
  assert.match(expectedTree??'',/^[a-f0-9]{40}$/,'parent-frozen exact tree required')
  assert.equal(dirty,false,'browser execution requires clean committed source')
  assert.equal(head,expectedHead);assert.equal(tree,expectedTree)
}
export function fixtureRows(){
  const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(key=>[key,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:'2026-01-01T12:00:00Z',release_effective_at_utc:'2025-12-01T00:00:00Z',precision_class:'facility',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
  return makeClusteringContractRows(template,'US-local',{count:12}).map(row=>({...row,display_geometry:{type:'Point',coordinates:[row.display_geometry.coordinates[0]+0.05,row.display_geometry.coordinates[1]]}}))
}
export function injectTransport(body,basePath){
  const seam='cameraMemory: cameraMemoryRef.current,'
  assert.equal(body.split(seam).length,2,'exact existing transformed Canvas seam required')
  assert.equal(basePath,'/media-intelligence-platform-v2/')
  const setup=`\nimport {createWorldViewBoundedRgbTransport as createTestTransport} from '${basePath}src/lib/worldViewBoundedRgbImagery.js';
const bridge=window.__MIP_RGB_TEST__;
const transport=createTestTransport({packets:[bridge.packet],origin:location.origin,decodeImageBitmap:async(blob,options)=>{
const image=await createImageBitmap(blob,options);bridge.images.push(image);const canvas=new OffscreenCanvas(image.width,image.height);const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
const rgba=context.getImageData(0,0,image.width,image.height).data;const rgb=new Uint8Array(image.width*image.height*3);let alphaOpaque=true;for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];alphaOpaque&&=rgba[i+3]===255;}
const rgbSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgb)),byte=>byte.toString(16).padStart(2,'0')).join('');bridge.decodeWitness.push({width:image.width,height:image.height,rgbSha256,alphaOpaque});return image;
},onEvent:event=>{bridge.events.push(event);if(bridge.events.length>128)bridge.events.shift();if(event.type==='fetch-start'){const state=window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot();bridge.reservations.push({tileKey:event.tileKey,localBudget:state?.localSourceResource?.localBudget??null,observedBeforeFetch:true});}}});
bridge.services.transport=transport;bridge.services.estimateBytes=descriptor=>transport.estimateBytes(descriptor);\n`
  return setup+body.replace(seam,'realismServices: window.__MIP_RGB_TEST__.services, '+seam)
}
export async function prepareInputs(repoRoot=process.cwd()){
  const referenceBody=await readFile(resolve(here,'payload-reference.json')),reference=JSON.parse(referenceBody)
  const originalPath='/workspace/mip-real-imagery-evidence/existing-admission-gate.json'
  const descriptorBody=await readFile(originalPath),descriptor=JSON.parse(descriptorBody)
  assert.equal(sha(descriptorBody),DESCRIPTOR_SHA);assert.equal(descriptor.applicationAdmitted,false);assert.equal(descriptor.source.admission.approved,false)
  assert.equal(reference.package.sha256,'ebc0599832575409a56088af66c6d284993c69871331252291d1d743af5d862c')
  const runtimeZipBody=await readFile('/workspace/mip-real-imagery-evidence/ohio-BN18756325-wgs84-research.zip')
  assert.equal(sha(runtimeZipBody),reference.package.sha256);assert.equal(runtimeZipBody.length,reference.package.bytes)
  assert.equal(reference.tiles.length,4)
  const tileBodies=new Map()
  for(const tile of reference.tiles){
    const body=await readFile('/workspace/mip-real-imagery-evidence/planar-inspection/'+tile.name)
    assert.equal(sha(body),tile.sha256);assert.equal(body.length,tile.byteLength)
    assert.deepEqual([...body.subarray(0,8)],[137,80,78,71,13,10,26,10])
    assert.equal(body.readUInt32BE(16),512);assert.equal(body.readUInt32BE(20),512)
    assert.equal(body[24],8);assert.equal(body[25],2);tileBodies.set(tile.name,body)
  }
  const current={head:git(['rev-parse','HEAD'],repoRoot),tree:git(['rev-parse','HEAD^{tree}'],repoRoot),dirty:git(['status','--porcelain'],repoRoot)!==''}
  assert.equal(git(['merge-base',BASE_HEAD,current.head],repoRoot),BASE_HEAD,'base source ancestor required')
  const sourceFileHashes={}
  for(const name of PRODUCTION_FILES){
    const body=await readFile(resolve(repoRoot,name));const baseline=spawnSync('git',['show',BASE_HEAD+':'+name],{cwd:repoRoot,maxBuffer:8*1024*1024})
    assert.equal(baseline.status,0);assert.deepEqual(body,baseline.stdout,'product source must remain byte-identical: '+name);sourceFileHashes[name]=sha(body)
  }
  await access('/usr/bin/chromium')
  const require=createRequire('/opt/codex/cua_node/lib/node_modules/package.json');const {chromium}=require('playwright')
  assert.equal(typeof chromium.launch,'function')
  return {reference,referenceBody,descriptorBody,originalPath,tileBodies,runtimeZipBody,current,sourceFileHashes,chromium}
}

async function run(){
  const inputs=await prepareInputs(),{reference,referenceBody,descriptorBody,originalPath,tileBodies,runtimeZipBody,current,sourceFileHashes,chromium}=inputs
  if(process.argv.includes('--validate-only')){
    console.log(JSON.stringify({status:'PASS_PREPARATION_INPUTS_ONLY',browserLaunched:false,baseHead:BASE_HEAD,baseTree:BASE_TREE,current,sourceFileHashes,rawTileBytes:[...tileBodies.values()].reduce((sum,body)=>sum+body.length,0),rawTileHashes:Object.fromEntries([...tileBodies].map(([name,body])=>[name,sha(body)])),descriptorSha256:sha(descriptorBody),runtime:{node:process.version},executionRequiresParentFreeze:true}));return
  }
  frozenIdentity(current,{expectedHead:process.env.MIP_IMAGERY_REMOUNT_EXPECTED_HEAD,expectedTree:process.env.MIP_IMAGERY_REMOUNT_EXPECTED_TREE})
  const base=loopbackBase(process.env.MIP_IMAGERY_REMOUNT_BASE)
  const output=resolve(process.env.MIP_IMAGERY_REMOUNT_OUTPUT??'')
  assert.ok(output.startsWith('/workspace/mip-oct04-launch-readiness/imagery-remount/'),'explicit new external evidence directory required')
  await mkdir(output) // Refuse an existing evidence directory; preserve all prior runs.
  await mkdir(resolve(output,'source-bodies'))
  await writeFile(resolve(output,'payload-reference.json'),referenceBody,{flag:'wx'})
  await writeFile(resolve(output,'source-bodies/unapproved-descriptor.json'),descriptorBody,{flag:'wx'})
  await writeFile(resolve(output,'source-bodies/wgs84-research.zip'),runtimeZipBody,{flag:'wx'})
  for(const [name,body]of tileBodies)await writeFile(resolve(output,'source-bodies',name),body,{flag:'wx'})
  const source={id:AUTHORITY+'::OHIO_RGB::REMOUNT_20261004::'+current.head.slice(0,8),kind:'imagery',contentKind:'photographic',costTier:'cheap',
    admission:{approved:true,reference:'SIMULATED TEST authority only; genuine source is UNAPPROVED'},rights:{reference:'SIMULATED TEST permissions only',commercial:true,publicWeb:true,cache:true,redistribution:true,derivatives:true,analyticalUse:true,attribution:true},attribution:[{text:'SIMULATED TEST authority · Cuyahoga County / Ohio OSIP · planning-only, noncadastral'}],
    qualification:{bytesVerified:true,sha256:reference.package.sha256,reference:'SIMULATED authority; preserved genuine received derivative hashes',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},coverage:reference.coverage,capture:{...reference.capture,verified:true},resolutionMeters:0.38,lod:{min:0,max:0}}
  const packet={sourceId:source.id,registeredAssetSha256:reference.package.sha256,runtimeProvenanceSha256:reference.runtimeProvenance.sha256,sourceMetadataXmlSha256:reference.sourceMetadataXml.sha256,capture:reference.capture,coverage:reference.coverage,permissionGrant:false,localResourceEstimate:reference.resource.conservativeReservationBytes,tiles:reference.tiles.map(tile=>({...tile,key:tile.name,route:'/mip-native-rgb-test/'+tile.name}))}
  const rows=fixtureRows(),graph=clusteringGraphContractRows(rows)
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block'})
  const gets=[],network=[],errors=[],frames=[],stages={},moduleInjections=[];let failure=null
  page.on('pageerror',error=>errors.push(error.message))
  const stats=()=>page.evaluate(()=>window.__MIP_RGB_TEST__.stats())
  const snapshot=()=>page.evaluate(()=>{
    const root=document.querySelector('.wv-view[data-investigation-context]'),canvas=document.querySelector('.wv-map-host canvas'),rect=canvas?.getBoundingClientRect()
    return {usage:window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot()??null,camera:window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState()??null,
      context:Object.fromEntries([...root?.attributes??[]].filter(attribute=>attribute.name.startsWith('data-')&&attribute.name!=='data-wv-mode').map(attribute=>[attribute.name,attribute.value])),precisionText:document.querySelector('.wv-active-event')?.textContent.trim()??null,
      canvasRect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},disclosures:[...document.querySelectorAll('[data-rgb-source-disclosure]')].map(node=>node.textContent),events:window.__MIP_RGB_TEST__.stats()}
  })
  const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const capture=async(name)=>{await paint();const observation=await snapshot();await page.screenshot({path:resolve(output,name+'.png'),fullPage:false});const body=await readFile(resolve(output,name+'.png'));assert.equal(body.readUInt32BE(16),1280);assert.equal(body.readUInt32BE(20),900);frames.push({name:name+'.png',sha256:sha(body),bytes:body.length,width:1280,height:900,fullViewport:true,cropResizeComposite:false,observation});return observation}
  const nativeReady=async()=>{await page.waitForFunction(()=>{const state=window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot();return state?.localSourceResource?.status==='active'&&state.nativeSourceImagery?.ownedPhotoLayerCount===4&&state.nativeSourceImagery.successfulTileKeys.length===4&&state.nativeSourceImagery.nativeFrameObserved&&state.nativeSourceImagery.creditsVisible&&!state.nativeSourceImagery.visibilityFenced},{},{timeout:20000});await paint()}
  const sameContext=(state)=>{assert.deepEqual(state.context,stages.firstBaseline.context);assert.equal(state.precisionText,stages.firstBaseline.precisionText);assert.equal(state.camera,stages.firstBaseline.camera)}
  try{
    assert.equal(typeof page.routeWebSocket,'function','installed Playwright must support WebSocket interception')
    await page.routeWebSocket('**/*',socket=>{
      const url=new URL(socket.url())
      if(['ws:','wss:'].includes(url.protocol)&&url.hostname===base.hostname&&url.port===base.port)return socket.connectToServer()
      network.push({method:'WEBSOCKET',host:url.hostname,path:url.pathname,action:'BLOCKED_BEFORE_NETWORK'});socket.close()
    })
    await page.addInitScript(({source,packet})=>{
      let scope=null,listener=null
      window.__MIP_RGB_TEST__={source,packet,services:{sources:[source],getRequest:()=>scope,subscribeRequestChanges:callback=>{listener=callback;return()=>{listener=null}}},events:[],decodeWitness:[],reservations:[],images:[],scopeChanges:[],scope(value){scope=value;this.scopeChanges.push({kind:value?.kind??null,bounds:value?.bounds??null});listener?.()},stats(){return {events:this.events,decodeWitness:this.decodeWitness,reservations:this.reservations,images:this.images.map((image,index)=>({index,width:image.width,height:image.height})),scopeChanges:this.scopeChanges}}}
    },{source,packet})
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url())
      if(url.origin===base.origin){
        const name=url.pathname.startsWith('/mip-native-rgb-test/')?url.pathname.split('/').at(-1):null
        if(name&&tileBodies.has(name)){assert.equal(request.method(),'GET');gets.push({name,route:url.pathname,ordinal:gets.length+1,sha256:sha(tileBodies.get(name)),bytes:tileBodies.get(name).length});return route.fulfill({status:200,contentType:'image/png',headers:{'content-length':String(tileBodies.get(name).length)},body:tileBodies.get(name)})}
        if(url.pathname.endsWith('/src/views/WorldView.jsx')){const response=await route.fetch({maxRedirects:0});assert.equal(response.status(),200);const body=await response.text(),injected=injectTransport(body,base.pathname);moduleInjections.push({path:url.pathname,servedTransformSha256:sha(body),disposableInjectedSha256:sha(injected)});return route.fulfill({response,body:injected})}
        return route.continue()
      }
      const record={method:request.method(),host:url.hostname,path:url.pathname,action:'BLOCKED_BEFORE_NETWORK'};network.push(record)
      if(url.hostname.endsWith('supabase.co')&&request.method()==='HEAD'){record.action='LOCAL_SYNTHETIC_FULFILL';return route.fulfill({status:200,headers:{'content-range':'*/0','access-control-allow-origin':'*'}})}
      if(url.hostname.endsWith('supabase.co')&&request.method()==='GET'){record.action='LOCAL_SYNTHETIC_FULFILL';const table=url.pathname.split('/').at(-1),body=table==='spatial_projection_v1'?rows:table==='nodes'?graph.nodes:table==='edges'?graph.edges:[];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}})}
      return route.abort()
    })
    await page.goto(base.href+'?worldViewPrototype=1')
    await page.getByRole('navigation',{name:'Evidence views',exact:true}).getByRole('button',{name:'World View',exact:true}).click()
    await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount===12,{},{timeout:60000})
    await page.getByRole('button',{name:'Explore World View',exact:true}).click()
    const panel=page.getByRole('region',{name:'Spatial groups',exact:true}),summary=panel.locator('summary').first()
    if(await summary.count()&&!await summary.evaluate(node=>node.parentElement.open))await summary.click()
    await panel.locator('button[data-cluster-id]').first().click()
    await panel.locator('button[data-row-key]').filter({hasText:rows[1].mip_object_id}).first().press('Space')
    await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
    const camera={version:1,lon:(reference.coverage.bounds[0]+reference.coverage.bounds[2])/2,lat:(reference.coverage.bounds[1]+reference.coverage.bounds[3])/2,heightMeters:5000,headingDegrees:0,pitchDegrees:-90,rollDegrees:0}
    await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(value)),camera)
    await page.getByRole('button',{name:'Explore World View',exact:true}).click()
    await page.waitForFunction(()=>{const state=window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot().nativeSourceImagery;return state?.available&&state.baselineFrameObserved&&!state.visibilityFenced})
    stages.firstBaseline=await capture('01-first-baseline-full-viewport');assert.equal(gets.length,0)
    assert.equal(stages.firstBaseline.context['data-canonical-subject-id'],rows[1].subject_graph_node_id)
    assert.equal(JSON.parse(stages.firstBaseline.camera).heightMeters,8660.254037844763)
    assert.match(stages.firstBaseline.precisionText,/facility/)
    await page.evaluate(bounds=>window.__MIP_RGB_TEST__.scope({kind:'imagery',bounds,level:0}),reference.coverage.bounds)
    await nativeReady();stages.firstActive=await capture('02-first-active-full-viewport');sameContext(stages.firstActive)
    assert.equal(gets.length,4);assert.equal(stages.firstActive.usage.localSourceResource.localBudget.allowanceConsumedBytes,7112736)
    await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
    const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
    // Departure while still active preserves the reviewed cleanup trigger.
    await modes.getByRole('tab',{name:'Graph',exact:true}).click()
    await page.waitForFunction(()=>document.querySelectorAll('[data-rgb-source-disclosure]').length===0&&window.__MIP_RGB_TEST__.stats().images.slice(0,4).every(image=>image.width===0&&image.height===0))
    stages.graphCleared=await capture('03-Graph-cleared-full-viewport');assert.equal(gets.length,4);assert.deepEqual(stages.graphCleared.context,stages.firstBaseline.context)
    await page.evaluate(()=>window.__MIP_RGB_TEST__.scope(null))
    await modes.getByRole('tab',{name:'Map',exact:true}).click()
    await page.waitForFunction(()=>{const state=window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot();return state?.nativeSourceImagery?.available&&!state.nativeSourceImagery.visibilityFenced&&state.nativeSourceImagery.ownedPhotoLayerCount===0&&state.localSourceResource.activeSourceId===null&&state.localSourceResource.retiredNativeOwnerCount===0})
    stages.mapBeforeFresh=await capture('04-Map-return-grant-cleared-full-viewport');assert.equal(gets.length,4);assert.equal(stages.mapBeforeFresh.disclosures.length,0)
    assert.equal(stages.mapBeforeFresh.usage.localSourceResource.localBudget.requests,1);assert.equal(stages.mapBeforeFresh.usage.localSourceResource.localBudget.allowanceConsumedBytes,7112736)
    await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(value)),camera)
    await page.getByRole('button',{name:'Explore World View',exact:true}).click()
    stages.secondBaseline=await capture('05-second-baseline-full-viewport');sameContext(stages.secondBaseline);assert.equal(gets.length,4)
    assert.equal(stages.secondBaseline.usage.nativeSourceImagery.ownedPhotoLayerCount,0)
    await page.evaluate(bounds=>window.__MIP_RGB_TEST__.scope({kind:'imagery',bounds,level:0}),reference.coverage.bounds)
    await nativeReady();stages.secondActive=await capture('06-second-active-full-viewport');sameContext(stages.secondActive)
    assert.equal(gets.length,8);assert.equal(stages.secondActive.usage.localSourceResource.localBudget.requests,2);assert.equal(stages.secondActive.usage.localSourceResource.localBudget.allowanceConsumedBytes,14225472)
    assert.notEqual(stages.secondActive.usage.nativeSourceImagery.adapterGeneration,stages.firstActive.usage.nativeSourceImagery.adapterGeneration)
    assert.ok(stages.secondActive.usage.localSourceResource.requestSerial>stages.firstActive.usage.localSourceResource.requestSerial,'same App owner advances request identity')
    assert.equal(stages.secondActive.usage.localSourceResource.localSessionSerial,stages.firstActive.usage.localSourceResource.localSessionSerial,'Map/Graph does not renew local allowance')
    await page.evaluate(()=>window.__MIP_RGB_TEST__.scope(null))
    await page.waitForFunction(()=>{const state=window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot();return state?.nativeSourceImagery?.ownedPhotoLayerCount===0&&state.nativeSourceImagery.retainedRgbaBytes===0&&state.nativeSourceImagery.bitmapLeaseCount===0&&!state.nativeSourceImagery.visibilityFenced&&state.localSourceResource.activeSourceId===null&&window.__MIP_RGB_TEST__.stats().images.length===8&&window.__MIP_RGB_TEST__.stats().images.every(image=>image.width===0&&image.height===0)})
    stages.secondCleanup=await capture('07-second-cleanup-full-viewport');sameContext(stages.secondCleanup);assert.equal(gets.length,8)
    assert.equal(stages.secondCleanup.usage.localSourceResource.localBudget.allowanceConsumedBytes,14225472)
    const events=await stats();assert.equal(events.reservations.length,8);assert.equal(events.decodeWitness.length,8)
    assert.deepEqual(events.reservations.map(item=>'/mip-native-rgb-test/'+item.tileKey),gets.map(item=>item.route))
    assert.ok(events.reservations.every(item=>item.observedBeforeFetch&&item.localBudget?.pendingRequests>0&&item.localBudget.pendingEstimatedBytes>=packet.localResourceEstimate&&item.localBudget.pendingEstimatedBytes+item.localBudget.allowanceConsumedBytes<=item.localBudget.maxBytes))
    assert.equal(events.events.filter(event=>event.type==='encoded-sha-verified').length,8);assert.ok(events.decodeWitness.every(item=>item.width===512&&item.height===512&&item.alphaOpaque))
    assert.ok(moduleInjections.length>0);assert.deepEqual(errors,[])
  }catch(error){failure={name:error.name,message:error.message};await page.screenshot({path:resolve(output,'failure-full-viewport.png'),fullPage:false}).catch(()=>{});await writeFile(resolve(output,'failure-state.json'),JSON.stringify(await snapshot().catch(()=>null),null,2),{flag:'wx'});throw error
  }finally{
    const finalHead=git(['rev-parse','HEAD'],process.cwd()),finalTree=git(['rev-parse','HEAD^{tree}'],process.cwd())
    const afterHashes=Object.fromEntries(await Promise.all(PRODUCTION_FILES.map(async name=>[name,sha(await readFile(name))])))
    const descriptorAfter=sha(await readFile(originalPath))
    const receipt={schema:'mip.imagery-remount-actual-app.v1',status:failure?'FAIL_RETAINED':'PASS_BROWSER_OBSERVATIONS_PENDING_SECOND_PIXEL_COMPARISON',failure,recordedAtUtc:new Date().toISOString(),candidate:current.head,tree:current.tree,dirty:current.dirty,baseSource:{head:BASE_HEAD,tree:BASE_TREE},sourceFileHashes,sourceFileHashesAfter:afterHashes,sourceHeadAfter:finalHead,sourceTreeAfter:finalTree,
      harnessSha256:sha(await readFile(new URL(import.meta.url))),pixelVerifierSha256:sha(await readFile(resolve(here,'pixels.py'))),fixtureSha256:sha(await readFile(resolve(here,'worldViewProjectionFixture.mjs'))),payloadReferenceSha256:sha(referenceBody),payloadPackageSha256:reference.package.sha256,originalDescriptorSha256BeforeAfter:[sha(descriptorBody),descriptorAfter],runtime:{node:process.version,chromium:browser.version(),playwright:createRequire('/opt/codex/cua_node/lib/node_modules/package.json')('playwright/package.json').version},authority:AUTHORITY,genuineReceivedPixels:true,genuineApplicationAdmitted:false,markerRegistration:'NONE: unchanged displaced synthetic facility fixture; no real event point',sourceWorktree:process.cwd(),baseOrigin:base.origin,viewport:{width:1280,height:900,deviceScaleFactor:1},stages,frames,gets,network,errors,
      initialProjectionRows:rows,projectionRowsSha256:sha(JSON.stringify(rows)),moduleInjections,
      limits:['one fresh local Chromium SwiftShader remount journey','no real provider/backend request sent; all nonlocal requests intercepted before network','no genuine source admission/activation','no original TIFF decode','no event-point registration','no full viewport photographic coverage','no GPU/RSS/provider billing measurement','no physical-device/appearance acceptance']}
    await writeFile(resolve(output,'browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});await browser.close()
    assert.equal(descriptorAfter,DESCRIPTOR_SHA);assert.deepEqual(afterHashes,sourceFileHashes);assert.equal(finalHead,current.head);assert.equal(finalTree,current.tree)
  }
  console.log(JSON.stringify({status:'PASS_BROWSER_OBSERVATIONS_PENDING_SECOND_PIXEL_COMPARISON',output,frames:frames.length,gets:gets.length}))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await run()
