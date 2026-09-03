// R4 World View launch spine — spec §8 A–K (DISPLAY / client only).
//
// Governing spec: MIP_WORLD_VIEW_LAUNCH_v0.1_2026-09-03.md
// SHA-256 b8d0a38aad5219729ec6d67a9eac97d919bf14b7a2bac0394b3f91fb9ab1adf2
//
// Fixtures bind the live n=1 Cleveland projection. No second event is invented.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import {
  bindDisplayPoint,
  plotDecision,
  selectionStubFromProjection,
} from '../src/lib/spatialProjection.js'
import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  preserveSubjectAcrossViews,
} from '../src/lib/investigationContext.js'
import { commitNewSubject } from '../src/lib/newSubjectPropagation.js'
import {
  parseDeepLink,
  reconstructFromDeepLink,
} from '../src/lib/deepLinks.js'
import {
  EVENT_TIME_WEATHER_MODEL,
  EVENT_TIME_WEATHER_OBSERVATION_TYPE,
  WEATHER_HOURLY_VARIABLES,
  buildArchiveUrl,
  eventTimeWeatherRequest,
  loadEventTimeWeather,
  weatherFromArchivePayload,
} from '../src/lib/eventTimeWeather.js'
import {
  geometryAfterCamera,
  maxZoomForPrecisionClass,
  zoomForPrecisionClass,
} from '../src/lib/worldViewMapStack.js'
import {
  FORBIDDEN_LAUNCH_WIDGETS,
  FORBIDDEN_WORLD_VIEW_OVERLAYS,
  launchOverlayCatalog,
  overlayAllowed,
  privatePersonTrackingLocked,
} from '../src/lib/worldViewPrivacyLock.js'
import {
  spatialFreshnessLabel,
  temporalFreshnessLabel,
  weatherFreshnessLabel,
} from '../src/lib/worldViewFreshness.js'

const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const MAP = readFileSync(new URL('../src/views/WorldMapCanvas.jsx', import.meta.url), 'utf8')
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const WEATHER = readFileSync(new URL('../src/lib/eventTimeWeather.js', import.meta.url), 'utf8')
const STACK = readFileSync(new URL('../src/lib/worldViewMapStack.js', import.meta.url), 'utf8')
const DEEP = readFileSync(new URL('../src/lib/deepLinks.js', import.meta.url), 'utf8')

const LIVE_POINT = Object.freeze([-81.7, 41.4])
const EVENT_FROM_MS = Date.parse('2024-04-08T17:59:00Z')
const EVENT_MID_MS = Date.parse('2024-04-08T18:30:00Z')
const NOW_MS = Date.parse('2026-09-03T10:00:00Z')

const LIVE_ROW = Object.freeze({
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: '777b3951-4a82-4dd7-befb-958991b1318f',
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID,
  spatial_role: 'event',
  relationship_qualifier: 'none',
  precision_class: 'city',
  valid_time_precision: 'range',
  source_native_time: {
    calendar_date: '2024-04-08',
    location_label: 'Cleveland, Ohio',
    source_url: 'https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/',
  },
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
  review_state: 'operative',
  release_state: 'released',
  display_hint: 'event_location',
  display_geometry: { type: 'Point', coordinates: [...LIVE_POINT] },
  geometry_status: 'coarsened_to_precision_class',
  evidence_refs: [{ evidence_role: 'primary_support', evidence_snapshot_id: 'c05b4eed-d260-4e27-a029-bac330ef21e9' }],
})

const PARENT_CATALOG = Object.freeze({
  entity: Object.freeze([{ id: CLEVELAND_CANONICAL_EVENT_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID }]),
  claim: Object.freeze([]),
  source: Object.freeze([]),
  place: Object.freeze([]),
})

function collectSrcFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) collectSrcFiles(path, out)
    else if (/\.(js|jsx|css)$/.test(name)) out.push(path)
  }
  return out
}

test('A: bind live Cleveland city Point [-81.7, 41.4] count=1 from the projection', () => {
  const bound = bindDisplayPoint(LIVE_ROW)
  assert.equal(bound.count, 1)
  assert.deepEqual(bound.coordinates, LIVE_POINT)
  assert.equal(bound.precisionClass, 'city')
  assert.equal(bound.geometryStatus, 'coarsened_to_precision_class')
  assert.equal(LIVE_ROW.subject_graph_node_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(plotDecision(LIVE_ROW).plot, true)
  assert.match(WORLD, /WorldMapCanvas/)
  assert.doesNotMatch(WORLD, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(MAP, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(WEATHER, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
})

test('B: empty projection does not invent a city', () => {
  assert.equal(bindDisplayPoint(null), null)
  assert.equal(bindDisplayPoint({ ...LIVE_ROW, display_geometry: null }), null)
  assert.equal(plotDecision({ ...LIVE_ROW, display_geometry: null }).plot, false)
  const emptyIc = emptyInvestigationContext('world')
  assert.equal(emptyIc.canonical_subject_id, null)
})

test('C: Graph / Map / Split keep one canonical id; map pick commits the subject', () => {
  const stub = selectionStubFromProjection(LIVE_ROW)
  const committed = commitNewSubject(
    emptyInvestigationContext('world'),
    { node: stub, row: LIVE_ROW, fromSpatialProjection: true },
    { landingView: 'world' },
  )
  assert.equal(committed.committed, true)
  assert.equal(committed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(committed.investigationContext.active_view, 'world')
  const cycled = preserveSubjectAcrossViews(committed.investigationContext, ['graph', 'map', 'split', 'world'])
  assert.equal(cycled.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.match(WORLD, /key: 'map'/)
  assert.match(WORLD, /key: 'graph'/)
  assert.match(WORLD, /key: 'split'/)
  assert.match(WORLD, /onSelectProjection\(node \?\? selectionStubFromProjection\(row\), row\)/)
  assert.match(APP, /commitNewSubjectFromApp/)
  assert.match(APP, /handleSelectProjection[\s\S]*commitNewSubjectFromApp/)
})

test('D: inspector has date/time, city precision, provenance, G2 separate, no composite score', () => {
  assert.match(WORLD, /label="When"/)
  assert.match(WORLD, /label="Location"/)
  assert.match(WORLD, /label="Precision class"/)
  assert.match(WORLD, /geometry_status/)
  assert.match(WORLD, /coarsened_to_precision_class|geometry_status/)
  assert.match(WORLD, /G2 dimensions \(separate; never combined\)/)
  assert.match(WORLD, /not a truth or bias score/)
  assert.doesNotMatch(WORLD, /label="Object id"/)
  assert.doesNotMatch(WORLD, /truthScore|compositeScore|biasScore|truth_probability/)
  assert.match(WORLD, /Event inspector/)
})

test('E: weather is ERA5 reanalysis at event time with provenance, or unavailable — never present-day', async () => {
  assert.deepEqual([...WEATHER_HOURLY_VARIABLES], [
    'temperature_2m',
    'precipitation',
    'wind_speed_10m',
    'wind_direction_10m',
  ])
  assert.ok(!WEATHER_HOURLY_VARIABLES.includes('relative_humidity_2m'))
  assert.ok(!WEATHER_HOURLY_VARIABLES.includes('cloud_cover'))
  assert.equal(EVENT_TIME_WEATHER_MODEL, 'era5')
  assert.equal(EVENT_TIME_WEATHER_OBSERVATION_TYPE, 'reanalysis')

  const okReq = eventTimeWeatherRequest(LIVE_ROW, EVENT_MID_MS, NOW_MS)
  assert.equal(okReq.ok, true)
  assert.equal(okReq.latitude, 41.4)
  assert.equal(okReq.longitude, -81.7)
  assert.equal(okReq.day, '2024-04-08')
  assert.match(buildArchiveUrl(okReq), /archive-api\.open-meteo\.com/)
  assert.match(buildArchiveUrl(okReq), /models=era5/)

  const presentDay = eventTimeWeatherRequest(LIVE_ROW, EVENT_MID_MS, Date.parse('2024-04-08T12:00:00Z'))
  assert.equal(presentDay.ok, false)
  assert.equal(presentDay.reason, 'present_day_refused')

  const outside = eventTimeWeatherRequest(LIVE_ROW, Date.parse('2026-09-03T10:00:00Z'), NOW_MS)
  assert.equal(outside.ok, false)
  assert.equal(outside.reason, 'time_not_in_valid_range')

  const payload = {
    latitude: 41.4,
    longitude: -81.7,
    hourly: {
      time: ['2024-04-08T17:00', '2024-04-08T18:00', '2024-04-08T19:00'],
      temperature_2m: [8.1, 7.4, 6.9],
      precipitation: [0, 0.1, 0],
      wind_speed_10m: [12.0, 11.2, 10.4],
      wind_direction_10m: [280, 270, 260],
    },
    hourly_units: {
      temperature_2m: '°C',
      precipitation: 'mm',
      wind_speed_10m: 'km/h',
      wind_direction_10m: '°',
    },
    model: 'era5',
  }
  const parsed = weatherFromArchivePayload(payload, EVENT_MID_MS)
  assert.equal(parsed.status, 'ok')
  assert.equal(parsed.provenance.observationType, 'reanalysis')
  assert.equal(parsed.provenance.provider, 'Open-Meteo')
  assert.equal(parsed.provenance.model, 'era5')
  assert.ok(parsed.fields.temperature)
  assert.ok(parsed.fields.windDirection)
  assert.match(parsed.copy, /not present-day/i)

  const failed = await loadEventTimeWeather({
    row: LIVE_ROW,
    atMs: EVENT_MID_MS,
    nowMs: NOW_MS,
    fetchImpl: async () => {
      throw new Error('network')
    },
  })
  assert.equal(failed.status, 'unavailable')
  assert.equal(failed.fields.temperature, null)
  assert.match(failed.copy, /not sourced|unavailable/i)

  assert.match(WORLD, /loadEventTimeWeather/)
  assert.match(WORLD, /Weather at event time/)
  assert.doesNotMatch(WORLD, /humidity|cloud cover|AQI/i)
})

test('F: temporal DISPLAY is the shared assessment — no local Temporal Intelligence proxy', () => {
  assert.match(WORLD, /loadTemporalAssessment/)
  assert.match(WORLD, /canonicalEventIdFromWorldView/)
  assert.match(WORLD, /TemporalIntelligenceBlock/)
  assert.doesNotMatch(WORLD, /truth_probability/)
  assert.doesNotMatch(WORLD, /lagHours|CoverageGapBar/)
  const temporal = temporalFreshnessLabel({ status: 'ok', displayStatus: 'insufficient_history' })
  assert.equal(temporal, 'unavailable')
})

test('G: pan/zoom/scale-adaptive camera does not change precision class', () => {
  const after = geometryAfterCamera(LIVE_ROW, { zoom: 18, pitch: 60 })
  assert.equal(after.precisionClass, 'city')
  assert.deepEqual(after.coordinates, LIVE_POINT)
  assert.equal(after.geometryStatus, 'coarsened_to_precision_class')
  assert.equal(after.invented, false)
  assert.ok(zoomForPrecisionClass('city') < zoomForPrecisionClass('facility'))
  assert.ok(maxZoomForPrecisionClass('city') < 14)
  assert.match(STACK, /MapLibre/)
  assert.match(MAP, /maplibre-gl/)
  assert.match(MAP, /@deck\.gl/)
})

test('H: no private-person point/track/face; no CCTV/aircraft/vessel overlay', () => {
  assert.equal(privatePersonTrackingLocked(), true)
  assert.deepEqual(launchOverlayCatalog(), [])
  for (const name of FORBIDDEN_WORLD_VIEW_OVERLAYS) {
    assert.equal(overlayAllowed(name), false)
  }
  assert.equal(overlayAllowed('cctv'), false)
  assert.equal(overlayAllowed('aircraft'), false)
  assert.equal(overlayAllowed('vessel'), false)
  assert.doesNotMatch(WORLD, /person-search|face tracking|cctv|aircraft overlay|vessel overlay/i)
  assert.doesNotMatch(MAP, /person-search|cctv|adsb|ais/i)
})

test('I: base map / renderer attribution is visible', () => {
  assert.match(MAP, /AttributionControl/)
  assert.match(STACK, /OpenStreetMap/)
  assert.match(STACK, /CARTO|Natural Earth/)
  assert.match(MAP, /wv-map-attrib|attribution/)
})

test('J: live vs reconstructed vs unavailable remain distinct where those states exist', () => {
  assert.equal(spatialFreshnessLabel(LIVE_ROW, { plot: true }), 'reconstructed')
  assert.equal(spatialFreshnessLabel(null), 'unavailable')
  assert.equal(
    weatherFreshnessLabel({ status: 'ok', provenance: { observationType: 'reanalysis' } }),
    'delayed',
  )
  assert.equal(weatherFreshnessLabel({ status: 'unavailable' }), 'unavailable')
  assert.match(WORLD, /data-freshness-state/)
  assert.match(WORLD, /FreshnessPill/)
})

test('K: no Port Meridian / rings / AQI / shipping / humidity-cloud launch widgets', () => {
  for (const widget of FORBIDDEN_LAUNCH_WIDGETS) {
    assert.equal(overlayAllowed(widget), false)
  }
  const sources = [WORLD, MAP, WEATHER, STACK]
  for (const src of sources) {
    assert.doesNotMatch(src, /Port Meridian/)
    assert.doesNotMatch(src, /evacuation rings|impact-zone|AQI|shipping alerts/i)
    assert.doesNotMatch(src, /humidity|cloud-cover|cloud cover/i)
  }
})

test('#/event/<id>/world reconstructs Cleveland onto World View', () => {
  const parsed = parseDeepLink(`#/event/${CLEVELAND_CANONICAL_EVENT_ID}/world`)
  assert.equal(parsed.subjectId, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(parsed.view, 'world')
  const reconstructed = reconstructFromDeepLink(parsed, {
    currentIc: emptyInvestigationContext('news'),
    catalog: PARENT_CATALOG,
  })
  assert.equal(reconstructed.committed, true)
  assert.equal(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(reconstructed.investigationContext.active_view, 'world')
  assert.equal(reconstructed.investigationContext.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)
  assert.match(DEEP, /world: 'world'/)
  assert.match(APP, /hydrateDeepLink/)
})

test('src has no globe-vendor / 3D-tile strings; map pick goes through commitNewSubject', () => {
  const files = collectSrcFiles(new URL('../src', import.meta.url).pathname)
  const banned = /Cesium|cesium|GEV\b|ion\.cesium|photorealistic 3d|google 3d tiles/i
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, banned, file)
  }
  assert.match(APP, /handleSelectProjection[\s\S]*commitNewSubjectFromApp/)
  void EVENT_FROM_MS
  void applySubject
  void subjectFromWorldViewSelection
})
