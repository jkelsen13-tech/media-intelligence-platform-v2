import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backfill = readFileSync(join(root, 'supabase', 'functions', 'backfill-legacy', 'index.ts'), 'utf8')
const migration = readFileSync(join(root, 'supabase', 'migrations', '20260819_candidate_path_and_metadata_only_repair.sql'), 'utf8')

test('metadata-only reference rows are withheld from literal cross-surface extraction', () => {
  assert.match(backfill, /METADATA_ONLY_REFERENCE_BODY/)
  assert.match(backfill, /isMetadataOnlyReferenceBody\(b\.text\)/)
  assert.match(backfill, /updates\.claims = \[\]/)
  assert.match(backfill, /updates\.source_status_note = 'Reference-manifest metadata only/)
  assert.match(backfill, /await supabase\.from\('citations'\)\.delete\(\)\.eq\('article_id', art\.id\)/)
  assert.match(backfill, /await supabase\.from\('article_entities'\)\.delete\(\)\.eq\('article_id', art\.id\)/)
})

test('metadata-only repair preserves Timeline records while clearing unsupported inferred surfaces', () => {
  assert.match(migration, /candidate_generation_attempted_at timestamptz/)
  assert.match(migration, /source_status_note = 'Reference-manifest metadata only/)
  assert.match(migration, /DELETE FROM public\.citations/)
  assert.match(migration, /DELETE FROM public\.article_entities/)
  assert.match(migration, /DELETE FROM public\.cross_surface_candidates/)
  assert.match(migration, /UPDATE public\.events e\s+SET arc_id = NULL/s)
  assert.match(migration, /DELETE FROM public\.story_arcs/)
  assert.match(migration, /Timeline event\/article links are intentionally\s+-- preserved/s)
})
