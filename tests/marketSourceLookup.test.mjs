import test from 'node:test'
import assert from 'node:assert/strict'
import { createMarketSourceLookup } from '../src/lib/marketSourceLookup.js'
import { marketFixtureId as id, marketsSourceFixture } from './fixtures/marketsSourceFixture.mjs'
import { hydrateDeepLink, serializeDeepLink } from '../src/lib/deepLinks.js'

test('missing directory is unavailable, and literal symbol search presents distinct typed choices', () => {
  assert.equal(createMarketSourceLookup().search('SAME').reason, 'directory_unavailable')
  const lookup = createMarketSourceLookup(marketsSourceFixture())
  const results = lookup.search('SAME')
  assert.equal(results.results.length, 4); assert.equal(results.requiresExplicitSelection, true)
  assert.equal(lookup.search('SAME', { kind: 'equity' }).results.length, 2)
  assert.equal(lookup.search('SAME', { kind: 'cryptoasset' }).results.length, 2)
  assert.equal(lookup.lookup({ id: 'SAME' }).reason, 'asset_unmapped')
  assert.equal(lookup.lookup({ id: id(1), kind: 'cryptoasset' }).reason, 'asset_unmapped')
})

test('authorization/type/version failures reject the complete directory rather than choosing a plausible winner', () => {
  for (const change of [s => { s.assets[0].publiclyEligible = false }, s => { s.assets[0].releaseState = 'private' },
    s => { s.assets[0].aliases[0].namespace = '' }, s => { s.assets[3].assetIdentifier = '' },
    s => { s.assets.push(structuredClone(s.assets[0])) }, s => { s.observedAt = '2026-10-02' }]) {
    const snapshot = marketsSourceFixture(); change(snapshot)
    assert.equal(createMarketSourceLookup(snapshot).status, 'unavailable')
  }
})

test('lookup retains precise separate clocks, corrections and reporting despite no price provider', () => {
  const snapshot = marketsSourceFixture(), lookup = createMarketSourceLookup(snapshot)
  snapshot.reporting[0].evidence.captures[0].summary = 'Changed after creation'
  const original = lookup.lookup({ id: id(1) }).model
  assert.equal(original.reporting.sections[0].records.length, 1)
  assert.equal(original.price.activeProvider, null); assert.equal(original.price.quoteTime, null)
  assert.equal(original.validTime, lookup.validAt); assert.equal(original.observationTime, lookup.observedAt)
  const corrected = marketsSourceFixture(); corrected.reporting[0].evidence.assessments[0].stale = true
  assert.equal(createMarketSourceLookup(corrected).lookup({ id: id(1) }).model.reporting.sections[0].records.length, 0)
  assert.equal(lookup.lookup({ id: id(1), at: '2024-04-08T18:00:00.000002Z' }).model.reporting.status, 'empty')
  assert.equal(lookup.lookup({ id: id(1), at: '2024-04-08' }).reason, 'inspection_time_unavailable')
})

test('Markets legacy route envelope round-trips typed identity, retained source, instant and range', () => {
  const context = { canonical_subject_type: 'cryptoasset', canonical_subject_id: id(3), parent_event_id: null,
    active_view: 'markets', as_of_time: '2024-04-08T18:00:00.000001Z',
    selected_time_range: { from: '2024-04-08', to: '2024-04-09' }, selected_arc_or_stage_id: null }
  const link = serializeDeepLink(context, { source: id(300) })
  assert.match(link, /\/markets\?/)
  const catalog = { source: [{ id: id(300), parentSubjectId: id(3) }] }
  const hydrated = hydrateDeepLink(link, { catalog })
  assert.equal(hydrated.investigationContext.canonical_subject_type, 'cryptoasset')
  assert.equal(hydrated.investigationContext.canonical_subject_id, id(3))
  assert.equal(hydrated.investigationContext.active_view, 'markets')
  assert.equal(hydrated.investigationContext.as_of_time, context.as_of_time)
  assert.deepEqual(hydrated.investigationContext.selected_time_range, context.selected_time_range)
  assert.equal(hydrated.selection.source, id(300))
})
