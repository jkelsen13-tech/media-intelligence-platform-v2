import test from 'node:test'
import assert from 'node:assert/strict'
import { pointVisibleAboveEllipsoid, visibleLabelIds } from '../src/lib/worldViewMarkerLayout.js'
test('horizon: near side remains visible, far side and inside-globe camera fail closed',()=>{
 const r={x:2,y:2,z:1},c={x:4,y:0,z:0}
 assert.equal(pointVisibleAboveEllipsoid(c,{x:2,y:0,z:0},r),true)
 assert.equal(pointVisibleAboveEllipsoid(c,{x:-2,y:0,z:0},r),false)
 assert.equal(pointVisibleAboveEllipsoid({x:0,y:0,z:0},{x:2,y:0,z:0},r),false)
 assert.equal(pointVisibleAboveEllipsoid(null,{x:2,y:0,z:0},r),false)
 assert.equal(pointVisibleAboveEllipsoid(c,{x:0,y:0,z:1},r),false)
})
test('dense labels: selected identity wins deterministically, no input coordinate mutation',()=>{
 const markers=[{id:'a',x:100,y:100,visible:true,label:'nearby',selected:false},
 {id:'b',x:110,y:100,visible:true,label:'selected',selected:true},
 {id:'c',x:500,y:200,visible:true,label:'separate'},
 {id:'d',x:100,y:250,visible:false,label:'far side'}]
 const before=JSON.stringify(markers),opts={width:800,height:500,cameraHeightMeters:100000}
 assert.deepEqual([...visibleLabelIds(markers,opts)],['b','c'])
 assert.deepEqual([...visibleLabelIds([...markers].reverse(),opts)],['b','c'])
 assert.equal(JSON.stringify(markers),before)
 assert.deepEqual([...visibleLabelIds(markers,{...opts,cameraHeightMeters:12000000})],['b'])
})
test('sparse labels remain legible but clipped/offscreen labels and malformed screens stay hidden',()=>{
 const opts={width:400,height:300,cameraHeightMeters:50000}
 assert.deepEqual([...visibleLabelIds([{id:'a',x:20,y:50,visible:true,label:'place'}],opts)],['a'])
 assert.equal(visibleLabelIds([{id:'a',x:399,y:50,visible:true,label:'place'}],opts).size,0)
 assert.equal(visibleLabelIds([{id:'a',x:NaN,y:50,visible:true,label:'place'}],opts).size,0)
})

test('measured long labels never understate their collision or viewport bounds',()=>{
 const options={width:800,height:500,cameraHeightMeters:100000}
 const markers=[{id:'a',x:20,y:50,visible:true,label:'i'.repeat(80),labelWidth:1000,labelHeight:16},
 {id:'b',x:20,y:100,visible:true,label:'W',labelWidth:120,labelHeight:16},
 {id:'z',x:20,y:100,visible:true,label:'selected',selected:true,labelWidth:80,labelHeight:16}]
 assert.deepEqual([...visibleLabelIds(markers,options)],['z'])
 assert.deepEqual([...visibleLabelIds(markers,{...options,width:1200})],['z','a'])
})
