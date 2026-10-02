import { createHash } from 'node:crypto'
import { GHCNH_UTC_FORMAT_BINDING } from '../src/lib/ghcnhWeatherParser.js'

// Deliberately invented source-format rows. Genuine Library bytes are qualified
// separately by verifier/runGhcnhWeatherQualification.mjs and are not copied here.
export function syntheticRow(overrides = {}) {
  const row = { STATION: 'SYNTHETIC', Station_name: 'Synthetic station', DATE: '2025-01-01T00:51:00',
    LATITUDE: '41.4', LONGITUDE: '-81.8', ELEVATION: '260.0' }
  for (const [variable, value, measurement] of [['temperature', '8.0', ''], ['wind_speed', '2.1', 'N'], ['wind_direction', '360', 'N'], ['precipitation', '0.0', '']]) {
    row[variable] = value
    row[`${variable}_Measurement_Code`] = measurement
    row[`${variable}_Quality_Code`] = '5'
    row[`${variable}_Report_Type`] = 'FM15'
    row[`${variable}_Source_Code`] = '343'
    row[`${variable}_Source_Station_ID`] = 'SYNTHETIC-SOURCE'
  }
  return { ...row, ...overrides }
}
export function syntheticOptions(rows) {
  const bytes = JSON.stringify(rows)
  return { format: GHCNH_UTC_FORMAT_BINDING, evidence: {
    sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: Buffer.byteLength(bytes),
    sourceUrl: 'https://example.invalid/ghcnh-synthetic', representation: 'explicitly synthetic JSON',
  } }
}
