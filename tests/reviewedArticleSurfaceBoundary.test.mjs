import test from 'node:test'
import assert from 'node:assert/strict'
import { newsBackendFixture } from './newsBackendFixture.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'

const proposition = { id: '10000000-0000-4000-8000-000000000001', admission: 'proposition', title: 'Frozen reviewed title', summary: 'Frozen reviewed summary', outlet: 'Reviewed outlet', url: 'https://example.invalid/reviewed', arc_id: 'arc', published_at: '2026-10-01T12:00:00Z', fetched_at: '2026-10-01T12:01:00Z', reader_state: 'eligible', source_status: 'active' }
const report = { ...proposition, id: '20000000-0000-4000-8000-000000000001', admission: 'source_report', title: 'A permitted source report', url: 'https://example.invalid/report' }

function fixture() {
  const f = newsBackendFixture({ tables: {
    // The predecessor row deliberately contradicts the immutable projection.
    articles: [{ ...proposition, title: 'Unreviewed mutable replacement' }],
    news_reviewed_articles_public: [proposition, report],
    citations: [proposition, report].map((a, i) => ({ id: `citation-${i}`, article_id: a.id, resolved_node_id: 'node', cited_entity: 'Admitted graph subject' })),
    nodes: [{ id: 'node', label: 'Admitted graph subject', type: 'event', slug: 'evt-20000000' }],
    story_arcs: [{ id: 'arc', root_node_id: 'node', category: 'public_health', started_at: '2026-10-01' }],
    event_articles: [{ event_id: 'node', article_id: report.id }],
  } })
  return { ...f, backend: createPublicDataBackend(f.client) }
}

test('Graph, Arcs, flat and grouped Timeline use the same frozen proposition metadata', async () => {
  const f = fixture(), b = f.backend
  assert.deepEqual((await b.evidence.loadNodeArticles('node')).map(a => [a.id, a.title]), [[proposition.id, proposition.title]])
  assert.deepEqual((await b.chronology.loadArcArticles('arc')).map(a => a.id), [proposition.id])
  assert.equal((await b.chronology.loadArticleExcerpt(proposition.id)).summary, proposition.summary)
  assert.equal(await b.chronology.loadArticleExcerpt(report.id), null)
  const flat = await b.chronology.loadTimeline(), grouped = await b.chronology.loadArcGroupedTimeline()
  assert.deepEqual(flat.articleRecords.map(a => a.id), [proposition.id])
  assert.equal(grouped.grouped.counts.newsRecords, 1)
  assert.ok(f.calls.every(c => c.table !== 'articles'))
  assert.ok(f.calls.filter(c => c.table === 'news_reviewed_articles_public').every(c => c.params.get('admission') === 'eq.proposition'))
})

test('Source Report cannot acquire Graph or Timeline destinations from retained citations or matching slugs', async () => {
  const f = fixture(), b = f.backend.news
  assert.deepEqual(await b.loadArticleGraphLinks(report.id), [])
  assert.equal(await b.loadArticleTimelineKey(report.id), null)
  assert.deepEqual(await b.loadArticleComparisonEvents(report.id), [])
  assert.ok(f.calls.every(c => !['nodes', 'citations', 'comparison_public', 'articles'].includes(c.table)))
  const sources = await f.backend.evidence.loadEdgeSources([proposition.id, report.id])
  assert.equal(sources[0].title, proposition.title)
  assert.equal(sources[1].kind, 'unresolved')
})

test('reviewed source metrics keep permitted envelopes while excluding predecessor rows', async () => {
  const f = fixture(), b = f.backend.news
  assert.equal((await b.loadCorpusMeta()).count, 2)
  assert.equal((await b.loadFilteredSourceMetricRows()).length, 2)
  assert.ok(f.calls.every(c => c.table === 'news_reviewed_articles_public'))
})
