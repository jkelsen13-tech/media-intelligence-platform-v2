// GPU-free startup publication tests. Native browser remount qualification is separate.
import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createServer } from 'vite'
import { createWorldViewRendererAdapter } from '../src/lib/worldViewRendererAdapter.js'
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
