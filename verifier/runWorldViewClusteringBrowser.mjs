// Representative exact-candidate runtime; all fixture data remain in this
// disposable loopback browser. No backend writes, new provider or auth bypass.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { cameraStatesEqual, parseCameraState } from '../src/lib/worldViewCameraState.js'
import { subjectFromWorldViewSelection } from '../src/lib/investigationContext.js'
import { observeBackendBoundary } from './backendBoundary.mjs'
import { CLUSTER_SCENES, installClusteringFixture, installClusteringGraphFixture, installProjectionFixture, QUALIFICATION_SUBJECT } from './worldViewProjectionFixture.mjs'

const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {chromium,webkit}=require('playwright')
const candidate=process.env.MIP_CANDIDATE_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout?.trim()
assert.match(candidate??'',/^[0-9a-f]{40}$/,'qualification identifies exact checked-out candidate')
const origin='http://127.0.0.1:4173',base=origin+'/media-intelligence-platform-v2/'
const selectedRoute=base+'#/event/'+QUALIFICATION_SUBJECT+'/world',browseRoute=base+'#/world'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
const state=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()??null)
const fidelity=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()??null)
const camera=page=>page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState()??null)
const context=page=>page.locator('.ws-canonical[data-investigation-context]').evaluate(node=>
  Object.fromEntries(['canonical-subject-type','canonical-subject-id','parent-event-id','as-of-time','selected-time-range','temporal-assessment-reference']
    .map(key=>[key,node.getAttribute('data-'+key)])))
const evidenceFields=page=>page.getByRole('complementary',{name:'Selected-event inspector'}).evaluate(node=>{
  const wanted=new Set(['When','Valid-time precision','Location','Precision class','Geometry status','Uncertainty','Uncertainty note','Review','Release'])
  return Object.fromEntries([...node.querySelectorAll('.wv-field')].map(field=>[field.querySelector('dt')?.textContent,field.querySelector('dd')?.textContent]).filter(([key])=>wanted.has(key)))
})
const cameraTarget=(lon,lat,heightMeters)=>({version:1,lon,lat,heightMeters,headingDegrees:0,pitchDegrees:-90,rollDegrees:0})
const targets=value=>[...value.layout.singles.map(point=>({...point,radius:7})),...value.layout.clusters.map(group=>({...group,radius:20}))]
function overlapPairs(points,radius=7){
  let pairs=0
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    const a=points[i],b=points[j],distance=Math.hypot(a.x-b.x,a.y-b.y)
    if(distance<(a.radius??radius)+(b.radius??radius))pairs++
  }
  return pairs
}
const stableLayout=value=>({singles:value.layout.singles,clusters:value.layout.clusters})

async function actualGroupTargets(page,value){
  const groups=await page.locator('.wv-display-overlay [data-cluster-id]').evaluateAll(nodes=>nodes.map(node=>{
    const r=node.getBoundingClientRect()
    return {id:node.getAttribute('data-cluster-id'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}
  }))
  assert.equal(groups.length,value.layout.clusters.length,'actual overlay exposes one badge for every current cluster')
  for(const group of groups){
    assert.ok(value.layout.clusters.some(cluster=>cluster.id===group.id),'actual badge binds current sanitized group ID')
    assert.ok(group.width>=44&&group.height>=44,'current group has an actual44px minimum hit target')
  }
  let hitOverlapPairs=0
  for(let i=0;i<groups.length;i++)for(const b of groups.slice(i+1)){
    const a=groups[i]
    if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)hitOverlapPairs++
  }
  return {badgeCount:groups.length,hitOverlapPairs,hitBounds:groups}
}

function validateLayout(value){
  assert.ok(value?.layout,'actual mounted renderer exposes cluster metadata')
  assert.ok(Array.isArray(value.markers),'probe retains original input anchors')
  const {singles,clusters,stats}=value.layout
  assert.equal(stats.inputCount,value.markers.length,'layout counts original display locations')
  assert.equal(stats.visibleCount,value.markers.filter(marker=>marker.eligible).length,'eligible locations match horizon/viewport clipping')
  assert.equal(stats.targetCount,singles.length+clusters.length,'actual target count separates singles/groups')
  const eligible=new Set(value.markers.filter(marker=>marker.eligible).map(marker=>marker.id))
  const retained=new Set()
  for(const single of singles){
    assert.ok(eligible.has(single.id));assert.ok(!retained.has(single.id));retained.add(single.id)
    assert.ok(Number.isFinite(single.x)&&Number.isFinite(single.y))
  }
  for(const group of clusters){
    assert.ok(Number.isFinite(group.x)&&Number.isFinite(group.y))
    assert.equal(group.locationCount,group.memberIds.length)
    assert.equal(group.rowCount,new Set(group.rowKeys).size,'rows never counted as coordinate locations')
    assert.ok(group.locationCount>=2)
    for(const id of group.memberIds){assert.ok(eligible.has(id));assert.ok(!retained.has(id),'no stale or duplicate group member');retained.add(id)}
    // A cluster's display anchor is an original published projected anchor.
    const anchor=value.markers.find(marker=>group.memberIds.includes(marker.id)&&Math.abs(marker.x-group.x)<1e-6&&Math.abs(marker.y-group.y)<1e-6)
    assert.ok(anchor,'group does not relocate published display geometry')
  }
  assert.equal(retained.size,eligible.size,'each eligible original location has one current display target')
  assert.ok(stats.labelCount>=0&&stats.labelCount<=stats.targetCount)
  for(const key of ['passes','lastMs','maxMs'])assert.ok(Number.isFinite(stats[key])&&stats[key]>=0)
}
function observeRequests(page){
  const counts={backend:0,imagery:0,terrain:0}
  page.on('request',request=>{
    const url=new URL(request.url())
    if(url.hostname.endsWith('.supabase.co'))counts.backend++
    if(url.hostname==='tile.openstreetmap.org'||url.hostname==='tiles.openfreemap.org')counts.imagery++
    if(url.pathname.includes('/terrarium/'))counts.terrain++
  })
  return counts
}
async function settle(page){
  await page.locator('[data-map-stack]').scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats,{},{timeout:60000})
  if(await page.locator('.wv-map-host').count())await page.locator('.wv-map-host').scrollIntoViewIfNeeded()
  const renderer=await fidelity(page)
  if(await page.locator('.cesium-widget').count())await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_FIDELITY_PROBE__?.getRenderState()?.globeTilesLoaded,{},{timeout:45000})
  await page.waitForLoadState('networkidle',{timeout:30000})
  await page.evaluate(()=>document.fonts.ready)
  let previous=(await state(page)).layout.stats.passes,stable=0
  for(let i=0;i<60&&stable<4;i++){await delay(100);const next=(await state(page)).layout.stats.passes;stable=next===previous?stable+1:0;previous=next}
  assert.equal(stable,4,'event-driven group layout settles')
  validateLayout(await state(page))
}
async function setCamera(page,target){
  assert.equal(await page.evaluate(value=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(value)),target),true)
  await settle(page)
}
async function image(page,label){
  const surface=page.locator('[data-map-stack]')
  console.log('MIP_WORLD_CLUSTER_IMAGE_'+label+'='+(await surface.screenshot({type:'jpeg',quality:70})).toString('base64'))
}
async function idle(page,counts,label){
  await settle(page)
  const before=await state(page),beforeFidelity=await fidelity(page),beforeCamera=await camera(page),requests={...counts},start=Date.now()
  await delay(1000)
  const after=await state(page),afterFidelity=await fidelity(page)
  const timingObserved=await page.locator('[data-map-stack]').getAttribute('data-map-stack')!=='atlas-fallback'
  const sample={elapsedMs:Date.now()-start,layoutTimingObserved:timingObserved,layoutPasses:timingObserved?after.layout.stats.passes-before.layout.stats.passes:null,
    renderedFrames:Number.isFinite(beforeFidelity?.renderedFrames)&&Number.isFinite(afterFidelity?.renderedFrames)?afterFidelity.renderedFrames-beforeFidelity.renderedFrames:null,
    requests:Object.fromEntries(Object.keys(counts).map(key=>[key,counts[key]-requests[key]]))}
  if(timingObserved)assert.equal(sample.layoutPasses,0,'fixed-camera idle allocates no new observed layout pass')
  if(sample.renderedFrames!=null)assert.equal(sample.renderedFrames,0,'fixed-camera idle has no renderer loop')
  assert.deepEqual(sample.requests,{backend:0,imagery:0,terrain:0})
  assert.deepEqual(stableLayout(after),stableLayout(before))
  assert.equal(await camera(page),beforeCamera)
  console.log('MIP_WORLD_CLUSTER_IDLE='+JSON.stringify({candidate,label,...sample}))
  return sample
}
async function modesAndResize(page){
  const originalContext=await context(page),saved=parseCameraState(await camera(page)),before=await state(page)
  const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
  await modes.getByRole('tab',{name:'Graph',exact:true}).click()
  assert.equal(await page.locator('.wv-map-host').count(),0,'Graph unmounts map renderer')
  assert.equal(await state(page),null,'unmounted map clears public grouping metadata')
  await modes.getByRole('tab',{name:'Split',exact:true}).click();await settle(page)
  assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-6))
  await modes.getByRole('tab',{name:'Map',exact:true}).click();await settle(page)
  assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-6))
  assert.deepEqual(stableLayout(await state(page)),stableLayout(before),'mode remount restores deterministic membership')
  const originalViewport=page.viewportSize(),resizes=[]
  for(const width of [390,834,320,originalViewport.width]){
    await page.setViewportSize({width,height:900});await settle(page)
    const current=await state(page)
    assert.ok(cameraStatesEqual(parseCameraState(await camera(page)),saved,1e-6),'resize retains camera')
    assert.deepEqual(await context(page),originalContext)
    const overflow=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))
    assert.ok(overflow.document<=overflow.viewport+1,'group UI fits phone/tablet viewport')
    resizes.push({width,targets:current.layout.stats.targetCount,labels:current.layout.stats.labelCount})
  }
  assert.deepEqual(stableLayout(await state(page)),stableLayout(before),'resize roundtrip restores stable IDs and membership')
  return resizes
}
async function expandGroup(page,group){
  const panel=page.getByRole('region',{name:'Spatial groups',exact:true})
  const summary=panel.locator('summary').first()
  if(await summary.count()){
    if(!await summary.evaluate(node=>node.parentElement.open))await summary.click()
  }else if(await panel.getByRole('button',{name:'Spatial groups',exact:true}).count())await panel.getByRole('button',{name:'Spatial groups',exact:true}).click()
  const target=panel.getByRole('button',{name:'Inspect group: '+group.rowCount+' projection rows, '+group.locationCount+' display locations',exact:true}).first()
  const beforeContext=await context(page),beforeCamera=await camera(page),beforeUrl=page.url()
  await target.focus();await target.press('Enter')
  assert.deepEqual(await context(page),beforeContext,'group inspection does not commit a member')
  assert.equal(await camera(page),beforeCamera,'group inspection does not move camera')
  assert.equal(page.url(),beforeUrl,'group inspection is display-only')
  return panel
}
async function originalJourney(browser,engine,kind,{fault=null}={}){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),counts=observeRequests(page),verifyBoundary=observeBackendBoundary(page),errors=[]
  page.on('pageerror',error=>errors.push(error.name))
  if(fault)await page.addInitScript(mode=>{
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(kind,...args){
      if(/webgl/i.test(kind)&&(mode==='atlas'||this.closest('.cesium-widget')))return null
      return original.call(this,kind,...args)
    }
  },fault)
  const receipt=await installProjectionFixture(page,kind)
  const label=engine+'_'+kind+'_'+(fault??'globe')
  try{
    await page.goto(selectedRoute)
    await page.getByRole('complementary',{name:'Selected-event inspector'}).getByText('coarsened_to_precision_class',{exact:true}).waitFor({timeout:60000})
    await settle(page)
    if(!fault||fault==='map')await setCamera(page,cameraTarget(-81.7,41.4,100000))
    const originalContext=await context(page),originalFields=await evidenceFields(page),baseline=await state(page)
    assert.equal(Object.keys(originalFields).length,9,'selected original row exposes original source fields')
    assert.equal(baseline.markers.length,receipt.coordinateCount,'all original MultiPoint coordinates retained')
    const eligible=baseline.markers.filter(marker=>marker.eligible),rawPairs=overlapPairs(eligible),paintedPairs=overlapPairs(targets(baseline)),actualTargets=await actualGroupTargets(page,baseline)
    // Baseline is measured BEFORE gates from this actual camera's raw published
    // projected anchors. This is an unaggregated counterfactual, not an old GPU run.
    console.log('MIP_WORLD_CLUSTER_BASELINE='+JSON.stringify({candidate,label,evidenceLayer:'representative-built-actions',
      baselineKind:'actual-projected-anchors-before-aggregation',originalRows:receipt.selectionRows.length,
      locations:baseline.markers.length,eligible:eligible.length,unaggregatedTargets:eligible.length,
      rawMarkerOverlapPairs:rawPairs,targets:baseline.layout.stats.targetCount,paintedTargetOverlapPairs:paintedPairs,actualTargets,labels:baseline.layout.stats.labelCount}))
    if(kind==='dense'){
      assert.equal(new Set(baseline.markers.map(marker=>marker.rowKey)).size,1,'500 locations count one original projection row')
      assert.ok(baseline.layout.clusters.length>0,'dense evidence is actually aggregated')
      assert.ok(baseline.layout.stats.targetCount<eligible.length,'dense grouping reduces actual pick-target count')
      assert.ok(paintedPairs<rawPairs,'dense grouping reduces marker overlap')
      assert.ok(baseline.layout.clusters.some(group=>group.rowCount===1&&group.locationCount>1&&group.selected),'selected row remains discoverable inside its group')
      await image(page,label+'_before')
      await expandGroup(page,baseline.layout.clusters.find(group=>group.selected))
    }else if(!fault){
      assert.equal(eligible.length,4,'far-side original point stays hidden')
      assert.equal(baseline.layout.clusters.length,0,'well-separated local points retain individual targets')
      assert.ok(baseline.layout.stats.labelCount>=2,'sparse separated labels remain readable')
    }
    const resizes=fault==='atlas'?[]:await modesAndResize(page)
    assert.deepEqual(await context(page),originalContext)
    assert.deepEqual(await evidenceFields(page),originalFields,'grouping/navigation/resize retains original row fields')
    await idle(page,counts,label)
    await image(page,label+'_after')
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_CLUSTER_ORIGINAL_PASS='+JSON.stringify({candidate,label,sourceRows:receipt.selectionRows.length,
      sourceFieldsRetained:true,coordinateCount:receipt.coordinateCount,resizes,backend:verifyBoundary(),
      limitation:'The fixture changes only display geometry of a real returned row. The measured before state uses original projected anchors; no old-build runtime, GPU FPS, deployed site or physical device claim.'}))
  }catch(error){
    console.log('MIP_WORLD_CLUSTER_FAILURE='+JSON.stringify({candidate,label,error:error.message,pageErrors:errors,readerRequests:receipt.readerRequests}))
    console.log('MIP_WORLD_CLUSTER_FAILURE_IMAGE_'+label+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}
function expectedContext(row,node=null){
  const ic=subjectFromWorldViewSelection({row,node})
  return {'canonical-subject-type':ic.canonical_subject_type??'','canonical-subject-id':ic.canonical_subject_id??'',
    'parent-event-id':ic.parent_event_id??'','as-of-time':ic.as_of_time??'',
    'selected-time-range':ic.selected_time_range?(ic.selected_time_range.from??'')+'..'+(ic.selected_time_range.to??''):'',
    'temporal-assessment-reference':ic.temporal_assessment_reference??''}
}



async function actualRelationshipLines(page,fixture){
  const summary=(await state(page)).relationshipSummary
  assert.ok(summary,'actual mapped relationship summary is available')
  const lines=await page.locator('.wv-display-overlay [data-edge-id]').evaluateAll(nodes=>nodes.map(node=>({
    id:node.getAttribute('data-edge-id'),directionArrow:Boolean(node.querySelector('[marker-end]')?.getAttribute('marker-end'))
  })))
  const ids=new Set(fixture.getEdges().map(edge=>edge.id))
  assert.equal(lines.length,summary.displayed,'reported count matches actual rendered relationship paths')
  assert.ok(lines.length<=80,'actual visible relationship path count respects budget')
  for(const line of lines){assert.ok(ids.has(line.id),'rendered path retains original source edge identity');assert.equal(line.directionArrow,true,'actual path preserves directed arrow')}
  return {displayed:lines.length,summary}
}

async function qualifyRelationships(page,fixture,label){
  const receipt=fixture.receipt
  assert.equal(receipt.nodesFulfilled,48,'exact existing graph nodes GET200 qualifies isolated node contract')
  assert.equal(receipt.edgesFulfilled,88,'exact existing graph edges GET200 qualifies isolated edge contract')
  const panel=page.getByLabel('Documented relationships',{exact:true})
  await panel.waitFor()
  const summary=panel.locator('summary').first()
  if(!await summary.evaluate(node=>node.parentElement.open))await summary.click()
  const edges=fixture.getEdges(),records=panel.locator('li[data-edge-id]')
  assert.equal(await records.count(),20,'relationship inspector initially mounts one bounded page')
  assert.match(await summary.innerText(),/88 records/,'relationship header reports total original records')
  const edge=edges[0]
  const entries=await records.all()
  let first=null
  for(const entry of entries)if(await entry.getAttribute('data-edge-id')===edge.id){first=entry;break}
  assert.ok(first,'original exact edge identity is inspectable')
  const detail=first.locator('details')
  if(!await detail.evaluate(node=>node.open))await detail.locator('summary').click()
  const rawFields=await detail.evaluate(node=>Object.fromEntries([...node.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent])))
  assert.equal(rawFields.id,edge.id)
  assert.equal(rawFields.source,edge.source_id,'inspector preserves original directed source endpoint')
  assert.equal(rawFields.target,edge.target_id,'inspector preserves original directed target endpoint')
  assert.equal(rawFields.type,edge.type,'inspector preserves exact raw stored relationship type')
  let evidenceVerified=false
  if(receipt.evidenceColumns){
    assert.equal(rawFields.signal_source,edge.signal_source)
    const metadata=detail.locator('pre')
    assert.deepEqual(JSON.parse(await metadata.innerText()),edge.metadata,'raw original evidence metadata remains inspectable without synthesis')
    assert.match(await panel.innerText(),/The current graph reader does not supply relationship valid-time bounds\./)
    assert.match(await panel.innerText(),/These records are not attributed to the selected recorded time\./)
    evidenceVerified=true
  }else console.log('MIP_WORLD_CLUSTER_RELATIONSHIP_EVIDENCE_NOT_EXERCISED='+JSON.stringify({candidate,label,reason:'Only the authorized BASE edge contract was available; metadata/hypothesis fields are absent.',readerFailures:receipt.readerFailures}))

  const originalContext=await context(page),originalCamera=await camera(page),originalUrl=page.url()
  const navigation=panel.getByRole('navigation',{name:'Relationship record pages',exact:true})
  const next=navigation.getByRole('button',{name:'Next',exact:true}),seen=new Set(),pageCounts=[]
  for(let pageIndex=0;pageIndex<5;pageIndex++){
    await navigation.getByRole('status').filter({hasText:'Page '+(pageIndex+1)+' of 5'}).waitFor()
    const ids=await records.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-edge-id')))
    assert.equal(ids.length,pageIndex===4?8:20,'bounded relationship page has exact supplied record count')
    for(const id of ids){assert.ok(!seen.has(id),'pagination does not duplicate or skip original edge identity');seen.add(id)}
    pageCounts.push(ids.length)
    if(pageIndex<4){assert.equal(await next.isEnabled(),true);await next.click()}
    else assert.equal(await next.isEnabled(),false,'last supplied relationship page ends pagination')
  }
  assert.deepEqual([...seen].sort(),edges.map(edge=>edge.id).sort(),'all88 original mapped edges remain inspectable across five pages')
  if(receipt.evidenceColumns){
    const hypothesisRecords=records.filter({hasText:'Stored hypothesis'})
    assert.equal(await hypothesisRecords.count(),4,'last page retains every original stored hypothesis')
    const hypothesis=(await hypothesisRecords.all())[0],hypothesisId=await hypothesis.getAttribute('data-edge-id'),originalHypothesis=edges.find(edge=>edge.id===hypothesisId)
    assert.equal(originalHypothesis.claimed_by,'MIP_inferred')
    const details=hypothesis.locator('details')
    if(!await details.evaluate(node=>node.open))await details.locator('summary').click()
    const fields=await details.evaluate(node=>Object.fromEntries([...node.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent])))
    assert.equal(fields.claimed_by,originalHypothesis.claimed_by,'original hypothesis attribution stays inspectable')
    assert.deepEqual(JSON.parse(await details.locator('pre').innerText()),originalHypothesis.metadata,'last-page hypothesis retains original evidence metadata')
  }
  assert.deepEqual(await context(page),originalContext,'record pagination preserves canonical source/time')
  assert.equal(await camera(page),originalCamera,'record pagination never moves the map camera')
  assert.equal(page.url(),originalUrl)

  const current=(await state(page)).relationshipSummary
  assert.ok(current,'same grouping probe exposes actual relationship summary')
  assert.ok(current.displayed<=80,'map relationship paths respect the bounded budget')
  await image(page,label+'_relationships')
  return {synthetic:true,nodes:receipt.nodesFulfilled,edges:receipt.edgesFulfilled,evidenceColumns:receipt.evidenceColumns,
    exactEndpointsAndType:true,evidenceVerified,pagination:{total:seen.size,pageCounts},summary:current,readerFailures:receipt.readerFailures,
    temporalValidity:'No recorded relationship validity was supplied by this contract fixture; unavailable is honest.'}
}

async function projectionRowButton(scope,row){
  const buttons=await scope.getByRole('button',{name:/^Select projection row: /}).all()
  for(const button of buttons){
    const key=await button.getAttribute('data-row-key')
    let tuple
    try{tuple=JSON.parse(key)}catch{continue}
    if(Array.isArray(tuple)&&tuple.includes(row.mip_object_id)&&tuple.includes(row.revision_id))return button
  }
  assert.fail('current accessible row button must bind exact original object/revision tuple')
}

async function independentJourney(browser,engine,scene,width=1280){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<900}),counts=observeRequests(page),verifyBoundary=observeBackendBoundary(page),errors=[]
  page.on('pageerror',error=>errors.push(error.name))
  if(width<900)await page.addInitScript(()=>{
    const counts={trustedStart:0,trustedEnd:0}
    window.__MIP_CLUSTER_TOUCH_EVENTS__=counts
    for(const [type,key] of [['touchstart','trustedStart'],['touchend','trustedEnd']])
      addEventListener(type,event=>{if(event.isTrusted)counts[key]++},{capture:true,passive:true})
  })
  const fixture=await installClusteringFixture(page,scene.name,{isolatedContractRows:true}),graphFixture=await installClusteringGraphFixture(page,{isolatedContractRows:true}),label=engine+'_'+scene.name+'_'+width
  try{
    await page.goto(browseRoute);await settle(page)
    assert.equal(fixture.receipt.syntheticContractRows,48)
    assert.ok(!(await context(page))['canonical-subject-id'],'independent browse has no fabricated auto-selection')
    const sourceFingerprint=JSON.stringify(fixture.getRows()),scales=[]
    for(const [scale,height] of [['local',100000],['regional',800000],['continental',12000000]]){
      const beforeContext=await context(page)
      await setCamera(page,cameraTarget(...scene.center,height))
      const before=await state(page),raw=before.markers.filter(marker=>marker.eligible),actualTargets=await actualGroupTargets(page,before)
      const baseline={scale,eligible:raw.length,originalContractRows:new Set(raw.map(marker=>marker.rowKey)).size,
        rawMarkerOverlapPairs:overlapPairs(raw),targets:before.layout.stats.targetCount,
        paintedTargetOverlapPairs:overlapPairs(targets(before)),labels:before.layout.stats.labelCount,
        layoutMs:before.layout.stats.lastMs,maxLayoutMs:before.layout.stats.maxMs,layoutPasses:before.layout.stats.passes,actualTargets}
      console.log('MIP_WORLD_CLUSTER_INDEPENDENT_BASELINE='+JSON.stringify({candidate,label,synthetic:true,...baseline}))
      assert.ok(before.layout.clusters.some(group=>group.rowCount>1),'distinct contract rows actually group at '+scale)
      assert.ok(baseline.targets<raw.length)
      assert.ok(baseline.paintedTargetOverlapPairs<baseline.rawMarkerOverlapPairs)
      assert.equal(actualTargets.hitOverlapPairs,0,'actual44px cluster hit boxes do not collide')
      assert.deepEqual(await context(page),beforeContext)
      const saved=parseCameraState(await camera(page))
      await setCamera(page,cameraTarget(scene.center[0]+0.2,scene.center[1],height))
      await setCamera(page,saved)
      assert.deepEqual(stableLayout(await state(page)),stableLayout(before),'pan roundtrip has stable membership and IDs')
      assert.equal(JSON.stringify(fixture.getRows()),sourceFingerprint,'camera/grouping never rewrites any source fixture field')
      const relationships=await actualRelationshipLines(page,graphFixture)
      if(scale==='local')assert.ok(relationships.displayed>0,'distributed independent rows qualify actual documented relationship paths before narrowing selection')
      baseline.relationships=relationships
      scales.push(baseline);await image(page,label+'_'+scale)
    }
    await setCamera(page,cameraTarget(...scene.center,100000))
    const resizes=await modesAndResize(page),group=(await state(page)).layout.clusters.find(value=>value.rowCount>1)
    const panel=await expandGroup(page,group)
    const source=fixture.getRows()[1],member=await projectionRowButton(panel,source)
    await member.waitFor()
    const rowKey=await member.getAttribute('data-row-key')
    assert.ok(group.rowKeys.includes(rowKey),'member binds an original contract row in the current group')
    const originalSubject=(await context(page))['canonical-subject-id']
    await member.focus()
    // Observe browser-delivered keyboard events on the actual native member
    // button. Native Space activation need not set event.defaultPrevented;
    // its default action activates the button instead of scrolling the page.
    await member.evaluate(node=>{
      window.__MIP_CLUSTER_KEYBOARD_EVENTS__=[]
      for(const type of ['keydown','keyup'])node.addEventListener(type,event=>{
        if(event.code!=='Space')return
        queueMicrotask(()=>window.__MIP_CLUSTER_KEYBOARD_EVENTS__.push({
          type:event.type,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented,
          nativeButton:node.tagName==='BUTTON',targetIsButton:event.target===node,
        }))
      },{once:true})
    })
    const scrollSnapshot=()=>page.evaluate(()=>{
      const root=document.scrollingElement
      return {x:scrollX,y:scrollY,maxX:Math.max(0,root.scrollWidth-root.clientWidth),
        maxY:Math.max(0,root.scrollHeight-root.clientHeight)}
    })
    const scrollBefore=await scrollSnapshot()
    await member.press('Space')
    // Read before settle(), which intentionally scrolls the renderer into view.
    // Legitimate selection narrows the member list and may reduce document
    // height; the browser can clamp the previous scroll position to its new end.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
    const scrollAfter=await scrollSnapshot(),keyboardEvents=await page.evaluate(()=>window.__MIP_CLUSTER_KEYBOARD_EVENTS__)
    assert.deepEqual(keyboardEvents.map(event=>event.type),['keydown','keyup'],'actual member receives native Space key pair')
    assert.ok(keyboardEvents.every(event=>event.trusted&&event.nativeButton&&event.targetIsButton),'Space acts on the trusted native member button')
    assert.ok(Math.abs(scrollAfter.x-Math.min(scrollBefore.x,scrollAfter.maxX))<=1
      &&Math.abs(scrollAfter.y-Math.min(scrollBefore.y,scrollAfter.maxY))<=1,
      'native Space adds no page scrolling beyond legitimate document-size clamping')
    const keyboardScroll={before:scrollBefore,after:scrollAfter,
      defaultPrevented:keyboardEvents.map(event=>event.defaultPrevented),trustedNativeButton:true,
      measuredBeforeVerifierScroll:true}
    await settle(page)
    assert.notEqual((await context(page))['canonical-subject-id'],originalSubject,'deliberate member pick changes to its exact source subject')
    assert.deepEqual(await context(page),expectedContext(source,graphFixture.getNodes().find(node=>node.id===source.subject_graph_node_id)),'first pick binds source-derived graph type/time/revision context')
    const pickedUrl=page.url(),pickedContext=await context(page),pickedState=await state(page),pickedFields=await evidenceFields(page)
    assert.equal(pickedFields['Precision class'],source.precision_class)
    assert.equal(pickedFields['Geometry status'],source.geometry_status)
    assert.equal(pickedFields.Location,'Recorded place · '+source.precision_class+' · ['+source.display_geometry.coordinates.join(', ')+']','selected inspector shows exact published fixture geometry; grouping never relocates coordinates')
    assert.equal(pickedState.selectedRowKey,rowKey,'selection binds exact source object/revision row key')
    assert.ok([...pickedState.layout.singles,...pickedState.layout.clusters].some(target=>target.selected),'selected member remains discoverable')
    assert.ok(pickedState.markers.every(marker=>marker.rowKey===rowKey),'old browse membership cannot survive narrowed current source selection')
    const repeat=await projectionRowButton(page,source)
    await repeat.focus();await repeat.press('Enter');await settle(page)
    assert.deepEqual(await context(page),pickedContext,'repeated original row pick is exactly idempotent')
    assert.equal(page.url(),pickedUrl)
    assert.deepEqual(await evidenceFields(page),pickedFields,'repeated member selection retains exact source fields')
    let trustedTouch=null
    if(width<900){
      const before=await page.evaluate(()=>({...window.__MIP_CLUSTER_TOUCH_EVENTS__}))
      await repeat.tap();await settle(page)
      const after=await page.evaluate(()=>({...window.__MIP_CLUSTER_TOUCH_EVENTS__}))
      assert.ok(after.trustedStart>before.trustedStart&&after.trustedEnd>before.trustedEnd,'accessible member tap delivers native trusted touch pair')
      assert.deepEqual(await context(page),pickedContext);assert.equal(page.url(),pickedUrl)
      trustedTouch={start:after.trustedStart-before.trustedStart,end:after.trustedEnd-before.trustedEnd}
    }
    const relationshipQualification=await qualifyRelationships(page,graphFixture,label)
    const timeline=page.getByRole('slider',{name:'Recorded time',exact:true})
    let outsideTime=false
    if(source.valid_to_utc&&await timeline.count()){
      await timeline.focus();await timeline.press('End');await delay(300)
      const current=await context(page)
      if(Date.parse(current['as-of-time'])>=Date.parse(source.valid_to_utc)){
        await settle(page)
        assert.equal(current['canonical-subject-id'],source.subject_graph_node_id,'recorded time never changes canonical source')
        assert.equal((await state(page)).layout.stats.inputCount,0,'outside recorded validity leaves no stale group members')
        outsideTime=true
      }
    }
    await idle(page,counts,label)
    assert.deepEqual(errors,[])
    console.log('MIP_WORLD_CLUSTER_INDEPENDENT_PASS='+JSON.stringify({candidate,label,synthetic:true,evidenceLayer:'isolated-contract-fixture',
      originalReaderRows:fixture.receipt.originalReaderRows,syntheticContractRows:48,displayLocations:48,scales,resizes,
      memberPick:{sourceIdentity:source.subject_graph_node_id,rowKey,keyboard:['Space','Enter'],keyboardScroll,sourceBoundContext:true,repeatedIdempotent:true,staleBrowseMembershipRemoved:true,outsideTime,trustedTouch},
      relationships:relationshipQualification,backend:verifyBoundary(),
      limitations:['Independent identities and geometry are isolated synthetic contract fixtures, not authoritative observations.',
        'Graph identities and88 relationships are isolated synthetic contract rows fulfilled only after exact existing authorized GET200; no source facts or backend records are created.',
        'Software browser layout latency and idle allocation counters are measured; no hardware FPS/physical phone/tablet claim.']}))
  }catch(error){
    console.log('MIP_WORLD_CLUSTER_FAILURE='+JSON.stringify({candidate,label,error:error.message,pageErrors:errors,qualification:fixture.receipt.qualification}))
    console.log('MIP_WORLD_CLUSTER_FAILURE_IMAGE_'+label+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    throw error
  }finally{await page.close()}
}

let browser
try{
  let ready=false
  for(let i=0;i<40;i++){try{ready=(await fetch(base)).ok}catch{}if(ready)break;await delay(250)}
  assert.ok(ready,'existing built preview starts')
  console.log('MIP_WORLD_CLUSTER_PREFLIGHT='+JSON.stringify({candidate,evidenceLayer:'representative-built-actions',
    pureLayoutHistoricalBaseline:{viewport:[960,480],scalePixelsPerDegree:1600,sparse:{rows:1,eligibleLocations:4,overlapPairs:0,labels:2},
      dense:{rows:1,locations:500,overlapPairs:124750,pickTargets:500,labels:1}},
    historicalRuntimeBaseline:'not captured by this verifier; historical numbers above are pure layout, not observed browser rendering'}))
  for(const engine of ['chromium','webkit']){
    browser=await {chromium,webkit}[engine].launch({headless:true})
    for(const kind of ['dense','sparse'])await originalJourney(browser,engine,kind)
    if(engine==='chromium'){
      for(const scene of CLUSTER_SCENES)await independentJourney(browser,engine,scene)
      for(const width of [390,834])await independentJourney(browser,engine,CLUSTER_SCENES[0],width)
      for(const fault of ['map','atlas'])await originalJourney(browser,engine,'dense',{fault})
    }else await independentJourney(browser,engine,CLUSTER_SCENES[0])
    await browser.close();browser=null
  }
  console.log('MIP_WORLD_CLUSTER_BROWSER_PASS='+JSON.stringify({candidate,
    postStartupContextLoss:'existing separate runWorldViewContextLossBrowser.mjs gate; this script qualifies startup fallback/unmount',
    nativeTouchDrag:'existing runWorldViewTabletBrowser.mjs gate; this script qualifies accessible keyboard member picking in touch-enabled responsive viewports'}))
}finally{await browser?.close();server.kill('SIGTERM')}
