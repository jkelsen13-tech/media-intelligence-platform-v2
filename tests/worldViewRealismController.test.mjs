import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorldViewRealismController} from '../src/lib/worldViewRealismController.js'
import {WORLD_VIEW_REALISM_RIGHTS} from '../src/lib/worldViewRealismAdmission.js'
const source=id=>({id,kind:'imagery',contentKind:'cartographic',costTier:'cheap',admission:{approved:true,reference:'TEST receipt'},rights:{reference:'TEST rights',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(k=>[k,true]))},attribution:[{text:'TEST'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'TEST bytes',assetCrs:'TEST',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},resolutionMeters:1,lod:{min:1,max:15}})
const request={kind:'imagery',bounds:[-81.8,41.1,-81.2,41.8],level:10}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(extra={}){const reservations=[],releases=[],loads=[],renders=[];const budget={reserve:v=>{reservations.push(v);return {allowed:Number.isFinite(v.estimatedBytes),reason:'unknown-estimate'}},release:(id,result)=>releases.push({id,...result}),transition(){},dispose(){}};const controller=createWorldViewRealismController({sources:[source('a'),source('b')],localBudget:budget,estimateBytes:()=>100,transport:{load:async d=>{loads.push(d.sourceId);return {dispose:()=>loads.push('dispose-'+d.sourceId)}}},renderer:{attach:async(l,d)=>{renders.push(d.sourceId);return {dispose:()=>renders.push('dispose-'+d.sourceId)}}},...extra});controller.transition('visible-active');return {controller,reservations,releases,loads,renders}}
test('synchronous transport abort callback may dispose its owner without recursive cancellation',async()=>{
 const d=deferred();let f
 f=fixture({transport:{load:async(descriptor,{signal})=>{signal.addEventListener('abort',()=>f.controller.dispose(),{once:true});return d.promise}}})
 const pending=f.controller.select(request)
 assert.doesNotThrow(()=>f.controller.transition('hidden'))
 d.resolve({dispose(){},observedBytes:12});await pending
 assert.equal(f.controller.snapshot().disposed,true)
 assert.equal(f.controller.snapshot().lifecycle,'disposed')
 assert.equal(f.controller.snapshot().reason,'disposed')
 assert.equal(f.releases.length,1)
})
test('default/unqualified/high/unknown size never loads; synthetic admission remains rejected',async()=>{
 for(const sources of [[],[{...source('a'),synthetic:true}],[{...source('a'),costTier:'high'}]]){const f=fixture({sources});await f.controller.select(request);assert.deepEqual(f.loads,[])}
 const f=fixture({estimateBytes:()=>null});await f.controller.select(request);assert.deepEqual(f.loads,[])
})
test('attachment is not render proof; changed out-of-coverage selection disposes previous handles once',async()=>{
 const f=fixture();await f.controller.select(request);assert.equal(f.controller.snapshot().status,'attached');assert.notEqual(f.controller.snapshot().observedLayer.status,'ACTIVE');assert.equal(f.releases[0].outcome,'success')
 await f.controller.select({...request,bounds:[-90,40,-89,41]});assert.equal(f.controller.snapshot().activeSourceId,null);f.controller.dispose();f.controller.dispose();assert.deepEqual(f.loads,['a','dispose-a']);assert.deepEqual(f.renders,['a','dispose-a']);assert.equal(f.releases.length,1)
})
test('late loaded completion after selection cancellation releases once and cannot attach',async()=>{
 const d=deferred(),f=fixture({transport:{load:()=>d.promise}});let disposed=0;const p=f.controller.select(request);f.controller.transition('hidden');d.resolve({dispose(){disposed++}});await p;assert.equal(disposed,1);assert.equal(f.releases.length,1);assert.equal(f.releases[0].outcome,'abort');assert.deepEqual(f.renders,[])
})
test('late renderer completion after dispose tears down both handles and never publishes active',async()=>{
 const d=deferred();let loadedDisposed=0,renderDisposed=0;const f=fixture({transport:{load:async()=>({dispose(){loadedDisposed++}})},renderer:{attach:()=>d.promise}});const p=f.controller.select(request);await Promise.resolve();f.controller.dispose();d.resolve({dispose(){renderDisposed++}});await p;assert.equal(loadedDisposed,1);assert.equal(renderDisposed,1);assert.equal(f.releases.length,1);assert.equal(f.controller.snapshot().disposed,true)
})
test('failed admitted cheap source falls back to another without retry and preserves bounded failure evidence',async()=>{
 const attempts=[];const f=fixture({transport:{load:async d=>{attempts.push(d.sourceId);if(d.sourceId==='a')throw Error('TEST transport failure');return {dispose(){}}}},maxEffects:1});await f.controller.select(request);assert.deepEqual(attempts,['a','b']);assert.equal(f.controller.snapshot().activeSourceId,'b');assert.deepEqual(f.controller.snapshot().failedSourceIds,['a']);assert.deepEqual(f.releases.map(x=>x.outcome),['fail','success']);assert.equal(f.controller.drainEffects().length,1)
})
test('explicit observed rendered attribution/bounds/LOD can establish active while idle cleanup remains exact',async()=>{
 const f=fixture({renderer:{attach:async(l,d)=>({observation:{sourceId:d.sourceId,status:'active',rendered:true,successes:1,attributionVisible:true,bounds:d.bounds,level:d.level,ancestry:'direct'},dispose(){}})}});await f.controller.select(request);assert.equal(f.controller.snapshot().status,'active');f.controller.transition('visible-idle');assert.equal(f.controller.snapshot().activeSourceId,null);assert.equal(f.releases.length,1)
})
test('captured registry and frozen snapshots cannot enlarge admission between reserve/load/attach',async()=>{
 const registry=[source('a')],f=fixture({sources:registry});registry[0].qualification.bytesVerified=false;registry[0].coverage.bounds=[-180,-90,180,90];await f.controller.select(request)
 assert.equal(f.controller.snapshot().activeSourceId,'a');assert.throws(()=>{f.controller.snapshot().activeDescriptor.bounds[0]=-180},TypeError)
 const high=fixture({sources:[{...source('high'),costTier:'high'}]});await high.controller.select(request);assert.equal(high.controller.snapshot().rejected[0].reason,'high-cost-authority-bridge-unavailable')
})
test('old selection finishing after newer selection cannot replace or dispose the newer handles',async()=>{
 const d=deferred();let n=0,oldDisposed=0;const f=fixture({transport:{load:async()=>++n===1?d.promise:{dispose(){}}}})
 const old=f.controller.select(request);await f.controller.select({...request,level:11});d.resolve({dispose(){oldDisposed++}});await old
 assert.equal(f.controller.snapshot().activeDescriptor.level,11);assert.equal(oldDisposed,1);assert.equal(f.releases.length,2);assert.deepEqual(f.releases.map(r=>r.outcome),['success','abort'])
})
test('actual local budget drives bounded idle suspension and terminal disposal without transport restart',async()=>{
 const {createWorldViewLocalResourceBudget}=await import('../src/lib/worldViewLocalResourceBudget.js');let now=0
 const budget=createWorldViewLocalResourceBudget({now:()=>now,idleSuspendMs:10,idleDisposeMs:20}),f=fixture({localBudget:budget});f.controller.interact();await f.controller.select(request)
 assert.equal(budget.snapshot().requests,1);now=11;f.controller.poll();assert.equal(f.controller.snapshot().activeSourceId,null);assert.equal(f.controller.snapshot().lifecycle,'visible-idle')
 now=21;f.controller.poll();assert.equal(f.controller.snapshot().disposed,true);await f.controller.select(request);assert.equal(budget.snapshot().requests,1)
})
test('renderer observation of other admitted source or wrong requested LOD cannot establish active',async()=>{
 for(const change of [{sourceId:'b'},{level:9},{attributionVisible:false}]){const f=fixture({sources:[source('a')],renderer:{attach:async(l,d)=>({observation:{sourceId:d.sourceId,status:'active',rendered:true,successes:1,attributionVisible:true,bounds:d.bounds,level:d.level,ancestry:'direct',...change},dispose(){}})}});await f.controller.select(request);assert.equal(f.controller.snapshot().activeSourceId,null);assert.equal(f.controller.snapshot().status,'fallback')}
})
test('synchronous loading subscriber cancellation prevents even starting transport',async()=>{
 let c,starts=0;c=createWorldViewRealismController({sources:[source('a')],localBudget:{reserve:()=>({allowed:true}),release(){},transition(){}},estimateBytes:()=>100,transport:{load(){starts++;return {dispose(){}}}},renderer:{attach(){return {dispose(){}}}},onChange:s=>{if(s.status==='loading')c.transition('hidden')}})
 c.transition('visible-active');await c.select(request);assert.equal(starts,0)
})
test('observed transport overrun fails closed before attachment while recording actual bytes',async()=>{
 const f=fixture({sources:[source('a')],transport:{load:async()=>({observedBytes:101,dispose(){}})}});await f.controller.select(request);assert.deepEqual(f.renders,[]);assert.equal(f.releases[0].observedBytes,101);assert.equal(f.releases[0].outcome,'fail')
})
test('requested abort does not release real concurrency until started transport acknowledges settlement',async()=>{
 const {createWorldViewLocalResourceBudget}=await import('../src/lib/worldViewLocalResourceBudget.js');const budget=createWorldViewLocalResourceBudget({maxConcurrent:1}),d=deferred();let starts=0
 const f=fixture({localBudget:budget,transport:{load:()=>{starts++;return d.promise}}});f.controller.interact();const old=f.controller.select(request)
 await f.controller.select({...request,level:11});assert.equal(starts,1);assert.equal(budget.snapshot().pendingRequests,1)
 d.resolve({observedBytes:50,dispose(){}});await old;assert.equal(budget.snapshot().pendingRequests,0);assert.equal(budget.snapshot().observedBytes,50)
 await f.controller.select({...request,level:11});assert.equal(starts,2);f.controller.dispose()
})
test('unbounded local byte budget accepts unknown estimate without treating it as zero',async()=>{
 const {createWorldViewLocalResourceBudget}=await import('../src/lib/worldViewLocalResourceBudget.js');const budget=createWorldViewLocalResourceBudget({maxBytes:null})
 const f=fixture({localBudget:budget,estimateBytes:()=>null,transport:{load:async()=>({observedBytes:50,dispose(){}})}});f.controller.interact();await f.controller.select(request);assert.equal(f.controller.snapshot().status,'attached');assert.equal(budget.snapshot().observedBytes,50)
})
test('late bytes after budget disposal remain observations without recreating a reservation',async()=>{
 const {createWorldViewLocalResourceBudget}=await import('../src/lib/worldViewLocalResourceBudget.js');const budget=createWorldViewLocalResourceBudget(),d=deferred()
 const f=fixture({localBudget:budget,transport:{load:()=>d.promise}});f.controller.interact();const old=f.controller.select(request);f.controller.dispose();assert.equal(budget.snapshot().pendingRequests,0)
 d.resolve({observedBytes:150,dispose(){}});await old;assert.equal(budget.snapshot().observedBytes,150);assert.equal(budget.snapshot().pendingRequests,0);assert.equal(budget.snapshot().allowanceConsumedBytes,150)
})
test('same freshly admitted descriptor preserves attached handle and consumes no extra request',async()=>{
 const f=fixture();await f.controller.select(request);const descriptor=f.controller.snapshot().activeDescriptor;await f.controller.select(structuredClone(request));assert.deepEqual(f.loads,['a']);assert.deepEqual(f.renders,['a']);assert.equal(f.reservations.length,1);assert.equal(f.controller.snapshot().activeDescriptor,descriptor);assert.equal(f.controller.snapshot().status,'attached')
 await f.controller.select({...request,level:11});assert.deepEqual(f.loads,['a','dispose-a','a']);assert.equal(f.reservations.length,2)
})
test('late canceled acknowledgment publishes released capacity without changing newer selection state',async()=>{
 const {createWorldViewLocalResourceBudget}=await import('../src/lib/worldViewLocalResourceBudget.js');const budget=createWorldViewLocalResourceBudget({maxConcurrent:1}),d=deferred(),updates=[]
 const f=fixture({localBudget:budget,transport:{load:()=>d.promise},onChange:s=>updates.push(s)});f.controller.interact();const old=f.controller.select(request);await f.controller.select({...request,level:11});const newer=f.controller.snapshot();assert.equal(updates.at(-1).localBudget.pendingRequests,1)
 d.resolve({observedBytes:40,dispose(){}});await old;assert.equal(updates.at(-1).localBudget.pendingRequests,0);assert.equal(updates.at(-1).status,newer.status);assert.equal(updates.at(-1).requestedSourceId,newer.requestedSourceId);assert.equal(updates.at(-1).activeSourceId,newer.activeSourceId)
})
test('injected bounded streaming transport receives bound, stops before admitting excess chunk, and reports bytes actually read',async()=>{
 let admitted=0,read=0,options;const f=fixture({sources:[source('a')],transport:{load:async(d,o)=>{options=o;for(const size of [20,40,60]){if(o.signal.aborted)throw Object.assign(Error('acknowledged abort'),{observedBytes:read});read+=size;if(o.maxBytes!==null&&admitted+size>o.maxBytes)throw Object.assign(Error('stream byte bound'),{observedBytes:read});admitted+=size}return {observedBytes:read,dispose(){}}}}})
 await f.controller.select(request);assert.equal(options.maxBytes,100);assert.equal(options.signal instanceof AbortSignal,true);assert.equal(admitted,60);assert.equal(read,120);assert.deepEqual(f.renders,[]);assert.equal(f.releases[0].observedBytes,120);assert.equal(f.releases[0].outcome,'fail')
})
test('streaming transport acknowledges abort with partial observed bytes and releases held capacity on rejection',async()=>{
 const {createWorldViewLocalResourceBudget}=await import('../src/lib/worldViewLocalResourceBudget.js');const budget=createWorldViewLocalResourceBudget({maxConcurrent:1}),ack=deferred();let read=0
 const f=fixture({localBudget:budget,transport:{load:async(d,{signal,maxBytes})=>{assert.equal(maxBytes,100);read=20;await ack.promise;if(signal.aborted)throw Object.assign(Error('acknowledged abort'),{observedBytes:read});return {dispose(){}}}}});f.controller.interact();const p=f.controller.select(request);f.controller.transition('hidden');assert.equal(budget.snapshot().pendingRequests,1);ack.resolve();await p;assert.equal(budget.snapshot().pendingRequests,0);assert.equal(budget.snapshot().observedBytes,20)
})
test('throwing estimator fulfills fallback and retains only a handle covering the current real scope',async()=>{
 let throws=false;const f=fixture({estimateBytes:()=>{if(throws)throw Error('estimate');return 100}})
 await f.controller.select(request);throws=true
 const inside={...request,bounds:[-81.7,41.2,-81.3,41.7]}
 const retained=await f.controller.select(inside)
 assert.equal(retained.status,'attached');assert.equal(retained.reason,'local-admission-failed');assert.equal(retained.activeSourceId,'a');assert.equal(f.reservations.length,1);assert.deepEqual(f.renders,['a'])
 const stale=await f.controller.select({...request,bounds:[-81.9,41.1,-81.1,41.8]})
 assert.equal(stale.status,'fallback');assert.equal(stale.activeSourceId,null);assert.equal(stale.activeDescriptor,null);assert.equal(stale.observedLayer,null);assert.deepEqual(f.renders,['a','dispose-a'])
})
test('reservation denial or exception preserves covering handle, never stale LOD, and cleans a partially reserved slot',async()=>{
 for(const mode of ['deny','throw']){
 let replacement=false;const claims=new Set(),released=[]
 const budget={transition(){},reserve({id}){claims.add(id);if(replacement){if(mode==='throw')throw Error('reserve');claims.delete(id);return {allowed:false,reason:'capacity'}}return {allowed:true}},release(id){claims.delete(id);released.push(id)}}
 const f=fixture({localBudget:budget});await f.controller.select(request);replacement=true
 const state=await f.controller.select({...request,bounds:[-81.7,41.2,-81.3,41.7]})
 assert.equal(state.activeSourceId,'a');assert.equal(state.status,'attached');assert.equal(claims.size,0);assert.deepEqual(f.renders,['a'])
 const stale=await f.controller.select({...request,level:11});assert.equal(stale.activeSourceId,null);assert.equal(stale.status,'fallback');assert.deepEqual(f.renders,['a','dispose-a'])
 if(mode==='throw')assert.equal(released.length,3)
 }
})
test('duplicate pending selection does not abort or reserve a second loading request',async()=>{
 const d=deferred();let aborts=0;const f=fixture({transport:{load:(descriptor,{signal})=>{signal.addEventListener('abort',()=>aborts++);return d.promise}}})
 const first=f.controller.select(request);const duplicate=await f.controller.select(structuredClone(request))
 assert.equal(duplicate.status,'loading');assert.equal(f.reservations.length,1);assert.equal(aborts,0)
 d.resolve({dispose(){}});await first;assert.equal(f.controller.snapshot().activeSourceId,'a');assert.equal(f.releases.length,1)
})
test('admission callback disposal cannot restart loading or overwrite terminal state',async()=>{
 let c,starts=0,releases=0
 c=createWorldViewRealismController({sources:[source('a')],estimateBytes:()=>100,localBudget:{transition(){},dispose(){},reserve(){c.dispose();return {allowed:true}},release(){releases++}},transport:{load(){starts++}},renderer:{attach(){}}})
 c.transition('visible-active');const state=await c.select(request)
 assert.equal(state.disposed,true);assert.equal(state.lifecycle,'disposed');assert.equal(state.reason,'disposed');assert.equal(state.status,'fallback');assert.equal(state.pendingSourceId,null);assert.equal(starts,0);assert.equal(releases,1)
})
test('budget abort and no-candidate cancellation cannot overwrite synchronous terminal disposal',async()=>{
 for(const cause of ['budget','no-candidate']){
 const d=deferred(),effects=[];let c,id
 c=createWorldViewRealismController({sources:[source('a')],estimateBytes:()=>100,localBudget:{transition(){},dispose(){},reserve(v){id=v.id;return {allowed:true}},release(){},poll(){return {state:'visible-active'}},drainEffects(){return effects.splice(0)}},transport:{load:(descriptor,{signal})=>{signal.addEventListener('abort',()=>c.dispose(),{once:true});return d.promise}},renderer:{attach(){throw Error('must not attach')}}})
 c.transition('visible-active');const pending=c.select(request)
 if(cause==='budget'){effects.push({type:'abort-pending',ids:[id],reason:'local-abort'});c.poll()}
 else await c.select({...request,bounds:[-90,40,-89,41]})
 assert.equal(c.snapshot().disposed,true);assert.equal(c.snapshot().reason,'disposed');assert.equal(c.snapshot().lifecycle,'disposed')
 d.resolve({dispose(){}});await pending;assert.equal(c.snapshot().reason,'disposed')
 }
})
test('fresh controller stays independent while disposed old transport settles late',async()=>{
 const d=deferred();let oldLoadedDisposed=0,oldAttaches=0
 const old=fixture({transport:{load:()=>d.promise},renderer:{attach(){oldAttaches++;return {dispose(){}}}}})
 const pending=old.controller.select(request);old.controller.dispose()
 const fresh=fixture();await fresh.controller.select(request)
 assert.equal(fresh.controller.snapshot().activeSourceId,'a');assert.equal(fresh.reservations.length,1)
 d.resolve({observedBytes:50,dispose(){oldLoadedDisposed++}});await pending
 assert.equal(oldAttaches,0);assert.equal(oldLoadedDisposed,1);assert.equal(old.releases.length,1);assert.equal(old.controller.snapshot().activeSourceId,null);assert.equal(old.controller.snapshot().reason,'disposed')
 assert.equal(fresh.controller.snapshot().activeSourceId,'a');assert.deepEqual(fresh.renders,['a']);assert.equal(fresh.releases.length,1)
})
test('covering handle cleanup disposal after replacement admission cannot publish loading or start transport',async()=>{
 let c,loads=0,cleanup=0;const reservations=[],releases=[],updates=[]
 c=createWorldViewRealismController({sources:[source('a')],estimateBytes:()=>100,localBudget:{transition(){},dispose(){},reserve(v){reservations.push(v);return {allowed:true}},release(id,r){releases.push({id,...r})}},transport:{load:async()=>{loads++;return {dispose(){}}}},renderer:{attach:async()=>({dispose(){cleanup++;c.dispose()}})},onChange:s=>updates.push(s)})
 c.transition('visible-active');await c.select(request)
 const state=await c.select({...request,bounds:[-81.7,41.2,-81.3,41.7]})
 assert.equal(reservations.length,2);assert.equal(loads,1);assert.equal(cleanup,1);assert.equal(releases.length,2);assert.deepEqual(releases.map(r=>r.outcome),['success','abort'])
 assert.equal(state.disposed,true);assert.equal(state.lifecycle,'disposed');assert.equal(state.reason,'disposed');assert.equal(state.status,'fallback');assert.equal(state.pendingSourceId,null);assert.equal(state.activeSourceId,null)
 const terminal=updates.findIndex(s=>s.disposed);assert.ok(terminal>=0);assert.ok(updates.slice(terminal).every(s=>s.disposed&&s.reason==='disposed'&&s.status==='fallback'))
})
test('hidden active cleanup and successful release callbacks cannot resurrect or relabel disposed owner',async()=>{
 for(const cause of ['hidden-cleanup','success-release']){
 let c,cleanup=0;const updates=[]
 c=createWorldViewRealismController({sources:[source('a')],estimateBytes:()=>100,localBudget:{transition(){},dispose(){},reserve(){return {allowed:true}},release(){if(cause==='success-release')c.dispose()}},transport:{load:async()=>({dispose(){}})},renderer:{attach:async()=>({dispose(){cleanup++;if(cause==='hidden-cleanup')c.dispose()}})},onChange:s=>updates.push(s)})
 c.transition('visible-active');await c.select(request);if(cause==='hidden-cleanup')c.transition('hidden')
 const state=c.snapshot();assert.equal(state.disposed,true);assert.equal(state.reason,'disposed');assert.equal(state.lifecycle,'disposed');assert.equal(state.status,'fallback');assert.equal(state.pendingSourceId,null);assert.equal(state.activeSourceId,null);assert.equal(cleanup,1)
 const terminal=updates.findIndex(s=>s.disposed);assert.ok(terminal>=0);assert.ok(updates.slice(terminal).every(s=>s.reason==='disposed'&&s.status==='fallback'))
 }
})
test('approved parent replacement with different real LOD cannot retain old handle on admission failure',async()=>{
 for(const failure of ['estimate','reserve']){
 let replacing=false
 const f=fixture({sources:[source('a')],estimateBytes:()=>{if(replacing&&failure==='estimate')throw Error('estimate');return 100},localBudget:{transition(){},reserve(){return replacing?{allowed:false,reason:'capacity'}:{allowed:true}},release(){}}})
 const high={...request,level:17,ancestor:{sourceId:'a',verified:true,loaded:true,level:14,bounds:request.bounds}}
 await f.controller.select(high);assert.equal(f.controller.snapshot().activeDescriptor.level,14);assert.equal(f.controller.snapshot().activeDescriptor.requestedLevel,17)
 replacing=true
 const result=await f.controller.select({...high,ancestor:{...high.ancestor,level:15}})
 assert.equal(result.status,'fallback');assert.equal(result.activeSourceId,null);assert.equal(result.activeDescriptor,null);assert.equal(result.observedLayer,null);assert.deepEqual(f.renders,['a','dispose-a']);assert.deepEqual(f.loads,['a','dispose-a'])
 }
})
