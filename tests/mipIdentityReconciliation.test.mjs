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

test('isolated restore ledger preserves both recorded gap families', () => {
  const ledger = restoreIdentityLedger()
  assert.equal(ledger.preservedGaps.length, 1)
  assert.equal(ledger.conflicts.some((row) => row.conflict_kind === 'existing_import_mapping_skipped'), true)
  assert.equal(ledger.inserted.length, 0)
  assert.doesNotThrow(() => reconcileBatch([]))
})
