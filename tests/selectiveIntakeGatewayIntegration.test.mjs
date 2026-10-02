import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { FunctionsClient } from '@supabase/functions-js'
import { createInvestigationApiHandler, createInvestigationApiTransport } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { declareSelectiveIntake } from '../scripts/selectiveIntakeDeclaration.mjs'

// Actual retained SQL and registered gateway/SDK boundary. All HTTP is synthetic,
// with fixed fixture credentials and no live session, acquisition or execution.
test('registered selective intake produces authenticated durable private receipts through the existing owners', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const actor = randomUUID(), other = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), iid = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3),($4)', [actor, other, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1']) {
    const names = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(names.length, 1)
    await db.exec(await read('../supabase/migrations/' + names[0]))
  }
  await db.exec(await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql'))
  await db.exec(await read('../supabase/source-proposals/investigation_selective_intake_v1.sql'))
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740993')
  const rpc = name => async (action, input = {}) => (await db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)])).rows[0].r
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  const add = async (summary = 'A retained report.') => {
    await intake('enqueue', { run_id: 'registered-selective-fixture', article: { url: 'https://example.org/registered-selective', title: 'Synthetic', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const cap = await add(), candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'registered', candidate_kind: 'claim', statement: 'A retained report.',
    source_field: 'summary', span_start: 0, span_end: 18, excerpt: 'A retained report.', extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic retained candidate.' })
  const assessment = await assess('append', { candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: '1', parents: [], outcome: 'insufficient_evidence',
    rationale: 'Synthetic baseline.', remaining_uncertainty: 'No registered selection criteria.', context_positions: (await assess('context', { candidate_id: candidate })).context_positions })
  const baseline = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const input = baseline.snapshot.inputs.find(row => row.capture?.id === cap.capture_id), position = input.position
  const state = { question: 'Synthetic registered selective annotation', scope_note: 'Private assigned owner only.', canonical_subject: null,
    time_range: { from: null, to: null, meaning: 'Unknown event time.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const put = (previous, observation) => ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: previous?.id ?? null, observation_id: observation.id, state, change_reason: 'Synthetic native version.' })
  const initial = await put(null, baseline), assign = (user_id, access_role) => ws('set_access', { investigation_id: iid, user_id, access_role, reason: 'Synthetic assignment.' })
  await assign(actor, 'reviewer'); await assign(other, 'reviewer'); await assign(viewer, 'viewer')
  const count = async () => (await db.query('select count(*)::int n from evidence_pipeline.investigation_selective_intake_receipts')).rows[0].n
  const httpCalls = [], nativeCalls = [], authCalls = []; let expired = false, beforeAppend = null, fault = null, wrongResponseActor = false
  const server = createInvestigationApiTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'sb_publishable_synthetic_fixture', serviceKey: 'sb_secret_synthetic_fixture', fetchImpl: async (url, options) => {
    const path = new URL(url).pathname
    assert.equal(new URL(url).origin, 'https://qikvmopbtijoebdqosyq.supabase.co')
    assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal)
    if (path === '/auth/v1/user') {
      authCalls.push(options.headers.Authorization); assert.equal(options.headers.apikey, 'sb_publishable_synthetic_fixture')
      const user = options.headers.Authorization.slice('Bearer '.length), accepted = !expired && [actor, other, viewer, outsider].includes(user)
      return Response.json(accepted ? { id: user } : {}, { status: accepted ? 200 : 401 })
    }
    assert.equal(new Headers(options.headers).has('authorization'), false)
    assert.equal(options.headers.apikey, 'sb_secret_synthetic_fixture')
    const name = path.split('/').at(-1)
    assert.ok(['mip_investigation_workspace_v1', 'mip_investigation_selective_intake_v1'].includes(name))
    const { p_action: action, p_input: payload } = JSON.parse(options.body)
    nativeCalls.push({ name, action, payload: structuredClone(payload) })
    if (fault && name === 'mip_investigation_selective_intake_v1') return Response.json({ code: fault === 'missing' ? '42883' : 'XX000', message: 'Bearer SECRET synthetic exception' }, { status: 503 })
    if (name === 'mip_investigation_selective_intake_v1' && ['declare', 'reconsider'].includes(action) && beforeAppend) { const change = beforeAppend; beforeAppend = null; await change() }
    await db.exec('set role service_role')
    try { return Response.json(await rpc(name)(action, payload)) }
    catch (error) { return Response.json({ code: error.code, message: 'Synthetic SQL error' }, { status: 400 }) }
    finally { await db.exec('reset role') }
  } })
  const handler = createInvestigationApiHandler(server)
  const functions = new FunctionsClient('https://registered-selective.invalid/functions/v1', { customFetch: async (url, options) => {
    assert.equal(new URL(url).pathname, '/functions/v1/investigation-api/selective-intake')
    httpCalls.push({ url: String(url), body: JSON.parse(options.body), headers: new Headers(options.headers) })
    const response = await handler(new Request(url, options))
    if (!wrongResponseActor || !response.ok) return response
    const envelope = await response.json(); envelope.authenticated_user_id = other
    return Response.json(envelope)
  } })
  functions.setAuth(actor)
  const backend = createInvestigationBackend({ functions }), client = backend.selectiveIntake, meta = { expectedUserId: actor }
  assert.equal(httpCalls.length, 0); assert.equal(nativeCalls.length, 0)
  const declaration = { observation_id: baseline.id, candidate_id: candidate, capture_id: cap.capture_id, input_position: position, content_hash: input.capture.content_hash,
    extractor_version: 'fixture-1', disposition: 'retain_deferred', method_key: 'synthetic-caller-criteria', method_version: 'criteria-1', policy_version: 'caller-policy-assertion-1',
    selection_ref: 'fixture:registered-selective', rationale: 'Explicit reviewer self-assertion; criteria are unregistered and no analysis is executed.',
    domain_declarations: [{ domain_ref: 'economy', classification_ref: 'fixture:classification' }],
    reconsideration_triggers: [{ kind: 'dependency_change', assessment_id: assessment, dependency_position: position }] }
  let saved, originalRequest, successor, newer, reconsiderRequest

  await t.test('declare is registered, server-bound, durable and exactly idempotent without execution', async () => {
    originalRequest = { investigation_id: iid, version_id: initial.id, receipt_id: randomUUID(), previous_receipt_id: null, declaration }
    const result = await client.declare(originalRequest, meta); assert.equal(result.error, null); saved = result.data
    assert.equal(saved.actor_id, actor); assert.equal(saved.persisted, true); assert.equal(saved.actor_binding, 'assigned_reviewer_trusted_gateway_input')
    assert.equal(saved.disposition, 'retain_deferred'); assert.equal(saved.analysis_execution, 'none'); assert.equal(saved.publicly_eligible, false)
    const native = await ws('read', { user_id: actor, investigation_id: iid, version_id: initial.id })
    assert.deepEqual(saved.result, declareSelectiveIntake({ ...native.observation, publicly_eligible: false }, declaration))
    assert.equal(saved.result.persisted, false); assert.equal(saved.result.provenance, 'caller_self_assertion')
    assert.equal((await client.declare(originalRequest, meta)).data.replayed, true); assert.equal(await count(), 1)
    assert.equal((await client.declare({ ...originalRequest, declaration: { ...declaration, rationale: 'Different retry' } }, meta)).error.code, 'version_conflict')
    assert.ok(httpCalls.every(c => !Object.hasOwn(c.body.input, 'user_id')))
    assert.ok(nativeCalls.every(c => c.payload.user_id === actor))
  })
  await t.test('read and exact receipt resolve native private history via the same registered route', async () => {
    const history = await client.read({ investigation_id: iid, candidate_id: candidate }, meta); assert.equal(history.error, null)
    assert.equal(history.data.receipts.length, 1); assert.deepEqual(history.data.receipts[0].result, saved.result)
    assert.equal((await client.receipt({ investigation_id: iid, receipt_id: saved.receipt_id }, meta)).data.actor_id, actor)
    assert.ok(BigInt(saved.input_position) > BigInt(Number.MAX_SAFE_INTEGER))
  })
  await t.test('viewer reads but cannot produce, and outsider cannot read', async () => {
    const before = await count(); functions.setAuth(viewer)
    assert.equal((await client.read({ investigation_id: iid, candidate_id: candidate }, { expectedUserId: viewer })).error, null)
    assert.equal((await client.declare({ ...originalRequest, receipt_id: randomUUID(), previous_receipt_id: saved.receipt_id }, { expectedUserId: viewer })).error.code, 'access_denied')
    functions.setAuth(outsider)
    assert.equal((await client.read({ investigation_id: iid, candidate_id: candidate }, { expectedUserId: outsider })).error.code, 'access_denied')
    assert.equal(await count(), before); functions.setAuth(actor)
  })
  await t.test('stale expected actor and expired Auth refuse before any owner RPC or write', async () => {
    functions.setAuth(other); const before = nativeCalls.length, size = await count()
    const request = { ...originalRequest, receipt_id: randomUUID(), previous_receipt_id: saved.receipt_id }
    assert.equal((await client.declare(request, meta)).error.code, 'authentication_required')
    assert.equal(nativeCalls.length, before); assert.equal(await count(), size)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_selective_intake_receipts where actor_id=$1', [other])).rows[0].n, 0)
    functions.setAuth(actor); expired = true
    assert.equal((await client.read({ investigation_id: iid, candidate_id: candidate }, meta)).error.code, 'authentication_required')
    assert.equal((await client.declare(request, meta)).error.code, 'authentication_required')
    assert.equal(nativeCalls.length, before); assert.equal(await count(), size); expired = false
  })
  await t.test('missing RPC, secret failure and wrong response actor are unavailable with no fallback', async () => {
    const input = { investigation_id: iid, candidate_id: candidate }, before = httpCalls.length
    for (const value of ['missing', 'exception']) { fault = value; const result = await client.read(input, meta); assert.deepEqual(result, { data: null, error: { code: 'service_unavailable' } }) }
    fault = null; wrongResponseActor = true
    assert.equal((await client.read(input, meta)).error.code, 'invalid_response'); wrongResponseActor = false
    assert.equal(httpCalls.length, before + 3)
    assert.equal((await createInvestigationBackend(null).selectiveIntake.read(input, meta)).error.code, 'service_unavailable')
  })
  await t.test('native correction requires explicit reconsideration and preserves historical draft/disposition', async () => {
    const correction = await add('A corrected report.')
    const changedPosition = (await db.query('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [correction.capture_id])).rows[0].position
    successor = await observe('observe', { observation_id: randomUUID(), previous_observation_id: baseline.id, candidate_ids: [candidate] })
    newer = await put(initial, successor); assert.equal(await count(), 1)
    reconsiderRequest = { investigation_id: iid, version_id: newer.id, receipt_id: randomUUID(), previous_receipt_id: saved.receipt_id, declaration_receipt_id: saved.receipt_id,
      request: { trigger: { kind: 'dependency_change', assessment_id: assessment, dependency_position: position, change_position: changedPosition }, selection_ref: 'fixture:explicit-reconsideration', rationale: 'Observed retained correction; no automatic promotion.' } }
    const result = await client.reconsider(reconsiderRequest, meta); assert.equal(result.error, null)
    assert.equal(result.data.kind, 'reconsider'); assert.equal(result.data.result.status, 'needs_reconsideration'); assert.equal(result.data.disposition, 'retain_deferred')
    assert.equal(result.data.analysis_execution, 'none'); assert.equal(result.data.publicly_eligible, false)
    assert.equal((await client.reconsider(reconsiderRequest, meta)).data.replayed, true); assert.equal(await count(), 2)
    assert.deepEqual((await client.receipt({ investigation_id: iid, receipt_id: saved.receipt_id }, meta)).data.result, saved.result)
    assert.deepEqual((await ws('read', { user_id: actor, investigation_id: iid, version_id: initial.id })).observation.snapshot, baseline.snapshot)
    assert.equal((await assess('read', { assessment_id: assessment })).outcome, 'insufficient_evidence')
  })
  await t.test('stale head and receipt CAS refuse new writes, while exact old receipt retries remain valid', async () => {
    const before = await count()
    assert.equal((await client.declare({ ...originalRequest, receipt_id: randomUUID(), previous_receipt_id: reconsiderRequest.receipt_id }, meta)).error.code, 'version_conflict')
    assert.equal((await client.reconsider({ ...reconsiderRequest, receipt_id: randomUUID(), previous_receipt_id: saved.receipt_id }, meta)).error.code, 'version_conflict')
    assert.equal(await count(), before)
    assert.equal((await client.declare(originalRequest, meta)).data.replayed, true)
  })
  await t.test('membership and head races between authoritative read and append are checked atomically by SQL', async () => {
    const before = await count(), request = { ...reconsiderRequest, receipt_id: randomUUID(), previous_receipt_id: reconsiderRequest.receipt_id }
    beforeAppend = () => assign(actor, 'revoked')
    assert.equal((await client.reconsider(request, meta)).error.code, 'access_denied'); assert.equal(await count(), before)
    await assign(actor, 'reviewer'); beforeAppend = () => put(newer, successor)
    assert.equal((await client.reconsider(request, meta)).error.code, 'version_conflict'); assert.equal(await count(), before)
    assert.equal((await client.declare(originalRequest, meta)).data.replayed, true)
  })
  await t.test('revocation denies receipt history and forged input cannot reach the gateway', async () => {
    await assign(actor, 'revoked')
    assert.equal((await client.receipt({ investigation_id: iid, receipt_id: saved.receipt_id }, meta)).error.code, 'access_denied')
    const before = httpCalls.length
    assert.equal((await client.declare({ ...originalRequest, user_id: other }, meta)).error.code, 'invalid_request')
    assert.equal((await client.declare({ ...originalRequest, result: saved.result }, meta)).error.code, 'invalid_request')
    assert.equal(httpCalls.length, before)
    assert.ok(authCalls.length > 0); assert.ok(nativeCalls.some(c => c.name === 'mip_investigation_workspace_v1'))
    assert.ok(nativeCalls.some(c => c.name === 'mip_investigation_selective_intake_v1'))
    assert.ok(httpCalls.every(c => c.url === 'https://registered-selective.invalid/functions/v1/investigation-api/selective-intake'))
  })
})
