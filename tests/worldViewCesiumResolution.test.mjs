import test from 'node:test'
import assert from 'node:assert/strict'
import {cesiumResolutionAvailable, setCesiumResolutionScale, cesiumResolutionState, createCesiumResolutionController} from '../src/lib/worldViewCesiumResolution.js'
import {defaultVisualFidelityProfile as defaults, normalizeVisualFidelityProfile as normalize, reduceVisualFidelityProfile as reduce, resolveVisualFidelityProfile as resolve, visualFidelityCapabilities as caps, visualFidelityCategoryState as category} from '../src/lib/worldViewVisualFidelity.js'
const available=caps({resolution:true,fxaa:true})
test('bounded resolution is strict, neutral in presets, and retained through category/master/fallback gates',()=>{
  let p=reduce(defaults(),{type:'category',category:'imageQuality',enabled:true},available)
  p=reduce(p,{type:'resolution',value:1.25},available)
  assert.equal(p.preset,'custom')
  assert.equal(resolve(p,available).resolutionScale,1.25)
  assert.equal(category(p,'imageQuality',available).mixed,true)
  for(const action of [{type:'master',enabled:false},{type:'category',category:'imageQuality',enabled:false}]){
    const off=reduce(p,action,available)
    assert.equal(resolve(off,available).resolutionScale,1)
    assert.equal(off.categories.imageQuality.resolutionScale,1.25)
    assert.deepEqual(reduce(off,{...action,enabled:true},available),p)
  }
  assert.equal(resolve(p,caps()).resolutionScale,1)
  assert.equal(resolve(p,available).resolutionScale,1.25)
  for(const preset of ['performance','balanced','maximum'])
    assert.equal(resolve(reduce(p,{type:'preset',preset},available),available).resolutionScale,1)
  for(const bad of [0,2,1000,NaN,Infinity,'1.25',true,{},null,undefined]){
    const dirty=structuredClone(p);dirty.categories.imageQuality.resolutionScale=bad
    assert.equal(normalize(dirty).categories.imageQuality.resolutionScale,1)
    assert.deepEqual(reduce(p,{type:'resolution',value:bad},available),p)
  }
  assert.deepEqual(reduce(p,{type:'resolution',value:0.75},caps()),p)
})
test('resolution reuses viewer/canvas and leaves camera, time, pixel policy and request rendering unchanged',()=>{
  let renders=0,resizes=0
  const canvas={width:800,height:400,clientWidth:800,clientHeight:400}
  const camera={},clock={}
  const viewer={resolutionScale:1,useBrowserRecommendedResolution:true,canvas,camera,clock,
    resize(){resizes++;canvas.width=800*this.resolutionScale;canvas.height=400*this.resolutionScale},
    scene:{requestRenderMode:true,requestRender:()=>renders++}}
  for(const value of [1,0.75,0.75,1.25,1.25,1])assert.equal(setCesiumResolutionScale(viewer,value),true)
  assert.equal(renders,3);assert.equal(resizes,3)
  assert.equal(viewer.canvas,canvas);assert.equal(viewer.camera,camera);assert.equal(viewer.clock,clock)
  assert.equal(viewer.scene.requestRenderMode,true);assert.equal(viewer.useBrowserRecommendedResolution,true)
  assert.deepEqual(cesiumResolutionState(viewer),{scale:1,available:true,width:800,height:400,cssWidth:800,cssHeight:400,browserRecommended:true})
  for(const bad of [NaN,Infinity,0,2,'0.75'])assert.equal(setCesiumResolutionScale(viewer,bad),false)
  assert.equal(renders,3)
})
test('unavailable pixel policy and rejected resolution changes stay unavailable without a retry loop',()=>{
  for(const viewer of [null,{}, {isDestroyed:()=>true}, {scene:{},resolutionScale:1,useBrowserRecommendedResolution:false,resize(){}}])
    assert.equal(cesiumResolutionAvailable(viewer),false)
  let attempts=0
  const viewer={scene:{requestRender(){}},useBrowserRecommendedResolution:true,resize(){},
    get resolutionScale(){return 1},set resolutionScale(value){attempts++}}
  const controller=createCesiumResolutionController(()=>viewer)
  assert.equal(controller.available(),true)
  assert.equal(controller.set(1.25),false)
  assert.equal(controller.hasFailed(),true)
  assert.equal(controller.available(),false)
  assert.equal(controller.set(1),true)
  assert.equal(controller.set(0.75),false)
  assert.equal(attempts,1)
})
