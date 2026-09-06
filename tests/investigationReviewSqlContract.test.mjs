import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { historyMatchesRequest, receiptMatchesDecision } from '../src/lib/investigationEvidenceReviewUi.js'
import { createEvidenceReviewsHandler } from '../supabase/functions/investigation-evidence-reviews/handler.mjs'
import { createInvestigationEvidenceReviewsClient } from '../src/lib/investigationEvidenceReviewsClient.js'
import { createWorkspaceHandler } from '../supabase/functions/investigation-workspace/handler.mjs'
import { createInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceClient.js'
import { workspaceReviewReceiptMatches } from '../src/lib/investigationWorkspaceSession.js'

test('real SQL through authenticated transport satisfies browser history and receipt invariants', async t => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const read = path => readFile(new URL(path, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const user = randomUUID()
  await db.query('insert into public.mip_profiles values($1)', [user])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1',
    'investigation_change_briefings_v1', 'investigation_workspace_batch_v1', 'investigation_evidence_checks_v1', 'investigation_evidence_reviews_v1']) {
    const matches = files.filter(file => file.endsWith(`_${suffix}.sql`))
    assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => async (action, input = {}) => (await db.query(`select public.${name}($1,$2::jsonb) result`,
    [action, JSON.stringify(input)])).rows[0].result
  const pipeline = rpc('mip_pipeline_v1'), workspace = rpc('mip_investigation_workspace_v1')
  await db.exec('set role service_role')
  const summary = '🧭 A correction to this synthetic retained report requires follow-up; no factual verdict is established.'
  await pipeline('enqueue', { run_id: 'review-contract-fixture', article: { url: 'https://example.org/review-contract',
    title: 'Synthetic test only', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
  const job = await pipeline('claim')
  const capture = await pipeline('finish', { job_id: job.id, lease_token: job.lease_token })
  const candidate = await pipeline('candidate', { capture_id: capture.capture_id, candidate_key: 'fixture', candidate_kind: 'claim',
    statement: summary, source_field: 'summary', span_start: 0, span_end: Array.from(summary).length,
    excerpt: summary, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic test only.' })
  const observation = await rpc('mip_investigation_briefings_v1')('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const context = { investigation_id: randomUUID(), version_id: randomUUID() }
  await workspace('put', { ...context, previous_version_id: null, observation_id: observation.id,
    state: { question: 'What changed in this fixture?', scope_note: 'Synthetic test only.', canonical_subject: null,
      time_range: { from: null, to: null, meaning: 'Unknown.' }, unresolved_questions: [], coverage: [], hypotheses: [], commitments: [] },
    change_reason: 'Contract test.' })
  await workspace('set_access', { investigation_id: context.investigation_id, user_id: user, access_role: 'reviewer', reason: 'Fixture only.' })
  const bundle = await workspace('read', { ...context, user_id: user })
  const checks = await rpc('mip_investigation_evidence_checks_v1')('run', { ...context, user_id: user })
  const cue = checks.report.result.challenge_cues[0]
  const handler = createEvidenceReviewsHandler({ authenticate: async () => ({ id: user, is_anonymous: false }),
    rpc: async (action, input) => {
      try { return { data: await rpc('mip_investigation_evidence_reviews_v1')(action, input) } }
      catch (error) { return { error: { code: error.code } } }
    } })
  const client = createInvestigationEvidenceReviewsClient({ functions: { invoke: async (_name, options) => {
    const response = await handler(new Request('https://example.org/reviews', { method: 'POST',
      headers: { authorization: 'Bearer fixture-session', 'content-type': 'application/json' }, body: JSON.stringify(options.body) }))
    return response.ok ? { data: await response.json() } : { error: { context: response } }
  } } })
  const base = { ...context, report_id: checks.report.id, target_kind: 'evidence_cue', target_id: cue.id }
  let predecessor = null, firstPayload
  for (let index = 0; index < 23; index++) {
    const payload = { ...base, event_id: randomUUID(), previous_event_id: predecessor, decision: index % 2 ? 'disputed' : 'relevant',
      rationale: `Fixture relevance decision ${index}.`, evidence: [{ ...cue.reference, relation: 'context', note: 'Exact retained Unicode span.' }] }
    firstPayload ??= payload
    const result = await client.decide(payload)
    assert.equal(result.error, null)
    assert.equal(receiptMatchesDecision(payload, result.data, bundle), true)
    predecessor = payload.event_id
  }
  const replay = await client.decide(firstPayload)
  assert.equal(replay.data.replayed, true)
  assert.equal(replay.data.event.revision, '1')
  assert.equal(replay.data.revision, '23')
  assert.equal(receiptMatchesDecision(firstPayload, replay.data, bundle), true)
  const request = { ...base, at_revision: '22', before_revision: null }
  const first = await client.history(request)
  assert.equal(historyMatchesRequest(first.data, request, bundle), true)
  const next = { ...request, before_revision: first.data.next_before_revision }
  const second = await client.history(next)
  assert.equal(historyMatchesRequest(second.data, next, bundle), true)
  const events = [...first.data.events, ...second.data.events]
  assert.equal(events.length, 22)
  assert.equal(new Set(events.map(event => event.id)).size, 22)
  assert.ok(events.every(event => BigInt(event.revision) <= 22n))
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 0)
  assert.deepEqual(await workspace('read', { ...context, user_id: user }), bundle)

  // Exercise real review markers through the same SQL -> HTTP -> browser path.
  // Evidence decisions above never implicitly acknowledge an investigation.
  const workspaceHandler = createWorkspaceHandler({ authenticate: async () => ({ id: user, is_anonymous: false }),
    rpc: async (action, input) => {
      try { return { data: await workspace(action, input) } }
      catch (error) { return { error: { code: error.code } } }
    } })
  const workspaceClient = createInvestigationWorkspaceClient({ functions: { invoke: async (_name, options) => {
    const response = await workspaceHandler(new Request('https://example.org/workspace', { method: 'POST',
      headers: { authorization: 'Bearer fixture-session', 'content-type': 'application/json' }, body: JSON.stringify(options.body) }))
    return response.ok ? { data: await response.json() } : { error: { context: response } }
  } } })
  const firstReview = { investigationId: context.investigation_id, versionId: context.version_id,
    receiptId: randomUUID(), previousReceiptId: null }
  const firstReceipt = await workspaceClient.markReviewed(firstReview)
  assert.equal(firstReceipt.error, null)
  assert.equal(workspaceReviewReceiptMatches(firstReview, firstReceipt.data), true)
  const nextVersion = randomUUID()
  await workspace('put', { ...context, version_id: nextVersion, previous_version_id: context.version_id,
    observation_id: bundle.observation.id, state: { ...bundle.version.state, question: 'What remains unresolved in this fixture?' },
    change_reason: 'New question wording must require explicit review.' })
  const unreviewed = await workspaceClient.read(context.investigation_id)
  assert.equal(unreviewed.data.review.version_id, context.version_id)
  assert.equal(unreviewed.data.comparison.definition_changes.question_changed, true)
  const secondReview = { ...firstReview, versionId: nextVersion, receiptId: randomUUID(), previousReceiptId: firstReview.receiptId }
  const secondReceipt = await workspaceClient.markReviewed(secondReview)
  assert.equal(workspaceReviewReceiptMatches(secondReview, secondReceipt.data), true)
  const oldReplay = await workspaceClient.markReviewed(firstReview)
  assert.equal(workspaceReviewReceiptMatches(firstReview, oldReplay.data), true)
  assert.equal((await workspaceClient.read(context.investigation_id)).data.review.id, secondReview.receiptId,
    'replaying an earlier exact receipt must not move the current review baseline backward')
  const conflicting = await workspaceClient.markReviewed({ ...firstReview, versionId: nextVersion })
  assert.equal(conflicting.error.code, 'version_conflict')
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 2)
})
