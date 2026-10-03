import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { installSelectiveExecutionFixture } from '../scripts/selectiveExecutionPackage.mjs'
import { installSelectiveCompletionFixture, SELECTIVE_COMPLETION_RESTORE } from '../scripts/selectiveIntakeCompletionPackage.mjs'
import { PGlite } from '@electric-sql/pglite'
import { createOperatorBackend, PIPELINE_TARGET } from '../scripts/operatorBackend.mjs'
import { runSelectiveSource, runSelectiveReconsideration, selectiveExecutionId } from '../scripts/selectiveIntakeExecution.mjs'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const rules = { contract_version: 'selective-metadata-rules-1', religion_shared_scope: true,
  analyze_signals: ['explicit_scope', 'primary_document', 'public_safety', 'institutional_accountability', 'economy', 'correction', 'new_relevant_input'], low_value_domains: ['sports', 'entertainment'] }
const state = { question: 'Synthetic selective test', scope_note: 'Shared explicit investigation scope.', canonical_subject: null,
  time_range: { from: null, to: null, meaning: 'Unknown event time.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }

test('registered criteria execute through actual native SQL and fixed operator transport with pre-fetch denial and reconsideration', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const actor = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), iid = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3)', [actor, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1'])
    await db.exec(await read('../supabase/migrations/' + files.find(f => f.endsWith(`_${suffix}.sql`))))
  for (const proposal of ['assessment_relevant_inputs_v1', 'investigation_selective_intake_v1'])
    await db.exec(await read(`../supabase/source-proposals/${proposal}.sql`))
  await installSelectiveExecutionFixture(db)
  await installSelectiveCompletionFixture(db)
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740993')
  const rpc = name => async (action, input = {}) => (await db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)])).rows[0].r
  const intake = rpc('mip_pipeline_v1'), workspace = rpc('mip_investigation_workspace_v1'), observe = rpc('mip_investigation_briefings_v1'), assessment = rpc('mip_assessments_v1')
  const add = async (url, summary) => {
    await intake('enqueue', { run_id: 'selective-native-fixture', article: { url, title: 'Synthetic', outlet: 'Fixture', summary } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const seed = await add('https://example.org/baseline', 'A retained baseline.')
  const seedCandidate = await intake('candidate', { capture_id: seed.capture_id, candidate_key: 'seed', candidate_kind: 'claim', statement: 'A retained baseline.',
    source_field: 'summary', span_start: 0, span_end: 20, excerpt: 'A retained baseline.', extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic.' })
  const base = await observe('observe', { observation_id: randomUUID(), candidate_ids: [seedCandidate] })
  const version = await workspace('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: null, observation_id: base.id, state, change_reason: 'Fixture baseline.' })
  for (const [user_id, access_role] of [[actor, 'reviewer'], [viewer, 'viewer']]) await workspace('set_access', { investigation_id: iid, user_id, access_role, reason: 'Fixture assignment.' })
  await db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5)', ['launch-selective', 'fixture-1', 'policy-fixture-1', 'synthetic:accepted-policy', rules])
  const authorize = async (url, overrides = {}) => {
    const id = randomUUID(), p = { enabled: true, acquire_allowed: true, retain_allowed: true, analyze_allowed: true,
      expires_at: '2099-01-01T00:00:00Z', max_bytes: 12000, max_requests: 3, criteria_version: 'fixture-1', ...overrides }
    await db.query(`insert into evidence_pipeline.selective_source_authorizations(authorization_id,investigation_id,actor_id,criteria_key,criteria_version,source_url,format,rights_ref,
      enabled,acquire_allowed,retain_allowed,analyze_allowed,expires_at,max_bytes,max_requests)
      values($1,$2,$3,'launch-selective',$12,$4,'mip_article_json_v1','synthetic:operation-rights',$5,$6,$7,$8,$9,$10,$11)`,
    [id, iid, actor, url, p.enabled, p.acquire_allowed, p.retain_allowed, p.analyze_allowed, p.expires_at, p.max_bytes, p.max_requests, p.criteria_version])
    return id
  }
  const backendCalls = [], sourceCalls = []; let race = null, annotationPatch = null
  const backend = createOperatorBackend({ url: PIPELINE_TARGET, key: 'sb_secret_synthetic_fixture', fetchImpl: async (url, init) => {
    assert.equal(new URL(url).origin, PIPELINE_TARGET); assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal)
    assert.equal(Object.hasOwn(init.headers, 'Authorization'), false)
    const name = new URL(url).pathname.split('/').at(-1), { p_action: action, p_input: input } = JSON.parse(init.body)
    backendCalls.push({ name, action, input })
    if (race && name === 'mip_selective_execution_v1' && action === 'permit') { const fn = race; race = null; await fn() }
    if (annotationPatch && name === 'mip_selective_execution_v1' && action === 'annotate') { const fn = annotationPatch; annotationPatch = null; fn(input) }
    await db.exec('set role service_role')
    try { return Response.json(await rpc(name)(action, input)) }
    catch (error) { return Response.json({ code: error.code, message: 'Synthetic fixed error' }, { status: 400 }) }
    finally { await db.exec('reset role') }
  } })
  const fetchImpl = async (url, init) => {
    sourceCalls.push({ url, init }); assert.equal(init.redirect, 'error'); assert.equal(init.method, 'GET')
    assert.deepEqual(init.headers, { Accept: 'application/json' }); assert.ok(init.signal instanceof AbortSignal)
    return Response.json({ url, title: 'Fixture report', outlet: 'Fixture source', summary: 'An institution reported a material action.' })
  }
  const request = async (url, domains, signals = [], authorization = null) => ({ user_id: actor, investigation_id: iid,
    version_id: (await workspace('read', { user_id: actor, investigation_id: iid })).head_version_id,
    selection_id: randomUUID(), previous_selection_id: null, authorization_id: authorization ?? await authorize(url),
    metadata: { url, domain_declarations: domains.map(domain_ref => ({ domain_ref, classification_ref: `fixture:classification:${domain_ref}` })), signals } })
  const count = async table => (await db.query(`select count(*)::int n from evidence_pipeline.${table}`)).rows[0].n
  let accepted, executed, original

  await t.test('deterministic fixture matrix preserves explicit religion and important sports/entertainment scope', async () => {
    const cases = [
      [['sports'], [], 'skip_for_now'], [['entertainment'], [], 'skip_for_now'],
      [['sports'], ['institutional_accountability'], 'analyze_now'], [['entertainment'], ['public_safety'], 'analyze_now'],
      [['religion'], [], 'retain_deferred'], [['religious_institution'], ['explicit_scope'], 'analyze_now'],
      [['economy', 'religion'], [], 'retain_deferred'], [['unknown'], [], 'retain_deferred'],
      [['economy'], ['economy'], 'analyze_now'], [['politics'], ['primary_document'], 'analyze_now'],
    ]
    for (const [domains, signals, disposition] of cases) {
      const metadata = { url: 'https://example.org/matrix', domain_declarations: domains.map(domain_ref => ({ domain_ref, classification_ref: `fixture:${domain_ref}` })), signals }
      const actual = (await db.query('select evidence_pipeline.selective_metadata_decision($1::jsonb,$2::jsonb) r', [JSON.stringify(rules), JSON.stringify(metadata)])).rows[0].r
      assert.equal(actual.disposition, disposition)
    }
  })
  await t.test('skip and defer are durable metadata decisions with ZERO source HTTP/capture/candidate work', async () => {
    const captured = await count('article_captures'), candidates = await count('evidence_candidates'), calls = sourceCalls.length
    for (const [domains, disposition] of [[['sports'], 'skip_for_now'], [['religion'], 'retain_deferred']]) {
      const input = await request(`https://example.org/${disposition}`, domains)
      const result = await runSelectiveSource(backend, input, { fetchImpl })
      assert.equal(result.selection.disposition, disposition); assert.equal(result.source_requests, 0); assert.equal(result.publicly_eligible, false)
      assert.equal((await runSelectiveSource(backend, input, { fetchImpl })).selection.replayed, true)
    }
    assert.equal(sourceCalls.length, calls); assert.equal(await count('article_captures'), captured); assert.equal(await count('evidence_candidates'), candidates)
    assert.equal(await count('selective_fetch_permits'), 0)
  })
  await t.test('unknown/missing rights, disabled/expired grants and malformed endpoints deny before source HTTP', async () => {
    for (const overrides of [{ enabled: false }, { acquire_allowed: false }, { retain_allowed: false }, { analyze_allowed: false }, { expires_at: '2001-01-01T00:00:00Z' }]) {
      const url = `https://example.org/denied-${randomUUID()}`, authz = await authorize(url, overrides), input = await request(url, ['religion'], ['explicit_scope'], authz)
      await assert.rejects(runSelectiveSource(backend, input, { fetchImpl }), { code: '42501' })
    }
    const wrong = await request('https://example.org/missing', ['religion'], ['explicit_scope'], randomUUID())
    await assert.rejects(runSelectiveSource(backend, wrong, { fetchImpl }), { code: '42501' })
    const before = backendCalls.length
    for (const url of ['https://127.0.0.1/private', 'https://example.org@evil.example/file', 'https://localhost/file', 'http://example.org/file', 'https://example.org/file#secret'])
      await assert.rejects(runSelectiveSource(backend, { ...wrong, metadata: { ...wrong.metadata, url } }, { fetchImpl }))
    assert.equal(backendCalls.length, before); assert.equal(sourceCalls.length, 0)
  })
  await t.test('head and membership race before permit causes no acquisition', async () => {
    const input = await request('https://example.org/race', ['religion'], ['explicit_scope'])
    race = async () => workspace('set_access', { investigation_id: iid, user_id: actor, access_role: 'revoked', reason: 'Fixture race.' })
    await assert.rejects(runSelectiveSource(backend, input, { fetchImpl }), { code: '42501' })
    await workspace('set_access', { investigation_id: iid, user_id: actor, access_role: 'reviewer', reason: 'Fixture restored.' })
    const newer = await request('https://example.org/head-race', ['religion'], ['explicit_scope'])
    race = async () => workspace('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: newer.version_id, observation_id: base.id, state, change_reason: 'Fixture head race.' })
    await assert.rejects(runSelectiveSource(backend, newer, { fetchImpl }), { code: '40001' })
    assert.equal(sourceCalls.length, 0)
  })
  await t.test('authorized analyze-now executes native owners without publishing and exact retry never refetches', async () => {
    accepted = await request('https://example.org/authorized-institution', ['religion', 'economy'], ['explicit_scope'])
    executed = await runSelectiveSource(backend, accepted, { fetchImpl })
    assert.equal(executed.source_requests, 1); assert.equal(sourceCalls.length, 1); assert.equal(executed.execution.disposition, 'analyze_now')
    original = await backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })
    assert.equal(original.declaration.disposition, 'analyze_now'); assert.equal(original.declaration.result.provenance, 'caller_self_assertion')
    assert.deepEqual(original.declaration.result.domain_declarations.map(d => d.domain_ref), ['economy', 'religion'])
    assert.ok(BigInt(original.declaration.input_position) > BigInt(Number.MAX_SAFE_INTEGER))
    assert.equal((await assessment('read', { assessment_id: original.execution.assessment_id })).outcome, 'insufficient_evidence')
    const capture = (await db.query('select * from evidence_pipeline.article_captures where id=$1', [original.declaration.capture_id])).rows[0]
    assert.equal(capture.payload.url, accepted.metadata.url)
    assert.equal((await db.query('select reader_state from public.articles where id=$1', [capture.article_id])).rows[0].reader_state, 'pending_review')
    assert.equal((await runSelectiveSource(backend, accepted, { fetchImpl })).source_requests, 0); assert.equal(sourceCalls.length, 1)
    assert.equal(await count('selective_execution_receipts'), 1)
  })
  await t.test('registered versions and discovery receipt CAS prevent forged policy/source substitution and duplicate permit', async () => {
    const owner = { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id }
    await assert.rejects(backend.selectiveExecution('permit', { ...owner, permit_id: randomUUID() }), { code: '40001' })
    await assert.rejects(backend.selectiveExecution('select', { ...accepted, metadata: { ...accepted.metadata, signals: [] } }), { code: '23505' })
    const newInput = await request(accepted.metadata.url, ['religion'], [], accepted.authorization_id)
    await assert.rejects(backend.selectiveExecution('select', newInput), { code: '40001' })
    const malformed = await request('https://example.org/forged', ['religion'], ['explicit_scope'])
    await assert.rejects(backend.selectiveExecution('select', { ...malformed, metadata: { ...malformed.metadata, publicly_eligible: true } }), { code: '22023' })
    await db.exec('set role service_role')
    try { await assert.rejects(db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5)', ['forged', '1', '1', 'fake', rules]), { code: '42501' }) }
    finally { await db.exec('reset role') }
  })
  await t.test('correction automatically reconsiders native dependency, preserves original evidence and rebases future watches', async () => {
    const noChange = await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })
    assert.equal(noChange.state, 'no_new_bound_cause')
    const corrected = await add(accepted.metadata.url, 'A corrected institutional report.')
    const result = await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })
    assert.equal(result.state, 'reconsidered'); assert.equal(result.trigger.kind, 'dependency_change'); assert.equal(result.source_requests, 0)
    assert.equal(await count('selective_execution_receipts'), 2); assert.equal(sourceCalls.length, 1)
    const latest = await backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })
    assert.equal(latest.declaration.capture_id, original.declaration.capture_id)
    assert.equal(latest.execution.previous_execution_id, original.execution.execution_id)
    assert.notEqual(latest.execution.assessment_id, original.execution.assessment_id)
    const preserved = await rpc('mip_investigation_selective_intake_v1')('receipt', { user_id: actor, investigation_id: iid, receipt_id: original.declaration.receipt_id })
    assert.deepEqual(preserved.result, original.declaration.result)
    assert.equal((await db.query('select reader_state from public.articles where id=$1', [corrected.article_id])).rows[0].reader_state, 'pending_review')
    assert.equal((await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })).state, 'no_new_bound_cause')
  })
  await t.test('new retained input alone does not trigger; positive native relevance does, and a later correction triggers again', async () => {
    const incoming = await add('https://example.org/new-relevant', 'An independent fixture source report.')
    assert.equal((await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })).state, 'no_new_bound_cause')
    const position = (await db.query('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [incoming.capture_id])).rows[0].position
    await assessment('declare_relevance', { candidate_id: original.declaration.candidate_id, position, selection_method: 'fixture-explicit', selection_ref: 'fixture:new-relevant', rationale: 'Synthetic positive relevance.' })
    const result = await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })
    assert.equal(result.state, 'reconsidered'); assert.equal(result.trigger.change_position, position)
    await add('https://example.org/new-relevant', 'A correction to the now-declared relevant fixture source.')
    const relatedCorrection = await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })
    assert.equal(relatedCorrection.state, 'reconsidered'); assert.equal(relatedCorrection.trigger.kind, 'dependency_change')
    await add(accepted.metadata.url, 'A second correction with material context.')
    assert.equal((await runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id })).state, 'reconsidered')
    assert.equal(await count('selective_execution_receipts'), 5); assert.equal(sourceCalls.length, 1)
  })
  await t.test('registered receipt CAS refuses stale execution and exact historical retries stay idempotent', async () => {
    const originalInput = backendCalls.find(c => c.name === 'mip_selective_execution_v1' && c.action === 'annotate').input
    const before = await count('selective_execution_receipts')
    assert.equal((await backend.selectiveExecution('annotate', originalInput)).replayed, true)
    await assert.rejects(backend.selectiveExecution('annotate', { ...originalInput, execution_id: randomUUID() }), { code: '40001' })
    assert.equal(await count('selective_execution_receipts'), before)
  })
  await t.test('revoked operation rights deny both source fetch and further automatic reconsideration', async () => {
    const url = 'https://example.org/revoked-rights', authorization = await authorize(url)
    await db.query('insert into evidence_pipeline.selective_authorization_revocations(authorization_id,revocation_ref) values($1,$2)', [authorization, 'fixture:rights-revocation'])
    const input = await request(url, ['religion'], ['explicit_scope'], authorization), before = sourceCalls.length
    await assert.rejects(runSelectiveSource(backend, input, { fetchImpl }), { code: '42501' })
    assert.equal(sourceCalls.length, before)
    await db.query('insert into evidence_pipeline.selective_authorization_revocations(authorization_id,revocation_ref) values($1,$2)', [accepted.authorization_id, 'fixture:analysis-rights-revoked'])
    await add(accepted.metadata.url, 'A correction after analysis rights were revoked.')
    const priorCount = await count('selective_execution_receipts')
    await assert.rejects(runSelectiveReconsideration(backend, { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id }), { code: '42501' })
    assert.equal(await count('selective_execution_receipts'), priorCount); assert.equal(sourceCalls.length, before)
  })
  await t.test('stream byte budget aborts before capture, consumed permits never refetch, and grant quota is atomic', async () => {
    const url = 'https://example.org/oversized', authorization = await authorize(url, { max_bytes: 100, max_requests: 1 })
    const input = await request(url, ['religion'], ['explicit_scope'], authorization)
    let attempts = 0
    const oversized = async () => { attempts++; return Response.json({ url, title: 'Fixture', outlet: 'Fixture', summary: 'x'.repeat(1000) }) }
    const before = await count('article_captures')
    await assert.rejects(runSelectiveSource(backend, input, { fetchImpl: oversized }), /byte budget/)
    assert.equal(attempts, 1); assert.equal(await count('article_captures'), before)
    await assert.rejects(runSelectiveSource(backend, input, { fetchImpl: oversized }), { code: '40001' }); assert.equal(attempts, 1)
    const next = { ...input, selection_id: randomUUID(), previous_selection_id: input.selection_id }
    await assert.rejects(runSelectiveSource(backend, next, { fetchImpl: oversized }), { code: '42501' }); assert.equal(attempts, 1)
  })
  await t.test('a substituted unregistered criteria version cannot append a canonical annotation', async () => {
    const input = await request('https://example.org/forged-policy-execution', ['religion'], ['explicit_scope'])
    const before = await count('investigation_selective_intake_receipts')
    annotationPatch = p => { p.annotation.result.method_version = 'unregistered-policy' }
    await assert.rejects(runSelectiveSource(backend, input, { fetchImpl }), { code: '22023' })
    assert.equal(await count('investigation_selective_intake_receipts'), before)
  })
  await t.test('criteria successor and source authorization revisions are explicit and never overwrite the prior decision', async () => {
    const prior = await request('https://example.org/versioned-criteria', ['sports'])
    const old = await runSelectiveSource(backend, prior, { fetchImpl }); assert.equal(old.selection.disposition, 'skip_for_now')
    const successorRules = { ...rules, low_value_domains: [] }
    await db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5)', ['launch-selective', 'fixture-2', 'policy-fixture-2', 'synthetic:accepted-successor', successorRules])
    const newGrant = await authorize(prior.metadata.url, { criteria_version: 'fixture-2' })
    const input = { ...prior, selection_id: randomUUID(), authorization_id: newGrant, previous_selection_id: prior.selection_id }
    const fresh = await runSelectiveSource(backend, input, { fetchImpl }); assert.equal(fresh.selection.disposition, 'retain_deferred')
    assert.equal(fresh.selection.criteria_version, 'fixture-2')
    assert.equal((await backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: prior.selection_id })).selection.criteria_version, 'fixture-1')
    assert.equal((await backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: prior.selection_id })).selection.disposition, 'skip_for_now')
  })
  await t.test('SQL reader and mutation privileges stay default-deny and historical receipts remain immutable', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await assert.rejects(db.query('select * from evidence_pipeline.selective_criteria_versions'), { code: '42501' })
        await assert.rejects(rpc('mip_selective_execution_v1')('read', { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id }), { code: '42501' })
      } finally { await db.exec('reset role') }
    }
    await assert.rejects(backend.selectiveExecution('read', { user_id: outsider, investigation_id: iid, selection_id: accepted.selection_id }), { code: '42501' })
    const readOnly = await backend.selectiveExecution('read', { user_id: viewer, investigation_id: iid, selection_id: accepted.selection_id }); assert.equal(readOnly.publicly_eligible, false)
    await assert.rejects(backend.selectiveExecution('permit', { user_id: viewer, investigation_id: iid, selection_id: accepted.selection_id, permit_id: randomUUID() }), { code: '42501' })
    await assert.rejects(db.query("update evidence_pipeline.selective_criteria_versions set policy_version='changed'"), /append-only|immutable/)
    assert.equal((await db.query("select count(*)::int n from public.articles where reader_state='eligible'")).rows[0].n, 0)
  })
  await t.test('new source capture never republishes or overwrites an existing eligible article', async () => {
    const url = 'https://example.org/existing-eligible', retained = await add(url, 'The retained eligible original report.')
    // Synthetic pre-existing admission; selective execution itself has no publication operation.
    await db.query("update public.articles set reader_state='eligible' where id=$1", [retained.article_id])
    const before = (await db.query('select id,title,summary,reader_state from public.articles where id=$1', [retained.article_id])).rows[0]
    const input = await request(url, ['religion'], ['explicit_scope']), result = await runSelectiveSource(backend, input, { fetchImpl })
    assert.equal(result.execution.disposition, 'analyze_now')
    const saved = await backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: input.selection_id })
    assert.notEqual(saved.declaration.capture_id, retained.capture_id)
    const cap = (await db.query('select c.payload,c.review_state,j.outcome from evidence_pipeline.article_captures c join evidence_pipeline.import_jobs j on j.id=c.job_id where c.id=$1', [saved.declaration.capture_id])).rows[0]
    assert.equal(cap.outcome, 'revision_pending'); assert.equal(cap.review_state, 'pending'); assert.notEqual(cap.payload.summary, before.summary)
    assert.deepEqual((await db.query('select id,title,summary,reader_state from public.articles where id=$1', [retained.article_id])).rows[0], before)
  })
  await t.test('automatic extraction uses canonical retained Unicode spans after native title normalization', async () => {
    const url = 'https://example.org/unicode-title', input = await request(url, ['religion'], ['explicit_scope'])
    const result = await runSelectiveSource(backend, input, { fetchImpl: async () => Response.json({ url, title: '  🏛️ Institution report  ', outlet: ' Fixture ' }) })
    const saved = await backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: input.selection_id })
    const candidate = (await db.query('select * from evidence_pipeline.evidence_candidates where id=$1', [saved.declaration.candidate_id])).rows[0]
    assert.equal(result.execution.disposition, 'analyze_now'); assert.equal(candidate.source_field, 'title')
    assert.equal(candidate.excerpt, '🏛️ Institution report'); assert.equal(candidate.span_start, 0)
    assert.equal(candidate.span_end, Array.from(candidate.excerpt).length)
  })
  await t.test('standalone preflight and rollback pack preserve populated native/private history and stop only the new producer', async () => {
    // The original install/stop catalogue is historical; restore the bounded follow-on first.
    await db.exec(await readFile(SELECTIVE_COMPLETION_RESTORE, 'utf8'))
    const before = await count('article_captures'), executions = await count('selective_execution_receipts')
    await db.exec(await read('../supabase/source-proposals/selective-intake-pack/preflight.sql'))
    await assert.rejects(db.exec(await read('../supabase/source-proposals/selective-intake-pack/remove-empty-extension.sql')), /populated selective history/)
    await db.exec('rollback')
    assert.equal(await count('article_captures'), before); assert.equal(await count('selective_execution_receipts'), executions)
    await db.exec(await read('../supabase/source-proposals/selective-intake-pack/rollback.sql'))
    await assert.rejects(backend.selectiveExecution('read', { user_id: actor, investigation_id: iid, selection_id: accepted.selection_id }), { code: '42501' })
    assert.equal((await rpc('mip_investigation_selective_intake_v1')('receipt', { user_id: actor, investigation_id: iid, receipt_id: original.declaration.receipt_id })).receipt_id, original.declaration.receipt_id)
    assert.equal(await count('article_captures'), before); assert.equal(await count('selective_execution_receipts'), executions)
  })
})

test('operator refuses malformed command or an invalid permit before source HTTP', async () => {
  let calls = 0
  const input = { user_id: randomUUID(), investigation_id: randomUUID(), version_id: randomUUID(), selection_id: randomUUID(), previous_selection_id: null,
    authorization_id: randomUUID(), metadata: { url: 'https://example.org/article', domain_declarations: [{ domain_ref: 'religion', classification_ref: 'fixture' }], signals: ['explicit_scope'] } }
  const backend = { selectiveExecution: async action => action === 'select' ? { selection_id: input.selection_id, disposition: 'analyze_now', publicly_eligible: false } : action === 'read' ? {} : { selection_id: input.selection_id, url: 'https://evil.example/other', publicly_eligible: false } }
  await assert.rejects(runSelectiveSource(backend, input, { fetchImpl: () => { calls++; assert.fail('invalid permit reached source') } }))
  await assert.rejects(runSelectiveSource(backend, { ...input, publicly_eligible: true }, { fetchImpl: () => { calls++ } }))
  assert.equal(calls, 0)
  assert.match(selectiveExecutionId('fixture', 'stable'), /^[a-f0-9-]{36}$/)
})

test('clean-install rollback removes only the empty extension and preserves native owners', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1'])
    await db.exec(await read('../supabase/migrations/' + files.find(f => f.endsWith(`_${suffix}.sql`))))
  for (const proposal of ['assessment_relevant_inputs_v1', 'investigation_selective_intake_v1'])
    await db.exec(await read(`../supabase/source-proposals/${proposal}.sql`))
  await installSelectiveExecutionFixture(db)
  await db.exec(await read('../supabase/source-proposals/selective-intake-pack/remove-empty-extension.sql'))
  const catalog = (await db.query("select to_regprocedure('public.mip_selective_execution_v1(text,jsonb)') extension, to_regprocedure('public.mip_investigation_selective_intake_v1(text,jsonb)') native")).rows[0]
  assert.equal(catalog.extension, null); assert.ok(catalog.native)
})

test('new CLI acquisition and reconsideration writes require apply before backend creation', async () => {
  const run = promisify(execFile)
  for (const action of ['select-source', 'reconsider-selective'])
    await assert.rejects(run(process.execPath, ['scripts/evidencePipeline.mjs', action], { cwd: new URL('../', import.meta.url), env: {} }), error => error.code === 1 && /Pass --apply/.test(error.stderr))
})
