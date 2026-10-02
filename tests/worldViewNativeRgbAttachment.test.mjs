// Public native API regression cases retained from independent QA.
import test from 'node:test'
import assert from 'node:assert/strict'
import {transportFixture,nativeFixture,confirm,deferred} from './helpers/worldViewNativeRgbFixture.mjs'
import { createGlobeFailureLifecycle } from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

test('production facade refuses unmounted/loading/destroyed attachment rather than forwarding',async()=>{
  const gate=deferred(),f=await nativeFixture({mountGate:gate}),p=transportFixture(),loaded=await p.load()
  await assert.rejects(f.facade.attachSourceImagery(loaded,p.descriptor),/unavailable/)
  const mount=f.mount();await Promise.resolve();await Promise.resolve()
  await assert.rejects(f.facade.attachSourceImagery(loaded,p.descriptor),/unavailable/)
  gate.resolve();await mount;f.facade.destroy()
  await assert.rejects(f.facade.attachSourceImagery(loaded,p.descriptor),/unavailable/)
  loaded.dispose();assert.equal(p.images[0].closed,1)
})

test('four production-branded tiles need exact level, every provider, visible credits and two later native frames',async()=>{
  const p=transportFixture({four:true}),loaded=await p.load(),f=await nativeFixture({deadlineMs:1000});await f.mount()
  const pending=f.facade.attachSourceImagery(loaded,p.descriptor);let settled=false;pending.finally(()=>{settled=true})
  assert.equal(f.layers.length,5);assert.equal(f.native.state().ownedPhotoLayerCount,4)
  assert.equal(loaded.getResourceState().leaseCount,1)
  for(const layer of f.owned()){
    assert.equal(layer.provider.maximumLevel,0);assert.equal(layer.provider.minimumLevel,0)
    assert.equal(layer.provider.hasAlphaChannel,false)
    assert.ok(layer.provider.credit.html.includes('&lt;credit&gt; &amp;'))
    await assert.rejects(layer.provider.requestImage(1,0,0),/unavailable/)
    await assert.rejects(layer.provider.requestImage(0,0,1),/unavailable/)
  }
  await Promise.all(f.owned().slice(0,3).map(layer=>layer.provider.requestImage(0,0,0)))
  f.frame();f.frame();assert.equal(settled,false)
  await f.provider(3).requestImage(0,0,0)
  f.style.visibility='hidden';f.frame();f.frame();assert.equal(settled,false)
  f.style.visibility='visible';f.frame();const handle=await pending
  assert.equal(handle.observation.successfulTileKeys.length,4);assert.equal(handle.observation.nativeFrameObserved,true)
  assert.equal(handle.observation.viewportCoverageQualified,false)
  assert.equal(handle.observation.attachmentGeneration,f.native.state().attachmentGeneration)
  assert.equal(handle.observation.adapterGeneration,f.native.state().adapterGeneration)
  handle.dispose();loaded.dispose();f.native.destroy()
  assert.deepEqual(p.images.map(image=>image.closed),[1,1,1,1]);assert.equal(f.layers.length,1)
})

test('copied loaded handle, changed hash/bounds/LOD and absent credits cause no native allocation',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  await assert.rejects(f.facade.attachSourceImagery({...loaded},p.descriptor),/binding/)
  for(const mutate of [d=>d.metadata.assetSha256='d'.repeat(64),d=>d.bounds[0]=0.1,d=>d.level=1,d=>d.requestedLevel=1,d=>d.ancestry='approved-parent',d=>d.metadata.attribution=[]]){
    const descriptor=structuredClone(p.descriptor);mutate(descriptor)
    await assert.rejects(f.facade.attachSourceImagery(loaded,descriptor),/binding|credit/)
    assert.equal(f.layers.length,1);assert.equal(loaded.getResourceState().leaseCount,0)
  }
  f.native.destroy();loaded.dispose()
})

test('immediate fence withholds pixels until two baseline frames and rejects stale provider/frame completion',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  const {handle,providers}=await confirm(f,loaded,p.descriptor)
  const oldFrame=f.events.postRender.history.at(-1),generation=f.native.state().attachmentGeneration
  f.facade.fenceSourceImagery();assert.equal(f.host.style.visibility,'hidden');assert.equal(f.layers.length,1)
  assert.equal(f.native.state().visibilityFenced,true);assert.ok(f.native.state().attachmentGeneration>generation)
  await assert.rejects(providers[0].requestImage(0,0,0),/unavailable/)
  oldFrame();assert.equal(f.native.state().nativeFrameObserved,false)
  await assert.rejects(f.facade.attachSourceImagery(loaded,p.descriptor),/binding/)
  f.frame();assert.equal(f.host.style.visibility,'hidden')
  f.frame();assert.equal(f.host.style.visibility,'');assert.equal(f.native.state().baselineFrameObserved,true)
  handle.dispose();handle.dispose();loaded.dispose();f.native.destroy();assert.equal(p.images[0].closed,1)
})

test('old successful handle cannot remove a fresh attachment and twice cleanup closes once',async()=>{
  const p=transportFixture(),old=await p.load(),fresh=await p.load(),f=await nativeFixture();await f.mount()
  const first=await confirm(f,old,p.descriptor);first.handle.dispose();old.dispose();f.frame();f.frame()
  const second=await confirm(f,fresh,p.descriptor),generation=f.native.state().attachmentGeneration
  first.handle.dispose();first.handle.dispose();assert.equal(f.native.state().attachmentGeneration,generation)
  assert.equal(f.owned().length,1);assert.equal(f.native.state().nativeFrameObserved,true)
  second.handle.dispose();second.handle.dispose();fresh.dispose();fresh.dispose();f.native.destroy();f.native.destroy()
  assert.deepEqual(p.images.map(image=>image.closed),[1,1]);assert.equal(f.events.postRender.listeners.size,0)
})

test('native allocation failure after two layers removes only owned layers and releases bitmap lease',async()=>{
  const p=transportFixture({four:true}),loaded=await p.load(),f=await nativeFixture({failAllocationAt:3});await f.mount()
  await assert.rejects(f.facade.attachSourceImagery(loaded,p.descriptor),/allocation/)
  assert.equal(f.layers.length,1);assert.equal(f.removed.length,2);assert.ok(f.removed.every(layer=>layer.destroyed))
  assert.equal(loaded.getResourceState().leaseCount,0);loaded.dispose();loaded.dispose();f.native.destroy();f.native.destroy()
  assert.deepEqual(p.images.map(image=>image.closed),[1,1,1,1])
})

test('owner abort refuses pending provider and frame state, timeout stays fenced without a baseline frame',async()=>{
  const p=transportFixture(),loaded=await p.load(),abort=new AbortController(),f=await nativeFixture({deadlineMs:20});await f.mount()
  const pending=f.facade.attachSourceImagery(loaded,p.descriptor,{signal:abort.signal})
  const provider=f.provider(0),late=provider.requestImage(0,0,0);abort.abort()
  await assert.rejects(late,/cancelled/);await assert.rejects(pending,/aborted/)
  assert.equal(f.layers.length,1);assert.equal(f.host.style.visibility,'hidden');assert.equal(loaded.getResourceState().leaseCount,0)
  f.native.destroy();loaded.dispose()
  const next=transportFixture(),nextLoaded=await next.load(),g=await nativeFixture({deadlineMs:20});await g.mount()
  await assert.rejects(g.facade.attachSourceImagery(nextLoaded,next.descriptor),/deadline/)
  assert.equal(g.native.state().available,false);assert.equal(g.host.style.visibility,'hidden');assert.equal(g.layers.length,1)
  g.native.destroy();nextLoaded.dispose();assert.equal(next.images[0].closed,1)
})

test('fatal draw keeps native bitmap lease through deferred layer teardown and ignores old completion',async()=>{
  const p=transportFixture({four:true}),loaded=await p.load(),f=await nativeFixture();await f.mount()
  const {handle,providers}=await confirm(f,loaded,p.descriptor)
  let inDraw=true
  for(const image of p.images){const close=image.close;image.close=function(){assert.equal(inDraw,false);assert.ok(f.removed.length===4||f.viewer.isDestroyed());close.call(this)}}
  const lifecycle=createGlobeFailureLifecycle({viewer:f.viewer,isCancelled:()=>false,
    onFatalFailure(){f.cancel();f.facade.fenceSourceImagery();handle.dispose();loaded.dispose();lifecycle.destroy();assert.deepEqual(p.images.map(image=>image.closed),[0,0,0,0]);assert.equal(f.host.style.visibility,'hidden')},
    destroyResources(){f.native.destroy();f.viewer.destroy()}})
  f.events.renderError.raise(f.viewer.scene,Error('simulated render failure'))
  assert.equal(f.viewer.isDestroyed(),false);assert.equal(loaded.getResourceState().leaseCount,1)
  inDraw=false;await Promise.resolve();await Promise.resolve()
  assert.equal(f.viewer.isDestroyed(),true);assert.equal(loaded.getResourceState().leaseCount,0)
  assert.deepEqual(p.images.map(image=>image.closed),[1,1,1,1]);assert.equal(f.events.postRender.listeners.size,0)
  await assert.rejects(providers[0].requestImage(0,0,0),/unavailable/)
  f.native.destroy();lifecycle.destroy()
})

test('native layer-removal exception cannot abort actual renderer teardown or permanently lose its bitmap lease',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  await confirm(f,loaded,p.descriptor);loaded.dispose();f.failRemoval()
  const lifecycle=createGlobeFailureLifecycle({viewer:f.viewer,destroyResources(){f.native.destroy();f.viewer.destroy()}})
  assert.doesNotThrow(()=>lifecycle.destroy())
  assert.equal(f.viewer.isDestroyed(),true)
  assert.equal(loaded.getResourceState().leaseCount,0);assert.equal(p.images[0].closed,1)
})

test('unsuccessful native removal cannot reveal a baseline frame with old photographic layers still present',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  await confirm(f,loaded,p.descriptor);loaded.dispose();f.failRemovalResult()
  f.facade.fenceSourceImagery();assert.equal(f.host.style.visibility,'hidden')
  assert.equal(f.owned().length,1)
  f.frame();f.frame()
  assert.equal(f.host.style.visibility,'hidden')
  assert.equal(f.native.state().available,false)
  assert.equal(loaded.getResourceState().leaseCount,1)
  assert.equal(f.native.state().retainedRgbaBytes,loaded.decodedByteLength)
  assert.equal(f.native.state().ownedPhotoLayerCount,1)
  f.failRemovalResult(false);f.native.destroy();f.viewer.destroy()
  assert.equal(p.images[0].closed,1)
})

test('failed actual Viewer destruction cannot release orphaned bitmaps merely because the adapter clears its getter',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  await confirm(f,loaded,p.descriptor)
  f.cancel();f.failRemoval();f.facade.fenceSourceImagery();loaded.dispose()
  const destroy=f.viewer.destroy
  f.viewer.destroy=()=>{throw Error('simulated actual Viewer destruction failure')}
  f.native.destroy()
  assert.equal(f.viewer.isDestroyed(),false);assert.equal(loaded.getResourceState().leaseCount,1)
  // The production outer renderer clears viewer=null after its best-effort
  // destroyCesiumResources calls, including a failed destroy. The already queued
  // fatal-stack cleanup still runs afterward and must use pinned native identity.
  f.loseViewerAccessor();await Promise.resolve();await Promise.resolve()
  assert.equal(f.viewer.isDestroyed(),false);assert.equal(f.owned().length,1)
  assert.equal(loaded.getResourceState().leaseCount,1);assert.equal(p.images[0].closed,0)
  assert.equal(f.native.state().retainedRgbaBytes,loaded.decodedByteLength)
  f.viewer.destroy=destroy;f.viewer.destroy();f.native.destroy();assert.equal(p.images[0].closed,1)
})

test('an uncooperative late decode after owner abort closes once and never reaches native allocation',async()=>{
  const decoded=deferred(),started=deferred(),abort=new AbortController()
  const p=transportFixture({decode:async()=>{started.resolve();return decoded.promise}}),f=await nativeFixture();await f.mount()
  const loading=p.load({signal:abort.signal});await started.promise
  f.facade.fenceSourceImagery();abort.abort()
  await assert.rejects(loading,error=>/aborted/.test(error.message)&&error.observedBytes===p.bytes.length)
  const late=p.makeImage();decoded.resolve(late);await Promise.resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(late.closed,1);assert.equal(f.owned().length,0);assert.equal(f.native.state().nativeFrameObserved,false)
  f.native.destroy()
})

test('an old baseline observer cannot release a newer fence or a destroyed native lifetime',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  await confirm(f,loaded,p.descriptor)
  f.facade.fenceSourceImagery();const oldBaseline=f.events.postRender.history.at(-1)
  f.facade.fenceSourceImagery();const currentBaseline=f.events.postRender.history.at(-1)
  oldBaseline();oldBaseline();assert.equal(f.host.style.visibility,'hidden')
  assert.equal(f.native.state().baselineFrameObserved,false)
  f.frame();assert.equal(f.host.style.visibility,'hidden')
  f.frame();assert.equal(f.host.style.visibility,'')
  f.native.destroy();currentBaseline();oldBaseline()
  assert.equal(f.host.style.visibility,'hidden');assert.equal(f.native.state().available,false)
  loaded.dispose();assert.equal(p.images[0].closed,1)
})

test('failed global native destroy keeps orphaned images fenced until a safe retry',async()=>{
  const p=transportFixture(),loaded=await p.load(),f=await nativeFixture();await f.mount()
  await confirm(f,loaded,p.descriptor);loaded.dispose();f.failRemoval()
  const destroy=f.viewer.destroy;f.viewer.destroy=()=>{throw Error('simulated failed global destroy')}
  assert.doesNotThrow(()=>f.native.destroy())
  assert.equal(f.viewer.isDestroyed(),false);assert.equal(loaded.getResourceState().leaseCount,1)
  assert.equal(p.images[0].closed,0);assert.equal(f.host.style.visibility,'hidden')
  f.viewer.destroy=destroy;f.native.destroy();assert.equal(f.viewer.isDestroyed(),true)
  assert.equal(loaded.getResourceState().leaseCount,0);assert.equal(p.images[0].closed,1)
})

