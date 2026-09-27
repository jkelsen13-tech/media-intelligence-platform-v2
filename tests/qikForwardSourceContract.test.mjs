import test from 'node:test'
import assert from 'node:assert/strict'
import {FORWARD_SOURCE, FORWARD_SOURCE_RECONCILIATION_ID, assertForwardSourceProvisionable, assertForwardSourceRegistries, assertForwardSourcePlan} from '../supabase/qualification/qik-ingest/forwardSourceContract.mjs'

// Controlled rows only: these are not hosted grants or evidence of a live C3 binding.
function registries() {
  return {
    c2Rows: [{id: FORWARD_SOURCE.id, source_key: FORWARD_SOURCE.key, label: FORWARD_SOURCE.label,
      source_url: FORWARD_SOURCE.feedUrl, source_type: 'official_feed'}],
    c3Rows: [{id: FORWARD_SOURCE.id, feed_url: FORWARD_SOURCE.feedUrl}],
    reconciliationRows: [{id: FORWARD_SOURCE_RECONCILIATION_ID, ingestion_source_id: FORWARD_SOURCE.id,
      ingest_source_id: FORWARD_SOURCE.id, relationship: 'same_publisher_same_endpoint', collection_enabled: false}],
  }
}

test('forward source provisioning is disabled and never adopts an existing C3 identity', () => {
  assert.deepEqual(assertForwardSourceProvisionable([]), {id: FORWARD_SOURCE.id,
    feed_url: FORWARD_SOURCE.feedUrl, enabled: false, collection_enabled: false})
  for (const rows of [undefined, null, {}, [{id: FORWARD_SOURCE.id}], [{feed_url: FORWARD_SOURCE.feedUrl}]])
    assert.throws(() => assertForwardSourceProvisionable(rows), /forward_source_c3_collision/)
})

test('unmapped source and contradictory registries remain inadmissible', () => {
  assert.equal(assertForwardSourceRegistries(registries()), FORWARD_SOURCE)
  const absent = registries(); absent.c3Rows = []
  assert.throws(() => assertForwardSourceRegistries(absent), /forward_source_c3_missing_or_ambiguous/)
  const distinct = registries(); distinct.reconciliationRows[0].relationship = 'distinct_registers'
  distinct.reconciliationRows[0].ingest_source_id = null
  assert.throws(() => assertForwardSourceRegistries(distinct), /forward_source_reconciliation_mismatch/)
  for (const [table, field, value] of [
    ['c2Rows', 'id', '00000000-0000-4000-8000-000000000001'],
    ['c2Rows', 'source_key', 'doj-similar'],
    ['c2Rows', 'label', 'Different publisher'],
    ['c2Rows', 'source_url', FORWARD_SOURCE.feedUrl + '&extra=1'],
    ['c2Rows', 'source_type', 'news_feed'],
    ['c3Rows', 'id', '00000000-0000-4000-8000-000000000002'],
    ['c3Rows', 'feed_url', 'https://example.invalid/feed'],
    ['reconciliationRows', 'id', '00000000-0000-4000-8000-000000000003'],
    ['reconciliationRows', 'ingestion_source_id', null],
    ['reconciliationRows', 'ingest_source_id', null],
    ['reconciliationRows', 'collection_enabled', true],
  ]) {
    const input = registries(); input[table][0][field] = value
    assert.throws(() => assertForwardSourceRegistries(input), /forward_source_/, table + '.' + field)
  }
  for (const table of ['c2Rows', 'c3Rows', 'reconciliationRows']) {
    const input = registries(); input[table].push({...input[table][0]})
    assert.throws(() => assertForwardSourceRegistries(input), /missing_or_ambiguous/)
  }
})

test('final collection plan requires the exact single source and explicit open gate', () => {
  const source = {id: FORWARD_SOURCE.id, feed_url: FORWARD_SOURCE.feedUrl}
  assert.equal(assertForwardSourcePlan({collection_authorized: true, sources: [source]}), FORWARD_SOURCE)
  for (const collection_authorized of [false, undefined, null, 'true'])
    assert.throws(() => assertForwardSourcePlan({collection_authorized, sources: [source]}), /collection_disabled/)
  for (const sources of [[], [source, source], undefined])
    assert.throws(() => assertForwardSourcePlan({collection_authorized: true, sources}), /plan_not_single_source/)
  assert.throws(() => assertForwardSourcePlan({collection_authorized: true,
    sources: [{...source, feed_url: 'https://example.invalid/feed'}]}), /plan_identity_mismatch/)
})
