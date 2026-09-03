// R4.75 Step 7 — Failure / freshness / a11y / performance verification.
// DISPLAY / client only. Fixtures only — no invented live subject or News rows.
// Hash `/arc` and `/arcs` both land on Arcs with the fixture event id.

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
  parseDeepLink,
  reconstructFromDeepLink,
  applySelectionAgainstCatalog,
} from '../src/lib/deepLinks.js'
import { commitNewSubject } from '../src/lib/newSubjectPropagation.js'
import {
  JOIN_STATE_KINDS,
  JOIN_STATE_COPY,
  SEARCH_DEBOUNCE_MS,
  CONTEXT_HISTORY_MAX,
  EXPLORE_A11Y,
  classifyJoinState,
  applyUnsupportedJoin,
  selectionFallbackCopy,
  invalidSelectionAgainstParent,
  freshnessFromExistingMarkers,
  weatherJoinState,
  shellJoinDisclosures,
  rapidViewBurst,
  exploreDismissPreserves,
  boundContextHistory,
  filterChipA11y,
  exploreFocusOpen,
  exploreFocusClose,
  handleExploreDialogKeyDown,
  createCancellableSearch,
  reconstructArcsDeepLink,
} from '../src/lib/investigationJoinState.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const BAR = readFileSync(new URL('../src/components/InvestigationContextBar.jsx', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const JOIN = readFileSync(new URL('../src/lib/investigationJoinState.js', import.meta.url), 'utf8')
const DEEP = readFileSync(new URL('../src/lib/deepLinks.js', import.meta.url), 'utf8')
const SHELL = readFileSync(new URL('../src/lib/exploreShell.js', import.meta.url), 'utf8')
const IC = readFileSync(new URL('../src/lib/investigationContext.js', import.meta.url), 'utf8')

const CLEVELAND_MIP_OBJECT_ID = '777b3951-4a82-4dd7-befb-958991b1318f'
const INVENTED_EVENT_ID = '00000000-0000-0000-0000-ffffffffffff'
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
  revision_ordinal: 1,
  revision_known_at_utc: '2026-09-03 01:50:15+00',
})

const TAB_CYCLE = Object.freeze(['news', 'graph', 'timeline', 'arcs', 'world'])

const PARENT_CATALOG = Object.freeze({
  entity: Object.freeze([
    { id: LIVE_ENTITY_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID },
    { id: CLEVELAND_CANONICAL_EVENT_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID },
  ]),
  claim: Object.freeze([]),
  source: Object.freeze([]),
  place: Object.freeze(['place-cleveland-city']),
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

test('join kinds are distinguishable and never invent a subject or weather', () => {
  const kinds = JOIN_STATE_KINDS.filter((kind) => kind !== 'invalid_selection')
  const copies = kinds.map((kind) => JOIN_STATE_COPY[kind])
  assert.equal(new Set(copies).size, copies.length)

  const empty = classifyJoinState({ availableCount: 0, view: 'graph', subjectType: 'event' })
  const insufficient = classifyJoinState({ insufficientEvidence: true, view: 'world', subjectType: 'event' })
  const unsupported = classifyJoinState({ view: 'arcs', subjectType: 'event' })
  const withheld = classifyJoinState({ permissionDenied: true, view: 'graph', subjectType: 'event' })
  const failed = classifyJoinState({ failed: true, failureReason: 'network', view: 'graph', subjectType: 'event' })
  const stale = classifyJoinState({ stale: true, view: 'world', subjectType: 'event' })

  assert.equal(empty.kind, 'no_joined_data')
  assert.equal(insufficient.kind, 'insufficient_evidence')
  assert.equal(unsupported.kind, 'unsupported_object_type')
  assert.equal(withheld.kind, 'withheld')
  assert.equal(failed.kind, 'request_failed')
  assert.equal(stale.kind, 'stale_cached')
  assert.equal(new Set([empty, insufficient, unsupported, withheld, failed, stale].map((item) => item.copy)).size, 6)

  for (const join of [empty, insufficient, unsupported, withheld, failed, stale]) {
    assert.equal(join.invented, false)
    assert.equal(join.inventedSubject, false)
    assert.equal(join.inventedArc, false)
    assert.equal(join.inventedNewsRow, false)
    assert.equal(join.inventedEdge, false)
    assert.equal(join.inventedWeather, false)
  }

  const weather = weatherJoinState()
  assert.equal(weather.kind, 'no_joined_data')
  assert.equal(weather.temperature, null)
  assert.equal(weather.fields.precipitation, null)
  assert.equal(weather.inventedWeather, false)
  assert.match(weather.copy, /Weather is unavailable/)
})

test('unsupported join falls back to parent IC; /arc and /arcs land on Arcs', () => {
  const cleveland = seedCleveland('world')
  assert.equal(cleveland.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)

  const unsupported = applyUnsupportedJoin(cleveland, 'arcs')
  assert.equal(unsupported.investigationContext, cleveland)
  assert.equal(unsupported.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(unsupported.landingView, 'arcs')
  assert.equal(unsupported.join.kind, 'unsupported_object_type')
  assert.equal(unsupported.join.action, 'parent_context')
  assert.equal(unsupported.invented, false)
  assert.equal(unsupported.inventedArc, false)
  assert.notEqual(unsupported.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)

  for (const slug of ['arc', 'arcs']) {
    const reconstructed = reconstructArcsDeepLink(`#/event/${CLEVELAND_CANONICAL_EVENT_ID}/${slug}`, {
      currentIc: emptyInvestigationContext('news'),
      catalog: PARENT_CATALOG,
    })
    assert.equal(reconstructed.committed, true)
    assert.equal(reconstructed.invented, false)
    assert.equal(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
    assert.equal(reconstructed.investigationContext.canonical_subject_type, 'event')
    assert.equal(reconstructed.investigationContext.active_view, 'arcs')
    assert.equal(reconstructed.investigationContext.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)
    assert.equal(reconstructed.fallbacks.some((item) => item.kind === 'view'), false)
    assert.notEqual(reconstructed.investigationContext.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)
    assert.notEqual(reconstructed.investigationContext.active_view, 'graph')
  }

  const unknown = reconstructFromDeepLink(parseDeepLink(`#/event/${CLEVELAND_CANONICAL_EVENT_ID}/not-a-view`), {
    currentIc: emptyInvestigationContext('news'),
    catalog: PARENT_CATALOG,
  })
  assert.equal(unknown.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(unknown.investigationContext.active_view, 'graph')
  assert.equal(unknown.fallbacks.some((item) => item.kind === 'view' && item.requestedId === 'not-a-view'), true)
  assert.equal(unknown.invented, false)
})

test('invalid selection IDs fail closed to parent IC with consistent disclosure', () => {
  const cleveland = seedCleveland('graph')
  const applied = invalidSelectionAgainstParent(
    { claim: 'missing-claim', entity: STALE_ENTITY_ID, source: 'missing-source', place: 'unknown-place', time: null },
    PARENT_CATALOG,
    CLEVELAND_CANONICAL_EVENT_ID,
  )
  assert.equal(applied.invented, false)
  assert.equal(applied.selection.entity, null)
  assert.equal(applied.selection.claim, null)
  assert.equal(applied.selection.source, null)
  assert.equal(applied.selection.place, null)
  assert.deepEqual(applied.fallbacks.map((item) => item.kind).sort(), ['claim', 'entity', 'place', 'source'])
  for (const disclosure of applied.disclosures) {
    assert.equal(disclosure.kind, 'invalid_selection')
    assert.equal(disclosure.action, 'parent_context')
    assert.equal(disclosure.copy, selectionFallbackCopy({ kind: disclosure.selectionKind, requestedId: disclosure.requestedId }))
    assert.match(disclosure.copy, /Showing the parent investigation context/)
  }

  const rapid = rapidViewBurst(cleveland, ['graph', 'arcs', 'news'], {
    catalog: PARENT_CATALOG,
    selection: { entity: STALE_ENTITY_ID, claim: null, source: null, time: null, place: null },
  })
  assert.equal(rapid.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(rapid.subjectUnchanged, true)
  assert.equal(rapid.invented, false)
  assert.equal(rapid.selection.entity, null)
  assert.ok(rapid.disclosures.some((item) => item.kind === 'invalid_selection'))

  const disclosures = shellJoinDisclosures({
    investigationContext: cleveland,
    view: 'graph',
    selectionFallbacks: applied.fallbacks,
  })
  assert.ok(disclosures.some((item) => item.kind === 'invalid_selection'))
  assert.match(BAR, /data-join-disclosures/)
  assert.match(BAR, /selectionFallbackCopy/)
  assert.match(APP, /joinDisclosures=\{joinDisclosures\}/)
})

test('stale / as-of freshness uses existing markers and invents no revision API', () => {
  const covering = freshnessFromExistingMarkers({
    asOfTime: CLEVELAND_ROW.valid_from_utc,
    revisionRow: CLEVELAND_ROW,
    atMs: Date.parse('2024-04-08T18:30:00Z'),
  })
  assert.equal(covering.kind, 'current_with_markers')
  assert.equal(covering.inventsRevisionApi, false)
  assert.ok(covering.cues.some((cue) => cue.kind === 'as_of'))
  assert.ok(covering.cues.some((cue) => cue.kind === 'revision_ordinal'))
  assert.match(covering.summary, /no backend revision API/)

  const stale = freshnessFromExistingMarkers({
    asOfTime: CLEVELAND_ROW.valid_from_utc,
    revisionRow: CLEVELAND_ROW,
    atMs: Date.parse('2020-01-01T00:00:00Z'),
  })
  assert.equal(stale.kind, 'stale_cached')
  assert.equal(stale.coverage, 'outside')
  assert.equal(stale.inventsRevisionApi, false)

  const cached = freshnessFromExistingMarkers({
    asOfTime: '2024-04-08T17:59:00.000Z',
    cachedRepresentationAsOf: '2020-01-01T00:00:00.000Z',
  })
  assert.equal(cached.kind, 'stale_cached')

  assert.doesNotMatch(JOIN, /loadRevision|revisionApi|\/revision/)
  assert.match(BAR, /data-freshness/)
  assert.match(WORLD, /freshnessFromExistingMarkers/)
})

test('Explore dismiss does not clear Cleveland; drawer stays non-mutating', () => {
  const cleveland = seedCleveland('graph')
  const after = exploreDismissPreserves(cleveland)
  assert.equal(after, cleveland)
  assert.equal(after.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(after.active_view, 'graph')
  assert.equal(after.as_of_time, CLEVELAND_ROW.valid_from_utc)

  const closeIdx = APP.indexOf('const closeExplore = useCallback')
  const closeBody = APP.slice(closeIdx, APP.indexOf('}, [])', closeIdx) + 8)
  assert.ok(closeBody.includes('setExploreOpen(false)'))
  assert.ok(!closeBody.includes('applySubject'))
  assert.ok(!closeBody.includes('changeView('))
  assert.doesNotMatch(SHELL, /applySubject|resetJumpContext/)
})

test('rapid view switches preserve the fixture subject and invent no second event', () => {
  const cleveland = seedCleveland('world')
  const after = preserveSubjectAcrossViews(cleveland, TAB_CYCLE)
  assert.equal(after.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(after.canonical_subject_type, 'event')
  assert.notEqual(after.canonical_subject_id, INVENTED_EVENT_ID)

  const burst = rapidViewBurst(cleveland, TAB_CYCLE)
  assert.equal(burst.subjectUnchanged, true)
  assert.equal(burst.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(burst.invented, false)
  assert.ok(burst.disclosures.some((item) => item.kind === 'unsupported_object_type' && item.view === 'arcs'))
  assert.ok(burst.disclosures.some((item) => item.kind === 'no_joined_data' && item.view === 'news'))

  const emptyNews = commitNewSubject(cleveland, { articles: [], articlesUnavailable: null, eligibleCount: 0 })
  assert.equal(emptyNews.committed, false)
  assert.equal(emptyNews.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
})

test('a11y labels and Explore focus hooks are present; filters are not color-only', () => {
  assert.equal(EXPLORE_A11Y.triggerLabel, 'Explore / Change Topic')
  assert.match(APP, /data-explore-trigger/)
  assert.match(APP, /data-explore-dialog/)
  assert.match(APP, /exploreFocusOpen/)
  assert.match(APP, /exploreFocusClose/)
  assert.match(APP, /handleExploreDialogKeyDown/)
  assert.match(APP, /aria-current/)
  assert.match(APP, /aria-controls=\{EXPLORE_A11Y\.dialogId\}/)
  assert.match(NEWS, /aria-label=\{EXPLORE_A11Y\.searchLabel\}/)
  assert.match(NEWS, /data-explore-search/)
  assert.match(NEWS, /filterChipA11y/)
  assert.match(NEWS, /filter-active-mark/)
  assert.match(JOIN, /aria-pressed/)
  assert.match(NEWS, /SEARCH_DEBOUNCE_MS/)

  const a11y = filterChipA11y(true)
  assert.equal(a11y['aria-pressed'], true)
  assert.equal(a11y['data-filter-active'], 'true')
  assert.equal(filterChipA11y(false)['aria-pressed'], false)

  const focused = []
  const search = { focus: () => focused.push('search') }
  const trigger = { focus: () => focused.push('trigger') }
  const dialog = {
    querySelector: () => search,
    querySelectorAll: () => [search, trigger],
    focus: () => focused.push('dialog'),
  }
  exploreFocusOpen(dialog)
  exploreFocusClose(trigger)
  assert.deepEqual(focused, ['search', 'trigger'])

  const tabbed = []
  const first = { disabled: false, focus: () => tabbed.push('first') }
  const last = { disabled: false, focus: () => tabbed.push('last') }
  const trap = {
    querySelectorAll: () => [first, last],
    ownerDocument: { activeElement: last },
  }
  const prevented = []
  handleExploreDialogKeyDown(
    { key: 'Tab', shiftKey: false, preventDefault: () => prevented.push('tab') },
    { dialogEl: trap },
  )
  assert.deepEqual(tabbed, ['first'])
  assert.deepEqual(prevented, ['tab'])
  const dismissed = []
  handleExploreDialogKeyDown({ key: 'Escape' }, { onDismiss: () => dismissed.push('esc') })
  assert.deepEqual(dismissed, ['esc'])
})

test('search debounce/cancel and recent history stay bounded; lens change does not refetch graph', async () => {
  assert.equal(SEARCH_DEBOUNCE_MS, 350)
  assert.equal(CONTEXT_HISTORY_MAX, 8)

  const calls = []
  const search = createCancellableSearch(async (q) => {
    calls.push(q)
    return q
  }, { debounceMs: 8 })
  const first = search.request('cleve')
  const second = search.request('cleveland')
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.cancelled, true)
  assert.equal(b.cancelled, false)
  assert.equal(b.result, 'cleveland')
  assert.deepEqual(calls, ['cleveland'])

  const overflow = Array.from({ length: 20 }, (_, i) => ({ canonical_subject_id: `fixture-${i}` }))
  const bounded = boundContextHistory(overflow)
  assert.equal(bounded.length, 8)
  assert.equal(bounded[0].canonical_subject_id, 'fixture-0')

  const changeIdx = APP.indexOf('const changeView = useCallback')
  const changeBody = APP.slice(changeIdx, APP.indexOf('}, [])', changeIdx) + 8)
  assert.ok(changeBody.includes('setInvestigationActiveView'))
  assert.ok(!changeBody.includes('loadGraph'))
  assert.ok(!changeBody.includes('applySubject'))
  assert.match(APP, /Lens change only — do not loadGraph/)
  assert.match(APP, /Canonical graph\/event state loads once/)
  assert.match(NEWS, /seq !== requestRef\.current/)
})

test('DISPLAY-only: no V2 writes, no invented Cleveland literal, no Account Pipeline', () => {
  for (const [label, src] of [
    ['investigationJoinState.js', JOIN],
    ['deepLinks.js', DEEP],
    ['App.jsx', APP],
    ['NewsView.jsx', NEWS],
    ['InvestigationContextBar.jsx', BAR],
    ['investigationContext.js', IC],
  ]) {
    assert.doesNotMatch(src, /\.(insert|upsert|update|delete|rpc)\(/, label)
    assert.doesNotMatch(src, /reader_state/, label)
    assert.doesNotMatch(src, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/, label)
    assert.doesNotMatch(src, /createClient|service_role/, label)
    assert.doesNotMatch(src, /Account Pipeline|account_pipeline/, label)
  }
  assert.match(DEEP, /arcs: 'arcs'/)
})
