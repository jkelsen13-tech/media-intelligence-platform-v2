// R4 World View launch spine — event-time weather (DISPLAY only).
//
// Superseding 2026-09-07 no-fee plan: free hosted Open-Meteo requests disabled.
// Pure ERA5 parsing helpers remain for legacy fixtures; they do not fetch.
// Temperature, precipitation, wind speed, wind direction only.
// Labeled reanalysis when that is what the archive returns.
//
// NEVER present-day fill. Cleveland 2024-04-08 must not read today's
// forecast. Fetch fail → honest "not sourced" / unavailable. Core fields
// only; extra environmental layers are not requested.

import { plotDecision, collectPositions, revisionCoverageAt } from './spatialProjection.js'
import { weatherSourcePermission } from './weatherSourceRights.js'
import { inspectionInstantMilliseconds } from './inspectionTime.js'

export const EVENT_TIME_WEATHER_PROVIDER = 'Open-Meteo'
export const EVENT_TIME_WEATHER_MODEL = 'era5'
export const EVENT_TIME_WEATHER_OBSERVATION_TYPE = 'reanalysis'
export const EVENT_TIME_WEATHER_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

export const WEATHER_HOURLY_VARIABLES = Object.freeze([
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
])

const EMPTY_FIELDS = Object.freeze({
  temperature: null,
  precipitation: null,
  windSpeed: null,
  windDirection: null,
})

const EMPTY_PROVENANCE = Object.freeze({
  provider: null,
  timestamp: null,
  resolution: null,
  observationType: null,
  model: null,
})

export function unavailableWeather(reason, copy) {
  return Object.freeze({
    status: 'unavailable',
    reason,
    copy:
      copy ??
      'Weather not sourced. No present-day value is substituted.',
    fields: EMPTY_FIELDS,
    provenance: EMPTY_PROVENANCE,
  })
}

export function parseUtcMs(value) {
  if (typeof value !== 'string') return null
  // This parser is scoped to archive hourly.time with requested timezone=GMT.
  // Its native zone-free hours have that documented meaning; general source
  // and inspection timestamps must still carry their own explicit offsets.
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? `${value}Z` : value
  const normalized = withZone.replace(/(T\d{2}:\d{2})(Z|[+-]\d{2}(?::?\d{2})?)$/i, '$1:00$2')
  return inspectionInstantMilliseconds(normalized)
}

export function utcDayStamp(ms) {
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

export function isPresentDayRequest(eventDay, nowMs = Date.now()) {
  if (!eventDay) return true
  return eventDay === utcDayStamp(nowMs)
}

export function eventTimeCoordinate(row) {
  const decision = plotDecision(row)
  if (!decision.plot) return null
  const positions = collectPositions(decision.geometry)
  const first = positions[0]
  if (!first || first.length < 2) return null
  const lon = Number(first[0])
  const lat = Number(first[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return { longitude: lon, latitude: lat }
}

/**
 * Weather is only sourced when the scrubbed instant is inside the row's
 * recorded valid range. Audit timestamps (review/release) do not authorize
 * a present-day or out-of-range fetch.
 */
export function eventTimeWeatherRequest(row, atMs, nowMs = Date.now()) {
  if (!row) return { ok: false, reason: 'no_row' }
  if (!Number.isFinite(atMs)) return { ok: false, reason: 'no_event_time' }
  if (revisionCoverageAt(row, atMs) !== 'covers') return { ok: false, reason: 'time_not_in_valid_range' }
  const coordinate = eventTimeCoordinate(row)
  if (!coordinate) return { ok: false, reason: 'no_display_geometry' }
  const day = utcDayStamp(atMs)
  if (!day) return { ok: false, reason: 'unreadable_time' }
  if (isPresentDayRequest(day, nowMs)) return { ok: false, reason: 'present_day_refused' }
  return {
    ok: true,
    reason: null,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    day,
    atMs,
  }
}

export function buildArchiveUrl({ latitude, longitude, day }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: day,
    end_date: day,
    hourly: WEATHER_HOURLY_VARIABLES.join(','),
    models: EVENT_TIME_WEATHER_MODEL,
    timezone: 'GMT',
  })
  return `${EVENT_TIME_WEATHER_ARCHIVE_URL}?${params.toString()}`
}

function hourIndexFor(times, atMs) {
  if (!Array.isArray(times) || times.length === 0 || !Number.isFinite(atMs)) return -1
  const requestedHour = Math.floor(atMs / 3600000) * 3600000
  let match = -1
  for (let i = 0; i < times.length; i++) {
    const ms = parseUtcMs(times[i])
    if (ms !== requestedHour) continue
    if (match !== -1) return -1 // Duplicate samples are ambiguous.
    match = i
  }
  return match
}

function numericWeatherValue(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatNumber(value, unit) {
  const n = numericWeatherValue(value)
  if (n === null) return null
  const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
  return unit ? `${text} ${unit}` : text
}

function formatWindDirection(degrees) {
  const n = numericWeatherValue(degrees)
  if (n === null) return null
  return `${Math.round(n)}°`
}

export function weatherFromArchivePayload(payload, atMs) {
  if (!payload || typeof payload !== 'object') {
    return unavailableWeather('unreadable_payload')
  }
  const hourly = payload.hourly
  if (!hourly || !Array.isArray(hourly.time)) {
    return unavailableWeather('missing_hourly')
  }
  const index = hourIndexFor(hourly.time, atMs)
  if (index < 0) return unavailableWeather('hour_not_in_archive')

  const units = payload.hourly_units ?? {}
  const temperature = numericWeatherValue(hourly.temperature_2m?.[index])
  const precipitation = numericWeatherValue(hourly.precipitation?.[index])
  const windSpeed = numericWeatherValue(hourly.wind_speed_10m?.[index])
  const windDirection = numericWeatherValue(hourly.wind_direction_10m?.[index])
  const missing =
    temperature == null && precipitation == null && windSpeed == null && windDirection == null
  if (missing) return unavailableWeather('hour_values_missing')

  const timestamp = hourly.time[index]
  const model = payload.model ?? payload.hourly?.model ?? EVENT_TIME_WEATHER_MODEL
  return Object.freeze({
    status: 'ok',
    reason: null,
    copy: 'ERA5 hourly reanalysis for the selected observation hour. Not present-day weather or an exact event-time observation.',
    fields: Object.freeze({
      temperature: formatNumber(temperature, units.temperature_2m ?? '°C'),
      precipitation: formatNumber(precipitation, units.precipitation ?? 'mm'),
      windSpeed: formatNumber(windSpeed, units.wind_speed_10m ?? 'km/h'),
      windDirection: formatWindDirection(windDirection),
    }),
    provenance: Object.freeze({
      provider: EVENT_TIME_WEATHER_PROVIDER,
      timestamp: /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(timestamp) ? timestamp : `${timestamp}Z`,
      resolution: payload.hourly_units ? 'hourly' : null,
      observationType: EVENT_TIME_WEATHER_OBSERVATION_TYPE,
      model: typeof model === 'string' ? model : EVENT_TIME_WEATHER_MODEL,
    }),
  })
}

export async function loadEventTimeWeather({ row, atMs, nowMs = Date.now() } = {}) {
  const request = eventTimeWeatherRequest(row, atMs, nowMs)
  if (!request.ok) {
    const copy =
      request.reason === 'present_day_refused'
        ? 'Weather not sourced: present-day fill is refused for a historical event.'
        : request.reason === 'time_not_in_valid_range'
          ? 'Weather not sourced at this recorded time. Historical state is not interpolated.'
          : 'Weather not sourced / unavailable.'
    return unavailableWeather(request.reason, copy)
  }

  const permission = weatherSourcePermission('open-meteo-archive-free-era5', 'display')
  if (!permission.allowed) return unavailableWeather(permission.reason)

  // A future source approval is not an adapter implementation. Enabling a
  // reviewed replacement requires its own bounded adapter and regression tests.
  return unavailableWeather('adapter_not_implemented')
}
