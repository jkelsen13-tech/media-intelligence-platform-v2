import test from 'node:test'
import assert from 'node:assert/strict'
import { retainedInputImpact, validPosition } from '../supabase/functions/investigation-input-impact/impact.mjs'
import { createInputImpactHandler } from '../supabase/functions/investigation-input-impact/handler.mjs'
import { createInvestigationApiHandler } from '../supabase/functions/investigation-api/handler.mjs'
import { selectedContextUsers } from '../src/lib/investigationEvidenceTrail.js'

const investigation = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const observation = '33333333-3333-4333-8333-333333333333'
const user = '44444444-4444-4444-8444-444444444444'
function fixture() {
  return { contract_version: 'investigation-workspace-1', publicly_eligible: false, investigation_id: investigation,
    access_role: 'viewer', version: { id: version, investigation_id: investigation, observation_id: observation,
      state: { hypotheses: [{ id: 'h', evidence: [{ position: '1' }], assessment_ids: ['a', 'b'] }], commitments: [] } },
    observation: { id: observation, snapshot: { inputs: [{ position: '1' }, { position: '2' }],
      selected_assessment_ids: ['a', 'b', 'a'],
      assessments: [{ id: 'a', context_positions: ['1'] }, { id: 'b', context_positions: ['1'] }] } } }
}
test('duplicate assessment identities remain unknown in every row order and agree with saved trail', () => {
  for (const positions of [[], ['1']]) for (const reverse of [false, true]) {
    const bundle = fixture()
    bundle.observation.snapshot.assessments.push({ id: 'a', context_positions: positions }, { id: 'a', context_positions: ['1'] })
    if (reverse) bundle.observation.snapshot.assessments.reverse()
    const before = structuredClone(bundle)
    const result = retainedInputImpact(bundle, '1')
    assert.deepEqual(result.context_assessment_ids, ['b'])
    assert.deepEqual(result.unknown_context_assessment_ids, ['a'])
    assert.deepEqual(result.context_assessment_ids, selectedContextUsers(bundle, '1').map(row => row.id))
    assert.deepEqual(result.hypotheses, [{ id: 'h', citation_indices: [0], assessment_ids: ['b'] }])
    assert.equal(result.assessment_effect, 'none')
    assert.equal(result.publicly_eligible, false)
    assert.deepEqual(bundle, before)
  }
})
test('ambiguous selected inputs fail closed while unrelated duplicates and exact context positions stay isolated', () => {
  const bundle = fixture()
  bundle.observation.snapshot.inputs.push({ position: '2' }, { position: '2' })
  assert.deepEqual(retainedInputImpact(bundle, '1').context_assessment_ids, ['a', 'b'])
  assert.throws(() => retainedInputImpact(bundle, '2'), /ambiguous_input/)
  assert.throws(() => retainedInputImpact(bundle, '3'), /input_unavailable/)
  bundle.observation.snapshot.assessments[0].context_positions = [1, '01', '1\n']
  assert.deepEqual(retainedInputImpact(bundle, '1').context_assessment_ids, ['b'])
  for (const value of ['1\n', '1\r', '1\r\n', '1\u2028', '1\u2029', '01', '0', '9223372036854775808']) {
    assert.equal(validPosition(value), false)
    assert.throws(() => retainedInputImpact(bundle, value), /invalid_position/)
  }
  assert.equal(validPosition('9223372036854775807'), true)
})
test('standalone and composed APIs suppress ambiguous input details and reject malformed positions before RPC', async () => {
  for (const composed of [false, true]) {
    const bundle = fixture()
    bundle.observation.snapshot.inputs.push({ position: '1', private_diagnostic: 'must never leak' })
    let reads = 0
    const rpc = async action => { assert.equal(action, 'read'); reads++; return { data: bundle } }
    const options = { authenticate: async () => ({ id: user }), rpc, workspaceRpc: rpc,
      checksRpc: async () => assert.fail('unexpected checks'), reviewsRpc: async () => assert.fail('unexpected review') }
    const handler = composed ? createInvestigationApiHandler(options) : createInputImpactHandler(options)
    const request = position => new Request('https://fixture.test/functions/v1/investigation-api/input-impact', {
      method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', input: { investigation_id: investigation, version_id: version, position } }) })
    const invalid = await handler(request('1\n'))
    assert.equal(invalid.status, 400); assert.equal(reads, 0)
    const ambiguous = await handler(request('1'))
    assert.equal(ambiguous.status, 503)
    assert.deepEqual(await ambiguous.json(), { error: { code: 'service_unavailable' } })
    assert.equal(ambiguous.headers.get('cache-control'), 'private, no-store')
    assert.equal(reads, 1)
  }
})
