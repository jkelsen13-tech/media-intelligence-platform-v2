// R4.75 Step 8 — closeout evidence lock (DISPLAY / docs + tests only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §16 Step 8 / §19 / §20. Does not start R5. Does not write V2.
//
// Re-locks shipped Steps 1–7 invariants so the closeout matrix is
// machine-checkable. Does not add product UI.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  preserveSubjectAcrossViews,
  INVESTIGATION_CONTEXT_FIELDS,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import {
  selectionStubFromProjection,
  G2_DIMENSIONS,
  labeledG2Dimensions,
  confidenceTextDimension,
} from '../src/lib/spatialProjection.js'
import { preserveInvestigationThroughExplore, EXPLORE_SHELL_NON_MUTATING_ACTIONS } from '../src/lib/exploreShell.js'
import {
  emptyDiscoveryFilters,
  applyDiscoveryBesideInvestigation,
  investigationEvidenceUnfilteredByDiscovery,
} from '../src/lib/discoveryFilters.js'
import { commitNewSubject } from '../src/lib/newSubjectPropagation.js'
import { parseDeepLink, reconstructFromDeepLink, canonicalSubjectIdFromDisplayText } from '../src/lib/deepLinks.js'
import { JOIN_STATE_KINDS, classifyJoinState, weatherJoinState } from '../src/lib/investigationJoinState.js'
import { FORBIDDEN_LAUNCH_WIDGETS, overlayAllowed } from '../src/lib/worldViewPrivacyLock.js'

const CLOSEOUT = readFileSync(new URL('../docs/R4_75_STEP8_CLOSEOUT_2026-09-03.md', import.meta.url), 'utf8')
const STOPPING_SHA = '49010caeb22913215aa4dcab08ffe7c8a4ccb5fd'
const INDEX_ASSET = 'assets/index-CsIIFAtO.js'
const MAP_ASSET = 'assets/map-stack-BRFtLxm-.js'

const CLEVELAND_MIP_OBJECT_ID = '777b3951-4a82-4dd7-befb-958991b1318f'
const INVENTED_EVENT_ID = '00000000-0000-0000-0000-ffffffffffff'
const FIXTURE_B_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const STALE_ENTITY_ID = 'stale-entity-not-in-parent'

const CLEVELAND_ROW = Object.freeze({
  mip_object_id: CLEVELAND_MIP_OBJECT_ID,
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID,
  spatial_role: 'event',
  parent_event_id: null,
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
  relationship_qualifier: 'none',
  review_state: 'operative',
  uncertainty_class: null,
  confidence: null,
})

const TAB_CYCLE = Object.freeze(['news', 'graph', 'timeline', 'arcs', 'world'])

const SECTION19_IDS = Object.freeze([
  '19-A',
  '19-B',
  '19-C',
  '19-D',
  '19-E',
  '19-F',
  '19-G',
  '19-H',
  '19-I',
  '19-J',
  '19-K',
  '19-L',
  '19-M',
  '19-N',
  '19-O',
  '19-P',
  '19-Q',
  '19-R',
  '19-S',
  '19-T',
  '19-U',
  '19-V',
  '19-W',
  '19-X',
  '19-Y',
  '19-Z',
])

const STEP_TEST_FILES = Object.freeze([
  'tests/investigationContext.test.mjs',
  'tests/exploreShell.test.mjs',
  'tests/discoveryFilters.test.mjs',
  'tests/newSubjectPropagation.test.mjs',
  'tests/deepLinks.test.mjs',
  'tests/recentInvestigation.test.mjs',
  'tests/investigationJoinState.test.mjs',
  'tests/worldViewLaunch.test.mjs',
  'tests/spatialProjection.test.mjs',
  'tests/newsSchemaFailClose.test.mjs',
])

const R475_SRC = Object.freeze([
  'src/lib/investigationContext.js',
  'src/lib/exploreShell.js',
  'src/lib/discoveryFilters.js',
  'src/lib/newSubjectPropagation.js',
  'src/lib/deepLinks.js',
  'src/lib/recentInvestigation.js',
  'src/lib/investigationJoinState.js',
])

const WORLDVIEW_AK_TESTS = Object.freeze([
  'A: bind live Cleveland city Point',
  'B: empty projection does not invent a city',
  'C: Graph / Map / Split keep one canonical id',
  'D: inspector has date/time, city precision, provenance, G2 separate, no composite score',
  'E: weather is ERA5 reanalysis at event time',
  'F: temporal DISPLAY is the shared assessment',
  'G: pan/zoom/scale-adaptive camera does not change precision class',
  'H: no private-person point/track/face',
  'I: base map / renderer attribution is visible',
  'J: live vs reconstructed vs unavailable remain distinct',
  'K: no Port Meridian / rings / AQI / shipping / humidity-cloud launch widgets',
])

function seedCleveland(activeView = 'world') {
  return applySubject(
    emptyInvestigationContext(activeView),
    subjectFromWorldViewSelection({
      node: selectionStubFromProjection(CLEVELAND_ROW),
      row: CLEVELAND_ROW,
    }),
  )
}

function collectSrcFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) collectSrcFiles(path, out)
    else if (/\.(js|jsx)$/.test(name)) out.push(path)
  }
  return out
}

test('closeout doc exists and records stopping SHA + live Pages assets', () => {
  assert.equal(existsSync(new URL('../docs/R4_75_STEP8_CLOSEOUT_2026-09-03.md', import.meta.url)), true)
  assert.match(CLOSEOUT, new RegExp(STOPPING_SHA))
  assert.match(CLOSEOUT, new RegExp(INDEX_ASSET.replace('.', '\\.')))
  assert.match(CLOSEOUT, new RegExp(MAP_ASSET.replace('.', '\\.')))
  assert.match(CLOSEOUT, /jkelsen13-tech\.github\.io\/media-intelligence-platform-v2/)
  assert.match(CLOSEOUT, /#\/event\/acc55cb2-5ac2-4aed-be36-3f576d2bc443\/world/)
  assert.match(CLOSEOUT, /Do not merge/)
  assert.match(CLOSEOUT, /Frontend does not merge/)
  assert.match(CLOSEOUT, /Do not start R5|Do \*\*not\*\* start R5/)
  assert.match(CLOSEOUT, /No v2 writes/)
  assert.match(CLOSEOUT, /qikvmopbtijoebdqosyq/)
  assert.match(CLOSEOUT, /Stop for owner review/)
})

test('§19 matrix lists every closeout id as PASS with a test or live pointer', () => {
  for (const id of SECTION19_IDS) {
    const line = CLOSEOUT.split('\n').find((row) => row.includes(`| ${id} |`))
    assert.ok(line, `missing matrix row ${id}`)
    assert.match(line, /\*\*PASS\*\*/, `${id} must be PASS`)
    assert.match(line, /tests\/|Live /, `${id} must point at a test or live observation`)
  }
  assert.match(CLOSEOUT, /pull\/6/)
  assert.match(CLOSEOUT, /pull\/7/)
  assert.match(CLOSEOUT, /pull\/8/)
  assert.match(CLOSEOUT, /pull\/9/)
  assert.match(CLOSEOUT, /pull\/10/)
  assert.match(CLOSEOUT, /pull\/11/)
  assert.match(CLOSEOUT, /pull\/12/)
  assert.match(CLOSEOUT, /no dedicated R4_75 PR/)
})

test('World View §8 A–K verbatim PASS block is packaged; repo A–K tests remain', () => {
  const wv = readFileSync(new URL('./worldViewLaunch.test.mjs', import.meta.url), 'utf8')
  for (const title of WORLDVIEW_AK_TESTS) {
    assert.ok(wv.includes(title), `missing worldViewLaunch test: ${title}`)
  }
  assert.match(CLOSEOUT, /A PASS: Cleveland city Point \[-81\.7, 41\.4\]; 1 row; no second event/)
  assert.match(CLOSEOUT, /B PASS: honest empties \(public\.edges unavailable; invalid sub-selection → parent IC\); no demo city/)
  assert.match(CLOSEOUT, /C PASS: same canonical_subject_id across IC \/ Map \/ Graph \/ Split \/ inspector/)
  assert.match(CLOSEOUT, /D PASS: date\/time, city precision, provenance; G2 separate; CONFIDENCE \(NOT A TRUTH OR BIAS SCORE\); no mip_object_id schema dump/)
  assert.match(CLOSEOUT, /E PASS: event-time weather DELAYED ERA5\/Open-Meteo at 2024-04-08T17:00Z \(18°C \/ 0 mm \/ 13\.6 km\/h\); not present-day/)
  assert.match(CLOSEOUT, /F PASS: Temporal UNAVAILABLE \/ insufficient history; no expected-range \/ truth_probability/)
  assert.match(CLOSEOUT, /G PASS: pan\/zoom; precision class unchanged/)
  assert.match(CLOSEOUT, /H PASS: no person\/CCTV\/aircraft\/vessel overlays/)
  assert.match(CLOSEOUT, /I PASS: OSM\/OpenFreeMap attribution visible/)
  assert.match(CLOSEOUT, /J PASS: RECONSTRUCTED \/ DELAYED \/ UNAVAILABLE \/ UNCLASSIFIED labels distinct/)
  assert.match(CLOSEOUT, /K PASS: no Port Meridian \/ evacuation \/ AQI \/ shipping \/ humidity-cloud widgets/)
})

test('§19 shipped invariants: IC preserve, Explore non-mutate, filter split, deep link, honest join', () => {
  for (const field of INVESTIGATION_CONTEXT_FIELDS) {
    assert.ok(Object.hasOwn(emptyInvestigationContext(), field), field)
  }

  const cleveland = seedCleveland('world')
  assert.equal(cleveland.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(cleveland.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)
  const afterTabs = preserveSubjectAcrossViews(cleveland, TAB_CYCLE)
  assert.equal(afterTabs.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(afterTabs.canonical_subject_id, INVENTED_EVENT_ID)
  assert.notEqual(afterTabs.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)

  let ic = cleveland
  for (const action of EXPLORE_SHELL_NON_MUTATING_ACTIONS) {
    ic = preserveInvestigationThroughExplore(ic, action)
  }
  assert.equal(ic, cleveland)

  const europe = applyDiscoveryBesideInvestigation(cleveland, emptyDiscoveryFilters(), { region: 'Europe' })
  assert.equal(europe.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  const kept = investigationEvidenceUnfilteredByDiscovery(
    [{ origin_region: 'US', canonical_subject_id: CLEVELAND_CANONICAL_EVENT_ID }],
    europe.discovery,
  )
  assert.equal(kept[0].origin_region, 'US')

  const emptyNews = commitNewSubject(cleveland, { articles: [], eligibleCount: 0 })
  assert.equal(emptyNews.committed, false)
  assert.equal(emptyNews.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)

  const reconstructed = reconstructFromDeepLink(
    parseDeepLink(`#/event/${CLEVELAND_CANONICAL_EVENT_ID}/world`),
    { currentIc: emptyInvestigationContext('news'), catalog: { entity: [], claim: [], source: [], place: [] } },
  )
  assert.equal(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(reconstructed.investigationContext.active_view, 'world')
  assert.equal(canonicalSubjectIdFromDisplayText('Cleveland 2024 total solar eclipse'), null)

  const stale = reconstructFromDeepLink(
    parseDeepLink(`#/event/${CLEVELAND_CANONICAL_EVENT_ID}/graph?entity=${STALE_ENTITY_ID}`),
    {
      currentIc: cleveland,
      catalog: { entity: [{ id: CLEVELAND_CANONICAL_EVENT_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID }], claim: [], source: [], place: [] },
    },
  )
  assert.equal(stale.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(stale.selection.entity, null)
  assert.notEqual(stale.investigationContext.canonical_subject_id, FIXTURE_B_ID)

  const emptyJoin = classifyJoinState({ availableCount: 0, view: 'graph', subjectType: 'event' })
  assert.equal(emptyJoin.kind, 'no_joined_data')
  assert.equal(emptyJoin.inventedSubject, false)
  assert.ok(JOIN_STATE_KINDS.includes('insufficient_evidence'))
  assert.equal(weatherJoinState().inventedWeather, false)
})

test('standing: G2 separate, no composite score, spatial projection, no launch widgets', () => {
  const dims = labeledG2Dimensions(CLEVELAND_ROW)
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
  assert.equal(dims.length, G2_DIMENSIONS.length)
  const confidence = confidenceTextDimension(CLEVELAND_ROW)
  assert.match(confidence.label, /not a composite score/i)
  assert.equal(overlayAllowed('port-meridian'), false)
  assert.equal(overlayAllowed('cctv'), false)
  assert.ok(FORBIDDEN_LAUNCH_WIDGETS.includes('port-meridian'))
})

test('Step 1–7 test files exist; R4.75 src stays DISPLAY-only; no R5 product in this package', () => {
  for (const file of STEP_TEST_FILES) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, file)
  }

  for (const file of R475_SRC) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /\.(insert|upsert|update|delete|rpc)\(/, file)
    assert.doesNotMatch(src, /reader_state/, file)
    assert.doesNotMatch(src, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/, file)
    assert.doesNotMatch(src, /createClient|service_role/, file)
    assert.doesNotMatch(src, /Account Pipeline|account_pipeline/, file)
  }

  const srcFiles = collectSrcFiles(new URL('../src', import.meta.url).pathname)
  const bannedCesiumWord = /Cesium|cesium/
  const bannedIonAndProviders = /ion\.cesium|photorealistic 3d|google 3d tiles/i
  const bannedIonTokenStrings = /Ion\.defaultAccessToken|defaultAccessToken\s*=|ion\s*access\s*token/i
  const allowedCesiumFiles = [
    /\/src\/lib\/worldViewRendererAdapter\.js$/,
    /\/src\/lib\/worldViewCesiumEllipsoidRendererAdapter\.js$/,
  ]
  for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, bannedIonTokenStrings, file)
    assert.doesNotMatch(text, bannedIonAndProviders, file)

    const isAllowedCesiumFile = allowedCesiumFiles.some((re) => re.test(file))
    if (!isAllowedCesiumFile) {
      assert.doesNotMatch(text, bannedCesiumWord, file)
    }
    assert.doesNotMatch(text, /Port Meridian/, file)
  }

  assert.match(CLOSEOUT, /§17/)
  assert.match(CLOSEOUT, /inherits/)
  assert.doesNotMatch(CLOSEOUT, /this package starts R5|implements R5/)
})
