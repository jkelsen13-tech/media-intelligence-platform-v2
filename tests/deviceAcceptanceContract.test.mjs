import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {journeys,newAcceptanceRecord,validateAcceptanceRecord} from '../scripts/device-acceptance/contract.mjs'

test('owner template remains unknown, unmeasured, unadmitted and historical RED',()=>{
  const r=newAcceptanceRecord();assert.deepEqual(validateAcceptanceRecord(r),{valid:true,errors:[]})
  assert.equal(r.performance.status,'not_measured');assert.equal(r.performance.thermal.status,'unknown');assert.equal(r.historicalColdPortrait.status,'RED')
})
test('browser record cannot promote synthetic pixels, thermal state or physical performance',()=>{
  for(const change of [r=>r.performance.status='passed',r=>r.performance.thermal.status='measured',r=>r.visual.finalOwnerAccepted=true,r=>r.device.physicalEvidence=['invented-hardware']]){
    const r=newAcceptanceRecord();r.evidenceKind='browser_emulation';change(r);assert.equal(validateAcceptanceRecord(r).valid,false)
  }
})
test('final appearance requires owner and each admitted real source version/provider receipt',()=>{
  const r=newAcceptanceRecord();r.visual.status='accepted';r.visual.finalOwnerAccepted=true;r.visual.owner='owner';r.visual.evidence=['owner-review']
  const v=validateAcceptanceRecord(r);assert.equal(v.valid,false);assert.equal(v.errors.filter(e=>e.includes('admitted real')).length,3)
})
test('unavailable original boundary cannot become invented numeric performance pass',()=>{
  const r=newAcceptanceRecord();r.performance.status='passed';assert.equal(validateAcceptanceRecord(r).valid,false)
  r.historicalColdPortrait.status='GREEN';assert.equal(validateAcceptanceRecord(r).valid,false)
  r.historicalColdPortrait.status='RED';r.historicalColdPortrait.originalObservation='new relaxed budget';assert.equal(validateAcceptanceRecord(r).valid,false)
})
test('measured values require methods/windows/baselines and finite values',()=>{
  const r=newAcceptanceRecord();r.performance.metrics=[{quantity:'latency',scope:'physical_device',value:NaN,unit:'ms',method:'',instrument:'',sampleWindow:'',baselineReference:'',evidence:[],limitations:[]}]
  assert.equal(validateAcceptanceRecord(r).valid,false)
})
test('unsupported selection and passing checks require truthful evidence',()=>{
  const r=newAcceptanceRecord();r.surfaceCameraBaseline.selectionCompatibility='unsupported';assert.equal(validateAcceptanceRecord(r).valid,false)
  r.surfaceCameraBaseline.fallbackDisclosure='parent fallback';r.functional.checks=[{journeyId:'search-preview',status:'passed',observation:'',evidence:[]}];assert.equal(validateAcceptanceRecord(r).valid,false)
})
test('missing fields and unknown fields fail closed; schema and template agree',()=>{
  const r=newAcceptanceRecord();delete r.account;assert.equal(validateAcceptanceRecord(r).valid,false)
  const other=newAcceptanceRecord();other.device.gpuFps=60;assert.equal(validateAcceptanceRecord(other).valid,false)
  const schema=JSON.parse(readFileSync(new URL('../docs/device-acceptance/record.schema.json',import.meta.url)));assert.equal(schema.additionalProperties,false)
})
test('four profiles include both orientations and all accepted failure journeys',()=>{
  assert.equal(journeys.profiles.length,4);for(const p of journeys.profiles)assert.notEqual(p.viewport.width>p.viewport.height,p.rotatedViewport.width>p.rotatedViewport.height)
  for(const id of ['news-story','following-account','search-preview','navigation-context','billboard-reader','orientation','background-remount','network-loss','webgl-fallback','publication-failure','keyboard-density','physical-performance','final-visual'])assert.ok(journeys.journeys.some(j=>j.id===id),id)
})
