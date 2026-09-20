import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const read = path => readFileSync(join(here, '../..', path), 'utf8')

test('spatial sandbox repair enables RLS on all five observed drift tables', () => {
  const sql = read('supabase/project-migrations/jfnzyvzthzqtczlxhjll/20260920151010_spatial_sandbox_public_rls_hardening_v1.sql')
  for (const table of ['arc_membership_candidates', 'authors', 'outlets', 'policies', 'story_arcs']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'))
  }
  assert.doesNotMatch(sql, /\b(disable row level security|grant|insert|update|delete|truncate)\b/i)
})

test('legacy definer repairs remove browser execution and explicitly preserve service callers', () => {
  const yhb = read('supabase/project-migrations/yhbwnrtlqbjtcrrlpbge/20260920151055_legacy_browser_definer_mutation_revoke_v1.sql')
  const nie = read('supabase/project-migrations/niejaejtbxgakyrsntxm/20260920151057_legacy_browser_definer_mutation_revoke_v1.sql')
  for (const sql of [yhb, nie]) {
    assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated;/i)
    assert.match(sql, /grant execute[\s\S]+to service_role;/i)
  }
  assert.match(yhb, /mip_v2_gdelt_begin_stage\(text,text,text,date,date\)/i)
  assert.doesNotMatch(`${yhb}\n${nie}`, /\b(insert|update|delete|truncate)\b/i)
})
