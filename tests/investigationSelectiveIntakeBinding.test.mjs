import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { FunctionsClient } from '@supabase/functions-js'
import { createInvestigationApiTransport } from '../supabase/functions/investigation-api/handler.mjs'
import { createSelectiveIntakeHandler } from '../supabase/source-proposals/investigationSelectiveIntakeHandler.mjs'
import { createInvestigationSelectiveIntakeClient } from '../src/lib/investigationSelectiveIntakeClient.js'
import { declareSelectiveIntake } from '../scripts/selectiveIntakeDeclaration.mjs'

test('private selective intake uses verified Auth, native snapshots, SDK and durable assigned-owner receipts', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const actor = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), actorB = randomUUID(), iid = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3),($4)', [actor, viewer, outsider, actorB])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1']) {
    const names = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(names.length, 1)
    await db.exec(await read('../supabase/migrations/' + names[0]))
  }
  await db.exec(await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql'))
  await db.exec(await read('../supabase/source-proposals/investigation_selective_intake_v1.sql'))
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740994')
  const rpc = name => async (action, input = {}) => (await db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)])).rows[0].r
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1'), selective = rpc('mip_investigation_selective_intake_v1')
  const add = async (url, summary = 'A retained report.') => {
    await intake('enqueue', { run_id: 'selective-owner-fixture', article: { url, title: 'Synthetic retained evidence', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const cap = await add('https://example.org/selective-binding')
  const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'fixture', candidate_kind: 'claim', statement: 'A retained report.',
    source_field: 'summary', span_start: 0, span_end: 18, excerpt: 'A retained report.', extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic fixture, no truth decision.' })
  const assessment = await assess('append', { candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: '1', parents: [], outcome: 'insufficient_evidence',
    rationale: 'Synthetic retained baseline.', remaining_uncertainty: 'Selection criteria are caller assertions.', context_positions: (await assess('context', { candidate_id: candidate })).context_positions })
  const baseline = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const position = baseline.snapshot.inputs.find(row => row.capture?.id === cap.capture_id).position
  const state = { question: 'Which retained candidate should be examined?', scope_note: 'Synthetic assigned investigation.', canonical_subject: null,
    time_range: { from: null, to: null, meaning: 'Unknown event time.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const version = await ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: null, observation_id: baseline.id, state, change_reason: 'Synthetic baseline.' })
  const assign = (user_id, access_role) => ws('set_access', { investigation_id: iid, user_id, access_role, reason: 'Synthetic assignment.' })
  await assign(actor, 'reviewer'); await assign(actorB, 'reviewer'); await assign(viewer, 'viewer')
  const count = async () => (await db.query('select count(*)::int n from evidence_pipeline.investigation_selective_intake_receipts')).rows[0].n
  const calls = [], serverCalls = []; let beforeAppend = null
  const invokeNative = async (name, action, input) => {
    calls.push({ name, action, input: structuredClone(input) })
    if (name === 'mip_investigation_selective_intake_v1' && ['declare', 'reconsider'].includes(action) && beforeAppend) {
      const change = beforeAppend; beforeAppend = null; await change()
    }
    await db.exec('set role service_role')
    try { return { data: await rpc(name)(action, input) } } catch (error) { return { error: { code: error.code } } }
    finally { await db.exec('reset role') }
  }
  // Reuse the current server Auth wrapper. Its HTTP responses are synthetic; no live session/service is used.
  const server = createInvestigationApiTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'synthetic-public-key', serviceKey: 'sb_secret_synthetic_fixture', fetchImpl: async (url, options) => {
    serverCalls.push(new URL(url).pathname)
    if (new URL(url).pathname === '/auth/v1/user') {
      assert.equal(options.headers.apikey, 'synthetic-public-key')
      const uid = options.headers.Authorization.slice('Bearer '.length)
      return new Response(JSON.stringify([actor, viewer, outsider, actorB].includes(uid) ? { id: uid } : {}), { status: [actor, viewer, outsider, actorB].includes(uid) ? 200 : 401 })
    }
    assert.equal(new URL(url).pathname, '/rest/v1/rpc/mip_investigation_workspace_v1')
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false)
    const payload = JSON.parse(options.body), result = await invokeNative('mip_investigation_workspace_v1', payload.p_action, payload.p_input)
    return new Response(JSON.stringify(result.error ?? result.data), { status: result.error ? 400 : 200 })
  } })
  const handler = createSelectiveIntakeHandler({ authenticate: server.authenticate, workspaceRpc: server.workspaceRpc,
    rpc: (action, input) => invokeNative('mip_investigation_selective_intake_v1', action, input) })
  const functions = new FunctionsClient('https://selective.example.invalid/functions/v1', { customFetch: async (url, options) => {
    assert.equal(new URL(url).pathname, '/functions/v1/investigation-api/selective-intake')
    return handler(new Request(url, options))
  } })
  functions.setAuth(actor)
  // Parent attaches this exact domain mapping to its existing investigationBackend/API owner.
  const client = createInvestigationSelectiveIntakeClient({ functions: { invoke(name, options) {
    assert.equal(name, 'investigation-selective-intake'); return functions.invoke('investigation-api/selective-intake', options)
  } } })
  const meta = { expectedUserId: actor }
  const raw = { observation_id: baseline.id, candidate_id: candidate, capture_id: cap.capture_id, input_position: position,
    content_hash: baseline.snapshot.inputs.find(row => row.position === position).capture.content_hash, extractor_version: 'fixture-1', disposition: 'retain_deferred',
    method_key: 'synthetic-selection-criteria', method_version: 'criteria-1', policy_version: 'policy-assertion-1', selection_ref: 'fixture:selection:1',
    rationale: 'Reviewer self-assertion; no registered policy, permission or analysis execution.',
    domain_declarations: [{ domain_ref: 'religion', classification_ref: 'fixture:religion' }, { domain_ref: 'economy', classification_ref: 'fixture:economy' }],
    reconsideration_triggers: [{ kind: 'dependency_change', assessment_id: assessment, dependency_position: position }] }
  let last, declareRequest, successor, newVersion, incomingPosition, correctionPosition

  await t.test('all dispositions are durable idempotent actor-bound annotations without altering the frozen declaration', async () => {
    for (const disposition of ['analyze_now', 'retain_deferred', 'skip_for_now']) {
      declareRequest = { investigation_id: iid, version_id: version.id, receipt_id: randomUUID(), previous_receipt_id: last?.receipt_id ?? null, declaration: { ...raw, disposition } }
      const result = await client.declare(declareRequest, meta); assert.equal(result.error, null); last = result.data
      assert.equal(last.disposition, disposition); assert.equal(last.actor_id, actor); assert.equal(last.persisted, true); assert.equal(last.input_position, position)
      assert.equal(last.actor_binding, 'assigned_reviewer_trusted_gateway_input')
      assert.equal(last.publicly_eligible, false); assert.equal(last.analysis_execution, 'none'); assert.equal(last.result.provenance, 'caller_self_assertion')
      assert.equal(last.result.persisted, false); assert.equal(last.result.execution, 'none')
      const nativeBundle = await ws('read', { user_id: actor, investigation_id: iid, version_id: version.id })
      assert.deepEqual(last.result, declareSelectiveIntake({ ...nativeBundle.observation, publicly_eligible: false }, declareRequest.declaration))
      assert.equal((await client.declare(declareRequest, meta)).data.replayed, true)
      assert.equal((await client.declare({ ...declareRequest, declaration: { ...declareRequest.declaration, rationale: 'Changed retry.' } }, meta)).error.code, 'version_conflict')
    }
    assert.equal(await count(), 3)
    const page = (await client.read({ investigation_id: iid, candidate_id: candidate, limit: 2 }, meta)).data
    assert.equal(page.receipts.length, 2); assert.equal(page.has_more, true)
    const tail = (await client.read({ investigation_id: iid, candidate_id: candidate, after_receipt_id: page.next_after_receipt_id }, meta)).data
    assert.equal(tail.receipts.length, 1); assert.equal(tail.receipts[0].receipt_id, last.receipt_id)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 0)
  })
  await t.test('viewer, outsider, spoofed actor and SDK account race cannot write or acquire private snapshots', async () => {
    const start = await count()
    functions.setAuth(viewer)
    assert.equal((await client.read({ investigation_id: iid, candidate_id: candidate }, { expectedUserId: viewer })).error, null)
    assert.equal((await client.declare({ ...declareRequest, receipt_id: randomUUID() }, { expectedUserId: viewer })).error.code, 'access_denied')
    functions.setAuth(actorB)
    const otherReviewer = await client.receipt({ investigation_id: iid, receipt_id: last.receipt_id }, { expectedUserId: actorB })
    assert.equal(otherReviewer.error, null); assert.equal(otherReviewer.data.actor_id, actor)
    functions.setAuth(outsider)
    assert.equal((await client.read({ investigation_id: iid, candidate_id: candidate }, { expectedUserId: outsider })).error.code, 'access_denied')
    functions.setAuth(actorB)
    const before = calls.length
    assert.equal((await client.declare({ ...declareRequest, receipt_id: randomUUID() }, meta)).error.code, 'authentication_required')
    assert.equal(calls.length, before) // Refusal after verified Auth, before workspace or receipt RPC.
    functions.setAuth(actor)
    assert.equal((await client.declare({ ...declareRequest, user_id: actorB }, meta)).error.code, 'invalid_request')
    assert.equal(await count(), start)
  })
  await t.test('malformed or phantom bindings and stale receipt baselines reject atomically at the owner', async () => {
    const start = await count(), make = patch => ({ ...declareRequest, receipt_id: randomUUID(), previous_receipt_id: last.receipt_id, declaration: { ...raw, ...patch } })
    for (const patch of [{ capture_id: randomUUID() }, { observation_id: randomUUID() }, { input_position: '9223372036854775807' }, { extractor_version: 'phantom' },
      { publicly_eligible: true }, { content_hash: 'wrong' }, { reconsideration_triggers: [] }]) assert.equal((await client.declare(make(patch), meta)).error.code, 'invalid_request')
    assert.equal((await client.declare({ ...make({}), previous_receipt_id: null }, meta)).error.code, 'version_conflict')
    const validResult = last.result
    await assert.rejects(selective('declare', { user_id: actor, investigation_id: iid, version_id: version.id, receipt_id: randomUUID(), previous_receipt_id: last.receipt_id,
      result: { ...validResult, capture_id: randomUUID() } }), error => error.code === '22023')
    await assert.rejects(selective('declare', { user_id: actor, investigation_id: iid, version_id: version.id, receipt_id: randomUUID(), previous_receipt_id: last.receipt_id,
      result: { ...validResult, execution: 'analyze' } }), error => error.code === '22023')
    assert.equal(await count(), start)
  })
  await t.test('native correction and explicit new relevance create reconsideration receipts without automatic disposition changes', async () => {
    const correction = await add('https://example.org/selective-binding', 'A corrected report.')
    const incoming = await add('https://example.org/selective-new-relevant')
    const pos = async capture => (await db.query('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [capture.capture_id])).rows[0].position
    correctionPosition = await pos(correction); incomingPosition = await pos(incoming)
    await assess('declare_relevance', { candidate_id: candidate, position: incomingPosition, selection_method: 'synthetic-explicit-relevance', selection_ref: 'fixture:relevance:1', rationale: 'Caller-declared relevance, no factual verdict.' })
    successor = await observe('observe', { observation_id: randomUUID(), previous_observation_id: baseline.id, candidate_ids: [candidate] })
    newVersion = await ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: version.id, observation_id: successor.id, state, change_reason: 'Native correction and new relevance.' })
    assert.equal(await count(), 3) // Neither native input route writes a selective decision automatically.
    const originalReceipt = last.receipt_id
    for (const trigger of [
      { kind: 'dependency_change', assessment_id: assessment, dependency_position: position, change_position: correctionPosition },
      { kind: 'new_relevant_input', change_position: incomingPosition, selection_method: 'synthetic-explicit-relevance', selection_ref: 'fixture:relevance:1' },
    ]) {
      const request = { investigation_id: iid, version_id: newVersion.id, receipt_id: randomUUID(), previous_receipt_id: last.receipt_id, declaration_receipt_id: originalReceipt,
        request: { trigger, selection_ref: 'fixture:explicit-reconsideration', rationale: 'Needs reconsideration; no automatic promotion.' } }
      const result = await client.reconsider(request, meta); assert.equal(result.error, null); last = result.data
      assert.equal(last.kind, 'reconsider'); assert.equal(last.result.status, 'needs_reconsideration'); assert.equal(last.disposition, 'skip_for_now')
      assert.equal(last.result.disposition, 'skip_for_now'); assert.equal(last.publicly_eligible, false)
      assert.equal((await client.reconsider(request, meta)).data.replayed, true)
    }
    assert.equal(await count(), 5)
    assert.equal((await assess('read', { assessment_id: assessment })).outcome, 'insufficient_evidence')
    assert.deepEqual((await ws('read', { user_id: actor, investigation_id: iid, version_id: version.id })).observation.snapshot, baseline.snapshot)
    assert.equal((await client.declare({ ...declareRequest, receipt_id: randomUUID(), previous_receipt_id: last.receipt_id }, meta)).error.code, 'version_conflict')
  })
  await t.test('membership revocation and head advance between trusted read and append refuse writes; old exact retries remain idempotent', async () => {
    const history = (await client.read({ investigation_id: iid, candidate_id: candidate }, meta)).data.receipts
    const original = history.find(receipt => receipt.receipt_id === declareRequest.receipt_id)
    const reconsider = { investigation_id: iid, version_id: newVersion.id, receipt_id: randomUUID(), previous_receipt_id: last.receipt_id,
      declaration_receipt_id: original.receipt_id, request: { trigger: { kind: 'new_relevant_input', change_position: incomingPosition,
        selection_method: 'synthetic-explicit-relevance', selection_ref: 'fixture:relevance:1' }, selection_ref: 'fixture:race-check', rationale: 'Explicit bounded reconsideration.' } }
    const start = await count()
    beforeAppend = () => assign(actor, 'revoked')
    assert.equal((await client.reconsider(reconsider, meta)).error.code, 'access_denied')
    assert.equal(await count(), start)
    await assign(actor, 'reviewer')
    beforeAppend = () => ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: newVersion.id,
      observation_id: successor.id, state, change_reason: 'Synthetic concurrent native head advance.' })
    assert.equal((await client.reconsider(reconsider, meta)).error.code, 'version_conflict')
    assert.equal(await count(), start)
    const replay = await client.declare(declareRequest, meta)
    assert.equal(replay.error, null); assert.equal(replay.data.replayed, true)
    assert.deepEqual(replay.data.result, original.result)
  })
  await t.test('revocation, browser roles, history rewriting and response-actor mismatch are refused', async () => {
    await assign(viewer, 'revoked'); functions.setAuth(viewer)
    assert.equal((await client.receipt({ investigation_id: iid, receipt_id: last.receipt_id }, { expectedUserId: viewer })).error.code, 'access_denied')
    functions.setAuth('signed-out')
    assert.equal((await client.read({ investigation_id: iid, candidate_id: candidate })).error.code, 'authentication_required')
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(selective('read', { user_id: actor, investigation_id: iid, candidate_id: candidate }), /permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.investigation_selective_intake_receipts'), /permission denied/)
      await db.exec('reset role')
    }
    await assert.rejects(db.exec('update evidence_pipeline.investigation_selective_intake_receipts set disposition=\'analyze_now\''), /append-only/)
    await assert.rejects(db.exec('delete from evidence_pipeline.investigation_selective_intake_receipts'), /append-only/)
    await assert.rejects(db.exec('truncate evidence_pipeline.investigation_selective_intake_receipts'), /append-only/)
    const falseActor = createInvestigationSelectiveIntakeClient({ functions: { invoke: async () => ({ data: { data: last, authenticated_user_id: actorB } }) } })
    assert.equal((await falseActor.receipt({ investigation_id: iid, receipt_id: last.receipt_id }, meta)).error.code, 'invalid_response')
    const foreignNested = createInvestigationSelectiveIntakeClient({ functions: { invoke: async () => ({ data: { authenticated_user_id: actor, data: {
      contract_version: 'private-investigation-selective-intake-1', investigation_id: iid, candidate_id: candidate, publicly_eligible: false,
      receipts: [{ ...last, candidate_id: randomUUID() }] } } }) } })
    assert.equal((await foreignNested.read({ investigation_id: iid, candidate_id: candidate }, meta)).error.code, 'invalid_response')
    assert.ok(serverCalls.includes('/auth/v1/user')); assert.ok(serverCalls.includes('/rest/v1/rpc/mip_investigation_workspace_v1'))
    assert.ok(BigInt(position) > BigInt(Number.MAX_SAFE_INTEGER)); assert.equal(BigInt(position) % 2n, 1n)
  })
})
