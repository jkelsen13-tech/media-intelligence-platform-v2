import test from 'node:test'
import assert from 'node:assert/strict'
import { exactSpan, canonicalUrl, analyzeSources, resolveIdentity, createPreview } from '../scripts/demoCorpus.mjs'
const record = { topic: 'epstein', url: 'https://example.org/a', title: 'Oversight statement', article_id: 'a', capture_id: 'c', content_hash: 'h', reader_state: 'pending_review', capture_state: 'pending' }
test('Unicode spans use code points and reject ambiguous or normalized substitutions', () => {
  assert.deepEqual(exactSpan('😀 Aé Z', 'Aé'), { span_start: 2, span_end: 4 })
  assert.throws(() => exactSpan('x x', 'x'))
  assert.throws(() => exactSpan('e\u0301', 'é'))
  assert.throws(() => exactSpan('abc', ''))
})
test('URL tracking dedupes while semantic versions and query identity survive', () => {
  assert.equal(canonicalUrl('https://EXAMPLE.org/a?utm_source=x&id=2#x'), 'https://example.org/a?id=2')
  const result = analyzeSources([record, { ...record, url: record.url + '?utm_source=x' }, { ...record, content_hash: 'correction' }])
  assert.equal(result.unique_urls, 1); assert.equal(result.versions, 2)
  assert.equal(result.independent_origins, 0)
})
test('syndicated or dependent sources never multiply independent origins', () => {
  const result = analyzeSources([record, { ...record, url: 'https://example.org/b' }].map(r => ({ ...r, origin_id: 'agency', dependency_id: 'release-1' })))
  assert.equal(result.independent_origins, 1)
  assert.deepEqual(result.dependency_groups, [['release-1', 2]])
  const conflicting = analyzeSources([{ ...record, origin_id: 'publisher-a', dependency_id: 'wire-1' }, { ...record, origin_id: 'publisher-b', dependency_id: 'wire-1' }])
  assert.equal(conflicting.independent_origins, 0)
  assert.equal(conflicting.warnings[0].reason, 'conflicting_origin_assignment')
})
test('actor labels and duplicate canonical references cannot resolve identity', () => {
  const actor = { namespace: 'person', id: '1', label: 'Smith' }
  assert.equal(resolveIdentity({ label: 'Smith' }, [actor]), null)
  assert.equal(resolveIdentity(actor, [actor, actor]), null)
  assert.equal(resolveIdentity({ namespace: 'event', id: '1' }, [actor]), null)
  assert.equal(resolveIdentity(actor, [actor]), actor)
})
test('private source identity continues across surfaces without a public node or causal edge', () => {
  const view = createPreview([record])[1], id = view.sources[0].preview_id
  assert.equal(view.comparison.sources[0], id); assert.equal(view.graph.nodes[0].id, id); assert.equal(view.arc.members[0], id)
  assert.deepEqual(view.graph.edges, []); assert.equal(view.sources[0].public_node_id, null)
  assert.equal(view.sources[0].geography.causal_inference, false); assert.equal(view.admission.allowed, false)
})
test('mention and proposal semantics do not silently become misconduct or implementation', () => {
  for (const semantic_kind of ['document_mention', 'policy_proposal', 'agency_action', 'disputed_statement']) {
    const source = createPreview([{ ...record, semantic_kind }])[1].sources[0]
    assert.equal(source.semantic_kind, semantic_kind); assert.equal(source.publication_allowed, false)
    assert.equal(source.timeline_basis, 'source_publication_date_only')
  }
})
test('default deny rejects eligible, absent and unretained receipts', () => {
  for (const patch of [{ reader_state: 'eligible' }, { capture_state: undefined }, { capture_id: null }, { candidate_id: 'x', candidate_state: 'approved' }]) assert.throws(() => createPreview([{ ...record, ...patch }]))
})
test('corrections and contradictory statements retain distinct capture identities', () => {
  const sources = createPreview([record, { ...record, capture_id: 'c2', content_hash: 'h2', statement: 'contradicts previous statement' }])[1].sources
  assert.notEqual(sources[0].preview_id, sources[1].preview_id)
  assert.equal(sources[0].article_id, sources[1].article_id)
})
