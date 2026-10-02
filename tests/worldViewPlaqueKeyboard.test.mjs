// Actual WorldView/reader bindings with only the canvas renderer doubled.
// Synthetic projection data exercise accessibility, never provider appearance.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { displayMarkerKey } from '../src/lib/worldViewDisplayClusters.js'
import { layoutWorldBillboards } from '../src/lib/worldViewBillboardLayout.js'
import { spatialFixture, spatialTables } from './spatialBackendFixture.mjs'

await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
const output = new URL('./.compiled/world-view-plaque-keyboard.mjs', import.meta.url)
await build({ entryPoints: [fileURLToPath(new URL('../src/views/WorldView.jsx', import.meta.url))], outfile: fileURLToPath(output),
  bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'canvas-only-double', setup(b) {
    b.onResolve({ filter: /^react$/, namespace: 'scene' }, () => ({ path: 'react', external: true }))
    b.onResolve({ filter: /(?:WorldMapCanvas|\/GraphView)$/ }, args => ({ path: args.path, namespace: 'scene' }))
    b.onLoad({ filter: /.*/, namespace: 'scene' }, args => ({ loader: 'js', contents: args.path.includes('WorldMapCanvas')
      ? `import React from 'react';export default function Canvas(p){globalThis.__keyboardCanvasProps=p;p.cameraControlsRef.current=globalThis.__keyboardCamera;return React.createElement('div',{'data-scene-double':true},p.contextOverlay(globalThis.__keyboardAnchor))}`
      : `import React from 'react';export default p=>React.createElement('div',null,p.emptyMessage)` }))
  } }] })
const WorldView = (await import(output.href)).default
const button = (tree, name) => tree.root.findAllByType('button').find(node => node.props['aria-label'] === name || node.children.some(child => child === name))
const opener = tree => tree.root.findAllByProps({ className: 'wv-billboard-keyboard-opener' })[0]
const cards = tree => tree.root.findAllByProps({ className: 'wv-billboard-card' })
const click = (tree, name) => act(() => button(tree, name).props.onClick())

function browserDouble() {
  const globals = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', '__keyboardCanvasProps', '__keyboardAnchor', '__keyboardCamera']
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const listeners = new Map(), keyboardNodes = new Map(), cameraCalls = [], frames = new Map(); let next = 0
  const document = { hidden: false, activeElement: null, body: { style: {} }, documentElement: { style: {} },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback) },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); if (!listeners.get(type)?.size) listeners.delete(type) } }
  globalThis.document = document
  globalThis.window = { location: { search: '?worldViewPrototype=1' }, matchMedia: () => ({ matches: true }), scrollTo() {}, scrollX: 0, scrollY: 0 }
  globalThis.requestAnimationFrame = callback => { frames.set(++next, callback); return next }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  globalThis.__keyboardCamera = { getCameraState: () => null, setCameraState: value => { cameraCalls.push(value); return false }, cancelCameraFlight: () => cameraCalls.push('cancel') }
  return { document, listeners, frames, cameraCalls,
    createNodeMock(element) {
      const key = element.props['data-native-billboard-key']
      if (key && keyboardNodes.has(key)) return keyboardNodes.get(key)
      const props = element.props, node = { isConnected: true, parentElement: null, style: {},
        focus(options) { document.activeElement = node; node.focusOptions = options }, scrollIntoView() {},
        getBoundingClientRect: () => ({ left: props.style?.left ?? 0, top: props.style?.top ?? 0, width: props.style?.width ?? 1280,
          height: props.style?.maxHeight ?? 900, right: 1280, bottom: 900 }),
        setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => null,
        querySelectorAll: () => [], getClientRects: () => [{}], contains: () => true }
      if (key) keyboardNodes.set(key, node)
      return node
    },
    restore() { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } },
  }
}

async function mount() {
  const fake = browserDouble(), tables = spatialTables(), row = tables.spatial_projection_v1[0], selections = [], timeChanges = []
  const native = layoutWorldBillboards({ items: [{ key: displayMarkerKey(row), precision: row.precision_class, nearDetailKind: 'scope',
    canonicalCoordinates: row.display_geometry.coordinates, anchor: { x: 210, y: 200 }, distanceMeters: 60000,
    canonicalOccluded: false, displayOccluded: false }], selectedKey: displayMarkerKey(row), viewport: { width: 1280, height: 900 } }).selected
  const anchor = { visible: true, x: 210, y: 200, width: 1280, height: 900, billboardMarkerVisible: true, billboardSelected: native }
  globalThis.__keyboardAnchor = anchor
  const props = { selected: { id: 'synthetic-event', label: 'Recorded event' }, backend: spatialFixture({ tables }).backend,
    investigationContext: { canonical_subject_id: 'synthetic-event', canonical_subject_type: 'event', as_of_time: '2024-04-08T18:00:00Z' },
    onSelectProjection: (...args) => selections.push(args), onSelectGraphNode() {}, onInvestigationAsOfTime: value => timeChanges.push(value) }
  let tree
  await act(async () => { tree = TestRenderer.create(React.createElement(WorldView, props), { createNodeMock: fake.createNodeMock }) })
  return { fake, row, native, anchor, tree, props, selections, timeChanges,
    async update(nextAnchor = anchor, nextProps = props) {
      globalThis.__keyboardAnchor = nextAnchor
      await act(async () => tree.update(React.createElement(WorldView, nextProps)))
    },
    cleanup() { act(() => tree.unmount()); fake.restore() },
  }
}

test('current visible native plaque has one named native keyboard button; Close preserves and refocuses it', async () => {
  const f = await mount(), before = JSON.stringify(f.row)
  try {
    const target = opener(f.tree)
    assert.equal(target.props.type, 'button'); assert.equal(target.props.tabIndex, 0)
    assert.match(target.props['aria-label'], /Open selected record card:.*city scope, not exact position/)
    assert.deepEqual(target.props.style, { left: 210, top: 200 })
    assert.equal(target.props['data-native-billboard-key'], displayMarkerKey(f.row))
    assert.equal(button(f.tree, 'Open selected spatial context'), undefined)
    assert.equal(target.children.length, 0, 'no second visible glyph or i text')
    const node = target.instance; node.focus({ preventScroll: true })
    act(() => target.props.onClick())
    assert.equal(cards(f.tree).length, 1); assert.equal(opener(f.tree).props.tabIndex, -1)
    assert.equal(opener(f.tree).props['aria-expanded'], true, 'opener stays mounted while card owns keyboard focus')
    click(f.tree, 'Close selected card')
    assert.equal(cards(f.tree).length, 0); assert.equal(opener(f.tree).props.tabIndex, 0)
    assert.equal(f.fake.document.activeElement, node); assert.deepEqual(node.focusOptions, { preventScroll: true })
    act(() => opener(f.tree).props.onClick()); assert.equal(cards(f.tree).length, 1)
    assert.deepEqual(f.selections, []); assert.deepEqual(f.timeChanges, []); assert.deepEqual(f.fake.cameraCalls, [])
    assert.equal(JSON.stringify(f.row), before)
  } finally { f.cleanup() }
})

test('paused/unpaused world gestures and Explore leave the keyboard opener usable without selecting or moving camera', async () => {
  const f = await mount()
  try {
    click(f.tree, 'Explore World View')
    assert.equal(globalThis.__keyboardCanvasProps.explorationActive, false)
    for (const interacting of [false, true, false]) {
      if (interacting !== globalThis.__keyboardCanvasProps.explorationActive) click(f.tree, interacting ? 'Interact' : 'Done — scroll')
      assert.equal(globalThis.__keyboardCanvasProps.explorationActive, interacting)
      assert.equal(opener(f.tree).props.tabIndex, 0)
      let stopped = 0
      for (const key of ['Enter', ' ']) act(() => opener(f.tree).props.onKeyDown({ key, stopPropagation() { stopped++ } }))
      assert.equal(stopped, 2, 'native button default activation remains intact; world handlers do not receive activation keys')
      act(() => opener(f.tree).props.onClick()); assert.equal(cards(f.tree).length, 1)
      click(f.tree, 'Close selected card'); assert.equal(cards(f.tree).length, 0)
    }
    assert.deepEqual(f.selections, []); assert.deepEqual(f.timeChanges, []); assert.deepEqual(f.fake.cameraCalls, [])
  } finally { f.cleanup() }
})

test('Inspector routes through existing Explore context, and reopen requires no native retap or group chooser', async () => {
  const f = await mount()
  try {
    click(f.tree, 'Explore World View')
    act(() => opener(f.tree).props.onClick()); click(f.tree, 'Open inspector')
    assert.equal(cards(f.tree).length, 0)
    assert.equal(f.tree.root.findAllByProps({ className: 'wv-explore-context-body' }).length, 1)
    assert.equal(globalThis.__keyboardCanvasProps.explorationActive, false)
    act(() => opener(f.tree).props.onClick()); assert.equal(cards(f.tree).length, 1)
    assert.equal(f.tree.root.findAllByProps({ className: 'wv-billboard-cluster' }).length, 0)
    assert.deepEqual(f.selections, []); assert.deepEqual(f.timeChanges, []); assert.deepEqual(f.fake.cameraCalls, [])
  } finally { f.cleanup() }
})

test('hidden, display-occluded, clustered/show-budget-excluded and stale native records expose no keyboard or fallback i bypass', async () => {
  const f = await mount()
  try {
    const staleClick = opener(f.tree).props.onClick
    for (const anchor of [
      { ...f.anchor, visible: false }, { ...f.anchor, billboardMarkerVisible: false },
      { ...f.anchor, x: -1 }, { ...f.anchor, x: NaN },
      { ...f.anchor, billboardSelected: { ...f.native, displayOccluded: true } },
      { ...f.anchor, billboardSelected: { ...f.native, key: 'cluster:["hidden-original"]' } },
      { ...f.anchor, billboardSelected: { ...f.native, precision: 'facility' } },
      { ...f.anchor, billboardSelected: { ...f.native, canonicalCoordinates: [-81.70001, 41.4] } },
    ]) {
      await f.update(anchor)
      assert.equal(opener(f.tree), undefined); assert.equal(button(f.tree, 'Open selected spatial context'), undefined)
      act(() => staleClick()); assert.equal(cards(f.tree).length, 0, 'captured old action cannot reopen an ineligible native original')
    }
    await f.update(); assert.ok(opener(f.tree))
    act(() => opener(f.tree).props.onClick()); assert.equal(cards(f.tree).length, 1)
  } finally { f.cleanup() }
})

test('visible terrain-surface scope marker can reopen an honestly disclosed occluded canonical anchor', async () => {
  const f = await mount()
  try {
    await f.update({ ...f.anchor, billboardSelected: { ...f.native, occluded: true } })
    assert.match(opener(f.tree).props['aria-label'], /canonical anchor occluded/)
    act(() => opener(f.tree).props.onClick())
    assert.equal(cards(f.tree).length, 1)
    assert.match(JSON.stringify(f.tree.toJSON()), /Canonical anchor occluded/)
    assert.equal(f.tree.root.findByType('line').props.x1, 210)
    assert.deepEqual(f.fake.cameraCalls, []); assert.deepEqual(f.selections, [])
  } finally { f.cleanup() }
})

test('time, selection, layer, Graph and remount invalidate stale opener actions while retaining current scope', async () => {
  const f = await mount()
  try {
    const staleClick = opener(f.tree).props.onClick
    const changedTime = { ...f.props, investigationContext: { ...f.props.investigationContext, as_of_time: '2024-04-08T19:00:00Z' } }
    await f.update(f.anchor, changedTime)
    act(() => staleClick()); assert.equal(cards(f.tree).length, 0)
    act(() => opener(f.tree).props.onClick()); assert.equal(cards(f.tree).length, 1)
    assert.match(JSON.stringify(f.tree.toJSON()), /2024-04-08T19:00:00Z/)
    click(f.tree, 'Close selected card')
    await f.update(f.anchor, { ...f.props, investigationContext: { ...f.props.investigationContext, as_of_time: '2024-04-09T00:00:00Z' } })
    assert.equal(opener(f.tree), undefined); act(() => staleClick()); assert.equal(cards(f.tree).length, 0)
    await f.update(f.anchor, { ...f.props, selected: { id: 'other-subject' }, investigationContext: { ...f.props.investigationContext, canonical_subject_id: 'other-subject' } })
    assert.equal(opener(f.tree), undefined)
    await f.update()
    const events = f.tree.root.findAllByType('input').find(input => input.props.type === 'checkbox' && input.parent.children.some(child => typeof child === 'string' && child === 'Events'))
    act(() => events.props.onChange({ target: { checked: false } })); assert.equal(opener(f.tree), undefined)
    act(() => events.props.onChange({ target: { checked: true } })); assert.ok(opener(f.tree))
    click(f.tree, 'Graph'); assert.equal(opener(f.tree), undefined)
    act(() => staleClick()); click(f.tree, 'Map'); assert.equal(cards(f.tree).length, 0)
    assert.ok(opener(f.tree)); assert.deepEqual(f.selections, []); assert.deepEqual(f.timeChanges, [])
  } finally { f.cleanup() }
  const remounted = await mount()
  try { assert.equal(cards(remounted.tree).length, 0); assert.equal(opener(remounted.tree).props['aria-expanded'], false) }
  finally { remounted.cleanup() }
})

test('Atlas retains its existing visible context affordance and creates no native keyboard target', async () => {
  const f = await mount()
  try {
    await f.update({ ...f.anchor, billboardSelected: null, billboardMarkerVisible: false })
    assert.equal(opener(f.tree), undefined); assert.ok(button(f.tree, 'Open selected spatial context'))
    click(f.tree, 'Open selected spatial context')
    assert.equal(cards(f.tree).length, 0); assert.ok(f.tree.root.findAllByProps({ className: 'wv-spatial-context' }).length)
    assert.deepEqual(f.timeChanges, [])
  } finally { f.cleanup() }
})
