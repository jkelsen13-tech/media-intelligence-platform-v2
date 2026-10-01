// Execute the production scene controller with deterministic renderer doubles.
// This qualifies public adapter contracts, not GPU depth or geometric accuracy.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/lib/worldViewBillboardScene.js',import.meta.url),'utf8')
const moduleSource=source.replace("from './worldViewCameraState.js'",`from '${new URL('../src/lib/worldViewCameraState.js',import.meta.url).href}'`)
 .replace("import('cesium')",'Promise.resolve(globalThis.__phase2SceneDouble.C)')
 .replace("import('@phosphor-icons/react')",'Promise.resolve({})')
 .replace("import('react-dom/server')",'Promise.resolve({renderToStaticMarkup:()=>"<svg></svg>"})')
 .replace("import('react')",'Promise.resolve({createElement:()=>null})')
 .replace("import('cesium/Build/Cesium/Widgets/widgets.css')",'Promise.resolve()')
const {createWorldBillboardScene}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'))

function rendererDouble({poseFailure=false}={}){
 const listeners=new Map(),probe={viewers:[],handlers:[],collections:[],rays:[],hitPattern:[],renderRequests:0,postRender:null}
 globalThis.document={hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type)}}
 class Vector {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}
  static fromDegrees(x,y,z=0){return new Vector(x,y,z)}
  static add(a,b,out=new Vector()){return Object.assign(out,{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})}
  static subtract(a,b,out=new Vector()){return Object.assign(out,{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})}
  static multiplyByScalar(a,b,out=new Vector()){return Object.assign(out,{x:a.x*b,y:a.y*b,z:a.z*b})}
  static magnitude(a){return Math.hypot(a.x,a.y,a.z)}
  static normalize(a,out=new Vector()){return Vector.multiplyByScalar(a,1/Vector.magnitude(a),out)}
  static distance(a,b){return Vector.magnitude(Vector.subtract(a,b))}
  static dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}}
 class Matrix {static IDENTITY={};static inverseTransformation(){return new Matrix()}
  // Analytic fixture boxes are intentionally outside these adapter tests;
  // controlled globe hits let us test visibility classification deterministically.
  static multiplyByPoint(_m,p,out=new Vector()){return Object.assign(out,{x:p.x+1e8,y:p.y+1e8,z:p.z+1e8})}
  static multiplyByPointAsVector(_m,p,out=new Vector()){return Object.assign(out,p)}}
 class Collection {constructor(){this.items=[];probe.collections.push(this)}get length(){return this.items.length}
  removeAll(){this.items=[]}add(options){const value={...options,show:true,rotation:0,computeScreenSpacePosition:()=>({x:options.position.x,y:options.position.y})};this.items.push(value);return value}get(i){return this.items[i]}}
 class Viewer {constructor(){this.clock={shouldAnimate:true,currentTime:'INITIAL_ONLY'};this.destroyed=false;this.useDefaultRenderLoop=true
   this.camera={positionWC:new Vector(0,0,1000),directionWC:new Vector(0,0,-1),rightWC:new Vector(1,0,0),upWC:new Vector(0,1,0),frustum:{fovy:1},positionCartographic:{longitude:0,latitude:0,height:1000},heading:0,pitch:0,roll:0,
    lookAt:()=>{if(poseFailure)throw new Error('synthetic pose failure')},lookAtTransform:()=>{},setView:()=>{}}
   this.scene={canvas:{},fog:{},camera:this.camera,globe:{pick:ray=>{probe.rays.push(ray);return probe.hitPattern.shift()?new Vector(0,0,999):undefined}},primitives:{add:v=>v},screenSpaceCameraController:{},
    postRender:{addEventListener:fn=>{probe.postRender=fn;return()=>{probe.postRender=null}}},requestRender:()=>{probe.renderRequests++},pick:()=>null}
   probe.viewers.push(this)}destroy(){this.destroyed=true}isDestroyed(){return this.destroyed}}
 class Handler {constructor(){this.destroyed=false;probe.handlers.push(this)}setInputAction(){}destroy(){this.destroyed=true}}
 const C={Viewer,Cartesian3:Vector,Matrix4:Matrix,BillboardCollection:Collection,ScreenSpaceEventHandler:Handler,
  Color:{fromCssColorString:x=>x},Transforms:{eastNorthUpToFixedFrame:x=>x},Primitive:class{constructor(o){Object.assign(this,o)}},GeometryInstance:class{constructor(o){Object.assign(this,o)}},
  BoxGeometry:{fromDimensions:o=>o},PerInstanceColorAppearance:class{static VERTEX_FORMAT={}},ColorGeometryInstanceAttribute:{fromColor:c=>c},
  EllipsoidTerrainProvider:class{},JulianDate:{fromIso8601:value=>'RECORDED:'+value},
  HeadingPitchRange:class{},Math:{toDegrees:r=>r*180/Math.PI,toRadians:d=>d*Math.PI/180,clamp:(v,a,b)=>Math.min(b,Math.max(a,v))},VerticalOrigin:{CENTER:0},
  ScreenSpaceEventType:{LEFT_CLICK:0},SceneTransforms:{worldToWindowCoordinates:(_s,p)=>({x:p.x,y:p.y})},
  Ray:class{constructor(origin,direction){Object.assign(this,{origin,direction})}},Ellipsoid:{WGS84:{}},EllipsoidalOccluder:class{isPointVisible(){return true}}}
 globalThis.__phase2SceneDouble={C}
 return {probe,listeners,host:{isConnected:true,clientWidth:1280,clientHeight:900}}
}
const record=(key,coordinates)=>Object.freeze({key,label:key,family:'events',coordinates:Object.freeze(coordinates),precision:'synthetic point'})
const records=Object.freeze([record('a',[-81.7,41.4,0]),record('b',[-81.701,41.401,0])])
const cluster=anchorKey=>({markers:[{key:'cluster:["a","b"]',anchorKey,memberKeys:['a','b'],state:'cluster',width:44,height:44}]})

test('unchanged cluster membership with changed priority anchor updates native world position without rewriting canonical records',async()=>{
 const {host,probe}=rendererDouble();const before=JSON.stringify(records)
 const scene=await createWorldBillboardScene(host,{items:records})
 scene.setPresentation(cluster('a'))
 const first=scene.getProbe().billboardRecords[0]
 scene.setPresentation(cluster('b'))
 const second=scene.getProbe().billboardRecords[0]
 assert.equal(second.key,first.key)
 assert.deepEqual(second.memberKeys,['a','b'])
 assert.notDeepEqual(second.worldPosition,first.worldPosition)
 assert.deepEqual(second.worldPosition,{x:records[1].coordinates[0],y:records[1].coordinates[1],z:18})
 assert.equal(second.disableDepthTestDistance,0,'native GPU depth testing remains enabled')
 assert.equal(JSON.stringify(records),before)
 scene.dispose();assert.equal(probe.viewers[0].destroyed,true)
})

test('five conservative distance-band footprint samples classify partial/behind independently of canonical anchor occlusion',async()=>{
 const {host,probe}=rendererDouble();let frame
 const scene=await createWorldBillboardScene(host,{items:[records[0]],onFrame:value=>{frame=value}})
 scene.setPresentation({markers:[{key:'a',state:'ribbon',width:132,height:32}]})
 probe.hitPattern=[false,true,false,true,false,true]
 probe.postRender()
 const partial=frame.items[0]
 assert.equal(partial.occlusionSamples,2)
 assert.equal(partial.displayVisibility,'partial')
 assert.equal(partial.occluded,false)
 assert.equal(partial.centerOccluded,false)
 assert.equal(partial.canonicalOccluded,true)
 assert.deepEqual(partial.canonicalCoordinates,[-81.7,41.4,0])
 assert.equal(probe.rays.length,6,'five conservative distance-band footprint probes plus one canonical anchor probe')
 const screenPlaneTargets=probe.rays.slice(0,5).map(ray=>({
  x:ray.origin.x+ray.direction.x/ray.direction.z*(18-ray.origin.z),
  y:ray.origin.y+ray.direction.y/ray.direction.z*(18-ray.origin.z),
 }))
 const units=2*982*Math.tan(0.5)/900
 assert.ok(Math.abs((Math.max(...screenPlaneTargets.map(p=>p.x))-Math.min(...screenPlaneTargets.map(p=>p.x)))-180*units)<1e-8)
 assert.ok(Math.abs((Math.max(...screenPlaneTargets.map(p=>p.y))-Math.min(...screenPlaneTargets.map(p=>p.y)))-56*units)<1e-8)

 probe.hitPattern=[true,true,true,true,true,false];probe.postRender()
 assert.equal(frame.items[0].displayVisibility,'behind')
 assert.equal(frame.items[0].occluded,true)
 assert.equal(frame.items[0].canonicalOccluded,false)
 scene.dispose()
})

test('recorded time freezes the renderer clock; invalid time stays unavailable without current-time substitution',async()=>{
 const {host,probe}=rendererDouble();const scene=await createWorldBillboardScene(host,{items:records})
 const viewer=probe.viewers[0]
 assert.equal(scene.setRecordedTime('2026-10-01T10:00:00Z'),true)
 assert.equal(viewer.clock.shouldAnimate,false)
 assert.equal(viewer.clock.currentTime,'RECORDED:2026-10-01T10:00:00Z')
 assert.equal(scene.setRecordedTime(''),false)
 assert.equal(scene.getProbe().recordedTime,null)
 assert.equal(viewer.clock.currentTime,'RECORDED:2026-10-01T10:00:00Z','no JulianDate.now or wall-clock replacement')
 scene.dispose()
})

test('detached startup creates no viewer; visibility pause and idempotent normal disposal release scene listeners/handlers',async()=>{
 let {host,probe,listeners}=rendererDouble();host.isConnected=false
 await assert.rejects(createWorldBillboardScene(host,{items:records}),/detached/)
 assert.equal(probe.viewers.length,0)
 ;({host,probe,listeners}=rendererDouble())
 const scene=await createWorldBillboardScene(host,{items:records})
 document.hidden=true;listeners.get('visibilitychange')()
 assert.equal(probe.viewers[0].useDefaultRenderLoop,false)
 const renders=probe.renderRequests;scene.requestFrame();assert.equal(probe.renderRequests,renders)
 document.hidden=false;listeners.get('visibilitychange')();assert.equal(probe.viewers[0].useDefaultRenderLoop,true)
 scene.dispose();scene.dispose()
 assert.equal(listeners.size,0)
 assert.equal(probe.postRender,null)
 assert.equal(probe.handlers[0].destroyed,true)
 assert.equal(probe.viewers[0].destroyed,true)
})

test('startup failure after listener allocation releases external visibility/postrender/pick resources before fallback',async()=>{
 const {host,probe,listeners}=rendererDouble({poseFailure:true})
 await assert.rejects(createWorldBillboardScene(host,{items:records}),/synthetic pose failure/)
 assert.equal(probe.viewers[0].destroyed,true)
 assert.equal(listeners.size,0,'destroying Viewer alone must not retain document visibility callback')
 assert.equal(probe.postRender,null)
 assert.equal(probe.handlers[0].destroyed,true)
})

test('scene ingress copies canonical vectors; changing caller inputs or probe output cannot move retained world anchors',async()=>{
 const {host}=rendererDouble()
 const callerCoordinates=[-81.7,41.4,0]
 const scene=await createWorldBillboardScene(host,{items:[{...records[0],coordinates:callerCoordinates}]})
 scene.setSelected('a')
 callerCoordinates[0]=12
 assert.deepEqual(scene.getProbe().selectedCanonicalCoordinates,[-81.7,41.4,0])
 const probe=scene.getProbe();probe.selectedCanonicalCoordinates[0]=22
 assert.deepEqual(scene.getProbe().selectedCanonicalCoordinates,[-81.7,41.4,0],'read-only probe must not hand out the retained canonical vector')
 scene.dispose()
})


test('unchanged camera sampling footprint is independent of shown, absent or grouped marker presentation',async()=>{
 const {host,probe}=rendererDouble();let frame
 const scene=await createWorldBillboardScene(host,{items:[records[0]],onFrame:value=>{frame=value}})
 const presentations=[
  {markers:[{key:'a',state:'ribbon',width:132,height:32}]},
  {markers:[]},
  {markers:[{key:'cluster:["a"]',anchorKey:'a',memberKeys:['a'],state:'cluster',width:44,height:44}]},
  {markers:[{key:'a',state:'plaque',width:180,height:56}]},
 ]
 let baseline=null
 for(const presentation of presentations){
  scene.setPresentation(presentation)
  probe.rays=[];probe.hitPattern=[false,true,false,true,false,true]
  probe.postRender()
  const footprint=probe.rays.slice(0,5).map(ray=>({
   x:ray.origin.x+ray.direction.x/ray.direction.z*(18-ray.origin.z),
   y:ray.origin.y+ray.direction.y/ray.direction.z*(18-ray.origin.z),
  }))
  if(baseline===null)baseline=footprint
  else assert.deepEqual(footprint,baseline,'declutter/presentation must not feed back into analytic admission samples')
  assert.equal(frame.items[0].displayVisibility,'partial')
  assert.equal(frame.items[0].occlusionSamples,2)
  assert.equal(frame.items[0].canonicalOccluded,true)
 }
 scene.dispose()
})
