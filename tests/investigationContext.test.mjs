// R4.75 Step 1 — Investigation Context contract.
// DISPLAY / client state only. No invented Cleveland. View change preserves
// the subject. JUMP_CLEARS must not fire on ordinary nav tab switches.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  INVESTIGATION_CONTEXT_FIELDS,
  EMPTY_INVESTIGATION_CONTEXT,
  emptyInvestigationContext,
  setInvestigationActiveView,
  setInvestigationAsOfTime,
  applySubject,
  subjectFromWorldViewSelection,
  subjectFromGraphNode,
  subjectFromNamedTarget,
  preserveSubjectAcrossViews,
  temporalAssessmentReferenceFor,
  graphNodeMatchingInvestigation,
  selectionStubFromInvestigation,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import { JUMP_CLEARS } from '../src/lib/jumpReset.js'
import { selectionStubFromProjection } from '../src/lib/spatialProjection.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const WORLD = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
const TIMELINE = readFileSync(new URL('../src/views/TimelineView.jsx', import.meta.url), 'utf8')
const ARCS = readFileSync(new URL('../src/views/ArcsView.jsx', import.meta.url), 'utf8')
const IC = readFileSync(new URL('../src/lib/investigationContext.js', import.meta.url), 'utf8')

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

const CLEVELAND_NODE = Object.freeze({
  id: CLEVELAND_CANONICAL_EVENT_ID,
  slug: 'evt-cleveland-eclipse-2024',
  label: 'Cleveland 2024 total solar eclipse',
  type: 'event',
  occurred_at: '2024-04-08T17:59:00+00',
})

const TAB_CYCLE = Object.freeze(['news', 'graph', 'timeline', 'arcs', 'world'])

test('empty Investigation Context has the contract fields and invents no subject', () => {
  const ic = emptyInvestigationContext('news')
  for (const field of INVESTIGATION_CONTEXT_FIELDS) {
    assert.ok(Object.hasOwn(ic, field), `missing field ${field}`)
  }
  assert.equal(ic.canonical_subject_id, null)
  assert.equal(ic.canonical_subject_type, null)
  assert.equal(ic.parent_event_id, null)
  assert.equal(ic.as_of_time, null)
  assert.equal(ic.selected_time_range, null)
  assert.equal(ic.temporal_assessment_reference, null)
  assert.equal(ic.active_view, 'news')
  assert.notEqual(ic.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(EMPTY_INVESTIGATION_CONTEXT.canonical_subject_id, null)
})

test('World View Cleveland row seeds event acc55cb2, not the spatial mip_object_id', () => {
  const stub = selectionStubFromProjection(CLEVELAND_ROW)
  const subject = subjectFromWorldViewSelection({ node: stub, row: CLEVELAND_ROW })
  assert.equal(subject.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(subject.canonical_subject_type, 'event')
  assert.equal(subject.parent_event_id, null)
  assert.equal(subject.as_of_time, CLEVELAND_ROW.valid_from_utc)
  assert.deepEqual(subject.selected_time_range, {
    from: CLEVELAND_ROW.valid_from_utc,
    to: CLEVELAND_ROW.valid_to_utc,
  })
  assert.equal(subject.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)
  assert.notEqual(subject.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)
})

test('empty World View / Graph selection does not invent Cleveland or any second event', () => {
  assert.equal(subjectFromWorldViewSelection({}).canonical_subject_id, null)
  assert.equal(subjectFromWorldViewSelection({ node: null, row: null }).canonical_subject_id, null)
  assert.equal(subjectFromGraphNode(null).canonical_subject_id, null)
  const ic = applySubject(emptyInvestigationContext('world'), subjectFromWorldViewSelection({}))
  assert.equal(ic.canonical_subject_id, null)
  assert.notEqual(ic.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.notEqual(ic.canonical_subject_id, INVENTED_EVENT_ID)
})

test('view change preserves Cleveland; News browse does not wipe the subject', () => {
  const seeded = applySubject(
    emptyInvestigationContext('world'),
    subjectFromWorldViewSelection({
      node: selectionStubFromProjection(CLEVELAND_ROW),
      row: CLEVELAND_ROW,
    }),
  )
  assert.equal(seeded.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  const after = preserveSubjectAcrossViews(seeded, TAB_CYCLE)
  assert.equal(after.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(after.canonical_subject_type, 'event')
  assert.equal(after.parent_event_id, null)
  assert.equal(after.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)
  assert.equal(after.active_view, 'world')
  assert.notEqual(after.canonical_subject_id, INVENTED_EVENT_ID)
  assert.notEqual(after.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)

  const viaNews = setInvestigationActiveView(seeded, 'news')
  assert.equal(viaNews.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(viaNews.active_view, 'news')
})

test('only an explicit subject select replaces canonical_subject_id', () => {
  const cleveland = applySubject(
    emptyInvestigationContext('world'),
    subjectFromGraphNode(CLEVELAND_NODE),
  )
  const stillCleveland = setInvestigationActiveView(cleveland, 'timeline')
  assert.equal(stillCleveland.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  const jumped = applySubject(stillCleveland, subjectFromNamedTarget({ type: 'arc', id: 'arc-other' }))
  assert.equal(jumped.canonical_subject_id, 'arc-other')
  assert.equal(jumped.canonical_subject_type, 'arc')
  assert.equal(jumped.active_view, 'timeline')
})

test('as_of_time / selected_time_range stay honest when absent', () => {
  const node = { id: CLEVELAND_CANONICAL_EVENT_ID, type: 'event' }
  const subject = subjectFromGraphNode(node)
  assert.equal(subject.as_of_time, null)
  assert.equal(subject.selected_time_range, null)
  const ic = applySubject(emptyInvestigationContext('graph'), subject)
  assert.equal(ic.as_of_time, null)
  const timed = setInvestigationAsOfTime(ic, '2024-04-08T17:59:00.000Z')
  assert.equal(timed.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(timed.as_of_time, '2024-04-08T17:59:00.000Z')
  const emptyTime = setInvestigationAsOfTime(emptyInvestigationContext(), '2024-04-08T17:59:00.000Z')
  assert.equal(emptyTime.as_of_time, null)
})

test('temporal_assessment_reference is the existing DISPLAY key, not a recompute', () => {
  assert.equal(temporalAssessmentReferenceFor(CLEVELAND_CANONICAL_EVENT_ID), CLEVELAND_ASSESSMENT_KEY)
  assert.equal(temporalAssessmentReferenceFor(null), null)
  assert.match(IC, /temporalAssessmentConfigKey/)
  assert.doesNotMatch(IC, /loadTemporalAssessment|truth_probability|expected_range/)
})

test('Graph restore matches a live node and does not invent one', () => {
  const ic = applySubject(
    emptyInvestigationContext('graph'),
    subjectFromGraphNode(CLEVELAND_NODE),
  )
  assert.equal(graphNodeMatchingInvestigation([CLEVELAND_NODE], ic)?.id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(graphNodeMatchingInvestigation([], ic), null)
  assert.equal(graphNodeMatchingInvestigation([{ id: 'other', type: 'event' }], ic), null)
  const arcIc = applySubject(ic, subjectFromNamedTarget({ type: 'arc', id: CLEVELAND_CANONICAL_EVENT_ID }))
  assert.equal(graphNodeMatchingInvestigation([CLEVELAND_NODE], arcIc), null)
})

test('JUMP_CLEARS does not include Investigation Context; tab nav must not reset it', () => {
  assert.ok(!JUMP_CLEARS.includes('investigationContext'))
  assert.ok(!JUMP_CLEARS.includes('canonical_subject_id'))
  assert.match(APP, /changeView/)
  assert.match(APP, /setInvestigationActiveView/)
  assert.match(
    APP,
    /onClick=\{\(\) => \(v\.key === 'more' \? setMoreOpen\(true\) : changeView\(v\.key\)\)\}/,
  )
  assert.match(APP, /const changeView = useCallback/)
  const changeIdx = APP.indexOf('const changeView = useCallback')
  const changeBody = APP.slice(changeIdx, APP.indexOf('}, [])', changeIdx) + 8)
  assert.ok(changeBody.includes('setInvestigationActiveView'), 'changeView must only rotate active_view')
  assert.ok(!changeBody.includes('resetJumpContext'), 'ordinary nav must not JUMP_CLEARS')
  assert.ok(!changeBody.includes('applySubject'), 'tab switch must not replace the subject')
  assert.match(APP, /handleSelectProjection[\s\S]*applySubject/)
  assert.match(APP, /subjectFromWorldViewSelection/)
})

test('Graph, World View, Timeline, Arcs, and inspector consume the shared object', () => {
  assert.match(APP, /<InvestigationContextBar/)
  assert.match(APP, /investigationContext=\{investigationContext\}/)
  assert.match(WORLD, /investigationContext/)
  assert.match(WORLD, /selectionStubFromInvestigation|investigationContext/)
  assert.match(WORLD, /onSelectProjection\(node \?\? selectionStubFromProjection\(row\), row\)/)
  assert.match(TIMELINE, /investigationContext/)
  assert.match(ARCS, /investigationContext/)
  assert.match(WORLD, /canonical_subject_id/)
})

test('module is DISPLAY-only: no V2 writes, no reader_state, no invented event literals', () => {
  assert.doesNotMatch(IC, /\.(insert|upsert|update|delete|rpc)\(/)
  assert.doesNotMatch(IC, /reader_state/)
  assert.doesNotMatch(IC, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(IC, /createClient|service_role/)
})

test('selection stub from IC carries the canonical id without inventing a second event', () => {
  const ic = applySubject(
    emptyInvestigationContext('world'),
    subjectFromWorldViewSelection({ row: CLEVELAND_ROW }),
  )
  const stub = selectionStubFromInvestigation(ic)
  assert.equal(stub.id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(stub.subject_graph_node_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(selectionStubFromInvestigation(emptyInvestigationContext()), null)
})
