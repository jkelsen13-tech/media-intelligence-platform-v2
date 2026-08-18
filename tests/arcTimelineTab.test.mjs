// Track B Step 3 item 5 — ArcsView Timeline tab (Screen 4 ↔ Screen 5
// parity) static drift guards + connector behavior pins.
// Criteria: verifier/trackb3-v5/trackb3-step3-item5.md.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { normalizeArcEvent } from '../src/lib/timelineScreenModel.js'
import { buildConnectors, CONNECTOR_SEQUENCE_LABEL } from '../src/lib/timelineEngine.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(join(here, '..', p), 'utf8')

// --- A5.1: three tabs in the addendum's order -----------------------------------

test('ArcsView renders three tabs in addendum order: Overview / Timeline / Evidence', () => {
  const view = src('src/views/ArcsView.jsx')
  const sharedTabs = src('src/components/EvidenceTabs.jsx')
  const tabsBlock = view.slice(view.indexOf('<EvidenceTabs'), view.indexOf('/>', view.indexOf('<EvidenceTabs')))
  const overviewAt = tabsBlock.indexOf("{ id: 'overview', label: 'Overview'")
  const timelineAt = tabsBlock.indexOf("{ id: 'timeline', label: 'Timeline'")
  const evidenceAt = tabsBlock.indexOf("{ id: 'evidence', label: 'Evidence'")
  assert.ok(view.includes("import EvidenceTabs from '../components/EvidenceTabs'"), 'shared tab seam is imported')
  assert.ok(overviewAt !== -1 && timelineAt !== -1 && evidenceAt !== -1, 'all three tabs present')
  assert.ok(overviewAt < timelineAt && timelineAt < evidenceAt, 'tabs in addendum order')
  assert.ok(sharedTabs.includes('role="tablist"'), 'shared row supplies tablist semantics')
  assert.ok(sharedTabs.includes('aria-selected={selected}'), 'shared row supplies active-tab semantics')
  assert.ok(view.includes("activeTab === 'timeline' && detail"), 'Timeline body gated on the tab')
})

// --- A5.2: ArcTimeline consumed through the item-4 seams -------------------------

test('Timeline tab renders the shared ArcTimeline over normalizeArcEvent entries', () => {
  const view = src('src/views/ArcsView.jsx')
  assert.ok(view.includes("import ArcTimeline from '../components/ArcTimeline'"))
  assert.ok(
    view.includes("import { normalizeArcEvent, TIMELINE_CLOSING_FOOTNOTE } from '../lib/timelineScreenModel'"),
    'entries + footnote come through the timelineScreenModel seam',
  )
  assert.ok(
    view.includes('detail.events.map(normalizeArcEvent).filter(Boolean)'),
    'entries normalized through the item-4 seam',
  )
  assert.ok(view.includes('loadArticleExcerpt'), 'expansion excerpt loader passed through')
  const render = view.slice(view.indexOf('<ArcTimeline'), view.indexOf('/>', view.indexOf('<ArcTimeline')))
  assert.ok(render.includes('entries={timelineEntries}'))
  assert.ok(render.includes('edges={[]}'), 'arc scope passes edges=[] by construction')
  assert.ok(render.includes('loadArticle={loadArticleExcerpt}'))
  assert.ok(
    render.includes('emptyText="No consequence events recorded yet for this arc."'),
    'empty state matches Screen 5 arc scope',
  )
})

// --- A5.3: connectors — n−1 "Sequence only" over the live arc shape --------------

test('arc-scope connectors are ALL "Sequence only" (arc_events are not nodes)', () => {
  const entries = [
    { id: 'a1', occurred_at: '2026-05-01T00:00:00Z', category: 'incident', title: 'One', confidence: 'confirmed' },
    { id: 'a2', occurred_at: '2026-05-20T00:00:00Z', category: 'report', title: 'Two', confidence: 'contested' },
    { id: 'a3', occurred_at: null, category: 'hearing', title: 'Three', confidence: 'inferred' },
  ].map(normalizeArcEvent).filter(Boolean)
  assert.equal(entries.length, 3)
  const connectors = buildConnectors(entries, [])
  assert.equal(connectors.length, entries.length - 1, 'a connector between EVERY adjacent pair')
  for (const c of connectors) {
    assert.equal(c.label, CONNECTOR_SEQUENCE_LABEL)
    assert.equal(c.kind, 'sequence')
  }
})

// --- A5.4: closing footnote — seam import, gated on the tab, never re-typed -------

test('closing footnote is imported via the seam and gated on the Timeline tab', () => {
  const view = src('src/views/ArcsView.jsx')
  assert.ok(
    !view.includes("from '../lib/timelineEngine'"),
    'screen copy comes through the timelineScreenModel seam, never the engine directly',
  )
  assert.ok(
    !view.includes('Chronology is shown as sequence.'),
    'footnote literal never re-typed in ArcsView',
  )
  const footer = view.slice(view.indexOf('<TrustFooter'), view.indexOf('/>', view.indexOf('<TrustFooter')))
  assert.ok(footer.includes("activeTab === 'timeline'"), 'footnote gated on the Timeline tab')
  assert.ok(footer.includes('{TIMELINE_CLOSING_FOOTNOTE}'))
  assert.ok(footer.includes('ep-tl-footnote'), 'renders with the shared footnote class')
})

// --- A5.5/A5.6: reuse not rebuild; no stale comments; hex audit -------------------

test('ArcsView reuses the kit — no connector engine or entry markup of its own', () => {
  const view = src('src/views/ArcsView.jsx')
  assert.ok(!view.includes('buildConnectors'), 'connector derivation stays inside ArcTimeline')
  assert.ok(!view.includes('TimelineConnector'), 'connector rendering stays inside ArcTimeline')
  assert.ok(!view.includes('TimelineEntryDetail'), 'entry detail stays inside ArcTimeline')
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(view), 'no hardcoded hex in ArcsView')
})

test('no stale "tab deferred" forward references remain', () => {
  const view = src('src/views/ArcsView.jsx')
  assert.ok(!view.includes('arrives with the item-3/4 engine'))
  assert.ok(!view.includes('is added when the'))
})
