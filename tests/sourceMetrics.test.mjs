import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceMetrics, enrichOutletsWithMetrics, sortOutletsBySourceMetric } from '../src/lib/sourceMetrics.js'

test('source metrics keep volume and first-to-report separate and leave independent corroboration unavailable', () => {
  const rows = [
    { id: 'a1', outlet: 'Alpha', published_at: '2026-08-19T10:00:00Z' },
    { id: 'a2', outlet: 'Bravo', published_at: '2026-08-19T11:00:00Z' },
    { id: 'a3', outlet: 'Alpha', published_at: '2026-08-19T12:00:00Z' },
    { id: 'a4', outlet: 'Charlie', published_at: '2026-08-19T10:30:00Z' },
  ]
  const events = new Map([
    ['a1', { eventId: 'e1' }],
    ['a2', { eventId: 'e1' }],
    ['a3', { eventId: 'e2' }],
    ['a4', { eventId: 'e2' }],
  ])
  const metrics = buildSourceMetrics(rows, events)

  assert.deepEqual(metrics.get('Alpha'), {
    volume: 2,
    firstToReportCount: 1,
    corroborationCount: null,
  })
  assert.deepEqual(metrics.get('Bravo'), {
    volume: 1,
    firstToReportCount: 0,
    corroborationCount: null,
  })
  assert.deepEqual(metrics.get('Charlie'), {
    volume: 1,
    firstToReportCount: 1,
    corroborationCount: null,
  })
})

test('tied earliest timestamps are not misrepresented as first-to-report', () => {
  const rows = [
    { id: 'a1', outlet: 'Alpha', published_at: '2026-08-19T10:00:00Z' },
    { id: 'a2', outlet: 'Bravo', published_at: '2026-08-19T10:00:00Z' },
  ]
  const metrics = buildSourceMetrics(rows, new Map([['a1', { eventId: 'e1' }], ['a2', { eventId: 'e1' }]]))
  assert.equal(metrics.get('Alpha').firstToReportCount, 0)
  assert.equal(metrics.get('Bravo').firstToReportCount, 0)
})

test('source order selects one literal field at a time and does not blend metrics', () => {
  const rows = enrichOutletsWithMetrics(
    [{ name: 'Alpha' }, { name: 'Bravo' }, { name: 'Charlie' }],
    new Map([
      ['Alpha', { volume: 3, firstToReportCount: 0, corroborationCount: null }],
      ['Bravo', { volume: 1, firstToReportCount: 2, corroborationCount: null }],
      ['Charlie', { volume: 2, firstToReportCount: 2, corroborationCount: null }],
    ]),
  )
  assert.deepEqual(sortOutletsBySourceMetric(rows, 'corpus').map((row) => row.name), ['Alpha', 'Charlie', 'Bravo'])
  assert.deepEqual(sortOutletsBySourceMetric(rows, 'first').map((row) => row.name), ['Bravo', 'Charlie', 'Alpha'])
  // Bravo and Charlie tie on first-to-report. Alphabetical tie-breaking proves
  // volume is not blended into the ordering.
  assert.deepEqual(sortOutletsBySourceMetric(rows, 'name').map((row) => row.name), ['Alpha', 'Bravo', 'Charlie'])
})

test('first-to-report follows qualified corpus chronology and never drops unknown clocks', () => {
  const counts = stamps => {
    const rows = stamps.map(([outlet, published_at], index) => ({ id: String(index), outlet, published_at }))
    return [...buildSourceMetrics(rows, new Map(rows.map(row => [row.id, { eventId: 'event' }]))).values()]
      .map(metric => metric.firstToReportCount)
  }
  for (const unknown of ['2024-04-08', '2024-04-08T09:00:00', '2024-02-30T09:00:00Z', null, 'invalid']) {
    assert.deepEqual(counts([['Alpha', unknown], ['Beta', '2024-04-08T12:00:00Z']]), [0, 0], String(unknown))
    assert.deepEqual(counts([['Alpha', '2024-04-08T10:00:00Z'], ['Beta', '2024-04-08T12:00:00Z'], ['Beta', unknown]]), [0, 0])
  }
  assert.deepEqual(counts([['Alpha', '2024-04-08T10:00Z'], ['Beta', '2024-04-08T10:00:30Z']]), [0, 0], 'overlapping precision')
  assert.deepEqual(counts([['Alpha', '2024-04-08T09:00:00-04:00'], ['Beta', '2024-04-08T12:00:00Z']]), [0, 1])
  assert.deepEqual(counts([['Alpha', '2024-04-08T10:00:00.000001Z'], ['Beta', '2024-04-08T10:00:00.000002Z']]), [1, 0], 'retained microseconds')
})
