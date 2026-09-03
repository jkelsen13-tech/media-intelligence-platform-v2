// Live V2 News Feed fail-close: missing public.edges and stub story_arcs
// (id-only, no title) must not throw into News. DISPLAY/query only — no
// invented edges, titles, published articles, or reader_state writes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  isPostgrestSchemaGap,
  isPostgrestPermissionDenied,
  articlesUnavailableReason,
  loadGraph,
  loadArcs,
  loadTimeline,
  loadArticles,
  loadArticleDetail,
  loadFilteredSourceMetricRows,
  loadCorpusMeta,
  loadNewSinceCount,
} from '../src/lib/supabase.js'

const SRC = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const GROUPED = readFileSync(new URL('../src/lib/arcGroupedTimeline.js', import.meta.url), 'utf8')

const MISSING_EDGES = {
  code: 'PGRST205',
  message: "Could not find the table 'public.edges' in the schema cache",
}
const MISSING_TITLE = {
  code: 'PGRST204',
  message: "Could not find the 'title' column of 'story_arcs' in the schema cache",
}
const MISSING_SLUG = {
  code: 'PGRST204',
  message: "Could not find the 'slug' column of 'story_arcs' in the schema cache",
}
const ARTICLES_PERMISSION_DENIED = {
  code: '42501',
  message: 'permission denied for table articles',
}
const ARTICLES_PGRST301 = {
  code: 'PGRST301',
  message: 'permission denied for table articles',
}
const ARTICLES_INSUFFICIENT = {
  message: 'insufficient privilege',
}
const ARTICLES_500 = {
  code: 'PGRST000',
  message: 'Internal Server Error',
}

const NASA_PENDING = Object.freeze({
  id: 'e5a84674-aaaa-bbbb-cccc-dddddddddddd',
  title: 'NASA Where & When',
  url: 'https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/',
  summary: null,
  published_at: null,
  outlet: null,
  monoculture: false,
  unattributed: false,
  arc_id: null,
  author_id: null,
  reader_state: 'pending_review',
  body_text: null,
})

const LIVE_NODE = Object.freeze({
  id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
  slug: 'evt-cleveland-eclipse-2024',
  label: 'Cleveland 2024 total solar eclipse',
  type: 'event',
  description: null,
  confidence: null,
  summary: null,
  occurred_at: '2024-04-08T17:59:00+00',
  arc_id: null,
  metadata: null,
})

function fakeClient(tables, { errors = {}, headErrors = {}, missingColsByTable = {} } = {}) {
  const selects = []
  return {
    selects,
    from(table) {
      selects.push(table)
      let rows = [...(tables[table] ?? [])]
      const state = { cols: '', range: null, limit: null, head: false }
      const q = {
        select: (cols, opts) => {
          state.cols = String(cols ?? '')
          state.head = Boolean(opts?.head)
          return q
        },
        eq: (c, v) => {
          rows = rows.filter((r) => r[c] === v)
          return q
        },
        in: (c, vs) => {
          const s = new Set(vs)
          rows = rows.filter((r) => s.has(r[c]))
          return q
        },
        not: () => q,
        or: () => q,
        gte: () => q,
        lte: () => q,
        gt: (c, v) => {
          rows = rows.filter((r) => String(r[c]) > String(v))
          return q
        },
        order: () => q,
        range: (f, t) => {
          state.range = [f, t]
          return q
        },
        limit: (n) => {
          state.limit = n
          return q
        },
        single: () => {
          state.single = true
          return q
        },
        maybeSingle: () => {
          state.maybeSingle = true
          return q
        },
        then: (resolve) => {
          if (state.head && headErrors[table]) {
            return resolve({ data: null, error: headErrors[table], count: 0 })
          }
          if (errors[table]) {
            return resolve({ data: null, error: errors[table], count: 0 })
          }
          const missing = missingColsByTable[table] ?? []
          if (missing.some((col) => state.cols.split(',').map((c) => c.trim()).includes(col))) {
            return resolve({
              data: null,
              error: {
                code: 'PGRST204',
                message: `Could not find the '${missing[0]}' column of '${table}' in the schema cache`,
              },
              count: 0,
            })
          }
          let r = rows
          if (state.range) r = r.slice(state.range[0], state.range[1] + 1)
          else if (state.limit != null) r = r.slice(0, state.limit)
          if (state.single) {
            return resolve({ data: r[0] ?? null, error: r[0] ? null : { message: 'not found' }, count: r.length })
          }
          if (state.maybeSingle) {
            return resolve({ data: r[0] ?? null, error: null, count: r.length })
          }
          resolve({ data: r, error: null, count: r.length })
        },
      }
      return q
    },
  }
}

test('isPostgrestSchemaGap detects schema-cache table/column misses, not other errors', () => {
  assert.equal(isPostgrestSchemaGap(MISSING_EDGES), true)
  assert.equal(isPostgrestSchemaGap(MISSING_TITLE), true)
  assert.equal(isPostgrestSchemaGap(MISSING_SLUG), true)
  assert.equal(isPostgrestSchemaGap({ code: '42703', message: 'column title does not exist' }), true)
  assert.equal(isPostgrestSchemaGap({ code: '42P01', message: 'relation "public.edges" does not exist' }), true)
  assert.equal(isPostgrestSchemaGap({ code: 'PGRST301', message: 'JWT expired' }), false)
  assert.equal(isPostgrestSchemaGap({ code: '42501', message: 'permission denied for table articles' }), false)
  assert.equal(isPostgrestSchemaGap({ message: 'TypeError: Failed to fetch' }), false)
  assert.equal(isPostgrestSchemaGap(null), false)
})

test('isPostgrestPermissionDenied detects 42501 / PGRST301 / permission-denied, not schema gaps or 500s', () => {
  assert.equal(isPostgrestPermissionDenied(ARTICLES_PERMISSION_DENIED), true)
  assert.equal(isPostgrestPermissionDenied(ARTICLES_PGRST301), true)
  assert.equal(isPostgrestPermissionDenied({ code: 'PGRST301', message: 'JWT expired' }), true)
  assert.equal(isPostgrestPermissionDenied(ARTICLES_INSUFFICIENT), true)
  assert.equal(isPostgrestPermissionDenied({ message: 'permission denied for table articles' }), true)
  assert.equal(isPostgrestPermissionDenied(MISSING_EDGES), false)
  assert.equal(isPostgrestPermissionDenied(MISSING_TITLE), false)
  assert.equal(isPostgrestPermissionDenied(ARTICLES_500), false)
  assert.equal(isPostgrestPermissionDenied({ message: 'TypeError: Failed to fetch' }), false)
  assert.equal(isPostgrestPermissionDenied(null), false)
  assert.equal(articlesUnavailableReason(ARTICLES_PERMISSION_DENIED), 'permission_denied')
  assert.equal(articlesUnavailableReason(ARTICLES_500), null)
})

test('loadGraph: missing public.edges does not throw; empty edges + unavailable flag', async () => {
  const client = fakeClient(
    { nodes: [LIVE_NODE], edges: [] },
    { errors: { edges: MISSING_EDGES } },
  )
  const graph = await loadGraph({ supabaseClient: client })
  assert.equal(graph.source, 'supabase')
  assert.equal(graph.nodes.length, 1)
  assert.equal(graph.nodes[0].id, LIVE_NODE.id)
  assert.deepEqual(graph.edges, [])
  assert.match(graph.edgesUnavailable, /public\.edges|schema cache/)
  assert.doesNotMatch(JSON.stringify(graph), /Fort Campbell|Port Meridian|demoEdges/)
})

test('loadGraph: missing edges with empty nodes is still supabase empty, not demo', async () => {
  const client = fakeClient(
    { nodes: [], edges: [] },
    { errors: { edges: MISSING_EDGES } },
  )
  const graph = await loadGraph({ supabaseClient: client })
  assert.equal(graph.source, 'supabase')
  assert.deepEqual(graph.nodes, [])
  assert.deepEqual(graph.edges, [])
  assert.match(graph.edgesUnavailable, /public\.edges|schema cache/)
})

test('loadArcs: extra story_arcs columns missing returns empty/unavailable, does not throw', async () => {
  const client = fakeClient(
    { story_arcs: [{ id: 'stub-1' }], arc_events: [], arc_milestones_public: [] },
    { missingColsByTable: { story_arcs: ['slug', 'category', 'title'] } },
  )
  const result = await loadArcs({ supabaseClient: client })
  assert.deepEqual(result.arcs, [])
  assert.match(result.arcsUnavailable, /slug|schema cache|column/)
})

test('loadArcs: id-only stub rows are treated as no-arc', async () => {
  const client = fakeClient({
    story_arcs: [{ id: 'stub-only' }],
    arc_events: [],
    arc_milestones_public: [],
  })
  const result = await loadArcs({ supabaseClient: client })
  assert.deepEqual(result.arcs, [])
  assert.match(result.arcsUnavailable, /id-only stub|no-arc/)
})

test('loadTimeline: missing edges does not throw', async () => {
  const client = fakeClient(
    { nodes: [LIVE_NODE], edges: [], articles: [], story_arcs: [{ id: 'stub-1' }] },
    { errors: { edges: MISSING_EDGES } },
  )
  const out = await loadTimeline({ supabaseClient: client })
  assert.deepEqual(out.relationEdges, [])
  assert.match(out.edgesUnavailable, /public\.edges|schema cache/)
  assert.equal(out.arcTitles.get('stub-1'), undefined)
})

test('loadArticles: story_arcs.title is not selected; pending_review stays empty', async () => {
  const selects = []
  const client = fakeClient({ articles: [NASA_PENDING] })
  const origFrom = client.from.bind(client)
  client.from = (table) => {
    const q = origFrom(table)
    const origSelect = q.select
    q.select = (cols, opts) => {
      selects.push({ table, cols: String(cols) })
      return origSelect(cols, opts)
    }
    return q
  }
  const { articles, total } = await loadArticles({ supabaseClient: client })
  assert.equal(articles.length, 0)
  assert.equal(total, 0)
  const articleSelect = selects.find((s) => s.table === 'articles')
  assert.ok(articleSelect, 'articles select ran')
  assert.doesNotMatch(articleSelect.cols, /story_arcs/)
  assert.doesNotMatch(articleSelect.cols, /\btitle\b.*story_arcs|story_arcs!/)
  assert.equal(articles.every((a) => a.arc_title == null), true)
})

test('loadArticleDetail: does not join story_arcs; arc_title stays null', async () => {
  const eligible = { ...NASA_PENDING, reader_state: 'eligible' }
  const client = fakeClient({
    articles: [eligible],
    citations: [],
    news_detail_public: [],
  })
  const detail = await loadArticleDetail(eligible.id, { supabaseClient: client })
  assert.equal(detail.arc_title, null)
  assert.equal(detail.id, eligible.id)
})

test('loadArticles: 42501 permission denied fail-closes to empty + permission_denied', async () => {
  const client = fakeClient(
    { articles: [NASA_PENDING] },
    { errors: { articles: ARTICLES_PERMISSION_DENIED } },
  )
  const result = await loadArticles({ supabaseClient: client })
  assert.deepEqual(result.articles, [])
  assert.equal(result.total, 0)
  assert.equal(result.articlesUnavailable, 'permission_denied')
  assert.doesNotMatch(JSON.stringify(result), /NASA Where|e5a84674/)
})

test('loadArticles: PGRST301 and permission-denied message fail-close the same way', async () => {
  for (const err of [ARTICLES_PGRST301, ARTICLES_INSUFFICIENT]) {
    const result = await loadArticles({
      supabaseClient: fakeClient({ articles: [NASA_PENDING] }, { errors: { articles: err } }),
    })
    assert.deepEqual(result.articles, [])
    assert.equal(result.total, 0)
    assert.equal(result.articlesUnavailable, 'permission_denied')
  }
})

test('loadArticles: unrelated 500 still throws', async () => {
  await assert.rejects(
    () => loadArticles({
      supabaseClient: fakeClient({ articles: [] }, { errors: { articles: ARTICLES_500 } }),
    }),
    (err) => err === ARTICLES_500,
  )
})

test('loadArticleDetail: permission denied fail-closes; does not invent a row', async () => {
  const eligible = { ...NASA_PENDING, reader_state: 'eligible' }
  const detail = await loadArticleDetail(eligible.id, {
    supabaseClient: fakeClient(
      { articles: [eligible], citations: [], news_detail_public: [] },
      { errors: { articles: ARTICLES_PERMISSION_DENIED } },
    ),
  })
  assert.equal(detail.articlesUnavailable, 'permission_denied')
  assert.equal(detail.id, undefined)
  assert.equal(detail.title, undefined)
})

test('loadFilteredSourceMetricRows / loadCorpusMeta: permission denied is empty, 500 throws', async () => {
  const denied = fakeClient(
    { articles: [NASA_PENDING] },
    { errors: { articles: ARTICLES_PERMISSION_DENIED } },
  )
  assert.deepEqual(await loadFilteredSourceMetricRows({}, { supabaseClient: denied }), [])
  assert.deepEqual(await loadCorpusMeta({ supabaseClient: denied }), { count: null, latestFetchedAt: null })

  const boom = fakeClient({ articles: [] }, { errors: { articles: ARTICLES_500 } })
  await assert.rejects(() => loadFilteredSourceMetricRows({}, { supabaseClient: boom }), (err) => err === ARTICLES_500)
  await assert.rejects(() => loadCorpusMeta({ supabaseClient: boom }), (err) => err === ARTICLES_500)
})

test('loadCorpusMeta / loadNewSinceCount: empty HEAD error + 42501 row probe fail-closes', async () => {
  const client = fakeClient(
    { articles: [NASA_PENDING] },
    {
      headErrors: { articles: { message: '' } },
      errors: { articles: ARTICLES_PERMISSION_DENIED },
    },
  )
  assert.deepEqual(await loadCorpusMeta({ supabaseClient: client }), { count: null, latestFetchedAt: null })
  assert.equal(await loadNewSinceCount('2026-01-01T00:00:00Z', { supabaseClient: client }), null)
})

test('loadCorpusMeta: empty HEAD error + 500 row probe still throws', async () => {
  const client = fakeClient(
    { articles: [] },
    {
      headErrors: { articles: { message: '' } },
      errors: { articles: ARTICLES_500 },
    },
  )
  await assert.rejects(() => loadCorpusMeta({ supabaseClient: client }), (err) => err === ARTICLES_500)
})

test('browser selects never ask story_arcs.title and never join the title embed', () => {
  assert.doesNotMatch(SRC, /story_arcs!articles_arc_id_fkey/)
  assert.doesNotMatch(SRC, /keysetAll\([^)]*'story_arcs',\s*'[^']*title/)
  assert.doesNotMatch(GROUPED, /keysetAll\([^)]*'story_arcs',\s*'[^']*title/)
  assert.match(SRC, /arc_title: null/)
  assert.match(SRC, /STORY_ARCS_DISPLAY_COLS/)
  assert.doesNotMatch(STORY_ARCS_DISPLAY_FROM_SRC(), /\btitle\b/)
})

function STORY_ARCS_DISPLAY_FROM_SRC() {
  const match = SRC.match(/const STORY_ARCS_DISPLAY_COLS =\s*'([^']+)'/)
  assert.ok(match, 'STORY_ARCS_DISPLAY_COLS is defined')
  return match[1]
}

test('News empty while pending_review is honest: eligibility gate is unchanged', () => {
  assert.match(SRC, /query = query\.eq\('reader_state', 'eligible'\)/)
  assert.doesNotMatch(SRC, /\.update\([\s\S]*reader_state/)
  assert.doesNotMatch(SRC, /reader_state:\s*'eligible'/)
  assert.match(NEWS, /No articles match/)
  assert.match(NEWS, /Pending-review and withheld intake records remain retained/)
})

test('News paints permission-denied as an honest notice, not a red Failed to load articles', () => {
  assert.match(NEWS, /articlesUnavailable/)
  assert.match(NEWS, /public\.articles is unavailable/)
  assert.match(NEWS, /permission denied/)
  assert.match(NEWS, /0 articles; no rows are invented/)
  assert.match(NEWS, /!articlesUnavailable && articles\.length === 0/)
  assert.match(NEWS, /\{error && <div className="notice error">Failed to load articles: \{error\}<\/div>\}/)
  assert.match(NEWS, /className="notice">/)
})

test('App does not paint News red for missing edges; Graph reuses World View banner', () => {
  assert.match(APP, /loadGraph\(\)\.then\(setGraph\)/)
  assert.match(APP, /graph\?\.edgesUnavailable && view === 'graph'/)
  assert.match(APP, /public\.edges is unavailable/)
  assert.match(APP, /no relationships are invented/)
  assert.match(APP, /error && view === 'graph'/)
  assert.doesNotMatch(APP, /\{error && <div className="notice error">Failed to load graph/)
})
