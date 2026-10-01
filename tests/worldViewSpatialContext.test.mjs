import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { weatherFromArchivePayload } from '../src/lib/eventTimeWeather.js'
import { buildWorldViewSpatialContext as buildModel, DEFAULT_WORLD_VIEW_CONTEXT_LAYERS as layers,
  normalizeWorldViewContextLayers, positionWorldViewSpatialContextCard as position, worldViewSpatialContextKey } from '../src/lib/worldViewSpatialContext.js'

// Synthetic supplied records verify contracts; they are not runtime data.
const row = {
  subject_graph_node_id: 'test-subject', mip_object_id: 'test-spatial', revision_id: 'v1', revision_ordinal: 1,
  subject_snapshot_hash: 'snapshot-1', spatial_role: 'event', object_type: 'event_spatial_relationship',
  precision_class: 'city', geometry_status: 'coarsened_to_precision_class',
  display_geometry: { type: 'Point', coordinates: [-80, 40] },
  valid_from_utc: '2024-04-08T17:00:00Z', valid_to_utc: '2024-04-08T20:00:00Z', valid_time_precision: 'range',
  revision_known_at_utc: '2026-09-01T01:02:03.123456+00:00', review_state: 'operative', release_state: 'released',
  source_native_time: { source_url: 'https://example.com/record', location_label: 'Test city', calendar_date: '2024-04-08', source_ancestry: ['source-parent'] },
  evidence_refs: [{ evidence_snapshot_id: 'test-snapshot', evidence_role: 'primary_support', ancestors: ['test-parent'] }],
}
const ic = { canonical_subject_id: 'test-subject', canonical_subject_type: 'event', as_of_time: '2024-04-08T18:00:00Z' }
const selected = { id: 'test-subject', label: 'Recorded test event' }
const base = { visibleRow: row, investigationContext: ic, selected }
const intake = (fields, extra = {}) => ({ admitted: true, subjectId: 'test-subject', source: { label: 'Test source', referenceId: 'ref-1' },
  referenceTime: '2024-04-08', geography: { label: 'Test city', precision: 'city' }, classification: 'context', status: 'available', fields, ...extra })
const familyFields = {
  events: { description: 'Supplied description', status: 'Supplied event status' },
  people: { name: 'Supplied person', documentedRole: 'Documented witness' },
  markets: { company: 'Supplied company', ticker: 'TEST', documentedRelevance: 'Recorded investigation reference', value: '42 USD' },
  population: { place: 'Test city', population: 0, unit: 'people' },
  weather: { temperature: '14 °C', windDirection: '80°' },
  infrastructure: { name: 'Supplied port', documentedRelevance: 'Recorded investigation reference' },
  hazards: { name: 'Supplied flood', type: 'flood', status: 'Reported' },
  relationships: { from: 'Recorded A', to: 'Recorded B', documentedRelationship: 'Supplied relationship' },
}

test('empty eligibility creates no icon, card facts, or substituted subject', () => {
  const model = buildModel({ investigationContext: ic })
  assert.equal(model.available, false); assert.equal(model.indicator.exists, false)
  assert.equal(model.subjectId, ic.canonical_subject_id); assert.deepEqual(model.modules, [])
  assert.ok(model.families.every(item => item.eligible && !item.available))
  const mismatch = buildModel({ ...base, investigationContext: { ...ic, canonical_subject_id: 'other' } })
  assert.equal(mismatch.reason, 'subject_mismatch'); assert.deepEqual(mismatch.modules, [])
})

test('row evidence preserves sourced ancestry, precise time text, absence and immutability', () => {
  const original = JSON.stringify(base)
  const model = buildModel(base), evidence = model.modules.find(item => item.id === 'evidence')
  assert.equal(model.title, selected.label); assert.equal(model.indicator.exists, true)
  assert.deepEqual(evidence.references, row.evidence_refs)
  assert.deepEqual(evidence.provenance.source_ancestry, ['source-parent'])
  assert.equal(evidence.fields.find(item => item.label === 'Revision recorded').value, row.revision_known_at_utc)
  assert.equal(evidence.fields.find(item => item.label === 'Uncertainty').value, 'Not recorded')
  assert.equal(model.modules.some(item => item.family === 'people'), false)
  assert.equal(JSON.stringify(base), original)
  assert.equal(Object.isFrozen(row), false); assert.equal(Object.isFrozen(model.modules[0].references[0]), true)
  assert.throws(() => { model.modules[0].references[0].evidence_role = 'changed' }, TypeError)
})

test('spatial validity does not claim event occurrence; only supplied admitted occurredAt is labeled event time', () => {
  const projectionEvent = buildModel(base).modules.find(module => module.id === 'event')
  assert.deepEqual(projectionEvent.fields.map(item => item.label), ['Recorded subject', 'Spatial record valid from', 'Spatial record valid to'])
  assert.doesNotMatch(JSON.stringify(projectionEvent.fields), /event range|Event time|occurred|happened/i)
  const model = buildModel({ ...base, admittedContext: { events: [intake({ description: 'Supplied description', occurredAt: '2024-04-08T17:30:00Z' })] } })
  const sourcedEvent = model.modules.find(module => module.family === 'events' && module.id !== 'event')
  assert.equal(sourcedEvent.fields.find(item => item.label === 'Event time').value, '2024-04-08T17:30:00Z')
})

test('evidence preserves the existing separate G2 dimensions and textual confidence without scoring', () => {
  const evidence = buildModel({ ...base, visibleRow: { ...row, confidence: 'recorded confidence text', confidence_status: 'supported_by_existing_model', relationship_qualifier: 'documented_test_relationship', uncertainty_class: 'recorded uncertainty' } }).modules.find(module => module.id === 'evidence')
  const values = new Map(evidence.fields.map(item => [item.label, item.value]))
  assert.equal(values.get('Source reliability'), 'Not present on spatial_projection_v1')
  assert.equal(values.get('Evidence strength'), 'Not present as a strength field; see evidence_refs')
  assert.equal(values.get('Authentication'), 'Not present on spatial_projection_v1')
  assert.equal(values.get('Relationship type'), 'documented_test_relationship')
  assert.equal(values.get('Review status'), 'operative')
  assert.equal(values.get('Remaining uncertainty'), 'recorded uncertainty')
  assert.equal(values.get('Confidence (view text; not a composite score)'), 'recorded confidence text')
  assert.equal(values.get('Confidence status (recorded)'), 'supported_by_existing_model')
  const absent = buildModel(base).modules.find(module => module.id === 'evidence')
  assert.equal(absent.fields.find(item => item.label === 'Confidence (view text; not a composite score)').value, 'Not recorded')
  assert.equal(absent.fields.find(item => item.label === 'Confidence status (recorded)').value, 'Not recorded')
})

test('global layers alter eligibility without deleting explanation or canonical identity', () => {
  const on = buildModel(base), off = buildModel({ ...base, layerVisibility: { ...layers, events: false } })
  assert.equal(off.indicator.exists, true); assert.equal(off.indicator.eligible, false)
  assert.deepEqual(off.modules, on.modules); assert.equal(off.key, on.key)
  assert.equal(normalizeWorldViewContextLayers({ events: 'true', people: true }).events, false)
})

test('each admitted family uses only supplied sourced fields and records temporal geography limits', () => {
  const admittedContext = Object.fromEntries(Object.entries(familyFields).map(([key, fields]) => [key, [intake(fields, key === 'weather' ? { temporalMode: 'current' } : {})]]))
  const before = JSON.stringify(admittedContext), model = buildModel({ ...base, admittedContext })
  for (const key of Object.keys(familyFields)) {
    const module = model.modules.find(item => item.family === key && item.id !== 'event')
    assert.ok(module, key); assert.equal(module.classification, 'context')
    assert.ok(module.fields.some(item => item.label === 'Geography' && item.value === 'Test city'))
    assert.ok(module.fields.some(item => /Reference|reference date/.test(item.label) && item.value === '2024-04-08'))
    assert.deepEqual(module.references[0], admittedContext[key][0].source)
  }
  assert.equal(JSON.stringify(admittedContext), before)
})

test('missing admission, source, time, geography, relevance, role or relationship prevents invented modules', () => {
  for (const change of [{ admitted: false }, { source: {} }, { referenceTime: '2024-02-30' }, { geography: {} }, { classification: 'inferred' }, { subjectId: 'other' }]) {
    const model = buildModel({ ...base, admittedContext: { people: [intake(familyFields.people, change)] } })
    assert.equal(model.modules.some(item => item.family === 'people'), false)
  }
  for (const [family, fields] of Object.entries({ people: { name: 'No role' }, markets: { ticker: 'TEST', company: 'No relevance' }, relationships: { from: 'A', to: 'B' }, infrastructure: { name: 'Near a point' } })) {
    assert.equal(buildModel({ ...base, admittedContext: { [family]: [intake(fields)] } }).modules.some(item => item.family === family), false)
  }
})

test('CURRENT and EVENT-TIME weather never borrow each other or invent unavailable values', () => {
  const current = intake(familyFields.weather, { temporalMode: 'current', referenceTime: '2026-10-01T12:00:00Z' })
  const historical = intake(familyFields.weather, { temporalMode: 'event-time', referenceTime: ic.as_of_time })
  const model = buildModel({ ...base, admittedContext: { weather: [current, historical] } })
  assert.deepEqual(model.modules.filter(item => item.family === 'weather').map(item => item.fields[0].value), ['CURRENT weather context', 'EVENT-TIME weather'])
  for (const referenceTime of ['2026-10-01T12:00:00Z', '2024-04-08T19:00:00Z', '2024-04-08']) {
    assert.equal(buildModel({ ...base, admittedContext: { weather: [{ ...historical, referenceTime }] } }).modules.some(item => item.family === 'weather'), false)
  }
  const unavailable = buildModel({ ...base, weather: { status: 'unavailable', reason: 'adapter_not_implemented', copy: 'Weather not sourced', fields: { temperature: 'stale invented value' } } })
  assert.doesNotMatch(JSON.stringify(unavailable), /stale invented value/)
  assert.equal(unavailable.modules.find(item => item.family === 'weather').status, 'unavailable')
})

test('legacy successful weather requires explicitly supplied geography, subject admission and classification', () => {
  const legacy = weatherFromArchivePayload({ hourly: { time: ['2024-04-08T18:00:00'], temperature_2m: [14] }, hourly_units: { temperature_2m: '°C' } }, Date.parse(ic.as_of_time))
  assert.equal(legacy.status, 'ok')
  assert.equal(buildModel({ ...base, weather: legacy }).modules.some(module => module.family === 'weather'), false,
    'the actual legacy result has no source geography or subject admission; no geographic correspondence is inferred')
  const enriched = { ...legacy, admitted: true, subjectId: ic.canonical_subject_id, classification: 'context', geography: { label: 'Explicitly supplied observation area', precision: 'recorded grid resolution' } }
  const model = buildModel({ ...base, weather: enriched })
  const module = model.modules.find(item => item.family === 'weather')
  assert.ok(module)
  const values = new Map(module.fields.map(item => [item.label, item.value]))
  assert.equal(values.get('Temporal meaning'), 'EVENT-TIME weather')
  assert.equal(values.get('Temperature'), '14 °C')
  assert.equal(values.get('Observation type'), 'reanalysis')
  assert.equal(values.get('Resolution'), 'hourly')
  assert.equal(values.get('Source'), legacy.provenance.provider)
  assert.equal(values.get('Reference time'), legacy.provenance.timestamp)
  assert.equal(values.get('Geography'), enriched.geography.label)
  assert.deepEqual(module.provenance, legacy.provenance)
  assert.deepEqual(module.references[0], { label: legacy.provenance.provider })
  for (const changes of [{ admitted: false }, { subjectId: 'other' }, { classification: undefined }, { geography: undefined }, { provenance: { ...legacy.provenance, timestamp: row.valid_to_utc } }]) {
    assert.equal(buildModel({ ...base, weather: { ...enriched, ...changes } }).modules.some(item => item.family === 'weather'), false)
  }
  assert.equal(Object.isFrozen(enriched), false)
})

test('withheld private person, stale time, invalid time and date-only scopes retain canonical identity', () => {
  const privateModel = buildModel({ ...base, visibleRow: { ...row, object_type: 'private_person', precision_class: 'facility' } })
  assert.equal(privateModel.indicator.exists, false); assert.deepEqual(privateModel.modules, [])
  for (const time of [row.valid_to_utc, '2024-04-09', '2024-04-08T18:00:00', '2024-02-30']) {
    const model = buildModel({ ...base, investigationContext: { ...ic, as_of_time: time } })
    assert.equal(model.available, false, time); assert.equal(model.subjectId, ic.canonical_subject_id)
  }
  assert.equal(buildModel({ ...base, investigationContext: { ...ic, as_of_time: '2024-04-08' } }).available, true)
  const unplottable = buildModel({ ...base, visibleRow: { ...row, display_geometry: null } })
  assert.equal(unplottable.available, true); assert.equal(unplottable.indicator.exists, false)
  assert.ok(unplottable.modules.some(item => item.id === 'evidence'))
})

test('identity key resets on subject, version, hash, time or range but ignores view and layers', () => {
  const key = worldViewSpatialContextKey(base)
  for (const changes of [{ canonical_subject_id: 'other' }, { as_of_time: '2024-04-08T19:00:00Z' }, { selected_time_range: { from: '2024-04-08', to: null } }]) {
    assert.notEqual(worldViewSpatialContextKey({ ...base, investigationContext: { ...ic, ...changes } }), key)
  }
  for (const changes of [{ revision_id: 'v2' }, { subject_snapshot_hash: 'new' }, { place_snapshot_hash: 'new' }]) assert.notEqual(worldViewSpatialContextKey({ ...base, visibleRow: { ...row, ...changes } }), key)
  assert.equal(worldViewSpatialContextKey({ ...base, investigationContext: { ...ic, active_view: 'graph' } }), key)
})

test('camera anchor positions clamp to container and suppress invisible or invalid positions', () => {
  for (const anchor of [{ x: 1, y: 1, visible: true }, { x: 799, y: 599, visible: true }]) {
    const result = position(anchor, { width: 800, height: 600 })
    assert.ok(result.x >= 12 && result.y >= 12)
    assert.ok(result.x + result.width <= 788 && result.y + result.maxHeight <= 588)
    assert.equal(result.leader.x1, anchor.x); assert.equal(result.leader.y1, anchor.y)
  }
  for (const anchor of [{ x: 1, y: 1, visible: false }, { x: NaN, y: 1, visible: true }, { x: 801, y: 1, visible: true }]) assert.equal(position(anchor, { width: 800, height: 600 }), null)
})

await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
const output = new URL('./.compiled/worldViewSpatialContextCard.mjs', import.meta.url)
await build({ entryPoints: [fileURLToPath(new URL('../src/components/WorldViewSpatialContextCard.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { default: Card, WorldViewContextLayerControls: Controls } = await import(output.href)
const props = { model: buildModel(base), anchor: { x: 100, y: 100, visible: true }, viewport: { width: 800, height: 600 } }
const button = (renderer, label) => renderer.root.findAllByType('button').find(item => item.props['aria-label'] === label || item.children.some(child => typeof child === 'string' && child.includes(label)))
const moduleButton = (renderer, id) => renderer.root.findByProps({ 'data-context-module': id }).findByType('button')

test('desktop module state survives layer changes and resets permanently on canonical subject/version/time changes', () => {
  let renderer
  act(() => { renderer = TestRenderer.create(React.createElement(Card, props)) })
  try {
    act(() => moduleButton(renderer, 'evidence').props.onClick())
    assert.equal(moduleButton(renderer, 'evidence').props['aria-expanded'], true)
    act(() => renderer.update(React.createElement(Card, { ...props, model: buildModel({ ...base, layerVisibility: { ...layers, events: false } }) })))
    assert.equal(moduleButton(renderer, 'evidence').props['aria-expanded'], true)
    assert.equal(renderer.root.findAllByProps({ 'data-context-module': 'event' }).length, 0)
    act(() => renderer.update(React.createElement(Card, props)))
    assert.equal(moduleButton(renderer, 'event').props['aria-expanded'], true)
    act(() => renderer.update(React.createElement(Card, { ...props, model: buildModel({ ...base, visibleRow: { ...row, revision_id: 'v2' } }) })))
    assert.equal(moduleButton(renderer, 'evidence').props['aria-expanded'], false)
    act(() => renderer.update(React.createElement(Card, props)))
    assert.equal(moduleButton(renderer, 'evidence').props['aria-expanded'], false)
  } finally { act(() => renderer.unmount()) }
})

test('mobile compact preview expands sheet, Escape collapses then closes, invisible anchor offers explicit inspector', () => {
  let renderer, closes = 0, inspected = null
  const mobile = { ...props, compact: true, onClose: () => { closes++ }, onInspect: model => { inspected = model.subjectId } }
  act(() => { renderer = TestRenderer.create(React.createElement(Card, mobile)) })
  try {
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Selected context details' }).props.hidden, true)
    act(() => button(renderer, 'Explore context').props.onClick())
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Selected context details' }).props.hidden, false)
    const escape = () => renderer.root.findByProps({ className: 'wv-spatial-context' }).props.onKeyDown({ key: 'Escape', stopPropagation() {} })
    act(escape); assert.equal(closes, 0)
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Selected context details' }).props.hidden, true)
    act(escape); assert.equal(closes, 1)
    act(() => renderer.update(React.createElement(Card, { ...mobile, anchor: { ...props.anchor, visible: false } })))
    assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Selected spatial context' }).length, 0)
    act(() => button(renderer, 'Inspect selected context').props.onClick())
    assert.equal(inspected, ic.canonical_subject_id)
  } finally { act(() => renderer.unmount()) }
})

test('global layer checkboxes change only copied layer visibility', () => {
  let renderer, changed
  act(() => { renderer = TestRenderer.create(React.createElement(Controls, { value: layers, onChange: value => { changed = value } })) })
  try {
    assert.equal(renderer.root.findAllByType('input').length, 8)
    act(() => renderer.root.findAllByType('input')[0].props.onChange({ target: { checked: false } }))
    assert.equal(changed.events, false); assert.equal(layers.events, true); assert.equal(changed.people, true)
  } finally { act(() => renderer.unmount()) }
})
