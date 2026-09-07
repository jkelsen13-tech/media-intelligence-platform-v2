import test from 'node:test'
import assert from 'node:assert/strict'
import { retainedTextAvailability } from '../src/lib/investigationTextAvailability.js'
import { FIXTURE_BUNDLES } from '../src/lib/investigationWorkspaceFixtures.js'

function fixture(payloads) {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  bundle.observation.snapshot.inputs = payloads.map((payload, i) => ({ position: String(BigInt('9007199254740993') + BigInt(i)),
    capture: { id: `fixture-${i}`, payload }, record_version: null }))
  return bundle
}

test('text availability partitions retained fields without treating a partial body as full text or metadata as evidence text', () => {
  const bundle = fixture([{ body_text: 'Partial 💡', summary: 'Also retained' }, { body_text: ' \n', summary: 'Summary' },
    { title: 'Title' }, { title: ' ', label: 'Label', summary: 7 }, { title: ' \t', url: 'https://example.org', source_status: 'corrected', outlet: 'An outlet' }, null])
  const before = structuredClone(bundle), result = retainedTextAvailability(bundle)
  assert.equal(result.available, true); assert.equal(result.total, 6)
  assert.deepEqual(result.groups.map(g => [g.kind, g.rows.length]), [['body', 1], ['summary', 1], ['title', 2], ['missing', 2]])
  assert.equal(result.groups[0].rows[0].position, '9007199254740993')
  assert.equal(result.groups[2].rows[1].displayTitle, 'Label')
  assert.equal(result.groups[3].rows[0].displayTitle, 'No title or label retained')
  assert.deepEqual(bundle, before)
})

test('ambiguous identities are excluded and an unavailable snapshot stays distinct from an empty inventory', () => {
  const bundle = fixture([{ summary: 'First' }, { body_text: 'Second' }, {}])
  bundle.observation.snapshot.inputs[1].position = bundle.observation.snapshot.inputs[0].position
  const result = retainedTextAvailability(bundle)
  assert.equal(result.excluded, 2); assert.equal(result.total, 1); assert.equal(result.groups[3].rows.length, 1)
  assert.equal(retainedTextAvailability(fixture([])).available, true)
  bundle.version.observation_id = 'different-observation'
  assert.equal(retainedTextAvailability(bundle).available, false)
  assert.equal(retainedTextAvailability(null).available, false)
})

test('later text and record versions never enter a historical inventory or imply source independence', () => {
  const before = fixture([{ summary: 'Original' }]), after = structuredClone(before)
  after.version.id = 'later-version'
  after.observation.snapshot.inputs.push({ position: '9007199254740994', capture: null, record_version: { id: 'later-record', payload: { body_text: 'Later body' } } })
  const oldInventory = retainedTextAvailability(before), next = retainedTextAvailability(after)
  assert.equal(oldInventory.groups[0].rows.length, 0); assert.equal(next.groups[0].rows.length, 1)
  assert.equal(next.total, 2); assert.equal(next.groups[0].rows[0].kind, 'record_version')
  assert.equal(oldInventory.groups[1].rows[0].input.capture.payload.summary, 'Original')
})
