import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMarketPriceContext, marketPriceRangeLabel } from '../src/lib/marketPriceContext.js'

// Synthetic retained-record projections only, never admitted production data.
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const at = '2024-04-08T18:00:00.000001Z'
function fixture(kind = 'equity', relation = 'direct_reporting') {
  const asset = { id: id(1), recordVersionId: id(2), name: 'Synthetic asset', kind,
    issuerId: id(3), networkId: 'test-network', assetIdentifier: 'contract:synthetic',
    releaseState: 'public', publiclyEligible: true, validFrom: '2020-01-01T00:00:00Z', validTo: null,
    aliases: [{ symbol: 'SAME', namespace: kind === 'equity' ? 'test-exchange' : 'test-network', recordVersionId: id(4), validFrom: '2020-01-01T00:00:00Z', validTo: null }] }
  const capture = { id: id(10), articleId: id(11), rootId: id(12), payloadHash: 'a'.repeat(64), publiclyEligible: true,
    summary: 'Exact retained support.', publishedAt: '2024-04-08', recordedAt: '2024-04-09T00:00:00.123456Z', sourceUrl: 'https://example.test/retained',
    rights: { displayExcerpt: true, recordVersionId: id(13), attribution: 'Synthetic fixture' } }
  const assessment = { id: id(20), candidateId: id(21), from: asset.id, to: id(9), relationship: relation,
    outcome: 'supported', stale: false, supersededBy: [], algorithmVersion: 'synthetic-v1', uncertainty: 'Not a production finding',
    releaseState: 'public', publiclyEligible: true, validFrom: asset.validFrom, validTo: null,
    supports: [{ captureId: capture.id, field: 'summary', start: 0, end: Array.from(capture.summary).length, excerpt: capture.summary }] }
  return { asset, at, eventId: id(9), captures: [capture], assessments: [assessment],
    hops: [{ from: asset.id, to: id(9), relationship: relation, assessmentId: assessment.id }] }
}
const records = model => model.reporting.sections.flatMap(section => section.records)

test('stock and crypto retain canonical reporting when all providers and prices are unavailable', () => {
  for (const kind of ['equity', 'cryptoasset']) {
    const evidence = fixture(kind), before = structuredClone(evidence)
    const model = buildMarketPriceContext({ asset: evidence.asset, at, observationTime: '2026-10-02T10:00:00Z', reporting: [{ evidence }] })
    assert.equal(model.status, 'ok'); assert.equal(model.price.status, 'unavailable')
    assert.equal(model.price.activeProvider, null); assert.equal(model.price.quote, null)
    assert.equal(model.price.quoteTime, null); assert.equal(model.price.retrievalTime, null)
    assert.deepEqual(model.price.samples, []); assert.equal(model.price.incrementalSubscriptionCeiling, 0)
    assert.equal(model.reporting.status, 'available'); assert.equal(model.asset.id, evidence.asset.id)
    assert.equal(records(model)[0].path[0].supports[0].publishedAt, '2024-04-08')
    assert.equal(records(model)[0].path[0].supports[0].recordedAt, evidence.captures[0].recordedAt)
    assert.equal(model.observationTime, '2026-10-02T10:00:00Z'); assert.equal(model.validTime, at)
    assert.deepEqual(evidence, before); assert.equal(Object.isFrozen(evidence), false)
    assert.equal(Object.isFrozen(records(model)[0].path[0].supports[0]), true)
  }
})

test('same ticker cannot authorize a different selected asset, version or historical clock', () => {
  for (const change of [x => { x.asset.id = id(99) }, x => { x.asset.recordVersionId = id(99) }, x => { x.at = '2024-04-08T18:00:00.000002Z' }]) {
    const selected = fixture(), other = fixture(); change(other)
    const model = buildMarketPriceContext({ asset: selected.asset, at, reporting: [{ evidence: other }] })
    assert.deepEqual(records(model), []); assert.equal(model.reporting.rejected[0].reason, 'investigation_scope_mismatch')
  }
  assert.equal(buildMarketPriceContext({ asset: { id: 'SAME' }, at }).status, 'unavailable')
  assert.equal(buildMarketPriceContext({ asset: fixture().asset, at: '2024-04-08' }).status, 'unavailable')
})

test('corrections, rights loss and unsupported relationships remove reporting without replacing prices', () => {
  for (const change of [x => { x.assessments[0].stale = true }, x => { x.assessments[0].outcome = 'contested' },
    x => { x.captures[0].summary = 'Corrected support' }, x => { x.captures[0].rights.displayExcerpt = false },
    x => { x.hops[0].relationship = 'same_geography' }]) {
    const evidence = fixture(); change(evidence)
    const model = buildMarketPriceContext({ asset: evidence.asset, at, reporting: [{ evidence }] })
    assert.equal(model.price.quote, null); assert.deepEqual(records(model), []); assert.equal(model.reporting.status, 'empty')
    assert.equal(model.reporting.rejected.length, 1)
  }
})

test('direct, one-hop connected and supplied broader relevance preserve explanation sources and lineage', () => {
  const direct = fixture(), connected = fixture('equity', 'supply'), broader = fixture('equity', 'regulation')
  const model = buildMarketPriceContext({ asset: direct.asset, at, reporting: [{ evidence: direct }, { evidence: direct }, { evidence: connected }, { evidence: broader, relevance: 'broader_context' }] })
  assert.deepEqual(model.reporting.sections.map(section => section.records.length), [1, 1, 1])
  for (const section of model.reporting.sections.slice(1)) {
    const record = section.records[0]
    assert.deepEqual(record.rootIds, [id(12)])
    assert.equal(record.explanation.label, 'Why this is related')
    assert.equal(record.explanation.relationships[0].supports[0].sourceUrl, 'https://example.test/retained')
  }
  assert.equal(model.reporting.independentConfirmation, null)
  assert.match(model.reporting.copy, /does not establish what caused/)
  assert.equal('confidence' in records(model)[0], false)
})

test('stock sessions cannot become calendar windows and crypto range labels never create samples', () => {
  assert.match(marketPriceRangeLabel('equity', 'trading-day'), /not a continuous 24-hour/)
  assert.match(marketPriceRangeLabel('equity', '5-trading-days'), /not 7 calendar days/)
  assert.equal(marketPriceRangeLabel('equity', 'rolling-7-days'), 'Price range unavailable')
  assert.equal(marketPriceRangeLabel('cryptoasset', 'rolling-24-hours'), 'Rolling 24 hours')
  assert.equal(marketPriceRangeLabel('cryptoasset', '5-trading-days'), 'Price range unavailable')
  const evidence = fixture('cryptoasset')
  const model = buildMarketPriceContext({ asset: evidence.asset, at, quote: 42, percentChange24h: 10, samples: [42] })
  assert.equal(model.price.quote, null); assert.deepEqual(model.price.samples, [])
  assert.equal(model.reporting.status, 'empty'); assert.match(model.reporting.copy, /does not mean nothing happened/)
})
