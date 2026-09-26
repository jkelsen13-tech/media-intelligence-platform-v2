import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  join(here, '../../supabase/migrations/20260920150416_spatial_runtime_capability_gate_v1.sql'),
  'utf8',
)
const adapter = readFileSync(
  join(here, '../../supabase/functions/spatial-runtime-capability/handler.ts'),
  'utf8',
)

test('spatial runtime capability store is private, default-deny, and independently scoped', () => {
  assert.match(migration, /capability in \('write','review','release'\)/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /force row level security/i)
  assert.match(
    migration,
    /revoke all on table mip_private\.spatial_runtime_principal_capabilities[\s\S]+from public, anon, authenticated, service_role, spatial_writer_runtime;/i,
  )
  assert.match(migration, /where revoked_at is null/i)
})

test('operation gate separates review and release from ordinary writes and rejects unknown operations', () => {
  assert.match(migration, /append_review_decision' then 'review'/i)
  assert.match(migration, /append_release_decision' then 'release'/i)
  assert.match(migration, /else null/i)
  assert.match(migration, /not u\.is_anonymous/i)
  assert.match(migration, /u\.email_confirmed_at is not null/i)
})

test('runtime adapter binds authenticated user and exact request operation in the existing transaction gate', () => {
  assert.match(adapter, /spatial_runtime_operation_allowed\(\$1::uuid,\$2::text\)/i)
  assert.match(adapter, /args\?\.\[0\],[\s\S]*operation/i)
  assert.match(adapter, /sql\.includes\("public\.mip_profile_exists"\)/i)
  assert.doesNotMatch(adapter, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL/)
})
