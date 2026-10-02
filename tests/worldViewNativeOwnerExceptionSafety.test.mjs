// Actual App source-owner and native facade exception regressions. Synthetic
// native API/bitmap probes qualify lifecycle safety, not real GPU or pixels.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorldViewRealismSession} from '../src/lib/worldViewRealismController.js'
import {WORLD_VIEW_REALISM_RIGHTS} from '../src/lib/worldViewRealismAdmission.js'
import {outerFixture} from './helpers/worldViewNativeRgbOuterFixture.mjs'

function fixture({pending=false}={}){
  let now=0,timerId=0,safe=false,destroys=0,loads=0,attaches=0,loadedDisposals=0,renderDisposals=0,resolveLoad,signal
  const timers=new Map(),queue=[],publications=[]
  const retirementScheduler={now:()=>now,setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,due:now+delay});return id},clearTimeout:id=>timers.delete(id)}
  const owner=createWorldViewRealismSession({retirementScheduler,enqueue:callback=>queue.push(callback)})
  const adapter={destroy(){destroys++;return safe},getSourceImageryState:()=>({nativeTeardownPending:!safe,ownedPhotoLayerCount:safe?0:4,retainedRgbaBytes:safe?0:64,bitmapLeaseCount:safe?0:1})}
  owner.registerNativeAttachment(adapter)
  const source={id:'PRIVATE_EXCEPTION_SOURCE_ONLY',kind:'imagery',contentKind:'cartographic',costTier:'cheap',admission:{approved:true,reference:'SIMULATED_ONLY'},rights:{reference:'SIMULATED_ONLY',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(k=>[k,true]))},
    attribution:[{text:'Synthetic exception qualification'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'SIMULATED_ONLY',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
    coverage:{crs:'EPSG:4326',bounds:[0,0,2,2]},resolutionMeters:1,lod:{min:0,max:0}}
  const loaded=()=>({observedBytes:16,dispose(){loadedDisposals++}})
  owner.setAccess({actorId:'PRIVATE_EXCEPTION_ACTOR_A',sessionReady:true});owner.configure({sources:[source],estimateBytes:()=>64,transport:{load:async(_descriptor,options)=>{
    loads++;signal=options.signal;return pending?new Promise(resolve=>{resolveLoad=resolve}):loaded()
  }}});owner.setScope({revision:'PRIVATE_EXCEPTION_REVISION_A'})
  const binding={state:()=>({available:true}),fence(){},attach:async()=>{attaches++;return {dispose(){renderDisposals++}}}}
  const unbind=owner.bindAttachment(binding,value=>publications.push(value))
  const request={kind:'imagery',bounds:[0,0,2,2],level:0}
  return {owner,adapter,binding,unbind,request,timers,queue,publications,retirementScheduler,
    load(){owner.interact();return owner.select(request)},throwFence(){binding.fence=()=>{throw Error('PRIVATE_THROW_DETAIL_DO_NOT_PUBLISH')}},
    finishLoad(){resolveLoad?.(loaded())},complete(){safe=true},advance(ms){now+=ms;for(const [id,item] of [...timers])if(item.due<=now){timers.delete(id);item.callback()}},
    get state(){return {destroys,loads,attaches,loadedDisposals,renderDisposals,signal}}
  }
}
function redacted(owner){
  const state=owner.snapshot();assert.equal(state.status,'fallback');assert.equal(state.activeSourceId,null);assert.equal(state.activeDescriptor,null);assert.equal(state.observedLayer,null);assert.equal(state.pendingSourceId,null)
  assert.equal(state.bridgeFailure,'native-source-fence-failed');assert.ok(!JSON.stringify(state).includes('PRIVATE_'))
}

for(const path of ['invalidate','setAccess','setScope','unbind','retain'])test(`${path} fence failure cancels stale display and preserves registered native cleanup`,async()=>{
  const f=fixture();await f.load();assert.equal(f.owner.snapshot().activeSourceId,'PRIVATE_EXCEPTION_SOURCE_ONLY')
  const release=path==='retain'?f.owner.retain():null
  const publicationStart=f.publications.length
  f.throwFence();const actions={invalidate:()=>f.owner.invalidateAttachment('scope-change'),setAccess:()=>f.owner.setAccess({actorId:'NEXT_ACTOR',sessionReady:true}),setScope:()=>f.owner.setScope({revision:'NEXT_REVISION'}),unbind:f.unbind,retain:release}
  assert.doesNotThrow(actions[path]);redacted(f.owner)
  assert.ok(f.publications.slice(publicationStart).every(value=>value.bridgeFailure==='native-source-fence-failed'&&value.status==='fallback'&&!JSON.stringify(value).includes('PRIVATE_')))
  assert.equal(f.state.loadedDisposals,1);assert.equal(f.state.renderDisposals,1)
  assert.equal(f.owner.snapshot().nativeOwnerCount,1);assert.equal(f.owner.snapshot().retiredNativeOwnerCount,1);assert.equal(f.owner.canAllocateNative(),false);assert.equal(f.timers.size,1)
  const loadCount=f.state.loads;f.owner.interact();await f.owner.select(f.request);assert.equal(f.state.loads,loadCount)
  if(path==='retain'){assert.equal(f.queue.length,1);f.queue.shift()();assert.equal(f.owner.snapshot().reason,'disposed')}
  f.owner.dispose();f.owner.dispose();assert.equal(f.state.destroys,1,'repeat terminal disposal cannot burst cleanup before backoff')
  f.complete();f.advance(1000);assert.equal(f.owner.snapshot().nativeOwnerCount,0);assert.equal(f.timers.size,0);assert.equal(f.owner.canAllocateNative(),false)
})

test('fence failure aborts an actual pending controller request before late transport settlement',async()=>{
  const f=fixture({pending:true}),loading=f.load();assert.equal(f.state.loads,1);assert.equal(f.state.signal.aborted,false)
  f.throwFence();assert.doesNotThrow(()=>f.owner.setScope({revision:'NEXT_PENDING_SCOPE'}));assert.equal(f.state.signal.aborted,true);redacted(f.owner)
  f.finishLoad();await loading;assert.equal(f.state.attaches,0);assert.equal(f.state.loadedDisposals,1);assert.equal(f.owner.snapshot().localBudget.pendingRequests,0)
  f.owner.dispose();f.complete();f.advance(1000);assert.equal(f.timers.size,0)
})

test('fence error blocks reentrant allocation before cancellation publication and retires all registered owners',async()=>{
  const f=fixture();await f.load();let nextSafe=false,nextDestroys=0;const reentries=[]
  const extra={destroy(){nextDestroys++;return nextSafe},getSourceImageryState:()=>({nativeTeardownPending:!nextSafe,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  assert.equal(f.owner.registerNativeAttachment(extra),true)
  const third={destroy:()=>true,getSourceImageryState:()=>({nativeTeardownPending:false,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0})}
  // Install the subscriber before enabling the confirmed native fence fault.
  f.owner.bindAttachment(f.binding,value=>{if(value.bridgeFailure!=='native-source-fence-failed')return;reentries.push({canAllocate:f.owner.canAllocateNative(),registered:f.owner.registerNativeAttachment(third)})})
  f.throwFence();assert.doesNotThrow(()=>f.owner.setScope({revision:'NEXT_FAILING_SCOPE'}));assert.ok(reentries.length>0);assert.ok(reentries.every(value=>value.canAllocate===false&&value.registered===false))
  assert.equal(f.owner.snapshot().retiredNativeOwnerCount,2);assert.equal(f.state.destroys,1);assert.equal(nextDestroys,1);assert.equal(f.timers.size,1)
  f.complete();nextSafe=true;f.advance(1000);assert.equal(f.owner.snapshot().nativeOwnerCount,0);assert.equal(f.timers.size,0)
  assert.equal(f.owner.canAllocateNative(),false,'the failed source bridge has no new native allocation authority');f.owner.dispose()
})

test('terminal fence failure still disposes controller, clears subscriptions/access and retires the native owner',async()=>{
  const f=fixture();await f.load();f.throwFence();assert.doesNotThrow(()=>f.owner.dispose())
  redacted(f.owner);assert.equal(f.owner.snapshot().localBudget.disposed,true);assert.equal(f.state.loadedDisposals,1);assert.equal(f.state.renderDisposals,1)
  const publications=f.publications.length;f.owner.setAccess({actorId:'DO_NOT_REBIND_TERMINAL',sessionReady:true});f.owner.setScope({revision:'DO_NOT_REBIND_TERMINAL'})
  f.owner.bindAttachment(f.binding,()=>{throw Error('terminal owner must not subscribe again')});f.owner.poll();assert.equal(f.publications.length,publications)
  assert.equal(f.state.destroys,1);assert.equal(f.timers.size,1);f.owner.dispose();assert.equal(f.state.destroys,1)
  f.complete();f.advance(1000);assert.equal(f.owner.snapshot().nativeOwnerCount,0);assert.equal(f.timers.size,0)
})

for(const preserveNative of [false,true])test(`actual native facade event-registration fence error keeps outer destruction reachable${preserveNative?' while Viewer removal also fails':''}`,async t=>{
  const f=await outerFixture(t,{facade:true}),timers=new Map();let now=0,id=0
  const owner=createWorldViewRealismSession({retirementScheduler:{now:()=>now,setTimeout(callback,delay){const key=++id;timers.set(key,{callback,due:now+delay});return key},clearTimeout:key=>timers.delete(key)}})
  owner.registerNativeAttachment(f.adapter);f.loaded.dispose()
  const original=f.viewer.scene.postRender.addEventListener
  f.viewer.scene.postRender.addEventListener=()=>{throw Error('PRIVATE_NATIVE_PUBLIC_EVENT_FAILURE')}
  owner.bindAttachment({state:f.adapter.getSourceImageryState,fence:f.adapter.fenceSourceImagery},()=>{})
  // Fence removes the source layers, then public event registration fails. A
  // separate native Viewer failure must still retain and retry the owner.
  f.controls.destroyFailure=preserveNative
  assert.doesNotThrow(()=>owner.dispose());await f.flush();f.viewer.scene.postRender.addEventListener=original
  assert.equal(owner.snapshot().bridgeFailure,'native-source-fence-failed');assert.ok(!JSON.stringify(owner.snapshot()).includes('PRIVATE_NATIVE'))
  assert.equal(f.viewer.isDestroyed(),!preserveNative);assert.equal(owner.snapshot().retiredNativeOwnerCount,preserveNative?1:0);assert.equal(timers.size,preserveNative?1:0)
  if(preserveNative){assert.equal(owner.canAllocateNative(),false);f.controls.destroyFailure=false;now=1000;for(const [key,item] of [...timers])if(item.due<=now){timers.delete(key);item.callback()}await f.flush()}
  assert.equal(f.viewer.isDestroyed(),true);assert.equal(owner.snapshot().nativeOwnerCount,0);assert.equal(timers.size,0)
  assert.deepEqual(f.transport.images.map(image=>image.closed),[1,1,1,1]);owner.dispose()
})
