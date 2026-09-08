import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInspectionInstant, inspectionInstantMilliseconds } from '../src/lib/inspectionTime.js'
import { worldViewRecordedTime, recordedTimestampsForRows, revisionAtTime } from '../src/lib/spatialProjection.js'
import { hydrateDeepLink, serializeDeepLink } from '../src/lib/deepLinks.js'

const row={valid_from_utc:'2024-04-08T17:59:00Z',valid_to_utc:'2024-04-08T20:29:00Z',revision_ordinal:1}
const stamps=recordedTimestampsForRows([row])
test('recorded SQL and ISO offsets resolve to the same instant without changing source text',()=>{
  const expected=Date.parse('2024-04-08T17:59:00.123Z')
  for(const value of ['2024-04-08 17:59:00.123456+00','2024-04-08T17:59:00.123456Z',
    '2024-04-08 13:59:00.123456-04','2024-04-08 23:29:00.123456+0530',
    '2024-04-08T23:29:00.123456+05:30']) {
    assert.equal(parseInspectionInstant(value),value)
    assert.equal(inspectionInstantMilliseconds(value),expected)
    const selected=worldViewRecordedTime(stamps,[row],value)
    assert.equal(selected.atIso,value)
    assert.equal(selected.atMs,expected)
    assert.equal(revisionAtTime([row],selected.atMs),row)
  }
  assert.equal(inspectionInstantMilliseconds('1970-01-01 00:00:00+00'),0)
  assert.equal(parseInspectionInstant('1970-01-01 00:00:00+00'),'1970-01-01 00:00:00+00')
})

test('legacy timestamp link restores its recorded marker and exact range through view and reload',()=>{
  const from='2024-04-08 17:59:00+00', to='2024-04-08 20:29:00+00'
  const result=hydrateDeepLink('#/event/event-1/world?time='+encodeURIComponent(from+'..'+to))
  const selected=worldViewRecordedTime(stamps,[row],result.investigationContext.as_of_time)
  assert.equal(selected.index,0); assert.equal(selected.kind,'selected')
  assert.equal(revisionAtTime([row],selected.atMs),row)
  const context={...result.investigationContext,as_of_time:'2024-04-08 18:00:00.123456+00'}
  const restored=hydrateDeepLink(serializeDeepLink(context)).investigationContext
  assert.equal(restored.as_of_time,context.as_of_time)
  assert.deepEqual(restored.selected_time_range,{from,to})
  assert.equal(restored.canonical_subject_id,'event-1')
  assert.equal(revisionAtTime([row],inspectionInstantMilliseconds(to)),null,'exclusive upper bound remains exclusive')
})

test('SQL compatibility never admits rollover dates, local times or malformed offsets',()=>{
  for(const value of ['2023-02-29 12:00:00+00','2024-02-30 12:00:00+00','2024-04-31 12:00:00+00',
    '2024-04-08 24:00:00+00','2024-04-08 12:60:00+00','2024-04-08 12:00:60+00',
    '2024-04-08 12:00:00','2024-04-08T12:00:00','2024-04-08','2024-04-08 12:00:00+24',
    '2024-04-08 12:00:00+05:60','2024-04-08 12:00:00+0','2024-04-08 12:00:00+005',
    '2024-04-08 12:00:00 UTC',' 2024-04-08 12:00:00+00',null,0]) {
    assert.equal(parseInspectionInstant(value),null,String(value))
    assert.equal(inspectionInstantMilliseconds(value),null,String(value))
  }
  assert.equal(parseInspectionInstant('2024-02-29 12:00:00+00'),'2024-02-29 12:00:00+00')
})
