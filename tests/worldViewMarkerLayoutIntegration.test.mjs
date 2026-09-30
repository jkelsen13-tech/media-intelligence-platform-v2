import test from 'node:test'
import assert from 'node:assert/strict'
import { updateGlobeMarkerLayout, dispatchGlobeMarkerPick } from '../src/lib/worldViewMarkerLayout.js'

function fixture() {
 const row=Object.freeze({revision_id:'revision-a',mip_object_id:'original-object',precision_class:'city'})
 const position=Object.freeze({x:1,y:0,z:0})
 let labelShown=true, destroyed=false, cancelled=false
 const entity={id:row.revision_id,show:false,__mipRow:row,__mipSelected:true,
  position:Object.freeze({getValue:()=>position}),label:{
   text:Object.freeze({getValue:()=> 'retained label'}),font:Object.freeze({getValue:()=> '12px sans-serif'}),
   get show(){return{getValue:()=>labelShown}},set show(v){labelShown=v}}}
 const screen={x:20,y:50},radii=Object.freeze({x:1,y:1,z:1})
 const viewer={isDestroyed:()=>destroyed,clock:{currentTime:1},
  camera:{positionWC:{x:2,y:0,z:0},positionCartographic:{height:100000}},
  scene:{canvas:{clientWidth:400,clientHeight:300},globe:{ellipsoid:{radii}},pick:()=>({id:entity})}}
 const C={SceneTransforms:{worldToWindowCoordinates:()=>screen}}
 const measure=()=>({labelWidth:100,labelHeight:18})
 return{row,position,entity,screen,viewer,C,measure,cancel:()=>{cancelled=true},
  isCancelled:()=>cancelled,destroy:()=>{destroyed=true}}
}
test('render arbitration responds to resizing and small motion without camera-change events or coordinate mutation',()=>{
 const f=fixture(),entities=[f.entity],initialPosition=f.entity.position,initialRow=f.entity.__mipRow
 const render=()=>updateGlobeMarkerLayout(f.C,f.viewer,entities,f.measure)
 assert.equal(render(),true);assert.equal(f.entity.show,true);assert.equal(f.entity.label.show.getValue(),true)
 assert.equal(render(),false)
 // A tiny screen motion moves a previously fitting label over the edge.
 f.screen.x=285;assert.equal(render(),false)
 f.screen.x=287;assert.equal(render(),true);assert.equal(f.entity.show,true)
 assert.equal(f.entity.label.show.getValue(),false);assert.equal(render(),false)
 f.viewer.scene.canvas.clientWidth=600;assert.equal(render(),true)
 assert.equal(f.entity.label.show.getValue(),true);assert.equal(render(),false)
 f.screen.x=601;assert.equal(render(),true);assert.equal(f.entity.show,false)
 f.screen.x=20;assert.equal(render(),true);assert.equal(f.entity.show,true)
 assert.equal(f.entity.position,initialPosition);assert.equal(f.entity.position.getValue(),f.position)
 assert.equal(f.entity.__mipRow,initialRow);assert.equal(f.entity.__mipRow,f.row)
})
test('horizon crossing hides symbols and labels; pick-time validation rejects a stale rendered symbol',()=>{
 const f=fixture(),selected=[]
 assert.equal(updateGlobeMarkerLayout(f.C,f.viewer,[f.entity],f.measure),true)
 assert.equal(dispatchGlobeMarkerPick(f.viewer,{x:20,y:50},row=>selected.push(row)),true)
 assert.equal(selected[0],f.row)
 // Camera changes before layout has supplied a correction frame.
 f.viewer.camera.positionWC={x:-2,y:0,z:0}
 assert.equal(f.entity.show,true)
 assert.equal(dispatchGlobeMarkerPick(f.viewer,{x:20,y:50},row=>selected.push(row)),false)
 assert.equal(selected.length,1)
 assert.equal(updateGlobeMarkerLayout(f.C,f.viewer,[f.entity],f.measure),true)
 assert.equal(f.entity.show,false);assert.equal(f.entity.label.show.getValue(),false)
 assert.equal(updateGlobeMarkerLayout(f.C,f.viewer,[f.entity],f.measure),false)
 f.viewer.camera.positionWC={x:2,y:0,z:0}
 assert.equal(updateGlobeMarkerLayout(f.C,f.viewer,[f.entity],f.measure),true)
 assert.equal(f.entity.show,true);assert.equal(f.entity.label.show.getValue(),true)
})
test('an unapproved first-frame symbol, cancelled pick or renderer destroyed during pick cannot select',()=>{
 const f=fixture(),selected=[],select=row=>selected.push(row)
 assert.equal(dispatchGlobeMarkerPick(f.viewer,{x:20,y:50},select),false)
 updateGlobeMarkerLayout(f.C,f.viewer,[f.entity],f.measure)
 f.viewer.scene.pick=()=>{f.cancel();return{id:f.entity}}
 assert.equal(dispatchGlobeMarkerPick(f.viewer,{x:20,y:50},select,f.isCancelled),false)
 assert.equal(selected.length,0)
 const next=fixture();updateGlobeMarkerLayout(next.C,next.viewer,[next.entity],next.measure)
 next.viewer.scene.pick=()=>{next.destroy();return{id:next.entity}}
 assert.equal(dispatchGlobeMarkerPick(next.viewer,{x:20,y:50},select),false)
 assert.equal(selected.length,0)
 assert.equal(updateGlobeMarkerLayout(next.C,next.viewer,[next.entity],next.measure),false)
})
