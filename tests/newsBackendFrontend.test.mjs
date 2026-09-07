import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createNewsBackend } from '../src/lib/newsBackend.js'

const output = new URL('./.compiled/news-backend-view.mjs', import.meta.url)
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/views/NewsView.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { default: NewsView } = await import(output.href)
const articles = ['A', 'B'].map(id => ({ id, title: `Article ${id}`, outlet: `Publisher ${id}`, url: `https://example.invalid/${id}`, summary: `Summary ${id}`, published_at: '2026-08-03T12:00:00Z' }))
const domains = ['loadArticleDetail', 'loadArticleGraphLinks', 'loadSkyVerification', 'loadArticleTimelineKey', 'loadArticleComparisonEvents']
function fixture() {
  const requests = []
  const backend = { ...createNewsBackend(null), loadArticles: async () => ({ articles, total: 2 }) }
  for (const method of domains) backend[method] = id => new Promise((resolve, reject) => requests.push({ method, id, resolve, reject }))
  return { backend, requests }
}
function response(method, id) {
  if (method === 'loadArticleDetail') return { ...articles.find(a => a.id === id), claims: [{ kind: 'substantive', text: `Claim belonging to ${id}` }], citations: [], evidenceRecords: [] }
  if (method === 'loadArticleGraphLinks') return [{ nodeId: `node-${id}`, label: `Graph for ${id}` }]
  if (method === 'loadArticleComparisonEvents') return [{ eventId: `event-${id}`, title: `Comparison for ${id}` }]
  if (method === 'loadArticleTimelineKey') return `timeline-${id}`
  return null
}
const props = backend => ({ backend, variant: 'drawer', onOpenNode() {}, onOpenTimeline() {}, onOpenComparison() {} })
// Select using the visible title's owning card, without depending on test IDs.
function clickArticle(renderer, id) {
  const title = renderer.root.findAll(n => n.type === 'h3').find(n => n.children.includes(`Article ${id}`))
  let card = title
  while (card && card.type !== 'button') card = card.parent
  assert.ok(card, `article ${id} card button`)
  card.props.onClick()
}
const text = renderer => JSON.stringify(renderer.toJSON())

test('switching articles discards all late detail and destination responses', async () => {
  const f = fixture(); let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(NewsView, props(f.backend))) })
  try {
    await act(async () => { clickArticle(renderer, 'A'); clickArticle(renderer, 'B') })
    assert.equal(f.requests.length, 10)
    await act(async () => { for (const r of f.requests.filter(r => r.id === 'B')) r.resolve(response(r.method, 'B')) })
    assert.match(text(renderer), /Claim belonging to B/)
    await act(async () => { for (const r of f.requests.filter(r => r.id === 'A')) r.resolve(response(r.method, 'A')) })
    assert.match(text(renderer), /Claim belonging to B/)
    assert.match(text(renderer), /Graph for B/); assert.match(text(renderer), /Comparison for B/)
    assert.doesNotMatch(text(renderer), /Claim belonging to A|Graph for A|Comparison for A|timeline-A/)
  } finally { await act(async () => renderer.unmount()) }
})

test('late failure cannot overwrite the current article or survive close and reopen', async () => {
  const f = fixture(); let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(NewsView, props(f.backend))) })
  try {
    await act(async () => clickArticle(renderer, 'A'))
    await act(async () => clickArticle(renderer, 'A')) // close while loading
    await act(async () => clickArticle(renderer, 'A')) // a new request for the same id
    const old = f.requests.slice(0, 5), current = f.requests.slice(5)
    await act(async () => { for (const r of current) r.resolve(response(r.method, 'A')) })
    await act(async () => { for (const r of old) r.reject(new Error('stale request failure')) })
    assert.match(text(renderer), /Claim belonging to A/)
    assert.doesNotMatch(text(renderer), /stale request failure/)
    await act(async () => clickArticle(renderer, 'B'))
    await act(async () => { f.requests.at(-5).reject(new Error('current detail failure')) })
    assert.match(text(renderer), /current detail failure/)
  } finally { await act(async () => renderer.unmount()) }
})
