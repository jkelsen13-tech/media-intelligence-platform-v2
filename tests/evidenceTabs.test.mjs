import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tabs = readFileSync(new URL('../src/components/EvidenceTabs.jsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/views/TimelineView.jsx', import.meta.url), 'utf8')
const arcs = readFileSync(new URL('../src/views/ArcsView.jsx', import.meta.url), 'utf8')
const grouped = readFileSync(new URL('../src/views/GroupedTimelineView.jsx', import.meta.url), 'utf8')

test('Timeline and Story Arcs use one accessible tab-row implementation', () => {
  assert.match(tabs, /role="tablist"/)
  assert.match(tabs, /role="tab"/)
  assert.match(tabs, /aria-controls=\{tab\.panelId\}/)
  assert.match(timeline, /import EvidenceTabs from '\.\.\/components\/EvidenceTabs'/)
  assert.match(arcs, /import EvidenceTabs from '\.\.\/components\/EvidenceTabs'/)
  assert.doesNotMatch(timeline, /<div className="ep-tabs"/)
  assert.doesNotMatch(arcs, /<div className="ep-tabs"/)
})

test('grouped Timeline does not render a composite confidence percentage', () => {
  assert.doesNotMatch(grouped, /timeline-confidence/)
  assert.doesNotMatch(grouped, /% documented/)
  assert.doesNotMatch(grouped, /confidenceColor/)
})
