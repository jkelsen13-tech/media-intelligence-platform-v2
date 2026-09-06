import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, stat, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { CONTRACT, createProposalSession, proposalTerms } from '../scripts/captureContextProposal.mjs'
import { prepareCollection } from '../scripts/evaluateCaptureCollection.mjs'
import { compareCaptureProposals, writePrivateResult } from '../scripts/runCaptureContextProposal.mjs'

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const row = (n, text, overrides = {}) => ({ id: id(n), feed: 'bbc-news', source_status: 'active',
  fetched_at: '2026-09-06T00:00:00Z', published_at: '2026-08-01T00:00:00Z',
  url: `https://example.org/proposal/${n}`, title: 'Report', outlet: 'Synthetic fixture',
  summary: text, body_text: text, ...overrides })
const a = row(1, 'Orchestra violin rehearsal performance musicians concert acoustics harmony ensemble. Continue reading...')
const b = row(2, 'Wetlands riverbank restoration habitat wildlife ecology environment conservation biodiversity. Continue reading...')
const context = (rows, n, quote, family = 'case', key = 'case-17', version = '1') => {
  const r = prepareCollection(rows).accepted.find(r => r.source_id === id(n))
  const field = 'body_text', chars = Array.from(r.article[field]), start = Array.from(r.article[field].slice(0, r.article[field].indexOf(quote))).length
  return { source_id: r.source_id, article_sha256: r.article_sha256, bindings: [{ family, key,
    resolution_id: `fixture-resolution-${n}`, resolution_version: version,
    span: { field, start, end: start + Array.from(quote).length, quote } }] }
}
const pair = session => session.page({ source_id: id(1) }).items[0]

test('display boilerplate alone no longer creates a proposal; raw text remains exact', () => {
  const s = createProposalSession([a, b]), p = pair(s)
  assert.equal(p.disposition, 'no_candidate_signal')
  assert.deepEqual(s.input(id(1)).article.body_text, a.body_text)
  assert.equal(s.input(id(1)).text_extent, 'body_repeats_summary')
  assert.ok(!proposalTerms(a).includes('continue'))
})

test('filter keeps narrative wording, rejects internal suffix removal and preserves field precedence', () => {
  assert.ok(proposalTerms({ title: '', summary: 'Teachers continue reading studies to pupils.' }).includes('continue'))
  assert.ok(proposalTerms({ title: '', summary: 'Continue reading... More follows.' }).includes('reading'))
  assert.deepEqual(proposalTerms({ title: '', body_text: 'Continue reading...', summary: 'Wetlands riverbank' }), [])
  assert.deepEqual(proposalTerms({ title: '', body_text: '', summary: 'Wetlands riverbank Continue reading…' }), ['riverbank', 'wetlands'])
})

test('exact context retrieves absent lexical pairs and keeps a semantic review boundary', () => {
  const rows = [a, b], contexts = [context(rows, 1, 'Orchestra'), context(rows, 2, 'Wetlands')]
  const p = pair(createProposalSession(rows, contexts))
  assert.equal(p.signals.lexical, false)
  assert.equal(p.disposition, 'retrieval_proposal')
  assert.equal(p.verification_state, 'needs_semantic_verification')
  assert.equal(p.publicly_eligible, false)
  assert.equal(p.confidence, null)
  assert.equal(p.identity_authority, 'caller_supplied_versioned_annotations_not_registry_verified')
  assert.ok(p.remaining_checks.includes('relation_type_and_endpoint_bound_support'))
})

test('shared actors remain insufficient event context; a place alone is not a candidate signal', () => {
  const rows = [a, b]
  for (const family of ['entity', 'place']) {
    const p = pair(createProposalSession(rows, [context(rows, 1, 'Orchestra', family), context(rows, 2, 'Wetlands', family)]))
    assert.equal(p.disposition, family === 'entity' ? 'retrieval_proposal' : 'no_candidate_signal')
    if (family === 'entity') assert.equal(p.verification_state, 'insufficient_bound_context')
  }
})

test('identity families cannot collapse graph events into comparison groups', () => {
  const rows = [a, b]
  const p = pair(createProposalSession(rows, [context(rows, 1, 'Orchestra', 'graph_event'), context(rows, 2, 'Wetlands', 'comparison_event')]))
  assert.equal(p.disposition, 'no_candidate_signal')
  assert.deepEqual(p.signals.shared_identities, [])
})

test('seed bank versus central bank and unrelated casualty reports require bound context', () => {
  const rows = [row(1, 'The seed bank conservation team reported that twelve people visited the wetlands and river habitats.'),
    row(2, 'The central bank announced that twelve people visited the finance committee and discussed monetary policy.')]
  const p = pair(createProposalSession(rows))
  assert.equal(p.disposition, 'retrieval_proposal')
  assert.equal(p.verification_state, 'insufficient_bound_context')
})

test('numeric changes and negation preserve proposals and raw evidence, never infer agreement', () => {
  const rows = [row(1, 'The agency confirmed 12 deaths in Michigan. Investigators continue documenting the incident and its circumstances.'),
    row(2, 'The agency did not confirm 120 deaths in Michigan. Investigators continue documenting the incident and its circumstances.')]
  const s = createProposalSession(rows), p = pair(s)
  assert.equal(p.disposition, 'retrieval_proposal')
  assert.equal(p.verification_state, 'insufficient_bound_context')
  assert.match(s.input(id(2)).article.body_text, /did not confirm 120/)
  assert.ok(p.remaining_checks.includes('polarity_and_modality'))
  assert.ok(p.remaining_checks.includes('quantity_unit_subject_and_attribution'))
  assert.ok(!('outcome' in p))
})

test('metadata, withdrawn material and missing text are rejected and reported', () => {
  const s = createProposalSession([a, b, row(3, 'GDELT structured event record; not publisher article text.'),
    row(4, a.body_text, { source_status: 'withdrawn' }), row(5, 'Too short')])
  assert.deepEqual(s.manifest.rejected.map(r => r.reason), ['metadata_not_publisher_text', 'inactive_source', 'insufficient_retained_text'])
  assert.throws(() => s.input(id(3)), /rejected/)
  assert.equal(s.manifest.admitted.length, 2)
})

test('same-URL versions are labeled separately and outlet copies do not increase independence', () => {
  const p = pair(createProposalSession([a, row(2, a.body_text, { url: a.url })]))
  assert.equal(p.disposition, 'same_source_url')
  const copied = pair(createProposalSession([a, row(2, a.body_text, { outlet: 'Another publisher' })]))
  assert.equal(copied.independent_source_count, null)
  assert.equal(copied.publicly_eligible, false)
})

test('exact span validation uses Unicode code points and binds context to one article version', () => {
  const rows = [row(1, '😀 Café archive preservation researchers catalogue historical documents across several public institutions and libraries.'), b]
  const good = context(rows, 1, 'Café'), s = createProposalSession(rows, [good])
  assert.equal(s.input(id(1)).bindings[0].span.start, 2)
  const wrongOffset = structuredClone(good); wrongOffset.bindings[0].span.start++
  assert.throws(() => createProposalSession(rows, [wrongOffset]), /raw span/)
  const wrongHash = { ...good, article_sha256: '0'.repeat(64) }
  assert.throws(() => createProposalSession(rows, [wrongHash]), /fingerprint/)
  const invented = structuredClone(good); invented.bindings[0].span.quote = 'Invented'
  assert.throws(() => createProposalSession(rows, [invented]), /raw span/)
})

test('unmapped or malformed contexts fail rather than gaining authority silently', () => {
  const rows = [a, b], c = context(rows, 1, 'Orchestra')
  assert.throws(() => createProposalSession(rows, [c, c]), /duplicate/)
  assert.throws(() => createProposalSession(rows, [{ ...c, source_id: id(9) }]), /unadmitted/)
  const unknown = structuredClone(c); unknown.bindings[0].family = 'ticker'
  assert.throws(() => createProposalSession(rows, [unknown]), /identity/)
  const missing = structuredClone(c); delete missing.bindings[0].resolution_version
  assert.throws(() => createProposalSession(rows, [missing]), /identity/)
  assert.throws(() => createProposalSession(rows, [{ ...c, confidence: 1 }]), /fields/)
})

test('duplicate bindings cannot multiply signals and resolution versions change proposal identities', () => {
  const rows = [a, b], c1 = context(rows, 1, 'Orchestra'), c2 = context(rows, 2, 'Wetlands')
  const s = createProposalSession(rows, [c1, c2]), duplicate = structuredClone(c1)
  duplicate.bindings.push(structuredClone(duplicate.bindings[0]))
  assert.deepEqual(pair(s), pair(createProposalSession(rows, [duplicate, c2])))
  const revised = structuredClone(c1); revised.bindings[0].resolution_version = '2'
  assert.notEqual(pair(s).proposal_id, pair(createProposalSession(rows, [revised, c2])).proposal_id)
  assert.equal(pair(s).contract, CONTRACT)
})

test('pair identity is symmetric and ignores unrelated arrivals while input changes create new results', () => {
  const s = createProposalSession([a, b]), forward = pair(s)
  assert.deepEqual(s.page({ source_id: id(2) }).items[0], forward)
  const expanded = createProposalSession([a, b, row(3, a.body_text)])
  assert.equal(pair(expanded).proposal_id, forward.proposal_id)
  const changed = createProposalSession([{ ...a, summary: a.summary + ' Correction.' }, b])
  assert.notEqual(pair(changed).proposal_id, forward.proposal_id)
})

test('frozen session and returned evidence are independent from caller mutations', () => {
  const rows = structuredClone([a, b]), c = context(rows, 1, 'Orchestra'), s = createProposalSession(rows, [c]), original = pair(s)
  rows[0].body_text = 'Changed'; c.bindings[0].key = 'Changed'
  s.input(id(1)).article.body_text = 'Changed'
  assert.deepEqual(pair(s), original)
  assert.throws(() => { s.manifest.admitted[0].article_sha256 = 'changed' }, TypeError)
})

test('pagination covers older records without top-k truncation and binds cursors to a snapshot and source', () => {
  const rows = Array.from({ length: 52 }, (_, i) => row(i + 1, a.body_text, { published_at: i % 2 ? '1980-01-01T00:00:00Z' : a.published_at }))
  const s = createProposalSession(rows), first = s.page({ source_id: id(1), limit: 25 })
  assert.equal(first.coverage, 'partial'); assert.equal(first.total_targets, 51)
  const second = s.page({ source_id: id(1), after: first.next_after }), last = s.page({ source_id: id(1), after: second.next_after })
  assert.equal(last.coverage, 'complete'); assert.equal(last.next_after, null)
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map(p => p.proposal_id)).size, 51)
  assert.deepEqual(s.page({ source_id: id(1), after: first.next_after }), second)
  assert.throws(() => s.page({ source_id: id(2), after: first.next_after }), /cursor/)
  const changed = createProposalSession(rows.map(r => r.id === id(1) ? { ...r, summary: r.summary + ' Update.' } : r))
  assert.throws(() => changed.page({ source_id: id(1), after: first.next_after }), /cursor/)
})

test('new historical record and new mapping discover formerly absent proposals in a fresh session', () => {
  const first = createProposalSession([a, b]); assert.equal(pair(first).disposition, 'no_candidate_signal')
  const historical = row(3, 'Archive agreement records link institutional changes across decades. Original records remain available for investigation.', { published_at: '1980-01-01T00:00:00Z' })
  const rows = [a, b, historical]
  const fresh = createProposalSession(rows, [context(rows, 1, 'Orchestra'), context(rows, 3, 'Archive agreement')])
  const discovered = fresh.page({ source_id: id(1) }).items.find(p => p.right.source_article_id === id(3))
  assert.equal(discovered.disposition, 'retrieval_proposal')
  assert.equal(discovered.signals.lexical, false)
  assert.equal(first.manifest.admitted.length, 2)
})

test('historical knowledge, invalid page requests and collection overflow fail explicitly', () => {
  const s = createProposalSession([a, b])
  assert.throws(() => s.page({ source_id: id(1), as_of: '2023-01-01' }), /historical knowledge/)
  for (const limit of [0, 26, 1.5, '2']) assert.throws(() => s.page({ source_id: id(1), limit }), /limit/)
  assert.throws(() => s.page({ source_id: id(1), after: 'invalid' }), /cursor/)
  assert.throws(() => s.page({ source_id: id(1), top_k: 5 }), /fields/)
  assert.throws(() => createProposalSession(Array.from({ length: 101 }, (_, i) => row(i + 1, a.body_text))), /2..100/)
})

test('new lexical implementation agrees with unchanged SQL on cleaned selected-text fixtures', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(await readFile(new URL('./changeQueueFixture.sql', import.meta.url), 'utf8'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'evidence_capture_retrieval_v1']) {
    const matches = files.filter(file => file.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await readFile(new URL(`../supabase/migrations/${matches[0]}`, import.meta.url), 'utf8'))
  }
  const fixtures = [a, b, { title: 'Café 😀', summary: 'Riverbank WETLANDS 12345 conservation co-operation.' },
    { title: 'Report', summary: 'Wetlands riverbank', body_text: 'Continue reading...' },
    { title: 'Case-42', body_text: '', summary: 'Teachers continue reading studies. Continue reading…' },
    { title: '', body_text: 'a'.repeat(81) + ' ' + 'b'.repeat(80) + ' did not confirm 120 deaths.', summary: null }]
  for (const article of fixtures) {
    const selected = article.body_text != null && article.body_text !== '' ? article.body_text : article.summary ?? ''
    const cleaned = selected.replace(/\s*Continue reading(?:\.{3}|…)\s*$/iu, '')
    const expected = (await db.query('select evidence_pipeline.capture_terms($1::jsonb) terms', [JSON.stringify({ title: article.title, body_text: cleaned, summary: cleaned })])).rows[0].terms
    assert.deepEqual(proposalTerms(article), expected)
  }
})

test('comparison runs actual baseline and keeps evidence once per input, never claims accuracy', async () => {
  const rows = [a, b], result = await compareCaptureProposals(rows)
  assert.equal(result.summary.baseline_proposals, 1); assert.equal(result.summary.context_proposals, 0)
  assert.equal(result.summary.enumerated_pairs, 1); assert.equal(result.summary.semantic_accuracy, null)
  assert.equal(result.inputs.length, 2); assert.equal(result.inputs[0].article.body_text, a.body_text)
  assert.equal(result.items[0].left.identity_family, 'source_article_snapshot')
  assert.ok(!('article' in result.items[0].left)); assert.equal(result.summary.deployed, false)
})

test('private result creation cannot overwrite inputs, existing output or symlinks', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mip-proposal-')); t.after(() => rm(dir, { recursive: true, force: true }))
  const output = join(dir, 'result.json'), link = join(dir, 'link.json')
  await writePrivateResult(output, { original: true })
  assert.equal((await stat(output)).mode & 0o777, 0o600)
  await assert.rejects(writePrivateResult(output, { original: false }), /EEXIST/)
  await symlink(output, link); await assert.rejects(writePrivateResult(link, {}), /EEXIST/)
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { original: true })
})
