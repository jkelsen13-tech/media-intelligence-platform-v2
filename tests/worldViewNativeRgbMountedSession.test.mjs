// Production Canvas caller regression retained from independent QA.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,rm} from 'node:fs/promises'
import {build} from 'esbuild'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {fixture,request} from './helpers/worldViewNativeRgbMountedSessionFixture.mjs'
const output=new URL(`./.native-rgb-compiled/Canvas-node${process.versions.node.split('.')[0]}.mjs`,import.meta.url)
await mkdir(new URL('./.native-rgb-compiled/',import.meta.url),{recursive:true})
await build({entryPoints:[new URL('../src/views/WorldMapCanvas.jsx',import.meta.url).pathname],outfile:output.pathname,
 bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',plugins:[{name:'explicit-lifecycle-renderer-probe',setup(b){
  b.onResolve({filter:/^\.\.\/lib\/worldViewRendererAdapter$/},()=>({path:'renderer',namespace:'probe'}))
  b.onLoad({filter:/.*/,namespace:'probe'},()=>({contents:'export const projectionMarkerRecords=(rows,keys)=>rows.map(row=>({row,positions:[row.display_geometry.coordinates],selected:keys.has(row.mip_object_id)}));export const createWorldViewRendererAdapter=args=>globalThis.__independentCanvasRenderer(args);',loader:'js'}))
  b.onResolve({filter:/^world-atlas\/countries-110m.json$/},()=>({path:'atlas',namespace:'atlas'}))
  b.onLoad({filter:/.*/,namespace:'atlas'},()=>({contents:'{"objects":{}}',loader:'json'}))
 }}]})
const {default:Canvas}=await import(output.href)
test('mounted production Canvas cannot treat retained active Explore state on remount as a fresh idle-renewing interaction',async()=>{
 // This proves the production effect's session call, using an explicit renderer
 // lifecycle probe. It is not photographic/native frame/pixel evidence.
 const f=fixture();await f.owner.select(request);f.unbind();f.advance(21);f.owner.poll()
 assert.equal(f.owner.snapshot().localSessionSerial,1);assert.equal(f.owner.snapshot().localBudget.disposed,true)
 const old={window:globalThis.window,document:globalThis.document,navigator:globalThis.navigator},listeners=new Map(),timers=new Map(),hostListeners=new Map()
 let id=0,destroys=0,tree
 const view={setInterval:fn=>{timers.set(++id,fn);return id},clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>{fn();return ++id},cancelAnimationFrame(){}}
 const doc={hidden:false,defaultView:view,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}}
 const host={ownerDocument:doc,addEventListener:(name,fn)=>hostListeners.set(name,fn),removeEventListener:(name,fn)=>{if(hostListeners.get(name)===fn)hostListeners.delete(name)}}
 globalThis.window=view;globalThis.document=doc;Object.defineProperty(globalThis,'navigator',{value:{},configurable:true})
 globalThis.__independentCanvasRenderer=options=>({mount:async()=>options.onSourceImageryStateChange?.({available:true}),destroy(){destroys++},setFeatures:async()=>{},setActivityState(){},setRelationships(){},setCameraState(){return true},getCameraState:()=>'{"fixtureCamera":true}',getVisualFidelityCapabilities:()=>({}),setRecordedTime(){},setVisualFidelity(){},getSourceImageryState:()=>({available:true}),fenceSourceImagery(){},attachSourceImagery:async()=>({dispose(){}})})
 const row={mip_object_id:'qualification-subject',revision_id:'qualification-revision',precision_class:'city',object_type:'event',display_geometry:{type:'Point',coordinates:[-81.7,41.4]}}
 try{
  await act(async()=>{tree=TestRenderer.create(React.createElement(Canvas,{rows:[row],selectedKeys:new Set([row.mip_object_id]),onSelectRow(){},
   recordedTimeInstant:'2026-10-02T00:00:00.000000001Z',realismServices:f.services,sourceSession:f.owner,readerActorId:'A',sessionReady:true,
   sourceAccessKey:'independent-scope-key',explorationActive:true}),{createNodeMock:()=>host})})
  await act(async()=>new Promise(resolve=>setImmediate(resolve)))
  assert.equal(f.owner.snapshot().localSessionSerial,1,'ordinary mount is not a fresh meaningful interaction')
  assert.equal(f.loads.length,1);assert.equal(f.owner.snapshot().localBudget.disposed,true)
  await act(async()=>{hostListeners.get('pointerdown')?.();hostListeners.get('pointerup')?.()})
  assert.equal(f.owner.snapshot().localSessionSerial,2,'actual fresh pointer input renews the existing local policy')
  assert.equal(f.loads.length,2);assert.equal(f.owner.snapshot().localBudget.requests,1)
  assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,200)
 }finally{
  if(tree)await act(async()=>tree.unmount());f.owner.dispose()
  for(const key of ['window','document'])old[key]===undefined?delete globalThis[key]:globalThis[key]=old[key]
  Object.defineProperty(globalThis,'navigator',{value:old.navigator,configurable:true});delete globalThis.__independentCanvasRenderer
 }
 assert.equal(destroys,1);assert.equal(timers.size,0)
})

await rm(output,{force:true})
await rm(new URL('./.native-rgb-compiled/',import.meta.url),{recursive:true,force:true})
