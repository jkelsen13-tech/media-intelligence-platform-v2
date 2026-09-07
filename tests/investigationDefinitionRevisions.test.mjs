import test from 'node:test'
import assert from 'node:assert/strict'
import { savedDefinitionRevisions, sameDefinitionValue } from '../src/lib/investigationDefinitionRevisions.js'
import { definitionFixture } from './definitionRevisionFixture.mjs'

test('deadline and stage revisions preserve named identities and exact old/new fields without an outcome ladder', () => {
  const { after, before } = definitionFixture(), baseline = structuredClone(before)
  const result = savedDefinitionRevisions(after, before)
  assert.equal(result.status, 'ready')
  const commitment = result.rows.find(r => r.group === 'commitments')
  assert.deepEqual(commitment.fields.find(f => f.key === 'deadline_text'), { key: 'deadline_text', before: 'By August 31, 2026.', after: 'By September 30, 2026.' })
  const implementation = commitment.stages.find(s => s.after?.kind === 'implementation')
  assert.deepEqual(implementation.fields.find(f => f.key === 'status'), { key: 'status', before: 'no_followup_found', after: 'observed' })
  const removed = commitment.stages.find(s => s.action === 'removed')
  assert.equal(removed.before.kind, 'prerequisite'); assert.equal(removed.after, undefined)
  assert.deepEqual(before, baseline)
  assert.equal(result.rows.find(r => r.group === 'hypotheses').fields.find(f => f.key === 'evidence').after, after.version.state.hypotheses[0].evidence)
})
test('comparison refuses reversed history, wrong investigation/observation/review baseline, and missing snapshots', () => {
  for (const mutate of [p => { p.before.investigation_id = 'other' }, p => { p.before.version.id = 'other' },
    p => { p.before.observation.id = 'other' }, p => { p.after.comparison.after_observation_id = 'other' },
    p => { p.after.review.version_id = 'other' }, p => { p.before.version.revision = 99 }, p => { p.before.publicly_eligible = true }]) {
    const pair = definitionFixture(); mutate(pair)
    assert.equal(savedDefinitionRevisions(pair.after, pair.before).status, 'identity_mismatch')
  }
  const { after, before } = definitionFixture()
  assert.equal(savedDefinitionRevisions(after, null).status, 'not_loaded')
  for (const mode of ['historical_before_review', 'not_reviewed']) {
    after.comparison.mode = mode
    assert.deepEqual(savedDefinitionRevisions(after, before), { status: 'not_comparable', rows: [] })
  }
})
test('candidate scope changes permit only server-declared definition rows, never an inferred evidence briefing', () => {
  const { after, before } = definitionFixture()
  after.comparison.mode = 'scope_changed'; after.comparison.evidence_changes = null
  after.comparison.definition_changes.question_changed = true
  after.version.state.question = 'A revised investigation question?'
  const result = savedDefinitionRevisions(after, before)
  assert.equal(result.scopeChanged, true)
  assert.equal(result.rows.find(r => r.group === 'question').fields[0].after, 'A revised investigation question?')
  assert.equal(result.evidence_changes, undefined)
  after.comparison.definition_changes.commitments.updated = []
  assert.equal(savedDefinitionRevisions(after, before).rows.some(r => r.group === 'commitments'), false)
})
test('JSONB key order does not become a field edit; array order, missing values and unchanged declarations remain distinct', () => {
  assert.equal(sameDefinitionValue({ a: 1, b: { x: 2, y: 3 } }, { b: { y: 3, x: 2 }, a: 1 }), true)
  assert.equal(sameDefinitionValue(['a','b'], ['b','a']), false)
  assert.equal(sameDefinitionValue(undefined, null), false)
  const { after, before } = definitionFixture()
  before.version.state.hypotheses = structuredClone(after.version.state.hypotheses)
  assert.equal(savedDefinitionRevisions(after, before).rows.find(r => r.group === 'hypotheses').status, 'no_field_difference')
  before.version.state.commitments = []
  assert.equal(savedDefinitionRevisions(after, before).rows.find(r => r.group === 'commitments').status, 'record_unavailable')
  const id = after.version.state.commitments[0].id
  after.comparison.definition_changes.commitments = { added: [id], removed: [], updated: [] }
  const added = savedDefinitionRevisions(after, before).rows.find(r => r.group === 'commitments')
  assert.equal(added.before, undefined); assert.equal(added.fields.find(f => f.key === 'deadline_text').before, undefined)
  assert.ok(added.stages.every(s => s.action === 'added'))
  before.version.state.commitments = after.version.state.commitments
  after.version.state.commitments = []
  after.comparison.definition_changes.commitments = { added: [], removed: [id], updated: [] }
  const removed = savedDefinitionRevisions(after, before).rows.find(r => r.group === 'commitments')
  assert.equal(removed.after, undefined); assert.equal(removed.fields.find(f => f.key === 'deadline_text').after, undefined)
  assert.ok(removed.stages.every(s => s.action === 'removed'))
})
