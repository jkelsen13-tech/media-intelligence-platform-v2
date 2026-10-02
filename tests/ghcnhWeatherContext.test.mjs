import test from 'node:test'
import assert from 'node:assert/strict'
import { ghcnhWeatherContextProposal as proposal } from '../src/lib/ghcnhWeatherContext.js'
import { parseGhcnhWeatherRecords } from '../src/lib/ghcnhWeatherParser.js'
import { buildWorldViewSpatialContext } from '../src/lib/worldViewSpatialContext.js'
import { weatherSourcePermission } from '../src/lib/weatherSourceRights.js'
import { syntheticRow, syntheticOptions } from './ghcnhWeatherSyntheticFixture.mjs'

function candidate(overrides = {}) { const records = [syntheticRow(overrides)]; return parseGhcnhWeatherRecords(records, syntheticOptions(records)).candidates[0] }
const at = '2025-01-01T00:51:00Z'
const target = { latitude: 41.4, longitude: -81.8 }
const limits = { maxStationDistanceMeters: 1000, maxTimeOffsetSeconds: 60 }
const base = c => ({ candidate: c, subjectId: 'synthetic-subject', inspectionTime: at })
const row = { subject_graph_node_id: 'synthetic-subject', mip_object_id: 'synthetic-spatial', revision_id: 'v1', revision_ordinal: 1,
  precision_class: 'city', geometry_status: 'coarsened_to_precision_class', display_geometry: { type: 'Point', coordinates: [-81.8, 41.4] },
  spatial_role: 'event', object_type: 'event_spatial_relationship', valid_time_precision: 'range',
  valid_from_utc: '2025-01-01T00:00:00Z', valid_to_utc: '2025-01-01T02:00:00Z', review_state: 'operative', release_state: 'released' }
function intake(record, instant = at, visibleRow = row) {
  return buildWorldViewSpatialContext({ visibleRow, selected: { id: 'synthetic-subject', label: 'Synthetic event' },
    investigationContext: { canonical_subject_id: 'synthetic-subject', canonical_subject_type: 'event', as_of_time: instant },
    admittedContext: { weather: [record] } })
}

test('station-only diagnostic invents no station cutoff, temporal tolerance or subject weather admission', () => {
  const c = candidate(), p = proposal({ candidate: c })
  assert.equal(p.status, 'qualification-proposal'); assert.equal(p.binding.scope, 'station-only')
  assert.equal(p.binding.stationDistanceMeters, null); assert.equal(p.binding.offsetNanoseconds, null); assert.equal(p.binding.limits, null)
  assert.equal(p.record.subjectId, null); assert.equal(p.record.admitted, false); assert.equal(p.publicationAdmitted, false)
  assert.equal(p.record.referenceTime, at); assert.equal(p.record.temporalMode, 'event-time')
  assert.match(p.record.geography.label, /station only; not citywide or neighborhood/)
  assert.match(p.record.fields.observationType, /Historical.*current conditions unknown/)
  assert.match(p.record.geography.precision, /datums unverified/)
  assert.equal(p.record.provenance.variables.temperature.flags.Quality_Code, '5')
  assert.equal(p.record.provenance.retrievedAt, null); assert.equal(p.record.source.referenceId, c.provenance.inputSha256)
})

test('bounded station context requires both caller-supplied distance and time limits', () => {
  const b = { ...base(candidate()), scope: 'bounded-station-context', target }
  for (const input of [{}, { maxStationDistanceMeters: 1 }, { maxTimeOffsetSeconds: 1 }, { ...limits, maxStationDistanceMeters: -1 },
    { ...limits, maxTimeOffsetSeconds: -1 }, { ...limits, maxTimeOffsetSeconds: 0.5 }, { ...limits, maxTimeOffsetSeconds: Infinity }]) {
    assert.equal(proposal({ ...b, limits: input }).reason, 'explicit-distance-and-time-limits-required')
  }
  assert.equal(proposal({ ...b, limits, target: null }).reason, 'explicit-distance-and-time-limits-required')
  assert.equal(proposal({ ...b, limits, inspectionTime: '2025-01-01' }).reason, 'explicit-distance-and-time-limits-required')
  const exact = proposal({ ...b, limits: { maxStationDistanceMeters: 0, maxTimeOffsetSeconds: 0 } })
  assert.equal(exact.status, 'qualification-proposal'); assert.equal(exact.binding.stationDistanceMeters, 0)
  assert.equal(exact.binding.offsetNanoseconds, '0'); assert.equal(exact.binding.existingExactTimeSeamCompatible, true)
})

test('explicit distance and time boundaries fail closed without changing observed time', () => {
  const b = { ...base(candidate()), scope: 'bounded-station-context', target, limits }
  assert.equal(proposal({ ...b, target: { latitude: 0, longitude: 0 } }).reason, 'station-outside-distance-limit')
  assert.equal(proposal({ ...b, inspectionTime: '2025-01-01T00:49:59Z' }).reason, 'observation-outside-time-limit')
  assert.equal(proposal({ ...b, inspectionTime: '2025-01-01T00:52:01Z' }).reason, 'observation-outside-time-limit')
  for (const inspectionTime of ['2025-01-01T00:50:00Z', '2025-01-01T00:52:00Z']) {
    const p = proposal({ ...b, inspectionTime })
    assert.equal(p.status, 'qualification-proposal'); assert.equal(p.record.referenceTime, at)
    assert.equal(p.binding.existingExactTimeSeamCompatible, false)
    assert.equal(p.record.provenance.observedAt, at); assert.equal(p.record.provenance.binding.inspectionTime, inspectionTime)
  }
  assert.equal(proposal({ ...b, inspectionTime: '2025-01-01T00:49:59.999999999Z' }).reason, 'observation-outside-time-limit')
  assert.match(proposal({ ...b }).binding.distanceMeaning, /approximate.*datum unverified/)
})

test('existing World View intake rejects proposal until separate admission; exact time and row coverage remain gates', () => {
  const p = proposal(base(candidate()))
  assert.equal(intake(p.record).modules.some(module => module.family === 'weather'), false)
  // Explicitly synthetic external admission models the existing contract. This
  // boolean is never emitted by the parser/adapter and is not a launch receipt.
  const syntheticallyAdmitted = { ...p.record, admitted: true }
  const weather = intake(syntheticallyAdmitted).modules.find(module => module.family === 'weather')
  assert.ok(weather); assert.equal(weather.provenance.observedAt, at)
  assert.equal(weather.fields.find(field => field.label === 'Reference time').value, at)
  assert.match(weather.fields.find(field => field.label === 'Temperature').value, /^8 °C/)
  assert.equal(intake(syntheticallyAdmitted, '2025-01-01T00:51:00.000000001Z').modules.some(module => module.family === 'weather'), false)
  assert.equal(intake(syntheticallyAdmitted, at, { ...row, valid_to_utc: at }).modules.some(module => module.family === 'weather'), false)
  assert.equal(intake({ ...syntheticallyAdmitted, subjectId: 'different' }).modules.some(module => module.family === 'weather'), false)
  assert.equal(weatherSourcePermission('noaa-ghcnh-hourly').allowed, false)
})

test('a time-tolerance proposal cannot bypass the existing exact instant intake by retiming', () => {
  const selected = '2025-01-01T00:50:00Z'
  const p = proposal({ ...base(candidate()), scope: 'bounded-station-context', inspectionTime: selected, target, limits })
  assert.equal(p.record.referenceTime, at); assert.equal(p.binding.offsetNanoseconds, '60000000000')
  assert.equal(intake({ ...p.record, admitted: true }, selected).modules.some(module => module.family === 'weather'), false)
  const old = '2024-04-08T18:00:00Z', oldRow = { ...row, valid_from_utc: '2024-04-08T17:00:00Z', valid_to_utc: '2024-04-08T20:00:00Z' }
  assert.equal(intake({ ...p.record, admitted: true }, old, oldRow).modules.some(module => module.family === 'weather'), false)
})

test('adapter displays trace/calm/variable without converting them into dry zero or directional heading', () => {
  const trace = proposal(base(candidate({ precipitation_Measurement_Code: 'T', wind_speed: '0', wind_speed_Measurement_Code: 'C', wind_direction: '000', wind_direction_Measurement_Code: 'C' })))
  assert.match(trace.record.fields.precipitation, /^Trace \(amount unknown\)/); assert.doesNotMatch(trace.record.fields.precipitation, /0 mm|dry zero|mm\/h/)
  assert.match(trace.record.fields.windDirection, /no directional heading/); assert.doesNotMatch(trace.record.fields.windDirection, /0°/)
  assert.match(trace.record.fields.windSpeed, /^0 m\/s \(calm\)/)
  assert.match(proposal(base(candidate())).record.fields.precipitation, /0 mm \(dry zero\)/)
  const variable = proposal(base(candidate({ wind_direction: '000', wind_direction_Measurement_Code: 'V' })))
  assert.match(variable.record.fields.windDirection, /variable; no single directional heading/)
  const rejected = proposal(base(candidate({ temperature_Quality_Code: '7', precipitation: '' })))
  assert.equal('temperature' in rejected.record.fields, false); assert.equal('precipitation' in rejected.record.fields, false)
})

test('invalid, duplicate, source-excluded and admission-mutated candidates cannot adapt', () => {
  assert.equal(proposal().reason, 'qualified-candidate-required')
  assert.equal(proposal(base(candidate({ DATE: '2025-02-29T00:00:00' }))).reason, 'qualified-candidate-required')
  assert.equal(proposal(base({ ...candidate(), publicationAdmitted: true })).reason, 'qualified-candidate-required')
  assert.equal(proposal({ ...base(candidate()), scope: 'city' }).reason, 'explicit-supported-scope-required')
  const records = [syntheticRow(), syntheticRow()], parsed = parseGhcnhWeatherRecords(records, syntheticOptions(records))
  assert.equal(proposal(base(parsed.candidates[0])).reason, 'qualified-candidate-required')
})

test('parser and adapter perform no acquisition or publication and preserve caller objects', async () => {
  const previous = globalThis.fetch; let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('unexpected network request') }
  try {
    const c = candidate(), before = JSON.stringify(c), callerTarget = { ...target }, callerLimits = { ...limits }
    const p = proposal({ ...base(c), scope: 'bounded-station-context', target: callerTarget, limits: callerLimits })
    assert.equal(calls, 0); assert.equal(p.record.admitted, false); assert.equal(JSON.stringify(c), before)
    assert.equal(Object.isFrozen(callerTarget), false); assert.equal(Object.isFrozen(callerLimits), false)
    assert.equal(Object.isFrozen(p.record.provenance.variables.precipitation.flags), true)
    assert.throws(() => { p.record.referenceTime = '2026-10-02T00:00:00Z' }, TypeError)
  } finally { globalThis.fetch = previous }
})
