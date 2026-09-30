// GPU-free lifecycle ordering tests. Native browser loss is separately verified
// by runWorldViewContextLossBrowser; these emitters do not claim GPU evidence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGlobeFailureLifecycle } from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

function fixture({ cancelled = () => false, onCapture } = {}) {
  const nativeListeners = new Set(), renderListeners = new Set(), queue = [], events = []
  let destroyed = false, destroyCount = 0, lifecycle
  const camera = Object.freeze({ lon: -81.7, lat: 41.4, heightMeters: 100000,
    headingDegrees: 346, pitchDegrees: -32, rollDegrees: 0 })
  const viewer = {
    useDefaultRenderLoop: true,
    isDestroyed: () => destroyed,
    canvas: {
      addEventListener(type, callback) { assert.equal(type, 'webglcontextlost'); nativeListeners.add(callback) },
      removeEventListener(type, callback) { assert.equal(type, 'webglcontextlost'); nativeListeners.delete(callback) },
    },
    scene: { renderError: { addEventListener(callback) {
      renderListeners.add(callback); return () => renderListeners.delete(callback)
    } } },
    cameraState() { assert.equal(destroyed, false, 'camera is read only while viewer is alive'); return camera },
  }
  const captures = []
  lifecycle = createGlobeFailureLifecycle({
    viewer, isCancelled: cancelled, enqueue: callback => queue.push(callback),
    onFatalFailure(kind, error) {
      events.push('capture')
      captures.push({ kind, error, camera: viewer.cameraState() })
      onCapture?.(lifecycle)
    },
    destroyResources() { events.push('destroy'); destroyed = true; destroyCount++ },
  })
  return {
    viewer, lifecycle, queue, events, camera, captures,
    queuedCallbacks() {
      const native = [...nativeListeners][0], render = [...renderListeners][0]
      return { native, render: error => render(viewer.scene, error) }
    },
    nativeLoss() { for (const callback of [...nativeListeners]) callback() },
    renderFailure(error) { for (const callback of [...renderListeners]) callback(viewer.scene, error) },
    flush() { for (const callback of queue.splice(0)) callback() },
    counts: () => ({ native: nativeListeners.size, render: renderListeners.size, destroyed, destroyCount }),
  }
}

test('native context loss captures the live camera once and defers teardown', () => {
  const f = fixture()
  f.nativeLoss()
  assert.equal(f.viewer.useDefaultRenderLoop, false)
  assert.deepEqual(f.events, ['capture'], 'native callback never destroys resources inside event dispatch')
  assert.equal(f.captures.length, 1); assert.equal(f.captures[0].kind, 'context-lost')
  assert.equal(f.captures[0].camera, f.camera, 'capture preserves the exact original display camera')
  assert.deepEqual(f.counts(), { native: 0, render: 0, destroyed: false, destroyCount: 0 })
  assert.equal(f.queue.length, 1)
  f.flush()
  assert.deepEqual(f.events, ['capture', 'destroy'])
  assert.deepEqual(f.counts(), { native: 0, render: 0, destroyed: true, destroyCount: 1 })
})

test('renderError does not destroy the Scene while the draw resumes', () => {
  const f = fixture(), error = new Error('actual draw failed')
  f.renderFailure(error)
  assert.equal(f.captures[0].kind, 'render-error'); assert.equal(f.captures[0].error, error)
  // The enclosing renderer stack can finish accessing its owned resources.
  assert.equal(f.viewer.cameraState(), f.camera)
  assert.equal(f.counts().destroyed, false)
  f.flush()
  assert.equal(f.counts().destroyCount, 1)
  assert.throws(() => f.viewer.cameraState(), /camera is read only while viewer is alive/)
})

test('native loss followed by draw failure or owner cleanup cannot double-transition or teardown', () => {
  const f = fixture()
  f.nativeLoss(); f.nativeLoss(); f.renderFailure(new Error('later error'))
  f.lifecycle.destroy(); f.lifecycle.destroy()
  assert.equal(f.captures.length, 1); assert.equal(f.queue.length, 1)
  assert.equal(f.counts().destroyCount, 0)
  f.flush(); f.lifecycle.destroy(); f.nativeLoss(); f.renderFailure(new Error('stale'))
  assert.equal(f.captures.length, 1); assert.equal(f.counts().destroyCount, 1)
})


test('already queued stale callbacks are guarded even after listener removal and disposal', () => {
  const f = fixture(), pending = f.queuedCallbacks()
  pending.native(); pending.render(new Error('already queued draw')); pending.native()
  assert.equal(f.captures.length, 1); assert.equal(f.queue.length, 1)
  f.flush()
  pending.native(); pending.render(new Error('after disposal'))
  assert.equal(f.captures.length, 1); assert.equal(f.counts().destroyCount, 1)
})

test('synchronous owner cleanup during camera handoff still waits for failure stack to exit', () => {
  const f = fixture({ onCapture: lifecycle => lifecycle.destroy() })
  f.renderFailure(new Error('failed draw'))
  assert.deepEqual(f.events, ['capture']); assert.equal(f.counts().destroyed, false)
  assert.equal(f.queue.length, 1)
  f.flush()
  assert.deepEqual(f.events, ['capture', 'destroy'])
})

test('ordinary unmount removes both listeners and destroys once without a fallback', () => {
  const f = fixture()
  f.lifecycle.destroy(); f.lifecycle.destroy()
  assert.deepEqual(f.events, ['destroy']); assert.equal(f.queue.length, 0)
  f.nativeLoss(); f.renderFailure(new Error('stale'))
  assert.equal(f.captures.length, 0)
  assert.deepEqual(f.counts(), { native: 0, render: 0, destroyed: true, destroyCount: 1 })
})

test('cancelled pending owner ignores late failures and regular cleanup removes listeners', () => {
  let cancelled = false
  const f = fixture({ cancelled: () => cancelled })
  cancelled = true
  f.nativeLoss(); f.renderFailure(new Error('late draw'))
  assert.equal(f.captures.length, 0); assert.equal(f.queue.length, 0)
  f.lifecycle.destroy()
  assert.deepEqual(f.counts(), { native: 0, render: 0, destroyed: true, destroyCount: 1 })
})

test('teardown remains scheduled if the handoff callback throws', () => {
  const f = fixture({ onCapture: () => { throw new Error('owner bug') } })
  assert.throws(() => f.renderFailure(new Error('draw')), /owner bug/)
  assert.equal(f.queue.length, 1); assert.equal(f.counts().destroyed, false)
  f.flush()
  assert.equal(f.counts().destroyCount, 1)
})

test('default scheduling waits until the actual synchronous draw stack exits', async () => {
  let renderCallback, destroyed = false, captureCount = 0
  const viewer = {
    useDefaultRenderLoop: true, isDestroyed: () => destroyed,
    scene: { renderError: { addEventListener(callback) { renderCallback = callback; return () => {} } } },
  }
  const lifecycle = createGlobeFailureLifecycle({
    viewer,
    onFatalFailure() { assert.equal(destroyed, false); captureCount++ },
    destroyResources() { destroyed = true },
  })
  renderCallback(viewer.scene, new Error('draw failure'))
  assert.equal(captureCount, 1); assert.equal(destroyed, false)
  await Promise.resolve()
  assert.equal(destroyed, true)
  lifecycle.destroy()
  assert.equal(captureCount, 1)
})
