import test from 'node:test'
import assert from 'node:assert/strict'
import { pointVisibleAboveEllipsoid, visibleLabelIds, createMarkerLabelMeasurer } from '../src/lib/worldViewMarkerLayout.js'
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

test('selected priority treats absent flags as unselected; arbitration is order-independent', () => {
 const markers=[{id:'a',x:100,y:100,visible:true,label:'ordinary'},
  {id:'z',x:100,y:100,visible:true,label:'selected',selected:true}]
 const options={width:400,height:300,cameraHeightMeters:100000}
 assert.deepEqual([...visibleLabelIds(markers,options)],['z'])
 assert.deepEqual([...visibleLabelIds(markers.reverse(),options)],['z'])
})
test('spatial grid matches exhaustive arbitration across dense, sparse and selected scenes', () => {
 const options={width:1280,height:720,cameraHeightMeters:100000}
 const markers=Array.from({length:1200},(_,i)=>({id:String(i).padStart(5,'0'),
  x:(i*97)%1350-30,y:(i*41)%800-20,visible:i%17!==0,selected:i%211===0,
  labelWidth:40+(i*13)%300,labelHeight:16+(i%3)*6}))
 const accepted=[],expected=[]
 for(const m of [...markers].sort((a,b)=>Number(Boolean(b.selected))-Number(Boolean(a.selected))||a.id.localeCompare(b.id,'en'))){
  if(!m.visible)continue
  const box={left:m.x+14,right:m.x+14+m.labelWidth,top:m.y-8-m.labelHeight/2,bottom:m.y-8+m.labelHeight/2}
  if(box.left<0||box.right>options.width||box.top<0||box.bottom>options.height)continue
  if(accepted.some(a=>box.left<a.right+6&&box.right+6>a.left&&box.top<a.bottom+4&&box.bottom+4>a.top))continue
  accepted.push(box);expected.push(m.id)
 }
 assert.deepEqual([...visibleLabelIds(markers,options)],expected)
 assert.deepEqual([...visibleLabelIds([...markers].reverse(),options)],expected)
})
test('font-aware measurement retains long and multiline bounds with a bounded renderer-local cache', () => {
 let contexts=0,measurements=0
 const measurer=createMarkerLabelMeasurer(()=>{contexts++;return{font:'',measureText(text){
  measurements++
  return{width:[...text].reduce((n,c)=>n+(c==='W'?12:2),0),actualBoundingBoxAscent:9,actualBoundingBoxDescent:3}
 }}})
 const wide=measurer.measure('WWWW','12px sans-serif'),narrow=measurer.measure('iiii','12px sans-serif')
 assert.equal(wide.labelWidth,48);assert.equal(narrow.labelWidth,8)
 assert.equal(measurer.measure('WWWW','12px sans-serif'),wide)
 assert.equal(measurements,2);assert.equal(contexts,1)
 const multiline=measurer.measure('ii\nWWWW','12px sans-serif')
 assert.equal(multiline.labelWidth,48);assert.ok(multiline.labelHeight>=32)
 assert.equal(measurer.measure('W'.repeat(100),'12px sans-serif').labelWidth,1200)
 for(let i=0;i<513;i++)measurer.measure(String(i),'12px sans-serif')
 const after=measurements
 measurer.measure('WWWW','12px sans-serif')
 assert.equal(measurements,after+1)
 measurer.clear();measurer.measure('WWWW','12px sans-serif')
 assert.equal(contexts,2)
})
test('unavailable measurement fails to conservative bounds without repeated canvas allocation', () => {
 let attempts=0
 const measurer=createMarkerLabelMeasurer(()=>{attempts++;throw Error('canvas unavailable')})
 assert.deepEqual(measurer.measure('one'),{})
 assert.deepEqual(measurer.measure('two'),{})
 assert.equal(attempts,1)
 assert.equal(visibleLabelIds([{id:'a',x:0,y:20,visible:true,label:'W'.repeat(80)}],
  {width:400,height:300,cameraHeightMeters:100000}).size,0)
})
