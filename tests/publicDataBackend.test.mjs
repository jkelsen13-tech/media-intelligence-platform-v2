import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'

const articleId = '10000000-0000-4000-8000-000000000001'
const eventId = '20000000-0000-4000-8000-000000000001'
const pad = n => String(n).padStart(6, '0')

// Exercise the installed SDK, including headers and PostgREST query encoding.
// This transport emulates publication-filtered rows, not database RLS itself;
// the publication-gate integration suite separately checks actual SQL roles.
function fixture({ tables = {}, errors = {} } = {}) {
  const calls = []
  let token = 'fixture-session-one'
  const client = createClient('https://public-backend.example.invalid', 'fixture-browser-key', {
    accessToken: async () => token,
    // Node 20 has no native WebSocket. These HTTP reads must never open one.
    realtime: { transport: class { constructor() { throw new Error('unexpected realtime connection') } } },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url)
      const table = url.pathname.split('/').at(-1), params = url.searchParams
      calls.push({ table, params, method: request.method, headers: request.headers })
      if (errors[table]) return new Response(JSON.stringify(errors[table]), { status: 403, headers: { 'content-type': 'application/json' } })
      let rows = [...(tables[table] ?? [])]
      for (const [key, value] of params) {
        if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3))
        if (value.startsWith('gt.')) rows = rows.filter(row => String(row[key]) > value.slice(3))
        if (value.startsWith('gte.')) rows = rows.filter(row => String(row[key]) >= value.slice(4))
      }
      const count = rows.length
      const order = params.get('order')?.split(',') ?? []
      rows.sort((a, b) => {
        for (const field of order) {
          const [key, direction] = field.split('.')
          const result = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
          if (result) return direction === 'desc' ? -result : result
        }
        return 0
      })
      rows = rows.slice(0, Math.min(Number(params.get('limit') ?? 1000), 1000))
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(rows), {
        status: 200, headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${count}` },
      })
    } },
  })
  return { backend: createPublicDataBackend(client), calls, setToken: value => { token = value } }
}

test('explicitly unconfigured public backend cannot escape to a configured global client', async () => {
  let globalReads = 0
  globalThis.__mipPublicBackendTestClient = { from() { globalReads++; throw new Error('global client used') } }
  try {
    const compiled = await build({
      stdin: { contents: "export * from './src/lib/publicDataBackend.js'; export { loadGraph } from './src/lib/supabase.js'", resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
      bundle: true, format: 'esm', platform: 'node', write: false,
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://qikvmopbtijoebdqosyq.supabase.co', VITE_SUPABASE_ANON_KEY: 'fixture-only-key' }) },
      plugins: [{ name: 'configured-global-client', setup(b) {
        b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'fixture' }))
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient = () => globalThis.__mipPublicBackendTestClient', loader: 'js' }))
      } }],
    })
    const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
    for (const backend of [module.createPublicDataBackend(), module.createPublicDataBackend(null)]) {
      assert.ok(Object.isFrozen(backend))
      assert.equal((await backend.loadGraph()).source, 'demo')
      assert.equal(await backend.loadGraphCoverage(), null)
      assert.deepEqual(await backend.loadNodeLocations(), [])
      assert.equal(await backend.loadTopics(), null)
      assert.deepEqual(await backend.loadCorpusMeta(), { count: null, latestFetchedAt: null })
      assert.equal(await backend.loadInvestigationSurface(eventId), null)
      assert.equal(await backend.resolveEligibleArticleForNews({ url: 'https://example.invalid/story' }), null)
    }
    assert.equal(globalReads, 0)
    // Legacy callers that omit the override keep their existing global default.
    await assert.rejects(module.loadGraph(), /global client used/)
    assert.ok(globalReads > 0)
  } finally { delete globalThis.__mipPublicBackendTestClient }
})

test('shared public reads retain pagination, recorded provenance and live session headers', async () => {
  const nodes = Array.from({ length: 1002 }, (_, n) => ({ id: `n-${pad(n)}`, label: `Node ${n}`, type: 'event' }))
  const edges = Array.from({ length: 1002 }, (_, n) => ({ id: `e-${pad(n)}`, source_id: nodes[0].id, target_id: nodes[n].id, type: 'documented', signal_source: 'recorded', metadata: { reference: `source-${n}` } }))
  const mentions = nodes.map(n => ({ id: `m-${n.id}`, node_id: n.id, article_id: articleId, mention_text: 'Michigan', remaining_uncertainty: 'County not recorded', geographic_places: { canonical_name: 'Michigan', precision: 'admin1', latitude: null, longitude: null } }))
  const f = fixture({ tables: { nodes, edges, node_location_mentions: mentions, topics: [{ id: 'health', name: 'Health' }], node_topics: nodes.map(n => ({ node_id: n.id, topic_id: 'health' })) } })
  assert.equal(f.calls.length, 0)
  const graph = await f.backend.loadGraph()
  assert.equal(graph.source, 'supabase'); assert.equal(graph.nodes.at(-1).id, 'n-001001')
  assert.equal(graph.edges.at(-1).target, 'n-001001')
  assert.deepEqual(graph.edges.at(-1).metadata, { reference: 'source-1001' })
  assert.equal(graph.edges.at(-1).signal_source, 'recorded')
  assert.ok(f.calls.every(c => c.headers.get('authorization') === 'Bearer fixture-session-one'))
  f.setToken('fixture-session-two')
  const before = f.calls.length
  const [places, topics] = await Promise.all([f.backend.loadNodeLocations(), f.backend.loadTopics()])
  assert.equal(places.length, 1002); assert.equal(places.at(-1).node_id, 'n-001001')
  assert.equal(places.at(-1).place.latitude, null); assert.equal(places.at(-1).remaining_uncertainty, 'County not recorded')
  assert.equal(topics.nodeTopics.length, 1002); assert.equal(topics.nodeTopics.at(-1).node_id, 'n-001001')
  assert.ok(f.calls.slice(before).every(c => c.headers.get('authorization') === 'Bearer fixture-session-two'))
  assert.ok(f.calls.every(c => c.headers.get('apikey') === 'fixture-browser-key' && c.method === 'GET'))
})

test('corpus and URL joins exclude pending and withheld records; direct IDs remain navigation hints', async () => {
  const f = fixture({ tables: { articles: [
    { id: articleId, url: 'https://example.invalid/eligible', reader_state: 'eligible', fetched_at: '2026-08-03T10:00:00Z' },
    { id: 'pending', url: 'https://example.invalid/pending', reader_state: 'pending_review', fetched_at: '2026-09-01T10:00:00Z' },
    { id: 'withheld', url: 'https://example.invalid/withheld', reader_state: 'withheld', fetched_at: '2026-09-02T10:00:00Z' },
  ] } })
  assert.deepEqual(await f.backend.loadCorpusMeta(), { count: 1, latestFetchedAt: '2026-08-03T10:00:00Z' })
  assert.equal(await f.backend.resolveEligibleArticleForNews({ url: 'https://example.invalid/eligible' }), articleId)
  for (const state of ['pending', 'withheld']) assert.equal(await f.backend.resolveEligibleArticleForNews({ url: `https://example.invalid/${state}` }), null)
  assert.ok(f.calls.every(c => c.params.get('reader_state') === 'eq.eligible'))
  const before = f.calls.length
  assert.equal(await f.backend.resolveEligibleArticleForNews(articleId), articleId)
  assert.equal(f.calls.length, before)
})

test('coverage and investigation projections preserve unknown counts and exact canonical identity', async () => {
  const surface = { canonical_event_id: eventId, public_article_count: null, spatial_revision_id: 'saved-revision', auto_approval_enabled: false }
  const f = fixture({ tables: {
    investigation_surface_public: [surface, { canonical_event_id: 'other', public_article_count: 99 }],
    graph_coverage_public: [{ article_count: 3, articles_with_published_node: 0, articles_without_published_node: 3, pending_graph_candidate_count: 2, published_node_count: 0, documented_relationship_count: null }],
  } })
  assert.deepEqual(await f.backend.loadInvestigationSurface(eventId), surface)
  assert.equal(await f.backend.loadInvestigationSurface('missing'), null)
  assert.deepEqual(await f.backend.loadGraphCoverage(), { articleCount: 3, articlesWithPublishedNode: 0, articlesWithoutPublishedNode: 3, pendingGraphCandidates: 2, publishedNodeCount: 0, documentedRelationshipCount: null })
})

test('optional projection errors stay isolated, and a configured empty graph never becomes demo data', async () => {
  const denied = { code: '42501', message: 'permission denied' }
  const f = fixture({ errors: { graph_coverage_public: denied, node_location_mentions: denied, topics: denied, investigation_surface_public: denied, articles: denied, edges: denied } })
  const [graph, coverage, places, topics, surface, corpus, article] = await Promise.all([
    f.backend.loadGraph(), f.backend.loadGraphCoverage(), f.backend.loadNodeLocations(), f.backend.loadTopics(),
    f.backend.loadInvestigationSurface(eventId), f.backend.loadCorpusMeta(), f.backend.resolveEligibleArticleForNews({ url: 'https://example.invalid/hidden' }),
  ])
  assert.deepEqual(graph, { nodes: [], edges: [], source: 'supabase', edgesUnavailable: 'permission denied' })
  assert.equal(coverage, null); assert.deepEqual(places, []); assert.equal(topics, null); assert.equal(surface, null)
  assert.deepEqual(corpus, { count: null, latestFetchedAt: null }); assert.equal(article, null)
  const broken = fixture({ errors: { nodes: { code: 'XX000', message: 'unavailable' } } })
  await assert.rejects(broken.backend.loadGraph(), error => error.message === 'unavailable')
})

test('App uses the shared composition root for all seven public workspace reads', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const root = await readFile(new URL('../src/lib/mipBackend.js', import.meta.url), 'utf8')
  assert.match(root, /publicData: createPublicDataBackend\(supabase\)/)
  assert.match(root, /investigations: createInvestigationBackend\(supabase\)/)
  for (const method of Object.keys(createPublicDataBackend()).filter(key => typeof createPublicDataBackend()[key] === 'function')) assert.ok(app.includes(`mipBackend.publicData.${method}(`), method)
  assert.doesNotMatch(app, /import \{[^}]*\bloadGraph\b[^}]*\} from '\.\/lib\/supabase'/)
})
