import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNewsStoryPresentation, validateNewsPage } from '../src/lib/newsStoryPresentation.js'

const article = { id: 'story-1', title: 'Synthetic publisher record', summary: 'Recorded summary.',
  outlet: 'Fixture outlet', published_at: '2026-09-01T12:00:00Z', url: 'https://example.invalid/story',
  arc_id: 'arc-1', arc_title: 'Recorded arc' }

test('public story model excludes private payloads and does not infer editorial or confidence labels', () => {
  const story = buildNewsStoryPresentation({ ...article, privateComparison: 'private sentinel',
    claims: [{ text: 'private claim sentinel' }], confidence: .99, breaking: true, pinned: true })
  assert.ok(Object.isFrozen(story))
  assert.equal(story.title, article.title)
  assert.equal(story.provenanceLabel, 'Source-linked summary')
  assert.equal(story.arc, null)
  assert.doesNotMatch(JSON.stringify(story), /sentinel|confidence|breaking|pinned/)
})

test('provenance and navigation require recorded joins and available callers', () => {
  const joins = { citation: { citedTypes: new Set(['court_doc']), hasGraphLink: true, firstNodeId: 'node-1' },
    region: 'Recorded region', canOpenArc: true, canOpenNode: true }
  const story = buildNewsStoryPresentation(article, joins)
  assert.equal(story.provenanceLabel, 'Primary filing linked')
  assert.deepEqual(story.arc, { id: 'arc-1', title: 'Recorded arc' })
  assert.equal(story.graphNodeId, 'node-1')
  assert.equal(story.region, 'Recorded region')
  const unavailable = buildNewsStoryPresentation(article, { ...joins, canOpenArc: false, canOpenNode: false })
  assert.equal(unavailable.arc, null); assert.equal(unavailable.graphNodeId, null)
})

test('unknown source and date fields remain explicit without fabricated attribution', () => {
  const story = buildNewsStoryPresentation({ id: 'unknown', title: null, published_at: 'not-a-date' })
  assert.equal(story.title, 'Untitled article')
  assert.equal(story.outlet, 'unknown outlet')
  assert.equal(story.publishedAt, null)
  assert.equal(story.provenanceLabel, 'Publisher source URL not recorded')
})

test('reader-page validation refuses malformed identities, count and duplicate rows', () => {
  for (const page of [null, { articles: null, total: 0 }, { articles: [article], total: NaN },
    { articles: [{ ...article, id: null }], total: 1 }, { articles: [{ ...article, title: {} }], total: 1 },
    { articles: [article, article], total: 2 }]) assert.throws(() => validateNewsPage(page), TypeError)
  const page = { articles: [], total: 0, articlesUnavailable: 'permission_denied' }
  assert.equal(validateNewsPage(page), page)
})
