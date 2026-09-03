// R4 World View launch spine — event-time weather (DISPLAY only).
//
// Authorized path: Open-Meteo archive / ECMWF ERA5, free, no paid key.
// Temperature, precipitation, wind speed, wind direction only.
// Labeled reanalysis when that is what the archive returns.
//
// NEVER present-day fill. Cleveland 2024-04-08 must not read today's
// forecast. Fetch fail → honest "not sourced" / unavailable. Core fields
// only; extra environmental layers are not requested.

import { plotDecision, collectPositions, revisionCoverageAt } from './spatialProjection.js'

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
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
      ? `${raw}Z`
      : raw
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
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
  let best = -1
  for (let i = 0; i < times.length; i++) {
    const ms = parseUtcMs(times[i])
    if (ms == null) continue
    if (ms <= atMs) best = i
    else break
  }
  return best
}

function formatNumber(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return null
  const n = Number(value)
  const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
  return unit ? `${text} ${unit}` : text
}

function formatWindDirection(degrees) {
  if (degrees == null || !Number.isFinite(Number(degrees))) return null
  return `${Math.round(Number(degrees))}°`
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
  const temperature = hourly.temperature_2m?.[index]
  const precipitation = hourly.precipitation?.[index]
  const windSpeed = hourly.wind_speed_10m?.[index]
  const windDirection = hourly.wind_direction_10m?.[index]
  const missing =
    temperature == null && precipitation == null && windSpeed == null && windDirection == null
  if (missing) return unavailableWeather('hour_values_missing')

  const timestamp = hourly.time[index]
  const model = payload.model ?? payload.hourly?.model ?? EVENT_TIME_WEATHER_MODEL
  return Object.freeze({
    status: 'ok',
    reason: null,
    copy: 'ERA5 reanalysis at recorded event time. Not present-day weather.',
    fields: Object.freeze({
      temperature: formatNumber(temperature, units.temperature_2m ?? '°C'),
      precipitation: formatNumber(precipitation, units.precipitation ?? 'mm'),
      windSpeed: formatNumber(windSpeed, units.wind_speed_10m ?? 'km/h'),
      windDirection: formatWindDirection(windDirection),
    }),
    provenance: Object.freeze({
      provider: EVENT_TIME_WEATHER_PROVIDER,
      timestamp: timestamp ? `${timestamp}Z`.replace(/ZZ$/, 'Z') : null,
      resolution: payload.hourly_units ? 'hourly' : null,
      observationType: EVENT_TIME_WEATHER_OBSERVATION_TYPE,
      model: typeof model === 'string' ? model : EVENT_TIME_WEATHER_MODEL,
    }),
  })
}

export async function loadEventTimeWeather({ row, atMs, nowMs = Date.now(), fetchImpl } = {}) {
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

  const url = buildArchiveUrl(request)
  const fetchFn = fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
  if (!fetchFn) return unavailableWeather('fetch_unavailable')

  try {
    const response = await fetchFn(url, { headers: { Accept: 'application/json' } })
    if (!response?.ok) return unavailableWeather('fetch_failed')
    const payload = await response.json()
    return weatherFromArchivePayload(payload, request.atMs)
  } catch {
    return unavailableWeather('fetch_failed')
  }
}
