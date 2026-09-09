import test from 'node:test'
import assert from 'node:assert/strict'
import { Clock, ClockStep, JulianDate } from 'cesium'
import { recordedDisplayTime } from '../src/lib/worldViewRecordedDisplayTime.js'
import { createRecordedLightingController } from '../src/lib/worldViewCesiumRecordedLighting.js'
import { createWorldViewRendererAdapter } from '../src/lib/worldViewRendererAdapter.js'
import { defaultVisualFidelityProfile as defaults, reduceVisualFidelityProfile as reduce,
  resolveVisualFidelityProfile as resolve, visualFidelityCapabilities as caps } from '../src/lib/worldViewVisualFidelity.js'
const C = { ClockStep, JulianDate }
const first = '2024-04-08 17:59:00.123456+00'
function setup() {
  let requests = 0
  const camera = Object.freeze({ position: 'unchanged' }), entities = Object.freeze([])
  const clock = new Clock({ currentTime: JulianDate.fromIso8601('2026-01-01T00:00:00Z'),
    clockStep: ClockStep.SYSTEM_CLOCK, shouldAnimate: true })
  const viewer = { clock, camera, entities, scene: { globe: { enableLighting: false,
    dynamicAtmosphereLighting: true, dynamicAtmosphereLightingFromSun: false },
    sun: {show:true}, moon:{show:true}, requestRenderMode:true,
    requestRender:()=>requests++ } }
  const controller = createRecordedLightingController(()=>C,()=>viewer)
  return { viewer, controller, requests:()=>requests }
}
test('display time preserves exact SQL text and offset, and rejects invented precision',()=>{
  for (const source of [first,'2024-04-08T23:29:00.123456+05:30','2024-04-08 13:59:00.123456-04']) {
    const value = recordedDisplayTime(source)
    assert.equal(value.sourceText,source); assert.equal(value.atMs,1712599140123)
    assert.equal(value.available,true); assert.ok(Object.isFrozen(value))
  }
  for (const bad of [null,0,{},'2024-04-08','2024-04-08 17:59:00','2024-02-30T00:00:00Z'])
    assert.deepEqual(recordedDisplayTime(bad),{sourceText:null,atMs:null,available:false})
})
test('real Cesium clock stays frozen; invalidation disables lighting and never exposes a substitute time',()=>{
  const {viewer,controller,requests} = setup()
  const camera=viewer.camera, entities=viewer.entities, clock=viewer.clock
  assert.equal(controller.setTime(first),true)
  assert.equal(controller.available(),true)
  const retained=JulianDate.clone(clock.currentTime)
  for(let i=0;i<100;i++)clock.tick()
  assert.ok(JulianDate.equals(clock.currentTime,retained))
  assert.equal(controller.setLighting(true),true)
  assert.equal(viewer.scene.globe.enableLighting,true)
  const before=requests()
  controller.setTime(first);controller.setLighting(true)
  assert.equal(requests(),before,'same input does not request a redraw')
  assert.equal(controller.state().sourceText,first)
  assert.equal(controller.state().dynamicAtmosphere,false)
  assert.equal(controller.state().sunDirectedAtmosphere,false)
  assert.equal(viewer.scene.sun.show,false);assert.equal(viewer.scene.moon.show,false)
  controller.setTime('2024-04-08')
  assert.equal(viewer.scene.globe.enableLighting,false)
  assert.equal(controller.available(),false);assert.equal(controller.state().sourceText,null)
  assert.equal(controller.state().atMs,null);assert.equal(controller.setLighting(true),false)
  controller.setTime(first);assert.equal(controller.setLighting(true),true)
  assert.equal(viewer.camera,camera);assert.equal(viewer.entities,entities);assert.equal(viewer.clock,clock)
  assert.equal(viewer.scene.requestRenderMode,true)
})
test('clock drift and failed property writes cannot qualify sunlight',()=>{
  const {viewer,controller}=setup()
  controller.setTime(first);controller.setLighting(true)
  viewer.clock.shouldAnimate=true
  assert.equal(controller.available(),false)
  assert.equal(controller.setLighting(true),false)
  assert.equal(viewer.scene.globe.enableLighting,false)
  controller.setTime(first)
  Object.defineProperty(viewer.scene.globe,'enableLighting',{get:()=>false,set:()=>{}})
  assert.equal(controller.setLighting(true),false)
  assert.equal(controller.available(),false)
  assert.equal(controller.setLighting(false),true)
  controller.setTime(first)
  assert.equal(controller.available(),false,'a rejected setter stays unavailable for this renderer')
  assert.equal(createRecordedLightingController(()=>null,()=>null).setTime(first),false)
})
test('sunlight stays off in presets, preserves remembered preferences and is masked without a clock',()=>{
  const available=caps({sunLighting:true})
  let p=reduce(defaults(),{type:'category',category:'lighting',enabled:true},available)
  p=reduce(p,{type:'leaf',category:'lighting',leaf:'sunLighting',enabled:true},available)
  assert.equal(resolve(p,available).sunLighting,true)
  for(const action of [{type:'master',enabled:false},{type:'category',category:'lighting',enabled:false}]){
    const off=reduce(p,action,available)
    assert.equal(resolve(off,available).sunLighting,false)
    assert.equal(off.categories.lighting.sunLighting,true)
    assert.deepEqual(reduce(off,{...action,enabled:true},available),p)
  }
  assert.equal(resolve(p,caps()).sunLighting,false)
  assert.equal(resolve(p,available).dynamicAtmosphere,false)
  for(const preset of ['performance','balanced','maximum'])
    assert.equal(resolve(reduce(p,{type:'preset',preset},available),available).sunLighting,false)
})
test('latest timestamp replays before effects after asynchronous mount; fallback and destroyed adapters no-op',async()=>{
  let release
  const held=new Promise(resolve=>{release=resolve}), calls=[]
  const adapter=createWorldViewRendererAdapter({stackId:'ellipsoid-globe'},{
    loadGlobeAdapter:async()=>({createCesiumEllipsoidRendererAdapter:()=>({
      mount:()=>held, setRecordedTimeInstant:time=>calls.push(['time',time]),
      setVisualFidelityProfile:()=>calls.push(['profile'])
    })})
  })
  const pending=adapter.mount()
  adapter.setRecordedTimeInstant(first);adapter.setRecordedTimeInstant('2024-04-08T19:00:00Z')
  adapter.setVisualFidelityProfile(defaults())
  release();await pending
  assert.deepEqual(calls,[['time','2024-04-08T19:00:00Z'],['profile']])
  adapter.destroy();assert.equal(adapter.setRecordedTimeInstant(first),false)
  const fallback=createWorldViewRendererAdapter({stackId:'openfreemap-positron'},{
    createMapAdapter:()=>({mount:async()=>{}})
  })
  await fallback.mount();assert.equal(fallback.setRecordedTimeInstant(first),false)
  fallback.destroy()
})

test('dynamic atmosphere requires frozen recorded lighting and a visible atmosphere effect',()=>{
  const {viewer,controller,requests}=setup()
  controller.setTime(first)
  viewer.scene.globe.showGroundAtmosphere=true
  assert.equal(controller.setDynamicAtmosphere(true),false)
  controller.setLighting(true)
  const clock=JulianDate.clone(viewer.clock.currentTime),camera=viewer.camera
  assert.equal(controller.setDynamicAtmosphere(true),true)
  assert.equal(controller.available(),true)
  assert.equal(controller.state().dynamicAtmosphere,true)
  const count=requests()
  assert.equal(controller.setDynamicAtmosphere(true),true)
  assert.equal(requests(),count)
  assert.equal(controller.state().sourceText,first)
  assert.ok(JulianDate.equals(viewer.clock.currentTime,clock))
  assert.equal(viewer.camera,camera)
  assert.equal(controller.state().sunDirectedAtmosphere,false)
  for(const invalid of [1,'true',null,{},undefined])assert.equal(controller.setDynamicAtmosphere(invalid),false)
  viewer.scene.globe.showGroundAtmosphere=false
  assert.equal(controller.setDynamicAtmosphere(true),false)
  assert.equal(controller.state().dynamicAtmosphere,false)
  viewer.scene.fog={renderable:true}
  assert.equal(controller.setDynamicAtmosphere(true),true)
  controller.setTime('2024-04-08')
  assert.equal(controller.state().dynamicAtmosphere,false)
  assert.equal(controller.state().lightingEnabled,false)
  assert.equal(controller.state().sourceText,null)
})
test('dynamic write rejection disables lighting and cannot be requalified by cleanup',()=>{
  const {viewer,controller}=setup()
  controller.setTime(first);controller.setLighting(true)
  viewer.scene.globe.showGroundAtmosphere=true
  Object.defineProperty(viewer.scene.globe,'dynamicAtmosphereLighting',{get:()=>false,set:()=>{}})
  assert.equal(controller.setDynamicAtmosphere(true),false)
  assert.equal(controller.available(),false)
  assert.equal(viewer.scene.globe.enableLighting,false)
  assert.equal(controller.setDynamicAtmosphere(false),true)
  controller.setTime(first)
  assert.equal(controller.available(),false)
})
test('dynamic profile gates never auto-enable dependencies and preserve the remembered choice',()=>{
  const c=caps({sunLighting:true,dynamicAtmosphere:true,groundAtmosphere:true,distanceHaze:true})
  let p=defaults()
  const act=action=>{p=reduce(p,action,c)}
  act({type:'category',category:'lighting',enabled:true})
  act({type:'leaf',category:'lighting',leaf:'dynamicAtmosphere',enabled:true})
  assert.equal(resolve(p,c).dynamicAtmosphere,false)
  assert.equal(p.categories.lighting.sunLighting,false)
  act({type:'leaf',category:'lighting',leaf:'sunLighting',enabled:true})
  assert.equal(resolve(p,c).dynamicAtmosphere,false)
  act({type:'category',category:'atmosphere',enabled:true})
  act({type:'leaf',category:'atmosphere',leaf:'groundAtmosphere',enabled:true})
  assert.equal(resolve(p,c).dynamicAtmosphere,true)
  for(const action of [{type:'master',enabled:false},{type:'category',category:'lighting',enabled:false},
    {type:'category',category:'atmosphere',enabled:false},
    {type:'leaf',category:'lighting',leaf:'sunLighting',enabled:false},
    {type:'leaf',category:'atmosphere',leaf:'groundAtmosphere',enabled:false}]){
    const off=reduce(p,action,c)
    assert.equal(resolve(off,c).dynamicAtmosphere,false)
    assert.equal(off.categories.lighting.dynamicAtmosphere,true)
    assert.deepEqual(reduce(off,{...action,enabled:true},c),p)
  }
  assert.equal(resolve(p,caps()).dynamicAtmosphere,false)
  for(const preset of ['performance','balanced','maximum']){
    const neutral=reduce(p,{type:'preset',preset},c)
    assert.equal(neutral.categories.lighting.dynamicAtmosphere,false)
    assert.equal(resolve(neutral,c).dynamicAtmosphere,false)
  }
})
