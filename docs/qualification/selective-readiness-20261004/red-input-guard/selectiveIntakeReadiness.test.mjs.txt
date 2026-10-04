import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareSelectiveReadinessPlan, runSelectiveReadinessFixture } from '../scripts/qualification/selective-readiness/offlinePlan.mjs'
import { createSelectiveReadinessNativeFixture } from '../scripts/qualification/selective-readiness/nativeFixture.mjs'

const run = (fixture, plan, options = {}) => runSelectiveReadinessFixture(plan, { enabled: true, plan_sha256: plan.plan_sha256,
  backend: fixture.backend, fetchImpl: fixture.fetchImpl, ...options })

test('default OFF performs no plan, backend or source work', async () => {
  const blocked = () => assert.fail('disabled fixture used transport')
  for (const enabled of [undefined, false, 'true', 1]) {
    const result = await runSelectiveReadinessFixture(null, { enabled, backend: { selectiveExecution: blocked }, fetchImpl: blocked })
    assert.equal(result.state, 'disabled'); assert.equal(result.source_requests, 0); assert.equal(result.live_collection_enabled, false)
  }
})

test('exact offline native bindings require digest opt-in and injected transport before writes', async t => {
  const f = await createSelectiveReadinessNativeFixture(t), plan = await f.plan('https://example.org/readiness-bindings')
  const preparedCalls = f.calls.length
  assert.equal(plan.evidence_kind, 'offlineRPCmock'); assert.equal(plan.live_collection_enabled, false)
  assert.ok(Object.isFrozen(plan.bindings.request.metadata.domain_declarations))
  assert.equal(await f.count('selective_fetch_permits'), 0); assert.equal(await f.count('selective_discovery_receipts'), 0)
  await assert.rejects(run(f, plan, { plan_sha256: '0'.repeat(64) }), { code: 'invalid_readiness_plan' })
  await assert.rejects(run(f, plan, { fetchImpl: undefined }), { code: 'invalid_readiness_plan' })
  for (const mutate of [
    p => { p.bindings.criteria.rules.low_value_domains = [] },
    p => { p.bindings.request.metadata.signals = [] },
    p => { p.bindings.request.metadata.domain_declarations[0].classification_ref = 'changed:classification' },
    p => { p.bindings.authorization.rights_ref = p.bindings.preflight.rights_ref = 'changed:rights' },
    p => { p.bindings.request.version_id = '10000000-0000-5000-a000-000000000000' },
    p => { p.bindings.request.selection_id = '20000000-0000-5000-a000-000000000000' },
  ]) {
    const changed = structuredClone(plan); mutate(changed)
    await assert.rejects(run(f, changed), { code: 'invalid_readiness_plan' })
  }
  for (const predicate of ['exact_assigned_scope', 'assigned_reviewer', 'native_head_matches', 'operation_rights_active', 'zero_incremental_cost', 'request_quota_available', 'exact_endpoint_matches']) {
    const changed = structuredClone(plan.bindings); changed.preflight[predicate] = false
    assert.throws(() => prepareSelectiveReadinessPlan(changed), { code: 'invalid_readiness_plan' })
  }
  for (const mutate of [
    p => { p.authorization.enabled = false }, p => { p.authorization.analyze_allowed = false },
    p => { p.criteria.acceptance_ref = p.preflight.acceptance_ref = null },
    p => { p.authorization.rights_ref = p.preflight.rights_ref = null },
    p => { p.authorization.incremental_cost_usd = 1 },
    p => { p.preflight.source_url = 'https://example.org/substitution' },
    p => { p.preflight.proposed_disposition.disposition = 'publish' },
    p => { p.preflight.publicly_eligible = true },
  ]) {
    const changed = structuredClone(plan.bindings); mutate(changed)
    assert.throws(() => prepareSelectiveReadinessPlan(changed), { code: 'invalid_readiness_plan' })
  }
  await assert.rejects(run(f, plan, { now: () => Date.parse(plan.bindings.authorization.expires_at) }), { code: 'invalid_readiness_plan' })
  assert.equal(f.calls.length, preparedCalls); assert.equal(f.fetched(), 0)
  assert.equal(await f.count('selective_fetch_permits'), 0)
})

test('offline digest refuses non-JSON objects and sparse arrays instead of dropping their contents', async t => {
  const f = await createSelectiveReadinessNativeFixture(t), plan = await f.plan('https://example.org/readiness-json-only')
  for (const unsupported of [new Date('2026-10-04T00:00:00Z'), new Map([['sports', true]]), Array(1)]) {
    const changed = structuredClone(plan.bindings)
    changed.criteria.rules.low_value_domains = unsupported
    assert.throws(() => prepareSelectiveReadinessPlan(changed), { code: 'invalid_readiness_plan' })
  }
  assert.equal(f.calls.length, 0); assert.equal(f.fetched(), 0)
})

test('native policy preserves shared religion scope and material sports exceptions with metadata-only defer/skip', async t => {
  const f = await createSelectiveReadinessNativeFixture(t)
  for (const [domains, signals, disposition] of [
    [['sports'], [], 'skip_for_now'], [['entertainment'], [], 'skip_for_now'],
    [['religion'], [], 'retain_deferred'], [['religion', 'economy'], [], 'retain_deferred'],
  ]) {
    const plan = await f.plan(`https://example.org/${domains.join('-')}`, domains, signals)
    assert.equal(plan.bindings.preflight.proposed_disposition.disposition, disposition)
    const result = await run(f, plan)
    assert.equal(result.result.selection.disposition, disposition); assert.equal(result.result.source_requests, 0)
  }
  assert.equal(f.fetched(), 0); assert.equal(await f.count('selective_fetch_permits'), 0)
  for (const [domains, signals] of [[['religious_institution', 'economy'], ['explicit_scope']], [['sports'], ['institutional_accountability']], [['entertainment'], ['public_safety']]]) {
    const plan = await f.plan(`https://example.org/material-${domains.join('-')}`, domains, signals)
    assert.equal(plan.bindings.preflight.proposed_disposition.disposition, 'analyze_now')
    const result = await run(f, plan)
    assert.equal(result.result.source_requests, 1); assert.equal(result.result.publicly_eligible, false)
    const retained = await f.backend.selectiveExecution('read', f.owner(plan))
    assert.deepEqual(retained.declaration.result.domain_declarations.map(d => d.domain_ref), [...domains].sort())
    assert.equal(retained.criteria.criteria_version, plan.bindings.criteria.criteria_version)
    assert.equal(retained.selection.authorization_id, plan.bindings.authorization.authorization_id)
    assert.equal(retained.selection.version_id, plan.bindings.request.version_id)
    assert.equal(retained.progress.capture.payload.url, plan.bindings.authorization.source_url)
    assert.equal(retained.progress.capture.content_hash, retained.declaration.result.content_hash)
  }
  assert.equal(f.fetched(), 3)
})

test('a stale offline preview does not bypass native revocation or discovery/workspace CAS', async t => {
  const f = await createSelectiveReadinessNativeFixture(t), plan = await f.plan('https://example.org/readiness-revoked')
  await f.db.query('insert into evidence_pipeline.selective_authorization_revocations(authorization_id,revocation_ref) values($1,$2)',
    [plan.bindings.request.authorization_id, 'synthetic:revocation-after-preview'])
  await assert.rejects(run(f, plan), { code: '42501' })
  assert.equal(f.fetched(), 0); assert.equal(await f.count('selective_fetch_permits'), 0)
  const headPlan = await f.plan('https://example.org/readiness-old-head')
  const otherPlan = await f.plan('https://example.org/readiness-head-moves')
  await run(f, otherPlan)
  await assert.rejects(run(f, headPlan), { code: '40001' })
  assert.equal(f.fetched(), 1)
})

test('lost committed capture resumes retained owners through explicit fixture retry without another fetch', async t => {
  const f = await createSelectiveReadinessNativeFixture(t), plan = await f.plan('https://example.org/readiness-lost-capture')
  let lost = false
  f.hooks.after = async (facet, action, input) => {
    if (!lost && facet === 'selectiveExecution' && action === 'capture' && input.article) { lost = true; throw Object.assign(Error('synthetic lost committed response'), { code: 'network_error' }) }
  }
  await assert.rejects(run(f, plan), { code: 'network_error' })
  assert.equal(await f.count('selective_execution_receipts'), 0); assert.equal(f.fetched(), 1)
  assert.equal((await runSelectiveReadinessFixture(plan)).state, 'disabled')
  assert.equal(f.fetched(), 1)
  const resumed = await run(f, plan)
  assert.equal(resumed.result.source_requests, 0); assert.equal(f.fetched(), 1)
  assert.equal(await f.count('selective_fetch_permits'), 1); assert.equal(await f.count('selective_execution_receipts'), 1)
})

test('consumed failed acquisition stays held and reconsideration never uses source HTTP', async t => {
  const f = await createSelectiveReadinessNativeFixture(t), failed = await f.plan('https://example.org/readiness-failed-fetch')
  let attempted = 0
  await assert.rejects(run(f, failed, { fetchImpl: async () => { attempted++; throw Object.assign(Error('synthetic fetch failure'), { code: 'network_error' }) } }), { code: 'network_error' })
  await assert.rejects(run(f, failed, { fetchImpl: () => assert.fail('consumed source permit refetched') }), { code: '40001' })
  assert.equal(attempted, 1)
  const plan = await f.plan('https://example.org/readiness-reconsider')
  await run(f, plan)
  await f.add(plan.bindings.request.metadata.url, 'A synthetic correction changes the retained native dependency.')
  const result = await run(f, plan, { operation: 'reconsider', fetchImpl: () => assert.fail('reconsideration fetched source') })
  assert.equal(result.result.state, 'reconsidered'); assert.equal(result.result.source_requests, 0)
  assert.equal(f.fetched(), 1); assert.equal(await f.count('selective_execution_receipts'), 2)
})

test('partial reconsideration replays a known receipt or holds rebased history without automatic repair', async t => {
  for (const boundary of ['reconsider', 'rebased-version']) await t.test(boundary, async t => {
    const f = await createSelectiveReadinessNativeFixture(t), plan = await f.plan(`https://example.org/readiness-loss-${boundary}`)
    await run(f, plan)
    await f.add(plan.bindings.request.metadata.url, 'A synthetic correction changes a retained dependency.')
    let lost = false, versions = 0
    f.hooks.after = async (facet, action, input) => {
      if (input.continuation?.kind === 'version') versions++
      if (!lost && facet === 'selectiveExecution' && ((boundary === 'reconsider' && action === 'reconsider') ||
          (boundary === 'rebased-version' && input.continuation?.kind === 'version' && versions === 2))) {
        lost = true; throw Object.assign(Error('synthetic lost reconsideration response'), { code: 'network_error' })
      }
    }
    await assert.rejects(run(f, plan, { operation: 'reconsider' }), { code: 'network_error' })
    if (boundary === 'reconsider') {
      assert.equal((await run(f, plan, { operation: 'reconsider' })).result.state, 'reconsidered')
      assert.equal(await f.count('selective_execution_receipts'), 2)
    } else {
      const tables = ['assessments', 'investigation_observations', 'investigation_versions', 'investigation_selective_intake_receipts', 'selective_execution_receipts']
      const before = await Promise.all(tables.map(f.count))
      await assert.rejects(run(f, plan, { operation: 'reconsider' }), /native successor observation required/)
      assert.deepEqual(await Promise.all(tables.map(f.count)), before)
      assert.equal(await f.count('selective_execution_receipts'), 1)
    }
    assert.equal(f.fetched(), 1); assert.equal(await f.count('selective_fetch_permits'), 1)
  })
})
