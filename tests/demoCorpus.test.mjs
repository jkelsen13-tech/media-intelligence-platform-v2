import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { exactSpan, canonicalUrl, analyzeSources, resolveIdentity, createPreview, nearDuplicates, validatePrivateRelation, syntheticProjection, projectReceipt } from '../scripts/demoCorpus.mjs'
const record = { topic: 'epstein', url: 'https://example.org/a', title: 'Oversight statement', article_id: 'a', capture_id: 'c', candidate_id: 'd', content_hash: 'a'.repeat(64), span_start: 0, span_end: 3, reader_state: 'pending_review', capture_state: 'pending', candidate_state: 'pending', semantic_kind: 'oversight_statement' }
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
test('body-derived near duplicates are review suggestions, not extra corroboration', () => {
  const text = 'The committee released new records following the formal oversight request on Monday'
  const pairs = nearDuplicates([{ url: 'a', excerpt: text }, { url: 'b', excerpt: text + ' morning' }, { url: 'c', excerpt: 'Different legal question concerning grant appropriations across multiple federal agencies and offices' }])
  assert.equal(pairs.length, 1); assert.equal(pairs[0].disposition, 'human_dependency_review_required')
  assert.deepEqual(nearDuplicates([{ url: 'a', excerpt: 'The motion passed' }, { url: 'b', excerpt: 'The motion passed' }]), [])
})
test('causal, misconduct, person guilt and proposal-to-outcome relations fail closed', () => {
  const ref = { namespace: 'synthetic:epstein', id: 'event-1' }, registry = syntheticProjection('epstein').registry
  for (const type of ['causes', 'guilty_by_mention', 'private_person_misconduct', 'proposal_implemented', 'outcome_proven']) assert.throws(() => validatePrivateRelation({ type, from: ref, to: ref, publication_allowed: false }, registry))
})
test('synthetic canonical joins preserve separate comparison and graph families', () => {
  const fixture = syntheticProjection('iran'), event = fixture.timeline[0]
  assert.equal(fixture.geography[0].event, event); assert.equal(fixture.arc.members[0], event)
  assert.equal(fixture.comparison_event.graph_event, event)
  assert.notEqual(fixture.comparison_event.namespace, event.namespace)
  assert.equal(fixture.relationships.every(r => r.publication_allowed === false), true)
  assert.throws(() => validatePrivateRelation({ type: 'synthetic_event_place', from: event, to: { namespace: 'real', id: 'x' }, publication_allowed: false }, [...fixture.registry, { namespace: 'real', id: 'x' }]))
})
test('compiled isolated preview has no live backend/auth/operator import path', async () => {
  const result = await build({ entryPoints: ['scripts/demo-corpus-preview.jsx'], bundle: true, write: false, outdir: 'memory-only', metafile: true, jsx: 'automatic', logLevel: 'silent' })
  const inputs = Object.keys(result.metafile.inputs)
  assert.ok(inputs.some(p => p.endsWith('expanded-source-receipts.json')))
  assert.equal(inputs.some(p => /supabase|mipBackend|operatorBackend|investigationBackend|src\/App|authSession|themeFlag/i.test(p)), false)
  assert.deepEqual(inputs.filter(p => p.startsWith('src/')), ['src/styles/tokens.css'])
  assert.equal(result.errors.length, 0)
})

test('explicit projection schema rejects canonical leakage and non-HTTPS URLs', () => {
  for (const patch of [{ public_node_id: 'public-1' }, { canonical_claim_id: 'claim-1' }, { canonical_event_id: 'event-1' }, { relationship_id: 'edge-1' }, { admission_id: 'receipt-1' }, { url: 'javascript:alert(1)' }]) {
    assert.throws(() => projectReceipt({ ...record, ...patch }))
  }
  const projected = projectReceipt({ ...record, unexpected_future_field: 'must not leak' })
  assert.equal('unexpected_future_field' in projected, false)
  assert.equal(projected.publication_allowed, false)
  assert.equal(projected.public_node_id, null)
  assert.equal(Object.isFrozen(projected), true)
})

test('all retained receipts project to exact counts with no public identity', async () => {
  const initial = (await import('../verifier/demo-corpus-20260916/retained-source-receipts.json', { with: { type: 'json' } })).default
  const expanded = (await import('../verifier/demo-corpus-20260916/expanded-source-receipts.json', { with: { type: 'json' } })).default
  const views = createPreview([...initial, ...expanded])
  assert.deepEqual(Object.fromEntries(views.map(v => [v.topic, v.sources.length])), { iran: 30, epstein: 30, project2025: 33 })
  assert.equal(views.flatMap(v => v.sources).every(s => s.publication_allowed === false && s.public_node_id === null && s.timeline_basis === 'source_publication_date_only'), true)
})

test('candidate, capture and article namespaces never collapse across surfaces', () => {
  const view = createPreview([record]).find(v => v.topic === 'epstein'), source = view.sources[0]
  assert.notEqual(source.article_id, source.capture_id)
  assert.notEqual(source.candidate_id, source.capture_id)
  assert.equal(view.comparison.sources[0], `private:capture:${source.capture_id}`)
  assert.equal(view.arc.members[0], `private:capture:${source.capture_id}`)
  assert.equal(view.graph.edges.length, 0)
})
