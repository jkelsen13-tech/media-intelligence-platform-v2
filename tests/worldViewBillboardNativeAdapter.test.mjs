// Execute the actual native adapter with real Cesium math and owned renderer
// doubles. This is source/lifecycle qualification, not GPU or provider proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as MathCesium from 'cesium'
import {heightMetersForPrecisionClass} from '../src/lib/worldViewMapStack.js'
const key='__MIP_PLAQUE_NATIVE_ADAPTER_DOUBLE__'
const url=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64')
let serial=0
async function loadAdapter(){
 const instance=++serial
 const adapterUrl=new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js',import.meta.url)
 const vendor=url(`const C=globalThis.${key};export const {Viewer,Math,Credit,UrlTemplateImageryProvider,ImageryLayer,SceneMode,ScreenSpaceEventHandler,ScreenSpaceEventType,ClockStep,JulianDate,Cartesian3,Cartesian2,Cartographic,Ray,BoundingSphere,HeadingPitchRange,Color,LabelStyle,HorizontalOrigin,VerticalOrigin,BillboardCollection,SceneTransforms,Camera}=C;// instance ${instance}`)
 const terrain=url("export const TERRAIN_CREDIT_TEXT='source double';export const createTerrariumTerrainProvider=()=>null;export const tileXYForLongitudeLatitudeDegrees=()=>({x:0,y:0});")
 const source=(await readFile(adapterUrl,'utf8'))
  .replace(/from\s+'(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(path==='./worldViewCesiumTerrariumTerrainProvider.js'?terrain:new URL(path,adapterUrl).href))
  .replace("import('cesium')",'import('+JSON.stringify(vendor)+')')
  .replace("import('cesium/Build/Cesium/Widgets/widgets.css')",'import('+JSON.stringify(url('export {};'))+')')
 return import(url(source+`\n// instance ${instance}`))
}
function fixture(precision='city'){
 const C=MathCesium,listeners=new Set(),probes={collections:[],handlers:[],removedHosts:0,requests:0,terrainHeight:184.5,yaw:0,terrainBlocks:false,selectedAnchors:[]}
 const size={width:1280,height:900}
 const event=()=>({addEventListener(fn){listeners.add(fn);return()=>listeners.delete(fn)}})
 const doc={createElement:()=>({style:{},isConnected:true,querySelector:()=>null,getContext:()=>({measureText:text=>({width:text.length*7})}),remove:()=>probes.removedHosts++})}
 const host={ownerDocument:doc,appendChild(){}}
 const screen=point=>{
  const coord=C.Cartographic.fromCartesian(point)
  return new C.Cartesian2(size.width/2+(C.Math.toDegrees(coord.longitude)+81.7)*2400-probes.yaw,Math.min(size.height-90,240)-coord.height*.04)
 }
 class Collection{constructor(){this.values=[];probes.collections.push(this)}get length(){return this.values.length}removeAll(){this.values=[]}
  add(options){const value={...options,show:true,heightReference:C.HeightReference.NONE,computeScreenSpacePosition:()=>screen(options.position)};this.values.push(value);return value}get(index){return this.values[index]}}
 let viewer
 class Viewer{constructor(){
  this.destroyed=false;this.clock={currentTime:C.JulianDate.fromIso8601('2024-04-08T18:00:00Z'),shouldAnimate:false}
  this.camera={positionCartographic:new C.Cartographic(C.Math.toRadians(-81.7),C.Math.toRadians(41.4),heightMetersForPrecisionClass(precision)),
   positionWC:C.Cartesian3.fromDegrees(-81.7,41.4,heightMetersForPrecisionClass(precision)),heading:0,pitch:-Math.PI/2,roll:0,
   position:new C.Cartesian3(),direction:new C.Cartesian3(0,0,-1),up:new C.Cartesian3(0,1,0),right:new C.Cartesian3(1,0,0),
   moveEnd:event(),cancelFlight(){},setView(){},flyToBoundingSphere(){}}
  this.canvas={clientWidth:size.width,clientHeight:size.height}
  this.scene={canvas:this.canvas,screenSpaceCameraController:{},requestRender:()=>probes.requests++,
   primitives:{add:value=>value},postRender:event(),renderError:event(),
   globe:{ellipsoid:C.Ellipsoid.WGS84,getHeight:()=>probes.terrainHeight,
    pick:ray=>{if(!probes.terrainBlocks)return undefined;return C.Cartesian3.add(ray.origin,C.Cartesian3.multiplyByScalar(ray.direction,100,new C.Cartesian3()),new C.Cartesian3())}},
   cartesianToCanvasCoordinates:screen,pick:()=>({id:probes.collections[0]?.values[0]?.id}),sun:{show:true},moon:{show:true}}
  this.entities={values:[],add:options=>{
   const label={...options.label,text:new C.ConstantProperty(options.label.text),font:new C.ConstantProperty(options.label.font)}
   let show=new C.ConstantProperty(options.label.show)
   Object.defineProperty(label,'show',{get:()=>show,set:value=>show=value?.getValue?value:new C.ConstantProperty(value)})
   const entity={...options,position:new C.ConstantPositionProperty(options.position),label}
   this.entities.values.push(entity);return entity
  },remove:value=>{this.entities.values=this.entities.values.filter(e=>e!==value)}}
  this.cesiumWidget={};viewer=this
 }isDestroyed(){return this.destroyed}destroy(){this.destroyed=true}resize(){}}
 class Handler{constructor(){this.destroyed=false;probes.handlers.push(this)}setInputAction(fn){this.pick=fn}destroy(){this.destroyed=true}}
 class NoSource{constructor(){}}
 const vendor={...C,Viewer,ScreenSpaceEventHandler:Handler,BillboardCollection:Collection,UrlTemplateImageryProvider:NoSource,ImageryLayer:NoSource,
  SceneTransforms:{worldToWindowCoordinates:(_scene,p)=>screen(p)},Camera:{clone:camera=>({...camera,positionCartographic:{...camera.positionCartographic}})}}
 const row={projection_contract_version:'spatial_projection_v1',mip_object_id:'admitted-city',revision_id:'r1',precision_class:precision}
 const position=Object.freeze([-81.7,41.4]),features=[{row,positions:[position],selected:true,label:'Admitted scope'}]
 return {doc,host,vendor,row,features,position,probes,listeners,viewer:()=>viewer,
  height(value){viewer.camera.positionCartographic.height=value;viewer.camera.positionWC=C.Cartesian3.fromDegrees(-81.7,41.4,value)},
  viewport(width,height){size.width=width;size.height=height;viewer.canvas.clientWidth=width;viewer.canvas.clientHeight=height},
  frame(){for(const fn of [...listeners])fn()}}
}
async function runFixture(t,run){
 const f=fixture(),old=new Map(['document',key,'CESIUM_BASE_URL'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
 globalThis.document=f.doc;globalThis[key]=f.vendor
 t.after(()=>{for(const [name,value] of old){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}})
 const {createCesiumEllipsoidRendererAdapter}=await loadAdapter()
 const picks=[]
 const adapter=createCesiumEllipsoidRendererAdapter({getHostEl:()=>f.host,billboardEnabled:true,precisionClass:'city',getPrecisionClass:()=>f.row.precision_class,
  initialFeatures:f.features,shouldFlyTo:()=>false,onSelectRow:row=>picks.push(row),onSelectedAnchorChange:value=>f.probes.selectedAnchors.push(value)})
 t.after(()=>adapter.destroy())
 await adapter.mount()
 await run(f,adapter,picks)
}

test('actual adapter enters a supported city scope plaque at its existing floor, keeps terrain/canonical anchors separate, and picks its retained row',async t=>{
 await runFixture(t,async(f,adapter,picks)=>{
  const before=JSON.stringify(f.features)
  adapter.getDisplayLayout()
  let state=adapter.getBillboardState()
  assert.equal(state.markers.length,1)
  assert.equal(state.markers[0].height,56)
  assert.equal(state.markers[0].disableDepthTestDistance,0)
  assert.equal(state.markers[0].heightReference,MathCesium.HeightReference.NONE)
  assert.deepEqual(state.selected.canonicalCoordinates,f.position)
  assert.equal(state.selected.nearDetailKind,'scope')
  assert.equal(state.selected.precision,'city')
  const declared=state.markers[0].declaredWorldPosition
  const altitude=MathCesium.Cartographic.fromCartesian(new MathCesium.Cartesian3(declared.x,declared.y,declared.z)).height
  assert.ok(Math.abs(altitude-184.5)<1e-6,'only already-observed source terrain height supplies the display surface')
  f.probes.handlers[0].pick({position:{x:640,y:200}})
  assert.equal(picks[0],f.row)
  const box={...state.selected.card},anchor={...state.selected.anchor}
  f.probes.yaw=25;f.viewer().camera.heading=.1;adapter.getDisplayLayout()
  state=adapter.getBillboardState()
  assert.deepEqual(state.selected.card,box)
  assert.equal(state.selected.anchor.x,anchor.x-25)
  assert.deepEqual(state.selected.canonicalCoordinates,f.position)
  f.height(heightMetersForPrecisionClass('city')*1.13);adapter.getDisplayLayout()
  assert.equal(adapter.getBillboardState().markers[0].height,24,'scope-density exit returns to the original physical distance bands')
  f.height(heightMetersForPrecisionClass('city')-10);adapter.getDisplayLayout()
  assert.notEqual(adapter.getBillboardState().markers[0].height,56)
  assert.equal(f.viewer().scene.screenSpaceCameraController.minimumZoomDistance,heightMetersForPrecisionClass('city'))
  assert.equal(JSON.stringify(f.features),before)
 })
})

test('actual adapter preserves selected canonical tether through mobile orientation and terrain occlusion, then releases native ownership',async t=>{
 await runFixture(t,async(f,adapter)=>{
  adapter.getDisplayLayout()
  for(const [width,height] of [[390,844],[844,390]]){
   f.viewport(width,height);adapter.getDisplayLayout()
   const {selected}=adapter.getBillboardState()
   assert.ok(selected.card.x>=16&&selected.card.x+selected.card.width<=width-16)
   assert.ok(selected.card.y>=8&&selected.card.y+selected.card.height<=height-44)
   assert.deepEqual(selected.canonicalCoordinates,f.position)
  }
  f.probes.terrainBlocks=true;adapter.getDisplayLayout()
  const state=adapter.getBillboardState()
  assert.equal(state.markers.length,0,'occluded native originals cannot become through-geometry plaques')
  assert.equal(state.selected.occluded,true)
  assert.deepEqual(state.selected.canonicalCoordinates,f.position)
  adapter.destroy();adapter.destroy()
  assert.equal(f.viewer().destroyed,true)
  assert.equal(f.probes.handlers[0].destroyed,true)
  assert.equal(f.listeners.size,0)
  assert.equal(f.probes.removedHosts,1)
  assert.deepEqual(adapter.getBillboardState().markers,[])
 })
})
