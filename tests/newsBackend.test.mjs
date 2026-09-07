import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createNewsBackend } from '../src/lib/newsBackend.js'
import { newsBackendFixture } from './newsBackendFixture.mjs'

const id = '10000000-0000-4000-8000-000000000001'
const article = { id, title: 'Published article', url: 'https://example.invalid/one', reader_state: 'eligible', author_id: 'byline', outlet: 'Outlet A', published_at: '2026-08-03T10:00:00Z', fetched_at: '2026-08-03T12:00:00Z', claims: [] }

test('all News capabilities respect explicit null even with a configured global client', async () => {
  globalThis.__newsBackendEscapes = 0
  const out = await build({ stdin: { contents: "export {createNewsBackend} from './src/lib/newsBackend.js'", resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
    bundle: true, platform: 'node', format: 'esm', write: false,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://qikvmopbtijoebdqosyq.supabase.co', VITE_SUPABASE_ANON_KEY: 'fixture-key' }) },
    plugins: [{ name: 'global-spy', setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'fixture' }))
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=()=>({from(){globalThis.__newsBackendEscapes++;throw Error("global client escape")}})', loader: 'js' }))
    } }],
  })
  const module = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)
  const backend = module.createNewsBackend(null)
  assert.ok(Object.isFrozen(backend))
  assert.deepEqual(await backend.loadArticles({ supabaseClient: { from() { throw Error('override') } } }), { articles: [], total: 0, articlesUnavailable: null })
  assert.equal(await backend.loadArticleDetail(id), null)
  assert.equal(await backend.loadArticleTimelineKey(id), null)
  assert.equal(await backend.loadSkyVerification(id), null)
  assert.equal(await backend.loadNewSinceCount('2026-08-01'), null)
  for (const name of ['loadArticleCitationMap', 'loadEventGrouping', 'loadOutletRegions']) assert.deepEqual(await backend[name](), new Map())
  for (const name of ['loadOutletDirectory', 'loadArticleGraphLinks', 'loadArticleComparisonEvents']) assert.deepEqual(await backend[name](id), [])
  assert.deepEqual(await backend.loadFilteredSourceMetricRows({}), [])
  assert.deepEqual(await backend.loadCorpusMeta(), { count: null, latestFetchedAt: null })
  assert.equal(globalThis.__newsBackendEscapes, 0)
  delete globalThis.__newsBackendEscapes
})

test('feed and detail use the bound browser session, public bylines and reviewed provenance', async () => {
  const f = newsBackendFixture({ tables: { articles: [article, { ...article, id: 'pending', reader_state: 'pending_review', author_id: 'private' }], authors_public: [{ id: 'byline', name: 'Recorded byline' }],
    citations: [{ id: 'citation', article_id: id, cited_entity: 'Filed record', cited_type: 'court_doc', documentation_strength: 2 }],
    news_detail_public: [{ article_id: id, reviewed_claims: [{ surface_text: 'Reviewed claim', evidence_excerpt: 'Exact retained words', evidence_source_field: 'body_text', evidence_records: [{ evidence_type: 'record', evidence_url: 'https://example.invalid/evidence' }] }] }],
  } })
  assert.equal(f.calls.length, 0)
  const page = await f.backend.loadArticles({ limit: 1, offset: 0, supabaseClient: { from() { throw Error('override') } } })
  assert.equal(page.total, 1); assert.equal(page.articles[0].author_name, 'Recorded byline')
  assert.equal(page.articles[0].author_id, undefined)
  f.setToken('news-session-two'); const before = f.calls.length
  const detail = await f.backend.loadArticleDetail(id)
  assert.equal(detail.id, id); assert.equal(detail.claims[0].text, 'Reviewed claim')
  assert.equal(detail.claims[0].evidence_excerpt, 'Exact retained words')
  assert.equal(detail.citations[0].cited_entity, 'Filed record'); assert.equal(detail.evidenceRecords[0].evidence_url, 'https://example.invalid/evidence')
  assert.ok(f.calls.slice(before).every(c => c.request.headers.get('authorization') === 'Bearer news-session-two'))
  assert.ok(f.calls.every(c => c.request.headers.get('apikey') === 'fixture-browser-key' && c.request.method === 'GET'))
  assert.ok(f.calls.filter(c => c.table === 'articles').every(c => c.params.get('reader_state') === 'eq.eligible'))
  assert.ok(!f.calls.some(c => ['authors', 'article_claims', 'claim_evidence'].includes(c.table)))
  assert.equal((await f.backend.loadArticleDetail('pending')).articleMissing, true)
})

test('News pagination and source metrics retain filter contracts beyond the first page', async () => {
  const articles = Array.from({ length: 1002 }, (_, n) => ({ ...article, id: String(n).padStart(6, '0'), author_id: null, outlet: n === 1001 ? 'Outlet B' : 'Outlet A' }))
  const f = newsBackendFixture({ tables: { articles, outlets: [{ id: 'a', name: 'Outlet A', country: 'US' }, { id: 'b', name: 'Outlet B', country: 'CA' }] } })
  const page = await f.backend.loadArticles({ limit: 30, offset: 30 })
  assert.equal(page.total, 1002); assert.equal(page.articles[0].id, '000030'); assert.equal(page.articles.at(-1).id, '000059')
  const rows = await f.backend.loadFilteredSourceMetricRows({ outlet: 'Outlet A', publishedAfter: '2026-08-01', publishedBefore: '2026-08-31' })
  assert.equal(rows.length, 1002); assert.equal(rows.at(-1).outlet, 'Outlet B')
  const directory = await f.backend.loadOutletDirectory()
  assert.equal(directory.find(o => o.name === 'Outlet B').articleCount, 1)
  assert.equal(directory.find(o => o.name === 'Outlet B').country, 'CA')
  assert.equal(await f.backend.loadNewSinceCount('2026-08-03T11:00:00Z'), 1002)
  const metricCall = f.calls.find(c => c.params.get('select') === 'id,outlet,published_at')
  assert.equal(metricCall.params.get('outlet'), null)
  assert.equal(metricCall.params.get('published_at'), 'gte.2026-08-01')
})

test('article joins and location feature flag stay on the supplied client', async () => {
  const tables = { articles: [article], citations: [{ id: 'c', article_id: id, resolved_node_id: 'node', cited_type: 'court_doc' }], nodes: [{ id: 'node', label: 'Recorded event', type: 'event', slug: 'art-10000000' }],
    events: [{ id: 'event', canonical_title: 'Event' }], event_articles: [{ article_id: id, event_id: 'event' }],
    comparison_public: [{ event_key: 'event-key', canonical_title: 'Compared event', articles: [{ article_url: article.url }] }],
    pipeline_config: [{ key: 'location_corroboration', value: true }], sky_verifications: [{ article_id: id, id: 'location', captured_at: '2026-08-03' }],
  }
  const f = newsBackendFixture({ tables })
  assert.equal((await f.backend.loadArticleGraphLinks(id))[0].nodeId, 'node')
  assert.equal(await f.backend.loadArticleTimelineKey(id), '10000000')
  assert.equal((await f.backend.loadArticleComparisonEvents(id))[0].eventId, 'event-key')
  assert.equal((await f.backend.loadArticleCitationMap()).get(id).firstNodeId, 'node')
  assert.equal((await f.backend.loadEventGrouping()).get(id).title, 'Event')
  assert.equal((await f.backend.loadSkyVerification(id)).id, 'location')
  for (const value of [false, 'true', null]) {
    const gated = newsBackendFixture({ tables: { ...tables, pipeline_config: [{ key: 'location_corroboration', value }] } })
    assert.equal(await gated.backend.loadSkyVerification(id), null)
    assert.ok(!gated.calls.some(c => c.table === 'sky_verifications'))
  }
})

test('unavailable article access fails closed while unrelated optional joins remain separate', async () => {
  const f = newsBackendFixture({ errors: { articles: { code: '42501', message: 'permission denied' } } })
  assert.equal((await f.backend.loadArticles()).articlesUnavailable, 'permission_denied')
  assert.equal((await f.backend.loadArticleDetail(id)).articlesUnavailable, 'permission_denied')
  assert.deepEqual(await f.backend.loadFilteredSourceMetricRows(), [])
  assert.equal(await f.backend.loadNewSinceCount('2026-08-01'), null)
  const view = await readFile(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
  assert.match(view, /backend = mipBackend.publicData.news/)
  assert.doesNotMatch(view, /from '\.\.\/lib\/supabase'/)
  for (const method of Object.keys(createNewsBackend())) assert.ok(view.includes(`backend.${method}(`), method)
})
