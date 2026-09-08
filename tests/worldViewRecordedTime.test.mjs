import test from 'node:test'
import assert from 'node:assert/strict'
import { recordedTimestampsForRows, worldViewRecordedTime, revisionAtTime } from '../src/lib/spatialProjection.js'

const row = { revision_ordinal:1, valid_from_utc:'2024-04-08T17:59:00Z', valid_to_utc:'2024-04-08T20:29:00Z' }
const stamps = recordedTimestampsForRows([row])

test('explicit recorded time survives fresh arrays, reordering, and delayed projection loading',()=>{
  const requested='2024-04-08T16:29:00-04:00'
  for (const markers of [stamps, [...stamps], [...stamps].reverse()]) {
    const time=worldViewRecordedTime(markers,[{...row}],requested)
    assert.equal(time.atIso,requested)
    assert.equal(time.atMs,Date.parse(row.valid_to_utc))
    assert.equal(markers[time.index].ms,time.atMs)
    assert.equal(revisionAtTime([row],time.atMs),null,'exclusive upper bound must not snap back to covered history')
  }
  const pending=worldViewRecordedTime([],[],requested)
  assert.equal(pending.index,null)
  assert.equal(pending.atIso,requested)
  assert.equal(pending.atMs,Date.parse(row.valid_to_utc))
})

test('between-marker and outside times never borrow a nearest marker or historical state',()=>{
  for (const [requested,covered] of [['2024-04-08T19:00:00Z',true],['2030-01-01T00:00:00Z',false]]) {
    const time=worldViewRecordedTime(stamps,[row],requested)
    assert.equal(time.index,null)
    assert.equal(time.atIso,requested)
    assert.equal(!!revisionAtTime([row],time.atMs),covered)
  }
  for (const requested of ['not-time','2024-04-08T19:00:00']) {
    const time=worldViewRecordedTime(stamps,[row],requested)
    assert.equal(time.kind,'unavailable'); assert.equal(time.atMs,null); assert.equal(time.hasRequest,true)
  }
})

test('absent time uses a covering marker; date-only scopes retain precision and cannot borrow another day',()=>{
  const defaultTime=worldViewRecordedTime(stamps,[row],null)
  assert.equal(defaultTime.atMs,Date.parse(row.valid_from_utc))
  assert.equal(defaultTime.hasRequest,false)
  const day=worldViewRecordedTime(stamps,[row],'2024-04-08')
  assert.equal(day.kind,'date_scope'); assert.equal(day.atMs,Date.parse(row.valid_from_utc))
  const otherDay=worldViewRecordedTime(stamps,[row],'2024-04-09')
  assert.equal(otherDay.kind,'unavailable'); assert.equal(otherDay.index,null)
  assert.equal(otherDay.atIso,'2024-04-09')
})
