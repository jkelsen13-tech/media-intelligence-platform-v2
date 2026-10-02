import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGhcnhWeatherJson, parseGhcnhWeatherPsv, GHCNH_UTC_FORMAT_BINDING, GHCNH_WEATHER_POLICY } from '../src/lib/ghcnhWeatherParser.js'
import { ghcnhWeatherContextProposal } from '../src/lib/ghcnhWeatherContext.js'
import { weatherSourcePermission } from '../src/lib/weatherSourceRights.js'

const MANIFEST = { bytes: 19523, sha256: '18224394cd125137317142f1f699d40e2239ff032374a845e9e04cd594e068c2' }
const PINNED = {
  'cleveland-qualified-subset.json': { bytes: 53689, sha256: '4a32a5fc4283ca9c4f8f28f52ee2ca271e6ac0c0f19bbb5df686b32aea5f2129' },
  'cleveland-day-from-range.psv': { bytes: 77806, sha256: '6e402ab7504c6fa4646743c85461447c4f2a86a80cb2bb6b47005c39e441798b' },
  'GHCNh_USW00014820_2025.range.psv': { bytes: 131072, sha256: 'b1da491eff9b53b7b184049224b2a8e733b9bf99671cac6ba3c7e667b1078ce1' },
  'ghcnh_DOCUMENTATION.pdf': { bytes: 423879, sha256: GHCNH_UTC_FORMAT_BINDING.documentationSha256 },
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const variables = ['temperature', 'wind_speed', 'wind_direction', 'precipitation']
const scalar = value => value == null || String(value).trim() === '' ? null : String(value)
const coreFields = ['STATION', 'Station_name', 'DATE', 'LATITUDE', 'LONGITUDE', 'ELEVATION',
  ...variables.flatMap(variable => [variable, ...['Measurement_Code', 'Quality_Code', 'Report_Type', 'Source_Code', 'Source_Station_ID'].map(attribute => `${variable}_${attribute}`)])]
const count = (rows, variable, predicate) => rows.filter(row => predicate(row.variables[variable])).length

// No transport: use the separately materialized, owner-provided Library bundle.
// CI synthetic tests do not count as this genuine-byte qualification.
export async function qualifyGhcnhWeatherDirectory(directory) {
  const manifestBytes = await readFile(resolve(directory, 'manifest.json'))
  assert.equal(manifestBytes.length, MANIFEST.bytes, 'manifest byte count'); assert.equal(sha256(manifestBytes), MANIFEST.sha256, 'manifest hash')
  const manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.files.length, 28); assert.equal(new Set(manifest.files.map(file => file.name)).size, 28)
  const files = new Map(await Promise.all(manifest.files.map(async file => {
    assert.equal(file.name, basename(file.name), 'member must stay within supplied directory')
    const bytes = await readFile(resolve(directory, file.name))
    assert.equal(bytes.length, file.bytes, `${file.name} byte count`); assert.equal(sha256(bytes), file.sha256, `${file.name} hash`)
    if (PINNED[file.name]) assert.deepEqual({ bytes: bytes.length, sha256: sha256(bytes) }, PINNED[file.name], `${file.name} pinned identity`)
    return [file.name, bytes]
  })))
  for (const file of Object.keys(PINNED)) assert.ok(files.has(file), `${file} required`)
  const content = name => files.get(name).toString('utf8')
  const source = name => manifest.files.find(file => file.name === name).source_url
  const serverDate = /^Date:\s*(.+)$/mi.exec(content('cleveland-qualified-subset.headers'))?.[1].trim() ?? null
  const options = name => ({ format: GHCNH_UTC_FORMAT_BINDING, evidence: {
    sha256: PINNED[name].sha256, byteLength: PINNED[name].bytes,
    sourceUrl: source(name) ?? source('GHCNh_USW00014820_2025.range.psv'),
    representation: name.endsWith('json') ? 'explicit 30-field API JSON' : name.includes('day-from-range') ? 'local day subset of native 329-column PSV range' : 'partial annual native 329-column PSV range',
    retrievedAt: null, serverResponseDate: name.endsWith('json') ? serverDate : null, evidenceRecordedAt: manifest.generated_at_utc,
  } })
  assert.equal(content('cleveland-qualified-subset.url'), source('cleveland-qualified-subset.json'))
  assert.match(content('ghcnh_DOCUMENTATION.txt'), /Version 1\.1\.0 Updated March 10, 2026/)
  assert.match(content('ghcnh_DOCUMENTATION.txt'), /Coordinated Universal Time \(UTC\)/)
  assert.match(content('ghcnh-source-list.txt'), /343 Open Access/)
  const api = parseGhcnhWeatherJson(content('cleveland-qualified-subset.json'), options('cleveland-qualified-subset.json'))
  const native = parseGhcnhWeatherPsv(content('cleveland-day-from-range.psv'), options('cleveland-day-from-range.psv'))
  const range = parseGhcnhWeatherPsv(content('GHCNh_USW00014820_2025.range.psv'), { ...options('GHCNh_USW00014820_2025.range.psv'), allowTruncatedFinalRow: true })
  for (const result of [api, native, range]) assert.equal(result.status, 'parsed')
  assert.equal(api.candidates.length, 69); assert.equal(native.candidates.length, 69); assert.equal(native.columnCount, 329)
  assert.equal(range.candidates.length, 125); assert.equal(range.columnCount, 329)
  assert.deepEqual(range.issues, [{ index: 125, reason: 'discarded-truncated-final-row' }])
  assert.equal(parseGhcnhWeatherPsv(content('GHCNh_USW00014820_2025.range.psv'), options('GHCNh_USW00014820_2025.range.psv')).reason, 'psv-column-count-mismatch')
  assert.equal(range.candidates.at(-1).observedAt, '2025-01-03T10:25:00Z')
  const completeLines = content('GHCNh_USW00014820_2025.range.psv').split('\n'), header = completeLines.shift(), dateColumn = header.split('|').indexOf('DATE')
  const derivedDay = `${header}\n${completeLines.slice(0, 125).filter(line => line.split('|')[dateColumn].startsWith('2025-01-01')).join('\n')}\n`
  assert.equal(sha256(derivedDay), PINNED['cleveland-day-from-range.psv'].sha256, 'exact native local-day derivation')
  let comparedFields = 0
  for (let index = 0; index < api.candidates.length; index++) {
    const a = api.candidates[index], b = native.candidates[index]
    for (const field of coreFields) {
      assert.equal(scalar(a.raw[field]), scalar(b.raw[field]), `API/native row ${index} field ${field}`); comparedFields++
    }
    for (const name of variables) {
      const semantic = value => ({ status: value.status, reason: value.reason, value: value.value, unit: value.unit,
        semantics: value.semantics, period: value.period, sourceCode: value.sourceCode, sourceStationId: value.sourceStationId, observedAt: value.observedAt })
      assert.deepEqual(semantic(a.variables[name]), semantic(b.variables[name]), `API/native semantics ${index} ${name}`)
    }
    assert.equal(a.publicationAdmitted, false); assert.equal(a.currentContext, false)
    assert.equal(a.provenance.retrievedAt, null)
    assert.ok(Object.values(a.variables).every(value => value.status !== 'available' || value.sourceCode === '343'))
    assert.ok(Object.entries(b.variables).filter(([name]) => name.startsWith('precipitation_')).every(([, value]) => value.reason === 'missing'))
  }
  const rows = api.candidates
  assert.equal(rows[0].observedAt, '2025-01-01T00:00:00Z'); assert.equal(rows.at(-1).observedAt, '2025-01-01T23:51:00Z')
  assert.deepEqual(rows[0].station, {
    id: 'USW00014820', name: 'CLEVELAND', latitude: 41.4133, longitude: -81.86, positionValid: true,
    positionMeaning: 'approximate station point; not a citywide or neighborhood measurement', horizontalDatum: 'unverified',
    elevation: { value: 262.1, nativeValue: '262.1', unit: 'm', datum: 'unverified', meaning: 'station metadata elevation; not ellipsoid or terrain height', missing: false },
  })
  const stats = {
    rawRecords: rows.length, qualifiedRecordCandidates: rows.filter(row => row.qualification === 'candidate').length,
    temperature: { available343: count(rows, 'temperature', v => v.status === 'available'), qc7Rejected: count(rows, 'temperature', v => v.reason === 'qc-erroneous-ncei-origin'), source223Excluded: count(rows, 'temperature', v => v.sourceCode === '223') },
    windSpeed: { available343: count(rows, 'wind_speed', v => v.status === 'available'), source223Excluded: count(rows, 'wind_speed', v => v.sourceCode === '223') },
    windDirection: { available343: count(rows, 'wind_direction', v => v.status === 'available'), source223Excluded: count(rows, 'wind_direction', v => v.sourceCode === '223') },
    precipitation: { available343: count(rows, 'precipitation', v => v.status === 'available'), positive: count(rows, 'precipitation', v => v.semantics === 'positive-accumulation'), dryZero: count(rows, 'precipitation', v => v.semantics === 'dry-zero'), trace: count(rows, 'precipitation', v => v.semantics === 'trace'), missing: count(rows, 'precipitation', v => v.reason === 'missing') },
  }
  assert.deepEqual(stats, { rawRecords: 69, qualifiedRecordCandidates: 58,
    temperature: { available343: 43, qc7Rejected: 15, source223Excluded: 11 }, windSpeed: { available343: 58, source223Excluded: 11 },
    windDirection: { available343: 58, source223Excluded: 11 }, precipitation: { available343: 24, positive: 13, dryZero: 5, trace: 6, missing: 45 } })
  const traceTimes = rows.filter(row => row.variables.precipitation.trace).map(row => row.observedAt)
  assert.deepEqual(traceTimes, ['17', '19', '20', '21', '22', '23'].map(hour => `2025-01-01T${hour}:51:00Z`))
  for (const row of rows.filter(row => row.variables.precipitation.status === 'available')) {
    const p = row.variables.precipitation
    assert.equal(p.period.nominalMinutes, 60); assert.equal(p.period.start, null); assert.equal(p.period.end, null)
    assert.equal(p.period.aggregation, 'not-summed'); assert.equal(p.period.reportTime, row.observedAt)
    if (p.trace) { assert.equal(p.value, null); assert.equal(p.nativeValue, '0.0'); assert.equal(p.flags.Measurement_Code, 'T') }
  }
  const sample = rows.find(row => row.observedAt === '2025-01-01T00:51:00Z')
  const proposal = ghcnhWeatherContextProposal({ candidate: sample })
  assert.equal(proposal.record.admitted, false); assert.equal(proposal.binding.scope, 'station-only')
  assert.equal(proposal.binding.limits, null); assert.equal(proposal.record.referenceTime, sample.observedAt)
  assert.equal(weatherSourcePermission('noaa-ghcnh-hourly').allowed, false)
  return {
    status: 'passed', kind: 'genuine local Library byte qualification; no acquisition or publication', runtime: process.version,
    library: { fileId: 'libfile_1910aada38288191858b01715183bbc0', version: 0,
      parentReportedArchiveSha256: 'd542e39070bd062e80240310b43db917ebcf9bc4f693e2bdc1898a1be6fa9e1e',
      archiveVerification: 'parent verified ZIP CRC and 33 members; this verifier pins materialized manifest and its 28 listed files' },
    manifest: MANIFEST, verifiedListedMembers: 28, inputs: PINNED,
    sources: { api: source('cleveland-qualified-subset.json'), nativeRange: source('GHCNh_USW00014820_2025.range.psv'),
      formatDocumentation: source('ghcnh_DOCUMENTATION.pdf'), sourcePolicyCatalog: source('ghcnh-source-list.pdf') },
    format: GHCNH_UTC_FORMAT_BINDING, policy: GHCNH_WEATHER_POLICY,
    statistics: stats, apiNativeCoreFieldComparisons: comparedFields, apiNativeSemanticMismatches: 0,
    range: { completeRows: 125, discardedPartialRows: 1, fullAnnualHashKnown: false, exactDerivedDayHashMatched: true },
    observedWindow: { start: rows[0].observedAt, end: rows.at(-1).observedAt },
    traceTimes, station: proposal.record.provenance.station,
    timeReceipt: { exactRetrievedAt: null, serverResponseDate: serverDate, evidenceRecordedAt: manifest.generated_at_utc },
    publicationAdmitted: false, currentWeatherAcquired: false, forecastAcquired: false,
    pending: ['source-rights/admission review', 'actual subject station relevance and explicit distance/time limits or station-only scope',
      'exact event-time and row-validity binding', 'current observation/forecast acquisition', 'genuine calm/variable/sentinel/accumulated-period branch examples'],
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = await qualifyGhcnhWeatherDirectory(process.argv[2] ?? '/workspace/mip-real-source-evidence/weather')
    const json = `${JSON.stringify(receipt, null, 2)}\n`
    if (process.argv[3]) await writeFile(resolve(process.argv[3]), json)
    process.stdout.write(json)
  } catch (error) {
    process.stderr.write(`GHCNh qualification failed: ${error.message}\n`); process.exitCode = 1
  }
}
