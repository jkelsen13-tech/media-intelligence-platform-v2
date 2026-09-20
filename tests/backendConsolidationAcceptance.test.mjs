import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const report = fs.readFileSync(
  new URL('../docs/BACKEND_CONSOLIDATION_AUTHORITY_RECONCILIATION_2026-09-20.md', import.meta.url),
  'utf8',
)
const checkpoint = fs.readFileSync(
  new URL('../docs/PHASE1_BACKEND_RECONCILIATION_CHECKPOINT_2026-09-20.md', import.meta.url),
  'utf8',
)
const foundationCheckpoint = fs.readFileSync(
  new URL('../docs/FOUNDATION_RUNTIME_OWNERSHIP_CHECKPOINT_2026-09-20.md', import.meta.url),
  'utf8',
)
const foundationReceipt = JSON.parse(fs.readFileSync(
  new URL('../verifier/backend-consolidation-2026-09-20/foundation-runtime-checkpoint-20260920.json', import.meta.url),
  'utf8',
))
const semantics = fs.readFileSync(
  new URL('../docs/SEMANTIC_DECISION_ABSENCE_CHANGE_AUTHORITY_2026-09-20.md', import.meta.url),
  'utf8',
)
const productionCandidateReadme = fs.readFileSync(
  new URL('../supabase/production-candidates/README.md', import.meta.url),
  'utf8',
)
const shadowQualificationReadme = fs.readFileSync(
  new URL('../supabase/qualification/collector-algorithm-shadow/README.md', import.meta.url),
  'utf8',
)
const liveAuthorityAudit = fs.readFileSync(
  new URL('../supabase/tests/backend_consolidation_20260920_verification.sql', import.meta.url),
  'utf8',
)
const liveReverification = JSON.parse(fs.readFileSync(
  new URL('../verifier/backend-consolidation-2026-09-20/live-reverification-20260920T175027Z.json', import.meta.url),
  'utf8',
))

test('main report returns three independent authority and pipeline verdicts', () => {
  assert.match(report, /A\. AUTHORITY CONSOLIDATED[\s\S]+FAIL/)
  assert.match(report, /B\. PIPELINE VALIDATED IN ISOLATION[\s\S]+FAIL/)
  assert.match(report, /C\. PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND[\s\S]+FAIL/)
  assert.match(report, /qik[\s\S]+no active cron/i)
  assert.match(report, /yhb[\s\S]+two active five-minute/i)
  assert.match(report, /each recorded\s+288 successes, zero failures/i)
  assert.match(report, /zero RLS-disabled base or partitioned tables/i)
  assert.match(report, /Twenty-seven public SECURITY DEFINER functions/i)
  assert.match(report, /policy-ingest[\s\S]+service-role external-fetch\/write behavior/i)
  assert.equal(liveReverification.mutations, 0)
  assert.equal(liveReverification.projects.yhbwnrtlqbjtcrrlpbge.cron_jobs.length, 2)
  assert.ok(liveReverification.projects.yhbwnrtlqbjtcrrlpbge.cron_jobs.every(
    job => job.active && job.runs_last_24h === 288 && job.failures_last_24h === 0,
  ))
  assert.ok(Object.values(liveReverification.projects).every(
    project => project.security.public_tables_rls_disabled === 0,
  ))
})

test('foundation checkpoint distinguishes all eight runtime stages without percentages', () => {
  for (const stage of [
    'Foundation located', 'Contract / implementation coverage',
    'Tested in isolation', 'Integrated with required components',
    'Installed / deployed', 'Enabled', 'Authorized real data',
    'End-to-end operational verification',
  ]) assert.ok(foundationCheckpoint.includes(stage), stage)
  for (const capability of [
    'Hypothesis assessment', 'Entity identity and actor agency',
    'Content-addressed storage', 'Markets', 'Weather rights',
    'Operation evidence', 'Provider-neutral System-One decision layer',
  ]) assert.ok(foundationCheckpoint.includes(capability), capability)
  assert.doesNotMatch(foundationCheckpoint, /\b\d{1,3}%\s+(?:complete|done|built)/i)
  assert.deepEqual(foundationReceipt.verdicts, {
    authority_consolidated: 'FAIL',
    pipeline_validated_in_isolation: 'FAIL',
    pipeline_operational_authorized_live_backend: 'FAIL',
  })
  assert.equal(foundationReceipt.live_observations.mutations, 0)
  assert.equal(
    foundationReceipt.live_observations.frontend_deployment_authority.canonical_live_surface,
    'github_pages_main_verified',
  )
  assert.equal(foundationReceipt.live_observations.qikvmopbtijoebdqosyq.articles_total, 98)
  assert.equal(foundationReceipt.live_observations.qikvmopbtijoebdqosyq.articles_reader_eligible, 3)
  assert.equal(foundationReceipt.foundation_runtime_matrix.F1.length, 8)
  assert.equal(foundationReceipt.foundation_runtime_matrix.F15.length, 8)
  assert.equal(foundationReceipt.security_gate.candidates_applied, false)
})

test('Phase 1 checkpoint is honest, inspectable, and owner-gated', () => {
  for (const heading of [
    'Verified pre-change backend inventory',
    'Canonical authority map and proposed disposition',
    'Caller matrix',
    'Unique-data findings',
    'RLS, authorization, and ambient authority',
    'Proposed predecessor dispositions at Phase 1',
    'Unresolved ambiguities at the gate',
    'Planned reversible actions',
    'Parent reconciliation of specialist evidence',
  ]) assert.match(checkpoint, new RegExp(`## ${heading}`))
  assert.match(checkpoint, /durable reconstruction/i)
  assert.match(checkpoint, /further live production work is paused/i)
  assert.match(checkpoint, /historical[\s\S]+Manus agent dependency/i)
})

test('semantic authority covers the full decision, absence, and change contracts', () => {
  for (const item of [
    'Canonical decision contract', 'Decision ID', 'Semantic decision key',
    'Evidence-set digest', 'Subject/entity bindings', 'Temporal scope',
    'Algorithm/policy/domain-adapter versioning', 'Provider/model/config metadata',
    'Immutable revisions', 'Reuse/cache semantics', 'Invalidation/supersession',
    'Cross-user authorization safety', 'Downstream deterministic disposition',
    'Provider-disabled behavior',
  ]) assert.ok(semantics.includes(item), item)

  for (const item of [
    'Not reported in examined source', 'Not present in retained evidence',
    'Not extracted by current algorithm', 'Not searched / coverage incomplete',
    'Unavailable from source', 'Rights/privacy blocked', 'Rejected by review',
    'Unknown / unresolved',
  ]) assert.ok(semantics.includes(item), item)

  for (const item of [
    'New relevant evidence', 'Source correction/retraction/revision',
    'Source-lineage/dependency change', 'Entity identity merge/split/remap',
    'Relationship reassessment', 'Hypothesis/assessment revision',
    'Temporal reinterpretation', 'Algorithm/policy change',
    'Domain-adapter change', 'Provider/model/method change',
    'Authorization/rights visibility change', 'Authorized human review/override',
  ]) assert.ok(semantics.includes(item), item)
})

test('no provider purchase or activation is authorized', () => {
  assert.match(semantics, /Do not activate or purchase Jev or another provider/)
  assert.doesNotMatch(semantics, /Jev[^\n]*(activated|purchased)/i)
})

test('algorithm shadow SQL qualification remains non-deployed and owner-gated', () => {
  assert.match(report, /did not deploy[\s\S]+network-free collector algorithm-shadow/i)
  assert.match(report, /no ambient service role/i)
  assert.match(checkpoint, /service-role credential as an effective least-privilege[\s\S]+rejected/i)
  assert.match(checkpoint, /qualification contract now supplies isolated SQL[\s\S]+This is still not deployed/i)
  assert.match(shadowQualificationReadme, /not a\s+migration and must not be applied/i)
  assert.match(shadowQualificationReadme, /direct PostgreSQL[\s\S]+session_user/i)
  assert.match(shadowQualificationReadme, /passed all 25 tests[\s\S]+bounded PostgreSQL core contract only/i)
  assert.match(shadowQualificationReadme, /target-shaped\s+Supabase restore must still verify pooler\/authenticator identity/i)
  assert.match(report, /passes all 25 bounded\s+concurrency\/security\/recovery tests/i)
  assert.match(report, /not deployment evidence[\s\S]+not a predecessor or disaster-recovery rehearsal/i)
  assert.match(productionCandidateReadme, /Do not adapt the existing service-role collector shadow as its host/i)
})

test('live authority audit detects effective reachability and implicit unsafe defaults', () => {
  assert.match(liveAuthorityAudit, /repeatable read read only/i)
  assert.match(liveAuthorityAudit, /pgrst\.db_schemas/i)
  assert.match(liveAuthorityAudit, /has_table_privilege\('anon'[\s\S]+relrowsecurity/i)
  assert.match(liveAuthorityAudit, /p\.prosecdef[\s\S]+has_function_privilege\('public'/i)
  assert.match(liveAuthorityAudit, /coalesce\(defaclacl,acldefault\('f',owner_oid\)\)/i)
  assert.match(liveAuthorityAudit, /effective_default_public_execute/i)
  assert.match(liveAuthorityAudit, /pg_auth_members/i)
  assert.doesNotMatch(liveAuthorityAudit, /auth\.users|storage\.objects|vault\.secrets/i)
})
