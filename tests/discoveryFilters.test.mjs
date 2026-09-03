// R4.75 Step 4 — Discovery vs investigation filter split.
// DISPLAY / client only. Discovery chips must not leak onto Investigation
// Context evidence. Investigation view-slices must not replace the subject.
// No URL / deep-link contract (that is Step 6).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  setInvestigationAsOfTime,
  INVESTIGATION_CONTEXT_FIELDS,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import { selectionStubFromProjection } from '../src/lib/spatialProjection.js'
import {
  DISCOVERY_FILTER_FIELDS,
  EMPTY_DISCOVERY_FILTERS,
  emptyDiscoveryFilters,
  applyDiscoveryFilters,
  applyDiscoveryBesideInvestigation,
  investigationEvidenceUnfilteredByDiscovery,
  discoveryFiltersAreActive,
  applyGraphInvestigationSlice,
  applyGraphSliceBesideSubject,
  emptyGraphInvestigationSlice,
} from '../src/lib/discoveryFilters.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const TIMELINE = readFileSync(new URL('../src/views/TimelineView.jsx', import.meta.url), 'utf8')
const ARCS = readFileSync(new URL('../src/views/ArcsView.jsx', import.meta.url), 'utf8')
const GRAPH_VIEW = readFileSync(new URL('../src/graph/GraphView.jsx', import.meta.url), 'utf8')
const IC = readFileSync(new URL('../src/lib/investigationContext.js', import.meta.url), 'utf8')
const DISC = readFileSync(new URL('../src/lib/discoveryFilters.js', import.meta.url), 'utf8')

const CLEVELAND_MIP_OBJECT_ID = '777b3951-4a82-4dd7-befb-958991b1318f'
const INVENTED_EVENT_ID = '00000000-0000-0000-0000-ffffffffffff'

const CLEVELAND_ROW = Object.freeze({
  mip_object_id: CLEVELAND_MIP_OBJECT_ID,
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID,
  spatial_role: 'event',
  parent_event_id: null,
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
})

function seedCleveland(activeView = 'world') {
  return applySubject(
    emptyInvestigationContext(activeView),
    subjectFromWorldViewSelection({
      node: selectionStubFromProjection(CLEVELAND_ROW),
      row: CLEVELAND_ROW,
    }),
  )
}

test('discovery state is a named contract and does not grow Investigation Context', () => {
  const empty = emptyDiscoveryFilters()
  for (const field of DISCOVERY_FILTER_FIELDS) {
    assert.ok(Object.hasOwn(empty, field), `missing discovery field ${field}`)
    assert.ok(!INVESTIGATION_CONTEXT_FIELDS.includes(field), `IC must not gain ${field}`)
  }
  assert.equal(empty.region, 'all')
  assert.equal(empty.topic, 'all')
  assert.equal(empty.status, 'all')
  assert.equal(empty.dateRange, 'all')
  assert.equal(empty.evidenceBasis, 'all')
  assert.equal(empty.outlet, null)
  assert.deepEqual(empty, { ...EMPTY_DISCOVERY_FILTERS })
  assert.equal(discoveryFiltersAreActive(empty), false)
  assert.doesNotMatch(IC, /emptyDiscoveryFilters|DISCOVERY_FILTER|discoveryFilters/)
  assert.doesNotMatch(DISC, /applySubject\(|resetJumpContext\(/)
})

test('applying discovery filters does not change Cleveland or call applySubject', () => {
  const seeded = seedCleveland('news')
  assert.equal(seeded.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(seeded.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)

  const next = applyDiscoveryBesideInvestigation(seeded, emptyDiscoveryFilters(), {
    region: 'Europe',
    topic: 'climate',
    status: 'arc',
    dateRange: '7d',
  })

  assert.equal(next.investigationContext, seeded)
  assert.equal(next.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(next.investigationContext.canonical_subject_type, 'event')
  assert.equal(next.investigationContext.as_of_time, CLEVELAND_ROW.valid_from_utc)
  assert.equal(next.investigationContext.active_view, 'news')
  assert.notEqual(next.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)
  assert.notEqual(next.investigationContext.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)
  assert.equal(next.discovery.region, 'Europe')
  assert.equal(next.discovery.topic, 'climate')
  assert.equal(next.discovery.status, 'arc')
  assert.equal(next.discovery.dateRange, '7d')
  assert.equal(discoveryFiltersAreActive(next.discovery), true)
  assert.equal(applyDiscoveryFilters(emptyDiscoveryFilters(), { canonical_subject_id: INVENTED_EVENT_ID }).canonical_subject_id, undefined)
})

test('§7.3 no leakage: discovery Region Europe does not hide US-origin investigation evidence', () => {
  const seeded = seedCleveland('graph')
  const usSupporting = Object.freeze({
    role: 'supporting_source',
    origin_region: 'US',
    canonical_subject_id: CLEVELAND_CANONICAL_EVENT_ID,
  })
  const kept = investigationEvidenceUnfilteredByDiscovery([usSupporting], {
    region: 'Europe',
    topic: 'climate',
    status: 'arc',
    dateRange: '7d',
  })
  assert.equal(kept.length, 1)
  assert.equal(kept[0], usSupporting)
  assert.equal(kept[0].origin_region, 'US')
  assert.equal(kept[0].canonical_subject_id, seeded.canonical_subject_id)
  assert.notEqual(kept[0].origin_region, 'Europe')
})

test('investigation filters do not replace canonical_subject_id', () => {
  const seeded = seedCleveland('graph')
  const timed = setInvestigationAsOfTime(seeded, '2024-04-08T18:00:00.000Z')
  assert.equal(timed.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(timed.canonical_subject_type, 'event')
  assert.equal(timed.as_of_time, '2024-04-08T18:00:00.000Z')
  assert.equal(timed.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)

  const sliced = applyGraphSliceBesideSubject(
    timed,
    emptyGraphInvestigationSlice(),
    { graphRegion: 'institutions', focusExpansion: 1 },
  )
  assert.equal(sliced.investigationContext, timed)
  assert.equal(sliced.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(sliced.slice.graphRegion, 'institutions')
  assert.equal(sliced.slice.focusExpansion, 1)
  assert.deepEqual(applyGraphInvestigationSlice({ graphRegion: 'all', focusExpansion: 0 }, { graphRegion: 'europe' }).graphRegion, 'europe')
})

test('source-scan: News/Explore labeled discovery; Graph/World View/Timeline are investigation', () => {
  assert.match(NEWS, /emptyDiscoveryFilters/)
  assert.match(NEWS, /applyDiscoveryFilters/)
  assert.match(NEWS, /data-filter-family="discovery"/)
  assert.match(NEWS, /Discovery filters/)
  assert.match(NEWS, /These chips scope the News \/ Explore feed/)
  assert.doesNotMatch(NEWS, /applySubject/)
  assert.doesNotMatch(NEWS, /resetJumpContext/)
  assert.doesNotMatch(NEWS, /setInvestigationContext/)
  assert.doesNotMatch(NEWS, /setInvestigationActiveView/)

  assert.match(APP, /data-filter-family="investigation"/)
  assert.match(APP, /Investigation filters/)
  assert.match(APP, /Not News \/ Explore discovery\.region/)
  assert.match(WORLD, /data-filter-family="investigation"/)
  assert.match(WORLD, /Investigation filters/)
  assert.match(WORLD, /writes as_of_time only/)
  assert.match(TIMELINE, /data-filter-family="investigation"/)
  assert.match(TIMELINE, /Investigation filters/)

  assert.doesNotMatch(APP, /from ['"].*discoveryFilters/)
  assert.doesNotMatch(WORLD, /from ['"].*discoveryFilters/)
  assert.doesNotMatch(TIMELINE, /from ['"].*discoveryFilters/)
  assert.doesNotMatch(ARCS, /from ['"].*discoveryFilters/)
  assert.doesNotMatch(GRAPH_VIEW, /from ['"].*discoveryFilters/)
  assert.doesNotMatch(WORLD, /discovery\.region|patchDiscovery|emptyDiscoveryFilters/)
  assert.doesNotMatch(TIMELINE, /discovery\.region|patchDiscovery|emptyDiscoveryFilters/)
  assert.doesNotMatch(ARCS, /discovery\.region|patchDiscovery|emptyDiscoveryFilters/)

  const regionIdx = APP.indexOf('className="graph-region-filter"')
  assert.notEqual(regionIdx, -1)
  const regionBlock = APP.slice(regionIdx, APP.indexOf('</label>', regionIdx) + 8)
  assert.ok(regionBlock.includes('setGraphRegion'))
  assert.ok(!regionBlock.includes('patchDiscovery'))
  assert.ok(!regionBlock.includes('applySubject'))
  assert.ok(!regionBlock.includes('resetJumpContext'))
  assert.ok(!regionBlock.includes('discovery.region'))

  const expandIdx = APP.indexOf('setFocusExpansion((depth) => Math.min(depth + 1, 2))')
  assert.notEqual(expandIdx, -1)
  const expandWindow = APP.slice(Math.max(0, expandIdx - 200), expandIdx + 80)
  assert.ok(!expandWindow.includes('applySubject'))
  assert.ok(!expandWindow.includes('patchDiscovery'))
})

test('no URL / deep-link filter contract', () => {
  assert.doesNotMatch(DISC, /URLSearchParams|location\.search|history\.(push|replace)/)
  assert.doesNotMatch(NEWS, /URLSearchParams|history\.(push|replace)/)
  assert.doesNotMatch(IC, /URLSearchParams/)
  const appFilterIdx = APP.indexOf('graph-investigation-filters')
  const appFilterBlock = APP.slice(appFilterIdx, APP.indexOf('graph-scope-status', appFilterIdx))
  assert.doesNotMatch(appFilterBlock, /URLSearchParams|location\.search|history\.(push|replace)/)
})

test('DISPLAY-only: no V2 writes, no invented Cleveland literal in production src', () => {
  assert.doesNotMatch(DISC, /\.(insert|upsert|update|delete|rpc)\(/)
  assert.doesNotMatch(DISC, /reader_state/)
  assert.doesNotMatch(DISC, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(NEWS, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(APP, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
})
