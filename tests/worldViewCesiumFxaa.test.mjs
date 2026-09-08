import test from 'node:test'
import assert from 'node:assert/strict'
import { cesiumFxaaAvailable, setCesiumFxaa, cesiumFxaaState } from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
import { createVisualFidelityEffect } from '../src/lib/worldViewVisualFidelity.js'

test('FXAA reuses the built-in stage and requests frames only on an actual change', () => {
  let renders = 0
  const stage = { enabled: false, ready: true }
  const camera = { retained: true }
  const viewer = { camera, scene: { requestRenderMode: true, postProcessStages: { fxaa: stage },
    requestRender: () => { renders++ } } }
  assert.equal(cesiumFxaaAvailable(viewer), true)
  for (const enabled of [false, true, true, false, false]) assert.equal(setCesiumFxaa(viewer, enabled), true)
  assert.equal(renders, 2)
  assert.equal(viewer.camera, camera)
  assert.equal(viewer.scene.postProcessStages.fxaa, stage)
  assert.equal(viewer.scene.requestRenderMode, true)
  assert.deepEqual(cesiumFxaaState(viewer), { enabled: false, ready: true })
  assert.equal(setCesiumFxaa(viewer, 'true'), false)
})
test('missing, destroyed and rejecting FXAA stages never advertise successful application', () => {
  for (const viewer of [null, {}, { isDestroyed: () => true, scene: { postProcessStages: { fxaa: { enabled: true } } } }]) {
    assert.equal(cesiumFxaaAvailable(viewer), false)
    assert.equal(setCesiumFxaa(viewer, true), false)
    assert.deepEqual(cesiumFxaaState(viewer), { enabled: false, ready: false })
  }
  const viewer = { scene: { postProcessStages: { fxaa: { get enabled() { return false }, set enabled(value) {} } } } }
  const effect = createVisualFidelityEffect(enabled => setCesiumFxaa(viewer, enabled))
  assert.equal(effect.set(true), false)
  assert.equal(effect.hasFailed(), true)
  assert.equal(effect.set(false), true)
  assert.equal(effect.hasFailed(), true)
})
