// R4 World View — spatial_projection_v1 reader and honest-empty contract.
//
// Live V2 (qikvmopbtijoebdqosyq, verified 2026-09-03): one city-class Point
// [-81.7, 41.4] for Cleveland. public.edges does not exist. Tests bind that
// contract with mocks — they never invent weather, edges, or finer gazetteer
// coordinates.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  SPATIAL_PROJECTION_COLUMNS,
  SPATIAL_PROJECTION_TABLE,
  plotDecision,
  parseDisplayGeometry,
  revisionCoverageAt,
  revisionAtTime,
  weatherPanelState,
  loadSpatialProjection,
  loadWorldViewGraph,
  liveGraphNodes,
  autoSelectRow,
  displayCoordinateText,
  labeledG2Dimensions,
  confidenceTextDimension,
  inspectorAvailability,
  spatialProjectionUnavailableCopy,
  G2_DIMENSIONS,
} from '../src/lib/spatialProjection.js'

const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const SPATIAL = readFileSync(new URL('../src/lib/spatialProjection.js', import.meta.url), 'utf8')
const GRAPH = readFileSync(new URL('../src/graph/GraphView.jsx', import.meta.url), 'utf8')

const LIVE_OBJECT_ID = '777b3951-4a82-4dd7-befb-958991b1318f'
const LIVE_NODE_ID = 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const LIVE_PLACE_ID = '6034fc7e-b6ab-42b4-8c52-85421bd0d42c'
const LIVE_POINT = Object.freeze([-81.7, 41.4])
// Finer Cleveland gazetteer coords must never be restored in the browser.
const FINER_GAZETTEER = Object.freeze([-81.6944, 41.4993])

const LIVE_ROW = Object.freeze({
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: LIVE_OBJECT_ID,
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: LIVE_NODE_ID,
  subject_snapshot_hash: '6e83958990100948cdfdca7e97c53ba6d645a19f9b9a77aa93ef8d3e02c04a47',
  revision_id: '9bf5c497-0c36-4307-9940-541265a94b0d',
  revision_ordinal: 1,
  superseded_by_revision_id: null,
  spatial_role: 'event',
  relationship_qualifier: 'none',
  canonical_place_id: LIVE_PLACE_ID,
  place_snapshot_hash: 'f9422d9e9976211bf0e8f733aa1f82936e09e12a4b107e6df6da238d2fae67dc',
  precision_class: 'city',
  valid_time_precision: 'range',
  source_native_time: {
    maximum: '3:15 p.m. EDT',
    timezone: 'EDT',
    source_url: 'https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/',
    partial_ends: '4:29 p.m. EDT',
    calendar_date: '2024-04-08',
    totality_ends: '3:17 p.m. EDT',
    location_label: 'Cleveland, Ohio',
    partial_begins: '1:59 p.m. EDT',
    totality_begins: '3:13 p.m. EDT',
  },
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
  revision_known_at_utc: '2026-09-03 01:50:15.865651+00',
  review_effective_at_utc: '2026-09-03 01:50:58+00',
  release_effective_at_utc: '2026-09-03 01:51:20+00',
  review_state: 'operative',
  release_state: 'released',
  uncertainty_class: null,
  uncertainty_note:
    'NASA looking-back article states Cleveland partial ended 4:28 PM; NASA Where & When table used here lists 4:29 p.m. EDT. Totality 3:13-3:17 p.m. is consistent across NASA and Cuyahoga County.',
  confidence: null,
  confidence_status: 'unsupported_by_governed_model',
  display_hint: 'event_location',
  display_geometry: { type: 'Point', coordinates: [...LIVE_POINT] },
  geometry_status: 'coarsened_to_precision_class',
  evidence_refs: [
    {
      evidence_role: 'primary_support',
      evidence_snapshot_id: 'c05b4eed-d260-4e27-a029-bac330ef21e9',
    },
  ],
})

function fakeClient(tables, { supabaseUrl, errors = {} } = {}) {
  const fromCalls = []
  return {
    supabaseUrl,
    fromCalls,
    from(table) {
      fromCalls.push(table)
      let rows = [...(tables[table] ?? [])]
      const state = { limit: null }
      const q = {
        select: () => q,
        eq: (c, v) => {
          rows = rows.filter((r) => r[c] === v)
          return q
        },
        in: (c, vs) => {
          const s = new Set(vs)
          rows = rows.filter((r) => s.has(r[c]))
          return q
        },
        gt: (c, v) => {
          rows = rows.filter((r) => String(r[c]) > String(v))
          return q
        },
        order: () => q,
        limit: (n) => {
          state.limit = n
          return q
        },
        then: (resolve) => {
          if (errors[table]) {
            return resolve({ data: null, error: errors[table] })
          }
          let r = rows
          if (state.limit != null) r = r.slice(0, state.limit)
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

test('spatial_projection_v1 column contract is the live view, not invented fields', () => {
  assert.equal(SPATIAL_PROJECTION_TABLE, 'spatial_projection_v1')
  assert.ok(SPATIAL_PROJECTION_COLUMNS.includes('display_geometry'))
  assert.ok(SPATIAL_PROJECTION_COLUMNS.includes('source_native_time'))
  assert.ok(SPATIAL_PROJECTION_COLUMNS.includes('precision_class'))
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('temperature'))
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('weather'))
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('aqi'))
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('latitude'))
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('longitude'))
})

test('empty spatial view is an honest empty result, not demo pins', async () => {
  const client = fakeClient({ spatial_projection_v1: [] })
  const result = await loadSpatialProjection({ supabaseClient: client })
  assert.equal(result.status, 'empty')
  assert.equal(result.reason, 'zero_rows')
  assert.deepEqual(result.rows, [])
  assert.equal(result.error, null)
  assert.ok(client.fromCalls.includes('spatial_projection_v1'))
})

test('mocked live Cleveland row plots only coarsened city Point [-81.7, 41.4]', async () => {
  const client = fakeClient({ spatial_projection_v1: [{ ...LIVE_ROW }] })
  const result = await loadSpatialProjection({ supabaseClient: client })
  assert.equal(result.status, 'ok')
  assert.equal(result.rows.length, 1)
  const row = result.rows[0]
  assert.equal(row.mip_object_id, LIVE_OBJECT_ID)
  assert.equal(row.subject_graph_node_id, LIVE_NODE_ID)
  assert.equal(row.canonical_place_id, LIVE_PLACE_ID)
  assert.equal(row.precision_class, 'city')
  assert.equal(row.geometry_status, 'coarsened_to_precision_class')
  assert.equal(row.source_native_time.location_label, 'Cleveland, Ohio')

  const decision = plotDecision(row)
  assert.equal(decision.plot, true)
  assert.deepEqual(decision.geometry.coordinates, LIVE_POINT)
  assert.equal(displayCoordinateText(decision.geometry), '[-81.7, 41.4]')
  assert.notDeepEqual(decision.geometry.coordinates, FINER_GAZETTEER)
  assert.notEqual(decision.geometry.coordinates[0], FINER_GAZETTEER[0])
  assert.notEqual(decision.geometry.coordinates[1], FINER_GAZETTEER[1])
})

test('plotDecision never synthesizes a point from place ids or gazetteer leftovers', () => {
  const noGeom = {
    ...LIVE_ROW,
    display_geometry: null,
    canonical_place_id: LIVE_PLACE_ID,
    latitude: FINER_GAZETTEER[1],
    longitude: FINER_GAZETTEER[0],
  }
  const decision = plotDecision(noGeom)
  assert.equal(decision.plot, false)
  assert.equal(decision.reason, 'no_display_geometry')
  assert.equal(decision.geometry, null)
  assert.equal(parseDisplayGeometry(null), null)
})

test('time scrub covers valid_from inclusive and valid_to exclusive; no invented history', () => {
  const from = Date.parse('2024-04-08T17:59:00Z')
  const to = Date.parse('2024-04-08T20:29:00Z')
  assert.equal(revisionCoverageAt(LIVE_ROW, from), 'covers')
  assert.equal(revisionCoverageAt(LIVE_ROW, from + 60_000), 'covers')
  assert.equal(revisionCoverageAt(LIVE_ROW, to), 'outside')
  assert.equal(revisionCoverageAt(LIVE_ROW, to + 1), 'outside')
  assert.equal(revisionCoverageAt(LIVE_ROW, from - 1), 'outside')
  assert.equal(revisionCoverageAt({ ...LIVE_ROW, valid_from_utc: null, valid_to_utc: null }, from), 'time_not_recorded')
  assert.equal(revisionAtTime([LIVE_ROW], to), null)
  assert.equal(revisionAtTime([LIVE_ROW], from)?.revision_id, LIVE_ROW.revision_id)
})

test('weather panel is always honest unavailable — no vendor, no fabricated fields', () => {
  const weather = weatherPanelState()
  assert.equal(weather.status, 'unavailable')
  assert.equal(weather.reason, 'no_authorized_weather_path')
  assert.match(weather.copy, /no weather columns/)
  assert.equal(weather.fields.temperature, null)
  assert.equal(weather.fields.precipitation, null)
  assert.equal(weather.fields.windSpeed, null)
  assert.equal(weather.fields.windDirection, null)
  assert.equal(weather.provenance.provider, null)
  assert.equal(weather.provenance.timestamp, null)
  assert.equal(weather.provenance.resolution, null)
  assert.equal(weather.provenance.observationType, null)
  assert.match(WORLD, /weatherPanelState\(\)/)
  assert.match(WORLD, /wv-weather/)
  assert.match(SPATIAL, /Weather is unavailable/)
  assert.doesNotMatch(WORLD, /open-meteo|openweathermap|NOAA forecast|72°|sunny/i)
})

test('G2 dimensions stay separate; confidence is labeled text, not a composite score', () => {
  const dims = labeledG2Dimensions(LIVE_ROW)
  assert.equal(dims.length, G2_DIMENSIONS.length)
  assert.deepEqual(
    dims.map((d) => d.key),
    [
      'source_reliability',
      'evidence_strength',
      'authentication',
      'relationship_type',
      'review_status',
      'remaining_uncertainty',
    ],
  )
  assert.equal(dims.find((d) => d.key === 'relationship_type').value, 'none')
  assert.equal(dims.find((d) => d.key === 'review_status').value, 'operative')
  assert.equal(dims.find((d) => d.key === 'source_reliability').value, null)
  const confidence = confidenceTextDimension(LIVE_ROW)
  assert.equal(confidence.value, null)
  assert.match(confidence.label, /not a composite score/)
  assert.doesNotMatch(SPATIAL, /truthScore|compositeScore|biasScore/)
})

test('auto-selects the unique live object; does not invent a pick among many', () => {
  assert.equal(autoSelectRow([LIVE_ROW])?.mip_object_id, LIVE_OBJECT_ID)
  const other = { ...LIVE_ROW, mip_object_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', revision_ordinal: 2 }
  assert.equal(autoSelectRow([LIVE_ROW, other]), null)
})

test('missing public.edges is honest edges-unavailable; nodes still return; no demo edges', async () => {
  const node = {
    id: LIVE_NODE_ID,
    slug: 'evt-cleveland-eclipse-2024',
    label: 'Cleveland 2024 total solar eclipse',
    type: 'event',
    description: null,
    confidence: null,
    summary: null,
    occurred_at: '2024-04-08T17:59:00+00',
    arc_id: null,
    metadata: null,
  }
  const client = fakeClient(
    { nodes: [node], edges: [] },
    { errors: { edges: { message: "Could not find the table 'public.edges' in the schema cache" } } },
  )
  const result = await loadWorldViewGraph({ supabaseClient: client })
  assert.equal(result.status, 'ok')
  assert.equal(result.nodes.length, 1)
  assert.equal(result.nodes[0].id, LIVE_NODE_ID)
  assert.deepEqual(result.edges, [])
  assert.match(result.edgesUnavailable, /public\.edges|schema cache/)
  assert.doesNotMatch(JSON.stringify(result), /Fort Campbell|Port Meridian|demoEdges/)
})

test('World View graph never falls back to the bundled demo dataset', () => {
  assert.deepEqual(liveGraphNodes({ source: 'demo', nodes: [{ id: 'demo' }] }), [])
  assert.deepEqual(liveGraphNodes({ source: 'supabase', nodes: [{ id: LIVE_NODE_ID }] }), [{ id: LIVE_NODE_ID }])
  assert.doesNotMatch(SPATIAL, /demoData|demoNodes|demoEdges/)
  assert.doesNotMatch(WORLD, /demoData|demoNodes|demoEdges/)
  assert.doesNotMatch(WORLD, /Fort Campbell|Port Meridian/)
  assert.doesNotMatch(SPATIAL, /Port Meridian/)
})

test('App wires World View as a core tab sharing selected / handleSelectProjection', () => {
  assert.match(APP, /import WorldView from '\.\/views\/WorldView'/)
  assert.match(APP, /view === 'world'/)
  assert.match(APP, /handleSelectProjection/)
  assert.match(APP, /selected=\{selected\}/)
  assert.match(APP, /onSelectProjection=\{handleSelectProjection\}/)
  assert.match(APP, /onSelectGraphNode=\{handleSelect\}/)
  const selectStart = APP.indexOf('const handleSelect =')
  const projStart = APP.indexOf('const handleSelectProjection =')
  assert.ok(selectStart > -1 && projStart > -1 && selectStart < projStart)
})

test('World View UI is Map / Graph / Split with inspector, recorded time, and no fake overlays', () => {
  assert.match(WORLD, /key: 'map'/)
  assert.match(WORLD, /key: 'graph'/)
  assert.match(WORLD, /key: 'split'/)
  assert.match(WORLD, /display_geometry/)
  assert.match(WORLD, /loadSpatialProjection/)
  assert.match(WORLD, /loadWorldViewGraph/)
  assert.match(WORLD, /public\.edges is unavailable/)
  assert.match(WORLD, /No demo relationships are drawn/)
  assert.match(WORLD, /No map pins are fabricated/)
  assert.doesNotMatch(WORLD, /impact-zone|flood overlay|AQI/)
  assert.match(GRAPH, /selectedId = null/)
})

test('inspector stays empty when the projection is unavailable or empty', () => {
  assert.match(spatialProjectionUnavailableCopy('missing'), /VITE_SUPABASE_URL is missing/)
  assert.match(spatialProjectionUnavailableCopy('origin_not_v2'), /not the V2 origin/)
  assert.equal(inspectorAvailability(null).state, 'empty')
  const withheld = inspectorAvailability({
    ...LIVE_ROW,
    geometry_status: 'withheld',
    display_geometry: { type: 'Point', coordinates: LIVE_POINT },
  })
  assert.equal(withheld.state, 'insufficient_evidence')
})
