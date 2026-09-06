import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createWorkspaceHandler, createWorkspaceTransport } from '../supabase/functions/investigation-workspace/handler.mjs'
import { createInvestigationWorkspaceClient, investigationWorkspacePanels, resolveWorkspaceExcerpt } from '../src/lib/investigationWorkspaceClient.js'

const uid = randomUUID(), viewer = randomUUID(), outsider = randomUUID()
const origin = 'https://jkelsen13-tech.github.io'
const clone = v => structuredClone(v)

test('one private investigation connects state, hypotheses, commitments, coverage and review baselines', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  await db.query('insert into public.mip_profiles(id) values($1),($2),($3)', [uid, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async (url, summary = 'A report.', published_at = '2019-01-01T00:00:00Z') => {
    await intake('enqueue', { run_id: 'workspace-fixture', article: { url, title: 'Synthetic commitment', outlet: 'Fixture', summary, published_at } })
    const j = await intake('claim'); return intake('finish', { job_id: j.id, lease_token: j.lease_token })
  }
  const event = await scalar("insert into public.nodes(type,label) values('event','Synthetic event') returning id")
  const cap = await add('https://example.org/workspace')
  const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'workspace', candidate_kind: 'claim', statement: 'A report.',
    source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', event_node_id: event, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const assessmentPayload = async version => ({ candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: version, outcome: 'insufficient_evidence',
    rationale: 'Fixture only.', remaining_uncertainty: 'Synthetic.', context_positions: (await assess('context', { candidate_id: candidate })).context_positions })
  const assessmentId = await assess('append', await assessmentPayload('initial'))
  const newObservation = previous => observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate], ...(previous ? { previous_observation_id: previous.id } : {}) })
  const initialObservation = await newObservation()
  const position = initialObservation.snapshot.inputs.find(i => i.capture?.id === cap.capture_id).position
  const citation = { position, source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', relation: 'context', note: 'Exact synthetic retained excerpt.' }
  const coverageId = randomUUID(), hypothesisId = randomUUID(), commitmentId = randomUUID(), stageId = randomUUID()
  const initialState = {
    question: 'What evidence shows whether the synthetic commitment progressed?', scope_note: 'Synthetic fixture; one retained report.',
    canonical_subject: { type: 'graph_node', id: event }, time_range: { from: null, to: null, meaning: 'Unknown source event interval.' },
    unresolved_questions: ['Was implementation observed?'],
    coverage: [{ id: coverageId, label: 'Fixture collection', status: 'limited', source_classes: ['fixture'], languages: ['en'], regions: [],
      from: null, to: null, retained_text: 'summary_only', search_status: 'not_run', searched_at: null, method: 'Fixture has no real retrieval run.', limitations: ['Synthetic evidence only.'] }],
    hypotheses: [{ id: hypothesisId, statement: 'The commitment may remain unimplemented.', assessment_ids: [assessmentId], evidence: [citation], assumptions: ['Fixture only.'],
      would_strengthen: ['An authenticated cancellation document.'], would_weaken: ['An authenticated implementation record.'], remaining_uncertainty: 'No substantive judgment.' }],
    commitments: [{ id: commitmentId, actor: 'Synthetic institution', statement: 'A synthetic commitment.', scope: 'Fixture only.', conditions: ['Prerequisites unknown.'],
      deadline_text: 'No retained deadline.', success_criterion: 'Direct evidence of implementation.', remaining_uncertainty: 'No outcome evidence.',
      stages: [{ id: stageId, kind: 'commitment', status: 'reported', depends_on: [], coverage_ids: [coverageId], evidence: [citation], note: 'Source reports a commitment; it does not prove an outcome.' }] }],
  }
  const iid = randomUUID()
  const putInput = (previous, observation = initialObservation, state = initialState, investigationId = iid, versionId = randomUUID()) => ({
    investigation_id: investigationId, version_id: versionId, previous_version_id: previous?.id ?? null, observation_id: observation.id, state, change_reason: 'Synthetic test revision.' })
  const grant = (user, role = 'reviewer', id = iid) => ws('set_access', { investigation_id: id, user_id: user, access_role: role, reason: 'Fixture assignment.' })
  const readWs = (user = uid, id = iid, version) => ws('read', { user_id: user, investigation_id: id, ...(version ? { version_id: version } : {}) })
  const mark = (version, previous = null, user = uid, receipt = randomUUID()) => ws('mark_review', { user_id: user, investigation_id: iid,
    version_id: version.id, receipt_id: receipt, previous_receipt_id: previous?.id ?? null })
  let v1, v2, v3, firstReceipt, secondReceipt, correctedObservation
  const firstInput = putInput()

  await t.test('one version carries all five sections and exact evidence, with no default assignment', async () => {
    await db.exec('set role service_role')
    v1 = await ws('put', firstInput)
    assert.equal(v1.revision, 1); assert.deepEqual(v1.state, initialState)
    assert.deepEqual((await ws('list', { user_id: uid })).items, [])
    await assert.rejects(readWs(), e => e.code === '42501')
    await grant(uid); await grant(viewer, 'viewer')
    const b = await readWs(), panels = investigationWorkspacePanels(b)
    assert.equal(b.publicly_eligible, false); assert.equal(b.annotation_status, 'private_analyst_record')
    assert.equal(b.comparison.mode, 'not_reviewed'); assert.equal(b.review, null)
    assert.equal(panels.hypotheses[0].id, hypothesisId); assert.equal(panels.commitments[0].id, commitmentId)
    assert.equal(panels.coverage[0].id, coverageId); assert.equal(panels.assessments[0].id, assessmentId)
    assert.equal(panels.inputs.find(i => i.position === position).capture.payload.summary, citation.excerpt)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts'), 0)
    await db.exec('reset role')
  })
  await t.test('assignment boundaries hold for list, history, cross-investigation IDs and review roles', async () => {
    await assert.rejects(readWs(outsider), e => e.code === '42501')
    await assert.rejects(readWs(uid, randomUUID()), e => e.code === '42501')
    await assert.rejects(readWs(uid, iid, randomUUID()), e => e.code === '42501')
    await assert.rejects(mark(v1, null, viewer), e => e.code === '42501')
    assert.deepEqual((await ws('list', { user_id: outsider })).items, [])
    assert.equal((await readWs(viewer)).access_role, 'viewer')
    const second = await ws('put', putInput(null, initialObservation, initialState, randomUUID()))
    await assert.rejects(readWs(uid, iid, second.id), e => e.code === '42501')
  })
  await t.test('review requires explicit action and is idempotent without changing other users', async () => {
    firstReceipt = await mark(v1)
    assert.deepEqual(await mark(v1, null, uid, firstReceipt.id), firstReceipt)
    assert.equal((await readWs()).comparison.mode, 'comparable')
    assert.deepEqual((await readWs()).comparison.evidence_changes, [])
    assert.equal((await readWs(viewer)).review, null)
    await assert.rejects(mark(v1), e => e.code === '40001')
    await assert.rejects(mark(v1, firstReceipt, uid, firstReceipt.id), e => e.code === '23505')
  })
  await t.test('late correction and analyst revisions appear together without auto-review or semantic recalculation', async () => {
    await add('https://example.org/workspace', 'A corrected report.', '2010-01-01T00:00:00Z')
    correctedObservation = await newObservation(initialObservation)
    const state = clone(initialState)
    state.hypotheses[0].remaining_uncertainty = 'A correction requires reconsideration.'
    state.commitments[0].stages[0].note = 'Still reported; a source correction needs review.'
    state.coverage[0].limitations.push('Correction found; search remains incomplete.')
    v2 = await ws('put', putInput(v1, correctedObservation, state))
    const b = await readWs()
    assert.equal(b.review.id, firstReceipt.id); assert.equal(b.version.id, v2.id)
    assert.ok(b.comparison.evidence_changes.some(c => c.kind === 'assessment_dependency_change' && c.assessment_id === assessmentId))
    assert.deepEqual(b.comparison.definition_changes.hypotheses.updated, [hypothesisId])
    assert.deepEqual(b.comparison.definition_changes.commitments.updated, [commitmentId])
    assert.deepEqual(b.comparison.definition_changes.coverage.updated, [coverageId])
    assert.equal(b.observation.snapshot.assessments.find(a => a.id === assessmentId).outcome, 'insufficient_evidence')
    assert.equal((await readWs(uid, iid, v1.id)).observation.snapshot.assessments[0].stale, false)
    assert.deepEqual((await readWs(uid, iid, v1.id)).version.state, initialState)
  })
  await t.test('optimistic updates prevent lost work and retries retain earlier versions', async () => {
    assert.deepEqual(await ws('put', firstInput), v1)
    await assert.rejects(ws('put', { ...firstInput, change_reason: 'Changed retry.' }), e => e.code === '23505')
    await assert.rejects(ws('put', putInput(v1, correctedObservation)), e => e.code === '40001')
    await assert.rejects(ws('put', putInput(v2, initialObservation)), /directly extend/)
    const unlinked = await newObservation()
    await assert.rejects(ws('put', putInput(v2, unlinked)), /directly extend/)
  })
  await t.test('stages branch, no-followup requires a documented search, and outcomes need exact evidence', async () => {
    const state = clone(v2.state)
    state.coverage[0].search_status = 'completed_for_declared_scope'; state.coverage[0].searched_at = '2026-09-06T07:00:00Z'
    state.commitments[0].stages.push({ id: randomUUID(), kind: 'implementation', status: 'no_followup_found', depends_on: [stageId],
      coverage_ids: [coverageId], evidence: [], note: 'No follow-up in this declared fixture search; absence elsewhere is unknown.' })
    state.commitments[0].stages.push({ id: randomUUID(), kind: 'prerequisite', status: 'not_applicable', depends_on: [stageId],
      coverage_ids: [], evidence: [], note: 'This synthetic route does not require this stage.' })
    v3 = await ws('put', putInput(v2, correctedObservation, state))
    assert.equal(v3.state.commitments[0].stages[1].status, 'no_followup_found')
    assert.equal((await readWs()).publicly_eligible, false)
    const bad = clone(state); bad.commitments[0].stages[1].status = 'observed'
    await assert.rejects(ws('put', putInput(v3, correctedObservation, bad)), /requires retained evidence/)
    bad.commitments[0].stages[1].status = 'no_followup_found'; bad.coverage[0].search_status = 'not_run'
    await assert.rejects(ws('put', putInput(v3, correctedObservation, bad)), /completed bounded search/)
  })
  await t.test('span, null enum, time, coverage, identity and cycle failures are atomic', async () => {
    const before = await scalar('select count(*)::int from evidence_pipeline.investigation_versions')
    const failures = [
      s => { s.hypotheses[0].evidence[0].excerpt = 'Wrong excerpt.' },
      s => { s.hypotheses[0].evidence[0].position = '999999999' },
      s => { s.hypotheses[0].evidence[0].relation = null },
      s => { s.hypotheses[0].evidence.push(clone(s.hypotheses[0].evidence[0])) },
      s => { s.hypotheses[0].would_weaken = [] },
      s => { s.hypotheses[0].assessment_ids = [randomUUID()] },
      s => { s.canonical_subject.id = randomUUID() },
      s => { s.canonical_subject.type = null },
      s => { s.coverage[0].status = null },
      s => { s.coverage[0].searched_at = '2026-09-06' },
      s => { s.coverage[0].source_classes = [] },
      s => { s.coverage[0].limitations = [] },
      s => { s.time_range = { from: '2026-09-06T00:00:00Z', to: '2020-01-01T00:00:00Z', meaning: 'Reversed.' } },
      s => { s.commitments[0].stages[0].depends_on = [stageId] },
      s => { s.commitments[0].stages[0].coverage_ids = [randomUUID()] },
      s => { s.commitments[0].stages[0].status = null },
      s => { s.confidence = 0.99 },
      s => { s.hypotheses.push(clone(s.hypotheses[0])) },
      s => { s.unresolved_questions = Array(31).fill('Unknown.') },
      s => { s.scope_note = 'x'.repeat(140000) },
    ]
    for (const mutate of failures) {
      const state = clone(v3.state); mutate(state)
      await assert.rejects(ws('put', putInput(v3, correctedObservation, state)), e => e.code?.startsWith('22'))
    }
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_versions'), before)
    assert.equal((await readWs()).head_version_id, v3.id)
  })
  await t.test('reviewing an exact displayed version does not erase newer changes or move backwards', async () => {
    secondReceipt = await mark(v2, firstReceipt)
    const current = await readWs()
    assert.equal(current.version.id, v3.id); assert.equal(current.review.version_id, v2.id)
    assert.deepEqual(current.comparison.definition_changes.commitments.updated, [commitmentId])
    assert.equal((await readWs(uid, iid, v1.id)).comparison.mode, 'historical_before_review')
    await assert.rejects(mark(v1, secondReceipt), e => e.code === '40001')
    await assert.rejects(mark(v3, firstReceipt), e => e.code === '40001')
  })
  await t.test('scope changes require a new observation baseline and are never passed off as comparable', async () => {
    const otherCap = await add('https://example.org/another-scope')
    const other = await intake('candidate', { capture_id: otherCap.capture_id, candidate_key: 'other', candidate_kind: 'claim', statement: 'A report.',
      source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
    const obs = await observe('observe', { observation_id: randomUUID(), candidate_ids: [other] })
    const state = { ...clone(initialState), canonical_subject: null, scope_note: 'Different explicitly observed fixture.', hypotheses: [], commitments: [], coverage: [] }
    const next = await ws('put', putInput(v3, obs, state))
    const b = await readWs()
    assert.equal(b.comparison.mode, 'scope_changed'); assert.equal(b.comparison.evidence_changes, null)
    assert.equal(b.comparison.definition_changes.scope_changed, true)
    assert.deepEqual(b.comparison.definition_changes.hypotheses.removed, [hypothesisId])
    assert.equal((await readWs(uid, iid, v1.id)).version.id, v1.id)
    v3 = next
  })
  await t.test('access revocation is audited and takes effect on the next read or write', async () => {
    const count = await scalar('select count(*)::int from evidence_pipeline.investigation_access_events')
    await grant(uid, 'revoked'); await grant(uid, 'revoked')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_access_events'), count + 1)
    await assert.rejects(readWs(), e => e.code === '42501')
    await assert.rejects(mark(v3, secondReceipt), e => e.code === '42501')
    assert.deepEqual((await ws('list', { user_id: uid })).items, [])
    await grant(uid)
    assert.equal((await readWs()).review.id, secondReceipt.id)
  })
  await t.test('rollback preserves the previous head and immutable history rejects rewrites', async () => {
    await db.exec('begin'); await ws('put', putInput(v3, { id: v3.observation_id }, v3.state)); await db.exec('rollback')
    assert.equal((await readWs()).head_version_id, v3.id)
    for (const table of ['investigation_versions', 'investigation_review_receipts', 'investigation_access_events']) {
      await assert.rejects(db.exec(`update evidence_pipeline.${table} set recorded_at=now()`), /append-only/)
      await assert.rejects(db.exec(`delete from evidence_pipeline.${table}`), /append-only/)
      await assert.rejects(db.exec(`truncate evidence_pipeline.${table} cascade`), /append-only/)
    }
  })
  await t.test('browser roles cannot invoke privileged RPCs, forge a user ID or read private tables', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(readWs(), /permission denied/)
      await assert.rejects(grant(outsider), /permission denied/)
      await assert.rejects(db.query('select evidence_pipeline.workspace_read($1,$2)', [uid, iid]), /permission denied/)
      for (const table of ['investigations', 'investigation_versions', 'investigation_memberships', 'investigation_review_receipts', 'investigation_access_events']) {
        await assert.rejects(db.exec(`select * from evidence_pipeline.${table}`), /permission denied/)
      }
      await db.exec('reset role')
    }
  })
  await t.test('client through authenticated handler through real SQL returns a consistent five-panel bundle', async () => {
    await db.exec('set role service_role')
    const handler = createWorkspaceHandler({ authenticate: async token => token === 'Bearer test-user' ? { id: uid } : null,
      rpc: async (action, input) => { try { return { data: await ws(action, input) } } catch (e) { return { error: { code: e.code, message: e.message } } } } })
    const client = createInvestigationWorkspaceClient({ functions: { invoke: async (name, options) => {
      assert.equal(name, 'investigation-workspace')
      const res = await handler(new Request('https://fixture.test', { method: 'POST', headers: { authorization: 'Bearer test-user', origin, 'content-type': 'application/json' }, body: JSON.stringify(options.body) }))
      return res.ok ? { data: await res.json() } : { error: { context: res } }
    } } })
    const list = await client.list(); assert.equal(list.error, null); assert.ok(list.data.items.some(i => i.investigation_id === iid))
    const result = await client.read(iid, v2.id), panels = investigationWorkspacePanels(result.data)
    assert.equal(result.error, null); assert.equal(panels.versionId, v2.id)
    assert.equal(panels.hypotheses.length, 1); assert.equal(panels.commitments.length, 1); assert.equal(panels.coverage.length, 1)
    const denied = await client.read(randomUUID()); assert.equal(denied.error.code, 'access_denied')
    const stale = await client.markReviewed({ investigationId: iid, versionId: v3.id, receiptId: randomUUID(), previousReceiptId: firstReceipt.id })
    assert.equal(stale.error.code, 'version_conflict')
    const marked = await client.markReviewed({ investigationId: iid, versionId: v3.id, receiptId: randomUUID(), previousReceiptId: secondReceipt.id })
    assert.equal(marked.error, null); assert.equal(marked.data.version_id, v3.id)
    await db.exec('reset role')
  })
  await t.test('Unicode citations preserve raw text and reject UTF-16 offsets', async () => {
    const snapshot = { inputs: [{ position: '9007199254740993', capture: { payload: { summary: '💡 A report.' } }, record_version: null }] }
    const ref = { position: '9007199254740993', source_field: 'summary', span_start: 2, span_end: 11, excerpt: 'A report.', relation: 'context', note: 'Unicode fixture.' }
    await db.query('select evidence_pipeline.workspace_evidence($1::jsonb,$2::jsonb)', [JSON.stringify([ref]), JSON.stringify(snapshot)])
    await assert.rejects(db.query('select evidence_pipeline.workspace_evidence($1::jsonb,$2::jsonb)', [JSON.stringify([{ ...ref, span_start: 3, span_end: 12 }]), JSON.stringify(snapshot)]), /span mismatch/)
    const bundle = { observation: { snapshot } }
    assert.equal(resolveWorkspaceExcerpt(bundle, ref).before, '💡 ')
    assert.equal(resolveWorkspaceExcerpt(bundle, { ...ref, span_start: 3, span_end: 12 }), null)
    assert.equal(resolveWorkspaceExcerpt(bundle, { ...ref, position: '9007199254740992' }), null)
  })
  await t.test('live deployment canary runs unchanged locally', async () => {
    await db.exec(await read('../supabase/tests/investigation_workspace_smoke.sql'))
  })
  await t.test('list pagination is user-scoped and does not imply a frozen catalog', async () => {
    for (let i = 0; i < 3; i++) {
      const id = randomUUID(); await ws('put', putInput(null, initialObservation, initialState, id)); await grant(uid, 'viewer', id)
    }
    let input = { user_id: uid, limit: 1 }, ids = []
    for (;;) {
      const r = await ws('list', input); ids.push(...r.items.map(i => i.investigation_id))
      if (!r.has_more) { assert.equal(r.next_after, null); break }
      input.after = r.next_after
    }
    assert.equal(ids.length, 4); assert.equal(new Set(ids).size, 4)
    await assert.rejects(ws('list', { user_id: uid, limit: 51 }), /limit/)
  })
})

test('HTTP boundary rejects identity spoofing, administrative calls and oversized requests', async t => {
  let authCalls = 0, rpcCalls = 0
  const handler = createWorkspaceHandler({ authenticate: async token => { authCalls++; return token === 'Bearer valid' ? { id: uid } : null },
    rpc: async (action, input) => { rpcCalls++; return { data: { action, input } } } })
  const send = (body = { action: 'list' }, headers = {}, method = 'POST') => handler(new Request('https://fixture.test', {
    method, headers: { 'content-type': 'application/json', authorization: 'Bearer valid', origin, ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }))
  await t.test('preflight is unauthenticated and restricted to the expected origin', async () => {
    const r = await send(null, { authorization: '' }, 'OPTIONS'); assert.equal(r.status, 204)
    assert.equal(r.headers.get('access-control-allow-origin'), origin); assert.equal(authCalls, 0)
    assert.equal((await send(null, { origin: 'https://unrelated.example' }, 'OPTIONS')).status, 403)
  })
  await t.test('spoofed identity, role, mutation and unsupported fields never reach Auth or SQL', async () => {
    for (const body of [{ action: 'set_access', input: {} }, { action: 'put', input: {} }, { action: 'list', input: { user_id: outsider } },
      { action: 'read', input: { investigation_id: randomUUID(), access_role: 'reviewer' } }, { action: 'list', user_id: outsider },
      { action: 'list', input: { limit: 0 } }, { action: 'mark_review', input: {} }, { action: 'toString' }]) {
      assert.equal((await send(body)).status, 400)
    }
    assert.equal(authCalls, 0); assert.equal(rpcCalls, 0)
  })
  await t.test('invalid authentication never reaches SQL and verified identity is injected', async () => {
    assert.equal((await send(undefined, { authorization: '' })).status, 401)
    assert.equal((await send(undefined, { authorization: 'Bearer wrong' })).status, 401)
    assert.equal(rpcCalls, 0)
    const r = await send(); assert.equal(r.status, 200)
    assert.equal((await r.json()).data.input.user_id, uid)
    assert.equal(r.headers.get('cache-control'), 'private, no-store')
  })
  await t.test('bounded payload, JSON decoding, method and media type validation', async () => {
    assert.equal((await send('x'.repeat(9000))).status, 413)
    assert.equal((await send('{')).status, 400)
    assert.equal((await send({}, { 'content-type': 'text/plain' })).status, 415)
    assert.equal((await send(null, {}, 'GET')).status, 405)
  })
  await t.test('errors never expose SQL, credentials or private source text', async () => {
    for (const [code, status, expected] of [['42501', 403, 'access_denied'], ['40001', 409, 'version_conflict'], ['23505', 409, 'version_conflict'], ['22023', 400, 'invalid_request'], ['XX000', 503, 'service_unavailable']]) {
      const h = createWorkspaceHandler({ authenticate: async () => ({ id: uid }), rpc: async () => ({ error: { code, message: 'PRIVATE-CONTENT-AND-SECRET' } }) })
      const r = await h(new Request('https://fixture.test', { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: '{"action":"list"}' }))
      assert.equal(r.status, status); assert.deepEqual(await r.json(), { error: { code: expected } })
    }
  })
  await t.test('anonymous users and unavailable Auth fail closed', async () => {
    for (const [authenticate, status] of [[async () => ({ id: uid, is_anonymous: true }), 401], [async () => { throw new Error('secret') }, 503]]) {
      const h = createWorkspaceHandler({ authenticate, rpc: async () => assert.fail('SQL must not run') })
      const r = await h(new Request('https://fixture.test', { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: '{"action":"list"}' }))
      assert.equal(r.status, status)
    }
  })
})

test('transport pins the target, validates Auth remotely and confines service credentials to the RPC', async () => {
  const calls = []
  const transport = createWorkspaceTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'public-key-fixture', serviceKey: 'server-key-fixture',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json(url.endsWith('/user') ? { id: uid } : { contract_version: 'investigation-workspace-1' }) } })
  assert.equal((await transport.authenticate('Bearer end-user')).id, uid)
  await transport.rpc('list', { user_id: uid })
  assert.equal(calls[0].options.headers.apikey, 'public-key-fixture'); assert.equal(calls[0].options.headers.Authorization, 'Bearer end-user')
  assert.equal(calls[1].options.headers.apikey, 'server-key-fixture'); assert.equal(calls[1].options.headers.Authorization, 'Bearer server-key-fixture')
  assert.ok(calls.every(c => c.options.redirect === 'error'))
  for (const url of ['http://qikvmopbtijoebdqosyq.supabase.co', 'https://other.supabase.co', 'https://qikvmopbtijoebdqosyq.supabase.co/path', 'https://user@qikvmopbtijoebdqosyq.supabase.co']) {
    assert.throws(() => createWorkspaceTransport({ url, anonKey: 'x', serviceKey: 'y' }), /configuration/)
  }
  assert.deepEqual(await createInvestigationWorkspaceClient(null).list(), { data: null, error: { code: 'not_configured' } })
  const expiredSessionClient = createInvestigationWorkspaceClient({ functions: { invoke: async () => ({
    error: { context: Response.json({ code: 'UNAUTHORIZED_INVALID_JWT_FORMAT', message: 'Invalid JWT' }, { status: 401 }) },
  }) } })
  assert.deepEqual(await expiredSessionClient.list(), { data: null, error: { code: 'authentication_required' } })
  assert.equal(investigationWorkspacePanels({ contract_version: 'wrong' }), null)
})
