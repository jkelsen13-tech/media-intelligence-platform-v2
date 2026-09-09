import test from 'node:test'
import assert from 'node:assert/strict'
import { createCesiumRefinementController } from '../src/lib/worldViewCesiumRefinement.js'
import { TERRAIN_REFINEMENT, defaultVisualFidelityProfile as defaults,
  normalizeVisualFidelityProfile as normalize, reduceVisualFidelityProfile as reduce,
  resolveVisualFidelityProfile as resolve, visualFidelityCapabilities as caps,
  visualFidelityCategoryState as categoryState } from '../src/lib/worldViewVisualFidelity.js'

function setup() {
  let requests = 0, approved = true, destroyed = false
  const provider = Object.freeze({ source: 'fixture-approved', maxLevel: 15 })
  const viewer = { terrainProvider: provider, camera: Object.freeze({ position: 'same' }),
    clock: Object.freeze({ instant: 'same' }), entities: Object.freeze([]),
    isDestroyed: () => destroyed,
    scene: { requestRenderMode: true, globe: { maximumScreenSpaceError: 2 },
      requestRender: () => requests++ } }
  const controller = createCesiumRefinementController(() => viewer, () => approved)
  return { viewer, controller, requests: () => requests,
    degrade: () => { approved = false }, destroy: () => { destroyed = true } }
}
test('bounded refinement touches only the public globe refinement property and requests changed frames', () => {
  const f = setup(), { viewer, controller } = f
  const before = { camera: viewer.camera, clock: viewer.clock, entities: viewer.entities, provider: viewer.terrainProvider }
  for (const mode of ['neutral', 'coarse', 'coarse', 'fine', 'neutral']) {
    assert.equal(controller.set(mode), true)
    assert.equal(viewer.scene.globe.maximumScreenSpaceError, TERRAIN_REFINEMENT[mode])
    assert.equal(controller.state().mode, mode)
  }
  assert.equal(f.requests(), 3)
  assert.equal(viewer.camera, before.camera); assert.equal(viewer.clock, before.clock)
  assert.equal(viewer.entities, before.entities); assert.equal(viewer.terrainProvider, before.provider)
  assert.equal(viewer.scene.requestRenderMode, true)
})
test('foreign refinement values cannot expand quality or invoke coercion', () => {
  const { controller, viewer } = setup()
  for (const mode of [null, undefined, 1, 0, NaN, Infinity, '1', '', 'ultra', '__proto__', 'toString',
    { toString() { assert.fail('must not coerce unknown objects') } }]) {
    assert.equal(controller.set(mode), false)
    assert.equal(viewer.scene.globe.maximumScreenSpaceError, 2)
  }
})
test('unapproved terrain masks refinement while neutral cleanup remains available', () => {
  const f = setup()
  assert.equal(f.controller.set('fine'), true)
  f.degrade()
  assert.equal(f.controller.available(), false)
  assert.equal(f.controller.set('coarse'), false)
  assert.equal(f.controller.set('neutral'), true)
  assert.equal(f.viewer.scene.globe.maximumScreenSpaceError, 2)
  f.destroy()
  assert.equal(f.controller.available(), false)
  assert.equal(f.controller.set('neutral'), false)
  assert.equal(createCesiumRefinementController(() => null, () => true).available(), false)
})
test('rejected refinement writes latch unavailable and attempt neutral restoration', () => {
  for (const throws of [false, true]) {
    const { viewer, controller } = setup()
    let value = 2
    Object.defineProperty(viewer.scene.globe, 'maximumScreenSpaceError', {
      get: () => value,
      set: next => { if (next === 1) { if (throws) throw new Error('setter rejected'); return } value = next },
    })
    assert.equal(controller.set('fine'), false)
    assert.equal(controller.available(), false)
    assert.equal(controller.hasFailed(), true)
    assert.equal(controller.set('neutral'), true)
    assert.equal(controller.set('coarse'), false)
    assert.equal(value, 2)
  }
})
test('refinement is remembered through gates and fallback, and neutral in every preset', () => {
  const available = caps({ relief: true, refinement: true })
  let p = reduce(defaults(), { type: 'refinement', value: 'fine' }, available)
  assert.equal(p.preset, 'custom'); assert.equal(resolve(p, available).refinement, 'fine')
  assert.equal(categoryState(p, 'terrain', available).checked, true)
  assert.equal(categoryState(defaults(), 'terrain', available).mixed, true)
  for (const action of [{ type: 'master', enabled: false }, { type: 'category', category: 'terrain', enabled: false }]) {
    const off = reduce(p, action, available)
    assert.equal(resolve(off, available).refinement, 'neutral')
    assert.equal(off.categories.terrain.refinement, 'fine')
    assert.deepEqual(reduce(off, { ...action, enabled: true }, available), p)
  }
  assert.equal(resolve(p, caps()).refinement, 'neutral')
  assert.equal(resolve(p, available).refinement, 'fine')
  for (const preset of ['performance', 'balanced', 'maximum'])
    assert.equal(resolve(reduce(p, { type: 'preset', preset }, available), available).refinement, 'neutral')
  for (const value of [null, false, 1, 'ultra', '__proto__']) {
    const dirty = structuredClone(p); dirty.categories.terrain.refinement = value
    assert.equal(normalize(dirty).categories.terrain.refinement, 'neutral')
    assert.deepEqual(reduce(p, { type: 'refinement', value }, available), p)
  }
  assert.deepEqual(reduce(p, { type: 'refinement', value: 'coarse' }, caps()), p)
})
