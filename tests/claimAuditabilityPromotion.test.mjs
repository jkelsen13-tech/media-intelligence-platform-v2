import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const newsView = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const readPath = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const auditabilityMigration = readFileSync(
  new URL('../supabase/migrations/20260820_v2_claim_auditability_and_deterministic_promotion.sql', import.meta.url),
  'utf8',
)
const publicProjectionMigration = readFileSync(
  new URL('../supabase/migrations/20260820_v2_public_news_claim_auditability.sql', import.meta.url),
  'utf8',
)
const eventIndependentPromotionMigration = readFileSync(
  new URL('../supabase/migrations/20260820_v2_event_independent_public_claim_promotion.sql', import.meta.url),
  'utf8',
)

test('News visibly distinguishes verified retained-source claims from unverified claim surfaces', () => {
  assert.match(newsView, /Verified against retained/)
  assert.match(newsView, /Unverified against retained source/)
  assert.match(newsView, /news-claim-auditability/)
  assert.match(readPath, /auditability_state: row\.auditability_state/)
  assert.match(readPath, /evidence_source_field: row\.evidence_source_field/)
  assert.match(readPath, /\[\.\.\.reviewedClaims, \.\.\.storedClaims\]/)
})

test('News claim auditability remains projection-only and exposes only rendered source-span fields', () => {
  assert.match(publicProjectionMigration, /security_barrier = true/)
  assert.match(publicProjectionMigration, /security_invoker = false/)
  assert.match(publicProjectionMigration, /'auditability_state', ac\.auditability_state/)
  assert.match(publicProjectionMigration, /'evidence_source_field', ac\.evidence_source_field/)
  assert.match(publicProjectionMigration, /'evidence_excerpt', ac\.evidence_excerpt/)
  assert.doesNotMatch(publicProjectionMigration, /grant select on table public\.article_claims to anon/i)
  assert.doesNotMatch(publicProjectionMigration, /reviewed_by|reviewed_at|pipeline_config/)
})

test('auditability migration requires deterministic retained excerpts and preserves explicit disclosure when no literal span exists', () => {
  assert.match(auditabilityMigration, /auditability_state in \('verified_retained_source', 'unverified_against_retained_source'\)/)
  assert.match(auditabilityMigration, /regexp_instr/)
  assert.match(auditabilityMigration, /regexp_substr/)
  assert.match(auditabilityMigration, /No exact retained publisher excerpt supports this public claim surface\./)
  assert.match(auditabilityMigration, /mip_v2_article_claim_auditability_before_write/)
})

test('deterministic promotion is literal-span-only, event-bounded, and cannot leak into Source Comparison', () => {
  assert.match(auditabilityMigration, /substring\(coalesce\(a\.body_text, ''\) from v_start \+ 1 for v_end - v_start\) = v_surface_text/)
  assert.match(eventIndependentPromotionMigration, /alter column event_id drop not null/)
  assert.match(eventIndependentPromotionMigration, /if coalesce\(v_event_count, 0\) <> 1 then\s+v_event_id := null/)
  assert.match(auditabilityMigration, /deterministic_literal_public_promotion_v1/)
  assert.match(auditabilityMigration, /v2-deterministic-literal-public-claim-promotion/)
  assert.doesNotMatch(auditabilityMigration, /sc-v2-event-projection/)
})

test('deterministic promotion hard-stops Callais, Document 07, and redistricting-adjacent scopes', () => {
  assert.match(auditabilityMigration, /doc07\|callais\|redistrict\|gerrymander\|district/)
  assert.match(auditabilityMigration, /callais\|louisiana v\\\. callais\|document 07\|redistrict\|gerrymander\|district map/)
  assert.match(auditabilityMigration, /never promotes cross-surface candidates/)
  assert.match(eventIndependentPromotionMigration, /no cross-surface candidate is promoted/)
  assert.doesNotMatch(auditabilityMigration, /grant select on table public\.claims to anon/i)
  assert.doesNotMatch(auditabilityMigration, /grant select on table public\.article_claims to anon/i)
})
