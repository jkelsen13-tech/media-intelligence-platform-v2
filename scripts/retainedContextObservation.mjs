import { createHash } from 'node:crypto'

// Offline operator contract. Shape/identity checks are not source-rights adjudication,
// authenticated registry approval, evidence admission or a trusted historical ledger.
export const CONTEXT_CONTRACT = 'retained-point-context-1'
const CHECKS = ['commercial_use', 'redistribution_rights', 'required_attribution', 'patent_license_compatibility', 'service_terms']
const OPERATIONS = ['display', 'analysis', 'retain', 'export', 'redistribute']
const fail = code => { throw new Error(code) }
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(value)
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }; return value }

function copyJson(input) {
  let nodes = 0
  function visit(value, depth) {
    if (++nodes > 10000 || depth > 12) fail('context_structure_limit')
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (!value || typeof value !== 'object') fail('context_requires_finite_plain_json')
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('context_requires_plain_objects')
    if (Object.getOwnPropertySymbols(value).length) fail('context_requires_plain_json_keys')
    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(value) && key === 'length') continue
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('context_requires_plain_json_fields')
      visit(descriptor.value, depth + 1)
    }
    if (Array.isArray(value) && Object.keys(value).length !== value.length) fail('context_requires_dense_arrays')
  }
  visit(input, 0)
  const encoded = JSON.stringify(input)
  if (Buffer.byteLength(encoded) > 131072) fail('context_exceeds_128_kib')
  return JSON.parse(encoded)
}

function keys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail(code)
}

function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail('explicit_utc_instant_required')
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value.replace(/(?<!\.\d{3})Z$/, '.000Z')) fail('invalid_utc_instant')
  return ms
}

function publication(value) {
  keys(value, ['value', 'precision'], 'invalid_publication_fields')
  if (value.precision === 'unknown' && value.value === null) return
  if (value.precision === 'instant') { utc(value.value); return }
  if (value.precision === 'day' && typeof value.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.value)) {
    utc(value.value + 'T00:00:00Z')
    return
  }
  fail('publication_precision_mismatch')
}

function rights(review, source) {
  keys(review, ['id', 'version', 'reviewed_at', 'source', 'checks', 'permissions', 'no_fee', 'references', 'attribution'], 'invalid_rights_fields')
  if (!token(review.id) || !token(review.version)) fail('rights_identity_required')
  utc(review.reviewed_at)
  keys(review.source, ['provider', 'product', 'release'], 'invalid_rights_source')
  if (['provider', 'product', 'release'].some(key => review.source[key] !== source[key])) fail('rights_source_release_mismatch')
  keys(review.checks, CHECKS, 'invalid_rights_checks')
  if (CHECKS.some(key => review.checks[key] !== 'confirmed')) fail('rights_review_incomplete')
  if (review.no_fee !== true) fail('no_fee_permission_required')
  keys(review.permissions, OPERATIONS, 'invalid_operation_permissions')
  if (OPERATIONS.some(key => typeof review.permissions[key] !== 'boolean')) fail('operation_permission_unknown')
  if (!review.permissions.retain || !review.permissions.analysis) fail('retention_and_analysis_required')
  keys(review.references, ['software', 'data', 'service', 'notices'], 'invalid_rights_references')
  for (const key of ['software', 'data', 'service', 'notices']) {
    if (!Array.isArray(review.references[key]) || review.references[key].length < 1 || review.references[key].length > 16 || !review.references[key].every(text)) fail('rights_reference_required')
  }
  if (!Array.isArray(review.attribution) || review.attribution.length > 16 || !review.attribution.every(text)) fail('invalid_attribution')
}

/**
 * Construct one immutable, bounded point-context snapshot in memory.
 * Review assertions must eventually be resolved through a trusted registry before
 * any live integration. No caller argument can make this output public evidence.
 */
export function createContextObservation(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length) fail('historical_or_activation_options_not_supported')
  const value = copyJson(input)
  keys(value, ['source', 'clocks', 'geometry', 'measurement_kind', 'measurements', 'payload', 'rights'], 'invalid_context_fields')
  const { source, clocks, geometry, measurements, payload } = value
  keys(source, ['provider', 'product', 'release', 'record_id', 'upstream_origin'], 'invalid_source_fields')
  if (!['provider', 'product', 'release', 'record_id'].every(key => token(source[key]))) fail('source_exact_identity_required')
  if (source.upstream_origin !== null && !token(source.upstream_origin)) fail('invalid_upstream_origin')
  rights(value.rights, source)

  keys(clocks, ['valid_from', 'valid_to', 'published', 'retrieved_at', 'recorded_at'], 'invalid_clock_fields')
  const from = utc(clocks.valid_from), to = utc(clocks.valid_to)
  const retrieved = utc(clocks.retrieved_at), recorded = utc(clocks.recorded_at)
  if (from >= to || to > retrieved || retrieved > recorded) fail('invalid_historical_clock_order')
  if (utc(value.rights.reviewed_at) > recorded) fail('rights_review_after_recording')
  publication(clocks.published) // Never coerce day precision into a claimed publication instant.

  keys(geometry, ['type', 'coordinates', 'precision', 'resolution', 'method'], 'invalid_geometry_fields')
  if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2 ||
      !geometry.coordinates.every(n => typeof n === 'number' && Number.isFinite(n)) ||
      Math.abs(geometry.coordinates[0]) > 180 || Math.abs(geometry.coordinates[1]) > 90) fail('bounded_point_required')
  if (!['grid_cell', 'station', 'reported_point'].includes(geometry.precision) || !text(geometry.resolution) || !text(geometry.method)) fail('geometry_precision_required')
  if (!['observation', 'model', 'estimate'].includes(value.measurement_kind)) fail('measurement_kind_required')
  if (!Array.isArray(measurements) || measurements.length < 1 || measurements.length > 24) fail('measurement_count_out_of_bounds')
  const ids = new Set()
  for (const measurement of measurements) {
    keys(measurement, ['parameter', 'value', 'unit', 'missing_reason', 'quality', 'sampling'], 'invalid_measurement_fields')
    if (!token(measurement.parameter) || ids.has(measurement.parameter)) fail('measurement_identity_required')
    ids.add(measurement.parameter)
    if (!text(measurement.unit)) fail('explicit_unit_required')
    if (measurement.value === null ? !text(measurement.missing_reason)
      : typeof measurement.value !== 'number' || !Number.isFinite(measurement.value) || measurement.missing_reason !== null) fail('explicit_measurement_or_missing_reason_required')
    if (!Array.isArray(measurement.quality) || measurement.quality.length < 1 || measurement.quality.length > 16 || !measurement.quality.every(text)) fail('quality_state_required')
    const sample = measurement.sampling
    keys(sample, ['kind', 'from', 'to'], 'invalid_sampling_fields')
    const start = utc(sample.from)
    if (start < from || start >= to) fail('sample_outside_valid_interval')
    if (sample.kind === 'instant') {
      if (sample.to !== null) fail('instant_cannot_claim_interval')
    } else if (['mean', 'accumulation'].includes(sample.kind)) {
      const end = utc(sample.to)
      if (end <= start || end > to) fail('sample_interval_invalid')
    } else fail('sampling_kind_required')
  }
  keys(payload, ['text', 'media_type'], 'invalid_payload_fields')
  if (typeof payload.text !== 'string' || payload.text.length === 0 || !payload.text.isWellFormed() || Buffer.byteLength(payload.text) > 65536 || !text(payload.media_type)) fail('bounded_exact_payload_required')
  const payloadSha256 = createHash('sha256').update(payload.text, 'utf8').digest('hex')
  const snapshot = {
    contract: CONTEXT_CONTRACT,
    ...value,
    payload_sha256: payloadSha256,
    rights_sha256: hash(value.rights),
    temporal_mode: 'reconstruction',
    authority: 'operator_supplied_not_registry_or_ledger_verified',
    evidence_state: 'context_only',
    publicly_eligible: false,
    independent_source_count: null,
  }
  return freeze({ ...snapshot, snapshot_sha256: hash(snapshot) })
}

/** Exact snapshots are compared, never automatically reassessed or promoted. */
export function compareContextObservations(beforeInput, afterInput) {
  // Revalidate the original input shape rather than trusting caller output hashes.
  const inputOf = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_context_snapshot')
    return Object.fromEntries(['source', 'clocks', 'geometry', 'measurement_kind', 'measurements', 'payload', 'rights'].map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid_context_snapshot')
      return [key, descriptor.value]
    }))
  }
  const before = createContextObservation(inputOf(beforeInput))
  const after = createContextObservation(inputOf(afterInput))
  if (['provider', 'product', 'record_id'].some(key => before.source[key] !== after.source[key])) fail('different_source_record_identity')
  return freeze({
    before_sha256: before.snapshot_sha256,
    after_sha256: after.snapshot_sha256,
    payload_changed: before.payload_sha256 !== after.payload_sha256,
    rights_changed: before.rights_sha256 !== after.rights_sha256,
    context_metadata_changed: hash({ ...inputOf(before), payload: null, rights: null }) !== hash({ ...inputOf(after), payload: null, rights: null }),
    reassessment: 'not_run',
    conclusion_change: 'not_evaluated',
    publicly_eligible: false,
  })
}

export function contextOriginRelationship(left, right) {
  const a = left?.source?.upstream_origin, b = right?.source?.upstream_origin
  return freeze({
    relationship: token(a) && token(b) && a === b ? 'same_declared_upstream' : 'independence_unknown',
    authority: 'operator_supplied_not_registry_verified',
    independent_source_count: null,
  })
}
