import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_RELATIONSHIP_LINES, RELATIONSHIP_TEMPORAL_DISCLOSURE,
  projectRelationshipDisplay, relationshipTouchesSelection,
} from '../src/lib/worldViewRelationshipLayout.js'

function marker(subject, id, x, y, extra = {}) {
  return Object.freeze({
    id, row: Object.freeze({ subject_graph_node_id: subject, revision_id: 'revision-' + id }),
    position: Object.freeze([10, 20]), positionIndex: 0, x, y, visible: true,
    ...extra,
  })
}
const a = marker('a', 'a-marker', 10, 20)
const b = marker('b', 'b-marker', 60, 40)
const edge = (id = 'edge', extra = {}) => Object.freeze({
  id, source: 'a', target: 'b', type: 'sequence', label: 'sequence: after',
  claimed_by: 'source_document', signal_source: 'retained source',
  metadata: Object.freeze({ evidence: Object.freeze(['source-id']), recorded_at: '2020-01-01T00:00:00Z' }),
  ...extra,
})

test('direction, original edge/marker identity, type and provenance survive unchanged', () => {
  const original = edge()
  const result = projectRelationshipDisplay([original], [a, b], { width: 100, height: 100 })
  assert.equal(result.lines.length, 1)
  const line = result.lines[0]
  assert.equal(line.edge, original)
  assert.equal(line.sourceMarker, a)
  assert.equal(line.targetMarker, b)
  assert.equal(line.type, 'sequence')
  assert.equal(line.label, 'sequence: after')
  assert.equal(line.edge.metadata, original.metadata)
  assert.equal(line.x1, a.x)
  assert.equal(line.x2, b.x)
  assert.equal(result.dispositions[0].edge, original)
  const reversed = edge('reverse', { source: 'b', target: 'a' })
  const reverseLine = projectRelationshipDisplay([reversed], [a, b]).lines[0]
  assert.equal(reverseLine.sourceMarker, b)
  assert.equal(reverseLine.targetMarker, a)
  assert.equal(reverseLine.type, 'sequence')
})

test('close points never invent graph relationships or reinterpret supplied edge time', () => {
  const close = marker('b', 'close', 10.001, 20.001)
  assert.equal(projectRelationshipDisplay([], [a, close]).lines.length, 0)
  const original = edge('time', { valid_from_utc: '2020-01-01T00:00:00Z', valid_to_utc: '2020-01-02T00:00:00Z' })
  const result = projectRelationshipDisplay([original], [a, close], { atMs: Date.parse('2030-01-01T00:00:00Z') })
  assert.equal(result.lines[0].edge, original)
  assert.equal(result.lines[0].edge.valid_from_utc, original.valid_from_utc)
  assert.equal(result.temporalValidity, 'not_supplied_by_graph_reader')
  assert.match(RELATIONSHIP_TEMPORAL_DISCLOSURE, /does not supply relationship valid-time bounds/)
})

test('selected documented edges take the budget first; all original dispositions remain', () => {
  const c = marker('c', 'c-marker', 80, 80)
  const first = edge('a-first')
  const selected = edge('z-selected', { source: 'c' })
  const result = projectRelationshipDisplay([first, selected], [a, b, c], { selectedKeys: new Set(['c']), maxLines: 1 })
  assert.equal(result.lines[0].edge, selected)
  assert.equal(result.lines[0].selected, true)
  assert.equal(result.counts.budget, 1)
  assert.equal(result.dispositions[0].edge, first)
  assert.equal(result.dispositions[0].reason, 'budget')
  assert.equal(result.dispositions[1].edge, selected)
  assert.equal(relationshipTouchesSelection(selected, ['c']), true)
  assert.equal(relationshipTouchesSelection(first, ['c']), false)
})

test('sparse and dense scenes retain only existing edges up to the fixed limit', () => {
  const records = Array.from({ length: 300 }, (_, i) => edge(String(i).padStart(3, '0')))
  const result = projectRelationshipDisplay(records, [a, b], { maxLines: 100000 })
  assert.equal(result.displayed, MAX_RELATIONSHIP_LINES)
  assert.equal(result.total, records.length)
  assert.equal(result.hidden, records.length - MAX_RELATIONSHIP_LINES)
  assert.equal(result.counts.budget, result.hidden)
  assert.equal(result.dispositions.length, records.length)
  for (const line of result.lines) assert.equal(line.edge, records[line.edgeIndex])
  assert.equal(projectRelationshipDisplay(records.slice(0, 2), [a, b]).displayed, 2)
})

test('multipoint endpoint arbitration is deterministic and never creates Cartesian lines', () => {
  const aSecond = marker('a', 'z-later', 30, 25, { positionIndex: 1 })
  const bSecond = marker('b', 'z-target', 75, 80, { positionIndex: 1 })
  const original = edge()
  const members = [aSecond, bSecond, b, a]
  const result = projectRelationshipDisplay([original], members)
  const shuffled = projectRelationshipDisplay([original], [...members].reverse())
  assert.equal(result.lines.length, 1)
  assert.equal(result.lines[0].sourceMarker, a)
  assert.equal(shuffled.lines[0].sourceMarker, a)
  assert.equal(shuffled.lines[0].targetMarker, b)
  assert.deepEqual(result.lines[0].endpointCounts, { source: 2, target: 2, visibleSource: 2, visibleTarget: 2 })
  assert.equal(result.multipleEndpointEdges, 1)
})

test('far-side or offscreen endpoints suppress lines without losing the authorized edge', () => {
  for (const hidden of [
    { ...b, visible: false }, { ...b, farSide: true }, { ...b, x: -1 },
    { ...b, y: 101 }, { ...b, x: NaN }, { ...b, y: Infinity },
  ]) {
    const original = edge()
    const result = projectRelationshipDisplay([original], [a, hidden], { width: 100, height: 100 })
    assert.equal(result.displayed, 0)
    assert.equal(result.counts.hiddenEndpoints, 1)
    assert.equal(result.dispositions[0].edge, original)
    assert.equal(result.dispositions[0].endpointCounts.target, 1)
    assert.equal(result.dispositions[0].endpointCounts.visibleTarget, 0)
  }
  const visibleB = marker('b', 'zz-visible', 75, 40)
  const result = projectRelationshipDisplay([edge()], [a, { ...b, visible: false }, visibleB])
  assert.equal(result.lines[0].targetMarker, visibleB)
  assert.equal(result.lines[0].endpointCounts.target, 2)
})

test('joins require exact admitted subject identities, with only explicitly authorized aliases', () => {
  const wrong = marker('other', 'b', 60, 40, {
    label: 'b', row: Object.freeze({ subject_graph_node_id: 'other', mip_object_id: 'b', canonical_place_id: 'b' }),
  })
  const original = edge()
  const result = projectRelationshipDisplay([original], [a, wrong])
  assert.equal(result.counts.unmapped, 1)
  assert.equal(result.dispositions[0].edge, original)
  const alias = marker('uuid-b', 'marker-b', 60, 40, { nodeKeys: Object.freeze(['b']) })
  assert.equal(projectRelationshipDisplay([original], [a, alias]).displayed, 1)
  const noSubject = { ...alias, row: { mip_object_id: 'b' } }
  assert.equal(projectRelationshipDisplay([original], [a, noSubject]).displayed, 0)
})

test('stored hypotheses, coincident endpoints and malformed edges stay explicitly inspectable', () => {
  const hypothesis = edge('hypothesis', { claimed_by: 'MIP_inferred' })
  const invalid = edge('invalid', { target: null })
  const coincident = edge('coincident', { target: 'a' })
  const result = projectRelationshipDisplay([hypothesis, invalid, coincident], [a, b])
  assert.deepEqual(result.dispositions.map(d => d.reason), ['hypothesis', 'invalidEdge', 'coincidentEndpoints'])
  assert.equal(result.counts.hypothesis, 1)
  assert.equal(result.counts.invalidEdge, 1)
  assert.equal(result.counts.coincidentEndpoints, 1)
  assert.equal(result.hidden, 3)
  assert.equal(result.dispositions[0].edge, hypothesis)
})

test('negative, zero and fractional limits are bounded; distinct original parallel records survive', () => {
  const records = Object.freeze([edge('one'), edge('two', { type: 'causal' })])
  for (const maxLines of [-1, 0]) assert.equal(projectRelationshipDisplay(records, [a, b], { maxLines }).displayed, 0)
  assert.equal(projectRelationshipDisplay(records, [a, b], { maxLines: 1.9 }).displayed, 1)
  const result = projectRelationshipDisplay(records, [a, b])
  assert.equal(result.lines.length, 2)
  assert.equal(result.lines[0].edge, records[0])
  assert.equal(result.lines[1].edge, records[1])
  assert.equal(result.lines[1].type, 'causal')
})

test('layout never mutates frozen input edges, provenance, original rows or projected members', () => {
  const records = Object.freeze([edge()])
  const members = Object.freeze([a, b])
  const before = JSON.stringify({ records, members })
  projectRelationshipDisplay(records, members, { selectedKeys: Object.freeze(['b']), width: 100, height: 100 })
  assert.equal(JSON.stringify({ records, members }), before)
  assert.equal(records[0].metadata.evidence[0], 'source-id')
  assert.equal(members[0], a)
})

test('an explicitly unavailable viewport never draws relationship lines', () => {
  for (const dimensions of [{width: NaN}, {height: Infinity}, {width: 0}, {height: -1}]) {
    const result = projectRelationshipDisplay([edge()], [a, b], dimensions)
    assert.equal(result.displayed, 0)
    assert.equal(result.counts.hiddenEndpoints, 1)
  }
})
