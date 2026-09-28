import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCapacityResource} from './historicalQikCapacityMetrics.mjs'
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
