// R4.75 Step 5 — New-subject propagation contract.
// DISPLAY / client state only. Fixture select only — no live News rows.
// Cleveland → second fixture subject. One commit. Invalid sub-selections
// cleared. Discovery does not strip evidence or replace the subject.
// Honest empty News does not invent a subject.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  subjectFromGraphNode,
  preserveSubjectAcrossViews,
  selectionStubFromInvestigation,
  graphNodeMatchingInvestigation,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import { selectionStubFromProjection } from '../src/lib/spatialProjection.js'
import { JUMP_CLEARS } from '../src/lib/jumpReset.js'
import {
  applyDiscoveryBesideInvestigation,
  emptyDiscoveryFilters,
  investigationEvidenceUnfilteredByDiscovery,
} from '../src/lib/discoveryFilters.js'
import {
  ANALYTICAL_VIEWS,
  INVALID_SUBSELECTIONS_ON_NEW_SUBJECT,
  RETAINED_PREFERENCES_ON_NEW_SUBJECT,
  resolveCanonicalSubject,
  commitNewSubject,
  surfacesReadyFromInvestigation,
} from '../src/lib/newSubjectPropagation.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const COMPARE = readFileSync(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')
const IC = readFileSync(new URL('../src/lib/investigationContext.js', import.meta.url), 'utf8')
const PROP = readFileSync(new URL('../src/lib/newSubjectPropagation.js', import.meta.url), 'utf8')
const DISC = readFileSync(new URL('../src/lib/discoveryFilters.js', import.meta.url), 'utf8')
const SHELL = readFileSync(new URL('../src/lib/exploreShell.js', import.meta.url), 'utf8')

const CLEVELAND_MIP_OBJECT_ID = '777b3951-4a82-4dd7-befb-958991b1318f'
const INVENTED_EVENT_ID = '00000000-0000-0000-0000-ffffffffffff'
const FIXTURE_B_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const CLEVELAND_ROW = Object.freeze({
  mip_object_id: CLEVELAND_MIP_OBJECT_ID,
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID,
  spatial_role: 'event',
  parent_event_id: null,
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
})

const CLEVELAND_NODE = Object.freeze({
  id: CLEVELAND_CANONICAL_EVENT_ID,
  slug: 'evt-cleveland-eclipse-2024',
  label: 'Cleveland 2024 total solar eclipse',
  type: 'event',
  occurred_at: '2024-04-08T17:59:00+00',
})

const FIXTURE_B_NODE = Object.freeze({
  id: FIXTURE_B_ID,
  slug: 'evt-fixture-b',
  label: 'Fixture B subject',
  type: 'event',
  occurred_at: '2024-06-01T12:00:00+00',
})

const TAB_CYCLE = Object.freeze(['news', 'graph', 'timeline', 'arcs', 'world'])

function seedCleveland(activeView = 'world') {
  return applySubject(
    emptyInvestigationContext(activeView),
    subjectFromWorldViewSelection({
      node: selectionStubFromProjection(CLEVELAND_ROW),
      row: CLEVELAND_ROW,
    }),
  )
}

function callbackBody(src, name) {
  const start = src.indexOf(`const ${name} = useCallback`)
  assert.notEqual(start, -1, `${name} not found`)
  const dep = src.indexOf(']', start)
  assert.notEqual(dep, -1, `${name} dep array not found`)
  return src.slice(start, dep + 1)
}

test('fixture Cleveland → fixture B commits Investigation Context exactly once', () => {
  const cleveland = seedCleveland('graph')
  assert.equal(cleveland.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(cleveland.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)

  const result = commitNewSubject(cleveland, FIXTURE_B_NODE, { landingView: 'timeline' })
  assert.equal(result.commitCount, 1)
  assert.equal(result.committed, true)
  assert.equal(result.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.equal(result.investigationContext.canonical_subject_type, 'event')
  assert.equal(result.investigationContext.active_view, 'timeline')
  assert.notEqual(result.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(result.investigationContext.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)
  assert.notEqual(result.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)
  assert.equal(result.investigationContext.as_of_time, FIXTURE_B_NODE.occurred_at)
  assert.equal(
    result.investigationContext.temporal_assessment_reference,
    `temporal.assessment.v0.1.${FIXTURE_B_ID}`,
  )

  const samePayloadAgain = commitNewSubject(result.investigationContext, FIXTURE_B_NODE, {
    landingView: 'timeline',
  })
  assert.equal(samePayloadAgain.commitCount, 1)
  assert.equal(samePayloadAgain.investigationContext.canonical_subject_id, FIXTURE_B_ID)
})

test('invalid sub-selections are named for clear; discovery is not among them', () => {
  const cleveland = seedCleveland('graph')
  const result = commitNewSubject(cleveland, subjectFromGraphNode(FIXTURE_B_NODE))
  for (const key of JUMP_CLEARS) {
    assert.ok(result.clearSubSelections.includes(key), `missing JUMP_CLEARS key ${key}`)
  }
  for (const key of [
    'focusStack',
    'focusArc',
    'focusArticle',
    'focusTimelineEvent',
    'focusTimelineArc',
    'focusComparisonEvent',
    'activeLocationKey',
  ]) {
    assert.ok(result.clearSubSelections.includes(key), `missing leftover ${key}`)
  }
  assert.ok(!result.clearSubSelections.includes('discovery'))
  assert.ok(!result.clearSubSelections.includes('region'))
  assert.ok(!result.clearSubSelections.includes('investigationContext'))
  assert.ok(!result.clearSubSelections.includes('canonical_subject_id'))
  assert.equal(result.retainDiscoveryFilters, true)
  assert.ok(RETAINED_PREFERENCES_ON_NEW_SUBJECT.includes('discovery'))
  assert.ok(RETAINED_PREFERENCES_ON_NEW_SUBJECT.includes('active_view'))
  assert.deepEqual(
    [...INVALID_SUBSELECTIONS_ON_NEW_SUBJECT].slice(0, JUMP_CLEARS.length).sort(),
    [...JUMP_CLEARS].sort(),
  )
})

test('discovery filters do not strip new-subject evidence and do not replace the subject', () => {
  const cleveland = seedCleveland('news')
  const europe = applyDiscoveryBesideInvestigation(cleveland, emptyDiscoveryFilters(), {
    region: 'Europe',
    topic: 'climate',
  })
  assert.equal(europe.investigationContext, cleveland)
  assert.equal(europe.discovery.region, 'Europe')

  const result = commitNewSubject(europe.investigationContext, FIXTURE_B_NODE)
  assert.equal(result.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.equal(result.retainDiscoveryFilters, true)

  const usSupporting = Object.freeze({
    role: 'supporting_source',
    origin_region: 'US',
    canonical_subject_id: FIXTURE_B_ID,
  })
  const kept = investigationEvidenceUnfilteredByDiscovery([usSupporting], europe.discovery)
  assert.equal(kept.length, 1)
  assert.equal(kept[0], usSupporting)
  assert.equal(kept[0].canonical_subject_id, FIXTURE_B_ID)
  assert.notEqual(kept[0].origin_region, 'Europe')
})

test('tab / view preserve after commit; inspector bindings follow the new IC', () => {
  const cleveland = seedCleveland('world')
  const result = commitNewSubject(cleveland, FIXTURE_B_NODE, { landingView: 'graph' })
  assert.equal(result.investigationContext.active_view, 'graph')

  const afterTabs = preserveSubjectAcrossViews(result.investigationContext, TAB_CYCLE)
  assert.equal(afterTabs.canonical_subject_id, FIXTURE_B_ID)
  assert.equal(afterTabs.canonical_subject_type, 'event')
  assert.equal(afterTabs.active_view, 'world')
  assert.notEqual(afterTabs.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)

  const surfaces = surfacesReadyFromInvestigation(afterTabs)
  for (const view of ANALYTICAL_VIEWS) {
    assert.equal(surfaces[view].canonical_subject_id, FIXTURE_B_ID)
    assert.equal(surfaces[view].readyWithoutSearch, true)
    assert.equal(surfaces[view].inspector['data-canonical-subject-id'], FIXTURE_B_ID)
  }

  const stub = selectionStubFromInvestigation(afterTabs)
  assert.equal(stub.id, FIXTURE_B_ID)
  assert.equal(stub.subject_graph_node_id, FIXTURE_B_ID)
  assert.equal(graphNodeMatchingInvestigation([FIXTURE_B_NODE, CLEVELAND_NODE], afterTabs)?.id, FIXTURE_B_ID)
  assert.equal(graphNodeMatchingInvestigation([CLEVELAND_NODE], afterTabs), null)
})

test('honest empty News does not invent a subject or wipe Cleveland without a select', () => {
  const cleveland = seedCleveland('news')
  const emptyFeed = { articles: [], articlesUnavailable: null, eligibleCount: 0 }
  const noSelect = commitNewSubject(cleveland, emptyFeed)
  assert.equal(noSelect.committed, false)
  assert.equal(noSelect.commitCount, 0)
  assert.equal(noSelect.investigationContext, cleveland)
  assert.equal(noSelect.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(noSelect.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)
  assert.notEqual(noSelect.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.deepEqual(noSelect.clearSubSelections, [])

  const fromEmpty = commitNewSubject(emptyInvestigationContext('news'), emptyFeed)
  assert.equal(fromEmpty.committed, false)
  assert.equal(fromEmpty.investigationContext.canonical_subject_id, null)
  assert.notEqual(fromEmpty.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(fromEmpty.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)

  assert.equal(resolveCanonicalSubject(null).canonical_subject_id, null)
  assert.equal(resolveCanonicalSubject({ articles: [] }).canonical_subject_id, null)
  assert.equal(resolveCanonicalSubject(FIXTURE_B_NODE).canonical_subject_id, FIXTURE_B_ID)
})

test('Explore / News explicit select paths use the single commitNewSubject seam', () => {
  assert.match(APP, /commitNewSubject/)
  assert.match(APP, /clearInvalidNewSubjectSubSelections/)
  assert.match(APP, /from ['"].*newSubjectPropagation['"]/)

  for (const handler of [
    'openNodeInGraph',
    'openArcInView',
    'openArticleInNews',
    'openEventInTimeline',
    'openComparisonEvent',
  ]) {
    const body = callbackBody(APP, handler)
    assert.ok(body.includes('commitNewSubject'), `${handler} must commit via commitNewSubject`)
    assert.ok(body.includes('resetJumpContext()'), `${handler} must still JUMP_CLEARS`)
    assert.ok(
      body.includes('clearInvalidNewSubjectSubSelections()'),
      `${handler} must clear prior-subject leftovers`,
    )
    assert.ok(!body.includes('applySubject('), `${handler} must not applySubject locally`)
  }

  const wrapBody = callbackBody(APP, 'closeExploreThen')
  assert.ok(wrapBody.includes('setExploreOpen(false)'))
  assert.ok(wrapBody.includes('handler(...args)'))
  assert.ok(!wrapBody.includes('commitNewSubject'), 'wrapper itself must not commit')
  assert.ok(!wrapBody.includes('applySubject'))

  const openBody = callbackBody(APP, 'openExplore')
  assert.ok(!openBody.includes('commitNewSubject'))
  const closeBody = callbackBody(APP, 'closeExplore')
  assert.ok(!closeBody.includes('commitNewSubject'))
  const changeBody = callbackBody(APP, 'changeView')
  assert.ok(!changeBody.includes('commitNewSubject'))
  assert.ok(!changeBody.includes('applySubject'))

  const drawerIdx = APP.indexOf('variant="drawer"')
  const drawerBlock = APP.slice(drawerIdx, APP.indexOf('/>', drawerIdx) + 2)
  assert.ok(drawerBlock.includes('closeExploreThen(openArcInView)'))
  assert.ok(drawerBlock.includes('closeExploreThen(openNodeInGraph)'))
  assert.ok(drawerBlock.includes('closeExploreThen(openEventInTimeline)'))

  assert.match(NEWS, /investigationContext/)
  assert.match(COMPARE, /investigationContext/)
  assert.match(APP, /compare[\s\S]*investigationContext=\{investigationContext\}/)
})

test('DISPLAY-only: no V2 writes, no production Cleveland literal in src/', () => {
  for (const [label, src] of [
    ['newSubjectPropagation.js', PROP],
    ['investigationContext.js', IC],
    ['discoveryFilters.js', DISC],
    ['exploreShell.js', SHELL],
    ['App.jsx', APP],
    ['NewsView.jsx', NEWS],
  ]) {
    assert.doesNotMatch(src, /\.(insert|upsert|update|delete|rpc)\(/, label)
    assert.doesNotMatch(src, /reader_state/, label)
    assert.doesNotMatch(src, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/, label)
    assert.doesNotMatch(src, /createClient|service_role/, label)
  }
  assert.doesNotMatch(PROP, /URLSearchParams|history\.(push|replace)/)
})
