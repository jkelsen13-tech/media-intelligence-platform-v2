import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createVisualFidelityEffect,
  defaultVisualFidelityProfile as defaults, normalizeVisualFidelityProfile as normalize,
  reduceVisualFidelityProfile as reduce, resolveVisualFidelityProfile as resolve,
  visualFidelityCapabilities as caps, visualFidelityCategoryState as categoryState,
} from '../src/lib/worldViewVisualFidelity.js'
import { createWorldViewRendererAdapter } from '../src/lib/worldViewRendererAdapter.js'

const supported = caps({ relief: true })
const edit = (profile, action) => reduce(profile, action, supported)
test('VF-1 preserves existing relief and defers every new rendering feature', () => {
  const profile = defaults()
  assert.equal(profile.preset, 'custom')
  assert.deepEqual(JSON.parse(JSON.stringify(profile)), profile)
  const active = resolve(profile, supported)
  assert.equal(active.reliefShading, true)
  assert.equal(active.resolutionScale, 1)
  assert.equal(active.refinement, 'neutral')
  assert.equal(Object.values(active).filter(value => value === true).length, 1)
})
test('master and category gates preserve exact child choices and preset', () => {
  const profile = edit(defaults(), { type: 'preset', preset: 'maximum' })
  const frozen = JSON.stringify(profile)
  const off = edit(profile, { type: 'master', enabled: false })
  assert.equal(resolve(off, supported).reliefShading, false)
  assert.equal(off.categories.terrain.reliefShading, true)
  assert.deepEqual(edit(off, { type: 'master', enabled: true }), profile)
  const categoryOff = edit(profile, { type: 'category', category: 'terrain', enabled: false })
  assert.equal(categoryOff.preset, 'custom')
  assert.equal(categoryOff.categories.terrain.reliefShading, true)
  assert.equal(resolve(categoryOff, supported).reliefShading, false)
  const restored = edit(categoryOff, { type: 'category', category: 'terrain', enabled: true })
  assert.equal(resolve(restored, supported).reliefShading, true)
  assert.equal(JSON.stringify(profile), frozen, 'input never mutated')
})
test('presets are deterministic and deferred/foreign fields cannot activate effects', () => {
  for (const preset of ['performance','balanced','maximum']) {
    const dirty = defaults()
    dirty.categories.lighting.sunLighting = true
    dirty.categories.imageQuality.resolutionScale = 1000
    dirty.camera = { injected: true }
    const result = edit(dirty, {type:'preset',preset})
    assert.deepEqual(result, edit(defaults(),{type:'preset',preset}))
    assert.equal(resolve(result,supported).reliefShading, preset !== 'performance')
    assert.equal(result.categories.imageQuality.resolutionScale,1)
    assert.equal(result.categories.lighting.sunLighting,false)
    assert.equal(result.camera,undefined)
  }
  for (const bad of [null,[],{version:2,enabled:true}, {version:1,enabled:'false'}]) {
    assert.equal(resolve(normalize(bad),supported).reliefShading,false)
  }
  const forged=defaults(); forged.preset='performance'
  assert.equal(normalize(forged).preset,'custom')
  assert.equal(edit(defaults(),{type:'leaf',category:'lighting',leaf:'sunLighting',enabled:true}).categories.lighting.sunLighting,false)
})
test('fallback masks effects without erasing remembered preferences', () => {
  const profile=defaults(), unavailable=caps({reason:'Fallback'})
  assert.equal(resolve(profile,unavailable).reliefShading,false)
  assert.equal(profile.categories.terrain.reliefShading,true)
  assert.equal(resolve(profile,supported).reliefShading,true)
  assert.equal(categoryState(profile,'terrain',unavailable).unavailable,true)
  assert.equal(categoryState(profile,'terrain',supported).checked,true)
  assert.deepEqual(reduce(profile,{type:'leaf',category:'terrain',leaf:'reliefShading',enabled:false},unavailable),profile)
})
test('mixed category derives only from supported leaves, not deferred children', () => {
  const profile=defaults()
  const withRefinement={...supported,refinement:{status:'supported'}}
  assert.equal(categoryState(profile,'terrain',withRefinement).mixed,true)
  assert.equal(categoryState(profile,'terrain',supported).mixed,false)
})
test('latest profile survives asynchronous startup without extra mounts or selection/camera writes', async () => {
  let ready, count=0
  const started=new Promise(resolve=>{ready=resolve})
  const profiles=[]
  const adapter=createWorldViewRendererAdapter({stackId:'ellipsoid-globe'},{
    loadGlobeAdapter:async()=>({createCesiumEllipsoidRendererAdapter:()=>({
      mount:()=>{count++;return started},
      setVisualFidelityProfile:profile=>{profiles.push(profile);return true},
      getVisualFidelityCapabilities:()=>supported,
    })}),
  })
  const pending=adapter.mount()
  const profile=edit(defaults(),{type:'master',enabled:false})
  adapter.setVisualFidelityProfile(defaults())
  adapter.setVisualFidelityProfile(profile)
  profile.enabled=true // queued profile must be its own serializable snapshot
  assert.equal(adapter.getVisualFidelityCapabilities().reliefShading.status,'unavailable')
  ready();await pending
  assert.equal(count,1)
  assert.equal(profiles.length,1)
  assert.equal(profiles[0].enabled,false)
  adapter.setVisualFidelityProfile(defaults())
  assert.equal(profiles.length,2)
  assert.equal(count,1)
  adapter.destroy()
  assert.equal(adapter.setVisualFidelityProfile(defaults()),false)
  assert.equal(adapter.getVisualFidelityCapabilities().reliefShading.status,'unavailable')
})
test('fallback adapter refuses unsupported effects even after mount',async()=>{
  const adapter=createWorldViewRendererAdapter({stackId:'openfreemap-positron'},{
    createMapAdapter:()=>({mount:async()=>{}}),
  })
  await adapter.mount()
  assert.equal(adapter.setVisualFidelityProfile(defaults()),false)
  assert.equal(adapter.getVisualFidelityCapabilities().reliefShading.status,'unavailable')
  adapter.destroy()
})

test('effect application is idempotent and failures remain unavailable after neutral cleanup',()=>{
  const calls=[]
  const effect=createVisualFidelityEffect(enabled=>{calls.push(enabled);return true})
  for(const value of [true,true,false,false,true]) assert.equal(effect.set(value),true)
  assert.deepEqual(calls,[true,false,true])
  assert.equal(effect.isEnabled(),true)
  for(const mode of ['false','throw']){
    const failure=createVisualFidelityEffect(enabled=>{
      if(enabled){if(mode==='throw')throw new Error('render failure');return false}
      return true
    })
    assert.equal(failure.set(true),false)
    assert.equal(failure.hasFailed(),true)
    assert.equal(failure.set(false),true,'neutral cleanup is still attempted')
    assert.equal(failure.hasFailed(),true,'cleanup does not claim the failed effect is supported')
    assert.equal(failure.isEnabled(),false)
    assert.equal(failure.set(true),false,'no automatic repeated failing application')
  }
})
