import {buildWorldBillboardModel} from '../src/lib/worldViewBillboardModules.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {worldViewNativeBillboardSignature,worldViewNativeBillboardTexture,worldViewBillboardDisplayGround,worldViewBillboardNativeTargets} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
test('same identity dataset correction invalidates native world anchor and precision graphics',()=>{
 const marker={id:'original',label:'Supplied label',position:[-81.7,41.4],row:{revision_id:'retained',precision_class:'city'}}
 const initial=structuredClone(marker),single=new Set(['original']),states={original:'ribbon'}
 const before=worldViewNativeBillboardSignature([marker],single,states)
 const corrected={...marker,position:[-81.3,41.8],row:{...marker.row,precision_class:'region'}}
 assert.notEqual(worldViewNativeBillboardSignature([corrected],single,states),before,'unchanged key/label/distance cannot reuse stale native graphic')
 assert.notEqual(worldViewNativeBillboardSignature([{...marker,row:{...marker.row,revision_id:'new'}}],single,states),before)
 assert.notEqual(worldViewNativeBillboardSignature([marker],new Set(),states),before,'grouped originals must be removed from native pickable glyphs')
 assert.deepEqual(marker,initial,'graphic arbitration preserves immutable source row and coordinates')
})
test('native distance textures disclose supplied precision only on near plaque and safely encode label',()=>{
 const plaque=decodeURIComponent(worldViewNativeBillboardTexture('<script>invented</script>','plaque','city').split(',').slice(1).join(','))
 assert.ok(plaque.includes('&lt;script&gt;'))
 assert.ok(!plaque.includes('<script>'))
 assert.ok(plaque.includes('city'))
 assert.ok(plaque.includes('city scope · not exact position'))
 const icon=decodeURIComponent(worldViewNativeBillboardTexture('supplied','icon','city').split(',').slice(1).join(','))
 assert.ok(!icon.includes('supplied'));assert.ok(!icon.includes('city'))
})

test('native glyph samples only observed source terrain at the canonical lon/lat and never adds a guessed stem',()=>{
 const coordinates=Object.freeze([-81.7,41.4])
 const marker=Object.freeze({position:coordinates}),calls=[]
 const C={Cartographic:{fromDegrees:(lon,lat)=>({lon,lat})},Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})}}
 const viewer={scene:{globe:{getHeight:p=>{calls.push(p);return 184.5}}}}
 const sampled=worldViewBillboardDisplayGround(C,viewer,marker)
 assert.deepEqual(sampled.worldPosition,{lon:-81.7,lat:41.4,height:184.5})
 assert.equal(sampled.canonicalCoordinates,coordinates)
 assert.deepEqual(calls,[{lon:-81.7,lat:41.4}])
 for(const height of [undefined,null,NaN,Infinity]){
  viewer.scene.globe.getHeight=()=>height
  assert.equal(worldViewBillboardDisplayGround(C,viewer,marker).worldPosition.height,0)
 }
 viewer.scene.globe.getHeight=()=>{throw new Error('terrain unavailable')}
 assert.equal(worldViewBillboardDisplayGround(C,viewer,marker).displayHeightMeters,0)
 assert.deepEqual(coordinates,[-81.7,41.4])
 const single=new Set(['a']),states={a:'plaque'},rows=[{id:'a',position:coordinates,row:{precision_class:'city'}}]
 assert.notEqual(worldViewNativeBillboardSignature(rows,single,states,new Map([['a',sampled]])),worldViewNativeBillboardSignature(rows,single,states,new Map([['a',{displayHeightMeters:0}]])))
})

test('native world targets bound scope plaques and safe paint dimensions without moving or exposing grouped originals',()=>{
 const markers=Array.from({length:40},(_,i)=>Object.freeze({id:`k${String(i).padStart(2,'0')}`,x:200+(i%8)*240,y:140+Math.floor(i/8)*120,selected:i===39}))
 const source=JSON.stringify(markers),states=Object.fromEntries(markers.map(m=>[m.id,'plaque']))
 const admitted=new Set(markers.map(m=>m.id));admitted.delete('k00')
 const next=worldViewBillboardNativeTargets(markers,admitted,states,{width:2200,height:900})
 assert.equal(next.singles.size,24)
 assert.equal(next.singles.has('k39'),true,'explicit selection owns the bounded density priority')
 assert.equal(next.singles.has('k00'),false,'the existing group chooser owns this original')
 assert.equal([...next.singles].filter(key=>next.states[key]==='plaque').length,4)
 assert.equal(JSON.stringify(markers),source)
 assert.ok(Object.values(states).every(state=>state==='plaque'))
 assert.deepEqual([...worldViewBillboardNativeTargets([...markers].reverse(),admitted,states,{width:2200,height:900}).singles],[...next.singles])
 const edge={id:'edge',x:20,y:110}
 assert.equal(worldViewBillboardNativeTargets([edge],new Set(['edge']),{edge:'plaque'},{width:390,height:844}).singles.size,0,'omit rather than relocate an unsafe native target')
})

test('non-event projection validity and native provenance never become occurrence dates',()=>{
 const model=buildWorldBillboardModel({key:'place',label:'Supplied place',validityTimeRange:['2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'],sourceNativeTime:{calendar_date:'2019-10-12',source_url:'https://example.test/source'}},{inspectionTime:'2026-01-01T12:00:00Z'})
 assert.equal(model.metadata.find(m=>m.label==='Event evidence time').value,'Unavailable')
 assert.ok(!model.metadata.some(m=>m.label==='Event evidence range'))
 assert.equal(model.metadata.find(m=>m.label==='Recorded validity range').value,'2026-01-01T00:00:00Z → 2026-01-02T00:00:00Z')
 assert.ok(model.metadata.find(m=>m.label==='Source native time provenance').value.includes('2019-10-12'))
 assert.equal(model.metadata.find(m=>m.label==='Background imagery capture').value,'Unavailable — no capture supplied')
})
