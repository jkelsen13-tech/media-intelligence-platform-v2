import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraStatesEqual, clampRollDegrees, makeCameraState, parseCameraState, serializeCameraState } from '../src/lib/worldViewCameraState.js'
import { cameraStateFromGlobeCamera, applyCameraStateToGlobeViewer } from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'

const math = { toDegrees: value => value * 180 / Math.PI, toRadians: value => value * Math.PI / 180 }
function globeCamera(rollDegrees) {
  return {
    positionCartographic: { longitude: math.toRadians(-81.7), latitude: math.toRadians(41.4), height: 2000000 },
    heading: math.toRadians(346), pitch: math.toRadians(-32), roll: math.toRadians(rollDegrees),
  }
}

test('near-2π Cesium roll capture remains upright instead of becoming a 180-degree reversal', () => {
  const camera = globeCamera(360 - 1e-10)
  const previousBehavior = makeCameraState({
    lon: -81.7, lat: 41.4, heightMeters: 2000000,
    headingDegrees: 346, pitchDegrees: -32, rollDegrees: math.toDegrees(camera.roll),
  }, 'city')
  assert.equal(previousBehavior.rollDegrees, 180, 'external oversized-input clamp is preserved')
  const captured = cameraStateFromGlobeCamera(math, camera, 'city')
  assert.ok(Math.abs(captured.rollDegrees) < 1e-7)
  assert.equal(captured.headingDegrees, 346)
  assert.equal(captured.pitchDegrees, -32)
  assert.equal(captured.heightMeters, 2000000)
  assert.ok(cameraStatesEqual(captured, parseCameraState(serializeCameraState(captured))))
})

test('globe roll capture preserves signed physical angles and the existing precision floor', () => {
  for (const [reported, expected] of [[330, -30], [30, 30], [180, -180], [-180, -180], [-30, -30], [360, 0], [0, 0]]) {
    const camera = globeCamera(reported)
    camera.positionCartographic.height = 50
    const before = JSON.stringify(camera)
    const state = cameraStateFromGlobeCamera(math, camera, 'city')
    assert.ok(Math.abs(state.rollDegrees - expected) < 1e-7)
    assert.equal(state.heightMeters, heightMetersForPrecisionClass('city'))
    assert.equal(JSON.stringify(camera), before, 'capture cannot mutate the live camera')
  }
  for (const invalid of [NaN, Infinity, undefined]) {
    const camera = globeCamera(0)
    camera.roll = invalid
    assert.equal(cameraStateFromGlobeCamera(math, camera, 'city'), null, 'invalid capture cannot default a null normalized roll to upright')
  }
  assert.equal(clampRollDegrees(400), 180)
  assert.equal(clampRollDegrees(-400), -180)
  const external = parseCameraState({ version: 1, lon: 0, lat: 0, heightMeters: 2000000, rollDegrees: 360 })
  assert.equal(external.rollDegrees, 180, 'external parse remains fail-safe clamping, not silent periodic reinterpretation')
})

test('capture -> memory serialization -> restore does not flip an upright oblique camera', () => {
  const original = cameraStateFromGlobeCamera(math, globeCamera(360 - 1e-10), 'city')
  const serialized = serializeCameraState(original)
  const restored = parseCameraState(serialized, { precisionClass: 'city' })
  const liveCamera = globeCamera(0)
  let renders = 0, cancellations = 0
  const viewer = {
    camera: {
      cancelFlight: () => cancellations++,
      setView({ destination, orientation }) {
        liveCamera.positionCartographic = {
          longitude: math.toRadians(destination.lon), latitude: math.toRadians(destination.lat), height: destination.height,
        }
        liveCamera.heading = orientation.heading
        liveCamera.pitch = orientation.pitch
        // Model Cesium's public roll getter range.
        liveCamera.roll = ((orientation.roll % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      },
    },
    scene: { requestRender: () => renders++ },
  }
  const cesium = { Math: math, Cartesian3: { fromDegrees: (lon, lat, height) => ({ lon, lat, height }) } }
  assert.equal(applyCameraStateToGlobeViewer(cesium, viewer, restored), true)
  const recaptured = cameraStateFromGlobeCamera(math, liveCamera, 'city')
  assert.ok(Math.abs(recaptured.rollDegrees) < 1e-7)
  assert.ok(cameraStatesEqual(original, recaptured, 1e-7))
  assert.equal(cancellations, 1)
  assert.equal(renders, 1)
})

test('pose equality uses shortest periodic differences at dateline, heading and signed roll boundaries', () => {
  const a = makeCameraState({ lon: 179.999999, lat: 40, heightMeters: 2000000, headingDegrees: 359.999999, pitchDegrees: -32, rollDegrees: 179.999999 })
  const b = makeCameraState({ lon: -179.999999, lat: 40, heightMeters: 2000000, headingDegrees: 0.000001, pitchDegrees: -32, rollDegrees: -179.999999 })
  assert.equal(cameraStatesEqual(a, b, 1e-5), true)
  assert.equal(cameraStatesEqual(a, b, 1e-7), false)
  const upright = makeCameraState({ lon: 0, lat: 40, heightMeters: 2000000, headingDegrees: 0, pitchDegrees: -32, rollDegrees: 0 })
  assert.equal(cameraStatesEqual(upright, { ...upright, rollDegrees: 180 }), false)
  assert.equal(cameraStatesEqual(upright, { ...upright, headingDegrees: 180 }), false)
  assert.equal(cameraStatesEqual(upright, { ...upright, lon: 180 }), false)
  assert.equal(cameraStatesEqual(upright, { ...upright, lat: 40.1 }), false)
  assert.equal(cameraStatesEqual(upright, { ...upright, pitchDegrees: 32 }), false)
  assert.equal(cameraStatesEqual(upright, { ...upright, rollDegrees: NaN }), false)
  assert.equal(cameraStatesEqual(upright, { ...upright, version: 2 }), false)
  assert.equal(cameraStatesEqual({ ...upright, rollDegrees: 1e308 }, { ...upright, rollDegrees: -1e308 }), false)
})
