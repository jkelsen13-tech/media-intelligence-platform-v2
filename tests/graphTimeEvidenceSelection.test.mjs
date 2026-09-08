import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { fileURLToPath } from 'node:url'

const built = await build({
  entryPoints: [fileURLToPath(new URL('../src/graph/GraphModePanel.jsx', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, jsx: 'automatic',
  loader: { '.css': 'empty' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
})
// A data URL cannot resolve external packages; supply the bundle through a
// temporary module next to this test and always remove it after import.
import { writeFile, unlink } from 'node:fs/promises'
const moduleUrl = new URL('./.timeline-availability-' + process.pid + '.mjs', import.meta.url)
let GraphModePanel
try {
  await writeFile(moduleUrl, built.outputFiles[0].text)
  GraphModePanel = (await import(moduleUrl.href)).default
} finally { await unlink(moduleUrl).catch(() => {}) }


const textOf = node => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}
test('Time records open their exact identity, including undated records and same-label nodes', async () => {
  const selected = []
  let root
  try {
    await act(async () => { root = TestRenderer.create(React.createElement(GraphModePanel, {
      mode: 'time',
      nodes: [
        { id: 'late', label: 'Same label', occurred_at: '2026-02-01' },
        { id: 'early', label: 'Same label', occurred_at: '2026-01-01' },
        { id: 'undated', label: 'Undated record' },
      ],
      onSelectNode: id => selected.push(id),
    })) })
    const buttons = root.root.findAllByProps({className:'graph-time-record'})
    assert.equal(buttons.length, 3)
    assert.match(textOf(buttons[0]), /Recorded date: 2026-01-01/)
    assert.match(textOf(buttons[2]), /No recorded date/)
    for (const b of buttons) {
      assert.equal(b.props.type, 'button')
      assert.equal(b.props.disabled, false)
      await act(async () => b.props.onClick())
    }
    assert.deepEqual(selected, ['early','late','undated'])
  } finally { await act(async () => root?.unmount()) }
})
test('Time records without a usable identity or selection handler remain disabled', async () => {
  for (const props of [
    { nodes:[{label:'Unidentified record'}], onSelectNode:()=>{} },
    { nodes:[{id:'known',label:'Known record'}] },
  ]) {
    let root
    try {
      await act(async () => { root = TestRenderer.create(React.createElement(GraphModePanel, {mode:'time',...props})) })
      assert.equal(root.root.findByProps({className:'graph-time-record'}).props.disabled, true)
    } finally { await act(async () => root?.unmount()) }
  }
})
