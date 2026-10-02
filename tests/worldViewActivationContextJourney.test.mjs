import test from 'node:test'
import assert from 'node:assert/strict'
import { activateAtlasMarker } from '../src/lib/worldViewAtlasLabelLayout.js'
import { isCurrentSingletonRow, projectionRowDisplayKey, resolveCurrentClusterMember } from '../src/lib/worldViewDisplayClusters.js'
import { applySubject, emptyInvestigationContext, subjectFromGraphInspection, subjectFromWorldViewSelection, setInvestigationAsOfTime } from '../src/lib/investigationContext.js'

const row = Object.freeze({ mip_object_id: 'place-a', revision_id: 'r-a', spatial_role: 'event', subject_graph_node_id: 'event-a', valid_from_utc: '2026-01-01T00:00:00Z', valid_to_utc: '2026-01-02T00:00:00Z', display_geometry: Object.freeze({type:'Point',coordinates:Object.freeze([-81.7,41.4])}) })
const other = Object.freeze({...row,mip_object_id:'place-b',revision_id:'r-b',subject_graph_node_id:'event-b'})

test('stale original Atlas click/Enter/Space callbacks cannot select a now-grouped or removed row; explicit current member choice binds original coordinates and time', () => {
  let layout = { singles: [{row}], clusters: [] }, rows = [row,other], selected = []
  const dispatch = value => { if (isCurrentSingletonRow(layout,value,rows)) selected.push(value) }
  assert.equal(activateAtlasMarker({type:'click'},row,dispatch),true)
  assert.deepEqual(selected,[row])
  layout = { singles: [], clusters: [{id:'group',rowMembers:[row,other]}] }
  for (const event of [{type:'click'},{type:'keydown',key:'Enter'},{type:'keydown',key:' '}]) activateAtlasMarker(event,row,dispatch)
  assert.deepEqual(selected,[row],'stale handlers are rejected at dispatch using latest layout')
  const member = resolveCurrentClusterMember(layout,'group',projectionRowDisplayKey(row))
  assert.equal(member,row)
  const ic = applySubject(emptyInvestigationContext('world'),subjectFromWorldViewSelection({row:member}))
  assert.equal(ic.as_of_time,row.valid_from_utc)
  assert.deepEqual(ic.selected_time_range,{from:row.valid_from_utc,to:row.valid_to_utc})
  assert.deepEqual(member.display_geometry.coordinates,[-81.7,41.4])
  rows = [other];layout = {singles:[{row}],clusters:[]}
  activateAtlasMarker({type:'click'},row,dispatch)
  assert.deepEqual(selected,[row],'removed dataset reference stays inadmissible')
})

test('member pick then bound-time scrub then same-endpoint inspection retains recorded time/range without inventing graph time', () => {
  let ic = applySubject(emptyInvestigationContext('world'),subjectFromWorldViewSelection({row}))
  ic = setInvestigationAsOfTime(ic,'2026-01-01T12:00:00Z')
  const node = Object.freeze({id:'event-a',type:'event',occurred_at:null})
  const inspected = applySubject(ic,subjectFromGraphInspection(node,ic))
  assert.equal(inspected.as_of_time,ic.as_of_time)
  assert.equal(inspected.selected_time_range,ic.selected_time_range)
  assert.equal(node.occurred_at,null)
  const newSubject = applySubject(ic,subjectFromGraphInspection({...node,id:'event-b'},ic))
  assert.equal(newSubject.as_of_time,null)
  assert.equal(newSubject.selected_time_range,null)
  const dated = applySubject(ic,subjectFromGraphInspection({...node,occurred_at:'2025-12-01T00:00:00Z'},ic))
  assert.equal(dated.as_of_time,'2025-12-01T00:00:00Z')
  assert.deepEqual(dated.selected_time_range,{from:'2025-12-01T00:00:00Z',to:null})
  const missing = subjectFromGraphInspection({id:'event-a',type:'event'},emptyInvestigationContext())
  assert.equal(missing.as_of_time,null)
  assert.equal(missing.selected_time_range,null)
})
