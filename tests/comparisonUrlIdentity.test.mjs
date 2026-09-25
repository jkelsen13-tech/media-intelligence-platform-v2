import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalUrl, collapseBySyndication, buildClaimView } from '../src/lib/sourceComparisonReadPath.js'

// These exercise the public comparison caller, not legacy pipeline lineage.
function claimFor(urls) {
  const articles = urls.map((url, i) => ({ id: 'a' + i, outlet: 'outlet-' + i, url }))
  return buildClaimView({id:'claim', canonical_text:'Shared claim'}, articles.map(a => ({
    id:'surface-' + a.id, article_id:a.id, surface_text:'Shared claim',
  })), {
    articlesById:new Map(articles.map(a => [a.id, a])),
    syndicates:collapseBySyndication(articles),
    eventOutlets:articles.map(a => a.outlet),
    eventArticlesByOutlet:new Map(articles.map(a => [a.outlet, [a]])),
    extractedArticleIds:new Set(articles.map(a => a.id)),
    evidenceLinks:[], corrections:[], explanationsByArticle:new Map(),
  })
}
for (const [name, urls] of [
  ['case-sensitive paths', ['https://news.example/Story', 'https://news.example/story']],
  ['distinct non-default ports', ['https://news.example:8443/story', 'https://news.example:9443/story']],
  ['default versus non-default port', ['https://news.example/story', 'https://news.example:8443/story']],
]) {
  test(name + ' cannot create false shared-origin collapse in public claim view', () => {
    const view = claimFor(urls)
    assert.deepEqual(view.independentOutlets, ['outlet-0', 'outlet-1'])
    assert.equal(view.syndicatedExtra, 0)
    assert.equal(view.classification, 'shared')
    assert.equal(view.evidenceStrength, 'E2') // multi-outlet, lineage unverified; not verified corroboration
  })
}
test('established host/tracking/default-port copies still collapse in public claim view', () => {
  const view = claimFor([
    'https://www.BBC.com:443/news/world-123/?utm_source=rss',
    'https://bbc.com/news/world-123?fbclid=xyz',
  ])
  assert.deepEqual(view.independentOutlets, ['outlet-0'])
  assert.equal(view.syndicatedExtra, 1)
  assert.equal(view.classification, 'unique')
  assert.equal(view.evidenceStrength, 'E4')
  assert.equal(canonicalUrl('https://www.BBC.com/news/world-123/'), 'bbc.com/news/world-123')
})
test('previous encoded-query identity correction is preserved', () => {
  assert.notEqual(canonicalUrl('https://example.test/story?q=x%26b%3Dy'), canonicalUrl('https://example.test/story?q=x&b=y'))
})
