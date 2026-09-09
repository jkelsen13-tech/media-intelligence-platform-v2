import test from 'node:test'
import assert from 'node:assert/strict'
import { atmosphereAvailable, setAtmosphereEffect, atmosphereState } from '../src/lib/worldViewCesiumAtmosphere.js'
import { defaultVisualFidelityProfile as defaults, reduceVisualFidelityProfile as reduce, resolveVisualFidelityProfile as resolve, visualFidelityCapabilities as caps, createVisualFidelityEffect } from '../src/lib/worldViewVisualFidelity.js'
const effects=['groundAtmosphere','distanceHaze']
const available=caps({groundAtmosphere:true,distanceHaze:true})
test('atmosphere preferences are strictly boolean, neutral in presets, remembered and masked in fallback',()=>{
  let p=reduce(defaults(),{type:'category',category:'atmosphere',enabled:true},available)
  for(const leaf of effects)p=reduce(p,{type:'leaf',category:'atmosphere',leaf,enabled:true},available)
  for(const leaf of effects)assert.equal(resolve(p,available)[leaf],true)
  for(const gate of [{type:'master',enabled:false},{type:'category',category:'atmosphere',enabled:false}]){
    const off=reduce(p,gate,available)
    for(const leaf of effects){assert.equal(resolve(off,available)[leaf],false);assert.equal(off.categories.atmosphere[leaf],true)}
    assert.deepEqual(reduce(off,{...gate,enabled:true},available),p)
  }
  for(const preset of ['performance','balanced','maximum'])
    for(const leaf of effects)assert.equal(resolve(reduce(p,{type:'preset',preset},available),available)[leaf],false)
  for(const leaf of effects){
    assert.equal(resolve(p,caps())[leaf],false)
    for(const bad of [1,'true',{},null]){
      const dirty=structuredClone(p);dirty.categories.atmosphere[leaf]=bad
      assert.equal(resolve(dirty,available)[leaf],false)
    }
  }
})
test('atmosphere touches only public display booleans; culling, light, camera, time and canvas are preserved',()=>{
  let requests=0
  const camera={},clock={currentTime:'retained-clock'},canvas={}
  const fog={enabled:true,renderable:true,density:0.0006,heightScalar:0.001,heightFalloff:0.59,maxHeight:800000,screenSpaceErrorFactor:2,visualDensityScalar:0.15}
  const globe={enableLighting:false,showGroundAtmosphere:true,dynamicAtmosphereLighting:true}
  const viewer={camera,clock,canvas,scene:{fog,globe,requestRenderMode:true,requestRender:()=>requests++}}
  const before=atmosphereState(viewer).fogPolicy
  for(const effect of effects)for(const enabled of [false,false,true,true,false])assert.equal(setAtmosphereEffect(viewer,effect,enabled),true)
  assert.equal(requests,6)
  assert.deepEqual(atmosphereState(viewer).fogPolicy,before)
  assert.equal(globe.enableLighting,false);assert.equal(globe.dynamicAtmosphereLighting,true)
  assert.equal(viewer.camera,camera);assert.equal(viewer.clock,clock);assert.equal(clock.currentTime,'retained-clock');assert.equal(viewer.canvas,canvas)
  assert.equal(viewer.scene.requestRenderMode,true)
  for(const effect of effects)assert.equal(atmosphereState(viewer)[effect],false)
  assert.equal(setAtmosphereEffect(viewer,'distanceHaze','true'),false)
})
test('unqualified lighting, disabled fog, missing APIs and rejected writes never advertise a supported effect',()=>{
  for(const v of [null,{}, {isDestroyed:()=>true}, {scene:{globe:{enableLighting:true,showGroundAtmosphere:true}}}])
    for(const effect of effects)assert.equal(atmosphereAvailable(v,effect),false)
  const viewer={scene:{globe:{enableLighting:false},fog:{enabled:false,renderable:false}}}
  assert.equal(atmosphereAvailable(viewer,'distanceHaze'),false)
  let writes=0
  viewer.scene.fog={enabled:true,get renderable(){return false},set renderable(value){writes++}}
  const controller=createVisualFidelityEffect(value=>setAtmosphereEffect(viewer,'distanceHaze',value))
  assert.equal(controller.set(true),false);assert.equal(controller.hasFailed(),true)
  assert.equal(controller.set(false),true);assert.equal(controller.hasFailed(),true)
  assert.equal(controller.set(true),false);assert.equal(writes,1)
})
