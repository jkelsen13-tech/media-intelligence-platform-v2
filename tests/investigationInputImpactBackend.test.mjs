import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { retainedInputImpact, validPosition } from '../supabase/functions/investigation-input-impact/impact.mjs'
import { createInputImpactHandler } from '../supabase/functions/investigation-input-impact/handler.mjs'
import { createInvestigationInputImpactClient, inputImpactMatches } from '../src/lib/investigationInputImpactClient.js'

test('input lookup transport rejects unsafe requests and mismatched upstream identities without leaking errors', async () => {
  let calls = 0
  const input = { investigation_id: randomUUID(), version_id: randomUUID(), position: '1' }
  const handler = createInputImpactHandler({ authenticate: async () => ({ id: randomUUID() }), rpc: async () => {
    calls++; return { data: { investigation_id: input.investigation_id, version: { id: randomUUID() } } }
  } })
  const make = (method = 'POST', headers = {}, body = JSON.stringify({ action: 'read', input })) => new Request('https://fixture.test', {
    method, headers: { authorization: 'Bearer fixture', 'content-type': 'application/json', ...headers },
    ...(['GET', 'OPTIONS'].includes(method) ? {} : { body }),
  })
  assert.equal((await handler(make('OPTIONS', { origin: 'https://jkelsen13-tech.github.io' }))).status, 204)
  const denied = await handler(make('POST', { origin: 'https://untrusted.example' }))
  assert.equal(denied.status, 403); assert.equal(denied.headers.has('access-control-allow-origin'), false)
  assert.equal((await handler(make('GET'))).status, 405)
  assert.equal((await handler(make('POST', { authorization: '' }))).status, 401)
  assert.equal((await handler(make('POST', { 'content-type': 'text/plain' }))).status, 415)
  assert.equal((await handler(make('POST', {}, '{broken'))).status, 400)
  assert.equal(calls, 0)
  const mismatch = await handler(make())
  assert.equal(mismatch.status, 503)
  assert.deepEqual(await mismatch.json(), { error: { code: 'service_unavailable' } })
  const failed = createInputImpactHandler({ authenticate: async () => { throw new Error('private upstream diagnostic') }, rpc: async () => assert.fail('must not call RPC') })
  assert.deepEqual(await (await failed(make())).json(), { error: { code: 'service_unavailable' } })
})

test('authenticated input impact uses actual immutable SQL versions and never writes a review or assessment', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = path => readFile(new URL(path, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const user = randomUUID(), outsider = randomUUID()
  await db.query('insert into public.mip_profiles(id) values($1),($2)', [user, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1']) {
    const matches = files.filter(file => file.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740993')
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  const add = async summary => {
    await intake('enqueue', { run_id: 'impact-fixture', article: { url: 'https://example.org/impact', title: 'Synthetic report', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const capture = await add('💡 A report.')
  const candidate = await intake('candidate', { capture_id: capture.capture_id, candidate_key: 'impact', candidate_kind: 'claim', statement: 'A report.',
    source_field: 'summary', span_start: 2, span_end: 11, excerpt: 'A report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const context = await assess('context', { candidate_id: candidate })
  const assessment = await assess('append', { candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: '1', outcome: 'insufficient_evidence',
    rationale: 'Synthetic saved reasoning.', remaining_uncertainty: 'No substantive finding.', context_positions: context.context_positions })
  const observation = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const position = observation.snapshot.inputs.find(input => input.capture?.id === capture.capture_id).position
  const citation = { position, source_field: 'summary', span_start: 2, span_end: 11, excerpt: 'A report.', relation: 'contradicts', note: 'Synthetic reference.' }
  const h1 = randomUUID(), h2 = randomUUID(), c1 = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), investigation = randomUUID()
  const hypothesis = (id, evidence, ids) => ({ id, statement: 'Synthetic explanation.', evidence, assessment_ids: ids, assumptions: [], would_strengthen: ['Primary record.'], would_weaken: ['Correction.'], remaining_uncertainty: 'Synthetic only.' })
  const state = { question: 'What is retained?', scope_note: 'Synthetic fixture.', canonical_subject: null, time_range: { from: null, to: null, meaning: 'Unspecified event interval.' },
    unresolved_questions: [], coverage: [], hypotheses: [hypothesis(h1, [citation], []), hypothesis(h2, [], [assessment])],
    commitments: [{ id: c1, actor: 'Fixture institution', statement: 'Fixture commitment.', scope: 'Fixture.', conditions: [], deadline_text: 'Unknown.', success_criterion: 'Direct observation.', remaining_uncertainty: 'Not evaluated.', stages: [
      { id: s1, kind: 'commitment', status: 'reported', depends_on: [], coverage_ids: [], evidence: [citation], note: 'Synthetic announcement.' },
      { id: s2, kind: 'outcome', status: 'unknown', depends_on: [s1], coverage_ids: [], evidence: [], note: 'No outcome evidence.' },
    ] }],
  }
  const version = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: null, observation_id: observation.id, state, change_reason: 'Fixture.' })
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'viewer', reason: 'Fixture assignment.' })
  const readWs = v => ws('read', { investigation_id: investigation, version_id: v, user_id: user })
  let principal = { id: user }, rpcCalls = []
  const handler = createInputImpactHandler({ authenticate: async () => principal, rpc: async (action, input) => {
    rpcCalls.push({ action, input }); assert.equal(action, 'read')
    try { return { data: await ws(action, input) } } catch (e) { return { error: { code: e.code } } }
  } })
  const request = body => new Request('https://fixture.test', { method: 'POST', headers: { authorization: 'Bearer fixture', origin: 'https://jkelsen13-tech.github.io', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const client = createInvestigationInputImpactClient({ functions: { invoke: async (name, options) => {
    assert.equal(name, 'investigation-input-impact')
    const response = await handler(request(options.body))
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    return response.ok ? { data: await response.json() } : { error: { context: response } }
  } } })
  const bundle = await readWs(version.id)
  const baseline = structuredClone(bundle)
  await t.test('viewer reads exact citations and distinguishes assessment context from stage prerequisites', async () => {
    const result = await client.read(investigation, version.id, position)
    assert.equal(result.error, null); assert.equal(inputImpactMatches(bundle, position, result.data), true)
    assert.deepEqual(result.data.context_assessment_ids, [assessment])
    assert.deepEqual(result.data.hypotheses, [{ id: h1, citation_indices: [0], assessment_ids: [] }, { id: h2, citation_indices: [], assessment_ids: [assessment] }])
    assert.deepEqual(result.data.stages, [{ commitment_id: c1, id: s1, citation_indices: [0] }])
    assert.deepEqual(await readWs(version.id), baseline)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 0)
  })
  await t.test('late correction remains outside the earlier version, with no implied changed conclusion', async () => {
    const late = await add('💡 A corrected report.')
    const nextObservation = await observe('observe', { observation_id: randomUUID(), previous_observation_id: observation.id, candidate_ids: [candidate] })
    const nextVersion = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: version.id, observation_id: nextObservation.id, state, change_reason: 'Later retained collection.' })
    const latePosition = nextObservation.snapshot.inputs.find(i => i.capture?.id === late.capture_id).position
    assert.equal((await client.read(investigation, version.id, latePosition)).error.code, 'input_unavailable')
    const result = await client.read(investigation, nextVersion.id, latePosition)
    assert.deepEqual(result.data.context_assessment_ids, [])
    assert.deepEqual(result.data.hypotheses, []); assert.deepEqual(result.data.stages, [])
    assert.equal(result.data.assessment_effect, 'none')
    assert.deepEqual(retainedInputImpact(await readWs(version.id), position), retainedInputImpact(baseline, position))
  })
  await t.test('unavailable context remains unresolved and repeated IDs do not inflate counts', () => {
    const altered = structuredClone(bundle)
    altered.observation.snapshot.selected_assessment_ids.push(assessment, 'missing')
    altered.version.state.hypotheses[1].assessment_ids.push(assessment)
    const result = retainedInputImpact(altered, position)
    assert.deepEqual(result.context_assessment_ids, [assessment]); assert.deepEqual(result.unknown_context_assessment_ids, ['missing'])
    assert.deepEqual(result.hypotheses[1].assessment_ids, [assessment])
  })
  await t.test('browser principals, extra fields, unsafe positions and arbitrary actions fail before RPC', async () => {
    const input = { investigation_id: investigation, version_id: version.id, position }
    const before = rpcCalls.length
    for (const body of [{ action: 'read', input: { ...input, user_id: outsider } }, { action: 'put', input }, { action: 'read', input: { ...input, version_id: undefined } },
      ...[Number(position), '01', '0', '-1', '9223372036854775808'].map(position => ({ action: 'read', input: { ...input, position } }))]) {
      assert.equal((await handler(request(body))).status, 400)
    }
    assert.equal(rpcCalls.length, before)
    assert.equal((await handler(request({ action: 'read', input, padding: 'x'.repeat(9000) }))).status, 413)
    assert.equal(validPosition('9223372036854775807'), true)
  })
  await t.test('outsider, anonymous, cross-version and revoked reads fail without returning references', async () => {
    principal = { id: outsider }; assert.equal((await client.read(investigation, version.id, position)).error.code, 'access_denied')
    principal = { id: user, is_anonymous: true }; assert.equal((await client.read(investigation, version.id, position)).error.code, 'authentication_required')
    principal = { id: user }; assert.equal((await client.read(investigation, randomUUID(), position)).error.code, 'access_denied')
    await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'revoked', reason: 'Fixture revoked.' })
    const result = await client.read(investigation, version.id, position)
    assert.equal(result.error.code, 'access_denied'); assert.equal(result.data, null)
  })
})
