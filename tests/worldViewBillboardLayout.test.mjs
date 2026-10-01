import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutWorldBillboards } from '../src/lib/worldViewBillboardLayout.js'
const viewport={width:1280,height:900}
const item=(key,extra={})=>({key,anchor:{x:200,y:200},distanceMeters:1000,label:'Released place',family:'events',canonicalCoordinates:[-81.7,41.4],...extra})
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value)}return value}
const collision=(a,b)=>Math.abs(a.x-b.x)<(a.width+b.width)/2 && Math.abs(a.y-b.y)<(a.height+b.height)/2

test('distance transitions retain world anchor and only admit regional importance labels/icons',()=>{
 const states=[1000,5000,50000,300000].map(distanceMeters=>layoutWorldBillboards({items:[item('a',{distanceMeters,importance:1})],viewport}).markers[0].state)
 assert.deepEqual(states,['ribbon','label','icon','cluster'])
 assert.equal(layoutWorldBillboards({items:[item('a',{distanceMeters:50000})],viewport}).markers[0].state,'cluster')
 for(const distanceMeters of [0,3000,30000,250000,300001]){
  const marker=layoutWorldBillboards({items:[item('a',{distanceMeters})],viewport}).markers[0]
  assert.deepEqual([marker.x,marker.y],[200,200])
 }
})

test('dense co-located released records group deterministically without mutation or invented membership',()=>{
 const items=deepFreeze(Array.from({length:500},(_,i)=>item('k'+String(i).padStart(3,'0'))))
 const original=JSON.stringify(items),forward=layoutWorldBillboards({items,viewport}),reverse=layoutWorldBillboards({items:[...items].reverse(),viewport})
 assert.deepEqual(reverse,forward)
 assert.equal(forward.markers.length,1)
 assert.equal(forward.markers[0].count,500)
 assert.deepEqual(forward.markers[0].memberKeys,items.map(row=>row.key))
 assert.equal(JSON.stringify(items),original)
 assert.equal(forward.markers[0].canonicalCoordinates,items[0].canonicalCoordinates)
})

test('selection wins collision anchor; occluded and offscreen records cannot inflate visible group count',()=>{
 const rows=[item('a'),item('z',{anchor:{x:208,y:205}}),item('occluded',{occluded:true}),item('offscreen',{anchor:{x:-100,y:200}})]
 const result=layoutWorldBillboards({items:rows,viewport,selectedKey:'z'})
 assert.equal(result.markers[0].anchorKey,'z')
 assert.deepEqual([result.markers[0].x,result.markers[0].y],[208,205])
 assert.deepEqual(result.markers[0].memberKeys,['a','z'])
 assert.equal(result.markers[0].count,2)
 assert.equal(result.selected.canonicalCoordinates,rows[1].canonicalCoordinates)
})

test('sparse display keeps exact anchors; dense grid has no overlapping painted targets',()=>{
 const sparse=[item('a'),item('b',{anchor:{x:650,y:200}})]
 assert.equal(layoutWorldBillboards({items:sparse,viewport}).markers.length,2)
 const grid=Array.from({length:160},(_,i)=>item('g'+i,{anchor:{x:60+i%16*60,y:110+Math.floor(i/16)*60}}))
 const {markers}=layoutWorldBillboards({items:grid,viewport})
 for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++)assert.equal(collision(markers[i],markers[j]),false)
})

test('selected cards fit portrait/landscape safe credits/control margins while tether keeps true offscreen/occluded anchor',()=>{
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:804,height:260},{width:320,height:240}]){
  const row=deepFreeze(item('a',{anchor:{x:-800,y:1700},occluded:true}))
  const {markers,selected}=layoutWorldBillboards({items:[row],viewport,selectedKey:'a'})
  assert.deepEqual(markers,[])
  assert.equal(selected.occluded,true)
  assert.deepEqual(selected.anchor,row.anchor)
  assert.deepEqual([selected.tether.x1,selected.tether.y1],[-800,1700])
  const wideShort=viewport.width>=600 && viewport.height<480
  assert.ok(selected.card.x>=16 && selected.card.y>=(wideShort?8:72))
  if(wideShort){assert.ok(selected.card.x>=viewport.width-400);assert.ok(selected.card.height>=190);assert.ok(selected.card.x+selected.card.width<=viewport.width-40)}
  assert.ok(selected.card.x+selected.card.width<=viewport.width-16)
  assert.ok(selected.card.y+selected.card.height<=viewport.height-44)
  assert.ok(selected.tether.x2>=selected.card.x && selected.tether.x2<=selected.card.x+selected.card.width)
  assert.ok(selected.tether.y2>=selected.card.y && selected.tether.y2<=selected.card.y+selected.card.height)
 }
})

test('invalid viewports/identities fail closed; explicit safe insets and null selection are supported',()=>{
 assert.deepEqual(layoutWorldBillboards({items:[item('a')],viewport:{width:NaN,height:900},selectedKey:'a'}),{markers:[],selected:null})
 assert.deepEqual(layoutWorldBillboards({items:[item('a'),item('a')],viewport,selectedKey:'a'}),{markers:[],selected:null})
 assert.equal(layoutWorldBillboards({items:[item('a')],viewport,selectedKey:'missing'}).selected,null)
 const custom={width:390,height:844,safeInsets:{top:90,bottom:80,left:24,right:24}}
 const {selected}=layoutWorldBillboards({items:[item('a')],viewport:custom,selectedKey:'a'})
 assert.ok(selected.card.x>=24 && selected.card.y>=90)
 assert.ok(selected.card.x+selected.card.width<=366 && selected.card.y+selected.card.height<=764)
})


test('icon-to-group promotion rechecks earlier neighbors instead of leaving a new overlap',()=>{
 const rows=[item('a',{distanceMeters:50000,importance:1}),item('b',{distanceMeters:50000,importance:1,anchor:{x:232,y:200}}),item('c',{distanceMeters:50000,importance:1,anchor:{x:240,y:200}})]
 const {markers}=layoutWorldBillboards({items:rows,viewport})
 assert.equal(markers.length,1)
 assert.deepEqual(markers[0].memberKeys,['a','b','c'])
 assert.deepEqual([markers[0].x,markers[0].y],[200,200])
})


test('group inspection identity is distinct from every original member and does not open a selected card',()=>{
 const rows=[item('a'),item('b')]
 const initial=layoutWorldBillboards({items:rows,viewport})
 const group=initial.markers[0]
 assert.equal(group.state,'cluster')
 assert.equal(group.anchorKey,'a')
 assert.ok(!group.memberKeys.includes(group.key))
 const inspected=layoutWorldBillboards({items:rows,viewport,selectedKey:group.key})
 assert.equal(inspected.selected,null,'display group inspection does not select its anchor member')
 assert.deepEqual(inspected.markers,initial.markers,'group remains available for explicit member choice')
 const chosen=layoutWorldBillboards({items:rows,viewport,selectedKey:'b'})
 assert.equal(chosen.selected.key,'b')
 assert.equal(chosen.markers[0].anchorKey,'b')
 assert.equal(chosen.markers[0].key,group.key,'group identity depends on members, not the selected anchor')
 assert.deepEqual(chosen.markers[0].memberKeys,['a','b'])
})

test('distant one-member group also uses display identity and delimiter-bearing member sets cannot alias',()=>{
 const distant=layoutWorldBillboards({items:[item('a',{distanceMeters:300000})],viewport}).markers[0]
 assert.equal(distant.anchorKey,'a')
 assert.notEqual(distant.key,'a')
 assert.deepEqual(distant.memberKeys,['a'])
 const first=layoutWorldBillboards({items:[item('a|b'),item('c')],viewport}).markers[0]
 const second=layoutWorldBillboards({items:[item('a'),item('b|c')],viewport}).markers[0]
 assert.notEqual(first.key,second.key)
})


test('native display-stem projection positions markers while the selected tether retains immutable canonical ground anchor',()=>{
 const row=deepFreeze(item('a',{markerAnchor:{x:220,y:175}}))
 const original=JSON.stringify(row)
 const {markers,selected}=layoutWorldBillboards({items:[row],viewport,selectedKey:'a'})
 assert.deepEqual([markers[0].x,markers[0].y],[220,175])
 assert.deepEqual(selected.anchor,{x:200,y:200})
 assert.deepEqual([selected.tether.x1,selected.tether.y1],[200,200])
 assert.equal(JSON.stringify(row),original)
 assert.equal(selected.canonicalCoordinates,row.canonicalCoordinates)
 const offscreen=item('b',{markerAnchor:{x:-500,y:175}})
 assert.deepEqual(layoutWorldBillboards({items:[offscreen],viewport}).markers,[])
 const invalid=item('c',{markerAnchor:{x:NaN,y:175}})
 assert.deepEqual(layoutWorldBillboards({items:[invalid],viewport}).markers,[])
})

for (const [insetsName,safeInsets] of [['default',undefined],['custom',{left:40,right:64,top:100,bottom:96}]]) {
 for (const edge of ['left','right','top','bottom']) {
  for (const promotion of ['initial','fixed-point']) {
   test(`${promotion} icon promotion omits final group beyond ${edge} ${insetsName} safe inset without moving anchors`,()=>{
    const view={...viewport,...(safeInsets?{safeInsets}:{})}
    const bounds={left:safeInsets?.left??16,right:viewport.width-(safeInsets?.right??16),top:safeInsets?.top??72,bottom:viewport.height-(safeInsets?.bottom??44)}
    const horizontal=edge==='left'||edge==='right'
    const direction=edge==='left'||edge==='top'?1:-1
    const coordinate=bounds[edge]+direction*12
    const anchorAt=offset=>horizontal?{x:coordinate+direction*offset,y:400}:{x:600,y:coordinate+direction*offset}
    const icon=(key,offset)=>item(key,{anchor:anchorAt(offset),distanceMeters:50000,importance:1})
    const rows=deepFreeze(promotion==='initial'?[icon('a',0),icon('b',0)]:[icon('a',0),icon('b',32),icon('c',40)])
    const before=JSON.stringify(rows)
    // Every original icon fits. The first two fixed-point icons are separated
    // until b+c promotes; the enlarged group then reaches earlier a.
    assert.equal(layoutWorldBillboards({items:[rows[0]],viewport:view}).markers.length,1)
    if(promotion==='fixed-point')assert.equal(layoutWorldBillboards({items:rows.slice(0,2),viewport:view}).markers.length,2)
    const control=item('safe',{anchor:{x:horizontal?850:900,y:horizontal?650:400},distanceMeters:50000,importance:1})
    const {markers}=layoutWorldBillboards({items:[...rows,control],viewport:view})
    assert.deepEqual(markers.map(marker=>marker.key),['safe'])
    assert.deepEqual([markers[0].x,markers[0].y],[control.anchor.x,control.anchor.y])
    assert.equal(JSON.stringify(rows),before)
   })
  }
 }
}

test('selected tether uses explicit canonical occlusion while marker admission uses display occlusion',()=>{
 for(const [canonicalOccluded,occluded,visible] of [[true,false,true],[false,true,false]]){
  const row=deepFreeze(item('a',{canonicalOccluded,occluded,markerAnchor:{x:220,y:175}}))
  const {markers,selected}=layoutWorldBillboards({items:[row],viewport,selectedKey:'a'})
  assert.equal(selected.occluded,canonicalOccluded)
  assert.equal(markers.length,visible?1:0)
  assert.deepEqual(selected.anchor,row.anchor)
  assert.deepEqual([selected.tether.x1,selected.tether.y1],[row.anchor.x,row.anchor.y])
  assert.equal(selected.canonicalCoordinates,row.canonicalCoordinates)
 }
})

test('canonical occlusion fallback applies only when the field is absent',()=>{
 for(const occluded of [true,false]){
  const legacy=item('legacy',{occluded})
  assert.equal(layoutWorldBillboards({items:[legacy],viewport,selectedKey:legacy.key}).selected.occluded,occluded)
  for(const canonicalOccluded of [false,undefined,null,'true',1]){
   const explicit=item('explicit',{occluded,canonicalOccluded})
   assert.equal(layoutWorldBillboards({items:[explicit],viewport,selectedKey:explicit.key}).selected.occluded,false,
    'present field uses strict true rather than falling back to display occlusion')
  }
 }
})
