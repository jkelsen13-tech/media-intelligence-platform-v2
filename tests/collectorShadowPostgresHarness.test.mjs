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

test('native suite covers remaining authority completion/replay races without live inputs',()=>{
  for(const authority of ['source','session','runtime','implementation','configuration']){
    assert.match(verifier,new RegExp(`test_${authority}_authority_rollback_and_authority_first_ordering`))
    assert.match(verifier,new RegExp(`test_${authority}_worker_first_ordering`))
  }
  assert.match(verifier,/assert_authority_rollback_then_commit_denies/)
  assert.match(verifier,/assert_worker_first_then_authority_denies_replay/)
  assert.match(verifier,/collector_shadow_control\.retire_source/)
  assert.match(verifier,/collector_shadow_control\.revoke_session/)
  assert.match(verifier,/collector_shadow_control\.revoke_runtime/)
  assert.match(verifier,/collector_shadow_control\.retire_implementation/)
  assert.match(verifier,/collector_shadow_control\.retire_config/)
  assert.match(verifier,/test_rights_revocation_rollback_allows_waiting_completion/)
  assert.doesNotMatch(verifier,/codex\/mip-september-22-demo|demo-corpus-preview/)
})

test('native ACL audit probes effective owner defaults instead of trusting catalog-row presence',()=>{
  assert.match(verifier,/set role mip_shadow_store_owner_v1/)
  assert.match(verifier,/set role mip_shadow_worker_fn_owner_v1/)
  assert.match(verifier,/set role mip_shadow_authority_fn_owner_v1/)
  assert.match(verifier,/default_acl_probe_store_v1/)
  assert.match(verifier,/default_acl_probe_worker_v1/)
  assert.match(verifier,/default_acl_probe_authority_v1/)
  assert.match(verifier,/has_function_privilege\(/)
  assert.match(verifier,/select collector_shadow_api\.default_acl_probe_worker_v1\(\)/)
  assert.match(verifier,/select collector_shadow_control\.default_acl_probe_authority_v1\(\)/)
})
