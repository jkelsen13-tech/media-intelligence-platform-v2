import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceBackendFixture, evidenceTables, evidenceNode } from './evidenceBackendFixture.mjs'

test('all evidence capabilities use the bound browser client and retain node, policy, and source identities', async () => {
  const f = evidenceBackendFixture({ tables: evidenceTables() })
  assert.ok(Object.isFrozen(f.backend)); assert.equal(f.calls.length, 0)
  assert.equal((await f.backend.loadSources('node-one'))[0].headline, 'Node source headline')
  assert.deepEqual((await f.backend.loadNodeArticles('node-one')).map(a => a.id), ['article-one'])
  assert.equal(await f.backend.loadNodeCategory(evidenceNode), 'public_health')
  const derived = await f.backend.loadActorDerivation(['node-one', 'node-one'])
  assert.equal(derived.category, 'public_health'); assert.equal(derived.sources[0].id, 'source-one')
  const policy = await f.backend.loadPolicyDetail('policy-one')
  assert.equal(policy.policy.jurisdiction, 'Recorded jurisdiction'); assert.equal(policy.actors[0].role, 'sponsor'); assert.equal(policy.topics[0].topic_id, 'topic-one')
  assert.equal((await f.backend.loadSkyVerificationForNode('node-one')).id, 'sky-one')
  const view = await f.backend.loadExplanationReadView({ assertionId: 'edge:edge-one', limit: 1 })
  assert.equal(view.eligible[0].supporting_passage, 'Recorded grounding passage')
  const sources = await f.backend.loadEdgeSources(view.eligible[0].source_ids)
  assert.deepEqual(sources.map(s => [s.id, s.kind]), [['article-one', 'article'], ['document-one', 'document'], ['missing-source', 'unresolved']])
  const before = f.calls.length; f.setToken('evidence-session-two')
  await f.backend.loadSources('node-one'); await f.backend.loadExplanationReadView({ assertionId: 'edge:edge-one' })
  assert.ok(f.calls.slice(before).every(c => c.request.headers.get('authorization') === 'Bearer evidence-session-two'))
  assert.ok(f.calls.every(c => c.request.method === 'GET' && c.request.headers.get('apikey') === 'fixture-browser-key'))
})

test('evidence feature gates fail closed before requesting protected or location data', async () => {
  for (const value of [false, null, 'true']) {
    const tables = evidenceTables(); tables.pipeline_config = [{ key: 'provenance_ui', value }, { key: 'location_corroboration', value }]
    const f = evidenceBackendFixture({ tables })
    assert.deepEqual(await f.backend.loadExplanationReadView(), { enabled: false, eligible: [], excluded: [] })
    assert.equal(await f.backend.loadSkyVerificationForNode('node-one'), null)
    assert.ok(f.calls.every(c => c.table === 'pipeline_config'))
  }
  const f = evidenceBackendFixture({ tables: evidenceTables(), errors: { explanations: { code: '42501', message: 'denied' } } })
  assert.deepEqual(await f.backend.loadExplanationReadView(), { enabled: false, eligible: [], excluded: [] })
})

test('only current explanations for the selected assertion are returned and review exclusions remain explicit', async () => {
  const tables = evidenceTables(), row = tables.explanations[0]
  tables.explanations = [{ ...row, id: 'old', is_current: false }, { ...row, assertion_id: 'edge:other' }, { ...row, review_status: 'awaiting_review' }]
  const f = evidenceBackendFixture({ tables })
  const view = await f.backend.loadExplanationReadView({ assertionId: 'edge:edge-one', assertionType: 'relationship', supabaseClient: { from() { throw Error('override escaped') } } })
  assert.equal(view.eligible.length, 0); assert.equal(view.excluded.length, 1)
  assert.equal(view.excluded[0].failureState, 'under_review')
  const query = f.calls.find(c => c.table === 'explanations').params
  assert.equal(query.get('assertion_id'), 'eq.edge:edge-one'); assert.equal(query.get('is_current'), 'eq.true')
})

test('unavailable evidence preserves each existing optional or strict error contract', async () => {
  const denied = { code: '42501', message: 'unavailable' }
  const f = evidenceBackendFixture({ tables: evidenceTables(), errors: { sources: denied, policies: denied, citations: denied, policy_documents: denied } })
  await assert.rejects(f.backend.loadSources('node-one'), e => e.message === 'unavailable')
  await assert.rejects(f.backend.loadNodeArticles('node-one'), e => e.message === 'unavailable')
  await assert.rejects(f.backend.loadEdgeSources(['document-one']), e => e.message === 'unavailable')
  assert.deepEqual(await f.backend.loadPolicyDetail('policy-one'), { policy: null, actors: [], topics: [] })
  assert.equal(await f.backend.loadSkyVerificationForNode('node-one'), null)
  assert.deepEqual((await evidenceBackendFixture().backend.loadSources('node-one')), [])
})
