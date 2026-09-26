import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const candidate = readFileSync(
  join(here, '../../supabase/production-candidates/public-projection-authority-hardening.sql'),
  'utf8',
)
const projectionMigration = readFileSync(
  join(here, '../../supabase/migrations/20260920145928_public_projection_write_revoke_v1.sql'),
  'utf8',
)
const postgresDefaultMigration = readFileSync(
  join(here, '../../supabase/migrations/20260920150006_postgres_public_default_acl_hardening_v1.sql'),
  'utf8',
)

const projections = [
  'spatial_projection_v1',
  'authors_public',
  'arc_milestones_public',
  'comparison_public',
  'graph_coverage_public',
  'news_detail_public',
  'investigation_surface_public',
]

test('public projection migration revokes browser writes from every reviewed projection', () => {
  assert.match(
    projectionMigration,
    /revoke insert, update, delete, truncate, references, trigger, maintain[\s\S]+from public, anon, authenticated;/i,
  )
  for (const projection of projections) {
    assert.match(projectionMigration, new RegExp(`public\\.${projection}\\b`, 'i'))
  }
})

test('applied and remaining default-ACL hardening cover both object owners', () => {
  for (const [owner, sql] of [
    ['postgres', postgresDefaultMigration],
    ['supabase_admin', candidate],
  ]) {
    assert.match(
      sql,
      new RegExp(`alter default privileges for role ${owner} in schema public[\\s\\S]+?revoke all on tables from public, anon, authenticated;`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`alter default privileges for role ${owner} in schema public[\\s\\S]+?revoke execute on functions from public, anon, authenticated;`, 'i'),
    )
  }
})

test('public projection candidate is transaction-bounded and does not mutate rows or change view semantics', () => {
  const sql = [projectionMigration, postgresDefaultMigration, candidate].join('\n')
  assert.match(candidate, /\bbegin;[\s\S]*\bcommit;/i)
  assert.doesNotMatch(sql, /\b(insert\s+into|update\s+\S+\s+set|delete\s+from|truncate\s+table)\b/i)
  assert.doesNotMatch(sql, /\b(create|replace|drop)\s+(or\s+replace\s+)?view\b/i)
  assert.doesNotMatch(sql, /\bsecurity_invoker\b/i)
  assert.doesNotMatch(sql, /\bgrant\b/i)
})
