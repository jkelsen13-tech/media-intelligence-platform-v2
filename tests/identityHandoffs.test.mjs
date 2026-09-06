// Step-one consolidation follow-up: comparison→News identity and World View
// subject preservation. DISPLAY / client only. No private tables, no
// publication-policy change, no invented Cleveland subject.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

import { loadSourceComparisonView, newsNavigationFromComparisonSurface } from '../src/lib/sourceComparisonReadPath.js'
import {
  isComparisonArticleKey,
  isDirectNewsArticleId,
  loadArticleComparisonEvents,
  loadArticleDetail,
  resolveEligibleArticleForNews,
} from '../src/lib/supabase.js'
import {
  applySubject,
  emptyInvestigationContext,
  mayCommitWorldViewProjection,
  releasedGeographyUnavailableCopy,
  shouldAutoSelectWorldView,
  subjectFromNamedTarget,
  subjectFromWorldViewSelection,
  worldViewSelectionForMatch,
} from '../src/lib/investigationContext.js'
import { autoSelectRow, rowsMatchingSelection, selectionStubFromProjection } from '../src/lib/spatialProjection.js'
import { CLEVELAND_CANONICAL_EVENT_ID } from '../src/lib/temporalAssessment.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const COMPARE = readFileSync(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')
const READ_PATH = readFileSync(new URL('../src/lib/sourceComparisonReadPath.js', import.meta.url), 'utf8')
const NEWS_LOADERS = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')

const ELIGIBLE_ID = '11111111-1111-4111-8111-111111111111'
const PENDING_ID = '22222222-2222-4222-8222-222222222222'
const ARTICLE_KEY = createHash('md5').update(ELIGIBLE_ID).digest('hex')
const ARTICLE_URL = 'https://publisher.example/eligible-eclipse-sidebar'
const PENDING_URL = 'https://publisher.example/pending-review'

const ELIGIBLE = Object.freeze({
  id: ELIGIBLE_ID,
  title: 'Eligible comparison member',
  url: ARTICLE_URL,
  summary: 'Public eligible record',
  published_at: '2026-04-08T12:00:00Z',
  outlet: 'Outlet A',
  claims: [],
  monoculture: false,
  unattributed: false,
  author_id: null,
  reader_state: 'eligible',
})

const PENDING = Object.freeze({
  id: PENDING_ID,
  title: 'Pending review member',
  url: PENDING_URL,
  summary: null,
  published_at: null,
  outlet: 'Outlet B',
  claims: [],
  monoculture: false,
  unattributed: false,
  author_id: null,
  reader_state: 'pending_review',
})

const CLEVELAND_ROW = Object.freeze({
  mip_object_id: '777b3951-4a82-4dd7-befb-958991b1318f',
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID,
  spatial_role: 'event',
  parent_event_id: null,
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
  release_state: 'released',
})

function fakeClient(tables, { errors = {} } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      let rows = [...(tables[table] ?? [])]
      const state = { range: null, single: false, maybeSingle: false }
      const q = {
        select: (cols) => {
          call.columns = String(cols ?? '')
          return q
        },
        eq: (column, value) => {
          call.filters.push({ column, value })
          rows = rows.filter((row) => row[column] === value)
          return q
        },
        in: () => q,
        not: () => q,
        or: () => q,
        gte: () => q,
        lte: () => q,
        gt: () => q,
        order: (column, { ascending = true } = {}) => {
          call.order = column
          rows = [...rows].sort((a, b) => {
            const left = String(a[column] ?? '')
            const right = String(b[column] ?? '')
            return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1)
          })
          return q
        },
        range: (from, to) => {
          state.range = [from, to]
          return q
        },
        limit: (n) => {
          rows = rows.slice(0, n)
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
          if (errors[table]) return resolve({ data: null, error: errors[table] })
          let result = rows
          if (state.range) result = result.slice(state.range[0], state.range[1] + 1)
          if (state.single) {
            return resolve({
              data: result[0] ?? null,
              error: result[0] ? null : { code: 'PGRST116', message: 'not found' },
            })
          }
          if (state.maybeSingle) return resolve({ data: result[0] ?? null, error: null })
          resolve({ data: result, error: null })
        },
      }
      return q
    },
  }
}

function comparisonRow() {
  return {
    event_key: 'event-compare-1',
    canonical_title: 'Comparison event',
    occurred_at_start: '2026-04-08',
    occurred_at_end: null,
    articles: [
      {
        article_key: ARTICLE_KEY,
        outlet: 'Outlet A',
        article_url: ARTICLE_URL,
        published_at: '2026-04-08T12:00:00Z',
        has_extracted_claim: true,
      },
      {
        article_key: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        outlet: 'Outlet B',
        article_url: 'https://publisher.example/other',
        published_at: '2026-04-08T13:00:00Z',
        has_extracted_claim: true,
      },
    ],
    claims: [
      {
        claim_key: 'claim-1',
        canonical_text: 'A shared fact',
        thin_extraction: false,
        evidence_links: [],
        corrections: [],
        surfaces: [
          {
            article_key: ARTICLE_KEY,
            surface_text: 'Outlet A framing',
            loaded_language: [],
            explanation: null,
          },
        ],
      },
    ],
  }
}

function articleIc(id = ELIGIBLE_ID) {
  return applySubject(emptyInvestigationContext('news'), subjectFromNamedTarget({ type: 'article', id }))
}

function clevelandIc() {
  return applySubject(
    emptyInvestigationContext('world'),
    subjectFromWorldViewSelection({
      node: selectionStubFromProjection(CLEVELAND_ROW),
      row: CLEVELAND_ROW,
    }),
  )
}

test('repro: comparison cards still expose the hashed article_key, not the public article id', async () => {
  assert.equal(ARTICLE_KEY, createHash('md5').update(ELIGIBLE_ID).digest('hex'))
  assert.notEqual(ARTICLE_KEY, ELIGIBLE_ID)
  assert.equal(isComparisonArticleKey(ARTICLE_KEY), true)
  assert.equal(isDirectNewsArticleId(ARTICLE_KEY), false)
  assert.equal(isDirectNewsArticleId(ELIGIBLE_ID), true)

  const db = fakeClient({ comparison_public: [comparisonRow()] })
  const view = await loadSourceComparisonView({ supabaseClient: db })
  const surface = view.events[0].claims[0].surfaces[0]
  assert.equal(surface.articleId, ARTICLE_KEY)
  assert.equal(surface.url, ARTICLE_URL)
  assert.notEqual(surface.articleId, ELIGIBLE_ID)
  assert.deepEqual([...new Set(db.calls.map((call) => call.table))], ['comparison_public'])
})

test('repro: loadArticleDetail still miss-closes when handed the opaque comparison key', async () => {
  const db = fakeClient({
    articles: [ELIGIBLE],
    citations: [],
    news_detail_public: [{ article_id: ELIGIBLE_ID, reviewed_claims: [] }],
  })
  const miss = await loadArticleDetail(ARTICLE_KEY, { supabaseClient: db })
  assert.equal(miss.articleMissing, true)
  assert.equal(miss.id, undefined)
  assert.doesNotMatch(JSON.stringify(miss), /Eligible comparison member/)

  const hit = await loadArticleDetail(ELIGIBLE_ID, { supabaseClient: db })
  assert.equal(hit.id, ELIGIBLE_ID)
  assert.equal(hit.title, ELIGIBLE.title)
  assert.equal(hit.articleMissing, undefined)
})

test('comparison-to-news navigation resolves through the eligible public article URL', async () => {
  const db = fakeClient({
    comparison_public: [comparisonRow()],
    articles: [ELIGIBLE, PENDING],
    citations: [],
    news_detail_public: [{ article_id: ELIGIBLE_ID, reviewed_claims: [] }],
  })
  const view = await loadSourceComparisonView({ supabaseClient: db })
  const surface = view.events[0].claims[0].surfaces[0]
  const nav = newsNavigationFromComparisonSurface(surface)
  assert.deepEqual(nav, { articleKey: ARTICLE_KEY, url: ARTICLE_URL })
  assert.equal(nav.articleKey, ARTICLE_KEY)
  assert.notEqual(nav.articleKey, ELIGIBLE_ID)

  const resolved = await resolveEligibleArticleForNews(nav, { supabaseClient: db })
  assert.equal(resolved, ELIGIBLE_ID)
  assert.equal(db.calls.some((call) => call.table === 'articles' && call.filters.some((f) => f.column === 'url' && f.value === ARTICLE_URL)), true)
  assert.equal(db.calls.some((call) => call.table === 'articles' && call.filters.some((f) => f.column === 'reader_state' && f.value === 'eligible')), true)
  assert.equal(db.calls.some((call) => ['event_articles', 'article_claims', 'claims', 'events'].includes(call.table)), false)

  const detail = await loadArticleDetail(resolved, { supabaseClient: db })
  assert.equal(detail.id, ELIGIBLE_ID)
  assert.equal(detail.articleMissing, undefined)
})

test('resolver preserves direct News ids and withholds pending-review / hash-only targets', async () => {
  assert.equal(await resolveEligibleArticleForNews(ELIGIBLE_ID, { supabaseClient: null }), ELIGIBLE_ID)
  const db = fakeClient({ articles: [ELIGIBLE, PENDING] })
  assert.equal(await resolveEligibleArticleForNews(ELIGIBLE_ID, { supabaseClient: db }), ELIGIBLE_ID)
  assert.equal(await resolveEligibleArticleForNews(ARTICLE_KEY, { supabaseClient: db }), null)
  assert.equal(
    await resolveEligibleArticleForNews({ articleKey: ARTICLE_KEY, url: PENDING_URL }, { supabaseClient: db }),
    null,
  )
  assert.equal(
    await resolveEligibleArticleForNews({ articleKey: ARTICLE_KEY, url: ARTICLE_URL }, { supabaseClient: db }),
    ELIGIBLE_ID,
  )
  assert.equal(await resolveEligibleArticleForNews({ articleKey: ARTICLE_KEY }, { supabaseClient: db }), null)
  assert.deepEqual([...new Set(db.calls.map((call) => call.table))], ['articles'])
})

test('return navigation still joins the eligible article URL back to comparison_public', async () => {
  const db = fakeClient({
    articles: [ELIGIBLE],
    comparison_public: [comparisonRow()],
  })
  const matches = await loadArticleComparisonEvents(ELIGIBLE_ID, { supabaseClient: db })
  assert.deepEqual(matches, [{ eventId: 'event-compare-1', title: 'Comparison event' }])
  assert.deepEqual(db.calls.map((call) => call.table), ['articles', 'comparison_public'])
})

test('Source Comparison and App resolve Open in News instead of passing the hash to loadArticleDetail', () => {
  assert.match(COMPARE, /newsNavigationFromComparisonSurface\(surface\)/)
  assert.doesNotMatch(COMPARE, /onOpenArticle\(surface\.articleId\)/)
  assert.match(APP, /resolveEligibleArticleForNews/)
  assert.match(APP, /openArticleInNews/)
  const openStart = APP.indexOf('const openArticleInNews = useCallback')
  const openBody = APP.slice(openStart, APP.indexOf('}, [resetJumpContext', openStart) + 8)
  assert.match(openBody, /resolveEligibleArticleForNews\(target\)/)
  assert.doesNotMatch(READ_PATH, /from\('articles'\)/)
  assert.doesNotMatch(READ_PATH, /from\('event_articles'\)/)
  assert.match(NEWS_LOADERS, /eq\('url', url\)/)
  assert.match(NEWS_LOADERS, /eq\('reader_state', 'eligible'\)/)
})

test('automatic World View selection does not overwrite an established investigation', () => {
  const article = articleIc()
  assert.equal(article.canonical_subject_id, ELIGIBLE_ID)
  assert.equal(article.canonical_subject_type, 'article')
  assert.equal(shouldAutoSelectWorldView({ selected: null, investigationContext: article }), false)
  assert.equal(mayCommitWorldViewProjection({ investigationContext: article, row: CLEVELAND_ROW }), false)

  const match = worldViewSelectionForMatch(null, article)
  assert.equal(match.id, ELIGIBLE_ID)
  assert.equal(match.fromInvestigationContext, true)
  assert.deepEqual(rowsMatchingSelection([CLEVELAND_ROW], match), [])
  assert.match(releasedGeographyUnavailableCopy(), /Released geography is unavailable/)
  assert.match(releasedGeographyUnavailableCopy(), /selected subject is preserved/)
})

test('existing initial World View auto-select still fires only for an empty investigation', () => {
  const empty = emptyInvestigationContext('world')
  assert.equal(empty.canonical_subject_id, null)
  assert.equal(shouldAutoSelectWorldView({ selected: null, investigationContext: empty }), true)
  assert.equal(shouldAutoSelectWorldView({ selected: { id: CLEVELAND_CANONICAL_EVENT_ID }, investigationContext: empty }), false)
  assert.equal(autoSelectRow([CLEVELAND_ROW])?.subject_graph_node_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(mayCommitWorldViewProjection({ investigationContext: empty, row: CLEVELAND_ROW }), true)

  const cleveland = clevelandIc()
  assert.equal(cleveland.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(shouldAutoSelectWorldView({ selected: null, investigationContext: cleveland }), false)
  assert.equal(mayCommitWorldViewProjection({ investigationContext: cleveland, row: CLEVELAND_ROW }), true)
  const leftoverCleveland = selectionStubFromProjection(CLEVELAND_ROW)
  assert.equal(worldViewSelectionForMatch(leftoverCleveland, cleveland).mip_object_id, CLEVELAND_ROW.mip_object_id)
  assert.equal(worldViewSelectionForMatch(leftoverCleveland, articleIc()).id, ELIGIBLE_ID)
})

test('World View source preserves IC, shows unavailable geography, and keeps map-pick / Cleveland wiring', () => {
  assert.match(WORLD, /shouldAutoSelectWorldView/)
  assert.match(WORLD, /mayCommitWorldViewProjection/)
  assert.match(WORLD, /worldViewSelectionForMatch/)
  assert.match(WORLD, /releasedGeographyUnavailableCopy/)
  assert.match(WORLD, /data-geography-unavailable/)
  assert.match(WORLD, /onSelectProjection\(node \?\? selectionStubFromProjection\(row\), row\)/)
  assert.match(APP, /handleSelectProjection[\s\S]*commitNewSubjectFromApp/)
  assert.match(WORLD, /worldViewSelectionForMatch\(selected, investigationContext\)/)
  const effectStart = WORLD.indexOf('if (!didAutoSelect.current)')
  const effectBody = WORLD.slice(effectStart, effectStart + 520)
  assert.match(effectBody, /shouldAutoSelectWorldView/)
  assert.doesNotMatch(effectBody, /if \(!selected\) onSelectProjection/)
})
