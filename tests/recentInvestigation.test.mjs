// R4.75 Step 6 — Bounded recent-investigation stack.
// DISPLAY / client only. Session/local for unauthenticated visitors.
// New-subject commit pushes prior context; restore returns prior
// subject/view without inventing a second subject or opening tabs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  subjectFromGraphNode,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID } from '../src/lib/temporalAssessment.js'
import { selectionStubFromProjection } from '../src/lib/spatialProjection.js'
import { commitNewSubject } from '../src/lib/newSubjectPropagation.js'
import {
  RECENT_INVESTIGATION_STORAGE_KEY,
  RECENT_INVESTIGATION_MAX,
  snapshotRecentInvestigation,
  pushRecentInvestigation,
  boundRecentInvestigationStack,
  restoreRecentInvestigation,
  commitNewSubjectRememberingRecent,
  readRecentInvestigations,
  writeRecentInvestigations,
} from '../src/lib/recentInvestigation.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const BAR = readFileSync(new URL('../src/components/InvestigationContextBar.jsx', import.meta.url), 'utf8')
const RECENT = readFileSync(new URL('../src/lib/recentInvestigation.js', import.meta.url), 'utf8')
const PROP = readFileSync(new URL('../src/lib/newSubjectPropagation.js', import.meta.url), 'utf8')

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
})

const FIXTURE_B_NODE = Object.freeze({
  id: FIXTURE_B_ID,
  slug: 'evt-fixture-b',
  label: 'Fixture B subject',
  type: 'event',
  occurred_at: '2024-06-01T12:00:00+00',
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

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    data,
  }
}

test('recent stack push on subject change + restore returns prior subject/view', () => {
  const cleveland = seedCleveland('graph')
  assert.equal(cleveland.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(cleveland.active_view, 'graph')

  const remembered = commitNewSubjectRememberingRecent(
    cleveland,
    FIXTURE_B_NODE,
    { landingView: 'timeline' },
    [],
    { kind: 'entity', id: CLEVELAND_CANONICAL_EVENT_ID },
  )
  assert.equal(remembered.committed, true)
  assert.equal(remembered.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.equal(remembered.investigationContext.active_view, 'timeline')
  assert.equal(remembered.recentInvestigations.length, 1)
  assert.equal(remembered.recentInvestigations[0].canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(remembered.recentInvestigations[0].active_view, 'graph')
  assert.deepEqual(remembered.recentInvestigations[0].selected_time_range, {
    from: CLEVELAND_ROW.valid_from_utc,
    to: CLEVELAND_ROW.valid_to_utc,
  })
  assert.notEqual(remembered.recentInvestigations[0].canonical_subject_id, FIXTURE_B_ID)

  const restored = restoreRecentInvestigation(remembered.recentInvestigations[0], {
    currentIc: remembered.investigationContext,
    catalog: {
      entity: [{ id: CLEVELAND_CANONICAL_EVENT_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID }],
      claim: [],
      source: [],
      place: [],
    },
  })
  assert.equal(restored.committed, true)
  assert.equal(restored.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(restored.investigationContext.active_view, 'graph')
  assert.equal(restored.investigationContext.as_of_time, CLEVELAND_ROW.valid_from_utc)
  assert.deepEqual(restored.investigationContext.selected_time_range, {
    from: CLEVELAND_ROW.valid_from_utc,
    to: CLEVELAND_ROW.valid_to_utc,
  })
  assert.notEqual(restored.investigationContext.canonical_subject_id, FIXTURE_B_ID)
  assert.notEqual(restored.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)
})

test('restore with stale sub-object degrades to parent context', () => {
  const cleveland = seedCleveland('world')
  const snap = snapshotRecentInvestigation(cleveland, { kind: 'entity', id: STALE_ENTITY_ID })
  const restored = restoreRecentInvestigation(snap, {
    currentIc: applySubject(emptyInvestigationContext('timeline'), subjectFromGraphNode(FIXTURE_B_NODE)),
    catalog: {
      entity: [{ id: CLEVELAND_CANONICAL_EVENT_ID, parentId: CLEVELAND_CANONICAL_EVENT_ID }],
      claim: [],
      source: [],
      place: [],
    },
  })
  assert.equal(restored.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(restored.selection.entity, null)
  assert.equal(restored.fallbacks.length, 1)
  assert.equal(restored.fallbacks[0].kind, 'entity')
  assert.equal(restored.fallbacks[0].requestedId, STALE_ENTITY_ID)
  assert.equal(restored.fallbacks[0].action, 'parent_context')
  assert.notEqual(restored.investigationContext.canonical_subject_id, STALE_ENTITY_ID)
  assert.notEqual(restored.investigationContext.canonical_subject_id, FIXTURE_B_ID)
})

test('identity is the stored id, never a display title', () => {
  const titled = snapshotRecentInvestigation({
    canonical_subject_id: FIXTURE_B_ID,
    canonical_subject_type: 'event',
    parent_event_id: null,
    active_view: 'graph',
    as_of_time: null,
    selected_time_range: null,
    label: 'Cleveland 2024 total solar eclipse',
    title: 'Cleveland 2024 total solar eclipse',
  })
  assert.equal(titled.canonical_subject_id, FIXTURE_B_ID)
  assert.equal(titled.title, undefined)
  assert.equal(titled.label, undefined)

  const storage = memoryStorage()
  writeRecentInvestigations(storage, [
    {
      canonical_subject_id: FIXTURE_B_ID,
      canonical_subject_type: 'event',
      active_view: 'arcs',
      title: 'Cleveland 2024 total solar eclipse',
    },
  ])
  const readBack = readRecentInvestigations(storage)
  assert.equal(readBack[0].canonical_subject_id, FIXTURE_B_ID)
  assert.notEqual(readBack[0].canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(readBack[0].title, undefined)
})

test('stack is bounded and does not grow without limit', () => {
  assert.equal(RECENT_INVESTIGATION_MAX, 8)
  let stack = []
  for (let i = 0; i < 20; i += 1) {
    stack = pushRecentInvestigation(stack, {
      canonical_subject_id: `fixture-subject-${i}`,
      canonical_subject_type: 'event',
      parent_event_id: null,
      active_view: 'graph',
      as_of_time: null,
      selected_time_range: null,
      subObject: null,
    })
  }
  assert.equal(stack.length, RECENT_INVESTIGATION_MAX)
  assert.equal(stack[0].canonical_subject_id, 'fixture-subject-19')
  assert.equal(stack[RECENT_INVESTIGATION_MAX - 1].canonical_subject_id, 'fixture-subject-12')
  assert.equal(boundRecentInvestigationStack(stack, 3).length, 3)
  assert.deepEqual(pushRecentInvestigation(stack, null), stack)
  assert.deepEqual(pushRecentInvestigation(stack, { title: 'Cleveland' }), stack)
})

test('honest empty does not invent a recent subject', () => {
  const empty = emptyInvestigationContext('news')
  assert.equal(snapshotRecentInvestigation(empty), null)
  const noCommit = commitNewSubjectRememberingRecent(empty, { articles: [], eligibleCount: 0 }, {}, [])
  assert.equal(noCommit.committed, false)
  assert.deepEqual(noCommit.recentInvestigations, [])
  assert.equal(noCommit.investigationContext.canonical_subject_id, null)
  assert.notEqual(noCommit.investigationContext.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(noCommit.investigationContext.canonical_subject_id, INVENTED_EVENT_ID)

  const sameSubject = commitNewSubjectRememberingRecent(
    seedCleveland('graph'),
    { canonical_subject_id: CLEVELAND_CANONICAL_EVENT_ID, canonical_subject_type: 'event' },
    { landingView: 'timeline' },
    [],
  )
  assert.equal(sameSubject.committed, true)
  assert.deepEqual(sameSubject.recentInvestigations, [])

  const restoredEmpty = restoreRecentInvestigation(null, { currentIc: empty })
  assert.equal(restoredEmpty.committed, false)
  assert.equal(restoredEmpty.investigationContext.canonical_subject_id, null)
})

test('unauthenticated storage key is session/local only', () => {
  assert.equal(RECENT_INVESTIGATION_STORAGE_KEY, 'mip.recentInvestigations.v1')
  const storage = memoryStorage()
  const cleveland = seedCleveland('world')
  const written = writeRecentInvestigations(storage, [snapshotRecentInvestigation(cleveland)])
  assert.equal(written, true)
  assert.ok(Object.hasOwn(storage.data, RECENT_INVESTIGATION_STORAGE_KEY))
  assert.equal(readRecentInvestigations(storage)[0].canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.doesNotMatch(RECENT, /account_pipeline|Account Pipeline|syncRecent|reader_state/)
  assert.match(RECENT, /localStorage/)
  assert.match(RECENT, /sessionStorage/)
})

test('App remembers prior IC on new-subject commit and can restore it', () => {
  assert.match(APP, /from ['"].*recentInvestigation['"]/)
  assert.match(APP, /commitNewSubjectRememberingRecent|pushRecentInvestigation/)
  assert.match(APP, /restoreRecentInvestigation/)
  assert.match(APP, /RECENT_INVESTIGATION_STORAGE_KEY|mip\.recentInvestigations\.v1/)
  assert.match(BAR, /recentInvestigations|onRestoreRecent/)
  assert.match(BAR, /data-recent-subject-id/)
  assert.doesNotMatch(BAR, /multi-tab|Account Pipeline/)
  assert.match(PROP, /commitNewSubject/)
  assert.ok(!APP.includes('createClient'))
})

function callbackBody(src, name) {
  const start = src.indexOf(`const ${name} = useCallback`)
  assert.notEqual(start, -1, `${name} not found`)
  const dep = src.indexOf(']', start)
  assert.notEqual(dep, -1, `${name} dep array not found`)
  return src.slice(start, dep + 1)
}

test('Explore / News jump handlers still commit once and now remember recent', () => {
  for (const handler of [
    'openNodeInGraph',
    'openArcInView',
    'openArticleInNews',
    'openEventInTimeline',
    'openComparisonEvent',
  ]) {
    const body = callbackBody(APP, handler)
    assert.ok(body.includes('commitNewSubject'), `${handler} must still commit via commitNewSubject`)
    assert.ok(!body.includes('applySubject('), `${handler} must not applySubject locally`)
  }
})
