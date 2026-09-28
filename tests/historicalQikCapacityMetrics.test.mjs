import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCapacityResource,capacityFailureStage,capacityFailureCode} from './historicalQikCapacityMetrics.mjs'
test('capacity measurements retain observed exceedance and independent system CPU',()=>{
 const measured=parseCapacityResource('CAPACITY_RESOURCE 1.50 0.50 262144 3.00\n')
 assert.equal(measured.user_cpu_ms,1500)
 assert.equal(measured.system_cpu_ms,500)
 assert.equal(measured.peak_rss_bytes,268435456)
 assert.equal(measured.edge_threshold_exceeded,true)
 assert.equal(Object.hasOwn(measured,'qualified'),false)
})
test('capacity parser refuses missing, duplicate, malformed, zero RSS and overflow observations',()=>{
 for(const value of ['', 'CAPACITY_RESOURCE 0 0 0 1',
  'CAPACITY_RESOURCE -1 0 20 1','CAPACITY_RESOURCE 1 0 20 0',
  'CAPACITY_RESOURCE 1 0 99999999999999999999 1',
  'CAPACITY_RESOURCE 1 0 20 1\nCAPACITY_RESOURCE 1 0 20 1',
  'CAPACITY_RESOURCE 1 0 20 1 trailing']){
  assert.throws(()=>parseCapacityResource(value),{message:'capacity_measurement_invalid'})
 }
})
test('centisecond zero CPU is retained as resolution-limited observation, not invented positive CPU',()=>{
 const measured=parseCapacityResource('CAPACITY_RESOURCE 0.00 0.00 1024 0.01')
 assert.equal(measured.user_cpu_ms+measured.system_cpu_ms,0)
 assert.equal(measured.edge_threshold_exceeded,false)
 assert.equal(Object.hasOwn(measured,'hosted_edge_qualified'),false)
})

test('capacity failure diagnostics accept only finite source-defined stages and codes',()=>{
 assert.equal(capacityFailureStage('metadata_result'),'metadata_result')
 assert.equal(capacityFailureCode('frozen_inventory_changed'),'frozen_inventory_changed')
 for(const value of ['postgresql://secret@host/db','select private_payload','unexpected\nstderr',null,{},undefined]){
  assert.equal(capacityFailureStage(value),'unknown')
  assert.equal(capacityFailureCode(value),'unknown')
 }
})
test('expanded capacity metadata fixture obeys the original canonical inventory equality contract',async()=>{
 const {capacityMetadataFixture}=await import('./historicalQikCapacity.mjs')
 const {planHistoricalArticles}=await import('../scripts/mipHistoricalArticleTransferPlan.mjs')
 const {stableStringify}=await import('../scripts/mipLegacyGraphStaging.mjs')
 const input=capacityMetadataFixture()
 const canonical=planHistoricalArticles(input,{records:32768,objects:1,bytes:128*1024*1024}).manifest
 assert.equal(input.records.length,32768)
 assert.equal(input.objects.length,0)
 for(const snapshot of canonical.snapshots){
  const actual={snapshot:input.snapshots.find(s=>s.project===snapshot.project),
   records:input.records.filter(r=>r.identity.project===snapshot.project),objects:[]}
  const expected={snapshot,records:canonical.records.filter(r=>r.identity.project===snapshot.project),objects:[]}
  assert.equal(stableStringify(actual),stableStringify(expected))
 }
 // The original defect is observable: arbitrary record order is not inventory equality.
 const disordered=structuredClone(input)
 ;[disordered.records[0],disordered.records[1]]=[disordered.records[1],disordered.records[0]]
 assert.notEqual(stableStringify(disordered),stableStringify(canonical))
})
