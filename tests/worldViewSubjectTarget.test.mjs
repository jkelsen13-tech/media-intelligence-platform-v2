import test from 'node:test'
import assert from 'node:assert/strict'
import { Cartesian3, BoundingSphere, HeadingPitchRange, Math as GlobeMath } from 'cesium'
import { frameGlobeOnSubject } from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
import { subjectEllipsoidCamera } from '../src/lib/worldViewMapStack.js'

test('subject framing targets the recorded surface point and keeps the precision height floor at an oblique angle', () => {
  const engine = { Cartesian3, BoundingSphere, HeadingPitchRange, Math: GlobeMath }
  for (const precision of ['country', 'region', 'city', 'area', 'facility']) {
    const cam = subjectEllipsoidCamera([-81.7, 41.4], precision), calls = []
    const viewer = { scene: { screenSpaceCameraController: {} }, camera: { flyToBoundingSphere: (sphere, options) => calls.push({ sphere, options }) } }
    assert.equal(frameGlobeOnSubject(engine, viewer, cam), true)
    assert.equal(frameGlobeOnSubject(engine, viewer, cam, 1.6), true)
    for (const { sphere, options } of calls) {
      assert.equal(Cartesian3.distance(sphere.center, Cartesian3.fromDegrees(-81.7, 41.4, 0)), 0)
      assert.equal(sphere.radius, 0)
      assert.ok(Math.abs(options.offset.range * Math.abs(Math.sin(options.offset.pitch)) - cam.heightMeters) < 1e-6)
      assert.equal(viewer.scene.screenSpaceCameraController.minimumZoomDistance, cam.minZoomDistanceMeters)
    }
    assert.deepEqual(calls.map(c => c.options.duration), [0, 1.6])
  }
})
