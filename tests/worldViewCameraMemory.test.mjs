import test from 'node:test'
import assert from 'node:assert/strict'
import { createCameraMemory, northAmericaCameraState } from '../src/lib/worldViewCameraMemory.js'
import { createCameraFraming } from '../src/lib/worldViewCameraFraming.js'
import { parseCameraState, serializeCameraState } from '../src/lib/worldViewCameraState.js'
import { subjectCamera, subjectEllipsoidCamera, heightMetersForPrecisionClass } from '../src/lib/worldViewMapStack.js'
import { cameraStateFromMapCamera, mapCameraForCameraState } from '../src/lib/worldViewRendererAdapter.js'

const camera = serializeCameraState({ lon:-100,lat:45,heightMeters:2000000,headingDegrees:25,pitchDegrees:-60,rollDegrees:0 })
test('Map/Graph/Map memory restores only a matching subject and renderer; invalid capture retains good state',()=>{
  const memory=createCameraMemory(), calls=[]
  const adapter={setCameraState:state=>{calls.push(state);return true}}
  assert.equal(memory.restore(adapter,'a','ellipsoid-globe'),false)
  assert.equal(memory.remember(camera,'a','ellipsoid-globe'),true)
  assert.equal(memory.remember(null,'a','ellipsoid-globe'),false)
  assert.equal(memory.restore(adapter,'b','ellipsoid-globe'),false)
  assert.equal(memory.restore(adapter,'a','osm'),false)
  assert.equal(memory.restore(adapter,'a','ellipsoid-globe'),true)
  assert.deepEqual(calls,[camera])
  assert.equal(memory.restore({setCameraState:()=>false},'a','ellipsoid-globe'),false)
})
test('restored framing does not undo a manual camera; changed geometry still frames',()=>{
  const framing=createCameraFraming();let flights=0
  const a={selected:true,positions:[[-81.7,41.4]],row:{mip_object_id:'a',precision_class:'city'}}
  framing.select([a]);framing.acceptRestoredView()
  assert.equal(framing.getFramedKey(),framing.getTargetKey())
  assert.equal(framing.apply({flyToSubjectCamera:()=>{flights++;return true}}),false)
  framing.select([{...a,positions:[[-100,45]]}])
  assert.equal(framing.apply({flyToSubjectCamera:()=>{flights++;return true}}),true)
  assert.equal(flights,1)
})
const regions=[
 ['Great Lakes',[-81.7,41.4]],['coastal metro',[-74,40.7]],
 ['mountain/fire',[-121.5,40]],['desert',[-112,33.4]],['Plains',[-97.5,35.5]],
 ['hurricane coast',[-80.2,25.8]],['Canada',[-123.1,49.3]],
 ['high latitude',[-114.4,62.5]],['Mexico',[-99.1,19.4]],['border',[-106.5,31.7]],
 ['dateline',[179.9,51]],['north pole',[0,90]],['south pole',[0,-90]]
]
for(const [name,coordinate] of regions) test(name+': deterministic nadir framing, precision floor and valid fallback',()=>{
  const globe=subjectEllipsoidCamera(coordinate,'city'), map=subjectCamera(coordinate,'city')
  assert.equal(globe.headingDegrees,0);assert.equal(globe.pitchDegrees,-90)
  assert.equal(globe.heightMeters,heightMetersForPrecisionClass('city'))
  assert.equal(map.bearing,0);assert.equal(map.pitch,0)
  assert.deepEqual(map.center,coordinate)
  const converted=mapCameraForCameraState(parseCameraState(serializeCameraState(globe)),'city')
  assert.ok(converted.center[1]>=-85.05112878&&converted.center[1]<=85.05112878)
  assert.equal(converted.pitch,0);assert.ok(Number.isFinite(converted.zoom))
})
test('renderer pitch bridge uses nadir conventions and preserves manually tilted view',()=>{
  for(const pitch of [0,32,60,85]){
    const state=cameraStateFromMapCamera({lng:-99.1,lat:19.4,zoom:6,bearing:14,pitch},'city')
    assert.equal(state.pitchDegrees,pitch-90)
    assert.equal(mapCameraForCameraState(state,'city').pitch,pitch)
  }
  const overview=parseCameraState(northAmericaCameraState())
  assert.equal(overview.lon,-100);assert.equal(overview.pitchDegrees,-90)
  assert.ok(mapCameraForCameraState(overview,null).zoom>=0.8)
})
