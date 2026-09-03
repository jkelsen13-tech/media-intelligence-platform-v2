// Track B nav restructure (2026-08-16): nav bar is core tabs + "More";
// R4 adds World View as a fifth core tab. Legal & Policy ('phase3') and
// Source Comparison ('compare') live inside the More sheet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CORE_VIEWS,
  MORE_VIEW,
  PHASE3_VIEW,
  SOURCE_COMPARISON_VIEW,
  buildNavViews,
  buildMoreEntries,
  isMoreViewKey,
} from '../src/lib/navViews.js'

test('both flags on: 6 tabs, More last, core order unchanged including World View', () => {
  const nav = buildNavViews({ phase3Beta: true, sourceComparisonBeta: true })
  assert.deepEqual(
    nav.map((v) => v.key),
    ['news', 'graph', 'timeline', 'arcs', 'world', 'more'],
  )
  assert.equal(nav.length, 6)
})

test('both flags off: More hides entirely — 5 core tabs including World View, no trace', () => {
  const nav = buildNavViews({ phase3Beta: false, sourceComparisonBeta: false })
  assert.deepEqual(
    nav.map((v) => v.key),
    ['news', 'graph', 'timeline', 'arcs', 'world'],
  )
  assert.equal(buildMoreEntries({ phase3Beta: false, sourceComparisonBeta: false }).length, 0)
})

test('single flag on: More still appears; sheet lists only the authorized surface', () => {
  const phase3Only = buildNavViews({ phase3Beta: true, sourceComparisonBeta: false })
  assert.equal(phase3Only.length, 6)
  assert.deepEqual(
    buildMoreEntries({ phase3Beta: true, sourceComparisonBeta: false }).map((v) => v.key),
    ['phase3'],
  )
  const compareOnly = buildNavViews({ phase3Beta: false, sourceComparisonBeta: true })
  assert.equal(compareOnly.length, 6)
  assert.deepEqual(
    buildMoreEntries({ phase3Beta: false, sourceComparisonBeta: true }).map((v) => v.key),
    ['compare'],
  )
})

test('More sheet order matches mockups: Source Comparison, then Legal & Policy', () => {
  const entries = buildMoreEntries({ phase3Beta: true, sourceComparisonBeta: true })
  assert.deepEqual(
    entries.map((v) => v.key),
    ['compare', 'phase3'],
  )
})

test('"(Beta)" suffixes are gone from all nav labels', () => {
  for (const v of [...CORE_VIEWS, MORE_VIEW, PHASE3_VIEW, SOURCE_COMPARISON_VIEW]) {
    assert.ok(!v.label.includes('Beta'), `${v.key} label carries Beta`)
    assert.ok(!v.shortLabel.includes('Beta'), `${v.key} shortLabel carries Beta`)
  }
  assert.equal(PHASE3_VIEW.label, 'Legal & Policy')
  assert.equal(SOURCE_COMPARISON_VIEW.label, 'Source Comparison')
  assert.equal(MORE_VIEW.label, 'More')
})

test('view keys for gated surfaces are unchanged (cross-jump stability)', () => {
  assert.equal(PHASE3_VIEW.key, 'phase3')
  assert.equal(SOURCE_COMPARISON_VIEW.key, 'compare')
  assert.ok(isMoreViewKey('phase3'))
  assert.ok(isMoreViewKey('compare'))
  assert.ok(!isMoreViewKey('news'))
  assert.ok(!isMoreViewKey('more'))
})

test('More member views never appear as top-level tabs', () => {
  for (const flags of [
    { phase3Beta: true, sourceComparisonBeta: true },
    { phase3Beta: true, sourceComparisonBeta: false },
    { phase3Beta: false, sourceComparisonBeta: true },
    { phase3Beta: false, sourceComparisonBeta: false },
  ]) {
    const keys = buildNavViews(flags).map((v) => v.key)
    assert.ok(!keys.includes('phase3'))
    assert.ok(!keys.includes('compare'))
  }
})


test('arc route names both longitudinal arcs and bounded research collections', () => {
  const arcRoute = CORE_VIEWS.find((view) => view.key === 'arcs')
  assert.equal(arcRoute?.label, 'Arcs & Collections')
  assert.equal(arcRoute?.shortLabel, 'Arcs')
})
