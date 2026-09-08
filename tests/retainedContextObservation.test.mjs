import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createContextObservation, compareContextObservations, contextOriginRelationship } from '../scripts/retainedContextObservation.mjs'

// Entirely synthetic rights/data fixtures. They approve no real source or API.
function fixture() {
  return {
    source: { provider: 'fixture-provider', product: 'fixture-hourly', release: 'fixture-release-1', record_id: 'fixture-point-day', upstream_origin: 'fixture-origin-a' },
    clocks: {
      valid_from: '2024-04-08T17:00:00Z', valid_to: '2024-04-08T18:00:00Z',
      published: { value: '2024-04-09', precision: 'day' },
      retrieved_at: '2026-09-07T12:00:00Z', recorded_at: '2026-09-07T12:01:00Z',
    },
    geometry: { type: 'Point', coordinates: [-81.7, 41.4], precision: 'grid_cell', resolution: 'synthetic 0.5 degree cell', method: 'fixture grid center; not an onsite station' },
    measurement_kind: 'model',
    measurements: [
      { parameter: 'temperature', value: 12, unit: 'degC', missing_reason: null, quality: ['not_verified'], sampling: { kind: 'instant', from: '2024-04-08T17:00:00Z', to: null } },
      { parameter: 'precipitation', value: 0, unit: 'mm', missing_reason: null, quality: ['not_verified'], sampling: { kind: 'accumulation', from: '2024-04-08T17:00:00Z', to: '2024-04-08T18:00:00Z' } },
    ],
    payload: { text: '{"synthetic":true,"temperature":12,"precipitation":0}', media_type: 'application/json' },
    rights: {
      id: 'synthetic-review-not-real-approval', version: '1', reviewed_at: '2026-09-07T11:00:00Z',
      source: { provider: 'fixture-provider', product: 'fixture-hourly', release: 'fixture-release-1' },
      checks: { commercial_use: 'confirmed', redistribution_rights: 'confirmed', required_attribution: 'confirmed', patent_license_compatibility: 'confirmed', service_terms: 'confirmed' },
      permissions: { display: true, analysis: true, retain: true, export: false, redistribute: false },
      no_fee: true,
      references: { software: ['fixture: no imported software'], data: ['fixture: invented test data'], service: ['fixture: no service'], notices: ['fixture: no upstream notices'] },
      attribution: ['Synthetic test fixture only'],
    },
  }
}
function rejected(change, reason) {
  const value = fixture()
  change(value)
  assert.throws(() => createContextObservation(value), reason)
}

test('point context preserves exact clocks, precision and semantics without evidence promotion', () => {
  const input = fixture(), result = createContextObservation(input)
  assert.deepEqual(result.clocks, input.clocks)
  assert.deepEqual(result.geometry, input.geometry)
  assert.equal(result.measurement_kind, 'model')
  assert.equal(result.evidence_state, 'context_only')
  assert.equal(result.temporal_mode, 'reconstruction')
  assert.equal(result.authority, 'operator_supplied_not_registry_or_ledger_verified')
  assert.equal(result.publicly_eligible, false)
  assert.equal(result.independent_source_count, null)
  assert.equal(result.rights.permissions.export, false)
  assert.equal(result.clocks.published.value, '2024-04-09')
  assert.equal(result.clocks.published.precision, 'day')
})

test('exact raw payload hashing preserves whitespace and Unicode instead of normalized equivalence', () => {
  const a = fixture(), b = fixture()
  a.payload.text = '{"note":"🌍 café"}'
  b.payload.text = '{ "note": "🌍 café" }'
  const left = createContextObservation(a), right = createContextObservation(b)
  assert.equal(left.payload_sha256, createHash('sha256').update(a.payload.text, 'utf8').digest('hex'))
  assert.notEqual(left.payload_sha256, right.payload_sha256)
  assert.notEqual(left.snapshot_sha256, right.snapshot_sha256)
  rejected(x => { x.payload.text = '\ud800' }, /bounded_exact_payload_required/)
})

test('snapshot identity is deterministic across key order and cannot change after caller edits', () => {
  const input = fixture(), first = createContextObservation(input)
  const reordered = Object.fromEntries(Object.entries(input).reverse())
  assert.equal(createContextObservation(reordered).snapshot_sha256, first.snapshot_sha256)
  input.measurements[0].value = 99
  assert.equal(first.measurements[0].value, 12)
  assert.throws(() => { first.geometry.coordinates[0] = 0 }, TypeError)
  assert.throws(() => { first.rights.permissions.export = true }, TypeError)
})

test('missing is explicit and distinct from a genuine numeric zero', () => {
  const input = fixture()
  input.measurements[0].value = null
  input.measurements[0].missing_reason = 'provider_missing_value'
  const output = createContextObservation(input)
  assert.equal(output.measurements[0].value, null)
  assert.equal(output.measurements[1].value, 0)
  for (const value of ['', '0', false, NaN, Infinity, undefined]) {
    rejected(x => { x.measurements[0].value = value }, /explicit_measurement|finite_plain_json/)
  }
  rejected(x => { x.measurements[0].value = null }, /missing_reason_required/)
  rejected(x => { x.measurements[0].missing_reason = 'missing' }, /missing_reason_required/)
  rejected(x => { x.measurements[0].unit = '' }, /explicit_unit_required/)
  rejected(x => { x.measurements[0].quality = [] }, /quality_state_required/)
})

test('unqualified dates, impossible dates and local times cannot masquerade as UTC instants', () => {
  for (const value of ['2024-02-30T17:00:00Z', '2024-04-08', '2024-04-08T17:00:00', '2024-04-08T13:00:00-04:00']) {
    rejected(x => { x.clocks.valid_from = value }, /utc_instant/)
  }
  const input = fixture()
  input.clocks.valid_from = '2024-04-08T17:00:00.000Z'
  assert.equal(createContextObservation(input).clocks.valid_from, input.clocks.valid_from)
  rejected(x => { x.clocks.published = { value: '2024-02-30', precision: 'day' } }, /invalid_utc/)
  rejected(x => { x.clocks.published = { value: '2024-04-09', precision: 'instant' } }, /utc_instant/)
  const unknown = fixture()
  unknown.clocks.published = { value: null, precision: 'unknown' }
  assert.deepEqual(createContextObservation(unknown).clocks.published, unknown.clocks.published)
})

test('late-arriving historical data is reconstruction and cannot authorize as-known-then reads', () => {
  const input = fixture()
  assert.equal(createContextObservation(input).temporal_mode, 'reconstruction')
  assert.throws(() => createContextObservation(input, { asOf: '2024-04-08T18:00:00Z' }), /historical_or_activation/)
  assert.throws(() => createContextObservation(input, { publish: true }), /historical_or_activation/)
  rejected(x => { x.clocks.retrieved_at = '2024-04-08T17:30:00Z' }, /historical_clock_order/)
  rejected(x => { x.clocks.recorded_at = '2026-09-07T11:59:00Z' }, /historical_clock_order/)
  rejected(x => { x.clocks.valid_to = x.clocks.valid_from }, /historical_clock_order/)
})

test('accumulations and means require explicit intervals; adjacent-hour carry-forward is refused', () => {
  rejected(x => { x.measurements[0].sampling.from = '2024-04-08T16:00:00Z' }, /sample_outside/)
  rejected(x => { x.measurements[0].sampling.from = x.clocks.valid_to }, /sample_outside/)
  rejected(x => { x.measurements[0].sampling.to = x.clocks.valid_to }, /instant_cannot_claim/)
  rejected(x => { x.measurements[1].sampling.to = null }, /utc_instant/)
  rejected(x => { x.measurements[1].sampling.to = '2024-04-08T19:00:00Z' }, /sample_interval_invalid/)
  const input = fixture()
  input.measurements[1].sampling.kind = 'mean'
  assert.equal(createContextObservation(input).measurements[1].sampling.kind, 'mean')
})

test('rights uncertainty blocks construction even with permissive data or true operation flags', () => {
  for (const check of Object.keys(fixture().rights.checks)) {
    for (const state of [null, false, 'unknown', 'pending']) {
      rejected(x => { x.rights.checks[check] = state }, /rights_review_incomplete/)
    }
  }
  rejected(x => { x.rights.no_fee = null }, /no_fee_permission_required/)
  rejected(x => { x.rights.permissions.redistribute = null }, /operation_permission_unknown/)
  rejected(x => { x.rights.permissions.retain = false }, /retention_and_analysis_required/)
  rejected(x => { x.rights.references.service = [] }, /rights_reference_required/)
  rejected(x => { x.rights.references.notices = [] }, /rights_reference_required/)
})

test('rights approval assertion is bound to the exact provider, product and release', () => {
  for (const key of ['provider', 'product', 'release']) {
    rejected(x => { x.rights.source[key] = 'another-product' }, /rights_source_release_mismatch/)
  }
  rejected(x => { x.source.release = '' }, /source_exact_identity_required/)
  rejected(x => { x.rights.version = '' }, /rights_identity_required/)
})

test('point precision is explicit and never silently creates a station or finer coordinates', () => {
  for (const coordinates of [[181, 0], [0, -91], ['0', 0], [0, 0, 1]]) {
    rejected(x => { x.geometry.coordinates = coordinates }, /bounded_point_required/)
  }
  rejected(x => { x.geometry.precision = 'unknown' }, /geometry_precision_required/)
  rejected(x => { x.geometry.resolution = '' }, /geometry_precision_required/)
  rejected(x => { x.measurement_kind = 'forecast' }, /measurement_kind_required/)
  const input = fixture()
  input.geometry.coordinates = [180, 90]
  assert.deepEqual(createContextObservation(input).geometry.coordinates, [180, 90])
})

test('shared upstream is not independent corroboration; different or missing keys stay unknown', () => {
  const left = createContextObservation(fixture()), other = fixture()
  other.source.provider = 'another-wrapper'
  other.rights.source.provider = 'another-wrapper'
  const right = createContextObservation(other)
  assert.equal(contextOriginRelationship(left, right).relationship, 'same_declared_upstream')
  other.source.upstream_origin = 'another-declared-origin'
  assert.equal(contextOriginRelationship(left, createContextObservation(other)).relationship, 'independence_unknown')
  assert.equal(contextOriginRelationship(left, {}).independent_source_count, null)
})

test('before/after detects payload and metadata changes without a changed-conclusion verdict', () => {
  const original = createContextObservation(fixture()), changed = fixture()
  changed.payload.text += '\n'
  const report = compareContextObservations(original, createContextObservation(changed))
  assert.equal(report.payload_changed, true)
  assert.equal(report.context_metadata_changed, false)
  assert.equal(report.rights_changed, false)
  assert.equal(report.reassessment, 'not_run')
  assert.equal(report.conclusion_change, 'not_evaluated')
  assert.equal(report.publicly_eligible, false)
  const metadata = fixture()
  metadata.clocks.recorded_at = '2026-09-07T12:02:00Z'
  const metadataReport = compareContextObservations(original, createContextObservation(metadata))
  assert.equal(metadataReport.payload_changed, false)
  assert.equal(metadataReport.context_metadata_changed, true)
})

test('rights changes get a separate receipt and comparison never trusts supplied hashes', () => {
  const a = createContextObservation(fixture()), input = fixture()
  input.rights.version = '2'
  input.rights.permissions.display = false
  const b = createContextObservation(input)
  const report = compareContextObservations({ ...a, snapshot_sha256: 'forged', publicly_eligible: true }, b)
  assert.equal(report.before_sha256, a.snapshot_sha256)
  assert.equal(report.rights_changed, true)
  assert.equal(report.payload_changed, false)
  assert.equal(report.context_metadata_changed, false)
  rejected(x => { x.publicly_eligible = true }, /invalid_context_fields/)
  const other = fixture()
  other.source.record_id = 'another-record'
  assert.throws(() => compareContextObservations(a, createContextObservation(other)), /different_source_record_identity/)
})

test('bounded contract rejects duplicate parameters, unknown fields and oversized input', () => {
  rejected(x => { x.measurements.push(structuredClone(x.measurements[0])) }, /measurement_identity_required/)
  rejected(x => { x.measurements = Array(25).fill(x.measurements[0]) }, /measurement_count_out_of_bounds/)
  rejected(x => { x.measurements[0].confidence = 0.99 }, /invalid_measurement_fields/)
  rejected(x => { x.payload.text = 'a'.repeat(65537) }, /bounded_exact_payload_required/)
  rejected(x => { x.payload.text = 'a'.repeat(131073) }, /context_exceeds_128_kib/)
  rejected(x => { x.clocks.retrieved_at = new Date() }, /plain_objects/)
  const input = fixture()
  Object.defineProperty(input, 'source', { enumerable: true, get() { throw Error('getter must not execute') } })
  assert.throws(() => createContextObservation(input), /plain_json_fields/)
  assert.throws(() => compareContextObservations(input, createContextObservation(fixture())), /invalid_context_snapshot/)
})
