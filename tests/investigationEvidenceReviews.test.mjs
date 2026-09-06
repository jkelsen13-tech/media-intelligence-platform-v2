import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createEvidenceReviewsHandler, createEvidenceReviewsTransport } from '../supabase/functions/investigation-evidence-reviews/handler.mjs'
import { createInvestigationEvidenceReviewsClient, investigationEvidenceReviewPanels } from '../src/lib/investigationEvidenceReviewsClient.js'

const origin = 'https://jkelsen13-tech.github.io'
const emptyState = { question: 'What changed in the retained reporting?', scope_note: 'Synthetic fixture only.', canonical_subject: null,
  time_range: { from: null, to: null, meaning: 'Source interval unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
test('evidence review ledger: real SQL, idempotent decisions, conflicts and immutable history', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const uid = randomUUID(), viewer = randomUUID(), outsider = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3)', [uid, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1',
    'investigation_change_briefings_v1', 'investigation_workspace_batch_v1', 'investigation_evidence_checks_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const reviewMigration = files.find(f => f.endsWith('_investigation_evidence_reviews_v1.sql'))
  assert.ok(reviewMigration); await db.exec(await read('../supabase/migrations/' + reviewMigration))
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1'), checks = rpc('mip_investigation_evidence_checks_v1')
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async (url, summary) => {
    await intake('enqueue', { run_id: 'evidence-checks-fixture', article: { url, title: 'Fixture only', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const j = await intake('claim'); return intake('finish', { job_id: j.id, lease_token: j.lease_token })
  }
  const text = 'A corrected retained fixture report with enough exact text to propose a shared source without asserting source independence.'
  const cap = await add('https://example.org/checks-a', text)
  const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'checks', candidate_kind: 'claim', statement: text,
    source_field: 'summary', span_start: 0, span_end: Array.from(text).length, excerpt: text, extractor_version: 'fixture', remaining_uncertainty: 'Fixture only.' })
  const obs = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const iid = randomUUID(), vid = randomUUID()
  await ws('put', { investigation_id: iid, version_id: vid, previous_version_id: null, observation_id: obs.id, state: emptyState, change_reason: 'Fixture only.' })
  const assign = (user, role) => ws('set_access', { investigation_id: iid, user_id: user, access_role: role, reason: 'Fixture assignment.' })
  const args = (user = uid, version = vid) => ({ user_id: user, investigation_id: iid, version_id: version })
  const baseline = await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts')
  const reviews = rpc('mip_investigation_evidence_reviews_v1')
  await assign(uid, 'reviewer'); await assign(viewer, 'viewer')
  const saved = await checks('run', args())
  const rid = saved.report.id
  const cue = saved.report.result.challenge_cues[0]
  const base = { ...args(), report_id: rid }
  const evidence = [{ ...cue.reference, relation: 'context', note: 'Exact retained context; no factual verdict.' }]
  const decide = (overrides = {}) => ({ ...base, target_kind: 'evidence_cue', target_id: cue.id, event_id: randomUUID(),
    previous_event_id: null, decision: 'relevant', rationale: 'Retain for contextual review.', evidence, ...overrides })
  let first, second, firstInput
  await db.exec('set role service_role')
  await t.test('read is inert, defaults to needs review and never claims independence', async () => {
    const before = await reviews('read', base)
    assert.equal(before.mode, 'overview'); assert.equal(before.revision, '0')
    assert.equal(before.summary.never_reviewed, before.summary.returned_targets)
    assert.equal(before.independence, 'unknown'); assert.equal(before.assessment_effect, 'none')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_evidence_review_events'), 0)
  })
  await t.test('reviewer decision is append-only; exact retry returns the original receipt', async () => {
    firstInput = decide(); first = await reviews('decide', firstInput)
    assert.equal(first.event.revision, '1'); assert.equal(first.event.authored_by_you, true)
    assert.ok(!Object.hasOwn(first.event, 'recorded_by'))
    assert.equal(first.mode, 'receipt'); assert.equal(first.replayed, false)
    const retry = await reviews('decide', firstInput)
    assert.deepEqual(retry.event, first.event); assert.equal(retry.replayed, true)
    assert.equal((await reviews('read', base)).summary.relevant, 1)
    assert.deepEqual(await checks('read', args()), saved)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts'), baseline)
  })
  await t.test('stale writes and changed idempotency payloads conflict without overwriting', async () => {
    await assert.rejects(reviews('decide', decide()), e => e.code === '40001')
    await assert.rejects(reviews('decide', { ...firstInput, rationale: 'Changed request.' }), e => e.code === '40001')
    second = await reviews('decide', decide({ previous_event_id: first.event.id, decision: 'disputed' }))
    assert.equal(second.event.previous_event_id, first.event.id)
    assert.equal(second.event.revision, '2')
    assert.equal((await reviews('read', base)).summary.disputed, 1)
    const retry = await reviews('decide', firstInput)
    assert.deepEqual(retry.event, first.event); assert.equal(retry.revision, '2')
    assert.equal((await reviews('read', base)).summary.disputed, 1)
  })
  await t.test('history is pinned to a named ledger revision and hides actor identifiers', async () => {
    const request = { ...base, target_kind: 'evidence_cue', target_id: cue.id, at_revision: '1', before_revision: null }
    const old = await reviews('history', request)
    assert.equal(old.events.length, 1); assert.equal(old.events[0].decision, 'relevant')
    const viewed = await reviews('history', { ...request, user_id: viewer, at_revision: '2' })
    assert.equal(viewed.events.length, 2); assert.equal(viewed.events[0].authored_by_you, false)
    assert.equal(viewed.next_before_revision, null)
    await assert.rejects(reviews('history', { ...request, at_revision: '99' }), e => e.code === '22023')
    await assert.rejects(reviews('history', { ...request, at_revision: 1 }), e => e.code === '22023')
  })
  await t.test('nonexistent targets, invented evidence and invalid semantic labels are rejected', async () => {
    for (const overrides of [
      { target_id: 'cue:absent' }, { decision: 'verified_independent' }, { rationale: '  ' }, { evidence: [] },
      { evidence: [{ ...evidence[0], excerpt: 'fabricated' }] },
      { evidence: [{ ...evidence[0], position: '999999' }] }, { evidence: [evidence[0], evidence[0]] },
      { evidence: [{ position: cue.position, source_field: 'source_status', value: 'withdrawn' }] },
    ]) await assert.rejects(reviews('decide', decide({ previous_event_id: second.event.id, ...overrides })), e => e.code === '22023')
  })
  await t.test('viewers, outsiders, wrong version/report pairs and revoked reviewers cannot write', async () => {
    for (const user of [viewer, outsider]) await assert.rejects(reviews('decide', decide({ user_id: user })), e => e.code === '42501')
    assert.equal((await reviews('read', { ...base, user_id: viewer })).access_role, 'viewer')
    for (const changes of [{ user_id: outsider }, { version_id: randomUUID() }, { investigation_id: randomUUID() }, { report_id: randomUUID() }])
      await assert.rejects(reviews('read', { ...base, ...changes }), e => e.code === '42501')
    await assign(uid, 'revoked')
    await assert.rejects(reviews('decide', firstInput), e => e.code === '42501')
    await assert.rejects(reviews('read', base), e => e.code === '42501')
    await assign(uid, 'reviewer')
  })
  await t.test('new versions start unreviewed even when they reuse an observation', async () => {
    const next = randomUUID()
    await ws('put', { investigation_id: iid, version_id: next, previous_version_id: vid, observation_id: obs.id, state: emptyState, change_reason: 'New version.' })
    const report = await checks('run', args(uid, next))
    assert.equal((await reviews('read', { ...base, version_id: next, report_id: report.report.id })).revision, '0')
    assert.equal((await reviews('read', base)).revision, '2')
  })
  await t.test('paginated history remains complete and stable while later decisions arrive', async () => {
    let previous = second.event.id
    for (let n = 0; n < 51; n++) {
      const receipt = await reviews('decide', decide({ previous_event_id: previous, decision: n % 2 ? 'not_relevant' : 'needs_review' }))
      previous = receipt.event.id
    }
    const request = { ...base, target_kind: 'evidence_cue', target_id: cue.id, at_revision: '52', before_revision: null }
    const page1 = await reviews('history', request)
    assert.equal(page1.events.length, 20); assert.equal(page1.events[0].revision, '52'); assert.equal(page1.next_before_revision, '33')
    const page2 = await reviews('history', { ...request, before_revision: page1.next_before_revision })
    assert.equal(page2.events.length, 20); assert.equal(page2.next_before_revision, '13')
    const page3 = await reviews('history', { ...request, before_revision: page2.next_before_revision })
    assert.deepEqual(page3.events.map(e => e.revision), Array.from({ length: 12 }, (_, n) => String(12 - n))); assert.equal(page3.next_before_revision, null)
    assert.equal((await reviews('read', base)).revision, '53')
  })
  await t.test('source-link decisions cite both retained inputs; metadata decisions bind the saved status', async () => {
    await add('https://example.org/checks-a', '🧬 A correction cue in a second retained input. This is synthetic source text for comparison only.')
    await db.exec('reset role')
    await db.query("update public.articles set source_status='withdrawn' where url='https://example.org/checks-a'")
    await db.exec('set role service_role')
    const newer = await observe('observe', { observation_id: randomUUID(), previous_observation_id: obs.id, candidate_ids: [candidate] })
    const head = await scalar('select current_version_id from evidence_pipeline.investigations where id=$1', [iid])
    const next = randomUUID()
    await ws('put', { investigation_id: iid, version_id: next, previous_version_id: head, observation_id: newer.id, state: emptyState, change_reason: 'Fixture new inputs.' })
    const report = await checks('run', args(uid, next))
    const pair = report.report.result.lineage_candidates[0], statusCue = report.report.result.challenge_cues.find(c => c.metadata_reference)
    assert.ok(pair); assert.ok(statusCue)
    const newBase = { ...base, version_id: next, report_id: report.report.id }
    const refs = [pair.left_excerpt, pair.right_excerpt].map(e => ({ ...e, relation: 'context', note: 'Compare these exact inputs.' }))
    const decision = { ...decide(), ...newBase, target_kind: 'source_link', target_id: pair.id, evidence: refs }
    await assert.rejects(reviews('decide', { ...decision, evidence: [refs[0]] }), e => e.code === '22023')
    const receipt = await reviews('decide', decision)
    assert.equal(receipt.event.target_kind, 'source_link')
    const metadata = await reviews('decide', { ...decide(), ...newBase, target_id: statusCue.id, evidence: [statusCue.metadata_reference] })
    assert.equal(metadata.event.evidence[0].value, 'withdrawn')
    await assert.rejects(reviews('decide', { ...decide(), ...newBase, target_id: statusCue.id, evidence: [{ ...statusCue.metadata_reference, value: 'corrected' }] }), e => e.code === '22023')
    const overview = await reviews('read', newBase)
    const workspace = await ws('read', { ...args(uid, next) })
    const mapped = investigationEvidenceReviewPanels(workspace, report, overview)
    assert.ok(mapped); assert.equal(mapped.canDecide, true)
    assert.ok(mapped.targets.every(t => !t.latest_event || (!Object.hasOwn(t.latest_event, 'evidence') && !Object.hasOwn(t.latest_event, 'rationale'))))
    for (const change of [{ report_id: randomUUID() }, { version_id: randomUUID() }, { observation_id: randomUUID() }, { mode: 'receipt' }])
      assert.equal(investigationEvidenceReviewPanels(workspace, report, { ...overview, ...change }), null)
  })
  await t.test('public roles are denied and even administrator history rewrites are blocked', async () => {
    await db.exec('reset role')
    for (const sql of ['update evidence_pipeline.investigation_evidence_review_events set rationale=\'rewrite\'',
      'delete from evidence_pipeline.investigation_evidence_review_events', 'truncate evidence_pipeline.investigation_evidence_review_events'])
      await assert.rejects(db.exec(sql))
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role)
      await assert.rejects(reviews('read', base), e => e.code === '42501')
      await assert.rejects(db.exec('select * from evidence_pipeline.investigation_evidence_review_events'), e => e.code === '42501')
      await db.exec('reset role')
    }
  })
  await t.test('deployment canary rolls all rows and assignments back', async () => {
    const counts = () => scalar("select jsonb_build_array((select count(*) from evidence_pipeline.investigations),(select count(*) from evidence_pipeline.investigation_memberships),(select count(*) from evidence_pipeline.investigation_evidence_review_events))")
    const before = await counts()
    await db.exec(await read('../supabase/tests/investigation_evidence_reviews_smoke.sql'))
    assert.deepEqual(await counts(), before)
  })
})

test('review endpoint verifies Auth identity, bounds writes and hides database failures', async () => {
  const uid = randomUUID(), iid = randomUUID(), vid = randomUUID(), rid = randomUUID()
  const input = { investigation_id: iid, version_id: vid, report_id: rid }
  let called = 0, received, error = null
  const handler = createEvidenceReviewsHandler({ authenticate: async () => ({ id: uid }), rpc: async (action, args) => {
    called++; received = { action, args }; return error ? { error } : { data: { ok: true } }
  } })
  const request = (body, headers = {}) => new Request('https://example.org/endpoint', { method: 'POST',
    headers: { origin, authorization: 'Bearer session', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  let response = await handler(request({ action: 'read', input }))
  assert.equal(response.status, 200); assert.equal(received.args.user_id, uid)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
  for (const body of [{ action: 'read', input: { ...input, user_id: randomUUID() } }, { action: 'set_access', input },
    { action: 'read', input: { ...input, decision: 'relevant' } },
    { action: 'history', input: { ...input, target_kind: 'evidence_cue', target_id: 'cue:1', at_revision: 1, before_revision: null } }]) {
    response = await handler(request(body)); assert.equal(response.status, 400)
  }
  assert.equal(called, 1)
  assert.equal((await handler(request({ action: 'read', input }, { origin: 'https://hostile.example' }))).status, 403)
  assert.equal((await handler(request({ action: 'read', input }, { authorization: '' }))).status, 401)
  assert.equal((await handler(request({ action: 'read', input }, { 'content-type': 'text/plain' }))).status, 415)
  assert.equal((await handler(request({ action: 'read', input, oversized: 'x'.repeat(66000) }))).status, 413)
  for (const [code, status, safeCode] of [['40001', 409, 'version_conflict'], ['42501', 403, 'access_denied'],
    ['22023', 400, 'invalid_request'], ['XX000', 503, 'service_unavailable']]) {
    error = { code, message: 'private database detail' }
    response = await handler(request({ action: 'read', input }))
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: { code: safeCode } })
  }
  const anonymous = createEvidenceReviewsHandler({ authenticate: async () => ({ id: uid, is_anonymous: true }), rpc: () => assert.fail('anonymous RPC') })
  assert.equal((await anonymous(request({ action: 'read', input }))).status, 401)
})

test('review transport keeps service credentials on the fixed RPC and client retains retry identity', async () => {
  const seen = []
  const transport = createEvidenceReviewsTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'public-fixture', serviceKey: 'service-fixture',
    fetchImpl: async (url, options) => { seen.push({ url, ...options }); return new Response('{}', { status: 200 }) } })
  await transport.authenticate('Bearer session-fixture'); await transport.rpc('read', {})
  assert.equal(seen[0].headers.apikey, 'public-fixture'); assert.equal(seen[0].headers.Authorization, 'Bearer session-fixture')
  assert.equal(seen[1].headers.apikey, 'service-fixture'); assert.ok(seen[1].url.endsWith('/rpc/mip_investigation_evidence_reviews_v1'))
  assert.ok(seen.every(r => r.redirect === 'error'))
  assert.throws(() => createEvidenceReviewsTransport({ url: 'https://other.supabase.co', anonKey: 'a', serviceKey: 'b' }))
  const calls = [], iid = randomUUID(), vid = randomUUID(), rid = randomUUID()
  const client = createInvestigationEvidenceReviewsClient({ functions: { invoke: async (name, options) => {
    calls.push({ name, ...options }); return { data: { data: { mode: 'receipt' } } }
  } } })
  assert.equal(calls.length, 0)
  const input = { investigation_id: iid, version_id: vid, report_id: rid, event_id: randomUUID(), previous_event_id: null,
    target_kind: 'evidence_cue', target_id: 'cue:1', decision: 'needs_review', rationale: 'Fixture.', evidence: [] }
  await client.decide(input); await client.decide(input)
  assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].name, 'investigation-evidence-reviews')
  await client.read(iid, vid, rid); assert.deepEqual(calls[2].body, { action: 'read', input: { investigation_id: iid, version_id: vid, report_id: rid } })
  const expired = createInvestigationEvidenceReviewsClient({ functions: { invoke: async () => ({ error: { context: new Response('{}', { status: 401 }) } }) } })
  assert.equal((await expired.read(iid, vid, rid)).error.code, 'authentication_required')
})
