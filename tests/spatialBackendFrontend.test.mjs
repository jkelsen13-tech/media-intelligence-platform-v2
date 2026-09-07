import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { spatialFixture, spatialTables, spatialRow } from './spatialBackendFixture.mjs'
import { unavailableWeather } from '../src/lib/eventTimeWeather.js'

await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
const output = new URL('./.compiled/spatial-WorldView.mjs', import.meta.url)
await build({ entryPoints: [fileURLToPath(new URL('../src/views/WorldView.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'renderer-only-stubs', setup(b) {
    b.onResolve({ filter: /^react$/, namespace: 'renderer' }, () => ({ path: 'react', external: true }))
    b.onResolve({ filter: /(?:WorldMapCanvas|\/GraphView)$/ }, args => ({ path: args.path, namespace: 'renderer' }))
    b.onLoad({ filter: /.*/, namespace: 'renderer' }, () => ({ contents: 'import React from "react"; export default p => React.createElement("div", null, p.emptyMessage, JSON.stringify(p.rows ?? p.nodes ?? []))', loader: 'js' }))
  } }],
})
const WorldView = (await import(output.href)).default
const text = r => JSON.stringify(r.toJSON())
const props = { selected: { id: 'synthetic-event', label: 'Synthetic recorded event' }, onSelectProjection() {}, onSelectGraphNode() {} }

test('World View renders bound spatial provenance and preserves unavailable temporal and weather dimensions', async () => {
  const f = spatialFixture({ tables: spatialTables() }), originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('archive unavailable in this fixture') }
  let renderer
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(WorldView, { ...props, backend: f.backend })) })
    for (const value of ['Synthetic recorded place', 'Synthetic recorded uncertainty', 'synthetic-evidence', 'city', 'temporal assessment unavailable']) assert.ok(text(renderer).includes(value), value)
    assert.match(text(renderer), /Weather not sourced/)
    assert.ok(f.calls.some(c => c.table === 'spatial_projection_v1')); assert.ok(f.calls.some(c => c.table === 'pipeline_config'))
  } finally { if (renderer) await act(async () => renderer.unmount()); globalThis.fetch = originalFetch }
})

test('World View ignores old spatial, graph, temporal and weather results when its backend changes', async () => {
  const pending = {}, old = Object.fromEntries(['loadSpatialProjection', 'loadWorldViewGraph', 'loadTemporalAssessment', 'loadEventTimeWeather'].map(method => [method, () => new Promise(resolve => { pending[method] = resolve })]))
  const fresh = spatialFixture().backend
  let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(WorldView, { ...props, backend: old })) })
  try {
    await act(async () => renderer.update(React.createElement(WorldView, { ...props, backend: fresh })))
    const before = text(renderer)
    await act(async () => {
      pending.loadSpatialProjection({ status: 'ok', rows: [spatialRow], loadedAt: '2024-01-01' })
      pending.loadWorldViewGraph({ status: 'ok', nodes: [{ id: 'old-node', label: 'Obsolete graph' }], edges: [] })
      pending.loadTemporalAssessment({ status: 'ok', copy: 'Obsolete assessment' })
      pending.loadEventTimeWeather({ ...unavailableWeather('old'), copy: 'Obsolete weather' })
    })
    assert.equal(text(renderer), before); assert.doesNotMatch(text(renderer), /Obsolete|Synthetic recorded uncertainty/)
  } finally { await act(async () => renderer.unmount()) }
})
