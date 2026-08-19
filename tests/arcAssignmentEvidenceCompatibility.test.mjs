import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migration = readFileSync(join(root, 'supabase', 'migrations', '20260819_arc_assignment_evidence_compatibility.sql'), 'utf8')
const atomicRpc = readFileSync(join(root, 'supabase', 'migrations', '20260813_atomic_arc_attach.sql'), 'utf8')

test('atomic attachment compatibility includes a nullable assignment-evidence field', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS arc_assignment_evidence jsonb/i)
  assert.match(migration, /nullable for legacy articles/i)
  assert.match(atomicRpc, /arc_assignment_evidence = coalesce\(p_evidence, arc_assignment_evidence\)/)
})
