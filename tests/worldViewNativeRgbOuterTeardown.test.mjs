// Actual production outer adapter and facade. The vendor, bitmap and frame
// doubles qualify native ownership/failure behavior, not photographic pixels.
import test from 'node:test'
import assert from 'node:assert/strict'
import { outerFixture } from './helpers/worldViewNativeRgbOuterFixture.mjs'
import { createWorldViewRendererAdapter } from '../src/lib/worldViewRendererAdapter.js'
import { resolveWorldViewSourceStatus, resolveWorldViewQualifiedOverlayStatus } from '../src/lib/worldViewSourceStatus.js'

test('healthy outer destroy releases all images once and repeated cleanup is inert',async t=>{
  const f=await outerFixture(t)
  f.loaded.dispose();f.adapter.destroy();await f.flush()
  assert.equal(f.viewer.isDestroyed(),true)
  assert.equal(f.layers.length,1)
  assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1])
  const attempts=f.controls.destroyCalls
  f.adapter.destroy();f.adapter.fenceSourceImagery();f.renderHandle.dispose();await f.flush()
  assert.equal(f.controls.destroyCalls,attempts)
  assert.equal(f.adapter.getSourceImageryState().ownedPhotoLayerCount,0)
})

for(const facade of [false,true])for(const fatal of [false,true])for(const returnsFalse of [false,true]){
  test(`${facade?'public facade':'outer adapter'} ${fatal?'fatal':'ordinary'} teardown retains failed native ownership (${returnsFalse?'false':'throw'} removal) and retries safely`,async t=>{
    const f=await outerFixture(t,{facade})
    const providers=f.layers.slice(1).map(layer=>layer.provider)
    f.loaded.dispose()
    f.controls.removalFailure=!returnsFalse;f.controls.removalReturnsFalse=returnsFalse;f.controls.destroyFailure=true
    if(fatal){
      f.fatal()
      assert.equal(f.viewer.isDestroyed(),false,'draw-stack failure never destroys the Scene synchronously')
      assert.deepEqual(f.transport.images.map(image=>image.closed),[0,0,0,0])
    }else f.adapter.destroy()
    await f.flush()
    const failed=f.snapshot(),state=failed.publicState
    assert.equal(failed.nativeViewerDestroyed,false)
    assert.equal(failed.nativePhotoLayers,4)
    assert.equal(failed.hostConnected,false)
    assert.equal(f.viewer.useDefaultRenderLoop,false)
    assert.deepEqual(failed.bitmapCloses,[0,0,0,0])
    assert.equal(state.available,false)
    assert.equal(state.visibilityFenced,true)
    assert.equal(state.nativeTeardownPending,true)
    assert.equal(state.ownedPhotoLayerCount,4)
    assert.equal(state.retainedRgbaBytes,64)
    assert.equal(state.bitmapLeaseCount,1)
    assert.ok(!state.sourceId&&!state.assetSha256&&!state.bounds,'detached counters expose no prior source identity')
    const stale=await Promise.allSettled(providers.map(provider=>provider.requestImage(0,0,0)))
    assert.ok(stale.every(result=>result.status==='rejected'))
    const attempts=f.controls.destroyCalls
    f.controls.destroyFailure=false;f.controls.removalFailure=false;f.controls.removalReturnsFalse=false
    if(returnsFalse)f.adapter.fenceSourceImagery();else f.adapter.destroy()
    await f.flush()
    assert.equal(f.viewer.isDestroyed(),true)
    assert.ok(f.controls.destroyCalls>attempts)
    assert.equal(f.layers.length,1)
    assert.equal(f.snapshot().hostConnected,false)
    assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1])
    const released=f.adapter.getSourceImageryState()
    assert.equal(released.ownedPhotoLayerCount,0)
    assert.equal(released.retainedRgbaBytes,0)
    assert.equal(released.bitmapLeaseCount,0)
    assert.equal(released.nativeTeardownPending,false)
    const completed=f.controls.destroyCalls
    f.adapter.destroy();f.adapter.fenceSourceImagery();f.renderHandle.dispose();await f.flush()
    assert.equal(f.controls.destroyCalls,completed)
    assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1])
    await assert.rejects(f.adapter.attachSourceImagery(f.loaded,f.transport.descriptor),/unavailable|ready|binding/)
  })
}

test('a surviving Viewer remains retryable even after safe layer removal closes every image',async t=>{
  const f=await outerFixture(t,{facade:true})
  f.loaded.dispose();f.controls.destroyFailure=true
  f.adapter.destroy();await f.flush()
  assert.equal(f.viewer.isDestroyed(),false)
  assert.equal(f.layers.length,1)
  const state=f.adapter.getSourceImageryState()
  assert.equal(state.nativeTeardownPending,true)
  assert.equal(state.retainedRgbaBytes,0)
  assert.equal(state.bitmapLeaseCount,0)
  assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1])
  f.controls.destroyFailure=false;f.adapter.destroy();await f.flush()
  assert.equal(f.viewer.isDestroyed(),true)
  assert.equal(f.adapter.getSourceImageryState().nativeTeardownPending,false)
  assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1])
})

test('a known photographic capture stays separate from unknown baseline and elevation dates',async t=>{
  const f=await outerFixture(t)
  const source={id:f.transport.packet.sourceId,assetSha256:f.transport.packet.registeredAssetSha256,
    contentKind:'photographic',capture:f.transport.packet.capture,coverage:f.transport.packet.coverage,attribution:f.transport.descriptor.metadata.attribution}
  const overlay=resolveWorldViewQualifiedOverlayStatus({layer:{status:'ACTIVE',activeSource:source},nativeState:f.adapter.getSourceImageryState()})
  assert.equal(overlay.status,'ACTIVE')
  assert.deepEqual(overlay.capture,{precision:'day',start:'2023-03-07'})
  const baseline=resolveWorldViewSourceStatus({stackId:'ellipsoid-globe',rendererReady:true}).sourceCapture
  assert.equal(baseline.status,'UNKNOWN')
  assert.equal(baseline.label,'Baseline capture dates unknown')
  assert.match(baseline.detail,/^Cartographic baseline and elevation capture dates are not established\./)
  assert.match(baseline.detail,/not matched to investigation or evidence time/)
  f.loaded.dispose();f.adapter.destroy()
})

test('void cleanup remains completed for the existing non-native facade contract',async()=>{
  let calls=0
  const facade=createWorldViewRendererAdapter({stackId:'osm'},{createMapAdapter:()=>({mount:async()=>{},destroy(){calls++}})})
  await facade.mount()
  assert.equal(facade.destroy(),true)
  facade.destroy();facade.fenceSourceImagery()
  assert.equal(calls,1)
  assert.equal(facade.getSourceImageryState().nativeTeardownPending,false)
})
