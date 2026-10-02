// Local empirical App qualification: genuine received derivative bytes with
// explicitly simulated source authority. No source admission or native stub.
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {PROJECTION_FIXTURE_COLUMNS,makeClusteringContractRows,clusteringGraphContractRows} from './worldViewProjectionFixture.mjs'

const require=createRequire('/opt/codex/cua_node/lib/node_modules/package.json')
const {chromium}=require('playwright')
const output=process.env.MIP_NATIVE_RGB_OUTPUT??'/workspace/mip-native-imagery-actual-app-evidence'
const base=new URL(process.env.MIP_NATIVE_RGB_BASE??'http://127.0.0.1:4189/media-intelligence-platform-v2/')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
await mkdir(output,{recursive:true})
const reference=JSON.parse(await readFile('/workspace/mip-native-imagery-integration-plan/payload-reference.json','utf8'))
const originalPath='/workspace/mip-real-imagery-evidence/existing-admission-gate.json'
const originalBytes=await readFile(originalPath), originalSha=sha(originalBytes), original=JSON.parse(originalBytes)
assert.equal(originalSha,'21ea5338c49d6b2ae127c420ead3920d260dece13ea09f0fed9889db34aa1e15')
assert.equal(original.applicationAdmitted,false);assert.equal(original.source.admission.approved,false)
const payloads=new Map()
for(const tile of reference.tiles){const bytes=await readFile('/workspace/mip-real-imagery-evidence/planar-inspection/'+tile.name);assert.equal(sha(bytes),tile.sha256);assert.equal(bytes.length,tile.byteLength);payloads.set('/mip-native-rgb-test/'+tile.name,bytes)}
const candidate=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
const dirty=spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim()!==''
if(process.env.MIP_NATIVE_RGB_ALLOW_DIRTY!=='1')assert.equal(dirty,false,'final empirical proof requires a committed clean candidate')
const productionFiles=['src/App.jsx','src/views/WorldView.jsx','src/views/WorldMapCanvas.jsx','src/lib/worldViewRealismController.js','src/lib/worldViewRendererAdapter.js','src/lib/worldViewCesiumEllipsoidRendererAdapter.js','src/lib/worldViewSourceStatus.js','src/lib/worldViewBoundedRgbImagery.js']
const sourceFileHashes=Object.fromEntries(await Promise.all(productionFiles.map(async name=>[name,sha(await readFile(name))])))
const source={id:'SIMULATED_TEST_AUTHORITY_ONLY::OHIO_RGB::'+candidate.slice(0,8),kind:'imagery',contentKind:'photographic',costTier:'cheap',
  admission:{approved:true,reference:'SIMULATED TEST authority only; genuine source is UNAPPROVED'},
  rights:{reference:'SIMULATED TEST permissions only',commercial:true,publicWeb:true,cache:true,redistribution:true,derivatives:true,analyticalUse:true,attribution:true},
  attribution:[{text:'SIMULATED TEST authority · Cuyahoga County / Ohio OSIP · planning-only, noncadastral'}],
  qualification:{bytesVerified:true,sha256:reference.package.sha256,reference:'SIMULATED authority; preserved genuine received derivative hashes',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
  coverage:reference.coverage,capture:{...reference.capture,verified:true},resolutionMeters:0.38,lod:{min:0,max:0}}
const packet={sourceId:source.id,registeredAssetSha256:reference.package.sha256,runtimeProvenanceSha256:reference.runtimeProvenance.sha256,sourceMetadataXmlSha256:reference.sourceMetadataXml.sha256,capture:reference.capture,coverage:reference.coverage,permissionGrant:false,
  localResourceEstimate:reference.resource.conservativeReservationBytes,tiles:reference.tiles.map(tile=>({...tile,key:tile.name,route:'/mip-native-rgb-test/'+tile.name}))}
const template={...Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(k=>[k,null])),projection_contract_version:'v1',mip_object_id:'synthetic',subject_graph_node_id:'synthetic',revision_id:'synthetic',revision_ordinal:1,revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:'2026-01-01T12:00:00Z',release_effective_at_utc:'2025-12-01T00:00:00Z',precision_class:'facility',object_type:'event',spatial_role:'event',geometry_status:'coarsened_to_precision_class',release_state:'released',review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:[]}
// Explicitly synthetic facility markers are displaced from the photo footprint
// to keep the payload inspection unobscured. No real event registration or
// evidence precision is inferred from this disposable fixture.
const rows=makeClusteringContractRows(template,'US-local',{count:12}).map(row=>({...row,display_geometry:{type:'Point',coordinates:[row.display_geometry.coordinates[0]+0.05,row.display_geometry.coordinates[1]]}})),graph=clusteringGraphContractRows(rows)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']})
const receipts=[]
let page
try{
  for(const scenario of ['positive-remount','genuine-unapproved']){
    page=await browser.newPage({viewport:{width:1280,height:900}})
    const errors=[],network=[],gets=[],reservations=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.addInitScript(({source,packet})=>{
      let scope=null,listener=null
      window.__MIP_RGB_TEST__={source,packet,services:{sources:[source],getRequest:()=>scope,subscribeRequestChanges:callback=>{listener=callback;return()=>{listener=null}}},
        events:[],decodeWitness:[],scope(value){scope=value;listener?.()},stats(){return {events:this.events,decodeWitness:this.decodeWitness}}}
    },{source:scenario==='genuine-unapproved'?original.source:source,packet})
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url())
      if(url.origin===base.origin){
        if(payloads.has(url.pathname)){
          const state=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot())
          reservations.push({path:url.pathname,localBudget:state?.localSourceResource?.localBudget??null})
          assert.ok(state?.localSourceResource?.localBudget?.pendingRequests>0,'actual reservation precedes PNG GET')
          gets.push(url.pathname);return route.fulfill({status:200,contentType:'image/png',headers:{'content-length':String(payloads.get(url.pathname).length)},body:payloads.get(url.pathname)})
        }
        if(url.pathname.endsWith('/src/views/WorldView.jsx')){
          const response=await route.fetch(),body=await response.text()
          assert.ok(body.includes('cameraMemory: cameraMemoryRef.current,'))
          const setup=`\nimport {createWorldViewBoundedRgbTransport as createTestTransport} from '${base.pathname}src/lib/worldViewBoundedRgbImagery.js';
const bridge=window.__MIP_RGB_TEST__;
const transport=createTestTransport({packets:[bridge.packet],origin:location.origin,decodeImageBitmap:async(blob,options)=>{
const image=await createImageBitmap(blob,options);const canvas=new OffscreenCanvas(image.width,image.height);const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
const rgba=context.getImageData(0,0,image.width,image.height).data;const rgb=new Uint8Array(image.width*image.height*3);let alphaOpaque=true;for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];alphaOpaque&&=rgba[i+3]===255;}
const rgbSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgb)),b=>b.toString(16).padStart(2,'0')).join('');bridge.decodeWitness.push({width:image.width,height:image.height,rgbSha256,alphaOpaque});return image;
},onEvent:event=>{bridge.events.push(event);if(bridge.events.length>128)bridge.events.shift()}});
bridge.services.transport=transport;bridge.services.estimateBytes=descriptor=>transport.estimateBytes(descriptor);
`
          return route.fulfill({response,body:setup+body.replace('cameraMemory: cameraMemoryRef.current,','realismServices: window.__MIP_RGB_TEST__.services, cameraMemory: cameraMemoryRef.current,')})
        }
        return route.continue()
      }
      network.push({method:request.method(),host:url.hostname,path:url.pathname,blockedOrSynthetic:true})
      if(url.hostname.endsWith('supabase.co')&&request.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'*/0','access-control-allow-origin':'*'}})
      if(url.hostname.endsWith('supabase.co')&&request.method()==='GET'){
        const table=url.pathname.split('/').at(-1),body=table==='spatial_projection_v1'?rows:table==='nodes'?graph.nodes:table==='edges'?graph.edges:[]
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}})
      }
      return route.abort()
    })
    await page.goto(base.href+'?worldViewPrototype=1')
    await page.getByRole('navigation',{name:'Evidence views',exact:true}).getByRole('button',{name:'World View',exact:true}).click()
    await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount===12,{},{timeout:60000})
    await page.getByRole('button',{name:'Explore World View',exact:true}).click()
    const panel=page.getByRole('region',{name:'Spatial groups',exact:true})
    const summary=panel.locator('summary').first();if(await summary.count()&&!await summary.evaluate(n=>n.parentElement.open))await summary.click()
    await panel.locator('button[data-cluster-id]').first().click()
    await panel.locator('button[data-row-key]').filter({hasText:rows[1].mip_object_id}).first().press('Space')
    await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
    const camera={version:1,lon:(reference.coverage.bounds[0]+reference.coverage.bounds[2])/2,lat:(reference.coverage.bounds[1]+reference.coverage.bounds[3])/2,heightMeters:5000,headingDegrees:0,pitchDegrees:-90,rollDegrees:0}
    await page.evaluate(camera=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(camera)),camera)
    await page.getByRole('button',{name:'Explore World View',exact:true}).click()
    await page.waitForTimeout(700)
    const canonicalBefore=await page.locator('[data-canonical-subject-id]').first().getAttribute('data-canonical-subject-id')
    const cameraBefore=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
    const canvas=page.locator('.wv-map-host canvas').first()
    await canvas.screenshot({path:output+'/'+scenario+'-baseline.png'})
    await page.evaluate(bounds=>window.__MIP_RGB_TEST__.scope({kind:'imagery',bounds,level:0}),scenario==='genuine-unapproved'?original.source.coverage.bounds:reference.coverage.bounds)
    if(scenario==='genuine-unapproved'){
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.rejected.some(item=>item.reason==='source-not-admitted'))
      const state=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot())
      assert.equal(gets.length,0);assert.equal(state.localSourceResource.localBudget.requests,0);assert.equal(state.nativeSourceImagery.ownedPhotoLayerCount,0)
      receipts.push({scenario,status:'PASS_DEFAULT_DENY',state,gets,network,errors})
    }else{
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.status==='active',{},{timeout:20000})
      await page.waitForTimeout(400)
      const active=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot())
      assert.equal(active.nativeSourceImagery.ownedPhotoLayerCount,4);assert.equal(active.nativeSourceImagery.successfulTileKeys.length,4);assert.equal(gets.length,4)
      await canvas.screenshot({path:output+'/'+scenario+'-active.png'})
      const afterCamera=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
      assert.equal(afterCamera,cameraBefore);assert.equal(await page.locator('[data-canonical-subject-id]').first().getAttribute('data-canonical-subject-id'),canonicalBefore)
      await page.getByRole('button',{name:'Close Explore World View',exact:true}).click()
      await page.getByText('Source status and time',{exact:true}).click()
      const disclosure=await page.locator('[data-rgb-source-disclosure]').innerText()
      assert.match(disclosure,/2023-03-07/);assert.match(disclosure,/day precision/);assert.match(disclosure,/planning-only/)
      await page.evaluate(()=>window.__MIP_RGB_TEST__.scope(null))
      await page.waitForFunction(()=>{const p=window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot();return p.nativeSourceImagery.ownedPhotoLayerCount===0&&!p.nativeSourceImagery.visibilityFenced&&p.localSourceResource.activeSourceId===null})
      const cleared=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot())
      const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
      await modes.getByRole('tab',{name:'Graph',exact:true}).click();await modes.getByRole('tab',{name:'Map',exact:true}).click()
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot().nativeSourceImagery?.available)
      await page.evaluate(camera=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(camera)),camera)
      await page.getByRole('button',{name:'Explore World View',exact:true}).click()
      await page.evaluate(bounds=>window.__MIP_RGB_TEST__.scope({kind:'imagery',bounds,level:0}),reference.coverage.bounds)
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.status==='active',{},{timeout:20000})
      const remounted=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot())
      assert.equal(remounted.localSourceResource.localBudget.requests,2);assert.equal(remounted.localSourceResource.localBudget.allowanceConsumedBytes,14225472)
      assert.equal(gets.length,8);assert.notEqual(remounted.nativeSourceImagery.adapterGeneration,active.nativeSourceImagery.adapterGeneration)
      await page.evaluate(()=>window.__MIP_RGB_TEST__.scope(null));await page.waitForFunction(()=>!window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().nativeSourceImagery.visibilityFenced)
      await page.evaluate(bounds=>window.__MIP_RGB_TEST__.scope({kind:'imagery',bounds,level:0}),reference.coverage.bounds)
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.reason==='byte-allowance-exhausted')
      const refused=await page.evaluate(()=>window.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot())
      assert.equal(gets.length,8);assert.equal(refused.nativeSourceImagery.ownedPhotoLayerCount,0)
      const events=await page.evaluate(()=>window.__MIP_RGB_TEST__.stats())
      assert.equal(events.events.filter(event=>event.type==='encoded-sha-verified').length,8)
      assert.equal(events.decodeWitness.length,8);assert.ok(events.decodeWitness.every(item=>item.width===512&&item.height===512&&item.alphaOpaque))
      receipts.push({scenario,status:'PASS_NATIVE_OBSERVATION_PENDING_PIXEL_COMPARISON',authority:'SIMULATED_TEST_AUTHORITY_ONLY',genuinePayload:true,genuineApplicationAdmitted:false,
        canonicalBefore,cameraBefore,initialProjectionRows:rows,sourceRequestBounds:reference.coverage.bounds,markerRegistration:'NONE: displaced initial synthetic fixture; not a real event point',nativeTextureOrientation:'cesium-imagebitmap-preflip-y-v1',active,cleared,remounted,refused,disclosure,events,reservations,gets,network,errors})
    }
    assert.deepEqual(errors,[])
    await page.close();page=null
  }
}catch(error){if(page){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await writeFile(output+'/failure-state.json',JSON.stringify(await page.evaluate(()=>({usage:window.__MIP_WORLD_VIEW_USAGE_PROBE__?.snapshot(),events:window.__MIP_RGB_TEST__?.stats()})).catch(()=>null),null,2))}throw error
}finally{
  assert.equal(sha(await readFile(originalPath)),originalSha)
  assert.deepEqual(Object.fromEntries(await Promise.all(productionFiles.map(async name=>[name,sha(await readFile(name))]))),sourceFileHashes)
  assert.equal(spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),candidate)
  await writeFile(output+'/browser-receipt.json',JSON.stringify({candidate,dirty,sourceFileHashes,sourceWorktree:'isolated-native-imagery-attachment',harnessSha256:sha(await readFile(new URL(import.meta.url))),pixelVerifierSha256:sha(await readFile(new URL('./qualifyWorldViewNativeRgbPixels.py',import.meta.url))),originalDescriptorSha256BeforeAfter:[originalSha,sha(await readFile(originalPath))],originalUnapproved:true,genuineApplicationAdmitted:false,payloadPackageSha256:reference.package.sha256,receipts},null,2))
  await browser.close()
}
console.log(JSON.stringify({status:'BROWSER_OBSERVATIONS_COMPLETE_PIXEL_COMPARISON_REQUIRED',cases:receipts.length,output}))
