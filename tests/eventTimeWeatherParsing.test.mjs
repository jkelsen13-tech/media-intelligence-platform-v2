import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUtcMs, weatherFromArchivePayload } from '../src/lib/eventTimeWeather.js'

const at = Date.parse('2024-04-08T18:30:00Z')
const payload = (time, values = [14]) => ({ hourly: { time, temperature_2m: values }, hourly_units: { temperature_2m: '°C' } })

test('hourly reanalysis never carries a prior hour/day through an archive gap', () => {
  for (const times of [['2024-04-07T18:00'], ['2024-04-08T17:00'], ['2024-04-08T19:00'], ['2024-04-08T18:00', '2024-04-08T18:00']]) {
    assert.equal(weatherFromArchivePayload(payload(times), at).status, 'unavailable', JSON.stringify(times))
  }
  const reversed = weatherFromArchivePayload(payload(['2024-04-08T19:00', '2024-04-08T18:00'], [20, 14]), at)
  assert.equal(reversed.status, 'ok'); assert.equal(reversed.fields.temperature, '14 °C')
  assert.match(reversed.copy, /hourly|observation hour/i)
})

test('archive dates validate calendar and offset while provider GMT text retains its precision', () => {
  for (const time of ['2024-02-30T18:00', '2023-02-29T18:00Z', '2024-04-08', '2024-04-08T24:00', '2024-04-08T18:00+25:00', 0, null]) {
    assert.equal(parseUtcMs(time), null, String(time))
  }
  const offset = '2024-04-08T14:00:00-04:00'
  const result = weatherFromArchivePayload(payload([offset]), at)
  assert.equal(result.status, 'ok'); assert.equal(result.provenance.timestamp, offset)
  assert.equal(parseUtcMs('2024-04-08T18:00'), Date.parse('2024-04-08T18:00:00Z'))
})

test('malformed values never become zero; actually supplied zero remains visible', () => {
  for (const value of [false, true, '', ' ', [], {}, 'NaN', Infinity]) {
    const result = weatherFromArchivePayload(payload(['2024-04-08T18:00'], [value]), at)
    assert.equal(result.status, 'unavailable', String(value)); assert.equal(result.fields.temperature, null)
  }
  assert.equal(weatherFromArchivePayload(payload(['2024-04-08T18:00'], [0]), at).fields.temperature, '0 °C')
})
