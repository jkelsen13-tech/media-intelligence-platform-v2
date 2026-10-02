import test from 'node:test'
import assert from 'node:assert/strict'
import { presentationFailureState } from '../src/lib/explanationEligibility.js'
import { buildExplanationReadView } from '../src/lib/explanationReadPath.js'
import { buildRelationshipPanelView } from '../src/lib/relationshipProvenance.js'
import { evidenceBackendFixture, evidenceTables, evidenceEdge } from './evidenceBackendFixture.mjs'

const eligible = () => evidenceTables().explanations[0]

test('browser eligibility matches the recorded SQL archive-array gate', () => {
  for (const archived_sources of [null, undefined, 'archived', {}, { status: 'missing' }]) {
    assert.equal(presentationFailureState({ ...eligible(), archived_sources }), 'source_unavailable')
  }
  assert.equal(presentationFailureState(eligible()), null, 'empty arrays remain allowed by the recorded contract')
  assert.equal(presentationFailureState({ ...eligible(), archived_sources: [{ status: 'missing' }] }), 'source_unavailable')
})

test('pure explanation gate requires exact boolean true', () => {
  for (const enabled of ['false', 'true', 1, [], {}, null, false]) {
    assert.deepEqual(buildExplanationReadView([eligible()], { enabled }), { enabled: false, eligible: [], excluded: [] })
  }
  assert.equal(buildExplanationReadView([eligible()], { enabled: true }).eligible.length, 1)
})

test('excluded relationship rows disclose failures without publishing their grounding or source quality', () => {
  for (const patch of [{ review_status: 'awaiting_review' }, { review_status: 'reviewed' }, { state: 'insufficient_evidence' }, { state: 'source_unavailable' }, { archived_sources: { status: 'missing' } }]) {
    const explanation = { ...eligible(), ...patch, supporting_passage: 'EXCLUDED_GROUNDING', archived_sources: patch.archived_sources ?? [{ status: 'archived' }] }
    const view = buildRelationshipPanelView({ edge: evidenceEdge, explanation, enabled: true, sources: [{ kind: 'article', title: 'EXCLUDED_SOURCE' }] })
    assert.equal(view.grounding.recorded, false)
    assert.doesNotMatch(JSON.stringify(view), /EXCLUDED_GROUNDING|EXCLUDED_SOURCE|Archived source record present/)
    assert.equal(view.falsificationCondition, null)
    assert.ok(view.reviewBadge)
    assert.equal(view.axes.find(a => a.key === 'remaining_uncertainty').value, explanation.remaining_uncertainty)
  }
})

test('node and edge backing articles require an explicit reviewed proposition at the bound read seam', async () => {
  const tables = evidenceTables()
  tables.articles = [{ ...tables.news_reviewed_articles_public[0] }]
  for (const [id, reader_state, source_status] of [['pending', 'pending_review', 'active'], ['withdrawn', 'eligible', 'withdrawn'], ['corrected', 'eligible', 'corrected'], ['unknown', undefined, undefined]]) {
    tables.articles.push({ ...tables.articles[0], id, title: `EXCLUDED_${id}`, reader_state, source_status })
    tables.citations.push({ id: `citation-${id}`, resolved_node_id: 'node-one', article_id: id })
  }
  const f = evidenceBackendFixture({ tables })
  assert.deepEqual((await f.backend.loadNodeArticles('node-one')).map(a => a.id), ['article-one'])
  const sources = await f.backend.loadEdgeSources(tables.articles.map(a => a.id))
  assert.equal(sources[0].kind, 'article')
  assert.ok(sources.slice(1).every(s => s.kind === 'unresolved'))
  assert.doesNotMatch(JSON.stringify(sources), /EXCLUDED_/)
  assert.equal(f.calls.some(c => c.table === 'articles'), false)
  for (const call of f.calls.filter(c => c.table === 'news_reviewed_articles_public')) {
    assert.equal(call.params.get('admission'), 'eq.proposition')
  }
})


test('News detail never promotes raw article claim JSON past the reviewed projection', async () => {
  const { newsBackendFixture, reviewedNewsArticleFixture } = await import('./newsBackendFixture.mjs')
  const article = { id: '00000000-0000-4000-8000-000000000001', reader_state: 'eligible', source_status: 'active', title: 'Explicit reviewed source',
    url: 'https://example.invalid/article', outlet: 'Recorded publisher', fetched_at: '2026-08-03T12:00:00Z',
    claims: [{ kind: 'substantive', text: 'UNADMITTED_RAW_CLAIM' }, { kind: 'framing', text: 'UNADMITTED_RAW_FRAMING' }] }
  const tables = { articles: [article], news_reviewed_articles_public: [reviewedNewsArticleFixture(article,
    { admittedClaims: [{ text: 'ADMITTED_PUBLIC_CLAIM', excerpt: 'Exact retained words' }] })] }
  const f = newsBackendFixture({ tables })
  const detail = await f.backend.loadArticleDetail(article.id)
  assert.deepEqual(detail.claims.map(c => c.text), ['ADMITTED_PUBLIC_CLAIM'])
  assert.doesNotMatch(JSON.stringify(detail), /UNADMITTED_/)
  assert.ok(f.calls.every(c => c.table === 'news_reviewed_articles_public' && !c.params.get('select').split(',').includes('claims')))
})

test('comparison partial explanation payloads cannot publish unreviewed grounding', async () => {
  const { comparisonExplanationForReader } = await import('../src/lib/sourceComparisonReadPath.js')
  for (const patch of [{ review_status: 'awaiting_review' }, { state: 'source_unavailable' }, { state: 'insufficient_evidence' }]) {
    const row = { ...eligible(), ...patch, supporting_passage: 'UNREVIEWED_COMPARISON_GROUNDING', private_extra: 'PRIVATE_EXTRA' }
    const result = comparisonExplanationForReader(row)
    assert.equal(result.supporting_passage, null)
    assert.equal(result.review_status, row.review_status)
    assert.doesNotMatch(JSON.stringify(result), /UNREVIEWED_COMPARISON_GROUNDING|PRIVATE_EXTRA/)
  }
  assert.equal(comparisonExplanationForReader(eligible()).supporting_passage, eligible().supporting_passage)
})

test('public graph cannot publish relationships whose endpoints are outside its public node set', async () => {
  const { createPublicDataBackend } = await import('../src/lib/publicDataBackend.js')
  const f = evidenceBackendFixture({ tables: { nodes: [{ id: 'public-one', type: 'event' }, { id: 'public-two', type: 'event' }], edges: [
    { id: 'supported', source_id: 'public-one', target_id: 'public-two', type: 'sequence' },
    { id: 'unpublished-target', source_id: 'public-one', target_id: 'unpublished', type: 'causal' },
    { id: 'unpublished-source', source_id: 'unpublished', target_id: 'public-two', type: 'causal' },
  ] } })
  const graph = await createPublicDataBackend(f.client).loadGraph()
  assert.deepEqual(graph.edges.map(e => e.id), ['supported'])
  assert.equal(graph.source, 'supabase')
})

test('News source changes withhold detail, corpus, outlets, and metrics consistently', async () => {
  const { newsBackendFixture, reviewedNewsArticleFixture } = await import('./newsBackendFixture.mjs')
  const { fixtureUuid } = await import('./fixtures/newsStoryFixtures.mjs')
  const articles = ['active', 'corrected', 'withdrawn'].map((source_status, n) => ({ id: fixtureUuid(n + 1), reader_state: 'eligible', source_status,
    title: source_status, outlet: source_status, url: 'https://example.invalid/article', fetched_at: '2026-08-03T12:00:00Z', published_at: '2026-08-03T12:00:00Z' }))
  // Only the first retained source has an explicit current publication grant.
  const tables = { articles, news_reviewed_articles_public: [reviewedNewsArticleFixture(articles[0])] }
  const f = newsBackendFixture({ tables })
  assert.deepEqual((await f.backend.loadArticles()).articles.map(a => a.id), [articles[0].id])
  assert.equal((await f.backend.loadCorpusMeta()).count, 1)
  assert.equal(await f.backend.loadNewSinceCount('2026-08-01T00:00:00Z'), 1)
  assert.deepEqual((await f.backend.loadOutletDirectory()).map(o => o.name), ['active'])
  assert.deepEqual((await f.backend.loadFilteredSourceMetricRows()).map(a => a.id), [articles[0].id])
  assert.equal((await f.backend.loadArticleDetail(articles[1].id)).articleMissing, true)
  assert.equal((await f.backend.loadArticleDetail(articles[2].id)).articleMissing, true)
  assert.ok(f.calls.every(c => ['news_reviewed_articles_public', 'outlets'].includes(c.table)))
  assert.equal(f.calls.some(c => c.table === 'articles'), false)
})
