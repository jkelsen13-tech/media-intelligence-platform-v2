import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const verifier=await readFile(new URL('../verifier/collectorShadowPostgresConcurrency.py',import.meta.url),'utf8')
const workflow=await readFile(new URL('../.github/workflows/collector-shadow-postgres.yml',import.meta.url),'utf8')

test('native collector-shadow harness is disposable, direct-login, and live-service isolated',()=>{
  assert.match(verifier,/MARKER = "collector-shadow-qualification"/)
  assert.match(verifier,/MIP_DISPOSABLE_POSTGRES"\) != MARKER/)
  assert.match(verifier,/HOST = "127\.0\.0\.1"/)
  assert.match(verifier,/if not key\.startswith\("PG"\)/)
  assert.match(verifier,/session_user\|\|':'\|\|current_user/)
  assert.match(verifier,/mip_shadow_runtime_a_fixture/)
  assert.match(verifier,/mip_shadow_runtime_b_fixture/)
  assert.doesNotMatch(verifier,/set role service_role/i)
  assert.doesNotMatch(verifier,/supabase\.co|SUPABASE_URL|SERVICE_ROLE_KEY/i)
  assert.match(verifier,/former_demo_excluded/)
})

test('native suite exercises blocking, termination, restart, ACLs, and bounded recovery',()=>{
  assert.match(verifier,/pg_blocking_pids/)
  assert.match(verifier,/pg_terminate_backend/)
  assert.match(verifier,/docker", "restart/)
  assert.match(verifier,/relforcerowsecurity/)
  assert.match(verifier,/test_foreign_actual_login/)
  assert.match(verifier,/test_recovery_contention_and_attempt_exhaustion/)
  assert.match(workflow,/postgres:17\.6/)
  assert.match(workflow,/permissions:\s*\n\s+contents: read/)
  assert.match(workflow,/collector-shadow-qualification/)
})
