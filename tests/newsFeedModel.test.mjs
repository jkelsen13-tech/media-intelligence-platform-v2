// Track B Step 4 (News Feed): unit pins for src/lib/newsFeedModel.js.
// Runs in node:test — no DOM, no supabase.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRIMARY_CITATION_TYPES,
  provenanceBasis,
  PROVENANCE_LABELS,
  freshnessLabel,
  liveCorpusLabel,
  groupArticlesByEvent,
  isNewSince,
  readThenAdvanceLastVisit,
  LAST_VISIT_STORAGE_KEY,
} from '../src/lib/newsFeedModel.js'

test('provenanceBasis: primary citation types are exactly the locked set', () => {
  assert.deepEqual([...PRIMARY_CITATION_TYPES].sort(), ['agency_release', 'court_doc'])
})

test('provenanceBasis: primary filing only when a primary-type citation exists', () => {
  const art = { url: 'https://x', summary: 's' }
  assert.equal(provenanceBasis(art, ['court_doc']), 'primary')
  assert.equal(provenanceBasis(art, ['named_official', 'agency_release']), 'primary')
  // General citation types do NOT fabricate a primary-filing claim.
  assert.equal(provenanceBasis(art, ['named_official']), 'source-linked')
  assert.equal(provenanceBasis(art, ['study', 'anonymous_official']), 'source-linked')
  // An unrecognized future type must never read as primary.
  assert.equal(provenanceBasis(art, ['podcast']), 'source-linked')
})

test('provenanceBasis: source-linked requires url AND summary; otherwise nothing', () => {
  assert.equal(provenanceBasis({ url: 'https://x', summary: 's' }, []), 'source-linked')
  assert.equal(provenanceBasis({ url: 'https://x', summary: null }, []), null)
  assert.equal(provenanceBasis({ url: null, summary: 's' }, []), null)
  assert.equal(provenanceBasis({ url: null, summary: null }, null), null)
  assert.equal(PROVENANCE_LABELS.primary, 'Primary filing linked')
  assert.equal(PROVENANCE_LABELS['source-linked'], 'Source-linked summary')
})

test('freshnessLabel: relative under 24h, absolute date at/after 24h', () => {
  const now = new Date('2026-08-18T12:00:00Z').getTime()
  assert.equal(freshnessLabel('2026-08-18T11:30:00Z', now), 'updated 30 min ago')
  assert.equal(freshnessLabel('2026-08-18T03:00:00Z', now), 'updated 9 hours ago')
  assert.equal(freshnessLabel('2026-08-17T13:00:00Z', now), 'updated 23 hours ago')
  // Static corpus (fetched 2026-08-10) must NOT read as freshly updated.
  const s = freshnessLabel('2026-08-10T16:19:43Z', now)
  assert.ok(s.startsWith('updated '), s)
  assert.ok(!s.includes('min ago') && !s.includes('hour'), s)
  assert.equal(freshnessLabel(null, now), null)
  assert.equal(freshnessLabel('not-a-date', now), null)
})

test('liveCorpusLabel: live count token, never pinned; null when count unknown', () => {
  const now = new Date('2026-08-18T12:00:00Z').getTime()
  assert.equal(
    liveCorpusLabel(752, '2026-08-18T11:00:00Z', now),
    'Live corpus — 752 articles — updated 1 hour ago',
  )
  assert.equal(liveCorpusLabel(1, null, now), 'Live corpus — 1 article')
  assert.equal(liveCorpusLabel(null, '2026-08-18T11:00:00Z', now), null)
})

test('groupArticlesByEvent: multi-article events collapse, singles stay flat', () => {
  const articles = [
    { id: 'a1', outlet: 'CNN', published_at: '2026-08-01T00:00:00Z' },
    { id: 'a2', outlet: 'BBC', published_at: '2026-08-02T00:00:00Z' },
    { id: 'a3', outlet: 'CNN', published_at: '2026-08-03T00:00:00Z' },
    { id: 'a4', outlet: 'Reuters', published_at: '2026-08-04T00:00:00Z' },
  ]
  const map = new Map([
    ['a1', { eventId: 'e1', title: 'Event one' }],
    ['a2', { eventId: 'e1', title: 'Event one' }],
    ['a3', { eventId: 'e1', title: 'Event one' }],
    ['a4', { eventId: 'e2', title: 'Event two' }],
  ])
  const out = groupArticlesByEvent(articles, map)
  assert.equal(out.length, 2)
  assert.equal(out[0].kind, 'group')
  assert.equal(out[0].articles.length, 3)
  assert.deepEqual(out[0].outlets, ['CNN', 'BBC']) // deduped, first-seen order
  assert.equal(out[0].latest, '2026-08-03T00:00:00Z')
  assert.equal(out[1].kind, 'article') // single-article event stays flat
  assert.equal(out[1].article.id, 'a4')
})

test('groupArticlesByEvent: eventless articles stay flat and keep positions', () => {
  const articles = [
    { id: 'x1', outlet: 'A' },
    { id: 'x2', outlet: 'B' },
    { id: 'x3', outlet: 'C' },
  ]
  const map = new Map([['x2', { eventId: 'e9', title: null }]])
  // Single-member group collapses to flat; order preserved.
  const out = groupArticlesByEvent(articles, map)
  assert.deepEqual(out.map((e) => e.article.id), ['x1', 'x2', 'x3'])
  assert.equal(groupArticlesByEvent([], map).length, 0)
  assert.equal(groupArticlesByEvent(null, null).length, 0)
})

test('isNewSince: strict greater-than against the stored marker', () => {
  const marker = new Date('2026-08-10T00:00:00Z').getTime()
  assert.equal(isNewSince('2026-08-11T00:00:00Z', marker), true)
  assert.equal(isNewSince('2026-08-10T00:00:00Z', marker), false)
  assert.equal(isNewSince('2026-08-09T00:00:00Z', marker), false)
  assert.equal(isNewSince(null, marker), false)
  assert.equal(isNewSince('2026-08-11T00:00:00Z', null), false)
})

test('readThenAdvanceLastVisit: returns previous marker, then stores now', () => {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }
  const t1 = 1000
  assert.equal(readThenAdvanceLastVisit(storage, t1), null) // first visit
  assert.equal(store.get(LAST_VISIT_STORAGE_KEY), '1000')
  assert.equal(readThenAdvanceLastVisit(storage, 2000), 1000) // second visit reads prior
  assert.equal(store.get(LAST_VISIT_STORAGE_KEY), '2000')
  // Storage failure (private mode) degrades to null without throwing.
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.equal(readThenAdvanceLastVisit(broken, 3000), null)
})


test('source reports keep their attributed article titles even with older event grouping', () => {
  const report = { id: 'report', title: 'Publisher attributes a claim', public_version: { admission_kind: 'source_report' } }
  const articles = [report, { id: 'proposition-a' }, { id: 'proposition-b' }]
  const map = new Map(articles.map(article => [article.id, { eventId: 'older-event', title: 'Established event label' }]))
  const entries = groupArticlesByEvent(articles, map)
  assert.equal(entries[0].kind, 'article')
  assert.equal(entries[0].article, report)
  assert.deepEqual(entries[1].articles.map(article => article.id), ['proposition-a', 'proposition-b'])
})
