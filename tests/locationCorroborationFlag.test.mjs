// 02A Amendment B hardening (2026-08-17) — lock the location-corroboration
// flag's withhold posture and the render-path gate.
//
// The failure modes these tests guard against are all silent:
//   1. resolveLocationCorroboration treats a non-true value as enabled
//      (truthy string, 1, missing row, error path) -> the corroboration
//      badge and confidence boost go live without owner authorization, and
//      rollback-by-flag stops working.
//   2. Either sky_verifications loader loses its flag gate -> a row landing
//      in the table renders instantly, bypassing the flag entirely.
//   3. The migration is missing, defaults true, or drops its rollback note.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolveLocationCorroboration } from '../src/lib/supabase.js'

test('resolveLocationCorroboration: exactly boolean true -> enabled', () => {
  assert.equal(resolveLocationCorroboration(true), true)
})

test('resolveLocationCorroboration: withhold posture — everything else gated', () => {
  for (const v of [false, null, undefined, 'true', 1, 0, {}, [], 'location_corroboration']) {
    assert.equal(resolveLocationCorroboration(v), false, `value ${JSON.stringify(v)} must resolve gated`)
  }
})

// Static drift guard: both loaders must check the flag BEFORE touching
// sky_verifications. Mirrors the atomicAttach15A static-guard pattern.
const SUPABASE_LIB = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')

for (const fn of ['loadSkyVerification', 'loadSkyVerificationForNode']) {
  test(`${fn}: flag gate present and precedes any sky_verifications read`, () => {
    const start = SUPABASE_LIB.indexOf(`export async function ${fn}(`)
    assert.ok(start > -1, `${fn} not found in src/lib/supabase.js`)
    const nextExport = SUPABASE_LIB.indexOf('\nexport ', start + 1)
    const body = SUPABASE_LIB.slice(start, nextExport === -1 ? undefined : nextExport)
    const gate = body.indexOf(fn === 'loadSkyVerification' ? 'loadLocationCorroborationFlag({ supabaseClient: client })' : 'loadLocationCorroborationFlag()')
    assert.ok(gate > -1, `${fn} must call loadLocationCorroborationFlag()`)
    const read = body.indexOf(".from('sky_verifications')")
    assert.ok(read > -1, `${fn} no longer reads sky_verifications — update this guard`)
    assert.ok(gate < read, `${fn} must gate BEFORE reading sky_verifications`)
  })
}

const MIGRATION_PATH = new URL('../supabase/migrations/20260817_location_corroboration_flag.sql', import.meta.url)
const MIGRATION = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

test('migration exists, targets the right key, and defaults false', () => {
  assert.ok(MIGRATION.length > 0, 'migration file missing')
  assert.match(MIGRATION, /'location_corroboration'/)
  assert.match(MIGRATION, /'false'::jsonb/)
  assert.doesNotMatch(MIGRATION, /'true'::jsonb/)
  assert.match(MIGRATION, /on conflict \(key\) do nothing/i)
})

test('migration documents its rollback path', () => {
  assert.match(MIGRATION, /rollback = set false/i)
})
