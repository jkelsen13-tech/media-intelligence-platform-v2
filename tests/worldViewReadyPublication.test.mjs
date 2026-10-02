// GPU-free startup publication tests. Native browser remount qualification is separate.
import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createServer } from 'vite'
import { createDisplayPresentation } from '../src/lib/worldViewDisplayPresentation.js'
import { displayMarkerKey } from '../src/lib/worldViewDisplayClusters.js'
import { createWorldViewRendererAdapter, createMapContainerResizeScheduler } from '../src/lib/worldViewRendererAdapter.js'
import {
  defaultVisualFidelityProfile, reduceVisualFidelityProfile, resolveVisualFidelityProfile,
  visualFidelityCapabilities,
} from '../src/lib/worldViewVisualFidelity.js'

function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
const available = visualFidelityCapabilities({ fxaa: true })
function fxaaProfile() {
  const category = reduceVisualFidelityProfile(defaultVisualFidelityProfile(),
    { type: 'category', category: 'imageQuality', enabled: true }, available)
  return reduceVisualFidelityProfile(category,
    { type: 'leaf', category: 'imageQuality', leaf: 'fxaa', enabled: true }, available)
}

test('startup finishes asynchronous layer replay before enabling the latest retained FXAA preference', async () => {
  const layers = deferred(), entered = deferred(), calls = []
  const initial = [{ row: { revision_id: 'initial' } }]
  const latest = [{ row: { revision_id: 'latest' } }], selection = new Set(['latest'])
  let enabled = false, featurePasses = 0
  const adapter = createWorldViewRendererAdapter({ stackId: 'openfreemap-positron', initialFeatures: initial }, {
    createMapAdapter: () => ({
      mount: async () => {},
      setFeatures: async rows => {
        calls.push(['features', rows]); featurePasses++
        if (featurePasses === 1) { entered.resolve(); await layers.promise }
      },
      setVisualFidelityProfile: profile => {
        enabled = resolveVisualFidelityProfile(profile, available).fxaa
        calls.push(['profile', enabled]); return true
      },
      getVisualFidelityCapabilities: () => available,
    }),
  })
  adapter.setVisualFidelityProfile(fxaaProfile())
  const loading = adapter.mount()
  await entered.promise
  assert.equal(enabled, false, 'an enabled engine must not precede pending asynchronous startup publication')
  assert.equal(adapter.getVisualFidelityCapabilities().fxaa.status, 'unavailable')
  adapter.setFeatures(latest, selection)
  adapter.setVisualFidelityProfile(fxaaProfile())
  assert.equal(enabled, false, 'preferences arriving during layer startup remain queued')
  layers.resolve(); await loading
  assert.deepEqual(calls.map(call => call[0]), ['features', 'features', 'profile'])
  assert.equal(calls[1][1], latest)
  assert.equal(enabled, true)
  assert.equal(adapter.getVisualFidelityCapabilities().fxaa.status, 'supported')
  adapter.destroy()
})

test('leaving during asynchronous layer replay cannot enable cached effects or publish ready capabilities', async () => {
  for (const mode of ['destroyed', 'cancelled']) {
    const layers = deferred(), entered = deferred()
    let cancelled = false, profiles = 0
    const adapter = createWorldViewRendererAdapter({
      stackId: 'openfreemap-positron', isCancelled: () => cancelled,
    }, {
      createMapAdapter: () => ({
        mount: async () => {},
        setFeatures: async () => { entered.resolve(); await layers.promise },
        setVisualFidelityProfile: () => { profiles++; return true },
        getVisualFidelityCapabilities: () => available,
      }),
    })
    adapter.setVisualFidelityProfile(fxaaProfile())
    const loading = adapter.mount()
    await entered.promise
    if (mode === 'destroyed') adapter.destroy()
    else cancelled = true
    layers.resolve(); await loading
    assert.equal(profiles, 0)
    assert.equal(adapter.getVisualFidelityCapabilities().fxaa.status, 'unavailable')
    adapter.destroy()
  }
})

const FIXTURE_KEY = '__MIP_TEST_READY_PUBLICATION_FIXTURE__'
async function loadCanvas(t, fixture) {
  const previous = globalThis[FIXTURE_KEY]
  globalThis[FIXTURE_KEY] = fixture
  t.after(() => {
    if (previous === undefined) delete globalThis[FIXTURE_KEY]
    else globalThis[FIXTURE_KEY] = previous
  })
  const server = await createServer({
    configFile: false, esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom',
    plugins: [{
      name: 'test-external-renderer-startup', enforce: 'pre',
      transform(_code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/lib/worldViewRendererAdapter.js')) return null
        return `const fixture = globalThis['${FIXTURE_KEY}'];
export const createWorldViewRendererAdapter = args => fixture.createAdapter(args);
export const projectionMarkerRecords = rows => fixture.features?.(rows) ?? [];`
      },
    }],
  })
  t.after(() => server.close())
  return {
    Canvas: (await server.ssrLoadModule('/src/views/WorldMapCanvas.jsx')).default,
    Panel: (await server.ssrLoadModule('/src/components/WorldViewVisualFidelityPanel.jsx')).default,
  }
}

test('canvas commits current FXAA capability controls before ready camera framing after an asynchronous remount', async t => {
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => {
    if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  })
  const started = deferred(), events = [], unavailable = visualFidelityCapabilities()
  let engineEnabled = false, rendererReady = false, destroys = 0
  const fixture = {
    createAdapter: args => ({
      mount: () => started.promise.then(() => {
        rendererReady = true; engineEnabled = true
        args.onDisplayLayout?.({
          width: 800, height: 500, markers: [], labels: new Set(), relationshipLabels: new Set(),
          layout: { singles: [], clusters: [], items: [], stats: {} },
          relationshipSummary: { lines: [], dispositions: [], total: 0, displayed: 0, hidden: 0, counts: {} },
        })
      }),
      setFeatures: async () => {}, setOnSelectRow() {}, setRelationships() {}, setRecordedTimeInstant() {},
      setVisualFidelityProfile: profile => { if (rendererReady) engineEnabled = resolveVisualFidelityProfile(profile, available).fxaa },
      getVisualFidelityCapabilities: () => rendererReady ? available : unavailable,
      getVisualFidelityRenderState: () => ({ fxaa: { enabled: engineEnabled } }),
      destroy() { destroys++ },
    }),
  }
  const { Canvas, Panel } = await loadCanvas(t, fixture)
  const profile = fxaaProfile(), rows = [], selectedKeys = new Set()
  const memory = {
    getStackId: () => 'ellipsoid-globe', remember() {},
    restore() { events.push('camera-framing'); return true },
  }
  function Parent() {
    const [capabilities, setCapabilities] = React.useState(() => unavailable)
    const publish = React.useCallback(next => {
      events.push(next.fxaa.status === 'supported' ? 'supported-controls' : 'unavailable-controls')
      setCapabilities(next)
    }, [])
    return React.createElement(React.Fragment, null,
      React.createElement(Panel, { profile, capabilities, onAction() {} }),
      React.createElement(Canvas, {
        rows, selectedKeys, onSelectRow() {}, emptyMessage: '', cameraMemory: memory,
        visualFidelity: profile, onVisualFidelityCapabilities: publish,
      }))
  }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Parent), { unstable_isConcurrent: true }) })
  t.after(() => root.unmount())
  assert.equal(root.root.findByProps({ 'data-fidelity-effect': 'fxaa' }).findByType('input').props.checked, false)
  await act(async () => { started.resolve(); await started.promise })
  assert.equal(engineEnabled, true)
  const input = root.root.findByProps({ 'data-fidelity-effect': 'fxaa' }).findByType('input')
  assert.equal(input.props.checked, true); assert.equal(input.props.disabled, false)
  assert.ok(events.indexOf('supported-controls') < events.indexOf('camera-framing'),
    'ready capabilities are published before readiness consumers, rather than by a later passive effect')
  await act(async () => root.unmount())
  assert.equal(destroys, 1)
})

test('atlas resize reprojects unchanged-scale viewport translation and extent, and disposed observer callbacks are inert', async t => {
  const position = Object.freeze([-81.7, 41.4])
  const row = Object.freeze({
    projection_contract_version: 'spatial_projection_v1', mip_object_id: 'atlas-row', revision_id: 'atlas-version',
    precision_class: 'city', display_geometry: Object.freeze({ type: 'Point', coordinates: position }),
  })
  const feature = Object.freeze({ row, positions: Object.freeze([position]), selected: false, label: 'Recorded place' })
  const otherRow = Object.freeze({ ...row, mip_object_id: 'atlas-other', revision_id: 'atlas-other-version' })
  const otherFeature = Object.freeze({ ...feature, row: otherRow })
  const { Canvas } = await loadCanvas(t, { features: () => [feature, otherFeature] })
  let observerCallback, disconnects = 0
  const matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const rect = { left: 0, top: 0, width: 960, height: 480 }
  const view = {
    ResizeObserver: class {
      constructor(callback) { observerCallback = callback }
      observe() {}
      disconnect() { disconnects++ }
    },
  }
  const svg = {
    getScreenCTM: () => matrix, getBoundingClientRect: () => rect,
    ownerDocument: { defaultView: view },
  }
  const received = [], rows = [row, otherRow], selectedKeys = new Set()
  const memory = { getStackId: () => 'atlas-fallback', remember() {} }
  let root
  await act(async () => {
    root = TestRenderer.create(React.createElement(Canvas, {
      rows, selectedKeys, onSelectRow() {}, emptyMessage: '', cameraMemory: memory,
      visualFidelity: defaultVisualFidelityProfile(),
      onRelationshipDisplay: summary => received.push(summary),
    }), { createNodeMock: node => node.type === 'svg' ? svg : null })
  })
  t.after(() => root.unmount())
  const overlay = () => root.root.findByProps({ className: 'wv-display-overlay' })
  assert.equal(overlay().props.style.height, '480px')
  const before = root.root.findAllByProps({ className: 'wv-display-group-hit' }).map(node => node.props.style.top)
  assert.equal(before.length, 1, 'fixture must exercise the actual CSS-pixel cluster badge')
  rect.height = 720; matrix.f = 40
  await act(async () => observerCallback())
  assert.equal(overlay().props.style.height, '720px', 'height-only resize must refresh CSS-pixel display extent')
  const after = root.root.findAllByProps({ className: 'wv-display-group-hit' }).map(node => node.props.style.top)
  assert.notDeepEqual(after, before, 'unchanged-scale viewport translation must move display targets')
  assert.equal(feature.positions[0], position); assert.equal(feature.row, row)
  await act(async () => root.unmount())
  const count = received.length
  observerCallback()
  assert.equal(received.length, count); assert.equal(disconnects, 1)
})


test('renderer observer delivery publishes only the latest presentation after delivery and cancels stale UI frames', async t => {
  let root
  const previousWindow = globalThis.window
  let frameNumber = 0, insideObserver = false, adapterArgs
  const frames = new Map(), cancelled = [], received = []
  const view = {
    requestAnimationFrame(callback) { const id = ++frameNumber; frames.set(id, callback); return id },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id) },
  }
  globalThis.window = view
  t.after(() => {
    root?.unmount()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })
  const { Canvas } = await loadCanvas(t, {
    createAdapter: args => {
      adapterArgs = args
      return {
        mount: async () => {}, setFeatures: async () => {}, setOnSelectRow() {}, setRelationships() {},
        setRecordedTimeInstant() {}, setVisualFidelityProfile() {}, destroy() {},
        getVisualFidelityCapabilities: () => visualFidelityCapabilities(),
      }
    },
  })
  const row = Object.freeze({
    projection_contract_version: 'spatial_projection_v1', mip_object_id: 'observer-row', revision_id: 'observer-version',
    precision_class: 'city', display_geometry: Object.freeze({ type: 'Point', coordinates: Object.freeze([-81, 41]) }),
  })
  const marker = Object.freeze({
    id: displayMarkerKey(row, 0), row, positionIndex: 0, x: 120, y: 140, visible: true, label: 'Recorded place',
  })
  const first = createDisplayPresentation([marker], { width: 800, height: 500 })
  const latest = createDisplayPresentation([marker], { width: 1000, height: 600 })
  const memory = { getStackId: () => 'openfreemap-positron', remember() {}, restore: () => true }
  await act(async () => {
    root = TestRenderer.create(React.createElement(Canvas, {
      rows: [row], selectedKeys: new Set(), onSelectRow() {}, emptyMessage: '', cameraMemory: memory,
      visualFidelity: defaultVisualFidelityProfile(),
      onRelationshipDisplay: summary => {
        assert.equal(insideObserver, false, 'parent state publication must leave native observer delivery')
        received.push(summary)
      },
    }), { createNodeMock: node => node.props.className === 'wv-map-host' ? { ownerDocument: { defaultView: view } } : null })
  })
  received.length = 0
  await act(async () => {
    insideObserver = true
    try { adapterArgs.onDisplayLayout(first); adapterArgs.onDisplayLayout(latest) }
    finally { insideObserver = false }
  })
  assert.equal(received.length, 0)
  assert.equal(frames.size, 1, 'observer bursts must schedule one UI frame')
  assert.equal(view.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getState().markers[0].id, marker.id,
    'the current canonical presentation must be available before deferred UI publication')
  assert.equal(root.root.findAllByProps({ className: 'wv-display-overlay' }).length, 0)
  const frame = [...frames.values()][0]; frames.clear()
  await act(async () => frame())
  assert.equal(received.length, 1); assert.equal(received[0], latest.relationshipSummary)
  assert.equal(root.root.findByProps({ className: 'wv-display-overlay' }).props.style.width, '1000px')
  assert.equal(latest.layout.singles[0], marker); assert.equal(marker.row, row)
  await act(async () => adapterArgs.onDisplayLayout(first))
  const staleFrame = [...frames.values()][0]
  assert.equal(frames.size, 1)
  await act(async () => root.unmount())
  assert.equal(frames.size, 0); assert.equal(cancelled.length, 1)
  const count = received.length
  await act(async () => { staleFrame(); adapterArgs.onDisplayLayout(latest) })
  assert.equal(received.length, count, 'cancelled frames and disposed renderer callbacks must not publish')
  assert.equal(view.__MIP_WORLD_VIEW_CLUSTER_PROBE__, undefined)
})


function resizeFixture() {
  const frames = new Map(), listeners = new Map(), observerCallbacks = [], cancellations = []
  let frameNumber = 0, disconnects = 0, insideObserver = false
  const view = {
    devicePixelRatio: 1,
    requestAnimationFrame(callback) { const id = ++frameNumber; frames.set(id, callback); return id },
    cancelAnimationFrame(id) { cancellations.push(id); frames.delete(id) },
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type) },
    ResizeObserver: class {
      constructor(callback) { observerCallbacks.push(callback) }
      observe(element) { this.element = element }
      disconnect() { disconnects++ }
    },
  }
  const host = { clientWidth: 800, clientHeight: 500, ownerDocument: { defaultView: view } }
  return {
    view, host, frames, listeners, observerCallbacks, cancellations,
    get disconnects() { return disconnects }, get insideObserver() { return insideObserver },
    deliver() {
      insideObserver = true
      try { for (const callback of observerCallbacks) callback([{ target: host }]) }
      finally { insideObserver = false }
    },
    flush() { const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback()) },
  }
}

test('map container resize work leaves observer delivery, covers element and window changes, and deduplicates latest dimensions', () => {
  const fixture = resizeFixture(), applied = [], calls = []
  const map = {
    resize() {
      assert.equal(fixture.insideObserver, false)
      applied.push([fixture.host.clientWidth, fixture.host.clientHeight, fixture.view.devicePixelRatio])
      calls.push('resize')
    },
    redraw() { assert.equal(fixture.insideObserver, false); calls.push('redraw') },
  }
  const scheduler = createMapContainerResizeScheduler(map, fixture.host)
  fixture.deliver(); fixture.flush()
  assert.equal(applied.length, 0, 'initial observer notification must not repeat constructor sizing')
  fixture.host.clientWidth = 390
  fixture.deliver(); fixture.listeners.get('resize')()
  fixture.host.clientHeight = 720; fixture.deliver()
  assert.equal(applied.length, 0); assert.equal(fixture.frames.size, 1)
  fixture.flush()
  assert.deepEqual(applied, [[390, 720, 1]])
  assert.deepEqual(calls, ['resize', 'redraw'])
  fixture.deliver(); fixture.listeners.get('resize')(); fixture.flush()
  assert.equal(applied.length, 1, 'unchanged observer/window notifications must not repaint')
  fixture.host.clientHeight = 900; fixture.deliver(); fixture.flush()
  assert.deepEqual(applied[1], [390, 900, 1], 'height-only element resize is covered')
  fixture.view.devicePixelRatio = 2; fixture.listeners.get('resize')(); fixture.flush()
  assert.deepEqual(applied[2], [390, 900, 2], 'window display-density changes refresh renderer resolution')
  scheduler.destroy()
  assert.equal(fixture.disconnects, 1); assert.equal(fixture.listeners.size, 0)
})

test('map resize scheduling cancels disposed/cancelled work and supports an honest window fallback', () => {
  for (const mode of ['destroyed', 'cancelled']) {
    const fixture = resizeFixture()
    let cancelled = false, resizes = 0, redraws = 0
    const scheduler = createMapContainerResizeScheduler({
      resize() { resizes++ }, redraw() { redraws++ },
    }, fixture.host, { isCancelled: () => cancelled })
    fixture.host.clientHeight = 720; fixture.deliver()
    const stale = [...fixture.frames.values()][0]
    if (mode === 'destroyed') scheduler.destroy()
    else cancelled = true
    stale(); fixture.deliver()
    assert.equal(resizes, 0); assert.equal(redraws, 0)
    scheduler.destroy(); scheduler.destroy()
    assert.equal(fixture.disconnects, 1); assert.equal(fixture.listeners.size, 0)
  }
  const fixture = resizeFixture()
  delete fixture.view.ResizeObserver
  let resizes = 0, repaints = 0
  const scheduler = createMapContainerResizeScheduler({
    resize() { resizes++ }, triggerRepaint() { repaints++ },
  }, fixture.host)
  fixture.host.clientWidth = 500; fixture.listeners.get('resize')(); fixture.flush()
  assert.equal(resizes, 1); assert.equal(repaints, 1)
  scheduler.destroy(); assert.equal(fixture.listeners.size, 0)
  delete fixture.view.requestAnimationFrame
  assert.equal(createMapContainerResizeScheduler({}, fixture.host), null,
    'missing scheduling capability must retain the vendor resize path')
})

const RESIZE_FIXTURE_KEY = '__MIP_TEST_CONTAINER_RESIZE_FIXTURE__'
async function loadMapResizeAdapter(t, fixture) {
  const previous = globalThis[RESIZE_FIXTURE_KEY]
  globalThis[RESIZE_FIXTURE_KEY] = fixture
  t.after(() => {
    if (previous === undefined) delete globalThis[RESIZE_FIXTURE_KEY]
    else globalThis[RESIZE_FIXTURE_KEY] = previous
  })
  const vendors = new Set(['maplibre-gl', 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url',
    'maplibre-gl/dist/maplibre-gl.css', '@deck.gl/maplibre', '@deck.gl/layers'])
  const prefix = '\0mip-test-container-resize:'
  const server = await createServer({
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    ssr: { noExternal: ['maplibre-gl', '@deck.gl/maplibre', '@deck.gl/layers'] },
    server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom',
    plugins: [{
      name: 'test-container-resize-vendors', enforce: 'pre',
      resolveId(source) { return vendors.has(source) ? prefix + [...vendors].indexOf(source) : null },
      load(id) {
        if (!id.startsWith(prefix)) return null
        const source = [...vendors][Number(id.slice(prefix.length))]
        if (source.endsWith('?worker&url')) return 'export default "/test-map-worker.js"'
        if (source.endsWith('.css')) return 'export {}'
        const preamble = `const fixture = globalThis['${RESIZE_FIXTURE_KEY}'];`
        if (source === 'maplibre-gl') return preamble + `
export const Map = fixture.Map;
export class NavigationControl {}
export class ScaleControl {}
export class AttributionControl {}
export function setWorkerUrl() {}`
        if (source === '@deck.gl/maplibre') return preamble + 'export const MapLibreOverlay = fixture.Overlay;'
        return 'export class ScatterplotLayer { constructor(options) { this.props = options } } export class TextLayer { constructor(options) { this.props = options } }'
      },
    }],
  })
  t.after(() => server.close())
  return (await server.ssrLoadModule('/src/lib/worldViewRendererAdapter.js')).createWorldViewRendererAdapter
}

test('actual map adapter owns deferred host resize while preserving precision, rows, native fallback and teardown', async t => {
  const fixture = resizeFixture(), options = [], maps = [], fallbacks = []
  const context = { getExtension() {}, measureText: () => ({ width: 12 }) }
  fixture.host.ownerDocument.createElement = () => ({ getContext: () => context })
  class FakeMap {
    constructor(opts) {
      options.push(opts); maps.push(this)
      this.canvas = { clientWidth: fixture.host.clientWidth, clientHeight: fixture.host.clientHeight,
        ownerDocument: fixture.host.ownerDocument }
      this.center = { lng: opts.center[0], lat: opts.center[1] }
      this.zoom = opts.zoom; this.minZoom = opts.minZoom; this.maxZoom = opts.maxZoom
      this.bearing = opts.bearing; this.pitch = opts.pitch
      this.listeners = new Map(); this.resizes = 0; this.removes = 0
    }
    getCanvas() { return this.canvas }
    getCenter() { return this.center }
    getZoom() { return this.zoom }
    getBearing() { return this.bearing }
    getPitch() { return this.pitch }
    getMinZoom() { return this.minZoom }
    getMaxZoom() { return this.maxZoom }
    setMinZoom(next) { this.minZoom = next }
    setMaxZoom(next) { this.maxZoom = next; if (this.zoom > next) { this.zoom = next; this.fire('move') } }
    on(event, callback) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(callback) }
    off(event, callback) { this.listeners.get(event)?.delete(callback) }
    fire(event) { for (const callback of this.listeners.get(event) ?? []) callback({ type: event }) }
    addControl() {}
    project() { return { x: 100, y: 100 } }
    triggerRepaint() {}
    resize() {
      assert.equal(fixture.insideObserver, false)
      this.resizes++; this.canvas.clientWidth = fixture.host.clientWidth; this.canvas.clientHeight = fixture.host.clientHeight
      this.fire('resize')
    }
    redraw() {}
    remove() { this.removes++ }
  }
  class Overlay { setProps() {} finalize() {} }
  const createAdapter = await loadMapResizeAdapter(t, { Map: FakeMap, Overlay })
  const position = Object.freeze([-81, 41])
  const row = Object.freeze({ projection_contract_version: 'spatial_projection_v1', mip_object_id: 'resize-row',
    revision_id: 'resize-version', precision_class: 'city', display_geometry: Object.freeze({ type: 'Point', coordinates: position }) })
  const features = [Object.freeze({ row, positions: Object.freeze([position]), selected: false })]
  const make = () => createAdapter({
    stackId: 'openfreemap-positron', getHostEl: () => fixture.host, precisionClass: 'city',
    initialFeatures: features, onStackIdChange: next => fallbacks.push(next),
  })
  const adapter = make()
  t.after(() => adapter.destroy())
  await adapter.mount()
  assert.equal(options.length, 1, 'the fake Map constructor must be reached; unexpected fallback: ' + JSON.stringify(fallbacks))
  assert.equal(options[0].trackResize, false, 'supported owner scheduling must disable the vendor synchronous resize path')
  const map = maps[0]
  map.zoom = map.maxZoom
  const before = JSON.parse(adapter.getCameraState())
  const beforeRawHeight = adapter.getVisualFidelityRenderState().mapCamera.bridgeHeightMeters
  const originalCenter = { ...map.center }, originalBearing = map.bearing, originalPitch = map.pitch
  fixture.host.clientWidth = 390; fixture.host.clientHeight = 720; fixture.deliver()
  assert.equal(map.resizes, 0); fixture.flush()
  assert.equal(map.resizes, 1); assert.equal(map.canvas.clientWidth, 390)
  const after = JSON.parse(adapter.getCameraState())
  const afterRawHeight = adapter.getVisualFidelityRenderState().mapCamera.bridgeHeightMeters
  assert.ok(Math.abs(after.heightMeters - before.heightMeters) < 0.01,
    'normal resize events must maintain the same recorded-precision height floor across width changes')
  assert.ok(Math.abs(afterRawHeight - beforeRawHeight) < 0.01, 'raw zoom/width scale must also retain the precision floor without serialization masking')
  assert.deepEqual(map.center, originalCenter); assert.equal(map.bearing, originalBearing); assert.equal(map.pitch, originalPitch)
  assert.equal(adapter.getDisplayLayout().layout.singles[0].row, row)
  assert.equal(features[0].row, row); assert.equal(row.display_geometry.coordinates, position)
  fixture.host.clientHeight = 900; fixture.deliver()
  const stale = [...fixture.frames.values()][0]
  adapter.destroy(); stale(); fixture.deliver()
  assert.equal(map.resizes, 1); assert.equal(map.removes, 1); assert.equal(fixture.disconnects, 1)
  assert.equal(fixture.frames.size, 0); assert.equal(fixture.listeners.size, 0)
  delete fixture.view.requestAnimationFrame
  const nativeAdapter = make()
  await nativeAdapter.mount()
  assert.equal(options[1].trackResize, true, 'unsupported scheduling must retain native vendor resizing')
  nativeAdapter.destroy()
  assert.equal(maps[1].removes, 1); assert.deepEqual(fallbacks, [])
  fixture.view.requestAnimationFrame = callback => { fixture.frames.set(99, callback); return 99 }
  fixture.view.ResizeObserver = class {
    observe() { throw new Error('container observation unavailable') }
    disconnect() { fixture.failedObserverDisconnected = true }
  }
  const failedAdapter = make()
  await failedAdapter.mount()
  assert.equal(maps[2].removes, 1, 'failed observer setup must release the owned renderer')
  assert.equal(fixture.failedObserverDisconnected, true)
  assert.deepEqual(fallbacks, ['osm'])
  failedAdapter.destroy()
})
