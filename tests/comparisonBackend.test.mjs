import test from 'node:test'
import assert from 'node:assert/strict'
import { comparisonBackendFixture, comparisonRow } from './comparisonBackendFixture.mjs'
import { newsNavigationFromComparisonSurface } from '../src/lib/sourceComparisonReadPath.js'

const projectionColumns = 'event_key,canonical_title,occurred_at_start,occurred_at_end,articles,claims'

test('shared comparison read preserves every projected card and current session past 1000 records', async () => {
  const rows = Array.from({ length: 1002 }, (_, n) => comparisonRow(n))
  const f = comparisonBackendFixture({ tables: { comparison_public: rows } })
  assert.equal(f.calls.length, 0)
  const view = await f.backend.loadSourceComparisonView()
  assert.equal(view.enabled, true)
  assert.deepEqual(view.events.map(e => e.id).sort(), rows.map(r => r.event_key).sort())
  assert.deepEqual(f.calls.map(c => Number(c.params.get('offset'))), Array.from({ length: 11 }, (_, n) => n * 100))
  for (const c of f.calls) {
    assert.equal(c.table, 'comparison_public'); assert.equal(c.request.method, 'GET')
    assert.equal(c.params.get('select').replaceAll(' ', ''), projectionColumns)
    assert.equal(c.params.get('order'), 'event_key.asc')
    assert.equal(c.request.headers.get('apikey'), 'fixture-browser-key')
  }
  const before = f.calls.length
  f.setToken('comparison-session-two')
  await f.backend.loadSourceComparisonView()
  assert.ok(f.calls.slice(before).every(c => c.request.headers.get('authorization') === 'Bearer comparison-session-two'))
})

test('comparison provenance, missing extraction, and opaque navigation identities survive the shared root', async () => {
  const row = comparisonRow(), f = comparisonBackendFixture({ tables: { comparison_public: [row], articles: [
    { id: 'eligible-news-id', url: row.articles[0].article_url, reader_state: 'eligible' },
  ] } })
  const event = (await f.backend.loadSourceComparisonView()).events[0], claim = event.claims[0]
  assert.equal(event.id, row.event_key)
  assert.deepEqual(claim.omittedBy, ['Publisher B']); assert.deepEqual(claim.coverageUnknown, ['Publisher C'])
  assert.equal(claim.thinExtraction, true); assert.equal(claim.evidenceStrength, 'E1')
  assert.equal(claim.surfaces[0].explanation.remaining_uncertainty, 'Grouping awaits review')
  assert.equal(claim.corrections[0].correction_text, 'Recorded correction')
  assert.deepEqual(event.arcLinks, [{ arcId: 'recorded-arc', title: 'Recorded arc', timelineKey: 'recorded-event' }])
  const target = newsNavigationFromComparisonSurface(claim.surfaces[0])
  assert.deepEqual(target, { articleKey: row.articles[0].article_key, url: row.articles[0].article_url })
  assert.equal(await f.backend.resolveEligibleArticleForNews(target), 'eligible-news-id')
  assert.ok(f.calls.filter(c => c.table === 'articles').every(c => c.params.get('reader_state') === 'eq.eligible'))
})

test('comparison page failure discards partial cards and remains distinct from an empty projection', async () => {
  const empty = comparisonBackendFixture()
  assert.deepEqual(await empty.backend.loadSourceComparisonView(), { enabled: true, events: [] })
  const failed = comparisonBackendFixture({ tables: { comparison_public: Array.from({ length: 101 }, (_, n) => comparisonRow(n)) },
    errors: { comparison_public: p => Number(p.get('offset')) >= 100 ? { code: '42501', message: 'Projection unavailable' } : null } })
  assert.deepEqual(await failed.backend.loadSourceComparisonView(), { enabled: true, events: [], loadError: 'Projection unavailable' })
  assert.equal(failed.calls.length, 2)
  assert.deepEqual([...new Set(failed.calls.map(c => c.table))], ['comparison_public'])
  const one = comparisonRow(); one.articles = one.articles.slice(0, 1)
  assert.deepEqual((await comparisonBackendFixture({ tables: { comparison_public: [one] } }).backend.loadSourceComparisonView()).events, [])
})

test('projection errors without a message cannot become a successful empty read', async () => {
  const f = comparisonBackendFixture({ errors: { comparison_public: () => ({ code: '42501', message: '' }) } })
  const view = await f.backend.loadSourceComparisonView()
  assert.deepEqual(view.events, [])
  assert.equal(view.loadError, 'Comparison projection unavailable')
  assert.deepEqual([...new Set(f.calls.map(c => c.table))], ['comparison_public'])
})

test('public comparison projection preserves temporal meaning through the shared backend', async () => {
  const row = comparisonRow()
  row.articles[0].published_at = '2026-08-05T09:00:00-04:00'
  row.articles[1].published_at = '2026-08-05T12:00:00Z'
  row.articles[2].published_at = '2026-08-05T14:00:00Z'
  const view = (await comparisonBackendFixture({ tables: { comparison_public: [row] } }).backend.loadSourceComparisonView()).events[0]
  assert.equal(view.firstOutlet, 'Publisher B')
  assert.equal(view.timing.find(t => t.outlet === 'Publisher A').lagHours, 1)
  assert.equal(view.claims[0].surfaces[0].publishedAt, row.articles[0].published_at)
})
