import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  filterGraphRegion,
  graphRegionOptions,
  recordedGeography,
  recordedTime,
  GRAPH_WORKSPACE_MODES,
} from '../src/lib/graphWorkspaceModel.js'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const modePanel = readFileSync(new URL('../src/graph/GraphModePanel.jsx', import.meta.url), 'utf8')

const nodes = [
  { id: 'policy', label: 'Policy', type: 'policy', occurred_at: '2026-02-02' },
  { id: 'event', label: 'Incident', type: 'event', occurred_at: '2026-01-01', metadata: { location: 'Recorded place' } },
  { id: 'person', label: 'Person', type: 'actor', metadata: { entity_type: 'person' } },
  { id: 'institution', label: 'Institution', type: 'actor', metadata: { entity_type: 'institution' } },
]
const edges = [
  { id: 'one', source: 'policy', target: 'event' },
  { id: 'two', source: 'event', target: 'person' },
  { id: 'three', source: 'person', target: 'institution' },
]

test('semantic region controls expose only real regions and preserve ungrouped entities', () => {
  const options = graphRegionOptions(nodes)
  assert.deepEqual(options.map((option) => option.id), ['all', 'policy_courts', 'incidents', 'civil_society', 'ungrouped'])
  assert.equal(options.find((option) => option.id === 'ungrouped').count, 1)
  const filtered = filterGraphRegion(nodes, edges, 'incidents')
  assert.deepEqual(filtered.nodes.map((node) => node.id), ['event'])
  assert.deepEqual(filtered.edges, [])
})

test('Geography and Time models preserve explicit missing fields rather than infer them', () => {
  const geography = recordedGeography(nodes)
  assert.equal(geography.length, 1)
  assert.equal(geography[0].key, 'event')
  assert.equal(geography[0].place, 'Recorded place')
  assert.equal(geography[0].reviewState, 'recorded_legacy')
  assert.equal(geography[0].latitude, null)
  assert.equal(geography[0].longitude, null)
  const time = recordedTime(nodes)
  assert.deepEqual(time.map((row) => row.key), ['event', 'policy', 'institution', 'person'])
  assert.equal(time.at(-1).occurredAt, null)
})

test('focused Graph workspace exposes the documented modes and a real Expand control', () => {
  assert.deepEqual(GRAPH_WORKSPACE_MODES.map((mode) => mode.id), ['relationships', 'geography', 'time'])
  assert.match(app, /aria-label="Focused Graph views"/)
  assert.match(app, /<span>Region<\/span>/)
  assert.match(app, /\n\s*Expand\s*\n\s*<\/button>/)
  assert.match(app, /Focused view · \$\{displayNodes\.length\} of/)
  assert.match(app, /focusDepth\(isMobile\) \+ focusExpansion/)
  assert.match(modePanel, /Locations are not inferred from headlines, labels, outlet context, or automated candidates\./)
  assert.match(modePanel, /No recorded date/)
})
