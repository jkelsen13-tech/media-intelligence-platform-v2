import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WEATHER_SOURCE_RIGHTS, weatherSourcePermission } from '../src/lib/weatherSourceRights.js'
import { loadEventTimeWeather } from '../src/lib/eventTimeWeather.js'

const row = {
  object_type: 'event_spatial_relationship',
  spatial_role: 'event',
  relationship_qualifier: 'none',
  precision_class: 'city',
  valid_time_precision: 'range',
  valid_from_utc: '2024-04-08T17:59:00Z',
  valid_to_utc: '2024-04-08T20:29:00Z',
  review_state: 'operative',
  release_state: 'released',
  display_hint: 'event_location',
  display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] },
  geometry_status: 'coarsened_to_precision_class',
}
const request = { row, atMs: Date.parse('2024-04-08T18:30:00Z'), nowMs: Date.parse('2026-09-07T00:00:00Z') }

test('permissive data license does not override non-commercial hosted-service terms', () => {
  const source = WEATHER_SOURCE_RIGHTS['open-meteo-archive-free-era5']
  assert.equal(source.data.license, 'CC-BY-4.0')
  assert.equal(source.service.noFee, true)
  assert.equal(source.service.commercialUse, false)
  for (const action of ['display', 'analysis', 'retain', 'export', 'redistribute']) {
    assert.deepEqual(weatherSourcePermission('open-meteo-archive-free-era5', action),
      { allowed: false, reason: 'source_terms_incompatible' })
  }
})

test('unknown sources, inherited names, unknown actions and pending reviews deny', () => {
  for (const name of [null, undefined, '', 'unreviewed', '__proto__', 'constructor']) {
    assert.equal(weatherSourcePermission(name).allowed, false)
  }
  assert.equal(weatherSourcePermission('open-meteo-archive-free-era5', 'subscribe').allowed, false)
  for (const name of ['nasa-power-hourly', 'noaa-ghcnh-hourly']) {
    assert.deepEqual(weatherSourcePermission(name), { allowed: false, reason: 'source_not_reviewed' })
    assert.equal(WEATHER_SOURCE_RIGHTS[name].data.license, null)
  }
})

test('callers cannot rewrite the shared source approval or nested permissions', () => {
  assert.throws(() => { WEATHER_SOURCE_RIGHTS['nasa-power-hourly'].review.status = 'approved' }, TypeError)
  assert.throws(() => { WEATHER_SOURCE_RIGHTS['open-meteo-archive-free-era5'].permissions.display = true }, TypeError)
})

test('valid historical geometry/time cannot trigger a restricted provider request', async () => {
  let calls = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => { calls++; throw new Error('must not reach any network') }
  try {
    const result = await loadEventTimeWeather({
      ...request,
      fetchImpl: async () => { calls++; return { ok: true, json: async () => ({}) } },
      sourceId: 'nasa-power-hourly',
      approved: true,
    })
    assert.equal(calls, 0)
    assert.equal(result.status, 'unavailable')
    assert.equal(result.reason, 'source_terms_incompatible')
    assert.ok(Object.values(result.fields).every(value => value === null))
    assert.ok(Object.values(result.provenance).every(value => value === null))
    assert.equal(result.copy, 'Weather not sourced. No present-day value is substituted.')
  } finally { globalThis.fetch = previousFetch }
})

test('source gating preserves time, location and present-day rejection reasons', async () => {
  assert.equal((await loadEventTimeWeather({ ...request, row: null })).reason, 'no_row')
  assert.equal((await loadEventTimeWeather({ ...request, row: { ...row, display_geometry: null } })).reason, 'no_display_geometry')
  assert.equal((await loadEventTimeWeather({ ...request, atMs: Date.parse('2024-04-09T12:00:00Z') })).reason, 'time_not_in_valid_range')
  assert.equal((await loadEventTimeWeather({ ...request, nowMs: request.atMs })).reason, 'present_day_refused')
})
