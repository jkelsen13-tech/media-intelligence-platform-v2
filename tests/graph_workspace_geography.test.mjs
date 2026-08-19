import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isMappableConfirmedLocation,
  recordedGeography,
  summarizeGeography,
} from '../src/lib/graphWorkspaceModel.js'

const nodes = [
  { id: 'node-a', label: 'Louisville action', metadata: {} },
  { id: 'node-b', label: 'Pending candidate', metadata: {} },
  { id: 'node-c', label: 'No recorded place', metadata: {} },
]

const mentions = [
  {
    id: 'mention-a',
    node_id: 'node-a',
    mention_text: 'Louisville',
    text_field: 'headline',
    location_role: 'event',
    literal_status: 'literal',
    resolution_method: 'source_record',
    review_state: 'confirmed',
    remaining_uncertainty: 'City-level representative only.',
    place: {
      canonical_name: 'Louisville, Kentucky, United States',
      precision: 'city',
      latitude: '38.254238',
      longitude: '-85.759407',
    },
  },
  {
    id: 'mention-b',
    node_id: 'node-b',
    mention_text: 'Possible place',
    text_field: 'body',
    location_role: 'context',
    literal_status: 'ambiguous',
    resolution_method: 'automated_candidate',
    review_state: 'review_pending',
    place: {
      canonical_name: 'Candidate locality',
      precision: 'city',
      latitude: '40.0',
      longitude: '-75.0',
    },
  },
  {
    id: 'mention-outside-focus',
    node_id: 'node-outside-focus',
    mention_text: 'Outside',
    literal_status: 'literal',
    resolution_method: 'source_record',
    review_state: 'confirmed',
    place: {
      canonical_name: 'Outside focus',
      precision: 'city',
      latitude: '1',
      longitude: '1',
    },
  },
]

test('geography lens scopes recorded locations to graph nodes and preserves source states', () => {
  const rows = recordedGeography(nodes, mentions)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.key).sort(), ['node-a', 'node-b'])
  assert.equal(rows.find((row) => row.key === 'node-a').precision, 'city')
  assert.equal(rows.find((row) => row.key === 'node-a').latitude, 38.254238)
})

test('only literal, confirmed source or human-verified rows with coordinates are mappable', () => {
  const rows = recordedGeography(nodes, mentions)
  const summary = summarizeGeography(nodes, rows)
  assert.equal(summary.confirmed.length, 1)
  assert.equal(summary.confirmedMappable.length, 1)
  assert.equal(summary.automatedCandidates.length, 1)
  assert.equal(summary.unlocatedNodeCount, 1)
  assert.equal(isMappableConfirmedLocation(summary.confirmedMappable[0]), true)
  assert.equal(isMappableConfirmedLocation(summary.automatedCandidates[0]), false)
})

test('legacy textual metadata is disclosed as list-only and never treated as a map point', () => {
  const legacyRows = recordedGeography([{ id: 'legacy', label: 'Legacy', metadata: { location: 'Named in metadata' } }])
  const summary = summarizeGeography([{ id: 'legacy', label: 'Legacy' }], legacyRows)
  assert.equal(legacyRows.length, 1)
  assert.equal(legacyRows[0].reviewState, 'recorded_legacy')
  assert.equal(summary.confirmedMappable.length, 0)
  assert.equal(isMappableConfirmedLocation(legacyRows[0]), false)
})
