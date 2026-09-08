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

test('Time orders qualified clocks by UTC rather than their source text', () => {
  const rows = recordedTime([
    {id:'later',label:'A',occurred_at:'2026-01-01T00:30:00Z'},
    {id:'earlier',label:'Z',occurred_at:'2026-01-01T01:00:00+02:00'},
  ])
  assert.deepEqual(rows.map(r=>r.key),['earlier','later'])
  assert.equal(rows[0].date.label,'2026-01-01 01:00:00 UTC+02:00')
  assert.equal(rows[0].occurredAt,'2026-01-01T01:00:00+02:00')
})

test('Time preserves microseconds and sorts equivalent offset spellings consistently', () => {
  const rows = recordedTime([
    {id:'later',label:'A',occurred_at:'2026-01-01T00:00:00.000002Z'},
    {id:'earlier',label:'Z',occurred_at:'2026-01-01 01:00:00.000001+01'},
    {id:'same',label:'B',occurred_at:'2026-01-01T00:00:00.000001+0000'},
  ])
  assert.deepEqual(rows.map(r=>r.key),['same','earlier','later'])
  assert.match(rows[1].date.label,/\.000001 UTC\+01:00$/)
  assert.equal(rows[1].date.wholeSecond,rows[0].date.wholeSecond)
})

test('Time keeps calendar dates, unqualified clocks, invalid dates and missing dates separate', () => {
  const rows = recordedTime([
    {id:'missing',label:'Missing'},
    {id:'invalid',label:'Invalid',occurred_at:'2024-02-30'},
    {id:'local',label:'Local',occurred_at:'2024-02-01T00:00'},
    {id:'day',label:'Day',occurred_at:'2024-02-29'},
    {id:'instant',label:'Instant',occurred_at:'2026-01-01T00:00Z'},
  ])
  assert.deepEqual(rows.map(r=>r.date.kind),['instant','date','local','invalid','missing'])
  assert.equal(rows[1].date.label,'2024-02-29 (date only)')
  assert.equal(rows[1].date.dateTime,'2024-02-29')
  assert.match(rows[2].date.label,/time zone not recorded/)
  assert.equal(rows[2].date.dateTime,null)
  assert.equal(rows[3].occurredAt,'2024-02-30')
  assert.equal(rows[3].date.dateTime,null)
})

test('Time rejects impossible clocks and unsupported dates without normalizing them', () => {
  const values=['2026-02-29','2024-04-08T24:00Z','2024-04-08T12:60Z','2024-04-08T12:00+24:00','2024-04-08T12:00:60Z','April 8 2024']
  const rows=recordedTime(values.map((occurred_at,i)=>({id:String(i),label:String(i),occurred_at})))
  assert.ok(rows.every(row=>row.date.kind==='invalid' && row.date.dateTime===null))
  assert.deepEqual(rows.map(row=>row.occurredAt),values)
})

test('Time preserves minute precision and explicitly unknown local offsets', () => {
  const rows=recordedTime([
    {id:'unknown',label:'Unknown',occurred_at:'2024-04-08T12:31-00:00'},
    {id:'minute',label:'Minute',occurred_at:'2024-04-08T12:30Z'},
  ])
  assert.equal(rows[0].date.label,'2024-04-08 12:30 UTC')
  assert.equal(rows[0].date.dateTime,'2024-04-08T12:30Z')
  assert.equal(rows[1].date.label,'2024-04-08 12:31 UTC (local offset unknown)')
})

test('Time ordering does not mutate inputs or turn equal timestamps into an evidence sequence', () => {
  const nodes=Object.freeze([
    Object.freeze({id:'b',label:'Same',occurred_at:'2024-04-08T12:30:00Z'}),
    Object.freeze({id:'a',label:'Same',occurred_at:'2024-04-08T12:30:00+00:00'}),
  ])
  assert.deepEqual(recordedTime(nodes).map(row=>row.key),['a','b'])
  assert.deepEqual(nodes.map(row=>row.id),['b','a'])
})
