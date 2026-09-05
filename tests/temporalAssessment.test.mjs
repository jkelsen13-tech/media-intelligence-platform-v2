// R4.5 Step 8 — Temporal Intelligence DISPLAY-only.
//
// Reads the shared V2 pipeline_config assessment. Never recomputes from
// News V/F, Source Comparison lagHours, or Arcs CoverageGapBar. Never
// invents expected-range, weather, truth_probability, edges, or titles.
// SHA mismatch / missing row / missing display.status / truth_probability
// fail closed to "temporal assessment unavailable".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CLEVELAND_ASSESSMENT_COMPOSER_SHA256,
  CLEVELAND_ASSESSMENT_KEY,
  CLEVELAND_CANONICAL_EVENT_ID,
  TEMPORAL_ASSESSMENT_VERSION,
  TEMPORAL_FEATURE_CONTRACT_ID,
  TEMPORAL_FEATURE_CONTRACT_SHA256,
  TEMPORAL_N1_HONEST_COPY,
  canonicalEventIdFromWorldView,
  encodePostgresJsonbText,
  loadTemporalAssessment,
  pinFetchedAssessment,
  sha256HexUtf8,
  temporalAssessmentConfigKey,
  temporalAssessmentViewFromValue,
} from '../src/lib/temporalAssessment.js'

const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const WORLD_CSS = readFileSync(new URL('../src/views/worldview.css', import.meta.url), 'utf8')
const TEMPORAL = readFileSync(new URL('../src/lib/temporalAssessment.js', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const SC = readFileSync(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')
const ARCS = readFileSync(new URL('../src/components/ArcEvidencePanel.jsx', import.meta.url), 'utf8')
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

// Exact Postgres jsonb::text for the live Cleveland row (verified 2026-09-03).
const CLEVELAND_VALUE_TEXT =
  '{"method": {"tier0": "classical_harness_scored_insufficient_history", "tier1": "not_run", "tier2": "not_run"}, "display": {"copy": "insufficient history", "panel": "temporal assessment unavailable", "status": "insufficient_history", "vocabulary": "insufficient_history"}, "deviation": {"status": "insufficient_history"}, "selection": "classical_only", "provenance": {"section16": "insufficient_history / temporal assessment unavailable", "selection": "classical_only", "clock_source": "spatial_projection_reusable_fields", "production_model": null, "populated_signal_count": 0}, "known_at_utc": "2026-09-03T01:50:15.865651+00", "as_of_known_at": "2026-09-03", "expected_range": {"status": "insufficient_history"}, "observed_state": {"status": "insufficient_history"}, "model_uncertainty": {"status": "not_applicable"}, "assessment_version": "temporal_assessment_v0.1", "canonical_event_id": "acc55cb2-5ac2-4aed-be36-3f576d2bc443", "change_point_state": {"status": "insufficient_history"}, "detector_agreement": {"status": "insufficient_history"}, "feature_set_version": "temporal_feature_set_v0.1", "feature_snapshot_key": "temporal.feature_snapshot.v0.1.acc55cb2-5ac2-4aed-be36-3f576d2bc443", "cross_signal_inconsistency": {"status": "insufficient_history"}}'

const CLEVELAND_VALUE = JSON.parse(CLEVELAND_VALUE_TEXT)

const LEFTOVER_URL = 'https://yhbwnrtlqbjtcrrlpbge.supabase.co'

function fakePipelineClient(rowsByKey, { error = null, supabaseUrl } = {}) {
  let fromCalls = 0
  const selects = []
  return {
    supabaseUrl,
    fromCalls: () => fromCalls,
    selects,
    from(table) {
      fromCalls += 1
      selects.push(table)
      const state = { eq: null }
      const q = {
        select() {
          return q
        },
        eq(col, val) {
          state.eq = [col, val]
          return q
        },
        async maybeSingle() {
          if (error) return { data: null, error }
          if (table !== 'pipeline_config') return { data: null, error: { message: `unexpected table ${table}` } }
          const key = state.eq?.[0] === 'key' ? state.eq[1] : null
          const row = key && Object.hasOwn(rowsByKey, key) ? rowsByKey[key] : null
          return { data: row, error: null }
        },
      }
      return q
    },
  }
}

function explodingClient(url) {
  let fromCalls = 0
  return {
    supabaseUrl: url,
    fromCalls: () => fromCalls,
    from() {
      fromCalls += 1
      throw new Error('non-V2 client must not fetch')
    },
  }
}

test('contract ids and Cleveland key stay pinned', () => {
  assert.equal(TEMPORAL_FEATURE_CONTRACT_ID, 'MIP_TEMPORAL_FEATURE_CONTRACT_v0.1')
  assert.equal(TEMPORAL_FEATURE_CONTRACT_SHA256, '59a5c56c7ce78bbd8b712f6e06781a47fdc1540bea73e1ec30ae8fb64e399605')
  assert.equal(TEMPORAL_ASSESSMENT_VERSION, 'temporal_assessment_v0.1')
  assert.equal(CLEVELAND_CANONICAL_EVENT_ID, 'acc55cb2-5ac2-4aed-be36-3f576d2bc443')
  assert.equal(CLEVELAND_ASSESSMENT_KEY, 'temporal.assessment.v0.1.acc55cb2-5ac2-4aed-be36-3f576d2bc443')
  assert.equal(CLEVELAND_ASSESSMENT_COMPOSER_SHA256, 'cbd97108f963fc2dcbe6e91d2ca02a79bd95649037369f1dd67c9bc8a00cc21e')
  assert.equal(temporalAssessmentConfigKey(CLEVELAND_CANONICAL_EVENT_ID), CLEVELAND_ASSESSMENT_KEY)
  assert.equal(TEMPORAL_N1_HONEST_COPY.copy, 'insufficient history')
  assert.equal(TEMPORAL_N1_HONEST_COPY.panel, 'temporal assessment unavailable')
})

test('Cleveland jsonb::text encoder reproduces the composer SHA-256 pin', async () => {
  assert.equal(encodePostgresJsonbText(CLEVELAND_VALUE), CLEVELAND_VALUE_TEXT)
  assert.equal(await sha256HexUtf8(CLEVELAND_VALUE_TEXT), CLEVELAND_ASSESSMENT_COMPOSER_SHA256)
  assert.equal(await sha256HexUtf8(encodePostgresJsonbText(CLEVELAND_VALUE)), CLEVELAND_ASSESSMENT_COMPOSER_SHA256)
})

test('pinned Cleveland object displays insufficient history / temporal assessment unavailable', async () => {
  const view = await pinFetchedAssessment(CLEVELAND_VALUE, CLEVELAND_ASSESSMENT_KEY)
  assert.equal(view.status, 'ok')
  assert.equal(view.reason, null)
  assert.equal(view.displayStatus, 'insufficient_history')
  assert.equal(view.copy, 'insufficient history')
  assert.equal(view.panel, 'temporal assessment unavailable')
  assert.equal(view.canonicalEventId, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(view.assessmentVersion, TEMPORAL_ASSESSMENT_VERSION)
  assert.equal(view.productionModel, null)
  assert.equal(view.expectedRange, null)
  assert.equal(view.sha256, CLEVELAND_ASSESSMENT_COMPOSER_SHA256)
  assert.doesNotMatch(JSON.stringify(view), /truth_probability/)
  assert.doesNotMatch(view.copy, /expected range|within|above|below/i)
  assert.doesNotMatch(view.panel, /expected range/i)
})

test('n=1 does not invent expected-range copy or numbers', () => {
  const view = temporalAssessmentViewFromValue(CLEVELAND_VALUE, { key: CLEVELAND_ASSESSMENT_KEY })
  assert.equal(view.expectedRange, null)
  assert.equal(CLEVELAND_VALUE.expected_range.status, 'insufficient_history')
  assert.ok(!Object.hasOwn(CLEVELAND_VALUE.expected_range, 'low'))
  assert.ok(!Object.hasOwn(CLEVELAND_VALUE.expected_range, 'high'))
  assert.ok(!Object.hasOwn(CLEVELAND_VALUE, 'truth_probability'))
})

test('hashing failure withholds with hash_unavailable and does not reject', async () => {
  const view = await pinFetchedAssessment(CLEVELAND_VALUE, CLEVELAND_ASSESSMENT_KEY, {
    hashFn: async () => {
      throw new Error('digest unavailable')
    },
  })
  assert.equal(view.status, 'unavailable')
  assert.equal(view.reason, 'hash_unavailable')
  assert.equal(view.copy, 'temporal assessment unavailable')
  assert.equal(view.expectedRange, null)
})

test('SHA mismatch fail-closes to temporal assessment unavailable', async () => {
  const tampered = { ...CLEVELAND_VALUE, as_of_known_at: '2099-01-01' }
  const view = await pinFetchedAssessment(tampered, CLEVELAND_ASSESSMENT_KEY)
  assert.equal(view.status, 'unavailable')
  assert.equal(view.reason, 'sha_mismatch')
  assert.equal(view.copy, 'temporal assessment unavailable')
  assert.equal(view.panel, 'temporal assessment unavailable')
  assert.equal(view.expectedRange, null)
  assert.notEqual(view.sha256, CLEVELAND_ASSESSMENT_COMPOSER_SHA256)
})

test('missing row / read error fail-close to temporal assessment unavailable', async () => {
  const empty = await loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID, {
    supabaseClient: fakePipelineClient({}),
  })
  assert.equal(empty.status, 'unavailable')
  assert.equal(empty.reason, 'missing_row')
  assert.equal(empty.copy, 'temporal assessment unavailable')

  const readErr = await loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID, {
    supabaseClient: fakePipelineClient({}, { error: { message: 'permission denied' } }),
  })
  assert.equal(readErr.status, 'unavailable')
  assert.equal(readErr.reason, 'read_error')
  assert.equal(readErr.copy, 'temporal assessment unavailable')
})

test('missing display.status fail-closes to temporal assessment unavailable', () => {
  const noStatus = structuredClone(CLEVELAND_VALUE)
  delete noStatus.display.status
  const view = temporalAssessmentViewFromValue(noStatus, { key: CLEVELAND_ASSESSMENT_KEY })
  assert.equal(view.status, 'unavailable')
  assert.equal(view.reason, 'missing_display_status')
  assert.equal(view.copy, 'temporal assessment unavailable')
})

test('truth_probability anywhere fail-closes to temporal assessment unavailable', () => {
  const withTruth = { ...CLEVELAND_VALUE, truth_probability: 0.42 }
  const view = temporalAssessmentViewFromValue(withTruth, { key: CLEVELAND_ASSESSMENT_KEY })
  assert.equal(view.status, 'unavailable')
  assert.equal(view.reason, 'forbidden_field')
  assert.equal(view.copy, 'temporal assessment unavailable')
  assert.doesNotMatch(JSON.stringify(view), /0\.42/)
})

test('loadTemporalAssessment displays the pinned Cleveland object and does not write', async () => {
  const client = fakePipelineClient({
    [CLEVELAND_ASSESSMENT_KEY]: { key: CLEVELAND_ASSESSMENT_KEY, value: CLEVELAND_VALUE },
  })
  const view = await loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID, { supabaseClient: client })
  assert.equal(view.status, 'ok')
  assert.equal(view.copy, 'insufficient history')
  assert.equal(view.panel, 'temporal assessment unavailable')
  assert.equal(view.displayStatus, 'insufficient_history')
  assert.equal(view.expectedRange, null)
  assert.deepEqual(client.selects, ['pipeline_config'])
  assert.equal(client.fromCalls(), 1)
})

test('no canonical event omits a fetch and returns unavailable', async () => {
  const client = fakePipelineClient({})
  const view = await loadTemporalAssessment(null, { supabaseClient: client })
  assert.equal(view.status, 'unavailable')
  assert.equal(view.reason, 'no_event')
  assert.equal(view.copy, 'temporal assessment unavailable')
  assert.equal(client.fromCalls(), 0)
})

test('non-V2 origin never fetches; missing env fails closed', async () => {
  const leftover = explodingClient(LEFTOVER_URL)
  const rejected = await loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID, { supabaseClient: leftover })
  assert.equal(rejected.status, 'unavailable')
  assert.equal(rejected.reason, 'origin_not_v2')
  assert.equal(rejected.copy, 'temporal assessment unavailable')
  assert.equal(leftover.fromCalls(), 0)

  const missing = await loadTemporalAssessment(CLEVELAND_CANONICAL_EVENT_ID, { envUrl: undefined })
  assert.equal(missing.status, 'unavailable')
  assert.ok(['missing', 'empty', 'client_not_configured'].includes(missing.reason))
  assert.equal(missing.copy, 'temporal assessment unavailable')
})

test('World View binds selected/visible row to the Cleveland canonical event id', () => {
  const selected = { id: CLEVELAND_CANONICAL_EVENT_ID, slug: 'evt-cleveland-eclipse-2024' }
  const visibleRow = { subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID, mip_object_id: '777b3951-4a82-4dd7-befb-958991b1318f' }
  assert.equal(canonicalEventIdFromWorldView(selected, visibleRow), CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(canonicalEventIdFromWorldView(selected, null), CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(canonicalEventIdFromWorldView(null, null), null)
})

test('World View inspector DISPLAY only: Temporal Intelligence, no local recompute', () => {
  assert.match(WORLD, /Temporal Intelligence/)
  assert.match(WORLD, /loadTemporalAssessment/)
  assert.match(WORLD, /canonicalEventIdFromWorldView/)
  assert.match(WORLD, /TemporalIntelligenceBlock/)
  assert.match(WORLD, /wv-temporal/)
  assert.match(WORLD_CSS, /\.wv-temporal\b/)
  assert.doesNotMatch(WORLD, /truth_probability/)
  assert.doesNotMatch(WORLD, /expected_range|expectedRange/)
  assert.doesNotMatch(WORLD, /lagHours|CoverageGapBar/)
  assert.doesNotMatch(WORLD, /within expected range|above expected range|below expected range/)
  assert.doesNotMatch(WORLD, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
})

test('News, Source Comparison, and Arcs omit Temporal Intelligence (no local recompute)', () => {
  assert.doesNotMatch(NEWS, /temporalAssessment|loadTemporalAssessment|Temporal Intelligence/)
  assert.doesNotMatch(SC, /temporalAssessment|loadTemporalAssessment|Temporal Intelligence/)
  assert.doesNotMatch(ARCS, /temporalAssessment|loadTemporalAssessment|Temporal Intelligence/)
  assert.doesNotMatch(APP, /loadTemporalAssessment/)
  assert.match(SC, /lagHours/)
  assert.match(ARCS, /function CoverageGapBar/)
})

test('loader is SELECT-only: no V2 writes, no edges, no story_arcs.title, no reader_state, no weather', () => {
  assert.match(TEMPORAL, /select\('key, value'\)/)
  assert.doesNotMatch(TEMPORAL, /\.(insert|upsert|delete|rpc)\(/)
  assert.doesNotMatch(TEMPORAL, /\.update\(\s*\{/)
  assert.doesNotMatch(TEMPORAL, /from\('edges'\)/)
  assert.doesNotMatch(TEMPORAL, /from\('story_arcs'\)|story_arcs\.title/)
  assert.doesNotMatch(TEMPORAL, /reader_state/)
  assert.doesNotMatch(TEMPORAL, /import .*NewsView|import .*sourceComparison|import .*ArcEvidencePanel/)
  assert.doesNotMatch(TEMPORAL, /open-meteo|openweathermap|weatherPanelState/)
  assert.match(TEMPORAL, /forbidden_field/)
  assert.match(TEMPORAL, /truth_probability/)
})
