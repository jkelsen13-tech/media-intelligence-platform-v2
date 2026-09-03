// R4.75 Step 6 — Deep-link reconstruct contract.
// DISPLAY / client state only. Hash route #/event/<id>/<view>.
// Identity from ids, never display text. Invalid sub-selection ids fall
// back to the parent Investigation Context. Honest empty invents nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  preserveSubjectAcrossViews,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import { selectionStubFromProjection } from '../src/lib/spatialProjection.js'
import {
  DEEP_LINK_ROUTE_SHAPE,
  DEEP_LINK_SLUG_TO_VIEW,
  VIEW_TO_DEEP_LINK_SLUG,
  parseDeepLink,
  serializeDeepLink,
  reconstructFromDeepLink,
  hydrateDeepLink,
  canonicalSubjectIdFromDisplayText,
  applySelectionAgainstCatalog,
  isInvestigationDeepLink,
} from '../src/lib/deepLinks.js'
import { commitNewSubject } from '../src/lib/newSubjectPropagation.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const IC = readFileSync(new URL('../src/lib/investigationContext.js', import.meta.url), 'utf8')
const PROP = readFileSync(new URL('../src/lib/newSubjectPropagation.js', import.meta.url), 'utf8')
const DEEP = readFileSync(new URL('../src/lib/deepLinks.js', import.meta.url), 'utf8')
const RECENT = readFileSync(new URL('../src/lib/recentInvestigation.js', import.meta.url), 'utf8')
const SHELL = readFileSync(new URL('../src/lib/exploreShell.js', import.meta.url), 'utf8')
const DISC = readFileSync(new URL('../src/lib/discoveryFilters.js', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')

const CLEVELAND_MIP_OBJECT_ID = '777b3951-4a82-4dd7-befb-958991b1318f'
const INVENTED_EVENT_ID = '00000000-0000-0000-0000-ffffffffffff'
const FIXTURE_B_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const STALE_ENTITY_ID = 'stale-entity-not-in-parent'
const LIVE_ENTITY_ID = 'entity-fixture-under-parent'

const CLEVELAND_ROW = Object.freeze({
  mip_object_id: CLEVELAND_MIP_OBJECT_ID,
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: CLEVELAND_CANONICAL_EVENT_ID,
  spatial_role: 'event',
  parent_event_id: null,
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
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

const PARENT_CATALOG = Object.freeze({
  entity: Object.freeze([
    { id: LIVE_ENTITY_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID },
    { id: CLEVELAND_CANONICAL_EVENT_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID },
  ]),
  claim: Object.freeze([]),
  source: Object.freeze([]),
  place: Object.freeze(['place-cleveland-city']),
})

test('route shape is hash; slugs map to existing views', () => {
  assert.equal(DEEP_LINK_ROUTE_SHAPE, 'hash')
  assert.equal(DEEP_LINK_SLUG_TO_VIEW.graph, 'graph')
  assert.equal(DEEP_LINK_SLUG_TO_VIEW.sources, 'compare')
  assert.equal(DEEP_LINK_SLUG_TO_VIEW.timeline, 'timeline')
  assert.equal(DEEP_LINK_SLUG_TO_VIEW.arc, 'arcs')
  assert.equal(DEEP_LINK_SLUG_TO_VIEW.world, 'world')
  assert.equal(VIEW_TO_DEEP_LINK_SLUG.compare, 'sources')
  assert.equal(VIEW_TO_DEEP_LINK_SLUG.arcs, 'arc')
  assert.equal(isInvestigationDeepLink('#/event/abc/graph'), true)
  assert.equal(isInvestigationDeepLink('#error=access_denied'), false)
  assert.equal(isInvestigationDeepLink('#/'), false)
})

test('deep link reconstructs fixture subject + view from ids', () => {
  const hash = `#/event/${CLEVELAND_CANONICAL_EVENT_ID}/world?time=${encodeURIComponent('2024-04-08 17:59:00+00..2024-04-08 20:29:00+00')}`
  const parsed = parseDeepLink(hash)
  assert.equal(parsed.subjectId, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(parsed.view, 'world')
  assert.equal(parsed.viewSlug, 'world')

  const reconstructed = reconstructFromDeepLink(parsed, {
    currentIc: emptyInvestigationContext('news'),
    catalog: PARENT_CATALOG,
  })
  assert.equal(reconstructed.committed, true)
  assert.equal(reconstructed.invented, false)
  assert.equal(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(reconstructed.investigationContext.canonical_subject_type, 'event')
  assert.equal(reconstructed.investigationContext.active_view, 'world')
  assert.equal(reconstructed.investigationContext.as_of_time, '2024-04-08 17:59:00+00')
  assert.deepEqual(reconstructed.investigationContext.selected_time_range, {
    from: '2024-04-08 17:59:00+00',
    to: '2024-04-08 20:29:00+00',
  })
  assert.equal(reconstructed.investigationContext.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)
  assert.notEqual(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)
  assert.notEqual(reconstructed.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)

  const afterTabs = preserveSubjectAcrossViews(reconstructed.investigationContext, TAB_CYCLE)
  assert.equal(afterTabs.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)

  const roundTrip = serializeDeepLink(reconstructed.investigationContext, reconstructed.selection)
  assert.match(roundTrip, new RegExp(`#/event/${CLEVELAND_CANONICAL_EVENT_ID}/world`))
  const again = parseDeepLink(roundTrip)
  assert.equal(again.subjectId, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(again.view, 'world')
})

test('invalid/stale sub-selection ID falls back to parent IC, not a different subject', () => {
  const hash = `#/event/${CLEVELAND_CANONICAL_EVENT_ID}/graph?entity=${STALE_ENTITY_ID}&claim=missing-claim&place=unknown-place`
  const parsed = parseDeepLink(hash)
  const reconstructed = reconstructFromDeepLink(parsed, {
    currentIc: seedCleveland('graph'),
    catalog: PARENT_CATALOG,
  })

  assert.equal(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(reconstructed.investigationContext.canonical_subject_id, STALE_ENTITY_ID)
  assert.notEqual(reconstructed.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.notEqual(reconstructed.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)
  assert.equal(reconstructed.selection.entity, null)
  assert.equal(reconstructed.selection.claim, null)
  assert.equal(reconstructed.selection.place, null)
  const kinds = reconstructed.fallbacks.map((item) => item.kind).sort()
  assert.deepEqual(kinds, ['claim', 'entity', 'place'])
  for (const fallback of reconstructed.fallbacks) {
    assert.equal(fallback.action, 'parent_context')
    assert.equal(fallback.reason, 'not_in_parent_context')
  }

  const otherParentEntity = applySelectionAgainstCatalog(
    { ...parsed.selection, entity: LIVE_ENTITY_ID },
    {
      entity: [{ id: LIVE_ENTITY_ID, parentId: FIXTURE_B_ID }],
      claim: [],
      source: [],
      place: [],
    },
    CLEVELAND_CANONICAL_EVENT_ID,
  )
  assert.equal(otherParentEntity.selection.entity, null)
  assert.equal(otherParentEntity.fallbacks[0].action, 'parent_context')
})

test('identity is not derived from display text', () => {
  assert.equal(canonicalSubjectIdFromDisplayText('Cleveland 2024 total solar eclipse'), null)
  assert.equal(canonicalSubjectIdFromDisplayText('Fixture B subject'), null)

  const titled = parseDeepLink(
    `#/event/${FIXTURE_B_ID}/graph?title=Cleveland%202024%20total%20solar%20eclipse&label=Cleveland&name=Cleveland&q=Cleveland`,
  )
  assert.equal(titled.subjectId, FIXTURE_B_ID)
  assert.notEqual(titled.subjectId, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(titled.ignoredDisplayText, true)

  const titleOnly = parseDeepLink('#/?title=Cleveland%202024%20total%20solar%20eclipse')
  assert.equal(titleOnly.subjectId, null)

  const emptyEvent = parseDeepLink('#/event/?title=Cleveland')
  assert.equal(emptyEvent.subjectId, null)

  const reconstructed = reconstructFromDeepLink(titled, { catalog: { entity: [FIXTURE_B_ID], claim: [], source: [], place: [] } })
  assert.equal(reconstructed.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.notEqual(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
})

test('honest empty / no invented subject', () => {
  const emptyFeed = { articles: [], articlesUnavailable: null, eligibleCount: 0 }
  const noSelect = commitNewSubject(seedCleveland('news'), emptyFeed)
  assert.equal(noSelect.committed, false)
  assert.equal(noSelect.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)

  const fromEmptyHash = hydrateDeepLink('#/', { currentIc: emptyInvestigationContext('news') })
  assert.equal(fromEmptyHash.committed, false)
  assert.equal(fromEmptyHash.investigationContext.canonical_subject_id, null)
  assert.notEqual(fromEmptyHash.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(fromEmptyHash.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)
  assert.equal(fromEmptyHash.invented, false)

  const fromBareEvent = reconstructFromDeepLink(parseDeepLink('#/event/'), {
    currentIc: emptyInvestigationContext('news'),
  })
  assert.equal(fromBareEvent.committed, false)
  assert.equal(fromBareEvent.investigationContext.canonical_subject_id, null)

  assert.equal(serializeDeepLink(emptyInvestigationContext('news')), '#/')
  assert.doesNotMatch(serializeDeepLink(emptyInvestigationContext('news')), /\/event\//)
})

test('valid entity sub-selection is kept; serialize never writes a title', () => {
  const hash = `#/event/${CLEVELAND_CANONICAL_EVENT_ID}/graph?entity=${LIVE_ENTITY_ID}&place=place-cleveland-city`
  const reconstructed = reconstructFromDeepLink(parseDeepLink(hash), {
    currentIc: emptyInvestigationContext('graph'),
    catalog: PARENT_CATALOG,
  })
  assert.equal(reconstructed.selection.entity, LIVE_ENTITY_ID)
  assert.equal(reconstructed.selection.place, 'place-cleveland-city')
  assert.equal(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(reconstructed.fallbacks.length, 0)

  const written = serializeDeepLink(reconstructed.investigationContext, reconstructed.selection)
  assert.match(written, /entity=entity-fixture-under-parent/)
  assert.doesNotMatch(written, /title=|label=|name=/)
})

test('App wires hash deep links through the Step 5 commit path', () => {
  assert.match(APP, /from ['"].*deepLinks['"]/)
  assert.match(APP, /hydrateDeepLink|reconstructFromDeepLink|parseDeepLink/)
  assert.match(APP, /serializeDeepLink/)
  assert.match(APP, /commitNewSubject/)
  assert.match(DEEP, /commitNewSubject/)
  assert.doesNotMatch(DEEP, /createHashRouter|BrowserRouter|createBrowserRouter/)
  assert.match(DEEP, /#\/event\//)
  assert.match(APP, /replaceState|location\.hash/)
})

test('DISPLAY-only: no V2 writes, no production Cleveland literal in src/', () => {
  for (const [label, src] of [
    ['deepLinks.js', DEEP],
    ['recentInvestigation.js', RECENT],
    ['newSubjectPropagation.js', PROP],
    ['investigationContext.js', IC],
    ['exploreShell.js', SHELL],
    ['discoveryFilters.js', DISC],
    ['App.jsx', APP],
    ['NewsView.jsx', NEWS],
  ]) {
    assert.doesNotMatch(src, /\.(insert|upsert|update|delete|rpc)\(/, label)
    assert.doesNotMatch(src, /reader_state/, label)
    assert.doesNotMatch(src, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/, label)
    assert.doesNotMatch(src, /createClient|service_role/, label)
    assert.doesNotMatch(src, /Account Pipeline|account_pipeline/, label)
  }
})
