import test from 'node:test'
import assert from 'node:assert/strict'
import { retainedInputIndex, searchRetainedInputs, selectedRetainedInput } from '../src/lib/investigationRetainedInputs.js'
import { FIXTURE_BUNDLES } from '../src/lib/investigationWorkspaceFixtures.js'

test('saved-input search includes ungrouped captures and record versions with exact bigint positions', () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable), original = structuredClone(bundle), index = retainedInputIndex(bundle)
  assert.equal(index.rows.length, bundle.observation.snapshot.inputs.length)
  const query = searchRetainedInputs(index, 'corrected fixture', 'record_version')
  assert.equal(query.rows.length, 1); assert.equal(query.rows[0].position, '5'); assert.deepEqual(query.rows[0].matchedFields, ['label'])
  assert.equal(searchRetainedInputs(index, 'withdrawn', 'record_version').rows[0].matchedFields.includes('source_status'), true)
  assert.equal(searchRetainedInputs(index, '💡 a REPORT').rows[0].position, '9007199254740993')
  assert.equal(index.rows.at(-1).position, '9007199254740993')
  assert.equal(searchRetainedInputs(index, 'not in the saved corpus').rows.length, 0)
  assert.deepEqual(bundle, original)
})

test('search preserves original Unicode and distinguishes missing text, invalid filters and ambiguous input identities', () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  const inputs = bundle.observation.snapshot.inputs
  inputs[0].capture.payload.summary = 'Cafe\u0301 — 🧬 repeated phrase'
  assert.equal(searchRetainedInputs(retainedInputIndex(bundle), 'CAFÉ').rows[0].input.capture.payload.summary, 'Cafe\u0301 — 🧬 repeated phrase')
  inputs.push({ position: '70', capture: { id: 'empty', payload: {} }, record_version: null })
  inputs.push({ ...structuredClone(inputs[0]), position: '2' }) // Both entries at 2 must be excluded.
  inputs.push({ ...structuredClone(inputs[0]), position: 9007199254740992 })
  inputs.push({ ...structuredClone(inputs[0]), position: '71', record_version: { id: null, payload: {} } })
  const index = retainedInputIndex(bundle)
  assert.equal(index.excluded, 4); assert.equal(index.rows.some(r => r.position === '2'), false)
  assert.deepEqual(index.rows.find(r => r.position === '70').fields, [])
  assert.equal(searchRetainedInputs(index, 'x'.repeat(201)).valid, false)
  assert.equal(searchRetainedInputs(index, '', 'unknown').valid, false)
})

test('input selection is bound to the saved investigation, version and observation with no current-record fallback', () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  const selection = { investigationId: bundle.investigation_id, versionId: bundle.version.id, observationId: bundle.observation.id, position: '5' }
  assert.equal(selectedRetainedInput(bundle, selection).input.record_version.payload.label, 'Corrected fixture node.')
  for (const key of ['investigationId','versionId','observationId','position']) assert.equal(selectedRetainedInput(bundle, { ...selection, [key]: 'other' }), null)
  const historical = structuredClone(bundle); historical.version.id = 'older'; historical.observation.snapshot.inputs = []
  assert.equal(searchRetainedInputs(retainedInputIndex(historical), 'Corrected fixture').rows.length, 0)
  for (const mutate of [b => { b.version.observation_id = 'other' }, b => { b.publicly_eligible = true }, b => { b.version.investigation_id = 'other' }]) {
    const bad = structuredClone(bundle); mutate(bad); assert.equal(retainedInputIndex(bad).available, false)
  }
})
