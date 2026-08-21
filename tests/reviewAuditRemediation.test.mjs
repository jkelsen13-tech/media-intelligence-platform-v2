import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { badgeState } from '../src/lib/epistemicModel.js'

const newsMigration = readFileSync(new URL('../supabase/migrations/20260821_v2_news_feed_intake_gate.sql', import.meta.url), 'utf8')
const collectionMigration = readFileSync(new URL('../supabase/migrations/20260821_v2_story_container_display_kind.sql', import.meta.url), 'utf8')
const graphMigration = readFileSync(new URL('../supabase/migrations/20260821_v2_public_graph_coverage_projection.sql', import.meta.url), 'utf8')
const comparisonMigration = readFileSync(new URL('../supabase/migrations/20260821_v2_source_comparison_membership_gate.sql', import.meta.url), 'utf8')
const membershipMutationGuard = readFileSync(new URL('../supabase/migrations/20260821_v2_source_comparison_membership_mutation_guard.sql', import.meta.url), 'utf8')
const readPath = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const arcsView = readFileSync(new URL('../src/views/ArcsView.jsx', import.meta.url), 'utf8')
const graphCoverage = readFileSync(new URL('../src/graph/GraphCoverageNotice.jsx', import.meta.url), 'utf8')
const comparisonView = readFileSync(new URL('../src/views/SourceComparisonView.jsx', import.meta.url), 'utf8')
const comparisonProjection = readFileSync(new URL('../supabase/functions/source-comparison-run/index.ts', import.meta.url), 'utf8')

test('P0 comparison projection and public view default-deny unreviewed event membership', () => {
  assert.match(comparisonMigration, /comparison_validation_state in \('pending_review', 'approved', 'quarantined', 'not_applicable'\)/)
  assert.match(comparisonMigration, /e\.comparison_validation_state = 'approved'/)
  assert.match(comparisonProjection, /comparison_validation_state/)
  assert.match(comparisonProjection, /\.eq\('comparison_validation_state', 'approved'\)/)
  assert.match(comparisonView, /Candidate event clusters are withheld/)
  assert.match(membershipMutationGuard, /after insert or delete or update of event_id on public\.event_articles/)
  assert.match(membershipMutationGuard, /comparison_validation_state = 'pending_review'/)
})

test('P1 News Feed intake gate preserves review states and filters reader data to eligible records', () => {
  assert.match(newsMigration, /reader_state in \('eligible', 'pending_review', 'withheld'\)/)
  assert.match(newsMigration, /'malformed_title'/)
  assert.match(newsMigration, /'unavailable_page'/)
  assert.match(newsMigration, /'canonical_url_duplicate'/)
  assert.match(newsMigration, /'promotional_material'/)
  assert.match(newsMigration, /'off_mission'/)
  assert.match(readPath, /query = query\.eq\('reader_state', 'eligible'\)/)
  assert.match(readPath, /\.eq\('reader_state', 'eligible'\)/)
})

test('P1 research collection taxonomy changes display semantics without rewriting storage joins', () => {
  assert.match(collectionMigration, /display_kind in \('story_arc', 'research_collection'\)/)
  assert.match(collectionMigration, /february-2026-source-mapped-policy-watch/)
  assert.match(arcsView, /Research collection/)
  assert.match(arcsView, /separate topics/)
  assert.match(arcsView, /display_kind === 'research_collection'/)
})

test('P1 graph coverage names measurable stored states and avoids a completeness score', () => {
  assert.match(graphMigration, /articles_with_published_node/)
  assert.match(graphMigration, /pending_graph_candidate_count/)
  assert.match(graphMigration, /documented_relationship_count/)
  assert.match(graphCoverage, /These are stored resolution and review counts, not a completeness score/)
  assert.match(graphCoverage, /Graph candidates pending review/)
  assert.match(readPath, /export async function loadGraphCoverage/)
})

test('P2 evidence badge uses bounded documented-record language', () => {
  assert.equal(badgeState('confirmed')?.label, 'Documented record')
  assert.equal(badgeState('inferred')?.label, 'Inferred')
})
