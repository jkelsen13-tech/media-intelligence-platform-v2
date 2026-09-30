import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'

// Execute the actual adapter mount/get/set/frame code with only its vendor,
// stylesheet and terrain-provider module boundaries replaced. Relative local
// imports still load their real implementation. No GPU or network is needed.
let fixtureSerial = 0
const fixtureKey = '__MIP_CESIUM_BOOT_PRECISION_TEST__'
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')

async function loadBootAdapter() {
  const serial = ++fixtureSerial
  const adapterUrl = new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js', import.meta.url)
  const vendorUrl = moduleUrl(
    'const fixture = globalThis[' + JSON.stringify(fixtureKey) + '];\n'
    + 'export const { Viewer, Math, Credit, UrlTemplateImageryProvider, ImageryLayer, SceneMode, '
    + 'ScreenSpaceEventHandler, ScreenSpaceEventType, ClockStep, JulianDate, '
    + 'Cartesian3, Cartesian2, BoundingSphere, HeadingPitchRange, Color, LabelStyle, '
    + 'HorizontalOrigin, VerticalOrigin } = fixture;\n// fixture ' + serial,
  )
  const styleUrl = moduleUrl('export {};\n// fixture ' + serial)
  const terrainUrl = moduleUrl(
    "export const TERRAIN_CREDIT_TEXT = 'GPU-free test';\n"
    + 'export const createTerrariumTerrainProvider = () => null;\n'
    + 'export const tileXYForLongitudeLatitudeDegrees = () => ({ x: 0, y: 0 });',
  )
  const source = readFileSync(adapterUrl, 'utf8')
    .replace(/from\s+'(\.\/[^']+)'/g, (_, path) =>
      'from ' + JSON.stringify(path === './worldViewCesiumTerrariumTerrainProvider.js'
        ? terrainUrl : new URL(path, adapterUrl).href))
    .replace("import('cesium')", 'import(' + JSON.stringify(vendorUrl) + ')')
    .replace("import('cesium/Build/Cesium/Widgets/widgets.css')", 'import(' + JSON.stringify(styleUrl) + ')')
  return import(moduleUrl(source + '\n// adapter fixture ' + serial))
}

function fixture() {
  const floors = [], frames = [], restored = [], entities = [], picks = []
  let viewer, marked = 0, requests = 0, removed = 0
  const controller = {
    set minimumZoomDistance(value) { floors.push(value) },
    get minimumZoomDistance() { return floors.at(-1) },
  }
  const event = () => ({ addEventListener: () => () => {} })
  const document = {
    createElement: () => ({ style: {}, getContext: () => ({}), remove: () => removed++ }),
  }
  const host = { ownerDocument: document, appendChild() {} }
  const pose = Object.freeze({ longitude: -1, latitude: 0.5, height: 2_000_000 })
  class Viewer {
    constructor() {
      this.camera = {
        positionCartographic: pose, heading: 0.5, pitch: -1, roll: 0,
        position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 },
        cancelFlight() {},
        setView(value) { restored.push(value) },
        flyToBoundingSphere(sphere, options) { frames.push({ sphere, options }) },
      }
      this.scene = {
        screenSpaceCameraController: controller,
        renderError: event(), postRender: event(),
        requestRender() { requests++ },
        globe: { enableLighting: false, dynamicAtmosphereLighting: false,
          dynamicAtmosphereLightingFromSun: false },
        sun: { show: true }, moon: { show: true },
      }
      this.clock = { currentTime: -1, shouldAnimate: false, canAnimate: false }
      this.canvas = {}
      this.entities = { add: value => {
        const entity = { ...value, label: { ...value.label, show: { getValue: () => value.label.show } } }
        entities.push(entity)
        return entity
      }, remove() {} }
      this.cesiumWidget = {}
      viewer = this
    }
    isDestroyed() { return false }
    destroy() {}
  }
  class Options { constructor(value) { this.value = value } }
  const Cesium = {
    Viewer, Credit: Options, UrlTemplateImageryProvider: Options, ImageryLayer: Options,
    Math: { toRadians: degrees => degrees * Math.PI / 180, toDegrees: radians => radians * 180 / Math.PI },
    SceneMode: { SCENE3D: 3 }, ClockStep: { TICK_DEPENDENT: 0 },
    JulianDate: { fromDate: date => date.getTime(), equals: (a, b) => a === b },
    Cartesian3: { fromDegrees: (lon, lat, height) => ({ lon, lat, height }) },
    Cartesian2: class { constructor(x, y) { this.x = x; this.y = y } },
    BoundingSphere: class { constructor(center, radius) { this.center = center; this.radius = radius } },
    HeadingPitchRange: class { constructor(heading, pitch, range) { this.heading = heading; this.pitch = pitch; this.range = range } },
    Color: class {},
    LabelStyle: { FILL_AND_OUTLINE: 0 }, HorizontalOrigin: { LEFT: 0 }, VerticalOrigin: { CENTER: 0 },
    ScreenSpaceEventType: { LEFT_CLICK: 0 },
    ScreenSpaceEventHandler: class {
      setInputAction(handler) { picks.push(handler) }
      destroy() {}
    },
  }
  return { Cesium, document, host, floors, frames, restored, entities, picks, pose,
    viewer: () => viewer, mark: () => marked++, marked: () => marked,
    counts: () => ({ requests, removed }) }
}

async function withFixture(run) {
  const f = fixture()
  const keys = ['document', fixtureKey, 'CESIUM_BASE_URL']
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  globalThis.document = f.document
  globalThis[fixtureKey] = f.Cesium
  let adapter
  try {
    const mod = await loadBootAdapter()
    await run(f, args => {
      adapter = mod.createCesiumEllipsoidRendererAdapter({
        stackId: 'ellipsoid-globe', getHostEl: () => f.host,
        onStackIdChange: () => { throw new Error('unexpected fallback') },
        ...args,
      })
      adapter.setReliefShadingEnabled(false)
      return adapter
    })
  } finally {
    adapter?.destroy()
    keys.forEach((key, index) => {
      if (prior[index]) Object.defineProperty(globalThis, key, prior[index])
      else delete globalThis[key]
    })
  }
}

test('boot controller resolves precision arriving during imports without framing or evidence/time mutation', async () => {
  await withFixture(async (f, create) => {
    let precision = 'facility'
    const coordinate = Object.freeze([-81.7, 41.4])
    const time = '2026-09-03T12:34:56.123Z'
    const row = Object.freeze({ mip_object_id: 'recorded-row', precision_class: 'country',
      display_geometry: Object.freeze({ type: 'Point', coordinates: coordinate }) })
    const features = Object.freeze([Object.freeze({ row, positions: Object.freeze([coordinate]), selected: true })])
    const adapter = create({
      coordinate, precisionClass: 'facility', getPrecisionClass: () => precision,
      initialFeatures: features, recordedTimeInstant: time, shouldFlyTo: () => false,
    })
    const mounting = adapter.mount()
    precision = 'country'
    await mounting
    const liveFloor = heightMetersForPrecisionClass('country')
    assert.deepEqual(f.floors, [liveFloor])
    assert.notEqual(liveFloor, heightMetersForPrecisionClass('facility'))
    assert.equal(f.frames.length, 0)
    assert.equal(f.restored.length, 0)
    assert.equal(f.viewer().camera.positionCartographic, f.pose, 'setting the floor does not move the camera')
    const governance = adapter.getVisualFidelityRenderState().cameraGovernance
    assert.deepEqual(governance, { precisionClass: 'country', minimumZoomDistanceMeters: liveFloor, rawHeightMeters: f.pose.height })
    assert.equal(f.viewer().clock.currentTime, Date.parse(time))
    assert.equal(f.viewer().clock.shouldAnimate, false)
    assert.equal(f.viewer().clock.canAnimate, false)
    assert.equal(f.entities[0].__mipRow, row)
    assert.deepEqual(f.entities[0].position, { lon: coordinate[0], lat: coordinate[1], height: 0 })
    assert.equal(features[0].row.display_geometry.coordinates, coordinate)
    assert.equal(row.precision_class, 'country')
    const before = f.counts().requests
    await Promise.resolve()
    assert.equal(f.counts().requests, before, 'boot floor adds no idle render loop')

    // Existing restore semantics still clamp external state using the live
    // getter, without changing the recorded clock or the evidence row.
    assert.equal(adapter.setCameraState({ version: 1, lon: 10, lat: 20, heightMeters: 50,
      headingDegrees: 0, pitchDegrees: -90, rollDegrees: 0 }), true)
    assert.equal(f.viewer().scene.screenSpaceCameraController.minimumZoomDistance, liveFloor)
    assert.equal(f.restored.at(-1).destination.height, liveFloor)
    assert.equal(f.viewer().clock.currentTime, Date.parse(time))
    assert.equal(f.entities[0].__mipRow, row)

    // Probe the actual values, including a deliberately below-floor raw
    // height. A detached snapshot must never silently clamp either scalar.
    f.viewer().scene.screenSpaceCameraController.minimumZoomDistance = 123
    f.viewer().camera.positionCartographic = { ...f.pose, height: 50 }
    assert.deepEqual(adapter.getVisualFidelityRenderState().cameraGovernance,
      { precisionClass: 'country', minimumZoomDistanceMeters: 123, rawHeightMeters: 50 })
    assert.deepEqual(governance,
      { precisionClass: 'country', minimumZoomDistanceMeters: liveFloor, rawHeightMeters: f.pose.height })
    f.viewer().scene.screenSpaceCameraController.minimumZoomDistance = NaN
    f.viewer().camera.positionCartographic = { ...f.pose, height: Infinity }
    assert.deepEqual(adapter.getVisualFidelityRenderState().cameraGovernance,
      { precisionClass: 'country', minimumZoomDistanceMeters: null, rawHeightMeters: null })
  })
})

test('initial optional subject framing uses live precision and preserves explicit later flight options', async () => {
  await withFixture(async (f, create) => {
    const coordinate = Object.freeze([-81.7, 41.4])
    const time = '2026-09-03T12:34:56.123Z'
    const adapter = create({
      coordinate, precisionClass: 'facility', getPrecisionClass: () => 'city',
      initialFeatures: [], recordedTimeInstant: time, shouldFlyTo: () => true, markFlew: f.mark,
    })
    await adapter.mount()
    const floor = heightMetersForPrecisionClass('city')
    assert.deepEqual(f.floors, [floor, floor], 'subject framing must not overwrite the boot floor with a captured class')
    assert.equal(f.frames.length, 1)
    const first = f.frames[0]
    assert.deepEqual(first.sphere.center, { lon: coordinate[0], lat: coordinate[1], height: 0 })
    assert.equal(first.options.offset.range, floor)
    assert.equal(first.options.offset.heading, 0)
    assert.equal(first.options.offset.pitch, -Math.PI / 2)
    assert.equal(first.options.duration, 0)
    assert.equal(f.marked(), 1)
    assert.equal(f.viewer().clock.currentTime, Date.parse(time))

    const nextCoordinate = Object.freeze([10, 20])
    assert.equal(adapter.flyToSubjectCamera({ nextCoordinate, nextPrecisionClass: 'region' }), true)
    const next = f.frames.at(-1)
    assert.deepEqual(next.sphere.center, { lon: 10, lat: 20, height: 0 })
    assert.equal(next.options.offset.range, heightMetersForPrecisionClass('region'))
    assert.equal(next.options.duration, 1.6)
    assert.equal(f.viewer().clock.currentTime, Date.parse(time))
    assert.deepEqual(coordinate, [-81.7, 41.4])
    assert.deepEqual(nextCoordinate, [10, 20])
  })
})

test('boot precision falls back to captured class when the live getter is unavailable', async () => {
  await withFixture(async (f, create) => {
    const adapter = create({
      coordinate: [-81.7, 41.4], precisionClass: 'city', getPrecisionClass: () => undefined,
      initialFeatures: [], shouldFlyTo: () => false,
    })
    await adapter.mount()
    assert.deepEqual(f.floors, [heightMetersForPrecisionClass('city')])
    assert.equal(f.frames.length, 0)
  })
})
