import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { serializeCameraState } from '../src/lib/worldViewCameraState.js'

await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
const output = new URL('./.compiled/world-view-explore-shell.mjs', import.meta.url)
await build({ entryPoints: [fileURLToPath(new URL('../src/components/WorldViewExploreShell.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } })
const ExploreShell = (await import(output.href)).default
const cameraState = serializeCameraState({ lon: -81.7, lat: 41.4, heightMeters: 5000, headingDegrees: 12, pitchDegrees: -65, rollDegrees: 0 })
const contextToken = { subjectKey: 'cleveland', version: 'v1', timeToken: 'recorded-time-1' }

function fakeDocument() {
  const previousWindow = globalThis.window, previousDocument = globalThis.document
  const handlers = new Map(), scrollCalls = [], nodes = []
  const ancestor = { scrollLeft: 3, scrollTop: 172, parentElement: null }
  const doc = { body: { style: { overflow: 'auto' } }, documentElement: { style: { overflow: '' } }, activeElement: null,
    addEventListener: (name, handler) => handlers.set(name, handler), removeEventListener: (name, handler) => { if (handlers.get(name) === handler) handlers.delete(name) } }
  const win = { scrollX: 4, scrollY: 360, scrollTo: (...args) => scrollCalls.push(args) }
  globalThis.document = doc; globalThis.window = win
  return { doc, handlers, scrollCalls, ancestor, nodes,
    createNodeMock(element) {
      const node = { parentElement: ancestor, disabled: false, getClientRects: () => [{}], focus: () => { doc.activeElement = node },
        querySelectorAll: () => nodes.filter(candidate => candidate.isButton), contains: target => nodes.includes(target), isButton: element.type === 'button' }
      nodes.push(node)
      if (!doc.activeElement && node.isButton) doc.activeElement = node
      return node
    },
    key(key, shiftKey = false) { let prevented = false; handlers.get('keydown')?.({ key, shiftKey, preventDefault: () => { prevented = true } }); return prevented },
    cleanup() { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument },
  }
}
const button = (renderer, label) => renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.join('') === label)
const click = (renderer, label) => act(() => button(renderer, label).props.onClick())
const dialog = renderer => renderer.root.findAll(node => node.props.role === 'dialog')

test('A/B, enter/exit and keyboard dismissal retain one renderer, restore camera and release scroll/focus', () => {
  const dom = fakeDocument(), cameraCalls = [], interactions = []
  let mounts = 0, unmounts = 0, controlMounts = 0, controlUnmounts = 0, renderer
  function Globe() { React.useEffect(() => { mounts++; return () => { unmounts++ } }, []); return React.createElement('div', { 'data-globe': true }, 'Real globe child') }
  function Controls() { React.useEffect(() => { controlMounts++; return () => { controlUnmounts++ } }, []); return React.createElement('div', { id: 'existing-fidelity-panel' }, 'Existing Visual Fidelity') }
  try {
    act(() => { renderer = TestRenderer.create(React.createElement(ExploreShell, { prototypeEnabled: true, contextToken, cameraAdapter: { getCameraState: () => cameraState, setCameraState: state => { cameraCalls.push(state); return true } }, onInteractionChange: value => interactions.push(value), controls: React.createElement(Controls), recordedTimeLabel: 'Recorded · 3 September 2026', status: 'OSM cartography active', attribution: 'OpenStreetMap contributors', context: 'Recorded evidence' }, React.createElement(Globe)), { createNodeMock: dom.createNodeMock }) })
    const launch = dom.doc.activeElement
    assert.equal(renderer.root.findByType('aside').props.hidden, false)
    click(renderer, 'Explore World View')
    assert.equal(renderer.root.findByType('aside').props.hidden, true)
    assert.equal(dialog(renderer).length, 1)
    assert.equal(dom.doc.body.style.overflow, 'hidden')
    assert.notEqual(dom.doc.activeElement, launch)
    click(renderer, 'B · Split dock')
    assert.equal(dialog(renderer)[0].props['data-explore-direction'], 'dock')
    click(renderer, 'A · Immersive')
    click(renderer, 'Options')
    act(() => assert.equal(dom.key('Escape'), true))
    assert.equal(button(renderer, 'Options').props['aria-expanded'], false)
    click(renderer, 'Evidence & context')
    act(() => dom.key('Escape'))
    assert.equal(button(renderer, 'Evidence & context').props['aria-expanded'], false)
    click(renderer, 'Interact')
    act(() => dom.key('Escape'))
    assert.equal(button(renderer, 'Interact').props['aria-pressed'], false)
    assert.equal(dialog(renderer).length, 1)
    dom.ancestor.scrollTop = 900
    act(() => dom.key('Escape'))
    assert.equal(dialog(renderer).length, 0)
    assert.deepEqual(cameraCalls, [cameraState])
    assert.equal(dom.doc.body.style.overflow, 'auto')
    assert.equal(dom.doc.documentElement.style.overflow, '')
    assert.equal(dom.handlers.size, 0)
    assert.equal(dom.doc.activeElement, launch)
    assert.equal(dom.ancestor.scrollTop, 172)
    assert.deepEqual(dom.scrollCalls, [[4, 360]])
    assert.equal(interactions.at(-1), false)
    assert.equal(mounts, 1); assert.equal(unmounts, 0)
    assert.equal(controlMounts, 1); assert.equal(controlUnmounts, 0)
    assert.equal(renderer.root.findAll(node => node.props.id === 'existing-fidelity-panel').length, 1)
    assert.equal(renderer.root.findByType('aside').props.hidden, false)
  } finally { if (renderer) act(() => renderer.unmount()); dom.cleanup() }
  assert.equal(unmounts, 1)
  assert.equal(controlUnmounts, 1)
})

test('time drift is disclosed and explicit prototype gate removal exits without a stale restore', () => {
  const dom = fakeDocument(), results = []
  let renderer
  const props = { prototypeEnabled: true, contextToken, onRestoreResult: result => results.push(result), cameraAdapter: { getCameraState: () => cameraState, setCameraState: () => assert.fail('stale restore') } }
  try {
    act(() => { renderer = TestRenderer.create(React.createElement(ExploreShell, props, React.createElement('div', null, 'globe')), { createNodeMock: dom.createNodeMock }) })
    click(renderer, 'Explore World View')
    const changed = { ...props, contextToken: { ...contextToken, timeToken: 'new inspection range' } }
    act(() => renderer.update(React.createElement(ExploreShell, changed, React.createElement('div', null, 'globe'))))
    assert.match(JSON.stringify(renderer.toJSON()), /Exit will retain the current camera/)
    act(() => renderer.update(React.createElement(ExploreShell, { ...changed, prototypeEnabled: false }, React.createElement('div', null, 'globe'))))
    assert.equal(results[0].reason, 'context-changed')
    assert.match(JSON.stringify(renderer.toJSON()), /earlier camera was not restored/)
    assert.equal(dom.doc.body.style.overflow, 'auto')
  } finally { if (renderer) act(() => renderer.unmount()); dom.cleanup() }
})

test('unmount during interaction always releases document styles/listeners without camera restore', () => {
  const dom = fakeDocument(), interactions = []
  let renderer
  try {
    act(() => { renderer = TestRenderer.create(React.createElement(ExploreShell, { prototypeEnabled: true, contextToken, onInteractionChange: value => interactions.push(value), cameraAdapter: { getCameraState: () => cameraState, setCameraState: () => assert.fail('unmount must not restore') } }, React.createElement('div', null, 'globe')), { createNodeMock: dom.createNodeMock }) })
    click(renderer, 'Explore World View'); click(renderer, 'Interact')
    act(() => renderer.unmount()); renderer = null
    assert.equal(dom.doc.body.style.overflow, 'auto')
    assert.equal(dom.doc.documentElement.style.overflow, '')
    assert.equal(dom.handlers.size, 0)
    assert.equal(interactions.at(-1), false)
  } finally { if (renderer) act(() => renderer.unmount()); dom.cleanup() }
})

test('renderer restore error closes Explore and releases document ownership; default prototype UI is hidden', () => {
  const dom = fakeDocument(), results = []
  let renderer
  try {
    const props = { contextToken, cameraAdapter: { getCameraState: () => cameraState, setCameraState: () => { throw new Error('renderer disposed') } }, onRestoreResult: value => results.push(value) }
    act(() => { renderer = TestRenderer.create(React.createElement(ExploreShell, props, React.createElement('div', null, 'globe')), { createNodeMock: dom.createNodeMock }) })
    assert.equal(renderer.root.find(node => node.props.className === 'wv-explore-launch').props.hidden, true)
    act(() => renderer.update(React.createElement(ExploreShell, { ...props, prototypeEnabled: true }, React.createElement('div', null, 'globe'))))
    click(renderer, 'Explore World View'); click(renderer, 'Close Explore World View')
    assert.equal(results[0].reason, 'restore-failed')
    assert.equal(dialog(renderer).length, 0)
    assert.equal(dom.doc.body.style.overflow, 'auto')
    assert.match(JSON.stringify(renderer.toJSON()), /earlier camera could not be restored/)
  } finally { if (renderer) act(() => renderer.unmount()); dom.cleanup() }
})
