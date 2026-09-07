import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createChronologyBackend } from '../src/lib/chronologyBackend.js'
import { newsBackendFixture } from './newsBackendFixture.mjs'

const arcId = 'arc-one'
const pad = n => String(n).padStart(6, '0')
const fixture = options => { const f = newsBackendFixture(options); return { ...f, backend: createChronologyBackend(f.client) } }

test('every chronology capability stays isolated from a configured global client', async () => {
  globalThis.__chronologyEscapes = 0
  try {
    const result = await build({ stdin: { contents: "export {createChronologyBackend} from './src/lib/chronologyBackend.js'", resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle: true, format: 'esm', platform: 'node', write: false,
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://qikvmopbtijoebdqosyq.supabase.co', VITE_SUPABASE_ANON_KEY: 'fixture-key' }) },
      plugins: [{ name: 'global-spy', setup(b) {
        b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'fixture' }))
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=()=>({from(){globalThis.__chronologyEscapes++;throw Error("global escape")}})', loader: 'js' }))
      } }],
    })
    const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
    const backend = module.createChronologyBackend(null)
    assert.ok(Object.isFrozen(backend))
    assert.ok((await backend.loadArcs()).arcs.length > 0) // existing offline demo contract
    assert.deepEqual(await backend.loadArcDetail('missing'), { milestones: [], events: [] })
    assert.deepEqual(await backend.loadArcArticles(arcId), [])
    assert.deepEqual(await backend.loadArcConnections(arcId), { edges: [], labels: new Map(), edgesUnavailable: null })
    assert.equal(await backend.loadArticleExcerpt('article'), null)
    assert.equal(await backend.loadTimelineGroupedBetaFlag(), false)
    assert.ok((await backend.loadTimeline()).events.length > 0)
    assert.ok((await backend.loadArcGroupedTimeline()).grouped.counts.total > 0)
    assert.equal(globalThis.__chronologyEscapes, 0)
  } finally { delete globalThis.__chronologyEscapes }
})

test('arc detail reads every event and public milestone beyond 1000 in chronological order', async () => {
  const events = Array.from({ length: 1002 }, (_, n) => ({ id: `e-${pad(n)}`, arc_id: arcId, title: `Event ${n}`, occurred_at: n === 1001 ? null : new Date(Date.UTC(2020, 0, 1002 - n)).toISOString() }))
  const milestones = Array.from({ length: 1003 }, (_, n) => ({ id: `m-${pad(n)}`, arc_id: arcId, title: `Milestone ${n}`, status: 'pending', updated_at: n === 1002 ? null : new Date(Date.UTC(2020, 0, 1003 - n)).toISOString() }))
  const f = fixture({ tables: { arc_events: [...events, { id: 'other', arc_id: 'other' }], arc_milestones_public: [...milestones, { id: 'other', arc_id: 'other' }] } })
  assert.equal(f.calls.length, 0)
  const detail = await f.backend.loadArcDetail(arcId)
  assert.equal(detail.events.length, 1002); assert.equal(detail.milestones.length, 1003)
  assert.equal(detail.events[0].id, 'e-001000'); assert.equal(detail.events.at(-1).id, 'e-001001')
  assert.equal(detail.milestones[0].id, 'm-001001'); assert.equal(detail.milestones.at(-1).id, 'm-001002')
  assert.ok(f.calls.every(c => c.params.get('arc_id') === 'eq.arc-one'))
  assert.equal(f.calls.filter(c => c.params.has('id')).length, 2)
  assert.ok(!f.calls.some(c => c.table === 'arc_milestones'))
  f.setToken('new-session'); const before = f.calls.length
  await f.backend.loadArcDetail(arcId)
  assert.ok(f.calls.slice(before).every(c => c.request.headers.get('authorization') === 'Bearer new-session'))
  assert.ok(f.calls.every(c => c.request.headers.get('apikey') === 'fixture-browser-key'))
})

test('a failed later arc page rejects instead of reporting partial evidence as complete', async () => {
  const f = fixture({ tables: { arc_events: Array.from({ length: 1000 }, (_, n) => ({ id: pad(n), arc_id: arcId })) },
    errors: { arc_events: params => params.has('id') ? { code: '42501', message: 'later page unavailable' } : null },
  })
  await assert.rejects(f.backend.loadArcDetail(arcId), e => e.message === 'later page unavailable')
})

test('flat and grouped chronology preserve event versus reporting-record identities and edge meaning', async () => {
  const f = fixture({ tables: {
    story_arcs: [{ id: arcId, slug: 'arc-one', category: 'public_health', started_at: '2026-08-01', summary: 'Recorded arc' }],
    nodes: [{ id: 'event-a', slug: 'evt-11111111', label: 'Event A', type: 'event', arc_id: arcId, occurred_at: '2026-08-01' }, { id: 'event-b', slug: 'evt-22222222', label: 'Event B', type: 'event', arc_id: arcId, occurred_at: '2026-08-02' }],
    articles: [{ id: 'article-one', arc_id: arcId, title: 'Publisher report', published_at: '2026-08-03', summary: 'Retained summary', outlet: 'Recorded outlet' }],
    edges: [{ id: 'edge', source_id: 'event-a', target_id: 'event-b', type: 'sequence', doc_strength: 3 }],
    pipeline_config: [{ key: 'timeline_grouped_beta', value: true }],
  } })
  const flat = await f.backend.loadTimeline(), grouped = await f.backend.loadArcGroupedTimeline()
  assert.equal(flat.events.length, 2); assert.equal(flat.articleRecords.length, 1)
  assert.equal(grouped.grouped.counts.graphEvents, 2); assert.equal(grouped.grouped.counts.newsRecords, 1)
  const report = grouped.grouped.sections[0].events.find(e => e.record_kind === 'article_record')
  assert.equal(report.article_id, 'article-one'); assert.equal(report.occurred_at, '2026-08-03')
  for (const data of [flat, grouped]) { assert.equal(data.relationEdges[0].type, 'sequence'); assert.equal(data.relationEdges[0].doc_strength, 3) }
  assert.equal((await f.backend.loadArcArticles(arcId))[0].id, 'article-one')
  assert.equal((await f.backend.loadArticleExcerpt('article-one')).summary, 'Retained summary')
  assert.equal((await f.backend.loadArcs()).arcs[0].id, arcId)
  const connections = await f.backend.loadArcConnections(arcId)
  assert.equal(connections.labels.get('event-b'), 'Event B'); assert.equal(connections.edges[0].type, 'sequence')
  assert.equal(await f.backend.loadTimelineGroupedBetaFlag(), true)
  assert.equal(f.calls.filter(c => c.table === 'pipeline_config').length, 1)
})

test('configured empty and unavailable chronology never silently becomes demo content', async () => {
  const f = fixture({ errors: { edges: { code: '42501', message: 'edges unavailable' } } })
  assert.deepEqual((await f.backend.loadArcs()).arcs, [])
  const flat = await f.backend.loadTimeline(), grouped = await f.backend.loadArcGroupedTimeline()
  assert.deepEqual(flat.events, []); assert.equal(grouped.grouped.counts.total, 0)
  assert.equal(flat.edgesUnavailable, 'edges unavailable'); assert.equal(grouped.edgesUnavailable, 'edges unavailable')
  for (const value of [false, 'true', null]) {
    const off = fixture({ tables: { pipeline_config: [{ key: 'timeline_grouped_beta', value }] } })
    assert.equal(await off.backend.loadTimelineGroupedBetaFlag(), false)
  }
})

test('all chronology views use the shared interface including grouped and excerpt children', async () => {
  for (const name of ['TimelineView', 'GroupedTimelineView', 'ArcsView']) {
    const src = await readFile(new URL(`../src/views/${name}.jsx`, import.meta.url), 'utf8')
    assert.match(src, /backend = mipBackend.publicData.chronology/)
    assert.doesNotMatch(src, /from '\.\.\/lib\/supabase'/)
    if (name === 'GroupedTimelineView') assert.match(src, /backend.loadArcGroupedTimeline\(\)/)
    else assert.match(src, /loadArticle=\{backend.loadArticleExcerpt\}/)
    if (name === 'TimelineView') assert.match(src, /<GroupedTimelineView\s+backend=\{backend\}/)
  }
})
