import test from 'node:test'
import assert from 'node:assert/strict'
import {layoutWorldBillboards} from '../src/lib/worldViewBillboardLayout.js'
import {updateSelectedBillboardEnvelope} from '../src/lib/worldViewBillboardPresentation.js'
const row=Object.freeze({key:'released',anchor:Object.freeze({x:190,y:110}),canonicalCoordinates:Object.freeze([-81.7,41.4]),precision:'city',distanceMeters:100000,displayOccluded:false,canonicalOccluded:true})

test('short native card allocation survives Presentation with safe top and attribution floor, including a dock-sized canvas',()=>{
 for(const width of [400,414,442,480,554,620]){
  const viewport={width,height:224}
  const initial=layoutWorldBillboards({items:[row],viewport,selectedKey:row.key}).selected
  const {selected,memory}=updateSelectedBillboardEnvelope({selected:initial,viewport})
  assert.equal(selected.card.height,172)
  assert.equal(selected.card.y,8)
  assert.equal(selected.card.y+selected.card.height,180)
  assert.equal(selected.card.x+selected.card.width,width-40)
  assert.deepEqual(selected.card,initial.card,'renderer stabilization must retain the declared safe layout budget')
  assert.deepEqual(selected.anchor,row.anchor)
  assert.deepEqual(selected.canonicalCoordinates,row.canonicalCoordinates)
  assert.equal(selected.occluded,true)
  assert.equal(selected.displayOccluded,false)
  assert.equal(selected.tether.x1,row.anchor.x);assert.equal(selected.tether.y1,row.anchor.y)
  assert.deepEqual(updateSelectedBillboardEnvelope({selected:initial,viewport,previous:memory}).selected,selected)
 }
})

test('portrait and desktop allocation stay unchanged; explicit safe insets constrain the complete reader',()=>{
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const {selected}=layoutWorldBillboards({items:[row],viewport,selectedKey:row.key})
  assert.equal(selected.card.height,240);assert.equal(selected.card.width,Math.min(360,viewport.width-32))
  assert.equal(selected.card.y,viewport.height-44-240)
 }
 const viewport={width:620,height:224,safeInsets:{left:30,right:60,top:20,bottom:52}}
 const initial=layoutWorldBillboards({items:[row],viewport,selectedKey:row.key}).selected
 const {selected}=updateSelectedBillboardEnvelope({selected:initial,viewport})
 assert.equal(selected.card.y,20);assert.equal(selected.card.height,152)
 assert.ok(selected.card.x>=30);assert.ok(selected.card.x+selected.card.width<=560)
 assert.equal(selected.card.y+selected.card.height,172)
})

test('measured controls constrain only the selected reader; outside dock controls do not consume the canvas',async()=>{
 const {selectedCardInsetsForControls}=await import('../src/lib/worldViewSelectedCardViewport.js')
 for(const width of [400,414,442,480,554,620]){
  const viewport={width,height:224},canvasBounds={left:10,top:62,width,height:224}
  const action={left:145,top:80,width:74,height:44}
  const selectedCardInsets=selectedCardInsetsForControls({viewport,canvasBounds,controlBounds:[action]})
  assert.deepEqual(selectedCardInsets,{left:217,right:40})
  const bounded={...viewport,selectedCardInsets}
  const initial=layoutWorldBillboards({items:[row],viewport:bounded,selectedKey:row.key}).selected
  const {selected}=updateSelectedBillboardEnvelope({selected:initial,viewport:bounded})
  assert.ok(selected.card.x>=217)
  assert.ok(selected.card.x+selected.card.width<=width-40)
  assert.deepEqual(selected.card,initial.card)
  assert.deepEqual(selected.anchor,row.anchor)
  assert.deepEqual(layoutWorldBillboards({items:[row],viewport:bounded}),layoutWorldBillboards({items:[row],viewport}),'selected-only insets do not suppress unrelated world glyphs')
  assert.deepEqual(selectedCardInsetsForControls({viewport,canvasBounds,controlBounds:[
   {left:width+20,top:70,width:53,height:44}, // right dock outside canvas
   {left:209,top:13,width:44,height:44}, // Page toolbar above the card band
  ]}),{left:16,right:40})
 }
})

test('control measurement converts transformed CSS canvas coordinates and rejects unavailable geometry',async()=>{
 const {selectedCardInsetsForControls}=await import('../src/lib/worldViewSelectedCardViewport.js')
 const viewport={width:620,height:224}
 assert.deepEqual(selectedCardInsetsForControls({viewport,canvasBounds:{left:20,top:124,width:1240,height:448},controlBounds:[{left:290,top:160,width:148,height:88}]}),{left:217,right:40})
 assert.equal(selectedCardInsetsForControls({viewport,canvasBounds:{left:0,top:0,width:NaN,height:224}}),null)
 assert.deepEqual(selectedCardInsetsForControls({viewport,canvasBounds:{left:0,top:0,width:620,height:224},controlBounds:[{left:NaN,top:20,width:90,height:44},{left:15,top:20,width:0,height:44}]}),{left:16,right:40})
 const blocked={...viewport,selectedCardInsets:{left:620,right:40}}
 assert.equal(layoutWorldBillboards({items:[row],viewport:blocked,selectedKey:row.key}).selected,null)
 assert.equal(updateSelectedBillboardEnvelope({selected:{...row,card:{x:16,y:8,width:360,height:172}},viewport:blocked}).selected,null)
})
