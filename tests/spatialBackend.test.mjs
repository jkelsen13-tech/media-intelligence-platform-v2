import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spatialFixture, spatialRow, spatialTables } from './spatialBackendFixture.mjs'
import { SPATIAL_PROJECTION_COLUMNS } from '../src/lib/spatialProjection.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'

test('spatial backend binds the installed SDK and current session with complete revision and graph pages', async () => {
  const tables = spatialTables(), pad = i => String(i).padStart(5, '0')
  tables.spatial_projection_v1 = Array.from({ length: 1002 }, (_, i) => ({ ...spatialRow, revision_id: `revision-${pad(i)}`, revision_ordinal: i + 1 }))
  tables.nodes = Array.from({ length: 1002 }, (_, i) => ({ id: `node-${pad(i)}`, label: `Recorded ${i}` }))
  tables.edges = Array.from({ length: 1002 }, (_, i) => ({ id: `edge-${pad(i)}`, source_id: tables.nodes[i].id, target_id: 'node-00000', type: 'sequence' }))
  const f = spatialFixture({ tables }); assert.ok(Object.isFrozen(f.backend)); assert.equal(f.calls.length, 0)
  const projection = await f.backend.loadSpatialProjection(), graph = await f.backend.loadWorldViewGraph()
  assert.deepEqual(projection.rows, tables.spatial_projection_v1)
  assert.equal(graph.nodes.length, 1002); assert.equal(graph.edges.length, 1002)
  assert.equal(graph.edges[1001].source, 'node-01001'); assert.equal(graph.edges[1001].type, 'sequence')
  const projectionCalls = f.calls.filter(c => c.table === 'spatial_projection_v1')
  assert.equal(projectionCalls.length, 2); assert.equal(projectionCalls[1].params.get('revision_id'), 'gt.revision-00999')
  assert.deepEqual(projectionCalls[0].params.get('select').split(',').map(x => x.trim()), [...SPATIAL_PROJECTION_COLUMNS])
  const before = f.calls.length; f.setToken('spatial-session-two'); await f.backend.loadSpatialProjection()
  assert.ok(f.calls.slice(before).every(c => c.request.headers.get('authorization') === 'Bearer spatial-session-two'))
  assert.ok(f.calls.every(c => c.request.method === 'GET' && c.request.headers.get('apikey') === 'fixture-browser-key'))
})

test('spatial backend rejects other origins, withholds failed later pages, and retains missing-edge disclosure', async () => {
  const wrong = spatialFixture({ url: 'https://other-project.example.invalid' })
  for (const result of [await wrong.backend.loadSpatialProjection(), await wrong.backend.loadWorldViewGraph(), await wrong.backend.loadTemporalAssessment('event-one')]) assert.equal(result.reason, 'origin_not_v2')
  assert.equal(wrong.calls.length, 0)
  const rows = Array.from({ length: 1001 }, (_, i) => ({ ...spatialRow, revision_id: String(i).padStart(5, '0') }))
  const failed = spatialFixture({ tables: { ...spatialTables(), spatial_projection_v1: rows }, errors: { spatial_projection_v1: p => p.has('revision_id') ? { message: 'read denied' } : null, edges: { code: '42P01', message: 'missing edges' } } })
  const projection = await failed.backend.loadSpatialProjection(); assert.equal(projection.status, 'unavailable'); assert.deepEqual(projection.rows, [])
  const graph = await failed.backend.loadWorldViewGraph(); assert.equal(graph.status, 'ok'); assert.equal(graph.nodes.length, 1); assert.deepEqual(graph.edges, []); assert.ok(graph.edgesUnavailable)
})

test('spatial temporal reads retain the registered composer hash and reject altered assessments', async () => {
  const source = readFileSync(new URL('./temporalAssessment.test.mjs', import.meta.url), 'utf8')
  const value = JSON.parse(source.match(/const CLEVELAND_VALUE_TEXT =\s*'([^']+)'/)[1])
  const tables = { pipeline_config: [{ key: CLEVELAND_ASSESSMENT_KEY, value }] }, f = spatialFixture({ tables })
  const result = await f.backend.loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(result.status, 'ok'); assert.equal(result.displayStatus, 'insufficient_history'); assert.equal(result.expectedRange, null)
  value.display.copy = 'within expected range'
  assert.equal((await f.backend.loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID)).reason, 'sha_mismatch')
  assert.ok(f.calls.every(c => c.params.get('key') === `eq.${CLEVELAND_ASSESSMENT_KEY}`))
})

test('shared weather capability refuses restricted service terms without database credentials or present-day values', async () => {
  const f = spatialFixture(), originalFetch = globalThis.fetch, requests = []
  globalThis.fetch = async (url, init) => { requests.push(new Request(url, init)); return new Response(JSON.stringify({ hourly: { time: ['2024-04-08T18:00'], temperature_2m: [12], precipitation: [0], wind_speed_10m: [10], wind_direction_10m: [270] }, hourly_units: { temperature_2m: '°C' }, model: 'era5' }), { headers: { 'content-type': 'application/json' } }) }
  try {
    const result = await f.backend.loadEventTimeWeather({ row: spatialRow, atMs: Date.parse('2024-04-08T18:00:00Z'), fetchImpl: () => { throw Error('override must not run') } })
    assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'source_terms_incompatible')
    assert.ok(Object.values(result.fields).every(value => value === null)); assert.ok(Object.values(result.provenance).every(value => value === null))
    assert.equal(requests.length, 0)
    const now = Date.now(), today = { ...spatialRow, valid_from_utc: new Date(now - 1000).toISOString(), valid_to_utc: new Date(now + 1000).toISOString() }
    assert.equal((await f.backend.loadEventTimeWeather({ row: today, atMs: now })).reason, 'present_day_refused')
    assert.equal((await f.backend.loadEventTimeWeather({ row: spatialRow, atMs: 0 })).reason, 'time_not_in_valid_range')
    assert.equal(requests.length, 0); assert.equal(f.calls.length, 0)
  } finally { globalThis.fetch = originalFetch }
})
