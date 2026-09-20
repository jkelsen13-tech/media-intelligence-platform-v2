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

test('main report returns separate authority and pipeline verdicts', () => {
  assert.match(report, /A\. AUTHORITY CONSOLIDATED[\s\S]+FAIL/)
  assert.match(report, /B\. PIPELINE OPERATIONAL[\s\S]+FAIL/)
  assert.match(report, /qik[\s\S]+no active cron/i)
  assert.match(report, /yhb[\s\S]+two active five-minute/i)
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

test('former demo lane is historical only and excluded from acceptance', () => {
  for (const document of [report, checkpoint, productionCandidateReadme]) {
    assert.doesNotMatch(document, /frozen demo\s+acceptance fixture/i)
    assert.doesNotMatch(document, /demo preview[^\n]*acceptance reference/i)
  }
  assert.match(report, /current live MIP platform as its primary\s+surface/i)
  assert.match(report, /No isolated-demo output contract or presentation was used/i)
  assert.match(report, /No further run budget\s+will be spent\s+repairing or reconciling the former demo lane/i)
  assert.match(report, /frozen demo commit is not\s+an ancestor/i)
  assert.match(report, /no\s+demo-derived implementation adopted/i)
  assert.doesNotMatch(report, /Full frozen-demo reproduction was attempted/i)
  assert.match(checkpoint, /frozen historical work only/i)
  assert.match(checkpoint, /no adopted demo implementation/i)
})

test('algorithm shadow SQL qualification remains non-deployed and owner-gated', () => {
  assert.match(report, /did not deploy[\s\S]+network-free collector algorithm-shadow/i)
  assert.match(report, /no ambient service role/i)
  assert.match(checkpoint, /service-role credential as an effective least-privilege[\s\S]+rejected/i)
  assert.match(checkpoint, /qualification contract now supplies isolated SQL[\s\S]+This is still not deployed/i)
  assert.match(shadowQualificationReadme, /not a\s+migration and must not be applied/i)
  assert.match(shadowQualificationReadme, /direct PostgreSQL[\s\S]+session_user/i)
  assert.match(shadowQualificationReadme, /passed all 13 tests[\s\S]+bounded PostgreSQL core contract only/i)
  assert.match(shadowQualificationReadme, /target-shaped\s+Supabase restore must still verify pooler\/authenticator identity/i)
  assert.match(report, /passes all 13 bounded\s+concurrency\/security tests/i)
  assert.match(report, /not deployment evidence[\s\S]+not a full recovery rehearsal/i)
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
