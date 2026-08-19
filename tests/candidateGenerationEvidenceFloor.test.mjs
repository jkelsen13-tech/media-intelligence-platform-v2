import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backfill = readFileSync(join(root, 'supabase', 'functions', 'backfill-legacy', 'index.ts'), 'utf8')

test('candidate pass is explicit, resumable, and review-gated', () => {
  assert.match(backfill, /if \(mode === 'candidates'\)/)
  assert.match(backfill, /candidate_generation_attempted_at/)
  assert.match(backfill, /candidate_generation_note/)
  assert.match(backfill, /const CANDIDATE_BATCH = 100/)
  assert.match(backfill, /Scoped BigQuery runs already persist structured extraction results/)
  assert.match(backfill, /if \(runTag\) q = q\.eq\('ingestion_run_id', runTag\)/)
  assert.match(backfill, /else q = q\.not\('entities_extracted_at', 'is', null\)/)
  assert.match(backfill, /review_state: 'pending'/)
  assert.match(backfill, /redistrictingSensitiveScope/)
  assert.match(backfill, /redistricting-sensitive ingestion scope is reserved for owner review/)
  assert.match(backfill, /candidateOwnerHoldWithheld/)
  assert.match(backfill, /It never writes a Graph\/Arc\/Timeline surface/)
})

test('candidate evidence floor requires a literal stored span, primary citation, and primary-record URL', () => {
  assert.match(backfill, /literalClaimFromStoredClaims/)
  assert.match(backfill, /bodyText\.includes\(text\)/)
  assert.match(backfill, /isResolvablePrimaryRecordUrl/)
  assert.match(backfill, /\['court_doc', 'agency_release'\]\.includes\(type\)/)
  assert.match(backfill, /candidateNoPrimaryCitationWithheld/)
  assert.match(backfill, /candidateNoPrimaryUrlWithheld/)
})
