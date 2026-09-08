import test from 'node:test'
import assert from 'node:assert/strict'
import { comparisonPublicationTiming, latestComparableReview } from '../src/lib/comparisonPublicationTiming.js'
const article = (outlet, published_at) => ({ outlet, published_at })

test('comparison clocks order UTC offsets instead of source text and preserve bounded gaps', () => {
  const view = comparisonPublicationTiming([article('A', '2026-08-05T09:00:00-04:00'), article('B', '2026-08-05T12:00:00Z')])
  assert.equal(view.firstOutlet, 'B')
  assert.deepEqual(view.timing.map(row => row.outlet), ['B', 'A'])
  assert.equal(view.timing[1].lagHours, 1)
  assert.equal(view.timing[1].firstPublishedAt, '2026-08-05T09:00:00-04:00')
})

test('missing, invalid, date-only and zone-free clocks cannot establish an outlet order or gap', () => {
  for (const value of [null, '', '2026-08-05', '2026-08-05T09:00:00', '2026-02-30T09:00:00Z']) {
    const view = comparisonPublicationTiming([article('A', value), article('B', '2026-08-05T12:00:00Z')])
    assert.equal(view.firstOutlet, null, String(value))
    assert.ok(view.timing.every(row => row.lagHours === null))
    assert.equal(view.timing.find(row => row.outlet === 'A').firstPublishedAt, null)
  }
  const sameOutlet = comparisonPublicationTiming([article('A', null), article('A', '2026-08-05T09:00:00Z'), article('B', '2026-08-05T12:00:00Z')])
  assert.equal(sameOutlet.firstOutlet, null, 'a known clock cannot hide an unqualified record in its outlet')
})

test('overlapping precision and identical clocks do not choose an arbitrary first outlet', () => {
  for (const [a, b] of [['2026-08-05T09:00Z', '2026-08-05T09:00:30Z'], ['2026-08-05T09:00:00Z', '2026-08-05T05:00:00-04:00']]) {
    const view = comparisonPublicationTiming([article('A', a), article('B', b)])
    assert.equal(view.firstOutlet, null)
    assert.ok(view.timing.every(row => row.lagHours === null))
  }
})

test('microseconds remain ordered beyond safe integer microsecond epochs; uncertain rounding withholds a gap', () => {
  const view = comparisonPublicationTiming([article('B', '2500-01-01T00:00:00.000002Z'), article('A', '2500-01-01T00:00:00.000001Z')])
  assert.equal(view.firstOutlet, 'A')
  assert.equal(view.timing[1].lagHours, 0, 'a rounded small gap is not a same-hour claim')
  const uncertain = comparisonPublicationTiming([article('A', '2026-08-05T09:00Z'), article('B', '2026-08-05T09:03Z')])
  assert.equal(uncertain.firstOutlet, 'A')
  assert.equal(uncertain.timing[1].lagHours, null, 'the possible gap spans two rounding buckets')
})

test('latest review uses qualified time and refuses mixed or overlapping precision', () => {
  assert.equal(latestComparableReview(['2026-08-05T09:00:00-04:00', '2026-08-05T12:00:00Z']), '2026-08-05T09:00:00-04:00')
  assert.equal(latestComparableReview(['2026-08-04', '2026-08-05']), '2026-08-05')
  assert.equal(latestComparableReview(['2026-08-05', '2026-08-05T12:00:00Z']), null)
  assert.equal(latestComparableReview(['2026-08-05T12:00Z', '2026-08-05T12:00:30Z']), null)
  assert.equal(latestComparableReview(['2026-02-30']), null)
  assert.equal(latestComparableReview([null, '2026-08-05T12:00:00.123456+05:30']), '2026-08-05T12:00:00.123456+05:30')
})
