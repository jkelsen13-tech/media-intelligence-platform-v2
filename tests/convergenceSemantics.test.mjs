import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyInvestigationContext, applySubject, subjectFromGraphInspection } from '../src/lib/investigationContext.js'
import { hydrateDeepLink, applySelectionAgainstCatalog } from '../src/lib/deepLinks.js'

const instant = '2026-09-03 01:51:20.123456+00'
const range = { from: '2024-04-08', to: '2024-04-09' }
const context = applySubject(emptyInvestigationContext('world'), {
  canonical_subject_type: 'event', canonical_subject_id: 'event-a', as_of_time: instant, selected_time_range: range,
})

test('a URL with absent time reconstructs the same empty time state in a fresh session and current same-subject session', () => {
  const route = '#/event/event-a/graph'
  const fresh = hydrateDeepLink(route).investigationContext
  const current = hydrateDeepLink(route, { currentIc: context }).investigationContext
  assert.deepEqual(current, fresh)
  assert.equal(current.as_of_time, null)
  assert.equal(current.selected_time_range, null)
})

test('inspecting the same live event preserves a scrubbed instant and independently selected range', () => {
  const node = { id: 'event-a', type: 'event', occurred_at: '2024-04-08T17:59:00Z' }
  const inspection = subjectFromGraphInspection(node, context)
  assert.equal(inspection.as_of_time, instant)
  assert.deepEqual(inspection.selected_time_range, range)
  const other = subjectFromGraphInspection({ ...node, id: 'event-b' }, context)
  assert.equal(other.as_of_time, node.occurred_at)
  assert.deepEqual(other.selected_time_range, { from: node.occurred_at, to: null })
})

test('malformed time values never become canonical inspection state, even before catalogs load', () => {
  const malformed = ['not-a-time', '2024-02-30', '2024-04-08..2024-04-09..2030-01-01', '2024-04-09..2024-04-08', '2024-04-08T18:00:00'];
  for (const time of malformed) {
    for (const catalog of [null, {}]) {
      const result = hydrateDeepLink('#/event/event-a/world?time=' + encodeURIComponent(time), { catalog })
      assert.equal(result.investigationContext.as_of_time, null, time)
      assert.equal(result.investigationContext.selected_time_range, null, time)
      assert.equal(result.selection.time, null, time)
      assert.equal(result.fallbacks[0]?.kind, 'time', time)
    }
  }
})

test('valid date scopes, open intervals and recorded precise time text retain their exact meaning', () => {
  for (const time of ['2024-02-29', '..2024-04-08', '2024-04-08..', instant, instant + '..2026-09-04 01:51:20.123456+00']) {
    const result = hydrateDeepLink('#/event/event-a/world?time=' + encodeURIComponent(time))
    assert.equal(result.selection.time, time)
    assert.equal(result.fallbacks.length, 0)
  }
  const applied = applySelectionAgainstCatalog({ time: 'bad', entity: 'pending-node' }, null, 'event-a')
  assert.equal(applied.selection.time, null)
  assert.equal(applied.selection.entity, 'pending-node')
  assert.equal(applied.pending, true)
})

test('sub-millisecond reversed time intervals are rejected without truncating valid canonical text', () => {
  const from = '2026-09-03T01:51:20.123456789Z'
  const to = '2026-09-03T01:51:20.123456788Z'
  const invalid = hydrateDeepLink('#/event/event-a/world?time=' + encodeURIComponent(from + '..' + to))
  assert.equal(invalid.investigationContext.selected_time_range, null)
  const valid = hydrateDeepLink('#/event/event-a/world?time=' + encodeURIComponent(to + '..' + from))
  assert.deepEqual(valid.investigationContext.selected_time_range, { from: to, to: from })
})

test('selection catalogs restrict entities, recorded places and Arc scope to retained subject joins', async () => {
  const { graphSelectionCatalog } = await import('../src/lib/deepLinks.js')
  const graph = { nodes: [{ id: 'event-a', arc_id: 'arc-a' }, { id: 'entity-a' }, { id: 'unrelated', arc_id: 'arc-foreign' }],
    edges: [{ source: 'event-a', target: 'entity-a' }] }
  const catalog = graphSelectionCatalog(graph, [{ key: 'entity-a', place: 'Recorded city', longitude: 1.2, latitude: 3.4 },
    { key: 'unrelated', place: 'Foreign city', longitude: 5.6, latitude: 7.8 }], 'event-a')
  const valid = hydrateDeepLink('#/event/event-a/timeline?arc=arc-a&entity=entity-a&place=' + encodeURIComponent('Recorded city:1.2:3.4'), { catalog })
  assert.equal(valid.investigationContext.selected_arc_or_stage_id, 'arc-a')
  assert.equal(valid.selection.entity, 'entity-a')
  const invalid = hydrateDeepLink('#/event/event-a/timeline?arc=arc-foreign&entity=unrelated&place=' + encodeURIComponent('Foreign city:5.6:7.8'), { catalog })
  assert.equal(invalid.investigationContext.canonical_subject_id, 'event-a')
  assert.equal(invalid.investigationContext.selected_arc_or_stage_id, null)
  assert.deepEqual(invalid.fallbacks.map(item => item.kind).sort(), ['arc', 'entity', 'place'])
})

test('Arc scope and independent exact time state survive share and recent restore, with invalid Arc disclosed', async () => {
  const { graphSelectionCatalog, serializeDeepLink } = await import('../src/lib/deepLinks.js')
  const { snapshotRecentInvestigation, restoreRecentInvestigation } = await import('../src/lib/recentInvestigation.js')
  const ic = { ...context, selected_arc_or_stage_id: 'arc-a', active_view: 'timeline' }
  const catalog = graphSelectionCatalog({ nodes: [{ id: 'event-a', arc_id: 'arc-a' }], edges: [] }, [], 'event-a')
  const restored = hydrateDeepLink(serializeDeepLink(ic), { catalog }).investigationContext
  assert.equal(restored.selected_arc_or_stage_id, 'arc-a')
  assert.equal(restored.parent_event_id, null)
  assert.equal(restored.as_of_time, instant)
  assert.deepEqual(restored.selected_time_range, range)
  const recent = snapshotRecentInvestigation(ic)
  assert.deepEqual(restoreRecentInvestigation(recent, { catalog }).investigationContext, restored)
  const stale = restoreRecentInvestigation(recent, { catalog: { ...catalog, arc: [] } })
  assert.equal(stale.investigationContext.selected_arc_or_stage_id, null)
  assert.equal(stale.fallbacks[0]?.kind, 'arc')
})
