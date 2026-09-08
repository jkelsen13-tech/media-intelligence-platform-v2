import test from 'node:test'
import assert from 'node:assert/strict'
import {createCameraFraming} from '../src/lib/worldViewCameraFraming.js'
import {cancelMapCameraFlight, createWorldViewRendererAdapter} from '../src/lib/worldViewRendererAdapter.js'
import {cancelGlobeCameraFlight, applyCameraStateToGlobeViewer} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'

const features = [{selected: true, positions: [[-81.7, 41.4]], row: {mip_object_id: 'a', precision_class: 'city'}}]

test('cleared geometry cancels an accepted flight once and permits reselection', () => {
  const framing = createCameraFraming(), calls = []
  const adapter = {flyToSubjectCamera: () => {calls.push('fly'); return true},
    cancelCameraFlight: () => {calls.push('cancel'); return true}}
  framing.select(features); framing.apply(adapter)
  framing.select(features); framing.apply(adapter)
  assert.deepEqual(calls, ['fly'], 'ordinary refresh must not interrupt navigation')
  framing.select([]); framing.apply(adapter); framing.apply(adapter)
  assert.deepEqual(calls, ['fly', 'cancel'])
  framing.select(features); framing.apply(adapter)
  assert.deepEqual(calls, ['fly', 'cancel', 'fly'])
})
test('pending cancellation survives temporary adapter unavailability', () => {
  const framing = createCameraFraming()
  framing.select(features); framing.apply({flyToSubjectCamera: () => true})
  framing.select([]); framing.apply(null)
  let stopped = 0
  framing.apply({cancelCameraFlight: () => {stopped++; return true}})
  framing.apply({cancelCameraFlight: () => {stopped++; return true}})
  assert.equal(stopped, 1)
})
test('renderer reset does not send an obsolete cancellation to replacement renderer', () => {
  const framing = createCameraFraming()
  framing.select(features); framing.apply({flyToSubjectCamera: () => true})
  framing.select([]); framing.resetRenderer()
  framing.apply({cancelCameraFlight: () => {throw Error('obsolete cancellation')}})
})
test('both cancellation adapters stop without completing flight or changing a target', () => {
  const calls = []
  assert.equal(cancelMapCameraFlight({stop: () => calls.push('map-stop')}), true)
  assert.equal(cancelGlobeCameraFlight({camera: {cancelFlight: () => calls.push('globe-stop')}}), true)
  assert.deepEqual(calls, ['map-stop', 'globe-stop'])
  assert.equal(cancelMapCameraFlight(null), false)
  assert.equal(cancelGlobeCameraFlight({isDestroyed: () => true}), false)
})
test('globe restore cancels previous flight before applying the restored position', () => {
  const calls = []
  const Cesium = {Math: {toRadians: value => value * Math.PI / 180},
    Cartesian3: {fromDegrees: (...args) => args}}
  const viewer = {camera: {cancelFlight: () => calls.push('cancel'), setView: options => calls.push(options)},
    scene: {requestRender: () => calls.push('render')}}
  const state = {lon: 10, lat: 40, heightMeters: 2000000, headingDegrees: 0, pitchDegrees: -90, rollDegrees: 0}
  assert.equal(applyCameraStateToGlobeViewer(Cesium, viewer, null), false)
  assert.deepEqual(calls, [])
  assert.equal(applyCameraStateToGlobeViewer(Cesium, viewer, state), true)
  assert.equal(calls[0], 'cancel')
  assert.deepEqual(calls[1].destination, [10, 40, 2000000])
  assert.equal(calls[2], 'render')
})
for (const stackId of ['ellipsoid-globe', 'openfreemap-positron']) {
  test(stackId + ': dispatcher does not cancel before ready or after destruction', async () => {
    let ready, calls = 0
    const startup = new Promise(resolve => {ready = resolve})
    const factory = () => ({mount: () => startup, cancelCameraFlight: () => {calls++; return true}})
    const adapter = createWorldViewRendererAdapter({stackId}, {
      loadGlobeAdapter: async () => ({createCesiumEllipsoidRendererAdapter: factory}), createMapAdapter: factory})
    const mounting = adapter.mount()
    assert.equal(adapter.cancelCameraFlight(), false)
    ready(); await mounting
    assert.equal(adapter.cancelCameraFlight(), true)
    adapter.destroy()
    assert.equal(adapter.cancelCameraFlight(), false)
    assert.equal(calls, 1)
  })
}
