import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const repoRoot=fileURLToPath(new URL('..',import.meta.url))
const v16=readFileSync(join(repoRoot,'supabase/runtime-snapshots/source-comparison-run-v16/index.ts'),'utf8')
const contract=readFileSync(join(repoRoot,'supabase/qualification/comparison-generations/contract.sql'),'utf8')
const capability=readFileSync(join(repoRoot,'supabase/qualification/comparison-generations/capability.sql'),'utf8')
const snapshot=readFileSync(join(repoRoot,'supabase/qualification/comparison-generations/source-snapshot.sql'),'utf8')

test('disclosed v16 worker is a mutable rebuild and does not call isolated generation APIs',()=>{
  assert.match(v16,/async function rebuildProjection/)
  assert.match(v16,/async function acknowledgeProjectionQueue/)
  assert.match(v16,/\.from\('source_comparison_enrichment_queue'\)/)
  assert.match(v16,/\.update\(\{ state: 'succeeded'/)
  assert.match(v16,/\.eq\('state', 'pending'\)/)
  assert.match(v16,/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/)
  assert.match(v16,/Bearer \$\{serviceKey\}/)
  assert.doesNotMatch(v16,/comparison_qualification/)
  assert.doesNotMatch(v16,/capture_source/)
  assert.doesNotMatch(v16,/complete_generation/)
})

test('isolated generation contract is a different artifact than v16',()=>{
  assert.match(contract,/create function comparison_qualification\.enqueue/)
  assert.match(contract,/create function comparison_qualification\.complete/)
  assert.match(snapshot,/create function comparison_qualification\.capture_source/)
  assert.match(capability,/mip_scheduler_not_a_worker/)
  assert.notEqual(v16,contract)
})

test('neither qualification SQL nor mip_* design is a production migration',()=>{
  const migrations=readdirSync(join(repoRoot,'supabase/migrations'))
  for(const name of migrations){
    const sql=readFileSync(join(repoRoot,'supabase/migrations',name),'utf8')
    assert.doesNotMatch(sql,/qual_comparison_worker/)
    assert.doesNotMatch(sql,/mip_comparison_worker_v1/)
    assert.doesNotMatch(sql,/mip_cutover_authority/)
    assert.doesNotMatch(sql,/publisher_release_enabled/)
  }
})
