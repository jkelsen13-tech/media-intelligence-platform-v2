import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDisplayGeometry, collectPositions, plotDecision, displayCoordinateText, mapRowsForSelection } from '../src/lib/spatialProjection.js'
import { projectionMarkerRecords } from '../src/lib/worldViewRendererAdapter.js'

const point = {type:'Point',coordinates:[-81.7,41.4]}
const row = geometry => ({mip_object_id:'spatial-1',subject_graph_node_id:'event-1',
  object_type:'event',precision_class:'city',geometry_status:'coarsened_to_precision_class',display_geometry:geometry})

test('malformed display geometry cannot crash or reach map markers', () => {
  const invalid = [null, 'null', '{', [], {type:'Point',coordinates:['-81.7',41.4]},
    {type:'Point',coordinates:[null,41.4]}, {type:'Point',coordinates:[NaN,41.4]},
    {type:'Point',coordinates:[0,Infinity]}, {type:'Point',coordinates:[181,0]},
    {type:'Point',coordinates:[0,-91]}, {type:'Point',coordinates:[0,0,'height']},
    {type:'Polygon',coordinates:{}}, {type:'LineString',coordinates:[{}]},
    {type:'MultiLineString',coordinates:[null]}, {type:'MultiPolygon',coordinates:[42]},
    {type:'FeatureCollection',features:{}}, {type:'Feature',geometry:null},
    {type:'FeatureCollection',features:[{type:'Feature',geometry:point},{type:'Feature',geometry:null}]},
    {type:'GeometryCollection',geometries:[point,null]}, {type:'Mystery',coordinates:[0,0]},
    {type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]},
    {type:'LineString',coordinates:[[0,0]]}, {type:'MultiPoint',coordinates:[]}]
  for (const geometry of invalid) {
    assert.equal(parseDisplayGeometry(geometry),null)
    assert.deepEqual(collectPositions(geometry),[])
    assert.equal(plotDecision(row(geometry)).plot,false)
    assert.equal(displayCoordinateText(geometry),null)
    assert.deepEqual(projectionMarkerRecords([row(geometry)],new Set()),[])
  }
})

test('valid geometry preserves coordinates and shape across both display adapters', () => {
  const ring = [[0,0,7],[1,0,7],[1,1,7],[0,0,7]]
  const shapes = [point,{type:'Point',coordinates:[180,-90,123]},
    {type:'MultiPoint',coordinates:[[0,0],[1,1]]},
    {type:'LineString',coordinates:[[0,0],[1,1]]},
    {type:'MultiLineString',coordinates:[[[0,0],[1,1]]]},
    {type:'Polygon',coordinates:[ring]}, {type:'MultiPolygon',coordinates:[[ring]]},
    {type:'GeometryCollection',geometries:[point,{type:'Polygon',coordinates:[ring]}]}]
  for (const shape of shapes) {
    const before=JSON.stringify(shape)
    assert.equal(parseDisplayGeometry(shape),shape)
    assert.deepEqual(parseDisplayGeometry(before),shape)
    assert.ok(collectPositions(shape).length>0)
    const markers=projectionMarkerRecords([row(shape)],new Set(['event-1']))
    assert.equal(markers.length,1); assert.equal(markers[0].geometry,shape)
    assert.equal(markers[0].selected,true)
    assert.equal(JSON.stringify(shape),before)
  }
  assert.equal(parseDisplayGeometry({type:'Feature',geometry:point}),point)
  assert.deepEqual(parseDisplayGeometry({type:'FeatureCollection',features:[{type:'Feature',geometry:point}]}),
    {type:'GeometryCollection',geometries:[point]})
})

test('invalid collections fail as a whole and never borrow another subjects geometry', () => {
  const bad=row({type:'GeometryCollection',geometries:[point,{type:'Point',coordinates:[0,95]}]})
  const other={...row(point),mip_object_id:'spatial-2',subject_graph_node_id:'event-2'}
  assert.deepEqual(mapRowsForSelection({status:'ok',rows:[bad,other]},{id:'event-1'},bad),[])
  const cyclic={type:'GeometryCollection',geometries:[]}; cyclic.geometries.push(cyclic)
  assert.equal(parseDisplayGeometry(cyclic),null)
  assert.deepEqual(collectPositions(cyclic),[])
  let nested=point
  for(let i=0;i<34;i++) nested={type:'GeometryCollection',geometries:[nested]}
  assert.equal(parseDisplayGeometry(nested),null)
})
