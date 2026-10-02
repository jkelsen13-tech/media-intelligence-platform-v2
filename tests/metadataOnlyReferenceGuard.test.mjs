import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { atomicFixture, SENTINEL } from './legacyAtomicCompletionFixture.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Preserve the historical repair receipt against its unchanged source fixture.
// The current handler retains a private proposal instead of rewriting rows.
const backfill = readFileSync(join(root, 'tests', 'fixtures', 'legacyExtractBatchBeforeAtomic-2026-10-02.ts'), 'utf8')
const migration = readFileSync(join(root, 'supabase', 'migrations', '20260819_candidate_path_and_metadata_only_repair.sql'), 'utf8')

test('historical metadata-only reference repair remains reproducible against its frozen predecessor', () => {
  assert.match(backfill, /isMetadataOnlyReferenceBody\(b\.text\)/)
  assert.match(backfill, /updates\.claims = \[\]/)
  assert.match(backfill, /updates\.source_status_note = 'Reference-manifest metadata only/)
  assert.match(backfill, /await supabase\.from\('citations'\)\.delete\(\)\.eq\('article_id', art\.id\)/)
  assert.match(backfill, /await supabase\.from\('article_entities'\)\.delete\(\)\.eq\('article_id', art\.id\)/)
})

test('actual atomic handler retains metadata-only bytes without evidence candidates or shared-row mutation', async () => {
  const f = await atomicFixture({ rawBody: SENTINEL })
  try {
    const before = await f.state(), result = await f.run()
    assert.deepEqual(await f.state(), before)
    assert.equal(result.report.errors.length, 0)
    assert.equal(result.report.metadataOnlySkipped, 1)
    assert.equal(result.resolverCalls, 0)
    const row = (await f.db.query('select * from mip_private.legacy_extraction_completions where article_id=$1', [f.pending])).rows[0]
    assert.equal(row.publication, 'withheld')
    assert.equal(row.plan.metadata_only, true)
    assert.deepEqual([row.plan.claims, row.plan.entities, row.plan.citations], [[], [], []])
    assert.equal(row.plan.proposed_digest, false)
    assert.equal(await f.scalar('select payload->>\'body_text\' from evidence_pipeline.article_captures where id=$1', [row.capture_id]), SENTINEL)
    assert.equal(await f.scalar('select count(*)::int from public.news_reviewed_articles_public where id=$1', [f.pending]), 0)
    const submitted = f.requests.find(r => r.payload.p_action === 'complete_private').payload.p_input
    for (const plan of [{ ...submitted.plan, metadata_only: false }, { ...submitted.plan, claims: ['invented claim'] }]) {
      await assert.rejects(f.roleCall('service_role', "select public.mip_legacy_extraction_v1('complete_private',$1::jsonb)", [JSON.stringify({ ...submitted, plan })]), /metadata reference relations withheld|invalid .*plan|invalid claims|idempotency conflict/)
    }
    assert.ok(f.requests.every(r => r.rpc === 'mip_legacy_extraction_v1' && r.method === 'POST'))
    assert.deepEqual(await f.state(), before)
  } finally { await f.close() }
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
