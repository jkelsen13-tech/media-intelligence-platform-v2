// Mounted production WorldView + Canvas + source owner/resolver. Renderer and
// payload observations are explicit lifecycle doubles, never pixel evidence.
import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react-test-renderer'
import {mountedDisclosureFixture,disclosures,jsonText,click,sourceCredit,removeCompiled,deferred} from './helpers/worldViewNativeDisclosureFixture.mjs'
import {outerFixture} from './helpers/worldViewNativeRgbOuterFixture.mjs'
import {WORLD_VIEW_REALISM_RIGHTS} from '../src/lib/worldViewRealismAdmission.js'
after(removeCompiled)

test('Map→Graph clears mounted source disclosure and Map return waits for current attachment',async t=>{
  const f=await mountedDisclosureFixture(t)
  await f.activate()
  assert.equal(disclosures(f.tree).length,1)
  assert.match(jsonText(f.tree),/Qualified imagery source:.*ACTIVE/)
  assert.ok(jsonText(f.tree).includes(sourceCredit))
  const allowance=f.owner.snapshot().aggregateAllowanceConsumedBytes,old=f.renderers[0]
  await click(f.tree,'Graph');await f.flush()
  assert.equal(disclosures(f.tree).length,0,'no photographic capture/attribution disclosure without a mounted map')
  assert.ok(!jsonText(f.tree).includes(sourceCredit))
  assert.doesNotMatch(jsonText(f.tree),/Qualified imagery source:.*ACTIVE|Photographic overlay capture 2023/)
  assert.equal(f.owner.snapshot().activeSourceId,null)
  await act(async()=>old.options.onSourceImageryStateChange({available:true,status:'active',sourceId:'OLD_FORBIDDEN_ID',nativeFrameObserved:true}))
  assert.equal(disclosures(f.tree).length,0,'obsolete native callback cannot restore Graph disclosure')
  f.blockRequest();await click(f.tree,'Map');await f.flush()
  assert.equal(disclosures(f.tree).length,0,'remount cannot resurrect the retained snapshot under the same access key')
  assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,allowance,'ordinary mode change retains allowance')
  f.allowRequest();await f.activate()
  assert.equal(disclosures(f.tree).length,1,'fresh current attachment may disclose its own source')
  assert.equal(f.loads.length,2)
})

test('Canvas unmount clears the latest parent callback once while obsolete native callbacks stay fenced',async t=>{
  const oldStatuses=[],latestStatuses=[]
  const f=await mountedDisclosureFixture(t,{standalone:true,statuses:oldStatuses})
  await f.activate()
  assert.equal(oldStatuses.at(-1).photographicOverlay.status,'ACTIVE')
  await f.update({onSourceStatus:value=>latestStatuses.push(value)})
  assert.equal(latestStatuses.at(-1).photographicOverlay.status,'ACTIVE')
  const oldRenderer=f.renderers[0]
  await f.unmount()
  assert.equal(latestStatuses.at(-1),null,'cleanup publishes a clear even though its ordinary subscriber is already inactive')
  assert.equal(latestStatuses.filter(value=>value===null).length,1)
  assert.ok(oldStatuses.every(value=>value!==null),'cleanup uses the latest parent callback')
  const count=latestStatuses.length
  await act(async()=>{
    oldRenderer.options.onSourceImageryStateChange({available:true,status:'active',sourceId:'FORBIDDEN_UNMOUNT_ID',nativeFrameObserved:true})
    oldRenderer.options.onSourceStatusChange({status:'active'})
    oldRenderer.options.onStackIdChange('ellipsoid-globe')
  })
  assert.equal(latestStatuses.length,count)
  assert.equal(f.owner.snapshot().activeSourceId,null)
  assert.deepEqual(f.cleanupCounts,{loadedCloses:1,renderCloses:1})
})

test('late source completion after Graph departure cannot disclose or attach into a replacement Canvas',async t=>{
  const f=await mountedDisclosureFixture(t,{pendingLoads:true})
  await f.activate()
  assert.equal(f.loads.length,1)
  assert.equal(disclosures(f.tree).length,0)
  const obsolete=f.loads[0],old=f.renderers[0]
  await click(f.tree,'Graph');await f.flush()
  assert.equal(obsolete.options.signal.aborted,true)
  f.blockRequest();await click(f.tree,'Map');await f.flush()
  await act(async()=>obsolete.gate.resolve());await f.flush()
  assert.deepEqual(f.cleanupCounts,{loadedCloses:1,renderCloses:0})
  assert.equal(disclosures(f.tree).length,0)
  await act(async()=>old.options.onSourceImageryStateChange({available:true,status:'active',sourceId:'FORBIDDEN_LATE_SOURCE_ID',nativeFrameObserved:true}))
  assert.equal(disclosures(f.tree).length,0)
  assert.ok(!jsonText(f.tree).includes(sourceCredit))
  f.allowRequest();await f.activate()
  assert.equal(f.loads.length,2)
  assert.equal(disclosures(f.tree).length,0,'new loading state does not reuse an old frame confirmation')
  await act(async()=>f.loads[1].gate.resolve());await f.flush()
  assert.equal(disclosures(f.tree).length,1)
  assert.equal(f.owner.snapshot().localSessionSerial,1,'renderer replacement does not replace the accounting owner')
})

test('Atlas fallback removes photographic disclosure and retired renderer callbacks cannot restore it',async t=>{
  const f=await mountedDisclosureFixture(t)
  await f.activate()
  assert.equal(disclosures(f.tree).length,1)
  const old=f.renderers[0],allowance=f.owner.snapshot().aggregateAllowanceConsumedBytes
  await act(async()=>old.options.onStackIdChange('atlas-fallback'));await f.flush()
  assert.equal(f.tree.root.findAllByProps({className:'wv-map-host'}).length,0)
  assert.equal(disclosures(f.tree).length,0)
  assert.ok(!jsonText(f.tree).includes(sourceCredit))
  assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,allowance)
  await act(async()=>old.options.onSourceImageryStateChange({available:true,status:'active',sourceId:'FORBIDDEN_ATLAS_OLD_SOURCE',nativeFrameObserved:true}))
  assert.equal(disclosures(f.tree).length,0)
  f.blockRequest();await click(f.tree,'Graph');await click(f.tree,'Map');await f.flush()
  assert.equal(disclosures(f.tree).length,0)
  assert.ok(!jsonText(f.tree).includes(sourceCredit))
})

test('actor, logout, same-actor re-entry and exact recorded-time changes never reuse old disclosure or source identity',async t=>{
  const f=await mountedDisclosureFixture(t)
  await f.activate()
  const old=f.renderers[0],allowance=f.owner.snapshot().aggregateAllowanceConsumedBytes
  for(const [access,key] of [
    [{actorId:'SIMULATED_ACTOR_B',sessionReady:true},'scope-B'],
    [{actorId:null,sessionReady:false},'scope-unready'],
    [{actorId:'SIMULATED_ACTOR_A',sessionReady:true},'scope-A-reentry'],
  ]){
    await f.access(access,key)
    await act(async()=>old.options.onSourceImageryStateChange({available:true,status:'active',sourceId:'FORBIDDEN_ACCOUNT_SOURCE',nativeFrameObserved:true}))
    await f.flush()
    assert.equal(disclosures(f.tree).length,0)
    assert.ok(!jsonText(f.tree).includes(sourceCredit))
    const snapshot=JSON.stringify(f.owner.snapshot())
    assert.ok(!snapshot.includes('SIMULATED_PRIVATE_OLD_SOURCE_ID'))
    assert.ok(!snapshot.includes('FORBIDDEN_ACCOUNT_SOURCE'))
    assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,allowance)
  }
  f.allowRequest();await f.activate();assert.equal(disclosures(f.tree).length,1)
  f.blockRequest()
  await f.update({investigationContext:{...f.props.investigationContext,as_of_time:'2024-04-08T18:00:01.000000001Z'}})
  assert.equal(disclosures(f.tree).length,0,'exact inspection-time change clears frame-bound source disclosure even with the same access key')
  assert.ok(!jsonText(f.tree).includes(sourceCredit))
  assert.equal(f.owner.snapshot().activeSourceId,null)
})

test('mounted Graph departure retains genuine decoded native leases for retry without disclosure or new native allocation',{timeout:5000},async t=>{
  // The actual production transport, native manager, facade and App-local
  // retirement owner execute. Controlled Viewer/frame/bitmap doubles prove
  // failure ownership only; they are not actual photographic pixel evidence.
  let clock=0,next=0
  const timers=new Map(),retirementScheduler={now:()=>clock,setTimeout:(fn,delay)=>{timers.set(++next,{fn,at:clock+delay});return next},clearTimeout:id=>timers.delete(id)}
  const native=await outerFixture(t,{facade:true,attach:false,deferMount:true})
  const payload=native.transport
  const source={id:payload.packet.sourceId,kind:'imagery',contentKind:'photographic',costTier:'cheap',
    admission:{approved:true,reference:'SIMULATED_TEST_AUTHORITY_ONLY'},rights:{reference:'SIMULATED_TEST_AUTHORITY_ONLY',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(name=>[name,true]))},
    attribution:payload.descriptor.metadata.attribution,qualification:{bytesVerified:true,sha256:payload.packet.registeredAssetSha256,reference:'SIMULATED_TEST_AUTHORITY_ONLY',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
    coverage:payload.packet.coverage,capture:{verified:true,...payload.packet.capture},resolutionMeters:2,lod:{min:0,max:0}}
  const services={sources:[source],estimateBytes:()=>4096,budgetOptions:{maxRequests:4,maxBytes:32768,now:()=>0},
    getRequest:()=>({kind:'imagery',bounds:[0,0,2,2],level:0}),transport:payload.transport}
  const allocated=deferred()
  const f=await mountedDisclosureFixture(t,{services,sessionOptions:{retirementScheduler},renderer:options=>{
    // Keep unrelated projection markers out of this source-lifetime vendor
    // fixture; source attach/state/fence/destroy/mount remain real facade calls.
    return {...native.adapter,setFeatures:async()=>{},attachSourceImagery:(...args)=>{
      const attaching=native.adapter.attachSourceImagery(...args);allocated.resolve();return attaching
    }}
  }})
  await f.activate()
  await allocated.promise
  assert.equal(native.layers.length,5,'the real transport must finish and the actual native adapter must allocate before frames are observed')
  await act(async()=>{await Promise.all(native.layers.slice(1).map(layer=>layer.provider.requestImage(0,0,0)));native.frame();native.frame()})
  await f.flush()
  assert.equal(disclosures(f.tree).length,1,JSON.stringify({owner:f.owner.snapshot(),native:native.adapter.getSourceImageryState()}))
  assert.equal(native.adapter.getSourceImageryState().ownedPhotoLayerCount,4)
  native.controls.removalFailure=true;native.controls.destroyFailure=true
  await click(f.tree,'Graph');await f.flush()
  assert.equal(disclosures(f.tree).length,0)
  assert.equal(native.viewer.isDestroyed(),false)
  assert.deepEqual(payload.images.map(image=>image.closed),[0,0,0,0])
  const retained=f.owner.snapshot()
  assert.equal(retained.retiredNativeOwnerCount,1)
  assert.equal(retained.retiredOwnedPhotoLayerCount,4)
  assert.equal(retained.retiredRetainedRgbaBytes,64)
  assert.equal(retained.retiredBitmapLeaseCount,1)
  assert.equal(retained.retiredNativeCountersComplete,true)
  assert.equal(retained.activeSourceId,null)
  assert.ok(!JSON.stringify(retained).includes(payload.packet.sourceId),'retirement projection carries no old source identity')
  assert.equal(timers.size,1)
  await click(f.tree,'Map');await f.flush()
  assert.equal(f.renderers.length,1,'retirement blocks allocation before renderer/facade creation')
  assert.equal(f.tree.root.findAllByProps({className:'wv-map-host'}).length,0,'current map safely uses the cheap overview')
  assert.equal(disclosures(f.tree).length,0)
  native.controls.removalFailure=false;native.controls.destroyFailure=false
  clock=1000
  await act(async()=>{for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn()}})
  await f.flush()
  assert.equal(native.viewer.isDestroyed(),true)
  assert.deepEqual(payload.images.map(image=>image.closed),[1,1,1,1])
  for(const field of ['retiredNativeOwnerCount','retiredOwnedPhotoLayerCount','retiredRetainedRgbaBytes','retiredBitmapLeaseCount'])assert.equal(f.owner.snapshot()[field],0,field)
  assert.equal(timers.size,0)
  assert.equal(disclosures(f.tree).length,0)
  f.owner.poll();f.owner.dispose();f.owner.dispose()
  assert.deepEqual(payload.images.map(image=>image.closed),[1,1,1,1],'repeated terminal cleanup closes each bitmap once')
})

const emptyNativeOwner=()=>({destroy(){return true},getSourceImageryState:()=>({available:false,nativeTeardownPending:false,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})})
test('mounted Canvas refuses native allocation before construction when the production owner capacity is full',async t=>{
  const f=await mountedDisclosureFixture(t,{beforeMountOwner:owner=>{
    for(let i=0;i<32;i++)assert.equal(owner.registerNativeAttachment(emptyNativeOwner()),true)
  }})
  assert.equal(f.owner.snapshot().nativeOwnerCount,32)
  assert.equal(f.renderers.length,0)
  assert.equal(f.tree.root.findAllByProps({className:'wv-map-host'}).length,0)
  assert.equal(disclosures(f.tree).length,0)
})

test('registration refusal after a reentrant factory destroys only its unmounted facade and never mounts native resources',async t=>{
  let mounts=0,destroys=0
  const f=await mountedDisclosureFixture(t,{renderer:(_options,owner)=>{
    for(let i=0;i<32;i++)assert.equal(owner.registerNativeAttachment(emptyNativeOwner()),true)
    return {mount(){mounts++},destroy(){destroys++;return true},getSourceImageryState:()=>({available:false,nativeTeardownPending:false,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  }})
  assert.equal(mounts,0)
  assert.equal(destroys,1)
  assert.equal(f.owner.snapshot().nativeOwnerCount,32)
  assert.equal(f.tree.root.findAllByProps({className:'wv-map-host'}).length,0)
  assert.equal(disclosures(f.tree).length,0)
})
