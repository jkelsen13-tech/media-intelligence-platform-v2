import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { fileURLToPath } from 'node:url'
import { createChronologyBackend } from '../src/lib/chronologyBackend.js'
import { newsBackendFixture } from './newsBackendFixture.mjs'

const built = await build({
  entryPoints: [fileURLToPath(new URL('../src/views/TimelineView.jsx', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, jsx: 'automatic',
  loader: { '.css': 'empty' },
  packages: 'external',
})
// A data URL cannot resolve external packages; supply the bundle through a
// temporary module next to this test and always remove it after import.
import { writeFile, unlink } from 'node:fs/promises'
const moduleUrl = new URL('./.timeline-availability-' + process.pid + '.mjs', import.meta.url)
let TimelineView
try {
  await writeFile(moduleUrl, built.outputFiles[0].text)
  TimelineView = (await import(moduleUrl.href)).default
} finally { await unlink(moduleUrl).catch(() => {}) }

const textOf = node => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}
const click = async (root, label) => {
  const button = root.root.findAllByType('button').find(b => textOf(b).trim() === label)
  assert.ok(button, label)
  await act(async () => { button.props.onClick(); await new Promise(r => setTimeout(r, 20)) })
}
const flush = () => new Promise(r => setTimeout(r, 30))

for (const arcScope of [false, true]) {
  test('Timeline preserves unavailable/loading/empty connections and explicit recovery in ' + (arcScope ? 'arc' : 'global') + ' scope', async () => {
    const arc = { id: 'arc-a', slug: 'arc-a', category: 'public_health', started_at: '2026-01-01' }
    let failure = { code: '42501', message: 'synthetic denied read' }
    const f = newsBackendFixture({
      tables: {
        story_arcs: arcScope ? [arc] : [],
        nodes: [{ id: 'node-a', slug: 'node-a', label: 'Recorded event', type: 'event', arc_id: arc.id, occurred_at: '2026-01-02' }],
        arc_events: [{ id: 'arc-event-a', arc_id: arc.id, title: 'Recorded arc event', occurred_at: '2026-01-02' }],
      },
      errors: { edges: () => failure },
    })
    const backend = createChronologyBackend(f.client)
    let release
    let delayed = false
    const method = arcScope ? 'loadArcConnections' : 'loadTimeline'
    const client = { ...backend, [method]: async (...args) => {
      if (delayed) await new Promise(resolve => { release = resolve })
      return backend[method](...args)
    } }
    let root
    try {
      await act(async () => { root = TestRenderer.create(React.createElement(TimelineView, { backend: client })); await flush() })
      assert.match(textOf(root.toJSON()), /Open Connections \(count unavailable\)/)
      await click(root, 'Connections')
      assert.doesNotMatch(textOf(root.toJSON()), /No graph connections/)
      assert.match(textOf(root.toJSON()), /Connections are unavailable/)
      failure = null
      delayed = true
      await click(root, 'Retry connections')
      assert.match(textOf(root.toJSON()), /Open Connections \(loading\)/)
      assert.doesNotMatch(textOf(root.toJSON()), /No graph connections/)
      await act(async () => { release(); await flush() })
      assert.match(textOf(root.toJSON()), /Open Connections \(0\)/)
      assert.match(textOf(root.toJSON()), /No graph connections/)
      await click(root, 'Timeline')
      if (!arcScope) {
        const noLinks = root.root.findAllByType('button').find(b => textOf(b) === 'No links')
        assert.equal(noLinks.props.disabled, false)
      }
    } finally { await act(async () => root?.unmount()) }
  })
}
