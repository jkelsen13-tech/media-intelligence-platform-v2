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

function rendererDouble({poseFailure=false,mutatingCameraGetters=false}={}){
 const listeners=new Map(),probe={viewers:[],handlers:[],collections:[],rays:[],hitPattern:[],renderRequests:0,postRender:null,pendingRender:false,deliveredFrames:0,liveGetterReads:0,cloneGetterReads:0,cameraClones:[]}
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
 function installCameraGetters(camera,live){
  if(!mutatingCameraGetters)return camera
  for(const name of ['heading','pitch','roll'])Object.defineProperty(camera,name,{configurable:true,get(){
   camera.rightWC.x+=1e-15;camera.upWC.y+=2e-15
   if(live){probe.liveGetterReads++;probe.renderRequests++}else probe.cloneGetterReads++
   return 0
  }})
  return camera
 }
 const Camera={clone:(camera,result)=>{
  const clone=result??{heading:0,pitch:0,roll:0}
  Object.assign(clone,{positionWC:new Vector(camera.positionWC.x,camera.positionWC.y,camera.positionWC.z),
   directionWC:new Vector(camera.directionWC.x,camera.directionWC.y,camera.directionWC.z),
   rightWC:new Vector(camera.rightWC.x,camera.rightWC.y,camera.rightWC.z),
   upWC:new Vector(camera.upWC.x,camera.upWC.y,camera.upWC.z),
   frustum:{...camera.frustum},positionCartographic:{...camera.positionCartographic}})
  installCameraGetters(clone,false);probe.cameraClones.push(clone);return clone
 }}
 class Viewer {constructor(){this.clock={shouldAnimate:true,currentTime:'INITIAL_ONLY'};this.destroyed=false;this.useDefaultRenderLoop=true
   this.camera={positionWC:new Vector(0,0,1000),directionWC:new Vector(0,0,-1),rightWC:new Vector(1,0,0),upWC:new Vector(0,1,0),frustum:{fovy:1},positionCartographic:{longitude:0,latitude:0,height:1000},heading:0,pitch:0,roll:0,
    lookAt:(_target,pose)=>{if(poseFailure)throw new Error('synthetic pose failure');this.camera.positionCartographic.height=pose.range;if(!mutatingCameraGetters){this.camera.heading=pose.heading;this.camera.pitch=pose.pitch}},lookAtTransform:()=>{},
    setView:({destination,orientation})=>{this.camera.positionWC=new Vector(destination.x,destination.y,destination.z);this.camera.positionCartographic={longitude:destination.x*Math.PI/180,latitude:destination.y*Math.PI/180,height:destination.z};if(!mutatingCameraGetters)Object.assign(this.camera,{heading:orientation.heading,pitch:orientation.pitch,roll:orientation.roll})},
    moveRight:x=>{this.camera.positionWC.x+=x;this.camera.positionCartographic.longitude+=x*1e-6},
    moveUp:y=>{this.camera.positionWC.y+=y;this.camera.positionCartographic.latitude+=y*1e-6},
    zoomIn:amount=>{this.camera.positionWC.z-=amount;this.camera.positionCartographic.height-=amount},
    zoomOut:amount=>{this.camera.positionWC.z+=amount;this.camera.positionCartographic.height+=amount}}
   installCameraGetters(this.camera,true)
   this.scene={canvas:{},fog:{},camera:this.camera,globe:{pick:ray=>{probe.rays.push(ray);return probe.hitPattern.shift()?new Vector(0,0,999):undefined}},primitives:{add:v=>v},screenSpaceCameraController:{},
    postRender:{addEventListener:fn=>{probe.postRender=fn;return()=>{probe.postRender=null}}},requestRender:()=>{probe.renderRequests++;probe.pendingRender=true},pick:()=>null}
   probe.viewers.push(this)}destroy(){this.destroyed=true}isDestroyed(){return this.destroyed}}
 class Handler {constructor(){this.destroyed=false;probe.handlers.push(this)}setInputAction(){}destroy(){this.destroyed=true}}
 const C={Viewer,Camera,Cartesian3:Vector,Matrix4:Matrix,BillboardCollection:Collection,ScreenSpaceEventHandler:Handler,
  Color:{fromCssColorString:x=>x},Transforms:{eastNorthUpToFixedFrame:x=>x},Primitive:class{constructor(o){Object.assign(this,o)}},GeometryInstance:class{constructor(o){Object.assign(this,o)}},
  BoxGeometry:{fromDimensions:o=>o},PerInstanceColorAppearance:class{static VERTEX_FORMAT={}},ColorGeometryInstanceAttribute:{fromColor:c=>c},
  EllipsoidTerrainProvider:class{},JulianDate:{fromIso8601:value=>'RECORDED:'+value},
  HeadingPitchRange:class{constructor(heading,pitch,range){Object.assign(this,{heading,pitch,range})}},Math:{toDegrees:r=>r*180/Math.PI,toRadians:d=>d*Math.PI/180,clamp:(v,a,b)=>Math.min(b,Math.max(a,v))},VerticalOrigin:{CENTER:0},
  ScreenSpaceEventType:{LEFT_CLICK:0},SceneTransforms:{worldToWindowCoordinates:(_s,p)=>({x:p.x,y:p.y})},
  Ray:class{constructor(origin,direction){Object.assign(this,{origin,direction})}},Ellipsoid:{WGS84:{}},EllipsoidalOccluder:class{isPointVisible(){return true}}}
 globalThis.__phase2SceneDouble={C}
 const deliverFrame=()=>{const viewer=probe.viewers.at(-1);if(!viewer||viewer.destroyed||!viewer.useDefaultRenderLoop||!probe.pendingRender)return false;probe.pendingRender=false;probe.deliveredFrames++;probe.postRender?.();return true}
 return {probe,listeners,deliverFrame,host:{isConnected:true,clientWidth:1280,clientHeight:900}}
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


test('serialization/getProbe/frame reads isolate mutating orientation getters from every live camera vector and render requests',async()=>{
 const {host,probe}=rendererDouble({mutatingCameraGetters:true})
 const scene=await createWorldBillboardScene(host,{items:[records[0]],onFrame:()=>{}})
 const live=probe.viewers[0].camera
 const vectors=()=>Object.fromEntries(['positionWC','directionWC','upWC','rightWC'].map(key=>[key,{...live[key]}]))
 const before=vectors(),requests=probe.renderRequests
 for(let i=0;i<40;i++){
  scene.getCameraState();scene.getProbe();probe.postRender()
 }
 assert.deepEqual(vectors(),before,'read-only serialization cannot introduce even tiny world-vector drift')
 assert.equal(probe.liveGetterReads,0,'orientation getters must be evaluated only on a deep camera clone')
 assert.ok(probe.cloneGetterReads>=120,'mutating clone getters are actually exercised')
 assert.ok(probe.cameraClones.length>=120)
 assert.equal(probe.renderRequests,requests,'serialization cannot induce a native-render feedback request')
 assert.notEqual(probe.cameraClones[0].rightWC,live.rightWC)
 assert.notEqual(probe.cameraClones[0].upWC,live.upWC)
 scene.dispose()
})

test('repeated hidden frame requests stay blocked; one resume request preserves recorded time and selected canonical identity',async()=>{
 const {host,probe,listeners}=rendererDouble()
 const scene=await createWorldBillboardScene(host,{items:[records[0]]})
 scene.setSelected('a');scene.setRecordedTime('2026-10-01T10:00:00Z')
 const before=scene.getProbe(),clock=probe.viewers[0].clock.currentTime
 document.hidden=true;listeners.get('visibilitychange')()
 const pausedRequests=probe.renderRequests
 for(let i=0;i<50;i++)scene.requestFrame()
 assert.equal(probe.renderRequests,pausedRequests)
 assert.equal(probe.viewers[0].useDefaultRenderLoop,false)
 document.hidden=false;listeners.get('visibilitychange')()
 assert.equal(probe.renderRequests,pausedRequests+1,'resume schedules one bounded render request')
 const after=scene.getProbe()
 assert.equal(after.selected,before.selected)
 assert.deepEqual(after.selectedCanonicalCoordinates,before.selectedCanonicalCoordinates)
 assert.equal(after.recordedTime,before.recordedTime)
 assert.equal(probe.viewers[0].clock.currentTime,clock)
 assert.equal(probe.viewers[0].clock.shouldAnimate,false)
 scene.dispose()
})


test('hidden direct mutators coalesce one pending render flag and resume delivers latest logical/camera/time state rather than queued frames',async()=>{
 const {host,probe,listeners,deliverFrame}=rendererDouble()
 const scene=await createWorldBillboardScene(host,{items:records,onFrame:()=>{}})
 deliverFrame()
 document.hidden=true;listeners.get('visibilitychange')()
 const deliveredBefore=probe.deliveredFrames
 scene.setItems([records[1]])
 scene.setPresentation(cluster('b'))
 scene.setSelected('b')
 scene.setRecordedTime('2026-10-01T11:00:00Z')
 scene.setCameraState({version:1,lon:-81.701,lat:41.401,heightMeters:5000,headingDegrees:20,pitchDegrees:-40,rollDegrees:0})
 scene.setPose('medium');scene.orbit(15);scene.pitch(5);scene.pan(10,5);scene.zoom(0.85)
 const latestCamera={version:1,lon:-81.702,lat:41.402,heightMeters:6000,headingDegrees:35,pitchDegrees:-50,rollDegrees:0}
 scene.setCameraState(latestCamera)
 for(let i=0;i<50;i++)scene.requestFrame()
 assert.equal(probe.viewers[0].useDefaultRenderLoop,false)
 assert.equal(probe.pendingRender,true,'Cesium explicit requests are a coalesced pending flag, not a GPU-frame queue')
 assert.equal(deliverFrame(),false)
 assert.equal(probe.deliveredFrames,deliveredBefore,'paused loop must not deliver synthetic frames')
 const latest=scene.getProbe()
 assert.equal(latest.selected,'b')
 assert.equal(latest.itemCount,1)
 assert.deepEqual(latest.selectedCanonicalCoordinates,records[1].coordinates)
 assert.equal(latest.recordedTime,'2026-10-01T11:00:00Z')
 assert.ok(Math.abs(latest.camera.lon-latestCamera.lon)<1e-10)
 assert.ok(Math.abs(latest.camera.lat-latestCamera.lat)<1e-10)
 assert.equal(latest.camera.heightMeters,6000)
 document.hidden=false;listeners.get('visibilitychange')()
 assert.equal(deliverFrame(),true)
 assert.equal(probe.deliveredFrames,deliveredBefore+1)
 assert.equal(deliverFrame(),false,'many hidden requests cannot turn into a resume frame queue')
 const resumed=scene.getProbe()
 assert.equal(resumed.selected,latest.selected)
 assert.equal(resumed.recordedTime,latest.recordedTime)
 assert.deepEqual(resumed.camera,latest.camera)
 scene.dispose()
})

test('disposed mutators cannot request renders or access camera inputs after scene ownership is released',async()=>{
 const {host,probe,listeners}=rendererDouble()
 const scene=await createWorldBillboardScene(host,{items:records})
 scene.setInteractionEnabled(false)
 scene.dispose()
 const inputs=probe.viewers[0].scene.screenSpaceCameraController.enableInputs
 const calls=probe.renderRequests
 const operations=[
  ()=>scene.setItems([records[1]]),()=>scene.setPresentation(cluster('b')),()=>scene.setSelected('b'),
  ()=>scene.setRecordedTime('2026-10-01T11:00:00Z'),
  ()=>scene.setCameraState({version:1,lon:-81.7,lat:41.4,heightMeters:6000,headingDegrees:0,pitchDegrees:-35,rollDegrees:0}),
  ()=>scene.setPose('medium'),()=>scene.orbit(15),()=>scene.pitch(5),()=>scene.pan(10,5),()=>scene.zoom(.85),()=>scene.setInteractionEnabled(true),()=>scene.requestFrame(),
 ]
 for(const operation of operations)operation()
 assert.equal(probe.renderRequests,calls,'mutator closures must stop using released native scene resources')
 assert.equal(probe.viewers[0].scene.screenSpaceCameraController.enableInputs,inputs)
 assert.equal(listeners.size,0)
 assert.equal(probe.postRender,null)
 assert.equal(probe.handlers[0].destroyed,true)
})
