// Track B Step 3 item 4 — Screen 5 (Timeline) model pins + static drift
// guards. Criteria: verifier/trackb3-v4/trackb3-step3-item4.md.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  SCREEN5_EYEBROW,
  SCREEN5_SUBTITLE,
  SCREEN5_BANNER,
  TIMELINE_CLOSING_FOOTNOTE,
  ALL_EVENTS_SCOPE,
  defaultArcSlug,
  normalizeArcEvent,
  normalizeArticleTimelineRecord,
  normalizeNodeEvent,
  sortTimelineEntries,
  deriveDateOptions,
  deriveTypeOptions,
  entryMatchesFilters,
  footerCounts,
  monthLabel,
} from '../src/lib/timelineScreenModel.js'
import { TIMELINE_CLOSING_FOOTNOTE as ENGINE_FOOTNOTE } from '../src/lib/timelineEngine.js'
import { buildConnectors } from '../src/lib/timelineEngine.js'
import { remapTimelineEdges } from '../src/lib/timelineDedup.js'
import { confidenceToBadgeState, typePillLabel } from '../src/lib/epistemicModel.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(join(here, '..', p), 'utf8')

// --- A4.1: verbatim locked copy ------------------------------------------------

test('Screen 5 eyebrow, subtitle, banner are the verbatim locked copy', () => {
  assert.equal(SCREEN5_EYEBROW, 'POLICY CHANGE OVER TIME')
  assert.equal(
    SCREEN5_SUBTITLE,
    'Legislation, rulings, incidents, and reporting in one auditable sequence.',
  )
  assert.equal(SCREEN5_BANNER, 'Missing evidence is recorded, not treated as contradiction.')
})

test('closing footnote is the item-3 constant, re-exported — never re-typed', () => {
  assert.equal(TIMELINE_CLOSING_FOOTNOTE, ENGINE_FOOTNOTE)
  const view = src('src/views/TimelineView.jsx')
  assert.ok(!view.includes('Chronology is shown as sequence.'), 'view must consume the constant')
  const timeline = src('src/components/ArcTimeline.jsx')
  assert.ok(!timeline.includes('Chronology is shown as sequence.'), 'renderer must consume the constant')
})

// --- A4.2: default arc selection -------------------------------------------------

test('defaultArcSlug: first active arc, else first arc, else null', () => {
  const arcs = [
    { slug: 'old', derived_status: 'dormant' },
    { slug: 'hot', derived_status: 'active' },
    { slug: 'also-active', derived_status: 'active' },
  ]
  assert.equal(defaultArcSlug(arcs), 'hot')
  assert.equal(defaultArcSlug([{ slug: 'a', derived_status: null }, { slug: 'b' }]), 'a')
  assert.equal(defaultArcSlug([]), null)
  assert.equal(defaultArcSlug(null), null)
})

// --- A4.3: entry normalization ----------------------------------------------------

test('normalizeArcEvent maps arc_events rows; no article join exists', () => {
  const e = normalizeArcEvent({
    id: 'ev1',
    category: 'legislative',
    title: ' Bill passed ',
    occurred_at: '2026-05-15',
    description: 'desc',
    confidence: 'corroborated',
  })
  assert.equal(e.key, 'ev1')
  assert.equal(e.date, '2026-05-15')
  assert.equal(e.type, 'legislative')
  assert.equal(e.badgeState, 'confirmed') // corroborated maps to confirmed badge
  assert.equal(e.articleId, null) // arc_events have no article columns
  assert.equal(e.outlet, null) // and no outlet — the source line stays omitted
  assert.equal(normalizeArcEvent(null), null)
})

test('normalizeNodeEvent maps canonical nodes; numeric confidence is not a badge', () => {
  const e = normalizeNodeEvent({
    id: 'n1',
    slug: 'evt-abc12345',
    label: 'Thing happened',
    summary: 's',
    occurred_at: null,
    confidence: 87, // numeric per-node score — NOT the badge vocabulary
    article_id: 'art-1',
  })
  assert.equal(e.key, 'n1')
  assert.equal(e.slug, 'evt-abc12345')
  assert.equal(e.date, null) // undated — axis renders "undated"
  assert.equal(e.type, 'event')
  assert.equal(typePillLabel(e.type), 'Event') // humanized, not leaked raw
  assert.equal(e.badgeState, null)
  assert.equal(e.articleId, 'art-1')
  assert.equal(e.kind, 'graph_event')
  assert.equal(confidenceToBadgeState(87), null)
  assert.equal(confidenceToBadgeState(undefined), null)
})

test('an arc-assigned News article becomes an explicit reporting record, not an event', () => {
  const entry = normalizeArticleTimelineRecord({
    id: 'article-1',
    title: 'Source reporting',
    summary: 'Recorded coverage summary.',
    outlet: 'Example News',
    published_at: '2026-08-19T15:00:00Z',
    arc_id: 'arc-1',
  })
  assert.equal(entry.key, 'article-article-1')
  assert.equal(entry.date, '2026-08-19')
  assert.equal(entry.type, 'news')
  assert.equal(entry.kind, 'article_record')
  assert.equal(entry.articleId, 'article-1')
  assert.equal(entry.arcId, 'arc-1')
  assert.equal(entry.badgeState, null)
  assert.equal(normalizeArticleTimelineRecord(null), null)
})

test('timeline sorting keeps an event before a same-day reporting record', () => {
  const sorted = sortTimelineEntries([
    { key: 'article-a', date: '2026-08-19', kind: 'article_record', title: 'Article' },
    { key: 'event-a', date: '2026-08-19', kind: 'graph_event', title: 'Event' },
    { key: 'event-old', date: '2026-08-18', kind: 'graph_event', title: 'Earlier' },
  ])
  assert.deepEqual(sorted.map((entry) => entry.key), ['event-old', 'event-a', 'article-a'])
})

// --- A4.4: filter pills -------------------------------------------------------------

test('date options derive from data, oldest first, month-labeled', () => {
  const entries = [
    { date: '2026-08-07' },
    { date: '2026-05-15' },
    { date: '2026-05-22' },
    { date: null }, // undated: no bucket
  ]
  assert.deepEqual(deriveDateOptions(entries), [
    { key: '2026-05', label: 'May 2026' },
    { key: '2026-08', label: 'August 2026' },
  ])
  assert.equal(monthLabel('2026-13'), '2026-13') // out-of-vocabulary month never crashes
  assert.deepEqual(deriveDateOptions([]), [])
})

test('type options derive from data via the locked pill vocabulary', () => {
  const entries = [{ type: 'legislative' }, { type: 'legislative' }, { type: 'weird_kind' }, {}]
  assert.deepEqual(deriveTypeOptions(entries), [
    { key: 'legislative', label: 'Legislative' },
    { key: 'weird_kind', label: 'Weird kind' },
  ])
})

test('active date filter excludes undated entries; type filter matches raw key', () => {
  const undated = { date: null, type: 'event' }
  const may = { date: '2026-05-15', type: 'legislative' }
  assert.equal(entryMatchesFilters(undated, {}), true)
  assert.equal(entryMatchesFilters(undated, { month: '2026-05' }), false)
  assert.equal(entryMatchesFilters(may, { month: '2026-05' }), true)
  assert.equal(entryMatchesFilters(may, { month: '2026-06' }), false)
  assert.equal(entryMatchesFilters(may, { type: 'legislative' }), true)
  assert.equal(entryMatchesFilters(may, { type: 'incident' }), false)
})

// --- A4.5: footer counts are live derivations ----------------------------------------

test('footerCounts: arc scope reads attached rows; global scope derives from entries', () => {
  assert.deepEqual(footerCounts({ scope: 'some-arc', articles: [{}, {}], connections: [{}] }), {
    articles: 2,
    connections: 1,
  })
  assert.deepEqual(footerCounts({ scope: 'some-arc', articles: null, connections: null }), {
    articles: 0,
    connections: 0,
  })
  const entries = [{ articleId: 'a' }, { articleId: null }, { articleId: 'b' }, { articleId: 'a' }]
  assert.deepEqual(
    footerCounts({ scope: ALL_EVENTS_SCOPE, entries, connections: [{}, {}, {}] }),
    { articles: 2, connections: 3 },
  )
})

// --- A4.6: arc-scope connectors are honestly all "Sequence only" -----------------------

test('arc-scope entries with edges=[] yield a sequence connector for EVERY gap', () => {
  const arcEvents = [
    { id: 'e1', category: 'legislative', title: 'a', occurred_at: '2026-05-15' },
    { id: 'e2', category: 'accountability', title: 'b', occurred_at: '2026-06-10' },
    { id: 'e3', category: 'economic', title: 'c', occurred_at: '2026-07-22' },
  ]
  const entries = arcEvents.map(normalizeArcEvent)
  const connectors = buildConnectors(entries, [])
  assert.equal(connectors.length, 2)
  for (const c of connectors) assert.equal(c.label, 'Sequence only')
})

// --- A4.7: read-path — doc_strength flows to the connector engine ----------------------

test('remapTimelineEdges passes doc_strength through to canonical keys', () => {
  const canonicalOf = new Map([['art-x', 'evt-x']])
  const out = remapTimelineEdges(
    [{ id: 'e', source: 'art-x', target: 'n2', type: 'causal', doc_strength: 'documented' }],
    canonicalOf,
  )
  assert.equal(out[0].source, 'evt-x')
  assert.equal(out[0].doc_strength, 'documented')
})

test('flat and grouped timeline loaders retain arc-assigned News records as explicit reporting entries', () => {
  const supa = src('src/lib/supabase.js')
  const grouped = src('src/lib/arcGroupedTimeline.js')
  assert.match(supa, /articleRecords: articlesRes\.data\.filter\(\(article\) => article\.arc_id\)/)
  assert.match(supa, /return `article-\$\{article\.id\}`/)
  assert.match(supa, /export async function loadArcArticles\(arcId\)/)
  assert.match(supa, /'id, title, summary, outlet, published_at, url, arc_id'/)
  assert.ok(!/loadArcArticles[\s\S]{0,700}\.limit\(50\)/.test(supa), 'arc article loader must not retain a 50-row cap')
  assert.match(grouped, /record_kind: 'article_record'/)
  assert.match(grouped, /newsRecords/)
})

test('both timeline loaders select doc_strength (read-path only)', () => {
  const supa = src('src/lib/supabase.js')
  const grouped = src('src/lib/arcGroupedTimeline.js')
  for (const [name, file] of [
    ['supabase.js', supa],
    ['arcGroupedTimeline.js', grouped],
  ]) {
    assert.match(
      file,
      /'edges', 'id, source_id, target_id, type, weight, label, doc_strength'/,
      `${name} edge select must include doc_strength`,
    )
    assert.ok(file.includes('doc_strength: e.doc_strength ?? null'), `${name} edge map passes strength`)
  }
  // New item-4 reads exist and are null-safe on the no-supabase path.
  assert.match(supa, /export async function loadArcConnections\(arcId\)/)
  assert.match(supa, /if \(!supabase \|\| !arcId\) return \{ edges: \[\], labels: new Map\(\) \}/)
  assert.match(supa, /export async function loadArticleExcerpt\(articleId\)/)
  assert.match(supa, /if \(!supabase \|\| !articleId\) return null/)
  // No writes anywhere in the new read functions.
  const arcConn = supa.slice(supa.indexOf('loadArcConnections'), supa.indexOf('loadArticleExcerpt'))
  assert.ok(!/\.(insert|update|delete|upsert)\(/.test(arcConn))
})

// --- A4.8: reuse, not rebuild ----------------------------------------------------------

test('evidence panel exists in exactly one file, consumed by both views', () => {
  const panel = src('src/components/ArcEvidencePanel.jsx')
  assert.match(panel, /gap-bar-track/)
  assert.match(panel, /Milestone checklist/)
  const arcs = src('src/views/ArcsView.jsx')
  assert.ok(arcs.includes("import ArcEvidencePanel from '../components/ArcEvidencePanel'"))
  assert.ok(!arcs.includes('gap-bar-track'), 'ArcsView must not reimplement the coverage bar')
  assert.ok(!arcs.includes('MILESTONE_META'), 'ArcsView must not reimplement milestone meta')
  const view = src('src/views/TimelineView.jsx')
  assert.ok(view.includes("import ArcEvidencePanel from '../components/ArcEvidencePanel'"))
})

test('Screen 5 consumes the shared kit and the item-3 engine', () => {
  const view = src('src/views/TimelineView.jsx')
  for (const imp of [
    "import ArcTimeline from '../components/ArcTimeline'",
    "import EpistemicBanner from '../components/EpistemicBanner'",
    "import EvidenceStateBar from '../components/EvidenceStateBar'",
    "import TrustFooter from '../components/TrustFooter'",
  ]) {
    assert.ok(view.includes(imp), `TimelineView missing ${imp}`)
  }
  const timeline = src('src/components/ArcTimeline.jsx')
  assert.ok(timeline.includes('buildConnectors'), 'renderer must derive connectors from the engine')
  assert.ok(timeline.includes('TimelineConnector connector={connectors[i]}'), 'every gap renders a connector')
  for (const imp of ['TypeIcon', 'TypePill', 'StatusBadge', 'SourceAttributionLine', 'TimelineEntryDetail']) {
    assert.ok(timeline.includes(imp), `ArcTimeline must reuse ${imp}`)
  }
  // Trust footer never fabricates a review date.
  assert.ok(view.includes('reviewedAt={null}'))
})

// --- A4.9: honest degradation ------------------------------------------------------------

test('entry source line renders only with a real outlet; badge only for mapped states', () => {
  const timeline = src('src/components/ArcTimeline.jsx')
  assert.ok(timeline.includes('entry.outlet && <SourceAttributionLine'), 'no unconditional source line')
  assert.ok(timeline.includes('entry.badgeState && <StatusBadge'), 'no unconditional badge')
  assert.ok(timeline.includes('undated'), 'undated axis state must exist')
  // Expansion affordance: chevron collapsed, caret expanded, aria-expanded.
  assert.ok(timeline.includes('aria-expanded={expanded}'))
})

// --- A4.10: hex audit on new/changed files ----------------------------------------------

test('no hardcoded hex in item-4 files', () => {
  for (const p of [
    'src/lib/timelineScreenModel.js',
    'src/components/ArcTimeline.jsx',
    'src/components/ArcEvidencePanel.jsx',
    'src/views/TimelineView.jsx',
    'src/views/ArcsView.jsx',
    'src/components/epistemic.css',
  ]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src(p)), `${p} must use var() tokens only`)
  }
})

// --- A4.11: App wiring --------------------------------------------------------------------

test('App renders only TimelineView for the timeline tab; modes moved inside', () => {
  const app = src('src/App.jsx')
  assert.ok(!app.includes('timeline-mode-toggle'), 'chip row moved into TimelineView')
  assert.ok(!app.includes('GroupedTimelineView'), 'grouped view consumed by TimelineView, not App')
  const view = src('src/views/TimelineView.jsx')
  assert.ok(view.includes("import GroupedTimelineView from './GroupedTimelineView'"))
  assert.ok(view.includes('focusEventKey'), 'cross-window focus jump preserved')
  assert.ok(view.includes("timeline_grouped_beta") || view.includes('loadTimelineGroupedBetaFlag'))
})
