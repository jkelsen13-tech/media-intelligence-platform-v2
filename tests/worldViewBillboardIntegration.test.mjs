import {buildWorldBillboardModel} from '../src/lib/worldViewBillboardModules.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {worldViewNativeBillboardSignature,worldViewNativeBillboardTexture} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
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
 const icon=decodeURIComponent(worldViewNativeBillboardTexture('supplied','icon','city').split(',').slice(1).join(','))
 assert.ok(!icon.includes('supplied'));assert.ok(!icon.includes('city'))
})

test('non-event projection validity and native provenance never become occurrence dates',()=>{
 const model=buildWorldBillboardModel({key:'place',label:'Supplied place',validityTimeRange:['2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'],sourceNativeTime:{calendar_date:'2019-10-12',source_url:'https://example.test/source'}},{inspectionTime:'2026-01-01T12:00:00Z'})
 assert.equal(model.metadata.find(m=>m.label==='Event evidence time').value,'Unavailable')
 assert.ok(!model.metadata.some(m=>m.label==='Event evidence range'))
 assert.equal(model.metadata.find(m=>m.label==='Recorded validity range').value,'2026-01-01T00:00:00Z → 2026-01-02T00:00:00Z')
 assert.ok(model.metadata.find(m=>m.label==='Source native time provenance').value.includes('2019-10-12'))
 assert.equal(model.metadata.find(m=>m.label==='Background imagery capture').value,'Unavailable — no capture supplied')
})
