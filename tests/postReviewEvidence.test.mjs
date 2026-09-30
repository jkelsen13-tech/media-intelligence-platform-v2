import {createHash} from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('authority verifier-only changes are included in PostgreSQL pull request paths',()=>{
  const workflow=read('.github/workflows/comparison-postgres.yml')
  const paths=workflow.slice(workflow.indexOf('  pull_request:'),workflow.indexOf('  workflow_call:'))
  for(const path of ['verifier/pr149AuthorityOrdering.py','verifier/pr149-authority-baseline.sql']){
    assert.ok(paths.includes("- '"+path+"'"),path)
  }
  assert.match(workflow,/image: postgres:17\.6/)
})
test('sequential Node evidence does not claim an executing completion transaction',()=>{
  const source=read('tests/comparisonCapabilitySeparation.test.mjs')
  assert.doesNotMatch(source,/blocks in-flight worker_complete/)
  assert.match(source,/rejects new completion of an outstanding lease/)
  const native=read('verifier/pr149AuthorityOrdering.py')
  assert.match(native,/pg_advisory_lock/)
  assert.match(native,/blocked\(/)
})
test('future disclosure supplement does not retroactively authorize migration access',()=>{
  const supplement=JSON.parse(read('verifier/post-review-2026-09-11/disclosure-dependencies.proposed.json'))
  assert.equal(supplement.automatic_disclosure,false)
  assert.equal(supplement.dependencies.migration_absence_checks.disclosure_authorized,false)
  assert.equal(supplement.historical_manifest.unchanged,true)
})

test('historical disclosure manifest remains unchanged',()=>{
 const old=read('verifier/mip-production-cutover-review-v1/disclosure-manifest.json')
 const actual=createHash('sha256').update(old).digest('hex')
 assert.equal(actual,'04d28b676f15bd63acf5e96d01622d1f9d06aa4f79d68b7b6dae42e3b63f858f')
})
