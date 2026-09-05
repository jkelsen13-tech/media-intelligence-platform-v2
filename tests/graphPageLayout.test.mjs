import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  GRAPH_CANVAS_MIN_PX,
  GRAPH_CANVAS_MIN_SHORT_PX,
  GRAPH_FIT_RESIZE_THRESHOLD_PX,
  GRAPH_NARROW_CHROME_QUERY,
  GRAPH_PHONE_QUERY,
  compactCoverageSummary,
  formatCoverageMetric,
  graphInspectorPresentation,
  shouldRefitGraph,
} from '../src/graph/graphCanvasLayout.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const GRAPH = readFileSync(new URL('../src/graph/GraphView.jsx', import.meta.url), 'utf8')
const COVERAGE = readFileSync(new URL('../src/graph/GraphCoverageNotice.jsx', import.meta.url), 'utf8')
const LEGEND = readFileSync(new URL('../src/graph/Legend.jsx', import.meta.url), 'utf8')
const SHELL = readFileSync(new URL('../src/components/InvestigationWorkspace.jsx', import.meta.url), 'utf8')
const INDEX_CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const WORKSPACE_CSS = readFileSync(new URL('../src/styles/workspace.css', import.meta.url), 'utf8')

const SAMPLE_COVERAGE = Object.freeze({
  articleCount: 1842,
  articlesWithPublishedNode: 1,
  pendingGraphCandidates: 0,
  documentedRelationshipCount: 0,
  articlesWithoutPublishedNode: 1841,
})

test('coverage metrics stay honest stored counts, never a completeness score', () => {
  assert.equal(formatCoverageMetric(0), '0')
  assert.equal(formatCoverageMetric(1842), '1,842')
  assert.equal(formatCoverageMetric(null), 'not recorded')
  assert.equal(formatCoverageMetric(-1), 'not recorded')
  const line = compactCoverageSummary(SAMPLE_COVERAGE, { shownNodeCount: 1, totalNodeCount: 1 })
  assert.match(line, /1,842 articles/)
  assert.match(line, /1 resolved/)
  assert.match(line, /0 pending review/)
  assert.match(line, /0 relationships/)
  assert.match(line, /1,841 not node-linked/)
  assert.match(line, /1 published nodes shown/)
  assert.doesNotMatch(line, /completeness|score|percent complete/i)
})

test('coverage disclosure is compact by default and still exposes every stored metric', () => {
  assert.match(COVERAGE, /<details/)
  assert.doesNotMatch(COVERAGE, /<details[^>]*\sopen/)
  assert.match(COVERAGE, /data-coverage-state="collapsed"/)
  assert.match(COVERAGE, /graph-coverage-compact/)
  assert.match(COVERAGE, /These are stored resolution and review counts, not a completeness score/)
  assert.match(COVERAGE, /Corpus articles/)
  assert.match(COVERAGE, /Resolved to a published node/)
  assert.match(COVERAGE, /Graph candidates pending review/)
  assert.match(COVERAGE, /Documented relationships/)
  assert.match(COVERAGE, /Not yet node-linked/)
  assert.match(COVERAGE, /onToggle/)
})

test('canvas keeps a usable minimum height instead of collapsing under chrome', () => {
  assert.equal(GRAPH_CANVAS_MIN_PX, 360)
  assert.equal(GRAPH_CANVAS_MIN_SHORT_PX, 280)
  assert.match(INDEX_CSS, /--graph-canvas-min:\s*360px/)
  assert.match(INDEX_CSS, /--graph-canvas-min:\s*280px/)
  assert.match(INDEX_CSS, /\.graph-stage \{[\s\S]*min-height: var\(--graph-canvas-min\)/)
  assert.match(INDEX_CSS, /\.graph-canvas-wrap \{[\s\S]*min-height: var\(--graph-canvas-min\)/)
  assert.match(INDEX_CSS, /\.graph-canvas-wrap \{[\s\S]*overflow: hidden/)
  assert.match(INDEX_CSS, /\.graph-body \{[\s\S]*min-height: var\(--graph-canvas-min\)/)
  assert.match(APP, /data-graph-stage="true"/)
})

test('zoom controls stay inside the canvas wrap, not over coverage chrome', () => {
  assert.match(GRAPH, /<div className="graph-canvas-wrap">/)
  assert.match(GRAPH, /<GraphViewControls/)
  assert.ok(GRAPH.indexOf('className="graph-canvas-wrap"') < GRAPH.indexOf('<GraphViewControls'))
  assert.match(INDEX_CSS, /\.graph-view-controls \{[\s\S]*position: absolute/)
  assert.match(INDEX_CSS, /\.graph-canvas-wrap \{[\s\S]*overflow: hidden/)
  assert.match(INDEX_CSS, /\.graph-layout\.inspector-overlay \.graph-view-controls/)
})

test('significant canvas size changes and layoutRevision refit the graph', () => {
  assert.equal(GRAPH_FIT_RESIZE_THRESHOLD_PX, 32)
  assert.equal(shouldRefitGraph(null, { width: 800, height: 400 }), false)
  assert.equal(shouldRefitGraph({ width: 800, height: 400 }, { width: 800, height: 0 }), false)
  assert.equal(shouldRefitGraph({ width: 800, height: 400 }, { width: 810, height: 405 }), false)
  assert.equal(shouldRefitGraph({ width: 800, height: 191 }, { width: 800, height: 360 }), true)
  assert.equal(shouldRefitGraph({ width: 500, height: 400 }, { width: 800, height: 400 }), true)
  assert.match(GRAPH, /layoutRevision = 0/)
  assert.match(GRAPH, /shouldRefitGraph/)
  assert.match(GRAPH, /\[panelOpen, layoutRevision\]/)
  assert.match(APP, /layoutRevision=\{graphLayoutRevision\}/)
  assert.match(APP, /onToggle=\{\(\) => setGraphLayoutRevision/)
  assert.match(APP, /onChromeChange=\{\(\) => setGraphLayoutRevision/)
  assert.match(SHELL, /onChromeChange/)
})

test('inspector and legend use overlay or collapse on tablet without changing phone graph semantics', () => {
  assert.equal(GRAPH_PHONE_QUERY, '(max-width: 767px)')
  assert.equal(GRAPH_NARROW_CHROME_QUERY, '(max-width: 1180px)')
  assert.equal(
    graphInspectorPresentation({ selected: { id: 'n1' }, isMobile: false, isNarrowChrome: false }),
    'docked',
  )
  assert.equal(
    graphInspectorPresentation({ selected: { id: 'n1' }, isMobile: false, isNarrowChrome: true }),
    'drawer',
  )
  assert.equal(
    graphInspectorPresentation({ selected: { id: 'n1' }, isMobile: true, isNarrowChrome: true }),
    'sheet',
  )
  assert.equal(
    graphInspectorPresentation({ selected: null, policyNode: null, edgeEvidence: null, isMobile: false, isNarrowChrome: true }),
    'hidden',
  )
  assert.match(APP, /useMediaQuery\('\(max-width: 767px\)'\)/)
  assert.match(APP, /useMediaQuery\(GRAPH_NARROW_CHROME_QUERY\)/)
  assert.match(APP, /graphInspectorOverlay/)
  assert.match(APP, /inspector-overlay/)
  assert.match(LEGEND, /max-width: 1180px/)
  assert.doesNotMatch(APP, /isMobile = useMediaQuery\('\(max-width: 1180px\)'\)/)
  assert.match(INDEX_CSS, /@media \(min-width: 768px\) and \(max-width: 1180px\)/)
})

test('graph remains the primary workspace on short viewports', () => {
  assert.match(SHELL, /ws-graph-primary/)
  assert.match(WORKSPACE_CSS, /\.ws-graph-primary \.ws-description \{\s*display: none/)
  assert.match(WORKSPACE_CSS, /@media \(max-height: 820px\)/)
  assert.match(INDEX_CSS, /@media \(max-height: 820px\)/)
  assert.match(INDEX_CSS, /@media \(max-height: 700px\)/)
  assert.match(INDEX_CSS, /html,[\s\S]*max-height: 100dvh/)
})

test('layout-only change does not invent graph data or alter relationship checks', () => {
  assert.match(GRAPH, /edges\.some\(\(edge\) => edge\.source === nodeKey \|\| edge\.target === nodeKey\)/)
  assert.doesNotMatch(APP, /layoutFixture|demoNodes|substitute/)
  assert.match(APP, /No published graph nodes or documented relationships are available/)
})
