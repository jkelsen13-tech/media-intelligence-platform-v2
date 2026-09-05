import test from 'node:test'
import assert from 'node:assert/strict'
import { surfaceAvailability, surfaceJoinDisclosures, loadInvestigationSurface } from '../src/lib/investigationSurface.js'

const ECLIPSE = {
  canonical_event_id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
  event_label: '2024 Total Solar Eclipse, Cleveland, Ohio',
  event_type: 'event',
  occurred_at: '2024-04-08',
  has_released_geography: true,
  spatial_revision_id: '9bf5c497-0c36-4307-9940-541265a94b0d',
  public_article_count: 0,
  reviewed_claim_count: 0,
  published_relationship_count: 0,
  auto_approval_enabled: false,
}

test('surface keeps pending articles and unpublished claims honest', () => {
  const availability = surfaceAvailability(ECLIPSE)
  assert.equal(availability.public_article, false)
  assert.equal(availability.reviewed_claims, false)
  assert.equal(availability.published_relationships, false)
  assert.equal(availability.has_released_geography, true)
  assert.equal(availability.auto_approval_enabled, false)
})

test('zero public memberships is an honest empty, not withheld private articles', () => {
  const disclosures = surfaceJoinDisclosures(ECLIPSE, { view: 'news', subjectType: 'event' })
  assert.equal(disclosures.some((row) => row.kind === 'withheld'), false)
  assert.equal(disclosures.some((row) => row.reason === 'source_article_pending_or_withheld'), false)
  assert.ok(disclosures.some((row) => row.kind === 'no_joined_data' && row.reason === 'source_article_none_public'))
  assert.ok(disclosures.some((row) => row.kind === 'insufficient_evidence'))
  assert.ok(disclosures.every((row) => row.invented !== true && row.inventedNewsRow !== true))
  assert.deepEqual(surfaceJoinDisclosures(null), [])
})

test('null article count is unavailable rather than proof of private articles', () => {
  const disclosures = surfaceJoinDisclosures({ ...ECLIPSE, public_article_count: null }, { view: 'news' })
  assert.equal(disclosures.some((row) => row.kind === 'withheld'), false)
  assert.ok(disclosures.some((row) => row.reason === 'source_article_count_unavailable'))
})

test('governed public memberships do not emit an empty-article disclosure', () => {
  const disclosures = surfaceJoinDisclosures({ ...ECLIPSE, public_article_count: 1 }, { view: 'news' })
  assert.equal(disclosures.some((row) => row.reason === 'source_article_none_public'), false)
  assert.equal(surfaceAvailability({ ...ECLIPSE, public_article_count: 1 }).public_article, true)
})

test('missing geography is disclosed only on World View', () => {
  const row = { ...ECLIPSE, has_released_geography: false }
  const world = surfaceJoinDisclosures(row, { view: 'world', subjectType: 'event' })
  const graph = surfaceJoinDisclosures(row, { view: 'graph', subjectType: 'event' })
  assert.ok(world.some((item) => item.reason === 'no_released_geography' || item.kind === 'no_joined_data'))
  assert.equal(graph.some((item) => item.reason === 'no_released_geography'), false)
})

test('loadInvestigationSurface fails closed without a client or id', async () => {
  assert.equal(await loadInvestigationSurface(null, { supabaseClient: {} }), null)
  assert.equal(await loadInvestigationSurface('acc55cb2-5ac2-4aed-be36-3f576d2bc443', { supabaseClient: null }), null)
})
