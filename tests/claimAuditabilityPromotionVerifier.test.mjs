import assert from 'node:assert/strict'
import test from 'node:test'
import { buildClaimAuditabilityPromotionReport } from '../verifier/runV2ClaimAuditabilityPromotion.mjs'

function fixture({ protectedArticle = false, badSpan = false, missingProjectionState = false } = {}) {
  const article = {
    id: 'article-1',
    ingestion_run_id: protectedArticle ? 'mip-v2-redistricting-exclusion' : 'mip-v2-safe-run',
    source_status: 'active',
    title: 'Stored title',
    summary: 'Stored summary',
    body_text: 'Literal publisher sentence for a public claim.',
  }
  const surface = {
    id: 'surface-1',
    claim_id: 'claim-1',
    article_id: article.id,
    surface_text: 'Literal publisher sentence for a public claim.',
    char_start: badSpan ? 1 : 0,
    char_end: badSpan ? 10 : article.body_text.length,
    evidence_source_field: 'body_text',
    evidence_excerpt: 'Literal publisher sentence for a public claim.',
    auditability_state: 'verified_retained_source',
    auditability_note: null,
    extraction_method: 'deterministic_literal_public_promotion_v1',
    is_current: true,
  }
  return {
    articles: [article],
    articleClaims: [surface],
    claims: [{ id: 'claim-1', event_id: null, rule_version: 'v2-deterministic-literal-public-claim-promotion' }],
    extractionResults: [{
      id: 'extract-1',
      article_id: article.id,
      model_id: 'deterministic-literal-v1',
      state: 'candidate',
      output: { claims: [{ text: surface.surface_text }] },
    }],
    publicDetails: [{
      article_id: article.id,
      reviewed_claims: [{
        surface_text: surface.surface_text,
        auditability_state: missingProjectionState ? null : 'verified_retained_source',
      }],
    }],
  }
}

test('standing claim verifier passes a literal, safe News-only promotion with public auditability state', () => {
  const report = buildClaimAuditabilityPromotionReport(fixture())
  assert.equal(report.checks.verified_span_integrity.status, 'PASS')
  assert.equal(report.checks.eligible_literal_promotion.status, 'PASS')
  assert.equal(report.checks.protected_scope_withholding.status, 'PASS')
  assert.equal(report.checks.source_comparison_isolation.status, 'PASS')
  assert.equal(report.checks.public_projection_disclosure.status, 'PASS')
})

test('standing claim verifier fails an incorrect retained-source span', () => {
  const report = buildClaimAuditabilityPromotionReport(fixture({ badSpan: true }))
  assert.equal(report.checks.verified_span_integrity.status, 'FAIL')
})

test('standing claim verifier fails a protected-scope promotion and a missing projection state', () => {
  const report = buildClaimAuditabilityPromotionReport(fixture({ protectedArticle: true, missingProjectionState: true }))
  assert.equal(report.checks.protected_scope_withholding.status, 'FAIL')
  assert.equal(report.checks.eligible_literal_promotion.status, 'PASS')
  assert.equal(report.checks.public_projection_disclosure.status, 'FAIL')
})
