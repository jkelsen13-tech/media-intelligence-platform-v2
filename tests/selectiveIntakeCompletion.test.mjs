import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { installSelectiveExecutionFixture } from '../scripts/selectiveExecutionPackage.mjs'
import { installSelectiveCompletionFixture } from '../scripts/selectiveIntakeCompletionPackage.mjs'
import { selectiveExecutionPrerequisites } from './selectiveExecutionPackageFixture.mjs'
import { runSelectiveSource, runSelectiveReconsideration, selectiveExecutionId } from '../scripts/selectiveIntakeExecution.mjs'
import { readFile } from 'node:fs/promises'
import { SELECTIVE_COMPLETION_PROPOSAL, SELECTIVE_COMPLETION_RESTORE } from '../scripts/selectiveIntakeCompletionPackage.mjs'
import { selectiveExecutionInstalledCatalogQuery } from '../scripts/selectiveExecutionPackage.mjs'
import { SELECTIVE_CONTRACT_CATALOG } from './fixtures/selectiveIntakeContractCatalog.mjs'

async function fixture(t, { completion = true } = {}) {
  const db = await selectiveExecutionPrerequisites(); t.after(() => db.close())
  await installSelectiveExecutionFixture(db)
  const catalogues = completion ? await installSelectiveCompletionFixture(db) : null
  const rpc = name => async (action, input) => (await db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)])).rows[0].r
  const raw = { selectiveExecution: rpc('mip_selective_execution_v1'), intake: rpc('mip_pipeline_v1'), assessments: rpc('mip_assessments_v1'),
    observations: rpc('mip_investigation_briefings_v1'), workspace: rpc('mip_investigation_workspace_v1') }
  const actor = randomUUID(), iid = randomUUID(), calls = [], hooks = {}
  const add = async (url, summary) => {
    await raw.intake('enqueue', { run_id: 'synthetic-completion', article: { url, title: 'Fixture institution', outlet: 'Fixture', summary } })
    const job = await raw.intake('claim', {}); return raw.intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  await db.query('insert into public.mip_profiles values($1)', [actor])
  const seed = await add('https://example.org/completion-seed', 'Retained fixture.')
  const candidate = await raw.intake('candidate', { capture_id: seed.capture_id, candidate_key: 'seed', candidate_kind: 'claim', statement: 'Retained fixture.',
    source_field: 'summary', span_start: 0, span_end: 17, excerpt: 'Retained fixture.', extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic.' })
  const observation = await raw.observations('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const version = await raw.workspace('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: null, observation_id: observation.id,
    state: { question: 'Synthetic completion', scope_note: 'Shared fixture scope.', canonical_subject: null,
      time_range: { from: null, to: null, meaning: 'Unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }, change_reason: 'Fixture baseline.' })
  await raw.workspace('set_access', { investigation_id: iid, user_id: actor, access_role: 'reviewer', reason: 'Synthetic assignment.' })
  const rules = { contract_version: 'selective-metadata-rules-1', religion_shared_scope: true,
    analyze_signals: ['explicit_scope', 'primary_document', 'public_safety', 'institutional_accountability', 'economy', 'correction', 'new_relevant_input'], low_value_domains: ['sports', 'entertainment'] }
  await db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5)', ['completion', 'fixture-1', 'policy-fixture-1', 'synthetic:acceptance', rules])
  const request = async (url, overrides = {}) => {
    const authorization = randomUUID()
    await db.query(`insert into evidence_pipeline.selective_source_authorizations(authorization_id,investigation_id,actor_id,criteria_key,criteria_version,source_url,format,rights_ref,
      enabled,acquire_allowed,retain_allowed,analyze_allowed,expires_at,max_bytes,max_requests)
      values($1,$2,$3,'completion',$6,$4,'mip_article_json_v1','synthetic:rights',true,true,true,true,$5,12000,2)`,
    [authorization, iid, actor, url, overrides.expires_at ?? '2099-01-01T00:00:00Z', overrides.criteria_version ?? 'fixture-1'])
    return { user_id: actor, investigation_id: iid, version_id: (await raw.workspace('read', { user_id: actor, investigation_id: iid })).head_version_id,
      selection_id: randomUUID(), previous_selection_id: null, authorization_id: authorization,
      metadata: { url, domain_declarations: [{ domain_ref: 'religious_institution', classification_ref: 'synthetic:institution' }], signals: ['explicit_scope'] } }
  }
  const backend = Object.fromEntries(Object.entries(raw).map(([facet, fn]) => [facet, async (action, input) => {
    calls.push({ facet, action, input })
    await hooks.before?.(facet, action, input)
    await db.exec('set role service_role')
    let result
    try { result = await fn(action, input) } finally { await db.exec('reset role') }
    await hooks.after?.(facet, action, input, result)
    return result
  }]))
  let fetched = 0
  const fetchImpl = async url => { fetched++; return Response.json({ url, title: 'Fixture institution', outlet: 'Fixture', summary: 'An institution made a public commitment.' }) }
  const owner = input => ({ user_id: actor, investigation_id: iid, selection_id: input.selection_id })
  const count = async table => (await db.query(`select count(*)::int n from evidence_pipeline.${table}`)).rows[0].n
  return { db, raw, actor, iid, version, backend, hooks, request, add, fetchImpl, owner, count, fetched: () => fetched, calls, catalogues }
}

test('intervening correction refuses a new registered execution over stale observed analysis', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/completion-correction')
  let injected = false
  f.hooks.before = async (facet, action) => {
    if (!injected && facet === 'selectiveExecution' && action === 'annotate') {
      injected = true; await f.add(input.metadata.url, 'A correction received after the registered observation.')
    }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(await f.count('selective_execution_receipts'), 0)
  assert.equal(f.fetched(), 1)
  assert.equal(await f.count('article_captures'), 3)
})

test('committed capture response loss resumes the same native progress with zero refetch', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/completion-lost-capture')
  let lost = false
  f.hooks.after = async (facet, action, command) => {
    if (!lost && facet === 'selectiveExecution' && action === 'capture' && command.article) {
      lost = true; throw Object.assign(new Error('synthetic lost response'), { code: 'network_error' })
    }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: 'network_error' })
  assert.equal(await f.count('selective_execution_receipts'), 0)
  const result = await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })
  assert.equal(result.source_requests, 0); assert.equal(f.fetched(), 1)
  assert.equal(await f.count('selective_fetch_permits'), 1)
  assert.equal(await f.count('selective_execution_receipts'), 1)
  assert.equal(result.execution.execution_id, selectiveExecutionId(input.selection_id, 'execution'))
})

test('each committed native response boundary resumes idempotently without a second permit', async t => {
  for (const boundary of ['candidate', 'analyze', 'observe', 'version', 'annotate']) await t.test(boundary, async t => {
    const f = await fixture(t), input = await f.request(`https://example.org/lost-${boundary}`)
    let lost = false
    f.hooks.after = async (facet, action, command) => {
      if (!lost && facet === 'selectiveExecution' && (command.continuation?.kind === boundary || action === boundary)) {
        lost = true; throw Object.assign(new Error('synthetic lost committed response'), { code: 'network_error' })
      }
    }
    await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: 'network_error' })
    const result = await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })
    assert.equal(result.source_requests, 0); assert.equal(f.fetched(), 1)
    assert.equal(await f.count('selective_fetch_permits'), 1)
    assert.equal(await f.count('article_captures'), 2)
    assert.equal(await f.count('evidence_candidates'), 2)
    assert.equal(await f.count('assessments'), 1)
    assert.equal(await f.count('selective_execution_receipts'), 1)
    assert.equal((await f.backend.selectiveExecution('read', f.owner(input))).declaration.capture_id,
      (await f.db.query('select c.id from evidence_pipeline.article_captures c join evidence_pipeline.import_receipts r on r.job_id=c.job_id where r.run_id=$1', [`selective:${input.selection_id}`])).rows[0].id)
  })
})

test('rights revocation at every delegated write rejects in SQL before that native mutation', async t => {
  for (const boundary of ['candidate', 'analyze', 'observe', 'version', 'annotate']) await t.test(boundary, async t => {
    const f = await fixture(t), input = await f.request(`https://example.org/revoked-${boundary}`)
    let revoked = false, before
    const tables = ['evidence_candidates', 'assessments', 'investigation_observations', 'investigation_versions', 'selective_execution_receipts']
    f.hooks.before = async (facet, action, command) => {
      if (!revoked && facet === 'selectiveExecution' && (command.continuation?.kind === boundary || action === boundary)) {
        revoked = true; before = await Promise.all(tables.map(f.count))
        await f.db.query('insert into evidence_pipeline.selective_authorization_revocations(authorization_id,revocation_ref) values($1,$2)', [input.authorization_id, 'synthetic:terms-change'])
      }
    }
    await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '42501' })
    assert.deepEqual(await Promise.all(tables.map(f.count)), before)
    assert.equal(f.fetched(), 1)
    await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '42501' })
    assert.equal(f.fetched(), 1)
  })
})

test('native head collision preserves partial retained work and refuses resume without refetch', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/head-collision')
  let collided = false, observationCount
  f.hooks.before = async (facet, action, command) => {
    if (!collided && facet === 'selectiveExecution' && command.continuation?.kind === 'analyze') {
      collided = true; observationCount = await f.count('investigation_observations')
      const current = await f.raw.workspace('read', { user_id: f.actor, investigation_id: f.iid })
      await f.raw.workspace('put', { investigation_id: f.iid, version_id: randomUUID(), previous_version_id: current.head_version_id,
        observation_id: current.observation.id, state: current.version.state, change_reason: 'Synthetic competing head.' })
    }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(await f.count('article_captures'), 2); assert.equal(await f.count('evidence_candidates'), 2)
  assert.equal(await f.count('assessments'), 0); assert.equal(await f.count('investigation_observations'), observationCount)
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(f.fetched(), 1); assert.equal(await f.count('selective_execution_receipts'), 0)
  const attempted = f.calls.find(c => c.input.continuation?.kind === 'analyze').input
  const current = await f.raw.workspace('read', { user_id: f.actor, investigation_id: f.iid })
  await assert.rejects(f.backend.selectiveExecution('capture', { ...attempted,
    continuation: { ...attempted.continuation, expected_version_id: current.head_version_id } }), { code: '40001' })
  assert.equal(await f.count('assessments'), 0)
})

test('canonical receipt head collision preserves the competing receipt and refuses incomplete execution retry', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/receipt-head-collision')
  let collided = false, competing
  f.hooks.before = async (facet, action, command) => {
    if (!collided && facet === 'selectiveExecution' && action === 'annotate') {
      collided = true
      const annotation = { ...command.annotation, receipt_id: randomUUID() }
      competing = (await f.db.query('select public.mip_investigation_selective_intake_v1($1,$2::jsonb) r', ['declare', JSON.stringify(annotation)])).rows[0].r
    }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(f.fetched(), 1); assert.equal(await f.count('selective_execution_receipts'), 0)
  assert.equal(await f.count('investigation_selective_intake_receipts'), 1)
  const preserved = (await f.db.query('select public.mip_investigation_selective_intake_v1($1,$2::jsonb) r',
    ['receipt', JSON.stringify({ user_id: f.actor, investigation_id: f.iid, receipt_id: competing.receipt_id })])).rows[0].r
  assert.deepEqual(preserved.result, competing.result)
})

test('one-use source capture binds its exact version and rejects changed bytes before another native job', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/source-version')
  let lost = false
  f.hooks.after = async (facet, action, command) => {
    if (!lost && facet === 'selectiveExecution' && action === 'capture' && command.article) { lost = true; throw Object.assign(new Error('lost'), { code: 'network_error' }) }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: 'network_error' })
  const saved = await f.backend.selectiveExecution('read', f.owner(input)), before = await f.count('import_jobs')
  await assert.rejects(f.backend.selectiveExecution('capture', { ...f.owner(input), permit_id: saved.progress.permit.permit_id,
    article: { ...saved.progress.capture.payload, summary: 'Substituted source bytes.' } }), { code: '23505' })
  assert.equal(await f.count('import_jobs'), before)
  assert.equal((await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })).source_requests, 0)
  const declaration = (await f.backend.selectiveExecution('read', f.owner(input))).declaration
  assert.equal(declaration.result.content_hash, saved.progress.capture.content_hash)
})

test('failed fetch and expired permit stay consumed; only an explicit successor selection can acquire again', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/fetch-failure')
  let attempts = 0
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: async () => { attempts++; throw new Error('Synthetic unavailable source') } }), /Synthetic unavailable/)
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: async () => { attempts++; assert.fail('consumed permit refetched') } }), { code: '40001' })
  assert.equal(attempts, 1); assert.equal(await f.count('article_captures'), 1)
  const successor = { ...input, selection_id: randomUUID(), previous_selection_id: input.selection_id }
  assert.equal((await runSelectiveSource(f.backend, successor, { fetchImpl: f.fetchImpl })).source_requests, 1)
  assert.equal(await f.count('selective_fetch_permits'), 2)
  const expired = await f.request('https://example.org/expired-permit')
  await f.backend.selectiveExecution('select', expired)
  const permitId = selectiveExecutionId(expired.selection_id, 'permit')
  await f.db.query('insert into evidence_pipeline.selective_fetch_permits(permit_id,selection_id,authorization_id,valid_until) values($1,$2,$3,$4)',
    [permitId, expired.selection_id, expired.authorization_id, '2001-01-01T00:00:00Z'])
  const before = await f.count('import_jobs')
  await assert.rejects(f.backend.selectiveExecution('capture', { ...f.owner(expired), permit_id: permitId,
    article: { url: expired.metadata.url, title: 'Fixture', outlet: 'Fixture' } }), { code: '40001' })
  assert.equal(await f.count('import_jobs'), before)
  await assert.rejects(runSelectiveSource(f.backend, expired, { fetchImpl: () => assert.fail('expired permit refetched') }), { code: '40001' })
})

test('native capture persistence failure rolls back its job and refuses automatic acquisition retry', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/failed-native-capture')
  const jobs = await f.count('import_jobs'), captures = await f.count('article_captures')
  await f.db.exec(`create function pg_temp.reject_fixture_capture() returns trigger language plpgsql security invoker as $$
    begin raise exception using errcode='40001',message='synthetic capture persistence failure';end $$;
    create trigger selective_fixture_failure before insert on evidence_pipeline.article_captures
      for each row execute function pg_temp.reject_fixture_capture()`)
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(await f.count('import_jobs'), jobs); assert.equal(await f.count('article_captures'), captures)
  assert.equal(await f.count('selective_fetch_permits'), 1)
  await f.db.exec('drop trigger selective_fixture_failure on evidence_pipeline.article_captures')
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(f.fetched(), 1)
  const successor = { ...input, selection_id: randomUUID(), previous_selection_id: input.selection_id }
  assert.equal((await runSelectiveSource(f.backend, successor, { fetchImpl: f.fetchImpl })).source_requests, 1)
  assert.equal(f.fetched(), 2); assert.equal(await f.count('article_captures'), captures + 1)
})

test('progress payload is producer-scoped and reconsideration refuses revoked authority before observation writes', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/progress-privacy')
  await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })
  const reviewer = randomUUID(), viewer = randomUUID(), outsider = randomUUID()
  await f.db.query('insert into public.mip_profiles values($1),($2),($3)', [reviewer, viewer, outsider])
  for (const [user_id, access_role] of [[reviewer, 'reviewer'], [viewer, 'viewer']])
    await f.raw.workspace('set_access', { investigation_id: f.iid, user_id, access_role, reason: 'Synthetic assignment.' })
  for (const user_id of [reviewer, viewer]) assert.equal((await f.backend.selectiveExecution('read', { ...f.owner(input), user_id })).progress, null)
  await assert.rejects(f.backend.selectiveExecution('read', { ...f.owner(input), user_id: outsider }), { code: '42501' })
  await f.add(input.metadata.url, 'A retained correction to a religious institution report.')
  await f.db.query('insert into evidence_pipeline.selective_authorization_revocations(authorization_id,revocation_ref) values($1,$2)', [input.authorization_id, 'synthetic:analysis-revoked'])
  const before = await Promise.all(['assessments', 'investigation_observations', 'investigation_versions', 'selective_execution_receipts'].map(f.count))
  await assert.rejects(runSelectiveReconsideration(f.backend, f.owner(input)), { code: '42501' })
  assert.deepEqual(await Promise.all(['assessments', 'investigation_observations', 'investigation_versions', 'selective_execution_receipts'].map(f.count)), before)
})

test('reconsideration response loss recovers a known receipt or holds a non-successor partial version without refetch', async t => {
  for (const boundary of ['reconsider', 'rebased-version']) await t.test(boundary, async t => {
    const f = await fixture(t), input = await f.request(`https://example.org/reconsider-loss-${boundary}`)
    await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })
    await f.add(input.metadata.url, 'A native retained correction requires reconsideration.')
    let lost = false, versions = 0
    f.hooks.after = async (facet, action, command) => {
      if (command.continuation?.kind === 'version') versions++
      if (!lost && facet === 'selectiveExecution' && ((boundary === 'reconsider' && action === 'reconsider') ||
        (boundary === 'rebased-version' && command.continuation?.kind === 'version' && versions === 2))) {
        lost = true; throw Object.assign(new Error('synthetic lost reconsideration response'), { code: 'network_error' })
      }
    }
    await assert.rejects(runSelectiveReconsideration(f.backend, f.owner(input)), { code: 'network_error' })
    if (boundary === 'reconsider') {
      assert.equal((await runSelectiveReconsideration(f.backend, f.owner(input))).state, 'reconsidered')
      assert.equal(await f.count('selective_execution_receipts'), 2)
    } else {
      const tables = ['assessments', 'investigation_observations', 'investigation_versions', 'investigation_selective_intake_receipts', 'selective_execution_receipts']
      const before = await Promise.all(tables.map(f.count))
      await assert.rejects(runSelectiveReconsideration(f.backend, f.owner(input)), /native successor observation required/)
      assert.deepEqual(await Promise.all(tables.map(f.count)), before)
      assert.equal(await f.count('selective_execution_receipts'), 1)
    }
    assert.equal(f.fetched(), 1); assert.equal(await f.count('selective_fetch_permits'), 1)
  })
})

test('completion requires a fresh exact catalogue and guarded restore preserves populated history and all original ACLs', async t => {
  const f = await fixture(t, { completion: false }), query = await selectiveExecutionInstalledCatalogQuery()
  await f.db.exec('set search_path=pg_catalog')
  const before = (await f.db.query(query)).rows[0].jsonb_build_object
  await assert.rejects(f.db.exec(await readFile(SELECTIVE_COMPLETION_PROPOSAL, 'utf8')), /catalogue missing or drifted/)
  await f.db.exec('rollback')
  assert.deepEqual((await f.db.query(query)).rows[0].jsonb_build_object, before)
  await installSelectiveCompletionFixture(f.db)
  const input = await f.request('https://example.org/restore-populated')
  await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })
  const preserved = await f.backend.selectiveExecution('read', f.owner(input))
  await f.db.exec("select set_config('mip.selective_completion_rollback_expected_catalog','{}',false)")
  await assert.rejects(f.db.exec(await readFile(SELECTIVE_COMPLETION_RESTORE, 'utf8')), /catalogue missing or drifted/)
  await f.db.exec('rollback')
  await f.db.exec('set search_path=pg_catalog')
  const current = (await f.db.query(query)).rows[0].jsonb_build_object
  await f.db.query("select set_config('mip.selective_completion_rollback_expected_catalog',$1,false)", [JSON.stringify(current)])
  await f.db.exec(await readFile(SELECTIVE_COMPLETION_RESTORE, 'utf8'))
  assert.deepEqual((await f.db.query(query)).rows[0].jsonb_build_object, before)
  const restored = await f.backend.selectiveExecution('read', f.owner(input))
  assert.deepEqual(restored.execution, preserved.execution); assert.deepEqual(restored.declaration, preserved.declaration)
  assert.equal(await f.count('selective_fetch_permits'), 1); assert.equal(await f.count('article_captures'), 2)
})

test('source authorization expiry during a run refuses the first retained continuation without refetch', async t => {
  const f = await fixture(t), expires_at = new Date(Date.now() + 500).toISOString()
  const input = await f.request('https://example.org/rights-expiry', { expires_at })
  f.hooks.before = async (facet, action, command) => {
    if (facet === 'selectiveExecution' && command.continuation?.kind === 'candidate')
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expires_at) - Date.now() + 20)))
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '42501' })
  assert.equal(f.fetched(), 1); assert.equal(await f.count('evidence_candidates'), 1)
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '42501' })
  assert.equal(f.fetched(), 1)
})

test('source-rights and criteria successor CAS prevents older pending selection completion', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/policy-successor')
  let superseded = false, successor
  f.hooks.before = async (facet, action, command) => {
    if (!superseded && facet === 'selectiveExecution' && command.continuation?.kind === 'observe') {
      superseded = true
      const registered = (await f.db.query("select rules from evidence_pipeline.selective_criteria_versions where criteria_key='completion' and criteria_version='fixture-1'")).rows[0].rules
      await f.db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5)',
        ['completion', 'fixture-2', 'policy-fixture-2', 'synthetic:accepted-successor', { ...registered, low_value_domains: [] }])
      successor = await f.request(input.metadata.url, { criteria_version: 'fixture-2' })
      successor.previous_selection_id = input.selection_id
      successor.metadata.signals = []
      await f.raw.selectiveExecution('select', successor)
    }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), { code: '40001' })
  assert.equal(f.fetched(), 1); assert.equal(await f.count('selective_execution_receipts'), 0)
  assert.equal((await f.backend.selectiveExecution('read', f.owner(input))).selection.disposition, 'analyze_now')
  assert.equal((await f.backend.selectiveExecution('read', f.owner(successor))).selection.disposition, 'retain_deferred')
  assert.equal((await f.backend.selectiveExecution('read', f.owner(input))).selection.criteria_version, 'fixture-1')
  assert.equal((await f.backend.selectiveExecution('read', f.owner(successor))).selection.criteria_version, 'fixture-2')
})

test('tampered retained spans and foreign capture or observation scope refuse at the native SQL owner', async t => {
  const f = await fixture(t), input = await f.request('https://example.org/exact-span-binding')
  let tampered = false
  f.hooks.before = async (facet, action, command) => {
    if (!tampered && facet === 'selectiveExecution' && command.continuation?.kind === 'candidate') {
      tampered = true; command.continuation.input.excerpt = 'Unretained invented text.'
    }
  }
  await assert.rejects(runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl }), /span|excerpt/)
  assert.equal(await f.count('evidence_candidates'), 1)
  const attempt = f.calls.find(c => c.input.continuation?.kind === 'candidate').input
  await assert.rejects(f.backend.selectiveExecution('capture', { ...attempt, continuation: { ...attempt.continuation,
    input: { ...attempt.continuation.input, capture_id: randomUUID() } } }), { code: '22023' })
  assert.equal((await runSelectiveSource(f.backend, input, { fetchImpl: f.fetchImpl })).source_requests, 0)
  assert.equal(f.fetched(), 1)
})

test('registered contract catalogue preserves shared religion coverage and material sports/entertainment exceptions without scores', async t => {
  const f = await fixture(t)
  const criteria = (await f.db.query("select rules from evidence_pipeline.selective_criteria_versions where criteria_key='completion'")).rows[0].rules
  for (const [label, domains, signals, expected] of SELECTIVE_CONTRACT_CATALOG) {
    const metadata = { url: 'https://example.org/synthetic-catalogue',
      domain_declarations: domains.map(domain_ref => ({ domain_ref, classification_ref: `synthetic:catalogue:${label}` })), signals }
    const decision = async value => (await f.db.query('select evidence_pipeline.selective_metadata_decision($1::jsonb,$2::jsonb) r', [JSON.stringify(criteria), JSON.stringify(value)])).rows[0].r
    const actual = await decision(metadata)
    assert.equal(actual.disposition, expected, label)
    assert.deepEqual(await decision({ ...metadata, domain_declarations: [...metadata.domain_declarations].reverse(), signals: [...signals].reverse() }), actual)
    assert.deepEqual(Object.keys(actual).sort(), ['disposition', 'reason'])
  }
  assert.equal(SELECTIVE_CONTRACT_CATALOG.length, 32)
  assert.equal(await f.count('selective_fetch_permits'), 0)
  assert.equal(f.fetched(), 0)
})
