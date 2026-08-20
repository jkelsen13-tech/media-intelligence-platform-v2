import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const importer = fs.readFileSync(new URL('../supabase/functions/import-original-source/index.ts', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../supabase/migrations/20260820_original_source_readonly_import.sql', import.meta.url), 'utf8')
const edgeCompatibilityMigration = fs.readFileSync(new URL('../supabase/migrations/20260820_original_source_edge_sequence_compatibility.sql', import.meta.url), 'utf8')
const conflictAuditMigration = fs.readFileSync(new URL('../supabase/migrations/20260820_original_source_article_conflict_audit.sql', import.meta.url), 'utf8')
const sourceComparisonView = fs.readFileSync(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')

test('original-source importer reads the original project only through paginated GET requests', () => {
  assert.match(importer, /const SOURCE_PROJECT_REF = 'niejaejtbxgakyrsntxm'/)
  assert.match(importer, /async function fetchSourceAll/)
  assert.match(importer, /headers: \{ apikey: sourceKey, Authorization: `Bearer \$\{sourceKey\}`/)
  assert.doesNotMatch(importer, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/) 
  assert.match(migration, /It neither\n-- references nor writes to the original Supabase project/)
})

test('original-source importer maps provenance and only materializes cross-surface links from source records', () => {
  assert.match(importer, /original_source: \{ project_ref: SOURCE_PROJECT_REF, source_id: sourceId, import_run: IMPORT_RUN_KEY \}/)
  assert.match(importer, /original_source_import_mappings/)
  assert.match(importer, /importEventArticles/)
  assert.match(importer, /importEdges/)
  assert.match(importer, /importPolicies/)
  assert.match(importer, /importP3Policies/)
  assert.doesNotMatch(importer, /is_pre_ruling/)
  assert.doesNotMatch(importer, /different_causal_chain/)
  assert.match(importer, /const WRITE_BATCH_SIZE = 500/)
  assert.match(importer, /async function flushMappings/)
  assert.match(importer, /await flushMappings\(target, maps\)/)
  assert.match(importer, /existingBy\(target, 'original_source_import_mappings', 'source_table, source_id, target_id', \[\['source_project_ref', SOURCE_PROJECT_REF\]\]\)/)
  assert.match(importer, /insertRows\(target, 'edges', chunk, 'id'\)/)
  assert.match(edgeCompatibilityMigration, /'sequence'/)
  assert.match(importer, /existingBy\(target, 'policy_actors', 'policy_id, entity_id'\)/)
  assert.match(importer, /existingBy\(target, 'policy_topics', 'policy_id, topic_id'\)/)
})

test('original-source importer uses insert-only handling for existing article URLs and logs each conflict privately', () => {
  assert.match(importer, /async function insertOnlyRows/)
  assert.match(importer, /await batched\(payload, async \(chunk\) => insertOnlyRows\(target, 'articles', chunk\)\)/)
  assert.match(importer, /conflict_kind: 'existing_url_skipped'/)
  assert.match(importer, /existing Version Two article fields are never updated/)
  assert.match(importer, /Only newly inserted articles receive Arc membership/)
  assert.match(conflictAuditMigration, /original_source_import_conflicts/)
  assert.match(conflictAuditMigration, /revoke all on public\.original_source_import_conflicts from anon, authenticated/)
  assert.match(conflictAuditMigration, /historical_url_upsert_no_snapshot/)
})

test('source-comparison cards do not render public R1–R4 outlet tier labels', () => {
  assert.doesNotMatch(sourceComparisonView, /ReliabilityChip/)
  assert.doesNotMatch(sourceComparisonView, /OUTLET_RELIABILITY/)
  assert.doesNotMatch(sourceComparisonView, /R_LEVEL_NAMES/)
  assert.doesNotMatch(sourceComparisonView, /source tier not recorded/)
})

test('original-source importer preserves source-comparison eligibility and excludes protected legal cases', () => {
  assert.match(importer, /Original event status is preserved/)
  assert.match(importer, /excludes only Timeline-only records and requires multiple outlets/)
  assert.match(importer, /!row\.involves_minor_or_private_person && !row\.sealed_or_expunged/)
  assert.match(importer, /maps\.get\(`p3_legal_case:\$\{row\.case_id\}`\)/)
  assert.match(migration, /p3_legal_case/)
  assert.match(migration, /The import excludes sealed,\s*\n-- expunged, and minor\/private-person cases/)
})

test('original-source importer requires a target-only hashed credential', () => {
  assert.match(importer, /x-mip-original-import-key/)
  assert.match(importer, /\.from\('original_source_import_credentials'\)/)
  assert.match(importer, /\.eq\('credential_name', 'original-source-import'\)/)
  assert.match(migration, /create table if not exists public\.original_source_import_credentials/)
  assert.match(migration, /insert into public\.original_source_import_credentials \(credential_name, key_hash, active, rotated_at\)/)
  assert.match(migration, /revoke all on public\.original_source_import_credentials from anon, authenticated/)
})
