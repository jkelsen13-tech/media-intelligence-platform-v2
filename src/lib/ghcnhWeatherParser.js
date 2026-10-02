import { inspectionInstantMilliseconds, inspectionInstantNanoseconds } from './inspectionTime.js'

// Offline interpretation only. These candidates do not authorize acquisition,
// source use, publication, or a CURRENT/event-time weather claim.
export const GHCNH_WEATHER_POLICY = 'ghcnh-343-qualification-v1'
export const GHCNH_UTC_FORMAT_BINDING = Object.freeze({
  version: '1.1.0', dateBasis: 'UTC', section: 'III(A)',
  documentationUrl: 'https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh_DOCUMENTATION.pdf',
  documentationSha256: 'df5694efdc2d498f006a343165bae65701d14809174b9bed660149bd4fe591b7',
})
const VARIABLES = Object.freeze(['temperature', 'wind_speed', 'wind_direction', 'precipitation'])
const ATTRIBUTES = Object.freeze(['Measurement_Code', 'Quality_Code', 'Report_Type', 'Source_Code', 'Source_Station_ID'])
const PERIODS = Object.freeze(Object.fromEntries([
  ...[3, 6, 9, 12, 15, 18, 21, 24].map(hours => [`precipitation_${hours}_hour`, hours * 60]),
  ['precipitation_5_minute', 5], ['precipitation_15_minute', 15],
]))
const STATION_FIELDS = Object.freeze(['STATION', 'Station_name', 'DATE', 'LATITUDE', 'LONGITUDE', 'ELEVATION'])
const fields = [...STATION_FIELDS, ...[...VARIABLES, ...Object.keys(PERIODS)].flatMap(variable => [variable, ...ATTRIBUTES.map(attribute => `${variable}_${attribute}`)])]
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null
const rawScalar = value => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? value : null
const rawField = (row, name) => own(row, name) ? rawScalar(row[name]) : null
const code = (row, name) => text(String(rawField(row, name) ?? ''))
const numeric = value => (typeof value === 'number' || typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function formatBound(format) {
  return format?.version === GHCNH_UTC_FORMAT_BINDING.version && format?.dateBasis === 'UTC'
    && format?.section === 'III(A)' && format?.documentationSha256 === GHCNH_UTC_FORMAT_BINDING.documentationSha256
}
function observationTime(value, format) {
  if (!formatBound(format) || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z?$/.test(value)) return null
  // DATE is zoneless in the qualified native/API bytes. The explicit format
  // binding, not a missing suffix, establishes UTC (Section III(A)).
  const instant = value.endsWith('Z') ? value : `${value}Z`
  return inspectionInstantMilliseconds(instant) === null ? null : instant
}
function provenance(evidence, format) {
  const instant = value => inspectionInstantMilliseconds(value) === null ? null : value
  return {
    provider: 'NOAA NCEI', dataset: 'GHCNh', formatVersion: formatBound(format) ? format.version : null,
    policy: GHCNH_WEATHER_POLICY, timestampBasis: formatBound(format) ? 'documented UTC' : 'unbound',
    formatBinding: formatBound(format) ? { ...GHCNH_UTC_FORMAT_BINDING } : null,
    inputSha256: /^[a-f0-9]{64}$/.test(evidence?.sha256 ?? '') ? evidence.sha256 : null,
    inputByteLength: Number.isSafeInteger(evidence?.byteLength) && evidence.byteLength >= 0 ? evidence.byteLength : null,
    inputHashVerification: 'requires external byte verifier', sourceUrl: text(evidence?.sourceUrl),
    representation: text(evidence?.representation), retrievedAt: instant(evidence?.retrievedAt),
    // A server response date and a later evidence-bundle timestamp are not the
    // exact client retrieval time. Preserve all three independently.
    serverResponseDate: text(evidence?.serverResponseDate), evidenceRecordedAt: instant(evidence?.evidenceRecordedAt),
    sourceUseAdmission: 'not granted by parser', observationType: 'station-observed',
  }
}
function station(row) {
  const latitude = numeric(rawField(row, 'LATITUDE')), longitude = numeric(rawField(row, 'LONGITUDE'))
  const nativeElevation = rawField(row, 'ELEVATION'), elevation = numeric(nativeElevation)
  return {
    id: code(row, 'STATION'), name: code(row, 'Station_name'),
    latitude, longitude,
    positionValid: latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180,
    positionMeaning: 'approximate station point; not a citywide or neighborhood measurement', horizontalDatum: 'unverified',
    elevation: { value: elevation === -999.9 ? null : elevation, nativeValue: nativeElevation, unit: 'm', datum: 'unverified',
      meaning: 'station metadata elevation; not ellipsoid or terrain height', missing: nativeElevation === null || nativeElevation === '' || elevation === -999.9 },
  }
}
function variable(row, name, observedAt) {
  const raw = rawField(row, name), flags = Object.fromEntries(ATTRIBUTES.map(attribute => [attribute, rawField(row, `${name}_${attribute}`)]))
  const missing = !own(row, name) || row[name] == null || typeof row[name] === 'string' && !row[name].trim()
  const result = { name, status: 'unavailable', reason: null, value: null, unit: name === 'temperature' ? '°C' : name === 'wind_speed' ? 'm/s' : name === 'wind_direction' ? 'degrees from true north' : 'mm',
    nativeValue: raw, presence: !own(row, name) ? 'absent' : missing ? 'blank' : 'present', flags,
    sourceCode: code(row, `${name}_Source_Code`), sourceStationId: code(row, `${name}_Source_Station_ID`), observedAt,
    semantics: null, period: null,
  }
  const unavailable = reason => ({ ...result, reason })
  if (missing) return unavailable('missing')
  if (result.sourceCode !== '343') return unavailable('source-outside-qualified-scope')
  if (!result.sourceStationId) return unavailable('source-station-id-missing')
  const quality = code(row, `${name}_Quality_Code`), measurement = code(row, `${name}_Measurement_Code`)
  if (!['1', '5'].includes(quality)) return unavailable(quality === '7' ? 'qc-erroneous-ncei-origin' : 'qc-outside-conservative-policy')
  // This first lane covers the source 343 METAR/SPECI sample. Other report
  // families, 5-minute QC rules, and accumulated-period variables remain raw.
  if (PERIODS[name]) return { ...unavailable('accumulation-variable-outside-qualified-scope'), period: { nominalMinutes: PERIODS[name], start: null, end: null, aggregation: 'not-summed' } }
  if (!['FM15', 'FM16'].includes(code(row, `${name}_Report_Type`))) return unavailable('report-type-outside-qualified-scope')
  const value = numeric(raw)
  if (value === null) return unavailable('invalid-number')
  // Do not interpret another source's numeric sentinels as source 343 missing,
  // zero or a valid observation. Native blanks alone establish missing here.
  if (['-9999', '-999.9'].includes(String(raw).trim())) return unavailable('unsupported-source-specific-sentinel')
  const available = (semantics, number = value, extra = {}) => ({ ...result, status: 'available', value: number, semantics, ...extra })
  if (name === 'temperature') return measurement === null ? available('approximately 2 m AGL dry-bulb temperature') : unavailable('unsupported-measurement-code')
  if (name === 'precipitation') {
    if (value < 0) return unavailable('negative-precipitation')
    if (measurement !== null && !['T', '2'].includes(measurement)) return unavailable('unsupported-measurement-code')
    if (measurement !== null && value !== 0) return unavailable('inconsistent-trace-value')
    const trace = measurement === 'T' || measurement === '2'
    return available(trace ? 'trace' : value === 0 ? 'dry-zero' : 'positive-accumulation', trace ? null : value, {
      trace, amountKnown: !trace,
      period: { kind: 'nominal-report-accumulation', nominalMinutes: 60, reportTime: observedAt,
        reportType: code(row, `${name}_Report_Type`), start: null, end: null, aggregation: 'not-summed',
        meaning: 'report accumulation; interim reports may overlap; exact interval unknown; not a rate' },
    })
  }
  if (!['N', 'C', 'V', 'H', 'R', 'T'].includes(measurement)) return unavailable('unsupported-measurement-code')
  if (name === 'wind_speed') {
    if (value < 0) return unavailable('negative-wind-speed')
    if (measurement === 'C' && value !== 0) return unavailable('inconsistent-calm-value')
    // V describes variable wind, not precipitation trace or a missing speed.
    return available(measurement === 'C' || value === 0 ? 'calm' : measurement === 'V' ? 'variable-wind-speed' : 'wind-speed', value,
      { averagingMinutes: ({ H: 5, R: 60, T: 180 })[measurement] ?? null })
  }
  if (value < 0 || value > 360 || !Number.isInteger(value)) return unavailable('invalid-wind-direction')
  if (measurement === 'C') return value === 0 ? available('calm; no directional heading', null) : unavailable('inconsistent-calm-value')
  if (measurement === 'V') return available('variable; no single directional heading', null)
  if (['H', 'R', 'T'].includes(measurement)) return unavailable('speed-averaging-code-on-direction')
  // Native 000 is calm; 360 is north. Preserve the distinction even with N.
  return value === 0 ? available('calm; no directional heading', null) : available('direction from true north')
}

export function parseGhcnhWeatherRecords(records, { format = null, evidence = null, maxRecords = 10000 } = {}) {
  const fail = reason => freeze({ status: 'unavailable', reason, policy: GHCNH_WEATHER_POLICY, candidates: [], issues: [], publicationAdmitted: false })
  if (!formatBound(format)) return fail('documented-format-binding-required')
  if (!Array.isArray(records) || !Number.isSafeInteger(maxRecords) || maxRecords < 1 || records.length > maxRecords) return fail('invalid-or-unbounded-record-set')
  const receipt = provenance(evidence, format), identities = new Map(), issues = []
  if (!receipt.inputSha256 || receipt.inputByteLength === null || !receipt.sourceUrl || !receipt.representation) return fail('input-provenance-required')
  const candidates = records.map((input, index) => {
    const row = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
    const observedAt = observationTime(rawField(row, 'DATE'), format), location = station(row)
    const identity = observedAt && location.id ? `${location.id}:${inspectionInstantNanoseconds(observedAt)}` : null
    if (identity) identities.set(identity, [...(identities.get(identity) ?? []), index])
    const values = Object.fromEntries([...VARIABLES, ...Object.keys(PERIODS)].map(name => [name, variable(row, name, observedAt)]))
    if (values.wind_direction.status === 'available' && values.wind_direction.semantics === 'calm; no directional heading'
      && values.wind_speed.status === 'available' && values.wind_speed.value > 0
      && values.wind_direction.sourceStationId === values.wind_speed.sourceStationId) {
      values.wind_direction = { ...values.wind_direction, status: 'unavailable', reason: 'calm-direction-conflicts-with-positive-speed', value: null, semantics: null }
    }
    if (values.wind_direction.status === 'available' && values.wind_direction.value !== null
      && values.wind_speed.status === 'available' && values.wind_speed.value === 0
      && values.wind_direction.sourceStationId === values.wind_speed.sourceStationId) {
      values.wind_direction = { ...values.wind_direction, status: 'unavailable', reason: 'zero-speed-conflicts-with-directional-heading', value: null, semantics: null }
    }
    const reason = !observedAt ? 'invalid-observation-time' : !location.id || !location.name || !location.positionValid ? 'invalid-station-metadata' : null
    if (reason) issues.push({ index, reason })
    return { id: identity, index, qualification: reason ? 'unavailable' : Object.values(values).some(value => value.status === 'available') ? 'candidate' : 'unavailable', reason,
      publicationAdmitted: false, currentContext: false, observedAt, nativeDate: rawField(row, 'DATE'), station: location, variables: values,
      raw: Object.fromEntries(fields.filter(name => own(row, name)).map(name => [name, rawField(row, name)])), provenance: { ...receipt },
    }
  })
  for (const indices of identities.values()) if (indices.length > 1) for (const index of indices) {
    candidates[index].qualification = 'unavailable'; candidates[index].reason = 'duplicate-station-instant'
    issues.push({ index, reason: 'duplicate-station-instant' })
  }
  return freeze({ status: 'parsed', policy: GHCNH_WEATHER_POLICY, candidates, issues, publicationAdmitted: false })
}

export function parseGhcnhWeatherJson(payload, options) {
  if (typeof payload === 'string' && payload.length > 16 * 1024 * 1024) return freeze({ status: 'unavailable', reason: 'payload-outside-bounded-parser', candidates: [], issues: [], publicationAdmitted: false })
  try { return parseGhcnhWeatherRecords(typeof payload === 'string' ? JSON.parse(payload) : payload, options) }
  catch { return freeze({ status: 'unavailable', reason: 'invalid-json', candidates: [], issues: [], publicationAdmitted: false }) }
}

export function parseGhcnhWeatherPsv(payload, { allowTruncatedFinalRow = false, ...options } = {}) {
  const fail = reason => freeze({ status: 'unavailable', reason, candidates: [], issues: [], publicationAdmitted: false })
  if (typeof payload !== 'string') return fail('invalid-psv')
  if (payload.length > 16 * 1024 * 1024) return fail('payload-outside-bounded-parser')
  const lines = payload.replace(/\r\n/g, '\n').split('\n'), header = lines.shift()?.split('|') ?? []
  if (header.length < STATION_FIELDS.length || new Set(header).size !== header.length || !STATION_FIELDS.every(name => header.includes(name))) return fail('invalid-psv-header')
  if (lines.at(-1) === '') lines.pop()
  if (lines.length > (options.maxRecords ?? 10000) + (allowTruncatedFinalRow ? 1 : 0)) return fail('invalid-or-unbounded-record-set')
  const rows = [], issues = []
  for (let index = 0; index < lines.length; index++) {
    const values = lines[index].split('|')
    if (values.length !== header.length) {
      if (allowTruncatedFinalRow && index === lines.length - 1 && !payload.endsWith('\n') && values.length < header.length) {
        issues.push({ index, reason: 'discarded-truncated-final-row' }); continue
      }
      return fail('psv-column-count-mismatch')
    }
    rows.push(Object.fromEntries(header.map((name, column) => [name, values[column]])))
  }
  const parsed = parseGhcnhWeatherRecords(rows, options)
  return freeze({ ...parsed, columnCount: header.length, issues: [...parsed.issues, ...issues] })
}
