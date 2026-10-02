import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveBillboardDistanceStates,updateSelectedBillboardEnvelope} from '../src/lib/worldViewBillboardPresentation.js'
import {heightMetersForPrecisionClass} from '../src/lib/worldViewMapStack.js'
const viewport={width:1280,height:900}
const selected={key:'released-a',anchor:{x:180,y:200},card:{x:820,y:550,width:360,height:240},canonicalCoordinates:[-81.7,41.4],occluded:false}
const camera={lon:-81.7,lat:41.4,heightMeters:10000,headingDegrees:0,pitchDegrees:-45,rollDegrees:0}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const states=(distanceMeters,previous,extra={})=>resolveBillboardDistanceStates({items:[{key:'a',distanceMeters,importance:1},{key:'b',distanceMeters,importance:0}],datasetKey:'published-r1',previous,...extra})

test('distance alone selects icon/ribbon/plaque and slow threshold jitter does not oscillate',()=>{
 assert.deepEqual(states(16000).states,{a:'icon',b:'icon'})
 assert.deepEqual(states(1637).states,{a:'ribbon',b:'ribbon'})
 assert.deepEqual(states(900).states,{a:'plaque',b:'plaque'})
 let previous=states(16000).memory
 for(const d of [12100,11900,12200,11700,12000]){const next=states(d,previous);assert.equal(next.states.a,'icon');previous=next.memory}
 let next=states(10000,previous);assert.equal(next.states.a,'ribbon');previous=next.memory
 for(const d of [11800,12200,13000]){next=states(d,previous);assert.equal(next.states.a,'ribbon');previous=next.memory}
 assert.equal(states(14000,previous).states.a,'icon')
 previous=states(900).memory
 for(const d of [1190,1210,1300]){next=states(d,previous);assert.equal(next.states.a,'plaque');previous=next.memory}
 assert.equal(states(1400,previous).states.a,'ribbon')
})

test('rapid distance jumps cross both thresholds without stale near plaques; dataset and new selected identity reset deterministically',()=>{
 const near=states(900)
 assert.equal(states(90000,near.memory).states.a,'icon')
 const far=states(90000)
 assert.equal(states(200,far.memory).states.a,'plaque')
 const retained=states(11900,far.memory)
 assert.equal(retained.states.a,'icon')
 assert.equal(states(11900,far.memory,{datasetKey:'published-r2'}).states.a,'ribbon')
 const chosen=states(11900,far.memory,{selectedKey:'a'})
 assert.equal(chosen.states.a,'ribbon')
 assert.equal(chosen.states.b,'icon','selection resets only the newly selected record, retaining others\' camera hysteresis')
 const clamped=states(90000,null,{hysteresisFraction:0.8})
 assert.equal(clamped.memory.hysteresisFraction,0.15)
})

test('keyed hysteresis memory rejects malformed/duplicate records and cannot inherit prototype names',()=>{
 const items=freeze([{key:'__proto__',distanceMeters:900},{key:'duplicate',distanceMeters:900},{key:'duplicate',distanceMeters:90000},{key:'invalid',distanceMeters:NaN}])
 const next=resolveBillboardDistanceStates({items,datasetKey:'d'})
 assert.equal(Object.hasOwn(next.states,'__proto__'),true)
 assert.equal(next.states.__proto__,'plaque')
 assert.equal(Object.hasOwn(next.states,'duplicate'),false)
 assert.equal(Object.hasOwn(next.states,'invalid'),false)
 assert.deepEqual(resolveBillboardDistanceStates({items:[...items].reverse(),datasetKey:'d'}),next)
})

test('slow camera motion leaves the safe readable card fixed while each tether follows actual canonical projection',()=>{
 const row=freeze({...selected,canonicalCoordinates:[-81.7,41.4]})
 let current=updateSelectedBillboardEnvelope({selected:row,viewport,cameraSignature:camera})
 const fixed={...current.selected.card}
 for(let i=1;i<=30;i++){
  const anchor={x:180+i*2,y:200+i}
  current=updateSelectedBillboardEnvelope({selected:{...row,anchor,card:{...row.card,x:row.card.x+i}},viewport,previous:freeze(current.memory),cameraSignature:{...camera,lon:camera.lon+i*0.01,headingDegrees:i*0.2}})
  assert.deepEqual(current.selected.card,fixed)
  assert.equal(current.reason,'stable')
  assert.deepEqual([current.selected.tether.x1,current.selected.tether.y1],[anchor.x,anchor.y])
  assert.equal(current.selected.canonicalCoordinates,row.canonicalCoordinates)
 }
})

test('rapid camera reposition is bounded to24px per update and converges without repeated jump triggers',()=>{
 let previous=updateSelectedBillboardEnvelope({selected,viewport,cameraSignature:camera}).memory
 const moved={...selected,card:{...selected.card,x:100,y:100}}
 const jumped={...camera,headingDegrees:90,heightMeters:25000}
 let frames=0,current
 do{
  current=updateSelectedBillboardEnvelope({selected:moved,viewport,previous,cameraSignature:jumped})
  const delta=Math.hypot(current.selected.card.x-previous.card.x,current.selected.card.y-previous.card.y)
  assert.ok(delta<=24.000001)
  assert.deepEqual([current.selected.tether.x1,current.selected.tether.y1],[180,200])
  previous=current.memory;frames++
 }while(current.settling&&frames<100)
 assert.ok(frames>1&&frames<100)
 assert.deepEqual(current.selected.card,moved.card)
 assert.equal(current.settling,false)
})

test('serious collision replans with bounded movement; trivial incidental overlap keeps readable card stable',()=>{
 const first=updateSelectedBillboardEnvelope({selected,viewport,cameraSignature:camera})
 const tiny={x:820,y:550,width:10,height:10}
 const quiet=updateSelectedBillboardEnvelope({selected,viewport,previous:first.memory,cameraSignature:camera,collisions:[tiny]})
 assert.deepEqual(quiet.selected.card,first.selected.card)
 const obstacle={...selected.card}
 const moving=updateSelectedBillboardEnvelope({selected,viewport,previous:first.memory,cameraSignature:camera,collisions:[obstacle]})
 assert.equal(moving.reason,'collision')
 assert.equal(moving.settling,true)
 assert.ok(Math.hypot(moving.selected.card.x-first.selected.card.x,moving.selected.card.y-first.selected.card.y)<=24.000001)
})

test('canonical occlusion truth is preserved without repeated chasing, including offscreen canonical anchor',()=>{
 let current=updateSelectedBillboardEnvelope({selected,viewport,cameraSignature:camera})
 const occluded={...selected,occluded:true,anchor:{x:-500,y:1700}}
 current=updateSelectedBillboardEnvelope({selected:occluded,viewport,previous:current.memory,cameraSignature:camera})
 assert.equal(current.reason,'occlusion')
 assert.equal(current.selected.occluded,true)
 assert.deepEqual([current.selected.tether.x1,current.selected.tether.y1],[-500,1700])
 const fixed={...current.selected.card}
 for(let i=0;i<20;i++){
  current=updateSelectedBillboardEnvelope({selected:{...occluded,anchor:{x:-500-i,y:1700+i}},viewport,previous:current.memory,cameraSignature:camera})
  assert.equal(current.reason,'stable')
  assert.deepEqual(current.selected.card,fixed)
  assert.equal(current.selected.occluded,true)
 }
})

test('explicit safe restore snaps exactly; unsafe restore does not bypass bounds or force old selection position',()=>{
 const first=updateSelectedBillboardEnvelope({selected,viewport,cameraSignature:camera})
 const restoreCard={x:100,y:100,width:360,height:240}
 const restored=updateSelectedBillboardEnvelope({selected,viewport,previous:first.memory,cameraSignature:camera,snapRestore:true,restoreCard})
 assert.equal(restored.restored,true)
 assert.equal(restored.reason,'restore')
 assert.deepEqual(restored.selected.card,restoreCard)
 assert.equal(restored.settling,false)
 const unsafe=updateSelectedBillboardEnvelope({selected,viewport,previous:first.memory,cameraSignature:camera,snapRestore:true,restoreCard:{...restoreCard,x:-1000}})
 assert.equal(unsafe.restored,false)
 assert.deepEqual(unsafe.selected.card,first.selected.card)
 const changed=updateSelectedBillboardEnvelope({selected:{...selected,key:'released-b',card:restoreCard},viewport,previous:first.memory,cameraSignature:camera})
 assert.equal(changed.reason,'selection')
 assert.deepEqual(changed.selected.card,restoreCard)
})

test('orientation rebases safely into portrait and narrow landscape native margins; invalid inputs fail closed',()=>{
 const first=updateSelectedBillboardEnvelope({selected,viewport,cameraSignature:camera})
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const current=updateSelectedBillboardEnvelope({selected,viewport,previous:first.memory,cameraSignature:camera})
  const card=current.selected.card
  assert.equal(current.reason,'viewport')
  assert.ok(card.x>=16&&card.x+card.width<=viewport.width-(viewport.width>viewport.height?40:16))
  assert.ok(card.y>=(viewport.width>viewport.height?8:72)&&card.y+card.height<=viewport.height-44)
  assert.deepEqual(current.selected.anchor,selected.anchor)
 }
 assert.equal(updateSelectedBillboardEnvelope({selected,viewport:{width:0,height:1}}).selected,null)
 assert.equal(updateSelectedBillboardEnvelope({selected:{...selected,anchor:{x:NaN,y:1}},viewport}).selected,null)
})


test('same-viewport readable reflow cannot introduce a hidden post-step clamp jump',()=>{
 const small={...selected,card:{x:1120,y:650,width:100,height:100}}
 let previous=updateSelectedBillboardEnvelope({selected:small,viewport,cameraSignature:camera}).memory
 for(let i=0;i<50;i++){
  const next=updateSelectedBillboardEnvelope({selected,viewport,previous,cameraSignature:camera})
  assert.ok(Math.hypot(next.selected.card.x-previous.card.x,next.selected.card.y-previous.card.y)<=24.000001)
  assert.ok(next.selected.card.x+next.selected.card.width<=viewport.width-16+0.000001)
  assert.ok(next.selected.card.y+next.selected.card.height<=viewport.height-44+0.000001)
  previous=next.memory
  if(!next.settling)break
 }
 assert.ok(previous.card.width>=240&&previous.card.height>=140)
})


test('small dateline/heading wrap is slow camera motion rather than a false full-world jump',()=>{
 const first=updateSelectedBillboardEnvelope({selected,viewport,cameraSignature:{...camera,lon:179,headingDegrees:359}})
 const next=updateSelectedBillboardEnvelope({selected:{...selected,card:{...selected.card,x:100}},viewport,previous:first.memory,cameraSignature:{...camera,lon:-179,headingDegrees:1}})
 assert.equal(next.reason,'stable')
 assert.deepEqual(next.selected.card,first.selected.card)
})

test('supported scope plaques enter at the existing legal floor and retain the original physical distance thresholds',()=>{
 for(const precision of ['city','area','facility']){
  const floor=heightMetersForPrecisionClass(precision)
  const item={key:'scope',distanceMeters:floor*1.5,precision,precisionFloorMeters:floor,canonicalCoordinates:[-81.7,41.4]}
  const before=JSON.stringify(item)
  const atFloor=resolveBillboardDistanceStates({items:[freeze(item)],datasetKey:'admitted',cameraHeightMeters:floor,scopePlaques:true})
  assert.equal(atFloor.states.scope,'plaque')
  assert.equal(atFloor.nearDetails.scope.kind,'scope')
  assert.deepEqual(atFloor.memory.thresholds,{nearMeters:1200,farMeters:12000})
  assert.equal(atFloor.nearDetails.scope.floorMeters,floor)
  assert.equal(JSON.stringify(item),before)
  const retained=resolveBillboardDistanceStates({items:[item],datasetKey:'admitted',previous:atFloor.memory,cameraHeightMeters:floor*1.1,scopePlaques:true})
  assert.equal(retained.states.scope,'plaque','legal slow zoom retains density without changing evidence precision')
  const exited=resolveBillboardDistanceStates({items:[item],datasetKey:'admitted',previous:retained.memory,cameraHeightMeters:floor*1.13,scopePlaques:true})
  assert.notEqual(exited.states.scope,'plaque')
  assert.equal(exited.nearDetails.scope.kind,null)
  const approach=resolveBillboardDistanceStates({items:[item],datasetKey:'admitted',cameraHeightMeters:floor*1.001,scopePlaques:true})
  assert.notEqual(approach.states.scope,'plaque','a fresh approach must reach the floor rather than borrow the exit band')
 }
})

test('below-floor, missing, malformed and coarse precision cannot produce a near plaque or lower an existing floor',()=>{
 for(const precision of [null,undefined,'building','City','country','region','city','area','facility']){
  const floor=heightMetersForPrecisionClass(precision)
  const next=resolveBillboardDistanceStates({items:[{key:'a',distanceMeters:900,precision,precisionFloorMeters:0}],cameraHeightMeters:floor-1,scopePlaques:true})
  assert.equal(next.states.a,'ribbon')
  assert.equal(next.nearDetails.a.kind,null)
 }
 for(const precision of ['country','region']){
  const floor=heightMetersForPrecisionClass(precision)
  assert.notEqual(resolveBillboardDistanceStates({items:[{key:'a',distanceMeters:floor,precision}],cameraHeightMeters:floor,scopePlaques:true}).states.a,'plaque')
 }
 const city=heightMetersForPrecisionClass('city')
 assert.equal(resolveBillboardDistanceStates({items:[{key:'a',distanceMeters:900,precision:'city',precisionFloorMeters:city*2}],cameraHeightMeters:city,scopePlaques:true}).states.a,'ribbon')
})

test('precision or dataset corrections and large camera jumps cannot reuse a stale scope plaque',()=>{
 const floor=heightMetersForPrecisionClass('city')
 const run=extra=>resolveBillboardDistanceStates({items:[{key:'a',distanceMeters:80000,precision:'city'}],datasetKey:'r1',cameraHeightMeters:floor,scopePlaques:true,...extra})
 const first=run({})
 assert.equal(first.states.a,'plaque')
 assert.equal(run({previous:first.memory,cameraHeightMeters:floor*10}).states.a,'icon')
 assert.equal(run({previous:first.memory,datasetKey:'r2',cameraHeightMeters:floor*1.05}).states.a,'icon')
 const changed=run({previous:first.memory,items:[{key:'a',distanceMeters:10000,precision:'facility'}],cameraHeightMeters:heightMetersForPrecisionClass('facility')*1.05})
 assert.equal(changed.states.a,'ribbon')
 assert.equal(changed.nearDetails.a.kind,null)
})
