import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const operational = fs.readFileSync(
  new URL('../supabase/migrations/20260920153443_canonical_collector_operational_contracts_v1.sql', import.meta.url),
  'utf8',
)
const shadow = fs.readFileSync(
  new URL('../supabase/migrations/20260920153444_collector_shadow_receipts_v1.sql', import.meta.url),
  'utf8',
)
const transport = fs.readFileSync(
  new URL('../supabase/migrations/20260920153900_collector_shadow_http_transport_v1.sql', import.meta.url),
  'utf8',
)
const fkIndexCandidate = fs.readFileSync(
  new URL('../supabase/migrations/20260920160000_collector_operational_fk_index_candidate_v1.sql', import.meta.url),
  'utf8',
)
const runtime = fs.readFileSync(
  new URL('../supabase/functions/collector-shadow/index.ts', import.meta.url),
  'utf8',
)
const receipt = JSON.parse(fs.readFileSync(
  new URL('../verifier/backend-consolidation-2026-09-20/collector-shadow-live-receipt.json', import.meta.url),
  'utf8',
))

test('canonical operational contracts are present without browser grants or activation', () => {
  for (const relation of [
    'ingestion_runs',
    'ingestion_source_runs',
    'author_profile_queue',
    'original_source_import_credentials',
    'source_comparison_enrichment_queue',
  ]) {
    assert.match(operational, new RegExp(`create table if not exists public\\.${relation}`))
    assert.match(operational, new RegExp(`'${relation}'`))
  }
  assert.doesNotMatch(operational, /grant\s+.+\s+to\s+(anon|authenticated)/i)
  assert.doesNotMatch(operational, /cron\.schedule|net\.http_post|deploy/i)
  assert.match(operational, /force row level security/i)
  assert.match(operational, /grant select, insert, update, delete on table public\.%I to service_role/i)
})

test('shadow migration is private, immutable, source-qualified, and unscheduled', () => {
  assert.match(shadow, /create table if not exists mip_private\.collector_shadow_runs/i)
  assert.match(shadow, /collector_shadow_receipt_is_immutable/)
  assert.match(shadow, /source_project\s+text not null check \(source_project = 'yhbwnrtlqbjtcrrlpbge'\)/)
  assert.match(shadow, /revoke all on table mip_private\.%I from public, anon, authenticated, service_role/i)
  assert.match(shadow, /grant execute on function public\.mip_collector_shadow_schedule_authorized[\s\S]+to service_role/i)
  assert.doesNotMatch(shadow, /cron\.schedule|cron\.alter_job|net\.http_post/i)
})

test('shadow transport enables pg_net without activating a schedule', () => {
  assert.match(transport, /create extension if not exists pg_net with schema extensions/i)
  assert.doesNotMatch(transport, /cron\.schedule|cron\.alter_job|net\.http_post/i)
})

test('unapplied follow-up indexes the operational run foreign key safely', () => {
  assert.match(fkIndexCandidate, /candidate only/i)
  assert.match(fkIndexCandidate, /was not applied to a live project/i)
  assert.match(fkIndexCandidate, /set local lock_timeout = '5s'/i)
  assert.match(fkIndexCandidate, /ingestion_source_runs_run_id_idx[\s\S]+\(run_id\)/i)
})

test('shadow runtime has a fail-closed custom gate and receipt-only side effects', () => {
  assert.match(runtime, /x-mip-collector-shadow-token/)
  assert.match(runtime, /mip_collector_shadow_schedule_authorized/)
  assert.match(runtime, /authorized !== true/)
  assert.match(runtime, /mip_collector_shadow_plan/)
  assert.match(runtime, /mip_collector_shadow_record/)
  assert.match(runtime, /publication_writes: false/)
  assert.match(runtime, /predecessor_acknowledgements: false/)
  assert.match(runtime, /canonical_domain_writes: false/)
  assert.doesNotMatch(runtime, /\.from\(['"](articles|events|claims|explanations|source_comparison_enrichment_queue)['"]\)/)
})

test('live shadow receipt proves all sources and a no-domain-write run', () => {
  assert.equal(receipt.edge_function.version, 1)
  assert.equal(receipt.edge_function.unauthenticated_probe.http_status, 401)
  assert.equal(receipt.probes.length, 7)
  assert.ok(receipt.probes.every((probe) => probe.http_status === 200 && probe.sha256.length === 64))
  assert.equal(receipt.post_probe_counts.shadow_successes, 7)
  assert.equal(receipt.post_probe_counts.ingestion_runs, 0)
  assert.equal(receipt.post_probe_counts.source_comparison_enrichment_queue, 0)
  assert.equal(receipt.scope.canonical_domain_writes, false)
  assert.equal(receipt.scope.publication_writes, false)
  assert.equal(receipt.scope.predecessor_acknowledgements, false)
  assert.equal(
    receipt.collector_history_fence.ingestion_runs.source_and_archive_sha256.length,
    64,
  )
})
