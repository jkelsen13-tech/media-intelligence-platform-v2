import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  EVIDENCE_UNRECORDED,
  LOCATION_UNRECORDED,
  NODE_EVIDENCE_UNRECORDED,
  TIME_UNRECORDED,
  TIMELINE_SPACING_NOTE,
  WORKSPACE_NAV_ITEMS,
  WORKSPACE_TAB_VIEWS,
  applyWorkspaceLightPresentation,
  canonicalWorkspaceHeader,
  graphInspectorDismissalAfter,
  handleWorkspaceDrawerKeyDown,
  isOptionalDeniedArcMetadata,
  shouldRestoreGraphInspector,
  timelinePresentationMode,
  workspaceAvailabilityCopy,
  workspaceEvidenceDimensions,
} from '../src/lib/workspacePresentation.js'
import { emptyInvestigationContext, applySubject, subjectFromGraphNode } from '../src/lib/investigationContext.js'
import { pinFetchedAssessment } from '../src/lib/temporalAssessment.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const GRAPH = readFileSync(new URL('../src/graph/GraphView.jsx', import.meta.url), 'utf8')
const SUPA = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const TEMPORAL = readFileSync(new URL('../src/lib/temporalAssessment.js', import.meta.url), 'utf8')
const THEME = readFileSync(new URL('../src/lib/themeFlag.js', import.meta.url), 'utf8')
const PKG = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
const CESIUM = readFileSync(new URL('../src/lib/worldViewCesiumEllipsoidRendererAdapter.js', import.meta.url), 'utf8')
const TIMELINE = readFileSync(new URL('../src/views/TimelineView.jsx', import.meta.url), 'utf8')
const ARCS = readFileSync(new URL('../src/views/ArcsView.jsx', import.meta.url), 'utf8')
const COMPARE = readFileSync(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')

const CANONICAL = Object.freeze({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'evt-fixture',
  label: 'Fixture event',
  type: 'event',
  summary: 'Recorded fixture summary.',
  occurred_at: '2024-04-08T17:59:00Z',
})

const CHILD = Object.freeze({
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  label: 'Selected child node',
  type: 'actor',
  summary: 'This must not replace the header.',
  occurred_at: '2025-01-01T00:00:00Z',
  place: 'Invented Place',
})

test('light presentation applies without a backend flag', () => {
  const el = { dataset: {} }
  const store = { v: null, setItem(k, val) { this.v = [k, val] } }
  assert.equal(applyWorkspaceLightPresentation(el, store), 'light')
  assert.equal(el.dataset.theme, 'light')
  assert.deepEqual(store.v, ['mip-theme', 'light'])
  assert.match(THEME, /Owner-selected light presentation at boot/)
  assert.doesNotMatch(THEME, /await supabase/)
})

test('five evidence dimensions stay separate; no aggregate score', () => {
  const dims = workspaceEvidenceDimensions(null)
  assert.deepEqual(
    dims.map((d) => d.key),
    ['evidence_strength', 'source_reliability', 'authentication', 'review_status', 'remaining_uncertainty'],
  )
  assert.ok(dims.every((d) => d.value === EVIDENCE_UNRECORDED))
  const nodeDims = workspaceEvidenceDimensions({}, { forNode: true })
  assert.ok(nodeDims.every((d) => d.value === NODE_EVIDENCE_UNRECORDED))
  const src = readFileSync(new URL('../src/lib/workspacePresentation.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /truth_score|bias_score|aggregatedScore/)
})

test('canonical header ignores a selected child and keeps missing location explicit', () => {
  const ic = applySubject(emptyInvestigationContext('graph'), subjectFromGraphNode(CANONICAL))
  const header = canonicalWorkspaceHeader({
    investigationContext: ic,
    canonicalNode: CANONICAL,
    selectedChild: CHILD,
  })
  assert.equal(header.title, 'Fixture event')
  assert.equal(header.location, LOCATION_UNRECORDED)
  assert.equal(header.when, 'Apr 8, 2024 · UTC')
  assert.equal(header.description, 'Recorded fixture summary.')
  assert.equal(header.selectedChildReplacedHeader, false)
  assert.notEqual(header.title, CHILD.label)
  assert.notEqual(header.location, CHILD.place)

  const empty = canonicalWorkspaceHeader({ investigationContext: emptyInvestigationContext('news') })
  assert.equal(empty.title, 'No canonical subject')
  assert.equal(empty.location, LOCATION_UNRECORDED)
  assert.equal(empty.when, TIME_UNRECORDED)
})

test('graph inspector stays dismissed until explicit select or a different subject', () => {
  const dismissed = graphInspectorDismissalAfter({
    action: 'dismiss',
    canonicalSubjectId: CANONICAL.id,
  })
  assert.equal(dismissed.dismissed, true)
  assert.equal(shouldRestoreGraphInspector({
    dismissed: true,
    dismissedSubjectId: CANONICAL.id,
    canonicalSubjectId: CANONICAL.id,
  }), false)
  assert.equal(shouldRestoreGraphInspector({
    dismissed: true,
    dismissedSubjectId: CANONICAL.id,
    canonicalSubjectId: CHILD.id,
  }), true)
  const explicit = graphInspectorDismissalAfter({ action: 'explicit_select' })
  assert.equal(explicit.dismissed, false)
  assert.match(APP, /graphInspectorDismissed/)
  assert.match(APP, /shouldRestoreGraphInspector/)
})

test('optional denied arc metadata is distinguished from unexpected server errors', () => {
  assert.equal(isOptionalDeniedArcMetadata({ code: '42501', message: 'permission denied for table story_arcs' }), true)
  assert.equal(isOptionalDeniedArcMetadata({ code: 'PGRST205', message: "Could not find the table 'public.story_arcs' in the schema cache" }), true)
  assert.equal(isOptionalDeniedArcMetadata({ code: 'PGRST000', message: 'Internal Server Error' }), false)
  assert.match(SUPA, /isPostgrestPermissionDenied\(arcsRes\.error\)/)
})

test('failed assessment hashing withholds with hash_unavailable and still enforces integrity', async () => {
  const withheld = await pinFetchedAssessment({ display: { status: 'ok', copy: 'insufficient history', panel: 'temporal assessment unavailable' } }, 'k', {
    hashFn: async () => {
      throw new Error('subtle digest failed')
    },
  })
  assert.equal(withheld.status, 'unavailable')
  assert.equal(withheld.reason, 'hash_unavailable')
  assert.equal(withheld.copy, 'temporal assessment unavailable')
  assert.match(TEMPORAL, /hash_unavailable/)
})

test('graph disposal destroys the renderer before clearing cards', () => {
  const destroyAt = GRAPH.indexOf('cy.destroy()')
  const clearAt = GRAPH.lastIndexOf('clearCards()')
  assert.ok(destroyAt !== -1 && clearAt !== -1)
  assert.ok(destroyAt < clearAt, 'cards must be cleaned after destroying the renderer')
  assert.match(GRAPH, /if \(cy\.destroyed\(\)\) return/)
})

test('workspace tabs, chronology, honest unavailable, and phosphor are wired', () => {
  assert.deepEqual(WORKSPACE_TAB_VIEWS.map((v) => v.key), ['graph', 'timeline', 'arcs', 'world', 'compare'])
  assert.ok(WORKSPACE_NAV_ITEMS.some((v) => v.key === 'news' && v.label === 'Feed'))
  assert.equal(timelinePresentationMode('list'), 'list')
  assert.equal(timelinePresentationMode('chronology'), 'chronology')
  assert.match(TIMELINE, /TIMELINE_SPACING_NOTE/)
  assert.match(TIMELINE, /layout=\{presentation === 'list' \? 'list' : 'horizontal'\}/)
  assert.equal(workspaceAvailabilityCopy('arcs').title, 'No story arc is available yet')
  assert.equal(workspaceAvailabilityCopy('compare').title, 'No validated source comparison yet')
  assert.match(ARCS, /WorkspaceAvailability/)
  assert.match(ARCS, /arc-development-card/)
  assert.match(COMPARE, /sc-columns/)
  assert.match(COMPARE, /WorkspaceAvailability/)
  assert.match(PKG, /"@phosphor-icons\/react": "\^2\.1\.10"/)
  assert.match(CESIUM, /CESIUM_BASE_URL/)
  assert.match(APP, /<InvestigationWorkspace/)
  assert.match(APP, /<InvestigationContextBar/)
  assert.match(APP, /onClick=\{\(\) => \(v\.key === 'more' \? setMoreOpen\(true\) : changeView\(v\.key\)\)\}/)
  assert.match(APP, /onClick=\{openExplore\}/)
  assert.doesNotMatch(APP, /\.insert\(|\.upsert\(|\.delete\(|\.rpc\(/)
})

test('phone drawer Escape dismisses and focus trap wraps', () => {
  const calls = []
  assert.equal(handleWorkspaceDrawerKeyDown({ key: 'Escape' }, { onDismiss: () => calls.push('dismiss') }), true)
  assert.deepEqual(calls, ['dismiss'])

  const first = { focus() { calls.push('first') } }
  const last = { focus() { calls.push('last') } }
  const dialogEl = {
    ownerDocument: { activeElement: last },
    querySelectorAll() { return [first, last] },
  }
  const ev = { key: 'Tab', shiftKey: false, preventDefault() { calls.push('prevent') } }
  assert.equal(handleWorkspaceDrawerKeyDown(ev, { dialogEl }), true)
  assert.ok(calls.includes('first'))
})
