import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  join(here, '../../supabase/migrations/20260822_v2_anonymous_read_policy_hardening.sql'),
  'utf8',
)

const tables = [
  ['article_claims', 'public read article_claims'],
  ['article_extraction_results', 'article_extraction_results_read'],
  ['claim_evidence_links', 'public read claim_evidence_links'],
  ['claims', 'public read claims'],
  ['cross_surface_candidates', 'cross_surface_candidates_read'],
  ['ingest_sources', 'public read ingest_sources'],
  ['ingestion_runs', 'ingestion_runs_read'],
  ['ingestion_sources', 'ingestion_sources_read'],
  ['p3_legal_case', 'public read p3 legal case'],
  ['p3_legal_case_evidence', 'public read p3 legal evidence'],
  ['pipeline_config', 'public read pipeline_config'],
]

test('V2 anonymous-read hardening covers every confirmed Tier 0–2 table', () => {
  for (const [table, policy] of tables) {
    assert.match(
      migration,
      new RegExp(`revoke select on table public\\.${table} from anon, public;`, 'i'),
      `${table}: anon and PUBLIC table grants are revoked`,
    )
    assert.match(
      migration,
      new RegExp(`alter policy "${policy}" on public\\.${table} to authenticated;`, 'i'),
      `${table}: the read policy is authenticated-only`,
    )
  }
})

test('V2 anonymous-read hardening never mutates application rows', () => {
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i)
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;/i)
})
