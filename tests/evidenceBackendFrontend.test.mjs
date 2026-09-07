import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { evidenceBackendFixture, evidenceTables, evidenceNode, evidencePolicy, evidenceEdge } from './evidenceBackendFixture.mjs'
import { createEvidenceBackend } from '../src/lib/evidenceBackend.js'
const panels = {}
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
for (const name of ['ArticlePanel', 'PolicyPanel', 'RelationshipPanel']) {
  const output = new URL(`./.compiled/evidence-${name}.mjs`, import.meta.url)
  await build({ entryPoints: [fileURLToPath(new URL(`../src/panels/${name}.jsx`, import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
  panels[name] = (await import(output.href)).default
}
const props = { ArticlePanel: { node: evidenceNode, nodes: [evidenceNode], edges: [] }, PolicyPanel: { node: evidencePolicy, nodes: [evidencePolicy, evidenceNode], edges: [evidenceEdge] }, RelationshipPanel: { edge: evidenceEdge, sourceLabel: 'Recorded policy', targetLabel: 'Recorded event' } }
const text = r => JSON.stringify(r.toJSON())
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('visible evidence panels render real shared-backend source, policy, and relationship records', async () => {
  for (const [name, expected] of Object.entries({ ArticlePanel: ['Node source headline', 'Backing article title'], PolicyPanel: ['Recorded policy name', 'Recorded jurisdiction'], RelationshipPanel: ['Recorded grounding passage', 'Recorded policy document', 'missing-source'] })) {
    const f = evidenceBackendFixture({ tables: evidenceTables() }); let renderer
    await act(async () => { renderer = TestRenderer.create(React.createElement(panels[name], { ...props[name], backend: f.backend })) })
    try {
      for (const value of expected) assert.ok(text(renderer).includes(value), `${name}: ${value}`)
      assert.ok(f.calls.length > 0)
      const src = await readFile(new URL(`../src/panels/${name}.jsx`, import.meta.url), 'utf8')
      assert.match(src, /backend = mipBackend.publicData.evidence/)
      assert.doesNotMatch(src, /from '..\/lib\/(supabase|explanationReadPath)/)
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('switching nodes ignores old sources and article records after current evidence appears', async () => {
  const pending = [], backend = { ...createEvidenceBackend(null),
    loadSources: id => { const d = deferred(); pending.push({ id, kind: 'sources', ...d }); return d.promise },
    loadNodeArticles: id => { const d = deferred(); pending.push({ id, kind: 'articles', ...d }); return d.promise },
  }; let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(panels.ArticlePanel, { ...props.ArticlePanel, backend })) })
  try {
    await act(async () => renderer.update(React.createElement(panels.ArticlePanel, { ...props.ArticlePanel, node: { ...evidenceNode, id: 'node-two', label: 'Second event' }, backend })))
    await act(async () => { for (const p of pending.filter(p => p.id === 'node-two')) p.resolve([{ id: 'new', headline: 'Current source', title: 'Current article', outlet: 'Current publisher' }]) })
    assert.match(text(renderer), /Current source/); assert.match(text(renderer), /Current article/)
    await act(async () => { for (const p of pending.filter(p => p.id === 'node-one')) p.resolve([{ id: 'old', headline: 'Obsolete source', title: 'Obsolete article' }]) })
    assert.doesNotMatch(text(renderer), /Obsolete source|Obsolete article/)
  } finally { await act(async () => renderer.unmount()) }
})

test('switching relationships cancels obsolete source lookup and ignores late provenance', async () => {
  const pending = [], sourceReads = [], backend = { ...createEvidenceBackend(null),
    loadExplanationReadView: options => { const d = deferred(); pending.push(d); return d.promise },
    loadEdgeSources: async ids => { sourceReads.push(ids); return [] },
  }; let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(panels.RelationshipPanel, { ...props.RelationshipPanel, backend })) })
  try {
    await act(async () => renderer.update(React.createElement(panels.RelationshipPanel, { ...props.RelationshipPanel, edge: { ...evidenceEdge, id: 'edge-two' }, backend })))
    const row = evidenceTables().explanations[0]
    await act(async () => pending[1].resolve({ enabled: true, eligible: [{ ...row, supporting_passage: 'Current relationship passage', source_ids: ['current-source'] }], excluded: [] }))
    await act(async () => pending[0].resolve({ enabled: true, eligible: [{ ...row, supporting_passage: 'Obsolete relationship passage', source_ids: ['obsolete-source'] }], excluded: [] }))
    assert.deepEqual(sourceReads, [['current-source']])
    assert.match(text(renderer), /Current relationship passage/); assert.doesNotMatch(text(renderer), /Obsolete relationship passage/)
  } finally { await act(async () => renderer.unmount()) }
})

test('policy reliability renders only recorded tiers one through four', async () => {
  for (const reliability of [null, undefined, '', false, [], 0, 5, 1.5, 2, '3']) {
    let renderer
    await act(async () => { renderer = TestRenderer.create(React.createElement(panels.PolicyPanel, { ...props.PolicyPanel, edges: [{ ...evidenceEdge, reliability }], backend: createEvidenceBackend(null) })) })
    try {
      if (reliability === 2 || reliability === '3') assert.match(text(renderer), new RegExp(`Tier ${reliability} of 4`))
      else assert.doesNotMatch(text(renderer), /Tier .* of 4/)
    } finally { await act(async () => renderer.unmount()) }
  }
})
