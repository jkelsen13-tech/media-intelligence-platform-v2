import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorldViewRealismSession,createWorldViewRealismController} from '../src/lib/worldViewRealismController.js'
const source={id:'TEST_ONLY',kind:'imagery',contentKind:'photographic',costTier:'cheap',admission:{approved:true,reference:'SIMULATED'},rights:{reference:'SIMULATED',commercial:true,publicWeb:true,cache:true,redistribution:true,derivatives:true,analyticalUse:true,attribution:true},attribution:[{text:'SIMULATED'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'SIMULATED',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},coverage:{crs:'EPSG:4326',bounds:[0,0,1,1]},capture:{verified:true,start:'2023-03-07',precision:'day'},resolutionMeters:1,lod:{min:0,max:0}}
const request={kind:'imagery',bounds:[0,0,1,1],level:0}
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}}
function fixture({transport,estimate=100,budgetOptions,enqueue,services:given}={}){
  let access={actorId:'A',sessionReady:true,subject:'first',at:'2024-04-08T18:00:00.000001Z'},loads=0,disposals=0,renders=0,fences=0
  const owner=createWorldViewRealismSession({enqueue})
  owner.setCurrentAccessGetter(()=>access);owner.setAccess(access)
  const services=given??{sources:[source],estimateBytes:()=>estimate,budgetOptions,transport:transport??{load:async()=>{loads++;return {observedBytes:10,dispose(){disposals++}}}}}
  assert.equal(owner.configure(services),true)
  const attachment={state:()=>({available:true}),fence(){fences++},attach:async(l,d)=>{renders++;return {observation:{sourceId:d.sourceId,status:'active',rendered:true,successes:1,attributionVisible:true,bounds:d.bounds,level:d.level,ancestry:d.ancestry},dispose(){}}}}
  let unbind=owner.bindAttachment(attachment,()=>{});owner.setScope({revision:'v1',time:access.at});owner.interact()
  return {owner,services,attachment,stats:()=>({loads,disposals,renders,fences}),
    access(next){access=next;owner.setAccess(next)},current(){return access},
    detach(){unbind()},bind(){unbind=owner.bindAttachment(attachment,()=>{});owner.setScope({revision:'v1',time:access.at});owner.interact()},
    async load(){return owner.select(request)}}
}
test('App-local owner retains allowance and unique identities through canvas/WorldView remounts',async()=>{
  const f=fixture();await f.load();f.detach();f.bind();await f.load()
  assert.equal(f.owner.snapshot().localBudget.requests,2);assert.equal(f.owner.snapshot().requestSerial,2)
  assert.equal(f.owner.snapshot().localBudget.allowanceConsumedBytes,200);assert.equal(f.owner.snapshot().localSessionSerial,1)
  f.owner.dispose()
})
test('third conservative genuine-payload-sized load refuses in one default allowance',async()=>{
  const f=fixture({estimate:7112736});await f.load();f.detach();f.bind();await f.load();f.detach();f.bind();await f.load()
  assert.equal(f.owner.snapshot().localBudget.requests,2);assert.equal(f.owner.snapshot().localBudget.allowanceConsumedBytes,14225472)
  assert.equal(f.owner.snapshot().reason,'byte-allowance-exhausted');assert.equal(f.stats().loads,2);f.owner.dispose()
})
test('identical request reserves once and source capture is not inspection time',async()=>{
  const f=fixture();await f.load();await f.load();assert.equal(f.owner.snapshot().localBudget.requests,1)
  assert.equal(f.owner.snapshot().observedLayer.capture.start,'2023-03-07');f.owner.dispose()
})
test('malformed source/budget setup refuses without throwing or a transport',async()=>{
  for(const services of [{sources:[()=>{}]},{budgetOptions:{maxBytes:-1}}]){
    const owner=createWorldViewRealismSession();owner.setAccess({sessionReady:true});assert.doesNotThrow(()=>assert.equal(owner.configure(services),false))
    assert.equal(owner.snapshot().bridgeFailure,'source-service-setup-unavailable');assert.equal(owner.interact(),false);owner.dispose()
  }
})
test('changed service bag becomes sticky owner-level refusal without spending/resetting old allowance',async()=>{
  const f=fixture();await f.load();assert.equal(f.owner.configure({...f.services}),false)
  assert.equal(f.owner.snapshot().bridgeFailure,'source-service-configuration-changed');await f.load();f.detach();f.bind();await f.load()
  assert.equal(f.owner.snapshot().localBudget.allowanceConsumedBytes,100);assert.equal(f.stats().loads,1);f.owner.dispose()
})
test('auth readiness and account changes abort late load and suppress old source/history projection',async()=>{
  for(const next of [{actorId:null,sessionReady:false},{actorId:'B',sessionReady:true}]){
    const held=deferred();let aborted=0,closed=0
    const f=fixture({transport:{load:async(d,{signal})=>{signal.addEventListener('abort',()=>aborted++);return held.promise}}})
    const loading=f.load();f.access(next)
    assert.equal(f.owner.snapshot().activeDescriptor,null);assert.deepEqual(f.owner.snapshot().failedSourceIds,[])
    held.resolve({observedBytes:7,dispose(){closed++}});await loading
    assert.equal(aborted,1);assert.equal(closed,1);assert.equal(f.stats().renders,0)
    assert.equal(f.owner.snapshot().localBudget.requests,1);assert.equal(f.owner.snapshot().localBudget.observedBytes,7);f.owner.dispose()
  }
})
test('same-account logout/re-entry does not resurrect the captured access generation',async()=>{
  const held=deferred();let closed=0
  const f=fixture({transport:{load:()=>held.promise}}),loading=f.load(),before=f.current()
  f.access({actorId:null,sessionReady:false});f.access(before)
  held.resolve({dispose(){closed++},observedBytes:9});await loading
  assert.equal(closed,1);assert.equal(f.stats().renders,0);assert.equal(f.owner.snapshot().activeSourceId,null);f.owner.dispose()
})
test('current App getter refuses a changed actor even before layout invalidation',async()=>{
  const held=deferred();let current={sessionReady:true,actorId:'A'},closed=0
  const f=fixture({transport:{load:()=>held.promise}})
  f.owner.setAccess(current);f.owner.setCurrentAccessGetter(()=>current)
  const loading=f.load();current={sessionReady:true,actorId:'B'}
  held.resolve({dispose(){closed++},observedBytes:5});await loading
  assert.equal(closed,1);assert.equal(f.stats().renders,0);assert.equal(f.owner.snapshot().activeSourceId,null);f.owner.dispose()
})
test('exact version or submillisecond time change invalidates without refund or coordinate/source retiming',async()=>{
  const f=fixture();await f.load();f.owner.setScope({revision:'v2',time:'2024-04-08T18:00:00.000002Z'})
  assert.equal(f.owner.snapshot().activeSourceId,null);assert.equal(f.owner.snapshot().localBudget.allowanceConsumedBytes,100)
  await f.load();assert.equal(f.owner.snapshot().observedLayer.capture.start,'2023-03-07');f.owner.dispose()
})
test('private failure history survives ordinary rebind and cannot silently retry failed source',async()=>{
  let calls=0;const f=fixture({transport:{load:async()=>{calls++;throw Error('fixture failed pixels')}}})
  await f.load();f.detach();f.bind();await f.load();f.access({sessionReady:true,actorId:'B'});await f.load()
  assert.equal(calls,1);assert.deepEqual(f.owner.snapshot().failedSourceIds,[]);f.owner.dispose()
})
test('idle terminal disposal can only be renewed by meaningful interact, retaining monotonic IDs and aggregate usage',async()=>{
  let now=0;const f=fixture({budgetOptions:{now:()=>now,idleSuspendMs:10,idleDisposeMs:20}})
  await f.load();now=21;f.owner.poll();assert.equal(f.owner.snapshot().disposed,true)
  f.detach();f.owner.bindAttachment(f.attachment,()=>{});f.owner.setScope({revision:'v2'});await f.load()
  assert.equal(f.owner.snapshot().localSessionSerial,1);assert.equal(f.stats().loads,1)
  f.owner.interact();await f.load();assert.equal(f.owner.snapshot().localSessionSerial,2);assert.equal(f.owner.snapshot().requestSerial,2)
  assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,200);f.owner.dispose()
})
test('StrictMode effect replay cancels terminal finalizer but actual final departure disposes once',async()=>{
  const queue=[];const f=fixture({enqueue:fn=>queue.push(fn)});let release=f.owner.retain();await f.load()
  release();release();const replayRelease=f.owner.retain();for(const fn of queue.splice(0))fn()
  assert.equal(f.owner.snapshot().disposed,false);assert.equal(f.owner.snapshot().localBudget.allowanceConsumedBytes,100)
  replayRelease();for(const fn of queue.splice(0))fn();assert.equal(f.owner.snapshot().disposed,true);assert.equal(f.owner.interact(),false)
})
test('unmount inside a synchronous allowed reservation releases once before transport',async()=>{
  let controller,loads=0,releases=0
  controller=createWorldViewRealismController({sources:[source],estimateBytes:()=>100,
    localBudget:{transition(){},reserve(){controller.invalidateAttachment('unmounted');return {allowed:true}},release(){releases++}},
    transport:{load(){loads++}},renderer:{attach(){}}})
  controller.interact();await controller.select(request);assert.equal(loads,0);assert.equal(releases,1);controller.dispose()
})
test('old unmount/load double cleanup cannot paint into a separately mounted owner',async()=>{
  const held=deferred();let closed=0;const old=fixture({transport:{load:()=>held.promise}}),loading=old.load()
  old.detach();old.owner.dispose();old.owner.dispose();const next=fixture();await next.load()
  held.resolve({observedBytes:11,dispose(){closed++}});await loading
  assert.equal(closed,1);assert.equal(old.stats().renders,0);assert.equal(next.owner.snapshot().activeSourceId,source.id);next.owner.dispose()
})
test('unresolved null scope cannot reserve, fetch or attach through the session API',async()=>{
  const f=fixture();f.owner.setScope(null);await f.load()
  assert.equal(f.owner.snapshot().localBudget.requests,0);assert.equal(f.stats().loads,0)
  assert.equal(f.stats().renders,0);assert.equal(f.owner.snapshot().activeSourceId,null);f.owner.dispose()
})
test('delayed old cleanup of a reused attachment object cannot detach its replacement subscriber',async()=>{
  const f=fixture();let publishes=0
  const remove=f.owner.bindAttachment(f.attachment,()=>{})
  const removeNew=f.owner.bindAttachment(f.attachment,()=>{publishes++})
  f.owner.setScope({revision:'new'});f.owner.interact();remove();await f.load()
  assert.equal(f.owner.snapshot().activeSourceId,source.id);assert.ok(publishes>0)
  removeNew();assert.equal(f.owner.snapshot().activeSourceId,null);f.owner.dispose()
})
test('failure history remains private in rejected source projections after actor change',async()=>{
  const f=fixture({transport:{load:async()=>{throw Error('pixels unavailable')}}});await f.load()
  f.access({sessionReady:true,actorId:'B'});f.owner.setScope({revision:'B'});await f.load()
  const snapshot=f.owner.snapshot();assert.deepEqual(snapshot.failedSourceIds,[])
  assert.ok(snapshot.rejected.some(row=>row.reason==='source-failed'))
  assert.ok(snapshot.rejected.every(row=>!Object.hasOwn(row,'sourceId')));f.owner.dispose()
})
test('late uncooperative reader bytes reconcile the same released reservation without restoring access',async()=>{
  let report;const f=fixture({estimate:100,transport:{load:async(_d,{onLateBytes})=>{report=onLateBytes;throw Object.assign(Error('reader aborted'),{observedBytes:0,observedBytesComplete:false})}}})
  await f.load();assert.equal(f.owner.snapshot().localBudget.unknownByteReceipts,1)
  f.access({sessionReady:false,actorId:null});report(143)
  assert.equal(f.owner.snapshot().localBudget.observedBytes,143)
  assert.equal(f.owner.snapshot().localBudget.allowanceConsumedBytes,143)
  assert.equal(f.owner.snapshot().localBudget.requests,1);assert.equal(f.owner.snapshot().activeSourceId,null);f.owner.dispose()
})
test('first meaningful interaction renews terminal idle after an absent view had no poll loop',async()=>{
  let now=0;const f=fixture({budgetOptions:{now:()=>now,idleSuspendMs:10,idleDisposeMs:20}})
  await f.load();f.detach();now=21;f.owner.bindAttachment(f.attachment,()=>{})
  f.owner.setScope({revision:'returned'});f.owner.transition('visible-active')
  assert.equal(f.owner.snapshot().localBudget.disposed,true);assert.equal(f.owner.snapshot().localSessionSerial,1)
  assert.equal(f.owner.interact(),true);await f.load()
  assert.equal(f.owner.snapshot().localSessionSerial,2);assert.equal(f.owner.snapshot().requestSerial,2)
  assert.equal(f.owner.snapshot().aggregateAllowanceConsumedBytes,200);f.owner.dispose()
})
