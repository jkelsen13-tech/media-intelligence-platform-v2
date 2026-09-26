import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { curatedFixture, curatedTables } from './curatedBackendFixture.mjs'
import { evidenceBackendFixture, evidenceTables } from './evidenceBackendFixture.mjs'
const components = {}
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
for (const [name, path] of [['Phase3View', 'views'], ['ReviewStatusPanel', 'panels']]) {
  const output = new URL(`./.compiled/curated-${name}.mjs`, import.meta.url)
  await build({ entryPoints: [fileURLToPath(new URL(`../src/${path}/${name}.jsx`, import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
  components[name] = (await import(output.href)).default
}
const text = r => JSON.stringify(r.toJSON())

test('curated UI renders recorded passages, separated tracks, and the shared navigation gate', async () => {
  const f = curatedFixture({ tables: curatedTables() }); let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(components.Phase3View, { backend: f.backend })) })
  try {
    for (const value of ['Attributed case passage', 'Documented claim of the deciding body', 'Marked missing', 'Unverified — not established fact', 'Recorded agency', 'Recorded objective passage', 'Recorded outcome passage']) assert.ok(text(renderer).includes(value), value)
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
    assert.match(app, /mipBackend.publicData.curated.loadPhase3BetaFlag\(\)/)
    assert.doesNotMatch(app, /import \{ loadPhase3BetaFlag \}/)
  } finally { await act(async () => renderer.unmount()) }
})

test('curated UI distinguishes empty data from unavailable data while Review Status keeps system review labels', async () => {
  const f = curatedFixture({ tables: curatedTables(), errors: { p3_legal_case: { code: '42501', message: 'denied' } } }); let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(components.Phase3View, { backend: f.backend })) })
  try {
    assert.match(text(renderer), /Legal case records are currently unavailable/)
    assert.doesNotMatch(text(renderer), /No curated legal cases yet/)
    assert.match(text(renderer), /Synthetic policy/)
  } finally { await act(async () => renderer.unmount()) }
  await act(async () => { renderer = TestRenderer.create(React.createElement(components.ReviewStatusPanel, { backend: f.evidence })) })
  try {
    assert.match(text(renderer), /Auto-verified — system confidence threshold/)
    assert.match(text(renderer), /not human-reviewed/)
    assert.match(text(renderer), /edge:synthetic/)
  } finally { await act(async () => renderer.unmount()) }
})

test('curated and review views ignore obsolete loads after their backend is replaced', async () => {
  for (const [name, method, facet, disabled] of [['Phase3View', 'loadPhase3BetaView', 'backend', { enabled: false, cases: [], policies: [] }], ['ReviewStatusPanel', 'loadExplanationReadView', 'evidence', { enabled: false, eligible: [], excluded: [] }]]) {
    let resolve, renderer; const pending = new Promise(r => { resolve = r })
    const old = { [method]: () => pending }, current = { [method]: async () => disabled }
    await act(async () => { renderer = TestRenderer.create(React.createElement(components[name], { backend: old })) })
    try {
      await act(async () => renderer.update(React.createElement(components[name], { backend: current })))
      const before = text(renderer), f = curatedFixture({ tables: curatedTables() })
      await act(async () => resolve(await f[facet][method]()))
      assert.equal(text(renderer), before)
      assert.doesNotMatch(text(renderer), /Synthetic proceeding|edge:synthetic/)
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('review status distinguishes confirmed disabled, readable empty and unavailable provenance', async () => {
  for (const mode of ['disabled', 'empty', 'flag-denied', 'rows-denied', 'network']) {
    const tables = evidenceTables(), errors = {}
    if (mode === 'disabled') tables.pipeline_config = [{ key: 'provenance_ui', value: false }]
    if (mode === 'empty') tables.explanations = []
    if (mode === 'flag-denied') errors.pipeline_config = { code: '42501', message: 'private diagnostic' }
    if (mode === 'rows-denied') errors.explanations = { code: '42501', message: 'private diagnostic' }
    if (mode === 'network') errors.explanations = () => { throw Error('private diagnostic') }
    const f = evidenceBackendFixture({ tables, errors }); let renderer
    await act(async () => { renderer = TestRenderer.create(React.createElement(components.ReviewStatusPanel, { backend: f.backend })) })
    try {
      const output = text(renderer)
      assert.doesNotMatch(output, /edge:edge-one|private diagnostic/)
      if (mode === 'disabled') assert.match(output, /provenance_ui flag off/)
      else if (mode === 'empty') {
        assert.match(output, /No explanation rows found/); assert.doesNotMatch(output, /could not be loaded|flag off/)
      } else {
        assert.match(output, /Review status could not be loaded/)
        assert.doesNotMatch(output, /flag off|No explanation rows found/)
      }
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('a stale unavailable review load cannot replace a newer readable backend', async () => {
  let resolve, renderer
  const old = { loadExplanationReadView: () => new Promise(done => { resolve = done }) }
  const current = evidenceBackendFixture({ tables: evidenceTables() }).backend
  await act(async () => { renderer = TestRenderer.create(React.createElement(components.ReviewStatusPanel, { backend: old })) })
  try {
    await act(async () => renderer.update(React.createElement(components.ReviewStatusPanel, { backend: current })))
    await act(async () => resolve({ enabled: true, eligible: [], excluded: [], loadError: { code: 'provenance_unavailable', stage: 'explanations' } }))
    assert.match(text(renderer), /edge:edge-one/)
    assert.doesNotMatch(text(renderer), /could not be loaded|flag off/)
  } finally { await act(async () => renderer.unmount()) }
})
