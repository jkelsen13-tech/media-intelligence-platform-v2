import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
const output = new URL('./.compiled/lazy-world-view.mjs', import.meta.url)
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/components/LazyWorldView.jsx', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm',
  packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
  external: ['../views/WorldView.jsx'] })
const { createLazyWorldView } = await import(output.href)

test('World View loading defers its surface and forwards the existing props when ready', async () => {
  let resolve, received, calls = 0, r
  const View = createLazyWorldView(() => { calls++; return new Promise(r => { resolve = r }) })
  const props = { graph: { nodes: [] }, investigationContext: { canonical_subject_id: 'synthetic' }, onSelectProjection() {} }
  await act(async () => { r = TestRenderer.create(React.createElement(View, props)) })
  try {
    assert.equal(calls, 1)
    assert.equal(r.root.findByProps({ role: 'status' }).children[0], 'Loading World View…')
    assert.equal(received, undefined)
    await act(async () => resolve({ default: p => { received = p; return React.createElement('p', null, 'Fixture map ready') } }))
    assert.equal(received.graph, props.graph)
    assert.equal(received.investigationContext, props.investigationContext)
    assert.equal(received.onSelectProjection, props.onSelectProjection)
    assert.match(JSON.stringify(r.toJSON()), /Fixture map ready/)
  } finally { await act(async () => r.unmount()) }
})

test('World View import failure remains bounded, hides diagnostics and retry loads a fresh attempt', async () => {
  const pending = []; let r
  const View = createLazyWorldView(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
  await act(async () => { r = TestRenderer.create(React.createElement(View)) })
  try {
    await act(async () => pending[0].reject(new Error('synthetic internal import diagnostic')))
    const alert = r.root.findByProps({ role: 'alert' })
    assert.match(JSON.stringify(r.toJSON()), /World View could not be opened/)
    assert.doesNotMatch(JSON.stringify(r.toJSON()), /internal import diagnostic/)
    await act(async () => alert.findByType('button').props.onClick())
    assert.equal(pending.length, 2)
    await act(async () => pending[1].resolve({ default: () => React.createElement('p', null, 'Recovered fixture') }))
    assert.match(JSON.stringify(r.toJSON()), /Recovered fixture/)
  } finally { await act(async () => r.unmount()) }
})
