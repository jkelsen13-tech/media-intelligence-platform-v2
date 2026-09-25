import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalUrl, loadSourceComparisonView } from '../src/lib/sourceComparisonReadPath.js'

async function read(left, right) {
  const row = {
    event_key: 'synthetic-event', canonical_title: 'Synthetic comparison',
    articles: [left, right].map((url, index) => ({
      article_key: 'a' + index, outlet: 'Outlet ' + index, article_url: url,
      has_extracted_claim: true,
    })),
    claims: [{
      claim_key: 'synthetic-claim', canonical_text: 'Synthetic claim',
      surfaces: [0, 1].map(index => ({ article_key: 'a' + index, surface_text: 'Synthetic claim' })),
    }],
  }
  const before = structuredClone(row)
  const client = { from(table) {
    assert.equal(table, 'comparison_public')
    const q = {
      select() { return q }, order() { return q },
      range(from, to) { return Promise.resolve({ data: [row].slice(from, to + 1), error: null }) },
    }
    return q
  } }
  const result = await loadSourceComparisonView({ supabaseClient: client })
  assert.deepEqual(row, before)
  return result.events[0].claims[0]
}
test('encoded query value delimiters do not merge distinct public sources', async () => {
  const left = 'https://example.invalid/story?x=a%26y%3Db'
  const right = 'https://example.invalid/story?x=a&y=b'
  const claim = await read(left, right)
  assert.equal(claim.classification, 'shared')
  assert.deepEqual(claim.independentOutlets, ['Outlet 0', 'Outlet 1'])
  assert.equal(claim.evidenceStrength, 'E2')
  assert.equal(claim.syndicatedExtra, 0)
  assert.notEqual(canonicalUrl(left), canonicalUrl(right))
})
test('encoded query key delimiters remain distinct from value delimiters', async () => {
  const left = 'https://example.invalid/story?a%3Db=c'
  const right = 'https://example.invalid/story?a=b%3Dc'
  assert.equal((await read(left, right)).classification, 'shared')
  assert.notEqual(canonicalUrl(left), canonicalUrl(right))
})
test('tracking removal and query ordering still collapse one public source', async () => {
  const left = 'https://www.example.invalid/story/?z=last&x=a%26y%3Db&utm_source=feed'
  const right = 'https://example.invalid/story?fbclid=tracking&x=a%26y%3Db&z=last'
  const claim = await read(left, right)
  assert.equal(canonicalUrl(left), canonicalUrl(right))
  assert.equal(claim.classification, 'unique')
  assert.equal(claim.evidenceStrength, 'E4')
  assert.equal(claim.syndicatedExtra, 1)
})
test('equivalent percent encodings normalize but repeated-value order is retained', () => {
  assert.equal(canonicalUrl('https://example.invalid/?x=%61+%62'), canonicalUrl('https://example.invalid/?x=a%20b'))
  assert.notEqual(canonicalUrl('https://example.invalid/?x=a&x=b'), canonicalUrl('https://example.invalid/?x=b&x=a'))
  assert.notEqual(canonicalUrl('https://example.invalid/?x=%2526'), canonicalUrl('https://example.invalid/?x=%26'))
})
