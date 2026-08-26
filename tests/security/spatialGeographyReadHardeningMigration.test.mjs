import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  join(here, '../../supabase/migrations/20260826203500_v2_spatial_geography_read_hardening.sql'),
  'utf8',
)

const tables = [
  ['geographic_places', 'geographic_places_read'],
  ['node_location_mentions', 'node_location_mentions_read'],
]

test('spatial geography hardening closes base-table reads while preserving service_role access', () => {
  for (const [table, policy] of tables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      `${table}: row level security remains enabled`,
    )
    assert.match(
      migration,
      new RegExp(`drop policy if exists ${policy} on public\\.${table};`, 'i'),
      `${table}: legacy permissive read policy is dropped`,
    )
    assert.match(
      migration,
      new RegExp(`revoke select on table public\\.${table} from anon, authenticated, public;`, 'i'),
      `${table}: anon, authenticated, and PUBLIC SELECT are revoked`,
    )
  }

  assert.match(
    migration,
    /grant select on table public\.geographic_places, public\.node_location_mentions to service_role;/i,
    'service_role SELECT is explicitly preserved for both geography tables',
  )
})

test('spatial geography hardening stays transaction-bounded and does not broaden or mutate scope', () => {
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;/i, 'migration is transaction-bounded')
  assert.doesNotMatch(migration, /\bcreate\s+policy\b[\s\S]*?\busing\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i)
})
