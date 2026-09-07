import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { FunctionsClient } from '@supabase/functions-js'
import { createInvestigationApiHandler } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { inputImpactMatches } from '../src/lib/investigationInputImpactClient.js'
import { sourceSpansMatch } from '../src/lib/investigationSourceSpansClient.js'

test('unified SDK and handler integrate all domains with real private SQL and immutable review/version semantics', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const user = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), iid = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3)', [user, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1',
    'investigation_change_briefings_v1', 'investigation_workspace_batch_v1', 'investigation_evidence_checks_v1', 'investigation_evidence_reviews_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740993')
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  const capture = async summary => {
    await intake('enqueue', { run_id: 'unified-api-fixture', article: { url: 'https://example.org/unified', title: 'Synthetic retained report', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const originalText = '💡 A retained report.', correctedText = '💡 A corrected retained report.'
  const first = await capture(originalText)
  const candidate = await intake('candidate', { capture_id: first.capture_id, candidate_key: 'unified', candidate_kind: 'claim', statement: originalText,
    source_field: 'summary', span_start: 0, span_end: Array.from(originalText).length, excerpt: originalText, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic only.' })
  const second = await capture(correctedText)
  const observation = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const state = { question: 'What changed?', scope_note: 'Synthetic unified backend test.', canonical_subject: null,
    time_range: { from: null, to: null, meaning: 'Source period unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const version = await ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: null, observation_id: observation.id, state, change_reason: 'Synthetic baseline.' })
  const assign = (user_id, access_role) => ws('set_access', { investigation_id: iid, user_id, access_role, reason: 'Synthetic assignment.' })
  await assign(user, 'reviewer'); await assign(viewer, 'viewer')
  const p1 = observation.snapshot.inputs.find(i => i.capture?.id === first.capture_id).position
  const p2 = observation.snapshot.inputs.find(i => i.capture?.id === second.capture_id).position
  const invokeRpc = name => async (action, input) => { try { return { data: await rpc(name)(action, input) } } catch (e) { return { error: { code: e.code } } } }
  const calls = [], auth = []
  const handler = createInvestigationApiHandler({ authenticate: async authorization => {
    auth.push(authorization); const id = authorization.slice('Bearer '.length)
    return [user, viewer, outsider].includes(id) ? { id } : null
  }, workspaceRpc: invokeRpc('mip_investigation_workspace_v1'), checksRpc: invokeRpc('mip_investigation_evidence_checks_v1'), reviewsRpc: invokeRpc('mip_investigation_evidence_reviews_v1') })
  const functions = new FunctionsClient('https://unified-api.example.invalid/functions/v1', { customFetch: async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) }); return handler(new Request(url, options))
  } })
  functions.setAuth(user)
  const backend = createInvestigationBackend({ functions })
  let saved, report
  await t.test('all reads share the authenticated route and exact saved scope without running checks or writing reviews', async () => {
    assert.equal((await backend.workspace.list()).error, null)
    saved = (await backend.workspace.read(iid, version.id)).data
    assert.equal(saved.version.id, version.id)
    assert.equal((await backend.checks.read(iid, version.id)).data.status, 'not_run')
    const impact = await backend.inputImpact.read(iid, version.id, p1)
    assert.equal(inputImpactMatches(saved, p1, impact.data), true)
    const spans = await backend.sourceSpans.read(iid, version.id, p1, p2)
    assert.equal(sourceSpansMatch(saved, p1, p2, spans.data), true)
    assert.ok(calls.every(c => c.url.startsWith('https://unified-api.example.invalid/functions/v1/investigation-api/')))
    assert.ok(calls.every(c => !Object.hasOwn(c.body.input, 'user_id')))
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_evidence_check_reports')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 0)
  })
  await t.test('reviewer commands preserve idempotency, conflicts and exact review history through the same API', async () => {
    const run = await backend.checks.run(iid, version.id); assert.equal(run.error, null); report = run.data.report
    const cue = report.result.challenge_cues[0]; assert.ok(cue)
    assert.equal((await backend.reviews.read(iid, version.id, report.id)).data.revision, '0')
    const decision = { investigation_id: iid, version_id: version.id, report_id: report.id, target_kind: 'evidence_cue', target_id: cue.id,
      event_id: randomUUID(), previous_event_id: null, decision: 'relevant', rationale: 'Retain synthetic correction for follow-up.',
      evidence: [{ ...cue.reference, relation: 'context', note: 'Exact retained context.' }] }
    const first = await backend.reviews.decide(decision); assert.equal(first.error, null)
    assert.equal((await backend.reviews.decide(decision)).data.replayed, true)
    assert.equal((await backend.reviews.decide({ ...decision, rationale: 'Conflicting retry.' })).error.code, 'version_conflict')
    const history = await backend.reviews.history({ investigation_id: iid, version_id: version.id, report_id: report.id,
      target_kind: 'evidence_cue', target_id: cue.id, at_revision: first.data.event.revision, before_revision: null })
    assert.equal(history.error, null); assert.equal(history.data.events[0].id, decision.event_id)
    const mark = { investigationId: iid, versionId: version.id, receiptId: randomUUID(), previousReceiptId: null }
    assert.equal((await backend.workspace.markReviewed(mark)).error, null)
    assert.equal((await backend.workspace.markReviewed(mark)).error, null)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 1)
  })
  await t.test('session changes, viewer permissions and revoked/outsider denial apply across all domains', async () => {
    functions.setAuth(viewer)
    assert.equal((await backend.workspace.read(iid, version.id)).data.access_role, 'viewer')
    assert.equal((await backend.reviews.read(iid, version.id, report.id)).error, null)
    assert.equal((await backend.checks.run(iid, version.id)).error.code, 'access_denied')
    const reads = () => [backend.workspace.read(iid, version.id), backend.checks.read(iid, version.id), backend.reviews.read(iid, version.id, report.id),
      backend.inputImpact.read(iid, version.id, p1), backend.sourceSpans.read(iid, version.id, p1, p2)]
    functions.setAuth(outsider)
    for (const result of await Promise.all(reads())) assert.equal(result.error.code, 'access_denied')
    await assign(viewer, 'revoked'); functions.setAuth(viewer)
    for (const result of await Promise.all(reads())) assert.equal(result.error.code, 'access_denied')
    functions.setAuth('signed-out')
    for (const result of await Promise.all(reads())) assert.equal(result.error.code, 'authentication_required')
    assert.ok(auth.includes(`Bearer ${viewer}`)); assert.ok(auth.includes(`Bearer ${outsider}`))
  })
  await t.test('late corrections remain outside the historical version and do not cause automatic reassessment', async () => {
    functions.setAuth(user)
    const third = await capture('💡 A later correction.')
    const nextObservation = await observe('observe', { observation_id: randomUUID(), previous_observation_id: observation.id, candidate_ids: [candidate] })
    const next = await ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: version.id, observation_id: nextObservation.id, state, change_reason: 'Later synthetic correction.' })
    const latePosition = nextObservation.snapshot.inputs.find(i => i.capture?.id === third.capture_id).position
    assert.equal((await backend.inputImpact.read(iid, version.id, latePosition)).error.code, 'input_unavailable')
    assert.equal((await backend.inputImpact.read(iid, next.id, latePosition)).data.assessment_effect, 'none')
    assert.equal((await backend.sourceSpans.read(iid, version.id, p1, latePosition)).error.code, 'input_unavailable')
    const before = (await backend.workspace.read(iid, version.id)).data
    assert.deepEqual(before.observation.snapshot, saved.observation.snapshot)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.assessments')).rows[0].n, 0)
    assert.equal((await backend.workspace.read(randomUUID(), version.id)).error.code, 'access_denied')
  })
})
