import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAPH_EVENT_FAMILY,
  SOURCE_COMPARISON_EVENT_FAMILY,
  IDENTITY_DECISIONS,
  reconcileIdentity,
  reconcileBatch,
} from '../scripts/mipIdentityReconciliation.mjs'
import { EXISTING_MAPPINGS, RECORDED_GAPS, restoreIdentityLedger } from '../scripts/mipConsolidationRestore.mjs'

test('existing mappings precede identity work and are not rewritten', () => {
  const result = reconcileIdentity({
    source: RECORDED_GAPS[1].source,
    target: RECORDED_GAPS[1].target,
    existingMappings: EXISTING_MAPPINGS,
  })
  assert.equal(result.decision, IDENTITY_DECISIONS.skip_existing_mapping)
  assert.equal(result.mapping.target_id, EXISTING_MAPPINGS[0].target_id)
  assert.equal(result.conflict.conflict_kind, 'existing_import_mapping_skipped')
})

test('recorded historical gaps stay unrestorable and do not invent versions', () => {
  const result = reconcileIdentity({ source: RECORDED_GAPS[0].source })
  assert.equal(result.decision, IDENTITY_DECISIONS.historical_gap)
  assert.equal(result.mapping, null)
  assert.equal(result.conflict.recovery_status, 'not_restorable_no_pre_import_snapshot')
})

test('equal titles do not establish identity', () => {
  const result = reconcileIdentity({
    source: {
      source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
      source_table: 'articles',
      source_id: 'aaaaaaa1-0000-4000-8000-000000000001',
      title: 'Eclipse times',
      url: 'https://example.org/a',
    },
    target: { id: 'bbbbbbb1-0000-4000-8000-000000000002', title: 'Eclipse times', url: 'https://example.org/b' },
  })
  assert.equal(result.decision, IDENTITY_DECISIONS.title_only)
  assert.equal(result.conflict.conflict_kind, 'title_collision_not_identity')
})

test('graph and source-comparison event IDs are not interchangeable', () => {
  const id = 'cccccccc-0000-4000-8000-000000000003'
  const result = reconcileIdentity({
    source: {
      source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
      source_table: 'events',
      source_id: id,
      object_family: SOURCE_COMPARISON_EVENT_FAMILY,
      title: 'Same string',
    },
    target: { id, object_family: GRAPH_EVENT_FAMILY, title: 'Same string' },
  })
  assert.equal(result.decision, IDENTITY_DECISIONS.family_mismatch)
  assert.equal(result.conflict.conflict_kind, 'event_family_not_interchangeable')
})

test('divergent content under one id and equal URLs with different ids are recorded, not merged', () => {
  const sameId = reconcileIdentity({
    source: {
      source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
      source_table: 'articles',
      source_id: 'dddddddd-0000-4000-8000-000000000004',
      title: 'Version A',
      url: 'https://example.org/v',
      body_text: 'A',
    },
    target: { id: 'dddddddd-0000-4000-8000-000000000004', title: 'Version B', url: 'https://example.org/v', body_text: 'B' },
  })
  assert.equal(sameId.conflict.conflict_kind, 'identical_id_divergent_content')
  const sameUrl = reconcileIdentity({
    source: {
      source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
      source_table: 'articles',
      source_id: 'eeeeeeee-0000-4000-8000-000000000005',
      title: 'One',
      url: 'https://example.org/shared',
    },
    target: { id: 'ffffffff-0000-4000-8000-000000000006', title: 'Two', url: 'https://example.org/shared' },
  })
  assert.equal(sameUrl.conflict.conflict_kind, 'equal_url_divergent_ids')
})

const EDGE_A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const NODE_A = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const NODE_B = 'cccccccc-0000-4000-8000-0000000000c1'
const NODE_C = 'dddddddd-0000-4000-8000-0000000000d1'
const NODE_D = 'eeeeeeee-0000-4000-8000-0000000000e1'

function edgeSource(overrides = {}) {
  return {
    source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
    source_table: 'edges',
    source_id: EDGE_A,
    source_node_id: NODE_A,
    target_node_id: NODE_B,
    relationship_type: 'caused',
    label: 'caused',
    ...overrides,
  }
}

test('identical relationships with the same record id map without a conflict', () => {
  const result = reconcileIdentity({
    source: edgeSource(),
    target: { id: EDGE_A, source_id: NODE_A, target_id: NODE_B, type: 'caused', label: 'caused' },
  })
  assert.equal(result.decision, IDENTITY_DECISIONS.mapped)
  assert.equal(result.conflict, null)
  assert.equal(result.mapping.source_id, EDGE_A)
})

test('changed source or target endpoints are recorded instead of treated as equivalent', () => {
  const sourceChanged = reconcileIdentity({
    source: edgeSource({ source_node_id: NODE_C }),
    target: { id: EDGE_A, source_id: NODE_A, target_id: NODE_B, type: 'caused', label: 'caused' },
  })
  assert.equal(sourceChanged.decision, IDENTITY_DECISIONS.conflict)
  assert.equal(sourceChanged.conflict.conflict_kind, 'incompatible_relationship_endpoints')
  assert.equal(sourceChanged.mapping, null)

  const targetChanged = reconcileIdentity({
    source: edgeSource({ target_node_id: NODE_D }),
    target: { id: EDGE_A, source_id: NODE_A, target_id: NODE_B, type: 'caused', label: 'caused' },
  })
  assert.equal(targetChanged.conflict.conflict_kind, 'incompatible_relationship_endpoints')
})

test('changed relationship type is recorded without a caller flag', () => {
  const result = reconcileIdentity({
    source: edgeSource({ relationship_type: 'supported' }),
    target: { id: EDGE_A, source_id: NODE_A, target_id: NODE_B, type: 'caused', label: 'caused' },
  })
  assert.equal(result.decision, IDENTITY_DECISIONS.conflict)
  assert.equal(result.conflict.conflict_kind, 'incompatible_relationship_endpoints')
  assert.deepEqual(result.conflict.details.incoming_endpoints.relationshipType, 'supported')
})

test('record identity is not treated as the source-node endpoint', () => {
  const result = reconcileIdentity({
    source: edgeSource({
      source_id: NODE_A,
      source_node_id: NODE_B,
      target_node_id: NODE_C,
    }),
    target: { id: NODE_A, source_id: NODE_A, target_id: NODE_C, type: 'caused', label: 'caused' },
  })
  assert.equal(result.conflict.conflict_kind, 'incompatible_relationship_endpoints')
  assert.equal(result.conflict.details.incoming_endpoints.sourceEndpoint, NODE_B)
  assert.equal(result.conflict.details.existing_endpoints.sourceEndpoint, NODE_A)
})

test('existing mappings with divergent relationship records are preserved and recorded', () => {
  const mapping = {
    source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
    source_table: 'edges',
    source_id: EDGE_A,
    target_id: EDGE_A,
  }
  const endpoints = reconcileIdentity({
    source: edgeSource({ source_node_id: NODE_C }),
    target: { id: EDGE_A, source_id: NODE_A, target_id: NODE_B, type: 'caused', label: 'caused' },
    existingMappings: [mapping],
  })
  assert.equal(endpoints.decision, IDENTITY_DECISIONS.skip_existing_mapping)
  assert.equal(endpoints.mapping.target_id, mapping.target_id)
  assert.equal(endpoints.conflict.conflict_kind, 'existing_import_mapping_relationship_divergent')

  const content = reconcileIdentity({
    source: edgeSource({ label: 'Version A', title: 'Version A' }),
    target: { id: EDGE_A, source_id: NODE_A, target_id: NODE_B, type: 'caused', label: 'Version B', title: 'Version B' },
    existingMappings: [mapping],
  })
  assert.equal(content.mapping.target_id, mapping.target_id)
  assert.equal(content.conflict.conflict_kind, 'existing_import_mapping_content_divergent')
})

test('graph and source-comparison identity stays partitioned even for matching UUID strings', () => {
  const shared = 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
  const result = reconcileIdentity({
    source: {
      source_project_ref: 'yhbwnrtlqbjtcrrlpbge',
      source_table: 'events',
      source_id: shared,
      object_family: SOURCE_COMPARISON_EVENT_FAMILY,
      title: '2024 Total Solar Eclipse, Cleveland, Ohio',
    },
    target: {
      id: shared,
      object_family: GRAPH_EVENT_FAMILY,
      title: '2024 Total Solar Eclipse, Cleveland, Ohio',
    },
  })
  assert.equal(result.decision, IDENTITY_DECISIONS.family_mismatch)
  assert.equal(result.mapping, null)
})

test('isolated restore ledger preserves both recorded gap families', () => {
  const ledger = restoreIdentityLedger()
  assert.equal(ledger.preservedGaps.length, 1)
  assert.equal(ledger.conflicts.some((row) => row.conflict_kind === 'existing_import_mapping_skipped'), true)
  assert.equal(ledger.inserted.length, 0)
  assert.doesNotThrow(() => reconcileBatch([]))
})
