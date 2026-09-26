import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createNewsBackend } from '../../src/lib/newsBackend.js'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.MIP_NEWS_READER_TEST
assert.equal(base, 'http://127.0.0.1:8765', 'fixed isolated bridge URL required')
const expected = await fetch(base + '/test/expected').then(r => r.json())
const calls = []
const client = createClient(base, 'synthetic-browser-key', {
  accessToken: async () => 'synthetic-anon-session',
  realtime: { transport: class { constructor() { throw Error('unexpected websocket') } } },
  global: { fetch: async (input, init) => {
    const request = new Request(input, init)
    calls.push(request)
    return fetch(request)
  } },
})
const backend = createNewsBackend(client)

test('native source capture reaches the existing eligible News backend and rendered card', async () => {
  const page = await backend.loadArticles({ limit: 30, offset: 0 })
  assert.equal(page.total, 1)
  assert.equal(page.articles.length, 1)
  const row = page.articles[0]
  assert.equal(row.id, expected.id)
  assert.equal(row.title, expected.title)
  assert.equal(row.feed, 'synthetic-feed-a')
  assert.equal(row.readerEnvelope?.sourceRecord.articleId, expected.id)
  assert.equal(row.readerEnvelope?.sourceRecord.sourceFeed, 'synthetic-feed-a')
  assert.equal(row.readerEnvelope?.sourceRecord.captureId, null)
  assert.equal(row.readerEnvelope?.sourceRecord.inputRevision, null)
  assert.equal(row.readerEnvelope?.membership.kind, 'unknown')
  assert.equal(row.readerEnvelope?.coverage.independentOrigins, null)
  assert.equal(row.readerEnvelope?.assessment.breaking, 'unassessed')
  assert.equal(row.readerEnvelope?.routes.newsArticleId, expected.id)
  assert.equal(row.readerEnvelope?.clocks.publication.kind, 'publisher_publication')
  assert.equal(new Date(row.readerEnvelope.clocks.publication.at).toISOString(), '2020-01-02T03:04:05.000Z')
  assert.equal(row.readerEnvelope?.clocks.fetched.kind, 'first_observed_in_public_article')
  assert.ok(new Date(row.readerEnvelope.clocks.fetched.at) > new Date('2020-01-02'))
  assert.equal(row.readerEnvelope?.clocks.event.at, null)
  assert.equal(expected.outlets_reporting, 2)
  assert.equal(expected.independent_origins, null)
  assert.equal(expected.capture_count, 4)
  assert.equal(expected.job_count, 4)
  assert.ok(calls.every(r => r.method === 'GET' && r.headers.get('apikey') === 'synthetic-browser-key'))
  assert.ok(calls.filter(r => new URL(r.url).pathname.endsWith('/articles')).every(
    r => new URL(r.url).searchParams.get('reader_state') === 'eq.eligible'))

  const detail = await backend.loadArticleDetail(expected.id)
  assert.equal(detail.id, expected.id)
  assert.equal(detail.readerEnvelope.routes.newsArticleId, expected.id)
  assert.deepEqual(detail.claims, [])
  assert.deepEqual(detail.evidenceRecords, [])
  assert.equal((await backend.loadArticleDetail(expected.hidden_id)).articleMissing, true)

  // Mount the existing NewsView with its real backend feed. Optional joins
  // are empty because the native slice creates no accepted event/graph state.
  const compiled = new URL('../../tests/.compiled/native-news-reader-view.mjs', import.meta.url)
  await mkdir(new URL('../../tests/.compiled/', import.meta.url), { recursive: true })
  await build({ entryPoints: [fileURLToPath(new URL('../../src/views/NewsView.jsx', import.meta.url))],
    outfile: fileURLToPath(compiled), bundle: true, platform: 'node', format: 'esm',
    packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'import.meta.env': '{}' } })
  const { default: NewsView } = await import(compiled.href)
  let feedLoaded
  const feedLoadedPromise = new Promise(resolve => { feedLoaded = resolve })
  const viewBackend = {
    ...backend,
    loadArticles: async filters => {
      const response = await backend.loadArticles(filters)
      feedLoaded()
      return response
    },
    loadOutletDirectory: async () => [],
    loadCorpusMeta: async () => ({ count: 1, latestFetchedAt: row.fetched_at }),
    loadArticleCitationMap: async () => new Map(),
    loadEventGrouping: async () => new Map(),
    loadOutletRegions: async () => new Map(),
    loadFilteredSourceMetricRows: async () => [],
    loadNewSinceCount: async () => 0,
  }
  let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(NewsView, {
    backend: viewBackend, variant: 'drawer',
  })) })
  await act(async () => { await feedLoadedPromise })
  try {
    assert.match(JSON.stringify(renderer.toJSON()), /Synthetic old storm record one/)
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Synthetic old storm record two/)
  } finally { await act(async () => renderer.unmount()) }
})

test('permission loss fails closed for feed and detail', async () => {
  const revoked = await fetch(base + '/test/revoke', { method: 'POST' })
  assert.equal(revoked.status, 200)
  assert.equal((await backend.loadArticles()).articlesUnavailable, 'permission_denied')
  assert.equal((await backend.loadArticleDetail(expected.id)).articlesUnavailable, 'permission_denied')
})
