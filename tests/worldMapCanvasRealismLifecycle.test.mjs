import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {WORLD_VIEW_REALISM_RIGHTS} from '../src/lib/worldViewRealismAdmission.js'
import {createWorldViewRealismSession} from '../src/lib/worldViewRealismController.js'
import {FALLBACK_MAP_STACK_ID} from '../src/lib/worldViewMapStack.js'
const output=new URL('./.compiled/world-map-realism-lifecycle.mjs',import.meta.url)
await mkdir(new URL('./.compiled/',import.meta.url),{recursive:true})
await build({entryPoints:[new URL('../src/views/WorldMapCanvas.jsx',import.meta.url).pathname],outfile:output.pathname,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',plugins:[{name:'renderer-double',setup(b){
 b.onResolve({filter:/^\.\.\/lib\/worldViewRendererAdapter$/},()=>({path:'renderer',namespace:'double'}))
 b.onLoad({filter:/.*/,namespace:'double'},()=>({contents:`export const projectionMarkerRecords=(rows,keys)=>rows.map(row=>({row,positions:[row.display_geometry.coordinates],selected:keys.has(row.mip_object_id)}));export const createWorldViewRendererAdapter=args=>({...globalThis.__WORLD_MAP_RENDERER_DOUBLE__(args),getSourceImageryState:()=>({available:true}),fenceSourceImagery(){},attachSourceImagery:(...values)=>globalThis.__MIP_NATIVE_FACADE_TEST__(...values)});`,loader:'js'}))
 b.onResolve({filter:/^world-atlas\/countries-110m.json$/},()=>({path:'atlas',namespace:'atlas'}))
 b.onLoad({filter:/.*/,namespace:'atlas'},()=>({contents:'{"objects":{}}',loader:'json'}))
}}]})
const {default:WorldMapCanvas}=await import(output.href)
const request={kind:'imagery',bounds:[-81.8,41.1,-81.2,41.8],level:10}
// Fictional contract receipts in renderer doubles only, never acquired assets.
const source={id:'fixture-only',kind:'imagery',contentKind:'cartographic',costTier:'cheap',admission:{approved:true,reference:'TEST receipt'},rights:{reference:'TEST rights',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(k=>[k,true]))},attribution:[{text:'TEST'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'TEST bytes',assetCrs:'TEST',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},resolutionMeters:1,lod:{min:1,max:15}}
const row=id=>({mip_object_id:id,revision_id:'revision-'+id,precision_class:'city',object_type:'event',display_geometry:{type:'Point',coordinates:[-81.7,41.4]}})
// Explicit native facade API doubles qualify lifecycle only, never pixels.
function environment(){
 const sourceSession=createWorldViewRealismSession();sourceSession.setAccess({actorId:'SYNTHETIC_LIFECYCLE_ACTOR',sessionReady:true});globalThis.__MIP_REALISM_SESSION_TEST__=sourceSession
 globalThis.__MIP_NATIVE_FACADE_TEST__=async()=>({dispose(){}})
 const previous={window:globalThis.window,document:globalThis.document,navigator:globalThis.navigator};const listeners=new Map(),hostListeners=new Map(),timers=new Map();let id=0
 const view={setInterval:fn=>{timers.set(++id,fn);return id},clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>{fn();return ++id},cancelAnimationFrame(){}}
 const doc={hidden:false,defaultView:view,addEventListener:(k,f)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},removeEventListener:(k,f)=>{listeners.get(k)?.delete(f);if(!listeners.get(k)?.size)listeners.delete(k)}}
 const host={ownerDocument:doc,addEventListener:(k,f)=>hostListeners.set(k,f),removeEventListener:(k,f)=>{if(hostListeners.get(k)===f)hostListeners.delete(k)}}
 globalThis.window=view;globalThis.document=doc;Object.defineProperty(globalThis,'navigator',{value:{},configurable:true})
 globalThis.__WORLD_MAP_RENDERER_DOUBLE__=()=>({mount:async()=>{},destroy(){},setFeatures:async()=>{},setActivityState(){},setRelationships(){},setCameraState(){return true},getCameraState:()=>'{"fixtureCamera":true}',getVisualFidelityCapabilities:()=>({}),setRecordedTime(){},setVisualFidelity(){}})
 return {view,doc,host,listeners,hostListeners,timers,hide:()=>{doc.hidden=true;[...(listeners.get('visibilitychange')??[])].forEach(fn=>fn())},restore(){for(const k of ['window','document'])previous[k]===undefined?delete globalThis[k]:globalThis[k]=previous[k];Object.defineProperty(globalThis,'navigator',{value:previous.navigator,configurable:true});delete globalThis.__WORLD_MAP_RENDERER_DOUBLE__;sourceSession.dispose();delete globalThis.__MIP_REALISM_SESSION_TEST__;delete globalThis.__MIP_NATIVE_FACADE_TEST__}}
}
const props=(r,services,extra={})=>{globalThis.__MIP_NATIVE_FACADE_TEST__=services?.testNativeAttach??(async()=>({dispose(){}}));return {sourceSession:globalThis.__MIP_REALISM_SESSION_TEST__,readerActorId:'SYNTHETIC_LIFECYCLE_ACTOR',sessionReady:true,explorationActive:true,rows:[r],selectedKeys:new Set([r.mip_object_id]),recordedTimeInstant:'2026-01-01T00:00:00Z',onSelectRow(){},realismServices:services,...extra}}
test('mounted actual caller defaults to source fallback with no transport and preserves supplied canonical row/time',async()=>{
 const e=environment(),r=row('a'),calls=[];let mounted
 try{await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(r,{getRequest:v=>{calls.push(v);return null}})),{createNodeMock:()=>e.host})})
 assert.ok(calls.length);assert.deepEqual(calls.at(-1).selection.row,r);assert.equal(calls.at(-1).recordedTimeInstant,'2026-01-01T00:00:00Z')
 const state=e.view.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource;assert.equal(state.status,'fallback');assert.equal(state.highCostProviderActive,false);assert.equal(state.activeSourceId,null);assert.equal(e.timers.size,0,'default empty registry adds no periodic wakeups')
 await act(async()=>mounted.unmount());assert.equal(e.timers.size,0);assert.equal(e.listeners.size,0);assert.equal(e.hostListeners.size,0)
 }finally{e.restore()}
})
test('mounted selection switch, hidden abort, idle disposal and explicit interaction drive actual controller cleanup',async()=>{
 const e=environment();let now=0,loadedDisposed=0,renderDisposed=0;const signals=[],loads=[];let mounted
 const services={sources:[source],getRequest:({selection})=>({...request,level:selection.row.mip_object_id==='b'?11:10}),estimateBytes:()=>100,budgetOptions:{now:()=>now,idleSuspendMs:10,idleDisposeMs:20},transport:{load:async(d,{signal})=>{signals.push(signal);loads.push(d);return {dispose(){loadedDisposed++},observedBytes:80}}},testNativeAttach:async()=>({dispose(){renderDisposed++}})}
 try{await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services)),{createNodeMock:()=>e.host})})
 assert.equal(loads.length,1);assert.equal(e.view.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.status,'attached')
 await act(async()=>mounted.update(React.createElement(WorldMapCanvas,props(row('b'),services))));assert.equal(loads.length,2);assert.equal(loadedDisposed,1)
 await act(async()=>e.hide());assert.equal(loadedDisposed,2);assert.equal(renderDisposed,2);assert.equal(e.timers.size,0)
 await act(async()=>{e.doc.hidden=false;[...(e.listeners.get('visibilitychange')??[])].forEach(fn=>fn())});assert.equal(loads.length,2,'visibility alone does not restart source loading')
 now=21;await act(async()=>{for(const fn of [...e.timers.values()])fn()});assert.equal(e.view.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.disposed,true);assert.equal(e.timers.size,0)
 await act(async()=>{e.hostListeners.get('pointerdown')?.();e.hostListeners.get('pointerup')?.()});assert.equal(loads.length,3,'actual interaction explicitly starts fresh bounded local session')
 await act(async()=>mounted.unmount());assert.equal(loadedDisposed,3);assert.equal(renderDisposed,3);assert.equal(e.timers.size,0)
 }finally{e.restore()}
})
test('initially hidden Explore cannot activate transport; fresh explicit viewport callback owns LOD changes and unsubscribe',async()=>{
 const e=environment();e.doc.hidden=true;let level=10,subscription,unsubscribed=0;const loads=[];let mounted
 const services={sources:[source],estimateBytes:()=>100,getRequest:({cameraState})=>{assert.equal(cameraState,'{"fixtureCamera":true}');return {...request,level}},subscribeRequestChanges:cb=>{subscription=cb;return()=>unsubscribed++},transport:{load:async d=>{loads.push(d);return {dispose(){},observedBytes:80}}},testNativeAttach:async(l,d)=>({observation:{sourceId:d.sourceId,status:'active',rendered:true,successes:1,attributionVisible:true,bounds:d.bounds,level:d.level,ancestry:'direct'},dispose(){}})}
 const statuses=[]
 try{await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services,{explorationActive:true,onSourceStatus:s=>statuses.push(s)})),{createNodeMock:()=>e.host})});assert.equal(loads.length,0);assert.equal(e.timers.size,0)
 await act(async()=>{e.doc.hidden=false;[...(e.listeners.get('visibilitychange')??[])].forEach(fn=>fn())});assert.equal(loads.length,0)
 await act(async()=>{e.hostListeners.get('pointerdown')?.();e.hostListeners.get('pointerup')?.()});assert.equal(loads.length,1);assert.equal(statuses.at(-1).qualifiedRealism.status,'ACTIVE')
 await act(async()=>{e.hostListeners.get('pointerdown')?.();e.hostListeners.get('pointerup')?.()});assert.equal(loads.length,1,'same actual descriptor retains useful layer')
 level=11;await act(async()=>subscription());assert.equal(loads.length,2);assert.equal(loads.at(-1).level,11)
 await act(async()=>e.hide());assert.notEqual(statuses.at(-1).qualifiedRealism.status,'ACTIVE')
 await act(async()=>mounted.unmount());assert.equal(unsubscribed,1);assert.equal(e.timers.size,0)
 }finally{e.restore()}
})
test('mounted hidden cancellation keeps capacity reserved until obsolete load acknowledges abort',async()=>{
 const e=environment();let resolve,loads=0,lateDisposed=0,level=10;let mounted
 const first=new Promise(r=>resolve=r)
 const services={sources:[source],estimateBytes:()=>100,budgetOptions:{maxConcurrent:1},getRequest:()=>({...request,level}),transport:{load:async()=>++loads===1?first:{dispose(){},observedBytes:80}}}
 try{await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services)),{createNodeMock:()=>e.host})});assert.equal(loads,1)
 await act(async()=>e.hide());level=11
 await act(async()=>{e.doc.hidden=false;[...(e.listeners.get('visibilitychange')??[])].forEach(fn=>fn());e.hostListeners.get('pointerdown')?.();e.hostListeners.get('pointerup')?.()});assert.equal(loads,1,'unacknowledged aborted request still owns slot')
 await act(async()=>resolve({dispose(){lateDisposed++},observedBytes:80}));assert.equal(lateDisposed,1)
 await act(async()=>{e.hostListeners.get('pointerdown')?.();e.hostListeners.get('pointerup')?.()});assert.equal(loads,2)
 await act(async()=>mounted.unmount());assert.equal(e.timers.size,0)
 }finally{e.restore()}
})
test('malformed service setup or throwing subscription keeps baseline fallback and removes owned listeners',async()=>{
 for(const invalid of [{budgetOptions:{maxConcurrent:0}},{sources:[{id:'non-cloneable',value(){}}]},{subscribeRequestChanges(){throw Error('fixture setup failure')}}]){
  const e=environment();let loads=0,mounted
  const services={sources:[source],getRequest:()=>request,estimateBytes:()=>100,transport:{load:async()=>{loads++;return {dispose(){}}}},...invalid}
  try{await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services,{explorationActive:true})),{createNodeMock:()=>e.host})})
   assert.equal(loads,0);assert.equal(e.timers.size,0)
   const snapshot=e.view.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource
   assert.equal(snapshot.status,'fallback');assert.ok(snapshot.bridgeFailure);assert.equal(snapshot.activeSourceId,null)
   await act(async()=>mounted.unmount());assert.equal(e.timers.size,0);assert.equal(e.listeners.size,0);assert.equal(e.hostListeners.size,0)
  }finally{e.restore()}
 }
})

test('Explore during a pending request admits once; camera completion, controls and wheel use current viewport and clean listeners',async()=>{
 const e=environment();let mounted,resolve,loads=0,level=10,adapterOptions,estimates=0
 const pending=new Promise(r=>resolve=r)
 globalThis.__WORLD_MAP_RENDERER_DOUBLE__=options=>{adapterOptions=options;return {mount:async()=>{},destroy(){},setFeatures:async()=>{},setActivityState(){},setRelationships(){},setCameraState(){return true},getCameraState:()=>'{"fixtureCamera":true}',getVisualFidelityCapabilities:()=>({})}}
 const services={sources:[source],estimateBytes:()=>{estimates++;return 100},getRequest:()=>({...request,level}),transport:{load:async()=>{loads++;return loads===1?pending:{dispose(){},observedBytes:80}}}}
 try{
  await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services)),{createNodeMock:()=>e.host})})
  await act(async()=>mounted.update(React.createElement(WorldMapCanvas,props(row('a'),services,{explorationActive:true}))))
  assert.equal(loads,1);assert.equal(estimates,1,'Explore does not reserve the same pending descriptor twice')
  await act(async()=>resolve({dispose(){},observedBytes:80}))
  level=11;await act(async()=>adapterOptions.onCameraChange());assert.equal(loads,2)
  level=12;await act(async()=>e.hostListeners.get('wheel')?.());assert.equal(loads,3)
  level=13;await act(async()=>mounted.root.findAllByType('button').find(b=>b.props.children==='North America overview').props.onClick());assert.equal(loads,4)
  await act(async()=>mounted.unmount());assert.equal(e.hostListeners.size,0);assert.equal(e.listeners.size,0);assert.equal(e.timers.size,0)
 }finally{e.restore()}
})
test('throwing estimate at the mounted fire-and-forget boundary produces fallback without rejection or source transport',async()=>{
 const e=environment();let mounted,loads=0;const statuses=[],rejections=[];const onRejected=error=>rejections.push(error)
 process.on('unhandledRejection',onRejected)
 const services={sources:[source],estimateBytes(){throw Error('fixture estimate unavailable')},getRequest:()=>request,transport:{load:async()=>{loads++;return {dispose(){}}}}}
 try{
  await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services,{explorationActive:true,onSourceStatus:s=>statuses.push(s)})),{createNodeMock:()=>e.host})})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(loads,0);assert.deepEqual(rejections,[]);assert.equal(statuses.at(-1).localSourceResource.activeSourceId,null);assert.equal(statuses.at(-1).localSourceResource.status,'fallback')
  await act(async()=>mounted.unmount());assert.equal(e.hostListeners.size,0);assert.equal(e.listeners.size,0);assert.equal(e.timers.size,0)
 }finally{process.off('unhandledRejection',onRejected);e.restore()}
})

test('reservation clock failure from a mounted service falls back without transport or rejection',async()=>{
 const e=environment();let mounted,loads=0,failReservation=false;const rejections=[],statuses=[];const onRejected=error=>rejections.push(error)
 process.on('unhandledRejection',onRejected)
 const services={sources:[source],budgetOptions:{now:()=>{if(failReservation){failReservation=false;throw Error('fixture reserve clock unavailable')}return 0}},estimateBytes:()=>{failReservation=true;return 100},getRequest:()=>request,transport:{load:async()=>{loads++;return {dispose(){}}}}}
 try{
  await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services,{explorationActive:true,onSourceStatus:s=>statuses.push(s)})),{createNodeMock:()=>e.host})})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(loads,0);assert.deepEqual(rejections,[]);assert.equal(statuses.at(-1).localSourceResource.status,'fallback');assert.equal(statuses.at(-1).localSourceResource.activeSourceId,null)
  await act(async()=>mounted.unmount());assert.equal(e.hostListeners.size,0);assert.equal(e.listeners.size,0);assert.equal(e.timers.size,0)
 }finally{process.off('unhandledRejection',onRejected);e.restore()}
})

test('real Atlas fallback removes native handlers from detached renderer host without replacing source session',async()=>{
 const e=environment();let mounted,adapterOptions,requestChanges=0,subscriptions=0,unsubscribed=0,loads=0
 const viewListeners=new Map()
 e.view.addEventListener=(name,callback)=>viewListeners.set(name,callback)
 e.view.removeEventListener=(name,callback)=>{if(viewListeners.get(name)===callback)viewListeners.delete(name)}
 globalThis.__WORLD_MAP_RENDERER_DOUBLE__=options=>{adapterOptions=options;return {mount:async()=>{},destroy(){},setFeatures:async()=>{},setActivityState(){},setRelationships(){},setCameraState(){return true},getCameraState:()=>'{"fixtureCamera":true}',getVisualFidelityCapabilities:()=>({})}}
 const services={sources:[source],budgetOptions:{now:()=>0},estimateBytes:()=>100,getRequest:()=>{requestChanges++;return request},subscribeRequestChanges:()=>{subscriptions++;return()=>unsubscribed++},transport:{load:async()=>{loads++;return {dispose(){},observedBytes:80}}}}
 try{
  await act(async()=>{mounted=TestRenderer.create(React.createElement(WorldMapCanvas,props(row('a'),services)),{createNodeMock:()=>e.host})})
  assert.equal(e.hostListeners.size,5);assert.equal(loads,1)
  const before=e.view.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.localBudget
  await act(async()=>adapterOptions.onStackIdChange(FALLBACK_MAP_STACK_ID))
  assert.equal(mounted.root.findAll(node=>node.props.className==='wv-map-host').length,0,'Atlas removes the native renderer host')
  assert.equal(e.hostListeners.size,0,'detached renderer host releases all five native input subscriptions')
  assert.equal(subscriptions,1);assert.equal(unsubscribed,0,'changing stack does not recreate the source-service subscription')
  assert.equal(loads,1)
  const after=e.view.__MIP_WORLD_VIEW_USAGE_PROBE__.snapshot().localSourceResource.localBudget
  assert.deepEqual(after,before,'host rebinding does not replace or reset source local accounting')
  const calls=requestChanges
  for(const name of ['pointerdown','pointerup','keydown','keyup','wheel'])e.hostListeners.get(name)?.()
  assert.equal(requestChanges,calls)
  await act(async()=>mounted.unmount());assert.equal(unsubscribed,1);assert.equal(e.listeners.size,0);assert.equal(e.timers.size,0);assert.equal(viewListeners.size,0)
 }finally{e.restore()}
})
