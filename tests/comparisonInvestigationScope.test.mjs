import test from 'node:test'
import assert from 'node:assert/strict'
import { comparisonInvestigationScope as scope } from '../src/lib/comparisonInvestigationScope.js'

const events = [
  { id: 'event-a', title: 'Same title', arcLinks: [{ arcId: 'arc-a' }] },
  { id: 'event-b', title: 'Same title', arcLinks: [{ arcId: 'arc-b' }] },
]
const context = (type, id, parent) => ({ canonical_subject_type: type, canonical_subject_id: id, parent_event_id: parent })
test('comparison scope uses exact event identities and never title similarity', () => {
  assert.deepEqual(scope(events, context('event', 'event-a'), 'event-b').events, [events[0]])
  assert.deepEqual(scope(events, context('event', 'Same title')).events, [])
  assert.deepEqual(scope(events, context('event', 'missing'), 'event-a').events, [])
})
test('arc and subobject scopes require recorded joins; unknown subjects never inherit the corpus', () => {
  assert.deepEqual(scope(events, context('arc', 'arc-b')).events, [events[1]])
  assert.deepEqual(scope(events, context('claim', 'claim-a', 'event-a')).events, [events[0]])
  for (const type of ['claim', 'entity', 'source', 'article', 'place', 'unknown']) assert.deepEqual(scope(events, context(type, 'event-a')).events, [])
  assert.deepEqual(scope(events, context('arc', 'missing')).events, [])
})
test('no subject permits labeled browsing; explicit missing focus stays scoped and empty', () => {
  assert.deepEqual(scope(events).events, events)
  assert.equal(scope(events).scoped, false)
  assert.deepEqual(scope(events, null, 'event-b').events, [events[1]])
  assert.deepEqual(scope(events, null, 'missing').events, [])
  assert.equal(scope(events, null, 'missing').scoped, true)
})
