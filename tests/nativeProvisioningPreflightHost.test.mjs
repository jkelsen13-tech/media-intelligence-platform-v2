import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePreflightHostEnvironment} from '../supabase/qualification/native-provisioning-compat/preflight-run.mjs'
const sha='a'.repeat(40)
const env={
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'jkelsen13-tech/media-intelligence-platform-v2',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,QIK_NATIVE_PREFLIGHT_APPROVED_SHA:sha,MIP_PREFLIGHT_RELEASE_SHA:sha,
 MIP_PREFLIGHT_HOST_ADMISSION:'qualified-installer-auth-metadata-preflight-v1',
 MIP_PREFLIGHT_BUDGET_ADMISSION:'within-existing-25-once-10-monthly',
 MIP_PREFLIGHT_EXECUTE:'run-auth-metadata-preflight',NODE_EXTRA_CA_CERTS:'/remote/public-ca.crt',
 MIP_PREFLIGHT_CONFIG_JSON:JSON.stringify({expectedLogin:'postgres',c3OperationId:'b'.repeat(32),c3ManifestSha256:'c'.repeat(64)})
}
test('manual auth preflight requires exact approved dispatch SHA and exact config',()=>{
 const r=validatePreflightHostEnvironment(env,'v22.14.0',2)
 assert.equal(r.release,sha);assert.equal(r.config.expectedLogin,'postgres')
})
test('separate source checkout cannot substitute for dispatch SHA',()=>{
 for(const patch of [{GITHUB_SHA:'b'.repeat(40)},{MIP_PREFLIGHT_RELEASE_SHA:'b'.repeat(40)},
 {QIK_NATIVE_PREFLIGHT_APPROVED_SHA:'b'.repeat(40)},{GITHUB_EVENT_NAME:'push'},
 {GITHUB_REPOSITORY:'other/repo'},{GITHUB_RUN_ATTEMPT:'2'},
 {MIP_PREFLIGHT_HOST_ADMISSION:'qualified-source-metadata-only-activation-v1'},
 {MIP_PREFLIGHT_BUDGET_ADMISSION:''},{MIP_PREFLIGHT_EXECUTE:'held'}])
 assert.throws(()=>validatePreflightHostEnvironment({...env,...patch},'v22.14.0',2),/installer_preflight_host_refused/)
})
test('forbids debug/TLS bypass, extra credential classes, CLI and runtime drift',()=>{
 for(const key of ['NODE_OPTIONS','NODE_DEBUG','NODE_DEBUG_NATIVE','DEBUG','SSLKEYLOGFILE','NODE_TLS_REJECT_UNAUTHORIZED',
 'PGOPTIONS','PGPASSWORD','PGHOST','QIK_NATIVE_AUDIT_DATABASE_URL','QIK_NATIVE_METADATA_AUDIT_DATABASE_URL'])
 assert.throws(()=>validatePreflightHostEnvironment({...env,[key]:'forbidden-synthetic'},'v22.14.0',2))
 for(const key of ['ACTIONS_STEP_DEBUG','ACTIONS_RUNNER_DEBUG'])
 assert.throws(()=>validatePreflightHostEnvironment({...env,[key]:'true'},'v22.14.0',2))
 assert.throws(()=>validatePreflightHostEnvironment(env,'v22.15.0',2))
 assert.throws(()=>validatePreflightHostEnvironment(env,'v22.14.0',3))
})
test('config admits no arbitrary SQL, route or secret fields',()=>{
 for(const value of ['',JSON.stringify([]),JSON.stringify({expectedLogin:'postgres'}),'x'.repeat(1025),
 JSON.stringify({...JSON.parse(env.MIP_PREFLIGHT_CONFIG_JSON),sql:'select 1'}),
 JSON.stringify({...JSON.parse(env.MIP_PREFLIGHT_CONFIG_JSON),installer:'synthetic-password'})])
 assert.throws(()=>validatePreflightHostEnvironment({...env,MIP_PREFLIGHT_CONFIG_JSON:value},'v22.14.0',2))
})
