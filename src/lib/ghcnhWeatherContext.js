import { inspectionInstantNanoseconds } from './inspectionTime.js'
import { GHCNH_WEATHER_POLICY } from './ghcnhWeatherParser.js'

const text = value => typeof value === 'string' && value.trim() ? value.trim() : null
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function coordinates(value) {
  return value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180
    ? { latitude: value.latitude, longitude: value.longitude } : null
}
function stationDistance(a, b) {
  const radians = value => value * Math.PI / 180
  const dLat = radians(b.latitude - a.latitude), dLon = radians(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
function displayValues(candidate) {
  const vars = candidate.variables, available = name => vars[name]?.status === 'available' ? vars[name] : null
  const temperature = available('temperature'), speed = available('wind_speed'), direction = available('wind_direction'), precipitation = available('precipitation')
  return {
    ...(temperature ? { temperature: `${temperature.value} °C (station dry bulb, approximately 2 m AGL)` } : {}),
    ...(speed ? { windSpeed: `${speed.value} m/s${speed.semantics === 'calm' ? ' (calm)' : speed.averagingMinutes ? ` (${speed.averagingMinutes} min average)` : speed.semantics === 'variable-wind-speed' ? ' (variable wind)' : ''}` } : {}),
    ...(direction ? { windDirection: direction.value === null ? direction.semantics : `${direction.value}° from true north` } : {}),
    ...(precipitation ? { precipitation: `${precipitation.trace ? 'Trace (amount unknown)' : `${precipitation.value} mm${precipitation.semantics === 'dry-zero' ? ' (dry zero)' : ''}`} · nominal report accumulation, exact interval unknown; not summed` } : {}),
    observationType: 'Historical station observation; current conditions unknown',
    resolution: 'Approximate station point; station elevation and horizontal datums unverified',
    model: 'Not model or reanalysis output',
  }
}

// Explicit adapter for the existing admittedContext.weather intake shape. The
// parser/adapter cannot issue an admission receipt. A proposal always has
// admitted:false, and the existing intake's exact event-time gate still applies.
export function ghcnhWeatherContextProposal({ candidate, subjectId = null, inspectionTime = null,
  scope = 'station-only', target = null, limits = null } = {}) {
  const unavailable = reason => freeze({ status: 'unavailable', reason, record: null, publicationAdmitted: false })
  if (candidate?.qualification !== 'candidate' || candidate.publicationAdmitted !== false
    || candidate.provenance?.policy !== GHCNH_WEATHER_POLICY) return unavailable('qualified-candidate-required')
  const station = coordinates(candidate.station), observed = inspectionInstantNanoseconds(candidate.observedAt)
  const selected = inspectionInstantNanoseconds(inspectionTime)
  if (!station || observed === null) return unavailable('valid-station-time-required')
  if (!['station-only', 'bounded-station-context'].includes(scope)) return unavailable('explicit-supported-scope-required')
  const offsetNanoseconds = selected === null ? null : observed - selected
  let distanceMeters = null
  if (scope === 'bounded-station-context') {
    const targetPoint = coordinates(target)
    // Do not invent a nearby-station cutoff or a temporal tolerance.
    if (!targetPoint || selected === null || !Number.isFinite(limits?.maxStationDistanceMeters) || limits.maxStationDistanceMeters < 0
      || !Number.isSafeInteger(limits?.maxTimeOffsetSeconds) || limits.maxTimeOffsetSeconds < 0) return unavailable('explicit-distance-and-time-limits-required')
    distanceMeters = stationDistance(station, targetPoint)
    if (distanceMeters > limits.maxStationDistanceMeters) return unavailable('station-outside-distance-limit')
    const maxOffset = BigInt(limits.maxTimeOffsetSeconds) * 1000000000n
    if (offsetNanoseconds > maxOffset || offsetNanoseconds < -maxOffset) return unavailable('observation-outside-time-limit')
  }
  const binding = {
    scope, subjectId: text(subjectId), inspectionTime: text(inspectionTime), observedAt: candidate.observedAt,
    offsetNanoseconds: offsetNanoseconds?.toString() ?? null,
    stationDistanceMeters: distanceMeters, distanceMeaning: distanceMeters === null ? null : 'approximate spherical point distance; horizontal datum unverified',
    target: scope === 'bounded-station-context' ? coordinates(target) : null,
    limits: scope === 'bounded-station-context' ? { maxStationDistanceMeters: limits.maxStationDistanceMeters, maxTimeOffsetSeconds: limits.maxTimeOffsetSeconds } : null,
    existingExactTimeSeamCompatible: selected !== null && selected === observed,
    publicationGate: 'external source-rights, byte-hash, station relevance, row validity and admission review required',
  }
  const provenance = { ...candidate.provenance, observedAt: candidate.observedAt, nativeDate: candidate.nativeDate,
    station: JSON.parse(JSON.stringify(candidate.station)), variables: JSON.parse(JSON.stringify(candidate.variables)), binding }
  const record = {
    admitted: false, id: `ghcnh:${candidate.id}`, version: `${GHCNH_WEATHER_POLICY}:${candidate.provenance.inputSha256}`,
    subjectId: text(subjectId), title: 'Historical station weather', classification: 'context',
    status: 'available', temporalMode: 'event-time', referenceTime: candidate.observedAt,
    geography: { label: `${candidate.station.name} (${candidate.station.id}) station only; not citywide or neighborhood weather`,
      precision: 'approximate station point; horizontal and elevation datums unverified' },
    source: { label: 'NOAA NCEI GHCNh · source 343 ASOS/AWOS', url: candidate.provenance.sourceUrl,
      referenceId: candidate.provenance.inputSha256 },
    fields: displayValues(candidate), provenance,
  }
  return freeze({ status: 'qualification-proposal', reason: null, binding, record, publicationAdmitted: false })
}
