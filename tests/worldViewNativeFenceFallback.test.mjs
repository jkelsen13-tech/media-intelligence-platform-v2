// Actual mounted WorldView + Canvas + source owner + production outer/facade.
// Controlled native APIs, frames and decoded PNGs prove lifetime behavior only.
import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react-test-renderer'
import {mountedNativeFenceFallbackFixture,disclosures,jsonText,click,removeCompiled} from './helpers/worldViewNativeFenceFallbackFixture.mjs'
after(removeCompiled)

test('mounted native fence event fault chooses Atlas and retains a failed zero-photo Viewer until scheduled cleanup',{timeout:5000},async t=>{
  const f=await mountedNativeFenceFallbackFixture(t)
  await f.activate();await f.allocated.promise
  assert.equal(f.native.layers.length,5,'real bounded transport allocated four native photo layers')
  await act(async()=>{
    await Promise.all(f.native.layers.slice(1).map(layer=>layer.provider.requestImage(0,0,0)))
    f.native.frame();f.native.frame()
  })
  await f.flush()
  assert.equal(disclosures(f.tree).length,1,'current attachment has a confirmed production disclosure before the fault')
  assert.match(jsonText(f.tree),/Qualified imagery source:.*ACTIVE/)
  assert.match(jsonText(f.tree),/Photographic overlay capture 2023-03-07/)
  assert.ok(jsonText(f.tree).includes(f.payload.descriptor.metadata.attribution[0].text))
  assert.equal(f.payload.fetches.length,4)
  assert.equal(f.reservations,1)
  const before=f.owner.snapshot(),viewer=f.native.viewer,old=f.renderers[0]
  const original=viewer.scene.postRender.addEventListener
  viewer.scene.postRender.addEventListener=()=>{throw Error('PRIVATE_NATIVE_EVENT_FAULT_DO_NOT_PUBLISH')}
  f.native.controls.destroyFailure=true
  await f.update({investigationContext:{...f.props.investigationContext,as_of_time:'2024-04-08T18:00:01.000000001Z'}})
  const failed=f.owner.snapshot()
  assert.equal(failed.bridgeFailure,'native-source-fence-failed')
  assert.equal(failed.status,'fallback')
  for(const field of ['activeSourceId','activeDescriptor','observedLayer','pendingSourceId'])assert.equal(failed[field],null,field)
  assert.equal(disclosures(f.tree).length,0)
  assert.doesNotMatch(jsonText(f.tree),/Qualified imagery source:.*ACTIVE|Photographic overlay capture 2023|PRIVATE_NATIVE_EVENT/)
  assert.ok(!jsonText(f.tree).includes(f.payload.descriptor.metadata.attribution[0].text))
  assert.ok(!JSON.stringify(failed).includes(f.payload.packet.sourceId))
  assert.ok(!JSON.stringify(failed).includes('PRIVATE_NATIVE_EVENT'))
  assert.equal(failed.retiredNativeOwnerCount,1)
  assert.equal(failed.nativeOwnerCount,1)
  for(const field of ['retiredOwnedPhotoLayerCount','retiredRetainedRgbaBytes','retiredBitmapLeaseCount'])assert.equal(failed[field],0,field)
  assert.equal(failed.retiredNativeCountersComplete,true)
  assert.equal(f.native.adapter.getSourceImageryState().nativeTeardownPending,true,'zero photographic resources are not proof of Viewer destruction')
  assert.equal(viewer.isDestroyed(),false)
  assert.equal(viewer.useDefaultRenderLoop,false)
  assert.equal(viewer.element.isConnected,false)
  assert.equal(viewer.element.style.visibility,'hidden')
  assert.equal(f.native.layers.length,1)
  assert.deepEqual(f.payload.images.map(image=>image.closed),[1,1,1,1])
  assert.equal(f.timers.size,1)
  assert.equal([...f.timers.values()][0].at,1000)
  assert.equal(failed.aggregateAllowanceConsumedBytes,before.aggregateAllowanceConsumedBytes)
  assert.equal(failed.localSessionSerial,before.localSessionSerial)
  assert.equal(failed.localBudget.requests,before.localBudget.requests)
  assert.equal(failed.localBudget.pendingRequests,0)
  assert.equal(f.reservations,1)
  assert.equal(f.payload.fetches.length,4)
  assert.equal(f.renderers.length,1,'no replacement native renderer/facade is constructed')
  assert.equal(f.owner.canAllocateNative(),false)
  // This is the pre-correction product RED: retirement has detached the current
  // native host, yet the live Canvas used to keep that blank stack selected.
  assert.equal(f.tree.root.findAllByProps({'data-map-stack':'atlas-fallback'}).length,1,'live Canvas must choose the cheap Atlas map after the fixed native fence failure')
  assert.equal(f.tree.root.findAllByProps({className:'wv-map-host'}).length,0)

  await act(async()=>{
    old.options.onStackIdChange('ellipsoid-globe')
    old.options.onSourceImageryStateChange({available:true,status:'active',sourceId:'PRIVATE_STALE_SOURCE',nativeFrameObserved:true})
    f.owner.interact();f.owner.poll()
  })
  await f.flush()
  assert.equal(disclosures(f.tree).length,0)
  assert.doesNotMatch(jsonText(f.tree),/PRIVATE_STALE_SOURCE|Photographic overlay capture 2023|Qualified imagery source:.*ACTIVE/)
  assert.equal(f.tree.root.findAllByProps({'data-map-stack':'atlas-fallback'}).length,1)
  const attempts=f.native.controls.destroyCalls
  await act(async()=>f.advance(999));await f.flush()
  assert.equal(f.native.controls.destroyCalls,attempts,'cleanup respects its single backoff deadline')
  assert.equal(f.timers.size,1)
  viewer.scene.postRender.addEventListener=original;f.native.controls.destroyFailure=false
  await act(async()=>f.advance(1));await f.flush()
  assert.equal(viewer.isDestroyed(),true)
  assert.equal(f.native.adapter.getSourceImageryState().nativeTeardownPending,false)
  for(const field of ['nativeOwnerCount','retiredNativeOwnerCount','retiredOwnedPhotoLayerCount','retiredRetainedRgbaBytes','retiredBitmapLeaseCount'])assert.equal(f.owner.snapshot()[field],0,field)
  assert.equal(f.timers.size,0)
  assert.equal(f.owner.snapshot().bridgeFailure,'native-source-fence-failed')
  assert.equal(f.owner.canAllocateNative(),false)
  await click(f.tree,'Graph');await click(f.tree,'Map');await f.flush()
  assert.equal(disclosures(f.tree).length,0)
  assert.equal(f.tree.root.findAllByProps({'data-map-stack':'atlas-fallback'}).length,1)
  assert.equal(f.renderers.length,1)
  assert.equal(f.payload.fetches.length,4)
  assert.equal(f.reservations,1)
  assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,before.aggregateAllowanceConsumedBytes)
  assert.equal(f.owner.snapshot().localBudget.requests,before.localBudget.requests)
  assert.equal(f.owner.snapshot().localSessionSerial,before.localSessionSerial)
  assert.equal(f.owner.snapshot().requestSerial,before.requestSerial)
  assert.equal(f.native.viewer,viewer)
  assert.deepEqual(f.payload.images.map(image=>image.closed),[1,1,1,1])
})
