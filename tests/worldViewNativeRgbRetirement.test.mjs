// Native ownership/accounting probes; these doubles do not render real pixels.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorldViewRealismSession } from '../src/lib/worldViewRealismController.js'
import { outerFixture } from './helpers/worldViewNativeRgbOuterFixture.mjs'

function clock(){
  let now=0,serial=0
  const pending=new Map(),history=[]
  return {scheduler:{now:()=>now,setTimeout(callback,delay){const id=++serial;pending.set(id,{callback,at:now+delay});history.push({callback,delay});return id},clearTimeout:id=>pending.delete(id)},
    pending,history,advance(delta){now+=delta;for(const [id,item] of [...pending])if(item.at<=now){pending.delete(id);item.callback()}}}
}

function configure(owner,f){
  const packet=f.transport.packet
  const source={id:packet.sourceId,kind:'imagery',contentKind:'photographic',costTier:'cheap',admission:{approved:true,reference:'SIMULATED'},
    rights:{reference:'SIMULATED',commercial:true,publicWeb:true,cache:true,redistribution:true,derivatives:true,analyticalUse:true,attribution:true},
    attribution:f.transport.descriptor.metadata.attribution,
    qualification:{bytesVerified:true,sha256:packet.registeredAssetSha256,reference:'SIMULATED',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
    coverage:packet.coverage,capture:{...packet.capture,verified:true},resolutionMeters:1,lod:{min:0,max:0}}
  owner.setAccess({actorId:'A',sessionReady:true})
  assert.equal(owner.configure({sources:[source],transport:f.transport.transport,estimateBytes:()=>4096}),true)
  owner.setScope({revision:'v1',time:'2024-04-08T12:00:00Z'})
  let reached
  const allocated=new Promise(resolve=>{reached=resolve})
  const unbind=owner.bindAttachment({state:f.adapter.getSourceImageryState,attach(loaded,descriptor,options){
    const pending=f.adapter.attachSourceImagery(loaded,descriptor,options)
    reached();return pending
  },fence:f.adapter.fenceSourceImagery},()=>{})
  return {unbind,allocated,request:{kind:'imagery',bounds:packet.coverage.bounds,level:0}}
}

async function load(owner,f,request,allocated){
  owner.interact()
  const loading=owner.select(request)
  await Promise.race([allocated,loading.then(()=>{throw Error('source controller completed without native allocation')})])
  assert.equal(f.layers.length,5,'actual production transport and facade allocated all four bounded providers')
  const providers=f.layers.slice(1).map(layer=>layer.provider)
  await Promise.all(providers.map(provider=>provider.requestImage(0,0,0)))
  f.frame();f.frame()
  await loading
  assert.equal(owner.snapshot().status,'active')
  return providers
}

for(const terminal of [false,true])test(`App owner preserves detached failed facade after dropped binding${terminal?' and terminal App unmount':''}`,async t=>{
  const f=await outerFixture(t,{facade:true,attach:false,deferMount:true}),time=clock()
  const owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
  assert.equal(owner.registerNativeAttachment(f.adapter),true,'registration precedes actual native mount')
  await f.adapter.mount()
  const {unbind,request,allocated}=configure(owner,f),providers=await load(owner,f,request,allocated)
  const before=owner.snapshot(),gets=f.transport.fetches.length
  assert.equal(gets,4);assert.equal(before.localBudget.requests,1)
  f.controls.removalFailure=true;f.controls.destroyFailure=true
  unbind();assert.equal(owner.retireAttachment(f.adapter),false)
  await f.flush()
  assert.equal(f.viewer.useDefaultRenderLoop,false)
  assert.equal(f.snapshot().hostConnected,false)
  assert.equal(owner.canAllocateNative(),false)
  const pending=owner.snapshot()
  assert.equal(pending.retiredNativeOwnerCount,1)
  assert.equal(pending.retiredOwnedPhotoLayerCount,4)
  assert.equal(pending.retiredRetainedRgbaBytes,64)
  assert.equal(pending.retiredBitmapLeaseCount,1)
  assert.equal(pending.retiredNativeCountersComplete,true)
  assert.equal(time.pending.size,1)
  assert.equal(time.history[0].delay,1000)
  owner.setAccess({actorId:'B',sessionReady:true});owner.setScope({revision:'new-actor-version',time:'2024-04-09T12:00:00Z'})
  owner.bindAttachment({state:()=>({available:true}),fence(){},attach(){throw Error('retirement must refuse before attachment')}},()=>{})
  await owner.select(request)
  assert.equal(f.transport.fetches.length,gets)
  assert.equal(owner.snapshot().localBudget.requests,before.localBudget.requests)
  assert.equal(owner.snapshot().localBudget.allowanceConsumedBytes,before.localBudget.allowanceConsumedBytes)
  assert.ok(!JSON.stringify(owner.snapshot()).includes(f.transport.packet.sourceId),'retirement counters expose no old source identity after account switch')
  assert.equal(owner.snapshot().activeSourceId,null)
  assert.ok((await Promise.allSettled(providers.map(provider=>provider.requestImage(0,0,0)))).every(result=>result.status==='rejected'))
  if(terminal)owner.dispose()
  const attempts=f.controls.destroyCalls
  time.advance(999);owner.poll()
  assert.equal(f.controls.destroyCalls,attempts)
  time.advance(1);await f.flush()
  assert.ok(f.controls.destroyCalls>attempts)
  assert.equal(time.pending.size,1)
  assert.equal(time.history.at(-1).delay,2000)
  const failedAttempts=f.controls.destroyCalls
  owner.poll();owner.poll()
  assert.equal(f.controls.destroyCalls,failedAttempts,'poll cannot burst retries before the next backoff deadline')
  f.controls.removalFailure=false;f.controls.destroyFailure=false
  time.advance(2000);await f.flush()
  assert.equal(f.viewer.isDestroyed(),true)
  assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1])
  assert.equal(owner.snapshot().retiredNativeOwnerCount,0)
  assert.equal(owner.snapshot().retiredRetainedRgbaBytes,0)
  assert.equal(owner.snapshot().nativeOwnerCount,0)
  assert.equal(time.pending.size,0)
  assert.equal(owner.canAllocateNative(),!terminal)
  assert.equal(f.transport.fetches.length,gets)
  assert.equal(owner.snapshot().aggregateAllowanceConsumedBytes,before.aggregateAllowanceConsumedBytes)
  const completeAttempts=f.controls.destroyCalls
  for(const {callback} of time.history)callback()
  time.advance(100000);owner.poll()
  assert.equal(f.controls.destroyCalls,completeAttempts,'obsolete timer callbacks cannot revive a completed native lifetime')
  assert.equal(time.pending.size,0)
  assert.equal(owner.snapshot().activeSourceId,null)
  owner.dispose()
})

test('the literal32 native owner capacity refuses before allocation and never evicts permanent failures',()=>{
  const time=clock(),owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
  let failures=true,calls=0
  const adapters=Array.from({length:33},()=>({destroy(){calls++;return !failures},getSourceImageryState:()=>({nativeTeardownPending:failures,ownedPhotoLayerCount:failures?4:0,retainedRgbaBytes:failures?64:0,bitmapLeaseCount:failures?1:0})}))
  for(const adapter of adapters.slice(0,32))assert.equal(owner.registerNativeAttachment(adapter),true)
  assert.equal(owner.snapshot().nativeOwnerCapacity,32)
  assert.equal(owner.snapshot().nativeOwnerCount,32)
  assert.equal(owner.canAllocateNative(),false)
  assert.equal(owner.registerNativeAttachment(adapters[32]),false)
  assert.equal(owner.retireAttachment(adapters[32]),false,'unregistered rejected caller keeps its own handle')
  assert.equal(calls,0,'overflow registration does not allocate or destroy an unowned native handle')
  owner.dispose()
  assert.equal(owner.snapshot().retiredNativeOwnerCount,32)
  assert.equal(owner.snapshot().retiredOwnedPhotoLayerCount,128)
  assert.equal(owner.snapshot().retiredRetainedRgbaBytes,2048)
  assert.equal(time.pending.size,1)
  for(const step of [1000,2000,4000,8000,16000,30000,30000]){
    time.advance(step)
    assert.equal(owner.snapshot().retiredNativeOwnerCount,32)
    assert.equal(owner.snapshot().nativeOwnerCount,32)
    assert.equal(time.pending.size,1)
    assert.ok(time.history.at(-1).delay<=30000)
  }
  failures=false;time.advance(30000)
  assert.equal(owner.snapshot().retiredNativeOwnerCount,0)
  assert.equal(owner.snapshot().nativeOwnerCount,0)
  assert.equal(time.pending.size,0)
  assert.equal(owner.canAllocateNative(),false,'terminal cleanup cannot create a fresh source session')
})

test('retirement stops the sole scheduled timer when explicit polling verifies native completion',()=>{
  const time=clock(),owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
  let complete=false,calls=0
  const adapter={destroy(){calls++;return complete},getSourceImageryState:()=>({nativeTeardownPending:!complete,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  assert.equal(owner.registerNativeAttachment(adapter),true)
  owner.retireAttachment(adapter)
  complete=true
  // Move time to the deadline without invoking the scheduled callback, then
  // poll. The old callback may still arrive but cannot schedule another timer.
  time.scheduler.now=()=>1000
  owner.poll()
  assert.equal(time.pending.size,0)
  const finalCalls=calls
  time.history[0].callback()
  assert.equal(calls,finalCalls)
  assert.equal(owner.snapshot().retiredNativeOwnerCount,0)
  owner.dispose()
})

test('a failed explicit poll replaces the old due timer with one later backoff retry',()=>{
  const time=clock(),owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
  let complete=false,calls=0,now=0
  time.scheduler.now=()=>now
  const adapter={destroy(){calls++;return complete},getSourceImageryState:()=>({nativeTeardownPending:!complete,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  owner.registerNativeAttachment(adapter);owner.retireAttachment(adapter)
  const old=time.history[0].callback
  now=1000;owner.poll()
  assert.equal(calls,2)
  assert.equal(time.pending.size,1)
  assert.equal(time.history.at(-1).delay,2000)
  old();assert.equal(calls,2);assert.equal(time.pending.size,1)
  complete=true;now=3000;owner.poll()
  assert.equal(calls,3)
  assert.equal(time.pending.size,0)
  assert.equal(owner.snapshot().retiredNativeOwnerCount,0)
  owner.dispose()
})

test('native destroy reentry cannot register extra allocations, recurse or multiply retirement timers',()=>{
  const time=clock(),owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
  let calls=0,complete=false
  const extra={destroy:()=>true,getSourceImageryState:()=>({nativeTeardownPending:false,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  const adapter={destroy(){calls++
    assert.equal(owner.canAllocateNative(),false)
    assert.equal(owner.registerNativeAttachment(extra),false)
    assert.equal(owner.retireAttachment(adapter),false)
    return complete
  },getSourceImageryState:()=>({nativeTeardownPending:!complete,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  owner.registerNativeAttachment(adapter)
  owner.retireAttachment(adapter)
  assert.equal(calls,1)
  assert.equal(owner.snapshot().nativeOwnerCount,1)
  assert.equal(time.pending.size,1)
  complete=true;time.advance(1000)
  assert.equal(calls,2)
  assert.equal(owner.snapshot().nativeOwnerCount,0)
  assert.equal(time.pending.size,0)
  owner.dispose()
})

test('native completion requires explicit true and verified zero counters, including zero-photo surviving Viewer',()=>{
  for(const result of [undefined,false,true])for(const unsafe of ['surviving-viewer','missing-counter','throwing-observation']){
    const time=clock(),owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
    let repaired=false
    const adapter={destroy:()=>repaired?true:result,getSourceImageryState(){
      if(!repaired&&unsafe==='throwing-observation')throw Error('unknown retained ownership')
      return {nativeTeardownPending:!repaired&&unsafe==='surviving-viewer',ownedPhotoLayerCount:0,bitmapLeaseCount:0,
        ...(repaired||unsafe!=='missing-counter'?{retainedRgbaBytes:0}:{})}
    }}
    owner.registerNativeAttachment(adapter)
    assert.equal(owner.retireAttachment(adapter),false)
    assert.equal(owner.snapshot().retiredNativeOwnerCount,1)
    assert.equal(owner.canAllocateNative(),false)
    if(unsafe!=='surviving-viewer')assert.equal(owner.snapshot().retiredNativeCountersComplete,false)
    repaired=true;time.advance(1000)
    assert.equal(owner.snapshot().retiredNativeOwnerCount,0)
    assert.equal(time.pending.size,0)
    owner.dispose()
  }
})

test('reentrant second-owner failure while the first succeeds preserves one backoff timer and both capacity slots',()=>{
  const time=clock(),owner=createWorldViewRealismSession({retirementScheduler:time.scheduler})
  let complete=false,firstCalls=0,secondCalls=0
  const state=()=>({nativeTeardownPending:!complete,ownedPhotoLayerCount:complete?0:4,retainedRgbaBytes:complete?0:64,bitmapLeaseCount:complete?0:1})
  const second={destroy(){secondCalls++;return complete},getSourceImageryState:state}
  const first={destroy(){firstCalls++;owner.retireAttachment(second);return true},getSourceImageryState:()=>({nativeTeardownPending:false,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  owner.registerNativeAttachment(first);owner.registerNativeAttachment(second)
  assert.equal(owner.retireAttachment(first),true)
  assert.equal(firstCalls,1);assert.equal(secondCalls,0)
  assert.equal(owner.snapshot().nativeOwnerCount,1)
  assert.equal(owner.snapshot().retiredNativeOwnerCount,1)
  assert.equal(time.pending.size,1)
  assert.equal(time.history[0].delay,1000)
  time.advance(1000)
  assert.equal(secondCalls,1);assert.equal(time.pending.size,1)
  complete=true;time.advance(2000)
  assert.equal(secondCalls,2);assert.equal(owner.snapshot().nativeOwnerCount,0)
  assert.equal(time.pending.size,0)
  owner.dispose()
})
