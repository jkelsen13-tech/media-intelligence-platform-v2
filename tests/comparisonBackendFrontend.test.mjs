import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { comparisonBackendFixture, comparisonRow } from './comparisonBackendFixture.mjs'

const output = new URL('./.compiled/comparison-backend-view.mjs', import.meta.url)
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/views/SourceComparisonView.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { default: View } = await import(output.href)
const text = r => JSON.stringify(r.toJSON())
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('comparison view renders the shared projection and preserves all destination callbacks', async () => {
  const f = comparisonBackendFixture({ tables: { comparison_public: [comparisonRow()] } })
  const destinations = []; let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, { backend: f.backend,
    onOpenArticle: t => destinations.push(['news', t]), onOpenArc: t => destinations.push(['arc', t]), onOpenTimeline: t => destinations.push(['timeline', t]),
  })) })
  try {
    assert.match(text(renderer), /Retained supporting passage/)
    assert.match(text(renderer), /Grouping awaits review/)
    const buttons = renderer.root.findAllByType('button')
    for (const label of ['Open in News', 'Arc:', 'Causal Timeline']) {
      const button = buttons.find(b => b.children.filter(c => typeof c === 'string').join('').includes(label))
      assert.ok(button, label); await act(async () => button.props.onClick())
    }
    assert.deepEqual(destinations, [
      ['news', { articleKey: 'event-000000-opaque-A', url: 'https://example.invalid/event-000000/A' }],
      ['arc', 'recorded-arc'], ['timeline', { eventKey: 'recorded-event', arcId: 'recorded-arc' }],
    ])
    const src = await readFile(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')
    assert.match(src, /backend = mipBackend.publicData/)
    assert.doesNotMatch(src, /import \{\s*loadSourceComparisonView/)
  } finally { await act(async () => renderer.unmount()) }
})

test('replacing the comparison backend resets stale state and ignores obsolete success or failure', async () => {
  const first = deferred(), second = deferred(), third = deferred(); let renderer
  const props = d => ({ backend: { loadSourceComparisonView: () => d.promise } })
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, props(first))) })
  try {
    await act(async () => renderer.update(React.createElement(View, props(second))))
    const actual = await comparisonBackendFixture({ tables: { comparison_public: [comparisonRow(2)] } }).backend.loadSourceComparisonView()
    await act(async () => second.resolve(actual))
    assert.match(text(renderer), /Compared event 2/)
    await act(async () => first.reject(new Error('obsolete failure')))
    assert.match(text(renderer), /Compared event 2/); assert.doesNotMatch(text(renderer), /obsolete failure/)
    await act(async () => renderer.update(React.createElement(View, props(third))))
    assert.doesNotMatch(text(renderer), /Compared event 2/); assert.match(text(renderer), /Loading/)
    const fourth = deferred()
    await act(async () => renderer.update(React.createElement(View, props(fourth))))
    await act(async () => third.resolve(actual))
    assert.doesNotMatch(text(renderer), /Compared event 2/)
    await act(async () => fourth.resolve({ enabled: true, events: [] }))
    assert.doesNotMatch(text(renderer), /Compared event 2|Loading/)
  } finally { await act(async () => renderer.unmount()) }
})

test('active event never displays unrelated comparison coverage; stale focus cannot override it', async () => {
  const f = comparisonBackendFixture({ tables: { comparison_public: [comparisonRow(1), comparisonRow(2)] } })
  let renderer
  const props = (id, extra = {}) => ({ backend: f.backend, investigationContext: { canonical_subject_type: 'event', canonical_subject_id: id }, ...extra })
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, props('unjoined-eclipse', { focusEventId: 'event-000001' }))) })
  try {
    assert.match(text(renderer), /No released comparison is linked/)
    assert.doesNotMatch(text(renderer), /Compared event|Retained supporting passage|Open in News/)
    await act(async () => renderer.update(React.createElement(View, props('event-000002', { focusEventId: 'event-000001' }))))
    assert.match(text(renderer), /Compared event 2/)
    assert.doesNotMatch(text(renderer), /Compared event 1/)
    const search = renderer.root.findByProps({ 'aria-label': 'Search comparison events' })
    await act(async () => { search.props.onChange({ target: { value: 'Compared event 1' } }); await new Promise(r => setTimeout(r, 380)) })
    assert.doesNotMatch(text(renderer), /Retained supporting passage/)
    await act(async () => renderer.update(React.createElement(View, props('event-000001'))))
    assert.match(text(renderer), /Compared event 1/)
    assert.doesNotMatch(text(renderer), /Compared event 2/)
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Search comparison events' }).props.value, '')
  } finally { await act(async () => renderer.unmount()) }
})

test('unjoined context stays empty through asynchronous load; standalone browsing remains available', async () => {
  const d = deferred(), backend = { loadSourceComparisonView: () => d.promise }; let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, { backend, investigationContext: { canonical_subject_type: 'event', canonical_subject_id: 'missing' } })) })
  try {
    assert.match(text(renderer), /Loading/)
    const actual = await comparisonBackendFixture({ tables: { comparison_public: [comparisonRow(1)] } }).backend.loadSourceComparisonView()
    await act(async () => d.resolve(actual))
    assert.match(text(renderer), /No released comparison is linked/)
    assert.doesNotMatch(text(renderer), /Compared event 1/)
    await act(async () => renderer.update(React.createElement(View, { backend })))
    assert.match(text(renderer), /Browsing all released comparison events/)
    assert.match(text(renderer), /Compared event 1/)
    await act(async () => renderer.update(React.createElement(View, { backend: { loadSourceComparisonView: async () => ({ enabled: true, events: [], loadError: 'offline' }) }, investigationContext: { canonical_subject_type: 'event', canonical_subject_id: 'missing' } })))
    assert.match(text(renderer), /Comparison data is currently unavailable/)
    assert.doesNotMatch(text(renderer), /No released comparison is linked/)
  } finally { await act(async () => renderer.unmount()) }
})

test('failed comparison reads never display absence claims or partial cards and retry within the current scope', async () => {
  const actual = await comparisonBackendFixture({ tables: { comparison_public: [comparisonRow(1), comparisonRow(2)] } }).backend.loadSourceComparisonView()
  const pending = deferred(); let calls = 0, renderer
  const backend = { loadSourceComparisonView: () => ++calls === 1
    ? Promise.resolve({ ...actual, loadError: 'unavailable' }) : pending.promise }
  const props = id => ({ backend, investigationContext: { canonical_subject_type: 'event', canonical_subject_id: id } })
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, props('event-000001'))) })
  try {
    assert.match(text(renderer), /Comparison data is currently unavailable/)
    assert.doesNotMatch(text(renderer), /No validated|No released|Compared event|Retained supporting passage/)
    await act(async () => renderer.root.findByProps({ className: 'sc-retry' }).props.onClick())
    assert.equal(calls, 2); assert.match(text(renderer), /Loading comparison/)
    assert.doesNotMatch(text(renderer), /Retry comparison|No validated|Compared event/)
    await act(async () => renderer.update(React.createElement(View, props('event-000002'))))
    await act(async () => pending.resolve(actual))
    assert.match(text(renderer), /Compared event 2/)
    assert.doesNotMatch(text(renderer), /Compared event 1|unavailable|Retry comparison/)
  } finally { await act(async () => renderer.unmount()) }
})

test('rejected and synchronous failed reads recover to confirmed empty state; obsolete retry cannot replace a new backend', async () => {
  const pending = deferred(); let calls = 0, renderer
  const backend = { loadSourceComparisonView: () => { calls++; if (calls === 1) throw new Error('offline'); return pending.promise } }
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, { backend })) })
  try {
    assert.match(text(renderer), /Retry comparison/)
    assert.doesNotMatch(text(renderer), /No validated source comparison/)
    await act(async () => renderer.root.findByProps({ className: 'sc-retry' }).props.onClick())
    await act(async () => renderer.update(React.createElement(View, { backend: { loadSourceComparisonView: async () => ({ enabled: true, events: [] }) } })))
    assert.match(text(renderer), /No validated source comparison yet/)
    await act(async () => pending.reject(new Error('obsolete retry')))
    assert.doesNotMatch(text(renderer), /Retry comparison|Comparison data is currently unavailable|obsolete/)
    await act(async () => renderer.update(React.createElement(View, { backend: { loadSourceComparisonView: () => Promise.reject(null) } })))
    assert.match(text(renderer), /Retry comparison/)
    assert.doesNotMatch(text(renderer), /No validated source comparison/)
  } finally { await act(async () => renderer.unmount()) }
})

test('an unconfigured comparison backend does not claim verified absence', async () => {
  let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, { backend: { loadSourceComparisonView: async () => ({ enabled: false, events: [] }) } })) })
  try {
    assert.match(text(renderer), /service is not configured/)
    assert.doesNotMatch(text(renderer), /No validated|No released|Retry comparison/)
  } finally { await act(async () => renderer.unmount()) }
})

test('comparison displays retained publication and review precision without inventing a first reporter', async () => {
  const row = comparisonRow()
  row.articles[0].published_at = '2026-08-05'
  row.claims[0].surfaces[0].explanation.reviewed_at = '2026-08-06T00:00:00.123456+05:30'
  const f = comparisonBackendFixture({ tables: { comparison_public: [row] } }); let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(View, { backend: f.backend })) })
  try {
    assert.match(text(renderer), /2026-08-05 \(date only\)/)
    assert.match(text(renderer), /2026-08-06 00:00:00.123456 UTC\+05:30/)
    assert.match(text(renderer), /order not established from these records/)
    assert.doesNotMatch(text(renderer), /first reported by|same hour|Invalid Date/)
    row.articles.forEach((article, index) => { article.published_at = '2026-08-05T12:00:00.00000' + (index + 1) + 'Z' })
    const precise = comparisonBackendFixture({ tables: { comparison_public: [row] } })
    await act(async () => renderer.update(React.createElement(View, { backend: precise.backend })))
    assert.match(text(renderer), /<0.1h later/)
    assert.doesNotMatch(text(renderer), /same hour/)
  } finally { await act(async () => renderer.unmount()) }
})
