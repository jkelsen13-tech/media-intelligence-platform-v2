import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClaimView, loadSourceComparisonView } from '../src/lib/sourceComparisonReadPath.js'

// Supplied public projection only: no base-table, source acquisition or review fixture.
function projection() {
  const article = (id, outlet, extracted) => ({
    article_key: id, outlet, article_url: 'https://example.invalid/' + id,
    published_at: '2026-09-01T12:00:00Z', has_extracted_claim: extracted,
  })
  return {
    event_key: 'event', canonical_title: 'Synthetic event', occurred_at_start: '2026-09-01',
    articles: [article('a', 'Outlet A', true), article('b1', 'Outlet B', true), article('b2', 'Outlet B', false)],
    claims: [{
      claim_key: 'claim', canonical_text: 'Synthetic retained claim', thin_extraction: false,
      surfaces: [{ article_key: 'a', surface_text: 'Synthetic retained claim', loaded_language: [] }],
      evidence_links: [], corrections: [],
    }],
  }
}
async function read(row) {
  const before = structuredClone(row), calls = []
  const client = { from(table) {
    calls.push(table)
    assert.equal(table, 'comparison_public', 'coverage must not read private base tables or config')
    const query = {
      select(columns) {
        assert.equal(columns, 'event_key, canonical_title, occurred_at_start, occurred_at_end, articles, claims')
        return query
      },
      order(column) { assert.equal(column, 'event_key'); return query },
      range(from, to) { return Promise.resolve({ data: [row].slice(from, to + 1), error: null }) },
    }
    return query
  } }
  const view = await loadSourceComparisonView({ supabaseClient: client })
  assert.deepEqual(row, before, 'reader must not manufacture extraction status')
  assert.deepEqual(calls, ['comparison_public'])
  assert.equal(view.events.length, 1)
  return view.events[0].claims[0]
}
test('mixed extraction within one outlet remains unknown in the actual public reader', async () => {
  const claim = await read(projection())
  assert.deepEqual(claim.omittedBy, [])
  assert.deepEqual(claim.coverageUnknown, ['Outlet B'])
  assert.equal(claim.classification, 'unique')
  assert.deepEqual(claim.independentOutlets, ['Outlet A'])
  assert.equal(claim.evidenceStrength, 'E4')
})
test('all supplied outlet articles extracted permits bounded omission, never corroboration', async () => {
  const row = projection(); row.articles[2].has_extracted_claim = true
  const claim = await read(row)
  assert.deepEqual(claim.omittedBy, ['Outlet B'])
  assert.deepEqual(claim.coverageUnknown, [])
  assert.equal(claim.evidenceStrength, 'E4')
  assert.equal(claim.surfaces.length, 1)
})
test('missing, false and nonboolean extraction metadata cannot supply complete coverage', async () => {
  for (const value of [undefined, null, false, 'true', 1]) {
    const row = projection(); row.articles[2].has_extracted_claim = value
    const claim = await read(row)
    assert.deepEqual(claim.omittedBy, [])
    assert.deepEqual(claim.coverageUnknown, ['Outlet B'])
  }
  const row = projection(); row.articles[1].has_extracted_claim = false
  assert.deepEqual((await read(row)).coverageUnknown, ['Outlet B'])
})
test('correction removes the omission; renewed extraction restores only bounded absence', async () => {
  const row = projection(); row.articles[2].has_extracted_claim = true
  assert.deepEqual((await read(row)).omittedBy, ['Outlet B'])
  row.articles[2].has_extracted_claim = false
  const corrected = await read(row)
  assert.deepEqual(corrected.omittedBy, [])
  assert.deepEqual(corrected.coverageUnknown, ['Outlet B'])
  row.articles[2].has_extracted_claim = true
  assert.deepEqual((await read(row)).omittedBy, ['Outlet B'])
})
test('an outlet with a matching surface is neither omitted nor unknown despite partial other extraction', async () => {
  const row = projection()
  row.claims[0].surfaces.push({ article_key: 'b1', surface_text: 'Synthetic retained claim', loaded_language: [] })
  const claim = await read(row)
  assert.deepEqual(claim.omittedBy, [])
  assert.deepEqual(claim.coverageUnknown, [])
  assert.equal(claim.classification, 'shared')
  assert.equal(claim.evidenceStrength, 'E2')
  assert.deepEqual(claim.independentOutlets, ['Outlet A', 'Outlet B'])
})
test('an outlet with no supplied article cannot pass vacuous complete-coverage evaluation', () => {
  const claim = buildClaimView({ id: 'claim', canonical_text: 'Synthetic' }, [], {
    articlesById: new Map(), syndicates: new Map(), eventOutlets: ['Unmapped outlet'],
    eventArticlesByOutlet: new Map(), extractedArticleIds: new Set(),
    evidenceLinks: [], corrections: [], explanationsByArticle: new Map(),
  })
  assert.deepEqual(claim.omittedBy, [])
  assert.deepEqual(claim.coverageUnknown, ['Unmapped outlet'])
})
