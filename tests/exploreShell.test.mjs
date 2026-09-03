// R4.75 Step 3 — Explore / Change Topic shell.
// DISPLAY / client only. Opening, News-filter browse, and dismiss must not
// mutate Investigation Context. Opening is not a view change.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  emptyInvestigationContext,
  applySubject,
  subjectFromWorldViewSelection,
  setInvestigationActiveView,
} from '../src/lib/investigationContext.js'
import { CLEVELAND_CANONICAL_EVENT_ID, CLEVELAND_ASSESSMENT_KEY } from '../src/lib/temporalAssessment.js'
import { selectionStubFromProjection } from '../src/lib/spatialProjection.js'
import {
  EXPLORE_SHELL_NON_MUTATING_ACTIONS,
  preserveInvestigationThroughExplore,
} from '../src/lib/exploreShell.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const NEWS = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const SHELL = readFileSync(new URL('../src/lib/exploreShell.js', import.meta.url), 'utf8')
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
  const end = src.indexOf('}, [])', start)
  assert.notEqual(end, -1, `${name} body terminator not found`)
  return src.slice(start, end + 8)
}

test('Explore open / News filter browse / dismiss preserve Cleveland and do not JUMP_CLEARS', () => {
  const seeded = seedCleveland('graph')
  assert.equal(seeded.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(seeded.active_view, 'graph')
  assert.equal(seeded.as_of_time, CLEVELAND_ROW.valid_from_utc)
  assert.equal(seeded.temporal_assessment_reference, CLEVELAND_ASSESSMENT_KEY)

  let ic = seeded
  for (const action of EXPLORE_SHELL_NON_MUTATING_ACTIONS) {
    ic = preserveInvestigationThroughExplore(ic, action)
  }

  assert.equal(ic, seeded)
  assert.equal(ic.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(ic.active_view, 'graph')
  assert.equal(ic.as_of_time, CLEVELAND_ROW.valid_from_utc)
  assert.equal(ic.canonical_subject_type, 'event')
  assert.notEqual(ic.canonical_subject_id, INVENTED_EVENT_ID)
  assert.notEqual(ic.canonical_subject_id, CLEVELAND_MIP_OBJECT_ID)

  const viaNewsTab = setInvestigationActiveView(ic, 'news')
  const afterBrowseOnNews = preserveInvestigationThroughExplore(viaNewsTab, 'browseFilters')
  assert.equal(afterBrowseOnNews.canonical_subject_id, CLEVELAND_CANONICAL_EVENT_ID)
  assert.equal(afterBrowseOnNews.active_view, 'news')

  assert.doesNotMatch(SHELL, /applySubject|resetJumpContext/)
})

test('App shell has Explore / Change Topic and opening it is not a view change', () => {
  assert.match(APP, /Explore \/ Change Topic/)
  assert.match(APP, /aria-label="Explore \/ Change Topic"/)
  assert.match(APP, /const \[exploreOpen, setExploreOpen\]/)
  assert.match(APP, /className="sheet explore-sheet"/)
  assert.match(APP, /role="dialog"/)
  assert.match(APP, /variant="drawer"/)

  const openBody = callbackBody(APP, 'openExplore')
  assert.ok(openBody.includes('setExploreOpen(true)'), 'openExplore must set the overlay flag')
  assert.ok(!openBody.includes("changeView('news')"), 'opening Explore must not changeView news')
  assert.ok(!openBody.includes('changeView('), 'opening Explore must not change active_view')
  assert.ok(!openBody.includes('applySubject'), 'opening Explore must not replace the subject')
  assert.ok(!openBody.includes('resetJumpContext'), 'opening Explore must not JUMP_CLEARS')
  assert.ok(!openBody.includes('setInvestigationActiveView'), 'opening Explore must not rotate active_view')

  const closeBody = callbackBody(APP, 'closeExplore')
  assert.ok(closeBody.includes('setExploreOpen(false)'))
  assert.ok(!closeBody.includes('applySubject'))
  assert.ok(!closeBody.includes('resetJumpContext'))
  assert.ok(!closeBody.includes('changeView('))

  // Ordinary nav still uses changeView; Explore uses openExplore.
  assert.match(
    APP,
    /onClick=\{\(\) => \(v\.key === 'more' \? setMoreOpen\(true\) : changeView\(v\.key\)\)\}/,
  )
  assert.match(APP, /onClick=\{openExplore\}/)
})

test('drawer NewsView reuses the same discovery system; filters stay local', () => {
  assert.match(NEWS, /variant = 'page'/)
  assert.match(NEWS, /isDrawer = variant === 'drawer'/)
  assert.match(NEWS, /never write Investigation Context/)
  assert.doesNotMatch(NEWS, /applySubject/)
  assert.doesNotMatch(NEWS, /resetJumpContext/)
  assert.doesNotMatch(NEWS, /setInvestigationActiveView/)
  assert.doesNotMatch(NEWS, /setInvestigationContext/)
  assert.match(NEWS, /articlesUnavailable/)
  assert.match(NEWS, /No eligible articles to display/)
  assert.match(NEWS, /0 articles; no rows are invented/)
  assert.match(NEWS, /!articlesUnavailable && articles\.length === 0/)
  assert.match(NEWS, /<button className="news-filters-btn" onClick=\{\(\) => setFiltersOpen\(true\)\}>/)
  assert.match(NEWS, /\{filtersOpen && \(/)

  // Drawer instance is not the News tab and does not receive IC or focusArticleId.
  const drawerIdx = APP.indexOf('variant="drawer"')
  assert.notEqual(drawerIdx, -1)
  const drawerBlock = APP.slice(drawerIdx, APP.indexOf('/>', drawerIdx) + 2)
  assert.ok(drawerBlock.includes('closeExploreThen(openArcInView)'))
  assert.ok(drawerBlock.includes('closeExploreThen(openNodeInGraph)'))
  assert.ok(drawerBlock.includes('closeExploreThen(openEventInTimeline)'))
  assert.ok(!drawerBlock.includes('investigationContext='), 'drawer filters must not bind IC')
  assert.ok(!drawerBlock.includes('focusArticleId'), 'drawer must not inherit page focus')
})

test('explicit select from Explore closes the drawer via existing News jump handlers', () => {
  const wrapIdx = APP.indexOf('const closeExploreThen = useCallback')
  assert.notEqual(wrapIdx, -1)
  const wrapBody = APP.slice(wrapIdx, APP.indexOf('}, [])', wrapIdx) + 8)
  assert.ok(wrapBody.includes('setExploreOpen(false)'))
  assert.ok(wrapBody.includes('handler(...args)'))
  assert.ok(!wrapBody.includes('applySubject'), 'wrapper itself must not applySubject; handlers do')
})

test('DISPLAY-only: no V2 writes, no invented Cleveland literal in production src', () => {
  assert.doesNotMatch(SHELL, /\.(insert|upsert|update|delete|rpc)\(/)
  assert.doesNotMatch(SHELL, /reader_state/)
  assert.doesNotMatch(SHELL, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(APP, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(NEWS, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
  assert.doesNotMatch(IC, /acc55cb2-5ac2-4aed-be36-3f576d2bc443/)
})
