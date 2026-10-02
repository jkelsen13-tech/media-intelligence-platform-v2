import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGhcnhWeatherRecords as parse, parseGhcnhWeatherJson, parseGhcnhWeatherPsv, GHCNH_UTC_FORMAT_BINDING } from '../src/lib/ghcnhWeatherParser.js'
import { syntheticRow as row, syntheticOptions as options } from './ghcnhWeatherSyntheticFixture.mjs'

const candidate = overrides => { const records = [row(overrides)]; return parse(records, options(records)).candidates[0] }

test('synthetic native values retain declared units, source station, flags, datums and no admission', () => {
  const input = row(), records = [input], before = JSON.stringify(input), c = parse(records, options(records)).candidates[0]
  assert.equal(c.qualification, 'candidate'); assert.equal(c.variables.temperature.value, 8); assert.equal(c.variables.temperature.unit, '°C')
  assert.equal(c.variables.wind_speed.value, 2.1); assert.equal(c.variables.wind_speed.unit, 'm/s')
  assert.equal(c.variables.wind_direction.value, 360); assert.equal(c.variables.precipitation.value, 0)
  assert.equal(c.variables.temperature.flags.Quality_Code, '5'); assert.equal(c.variables.temperature.sourceStationId, 'SYNTHETIC-SOURCE')
  assert.equal(c.variables.temperature.nativeValue, '8.0'); assert.equal(c.station.horizontalDatum, 'unverified')
  assert.equal(c.station.elevation.value, 260); assert.equal(c.station.elevation.datum, 'unverified')
  assert.match(c.station.elevation.meaning, /not ellipsoid or terrain/); assert.match(c.station.positionMeaning, /not a citywide/)
  assert.equal(c.publicationAdmitted, false); assert.equal(c.currentContext, false)
  assert.equal(c.provenance.inputHashVerification, 'requires external byte verifier')
  assert.equal(JSON.stringify(input), before); assert.equal(Object.isFrozen(input), false)
  assert.equal(Object.isFrozen(c.variables.temperature.flags), true); assert.throws(() => { c.station.latitude = 0 }, TypeError)
})

test('zoneless DATE requires exact documented UTC format binding; no local-time inference', () => {
  const records = [row()]
  assert.equal(parse(records).reason, 'documented-format-binding-required')
  for (const mismatch of [{ version: '1' }, { dateBasis: 'local' }, { section: 'unknown' }, { documentationSha256: '0'.repeat(64) }]) {
    assert.equal(parse(records, { ...options(records), format: { ...GHCNH_UTC_FORMAT_BINDING, ...mismatch } }).reason, 'documented-format-binding-required')
  }
  const c = candidate(); assert.equal(c.nativeDate, '2025-01-01T00:51:00'); assert.equal(c.observedAt, '2025-01-01T00:51:00Z')
  assert.equal(c.provenance.formatVersion, '1.1.0'); assert.equal(c.provenance.timestampBasis, 'documented UTC')
  assert.equal(candidate({ DATE: '2025-01-01T00:51:00.123456789' }).observedAt, '2025-01-01T00:51:00.123456789Z')
  for (const DATE of ['2025-02-29T00:00:00', '2025-01-01T24:00:00', '2025-01-01', '2025-01-01T00:51:00-05:00', '2025-01-01T00:51:60', '']) {
    assert.equal(candidate({ DATE }).qualification, 'unavailable', DATE)
    assert.equal(candidate({ DATE }).observedAt, null, DATE)
  }
})

test('provenance distinguishes exact retrieved time, server date and evidence recorded time', () => {
  const records = [row()], opts = options(records)
  opts.evidence.serverResponseDate = 'Fri, 02 Oct 2026 15:22:22 GMT'; opts.evidence.evidenceRecordedAt = '2026-10-02T15:31:03.325705+00:00'
  const c = parse(records, opts).candidates[0]
  assert.equal(c.provenance.retrievedAt, null); assert.equal(c.provenance.serverResponseDate, opts.evidence.serverResponseDate)
  assert.equal(c.provenance.evidenceRecordedAt, opts.evidence.evidenceRecordedAt)
  opts.evidence.retrievedAt = '2026-10-02T15:22:22.987654Z'
  assert.equal(parse(records, opts).candidates[0].provenance.retrievedAt, opts.evidence.retrievedAt)
  for (const field of ['sha256', 'byteLength', 'sourceUrl', 'representation']) {
    const invalid = options(records); delete invalid.evidence[field]
    assert.equal(parse(records, invalid).reason, 'input-provenance-required', field)
  }
})

test('source 343 conservative QC policy is independent per variable; source 223 is not admitted', () => {
  const c = candidate({ temperature_Quality_Code: '7', wind_speed_Source_Code: '223', wind_speed_Quality_Code: '1' })
  assert.equal(c.variables.temperature.status, 'unavailable'); assert.equal(c.variables.temperature.reason, 'qc-erroneous-ncei-origin')
  assert.equal(c.variables.temperature.nativeValue, '8.0'); assert.equal(c.variables.temperature.flags.Quality_Code, '7')
  assert.equal(c.variables.wind_speed.reason, 'source-outside-qualified-scope'); assert.equal(c.variables.wind_direction.status, 'available')
  assert.equal(candidate({ temperature_Quality_Code: '1' }).variables.temperature.status, 'available')
  for (const quality of ['', '0', '2', '3', '4', '6', '9', 'A', 'U', 'P', 'I', 'M', 'R', 'z', 'a']) {
    assert.equal(candidate({ temperature_Quality_Code: quality }).variables.temperature.status, 'unavailable', quality)
  }
  assert.equal(candidate({ temperature_Source_Code: '223', temperature_Quality_Code: '5' }).variables.temperature.reason, 'source-outside-qualified-scope')
  assert.equal(candidate({ temperature_Source_Station_ID: '' }).variables.temperature.reason, 'source-station-id-missing')
  assert.equal(candidate({ temperature_Report_Type: 'FM12' }).variables.temperature.reason, 'report-type-outside-qualified-scope')
})

test('trace, explicit dry zero, positive accumulation and absent/blank remain different', () => {
  for (const measurement of ['T', '2']) {
    const p = candidate({ precipitation_Measurement_Code: measurement }).variables.precipitation
    assert.equal(p.status, 'available'); assert.equal(p.value, null); assert.equal(p.nativeValue, '0.0')
    assert.equal(p.trace, true); assert.equal(p.semantics, 'trace'); assert.equal(p.amountKnown, false)
  }
  const dry = candidate().variables.precipitation
  assert.equal(dry.value, 0); assert.equal(dry.trace, false); assert.equal(dry.semantics, 'dry-zero'); assert.equal(dry.amountKnown, true)
  const positive = candidate({ precipitation: '2.0' }).variables.precipitation
  assert.equal(positive.value, 2); assert.equal(positive.semantics, 'positive-accumulation')
  const r = row(); delete r.precipitation; const absent = parse([r], options([r])).candidates[0].variables.precipitation
  assert.equal(absent.reason, 'missing'); assert.equal(absent.presence, 'absent'); assert.equal(absent.value, null)
  for (const missing of ['', ' ', null]) {
    const p = candidate({ precipitation: missing }).variables.precipitation
    assert.equal(p.reason, 'missing'); assert.equal(p.presence, 'blank'); assert.equal(p.value, null)
  }
  assert.equal(candidate({ precipitation: '2', precipitation_Measurement_Code: 'T' }).variables.precipitation.reason, 'inconsistent-trace-value')
})

test('nominal report accumulation has no fabricated civil-hour interval, rate or summed interim reports', () => {
  const records = [row({ DATE: '2025-01-01T00:51:00', precipitation: '2.0' }), row({ DATE: '2025-01-01T01:15:00', precipitation: '3.0', precipitation_Report_Type: 'FM16' }),
    row({ DATE: '2025-01-01T01:51:00', precipitation: '4.0' })]
  const result = parse(records, options(records))
  assert.equal(result.candidates.length, 3); assert.equal('totalPrecipitation' in result, false)
  assert.deepEqual(result.candidates.map(c => c.variables.precipitation.value), [2, 3, 4])
  for (const c of result.candidates) {
    const p = c.variables.precipitation.period
    assert.equal(p.start, null); assert.equal(p.end, null); assert.equal(p.nominalMinutes, 60)
    assert.equal(p.reportTime, c.observedAt); assert.equal(p.aggregation, 'not-summed'); assert.match(p.meaning, /not a rate/)
  }
})

test('source-specific sentinel, assumed-zero, incomplete and accumulation flags fail closed', () => {
  for (const value of ['-9999', '-999.9']) {
    assert.equal(candidate({ precipitation: value }).variables.precipitation.reason, 'unsupported-source-specific-sentinel')
    assert.equal(candidate({ temperature: value }).variables.temperature.reason, 'unsupported-source-specific-sentinel')
  }
  for (const measurement of ['Z', 'g', 'E', '1', '3', '4', '5', '6', '7', '8', 'I', 'J', '06']) {
    const p = candidate({ precipitation_Measurement_Code: measurement }).variables.precipitation
    assert.equal(p.status, 'unavailable'); assert.equal(p.reason, 'unsupported-measurement-code'); assert.equal(p.flags.Measurement_Code, measurement)
  }
  assert.equal(candidate({ precipitation_Source_Code: '382', precipitation: '-9999', precipitation_Measurement_Code: 'Z' }).variables.precipitation.reason, 'source-outside-qualified-scope')
  assert.equal(candidate({ precipitation: '-0.1' }).variables.precipitation.reason, 'negative-precipitation')
  for (const value of ['NaN', 'Infinity', '1 mm', '0x10', true, {}]) assert.equal(candidate({ precipitation: value }).variables.precipitation.reason, 'invalid-number')
})

test('unqualified explicit duration variables preserve raw flags and do not fill base precipitation', () => {
  const c = candidate({ precipitation: '', precipitation_3_hour: '2.1', precipitation_3_hour_Source_Code: '343', precipitation_3_hour_Source_Station_ID: 'SYNTHETIC-SOURCE',
    precipitation_3_hour_Quality_Code: '5', precipitation_3_hour_Report_Type: 'FM12', precipitation_3_hour_Measurement_Code: '' })
  assert.equal(c.variables.precipitation.reason, 'missing')
  assert.equal(c.variables.precipitation_3_hour.reason, 'accumulation-variable-outside-qualified-scope')
  assert.equal(c.variables.precipitation_3_hour.nativeValue, '2.1'); assert.equal(c.variables.precipitation_3_hour.period.nominalMinutes, 180)
  assert.equal(c.variables.precipitation_3_hour.period.start, null); assert.equal(c.variables.precipitation_3_hour.period.aggregation, 'not-summed')
  const five = candidate({ precipitation_5_minute: '0.0', precipitation_5_minute_Source_Code: '343', precipitation_5_minute_Source_Station_ID: 'SYNTHETIC-SOURCE', precipitation_5_minute_Measurement_Code: 'T' })
  assert.equal(five.variables.precipitation_5_minute.status, 'unavailable'); assert.equal(five.variables.precipitation_5_minute.flags.Measurement_Code, 'T')
})

test('synthetic calm and variable wind have no fabricated heading; 360 remains north', () => {
  const calm = candidate({ wind_speed: '0.0', wind_speed_Measurement_Code: 'C', wind_direction: '000', wind_direction_Measurement_Code: 'C' })
  assert.equal(calm.variables.wind_speed.value, 0); assert.equal(calm.variables.wind_speed.semantics, 'calm')
  assert.equal(calm.variables.wind_direction.value, null); assert.match(calm.variables.wind_direction.semantics, /no directional heading/)
  const variable = candidate({ wind_direction: '000', wind_direction_Measurement_Code: 'V', wind_speed_Measurement_Code: 'V' })
  assert.equal(variable.variables.wind_direction.value, null); assert.match(variable.variables.wind_direction.semantics, /variable/)
  assert.equal(variable.variables.wind_speed.value, 2.1); assert.equal(variable.variables.wind_speed.semantics, 'variable-wind-speed')
  assert.equal(candidate().variables.wind_direction.value, 360)
  const normalCalm = candidate({ wind_speed: '0', wind_direction: '000' })
  assert.equal(normalCalm.variables.wind_direction.value, null); assert.match(normalCalm.variables.wind_direction.semantics, /calm/)
  assert.equal(candidate({ wind_direction: '000' }).variables.wind_direction.reason, 'calm-direction-conflicts-with-positive-speed')
  assert.equal(candidate({ wind_speed: '0' }).variables.wind_direction.reason, 'zero-speed-conflicts-with-directional-heading')
  assert.equal(candidate({ wind_speed_Measurement_Code: 'C' }).variables.wind_speed.reason, 'inconsistent-calm-value')
  assert.equal(candidate({ wind_direction_Measurement_Code: 'C' }).variables.wind_direction.reason, 'inconsistent-calm-value')
})

test('wind averaging codes are not precipitation trace; unsupported wind codes and ranges stay unavailable', () => {
  for (const [measurement, minutes] of [['H', 5], ['R', 60], ['T', 180]]) {
    const c = candidate({ wind_speed_Measurement_Code: measurement, wind_direction_Measurement_Code: measurement })
    assert.equal(c.variables.wind_speed.averagingMinutes, minutes); assert.equal(c.variables.wind_speed.value, 2.1)
    assert.equal(c.variables.wind_direction.reason, 'speed-averaging-code-on-direction')
    assert.equal('trace' in c.variables.wind_speed, false)
  }
  for (const measurement of ['', 'A', 'B', 'Q', '2', 'Z']) assert.equal(candidate({ wind_speed_Measurement_Code: measurement }).variables.wind_speed.reason, 'unsupported-measurement-code')
  assert.equal(candidate({ wind_speed: '-1' }).variables.wind_speed.reason, 'negative-wind-speed')
  for (const value of ['361', '-1', '1.5', '999']) assert.equal(candidate({ wind_direction: value }).variables.wind_direction.reason, 'invalid-wind-direction')
  assert.equal(candidate({ wind_direction_Measurement_Code: 'V', wind_direction_Quality_Code: 'z' }).variables.wind_direction.status, 'unavailable')
})

test('station elevation missing sentinel is scoped to metadata; invalid positions cannot qualify', () => {
  const c = candidate({ ELEVATION: '-999.9' })
  assert.equal(c.station.elevation.value, null); assert.equal(c.station.elevation.nativeValue, '-999.9'); assert.equal(c.station.elevation.missing, true)
  for (const overrides of [{ LATITUDE: '91' }, { LONGITUDE: '-181' }, { LATITUDE: '' }, { STATION: '' }, { Station_name: '' }]) {
    assert.equal(candidate(overrides).qualification, 'unavailable'); assert.equal(candidate(overrides).reason, 'invalid-station-metadata')
  }
})

test('duplicate station instants fail closed even when native time strings differ', () => {
  const records = [row(), row({ DATE: '2025-01-01T00:51:00Z', temperature: '9.0' }), row({ STATION: 'OTHER-SYNTHETIC' })]
  const result = parse(records, options(records))
  assert.deepEqual(result.candidates.map(c => c.qualification), ['unavailable', 'unavailable', 'candidate'])
  assert.deepEqual(result.issues.map(i => i.reason), ['duplicate-station-instant', 'duplicate-station-instant'])
  assert.equal(result.candidates[0].reason, 'duplicate-station-instant'); assert.equal(result.candidates[0].variables.temperature.nativeValue, '8.0')
})

test('JSON and PSV reject malformed or unbounded input; only explicit range truncation is discarded', () => {
  const records = [row()], opts = options(records), header = Object.keys(records[0]), line = Object.values(records[0]).join('|')
  const psv = `${header.join('|')}\n${line}\n`
  assert.equal(parseGhcnhWeatherJson('{', opts).reason, 'invalid-json')
  assert.equal(parseGhcnhWeatherJson('{}', opts).reason, 'invalid-or-unbounded-record-set')
  assert.equal(parse(records, { ...opts, maxRecords: 0 }).reason, 'invalid-or-unbounded-record-set')
  assert.equal(parse([row(), row()], { ...opts, maxRecords: 1 }).reason, 'invalid-or-unbounded-record-set')
  assert.equal(parseGhcnhWeatherPsv(psv, opts).candidates[0].variables.temperature.value, 8)
  assert.equal(parseGhcnhWeatherPsv(psv.replaceAll('\n', '\r\n'), opts).candidates.length, 1)
  assert.equal(parseGhcnhWeatherPsv(`${psv}partial|row`, opts).reason, 'psv-column-count-mismatch')
  const range = parseGhcnhWeatherPsv(`${psv}partial|row`, { ...opts, allowTruncatedFinalRow: true })
  assert.equal(range.candidates.length, 1); assert.equal(range.issues[0].reason, 'discarded-truncated-final-row')
  assert.equal(parseGhcnhWeatherPsv(`${psv}partial|row\n`, { ...opts, allowTruncatedFinalRow: true }).reason, 'psv-column-count-mismatch')
  assert.equal(parseGhcnhWeatherPsv(`${header.join('|')}|DATE\n${line}|2025-01-01T00:51:00\n`, opts).reason, 'invalid-psv-header')
  assert.equal(parseGhcnhWeatherPsv('other|headers\n1|2\n', opts).reason, 'invalid-psv-header')
})
