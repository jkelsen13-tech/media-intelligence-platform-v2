import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileSourceRegisters, assertCollectionDisabled, isDiscoverySource } from '../scripts/mipSourceRegisters.mjs'
import { MANUS_SOURCE_FIXTURE, restoreSourceRegisters } from '../scripts/mipConsolidationRestore.mjs'

test('registers stay separate and collection stays off', () => {
  const reconciled = restoreSourceRegisters()
  assert.equal(reconciled.union_forbidden, true)
  assert.equal(reconciled.collection_enabled, false)
  assert.equal(reconciled.ingest_sources.every((row) => row.enabled === false && row.collection_enabled === false), true)
  assert.equal(reconciled.ingestion_sources.every((row) => row.active === false && row.allow_body_fetch === false), true)
  assert.doesNotThrow(() => assertCollectionDisabled(reconciled))
})

test('BBC World and BBC News are the same publisher with different endpoints', () => {
  const reconciled = reconcileSourceRegisters(MANUS_SOURCE_FIXTURE.ingest_sources, MANUS_SOURCE_FIXTURE.ingestion_sources)
  const bbc = reconciled.relationships.find((row) => row.ingest_feed_url?.includes('bbci.co.uk/news/world'))
  assert.equal(bbc.relationship, 'same_publisher_different_endpoint')
  assert.equal(bbc.ingestion_source_key, 'bbc-news-rss')
  assert.equal(bbc.collection_enabled, false)
})

test('GDELT rows are discovery, not publishers', () => {
  assert.equal(isDiscoverySource({ source_type: 'gdelt_doc_api', source_key: 'gdelt-public-news-discovery' }), true)
  const reconciled = restoreSourceRegisters()
  const discovery = reconciled.relationships.filter((row) => row.relationship === 'discovery_not_publisher')
  assert.equal(discovery.length, 1)
  assert.equal(discovery[0].ingestion_source_key, 'gdelt-public-news-discovery')
})

test('a UNION activation is rejected', () => {
  const reconciled = restoreSourceRegisters()
  reconciled.ingest_sources[0].collection_enabled = true
  assert.throws(() => assertCollectionDisabled(reconciled), /collection remains disabled/)
})
