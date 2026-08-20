import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000
const PROMOTION_METHOD = 'deterministic_literal_public_promotion_v1'
const PROMOTION_RULE = 'v2-deterministic-literal-public-claim-promotion'
const COMPARISON_RULE = 'sc-v2-event-projection'
const PROTECTED_SCOPE = /callais|louisiana v\. callais|document 07|redistrict|gerrymander|district map/i

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export async function readAll(client, table, columns, { orderBy = 'id' } = {}) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function verifySurfaceSpan(surface, article) {
  if (surface.auditability_state !== 'verified_retained_source') return true
  const source = article?.[surface.evidence_source_field]
  if (typeof source !== 'string' || !surface.evidence_excerpt) return false
  return source.slice(surface.char_start, surface.char_end) === surface.evidence_excerpt
}

function status(pass, observed, expected, detail = {}) {
  return { status: pass ? 'PASS' : 'FAIL', observed, expected, detail }
}

export function buildClaimAuditabilityPromotionReport({ articles, articleClaims, claims, extractionResults, publicDetails }) {
  const articleById = new Map(articles.map((article) => [article.id, article]))
  const claimById = new Map(claims.map((claim) => [claim.id, claim]))
  const currentSurfaces = articleClaims.filter((surface) => surface.is_current)
  const promoted = currentSurfaces.filter((surface) => surface.extraction_method === PROMOTION_METHOD)
  const verified = currentSurfaces.filter((surface) => surface.auditability_state === 'verified_retained_source')
  const unverified = currentSurfaces.filter((surface) => surface.auditability_state === 'unverified_against_retained_source')
  const badVerified = verified.filter((surface) => !verifySurfaceSpan(surface, articleById.get(surface.article_id)))
  const protectedPromotions = promoted.filter((surface) => {
    const article = articleById.get(surface.article_id)
    return article && PROTECTED_SCOPE.test([article.ingestion_run_id, article.title, article.summary, article.body_text].filter(Boolean).join('\n'))
  })
  const promotedClaimRows = promoted.map((surface) => claimById.get(surface.claim_id)).filter(Boolean)
  const comparisonLeak = promotedClaimRows.filter((claim) => claim.rule_version === COMPARISON_RULE)
  const invalidPromotionRule = promotedClaimRows.filter((claim) => claim.rule_version !== PROMOTION_RULE)
  const deterministicCandidates = extractionResults
    .filter((row) => row.model_id === 'deterministic-literal-v1' && row.state === 'candidate')
    .flatMap((row) => asArray(row.output?.claims).map((claim) => ({ article_id: row.article_id, text: claim?.text })))
    .filter((claim) => typeof claim.text === 'string' && claim.text.length > 0)
  const promotedKeys = new Set(promoted.map((surface) => `${surface.article_id}|${surface.surface_text}`))
  const eligibleCandidates = deterministicCandidates.filter((candidate) => {
    const article = articleById.get(candidate.article_id)
    return article?.source_status === 'active' && !PROTECTED_SCOPE.test([article.ingestion_run_id, article.title, article.summary, article.body_text].filter(Boolean).join('\n'))
  })
  const missingEligible = eligibleCandidates.filter((candidate) => !promotedKeys.has(`${candidate.article_id}|${candidate.text}`))
  const projectedStates = publicDetails
    .flatMap((detail) => asArray(detail.reviewed_claims))
    .reduce((acc, row) => {
      const key = row?.auditability_state ?? 'missing_auditability_state'
      acc.set(key, (acc.get(key) ?? 0) + 1)
      return acc
    }, new Map())
  const projectedClaimCount = [...projectedStates.values()].reduce((total, count) => total + count, 0)

  return {
    checked_at: new Date().toISOString(),
    contract: {
      promoted_claims_are_news_detail_only: true,
      protected_scope_pattern: PROTECTED_SCOPE.source,
      public_projection: 'news_detail_public',
    },
    counts: {
      current_surfaces: currentSurfaces.length,
      verified_retained_source: verified.length,
      unverified_against_retained_source: unverified.length,
      deterministic_candidate_output_rows: deterministicCandidates.length,
      eligible_candidate_output_rows: eligibleCandidates.length,
      deterministic_promoted_surfaces: promoted.length,
      public_projection_claim_rows: projectedClaimCount,
    },
    checks: {
      verified_span_integrity: status(badVerified.length === 0, verified.length - badVerified.length, verified.length, { bad_verified_rows: badVerified.length }),
      unverified_disclosure: status(unverified.length > 0 || currentSurfaces.length === verified.length, unverified.length + verified.length, currentSurfaces.length, { unverified_rows: unverified.length }),
      eligible_literal_promotion: status(missingEligible.length === 0, eligibleCandidates.length - missingEligible.length, eligibleCandidates.length, { missing_eligible_candidate_rows: missingEligible.length }),
      protected_scope_withholding: status(protectedPromotions.length === 0, protectedPromotions.length, 0, { protected_promotion_rows: protectedPromotions.length }),
      source_comparison_isolation: status(comparisonLeak.length === 0 && invalidPromotionRule.length === 0, comparisonLeak.length + invalidPromotionRule.length, 0, { comparison_rule_leaks: comparisonLeak.length, invalid_promotion_rule_rows: invalidPromotionRule.length }),
      public_projection_disclosure: status(projectedClaimCount === currentSurfaces.length && !projectedStates.has('missing_auditability_state'), projectedClaimCount, currentSurfaces.length, { states: Object.fromEntries(projectedStates) }),
    },
  }
}

export async function runClaimAuditabilityPromotionCheck({ client }) {
  const [articles, articleClaims, claims, extractionResults, publicDetails] = await Promise.all([
    readAll(client, 'articles', 'id, ingestion_run_id, source_status, title, summary, body_text'),
    readAll(client, 'article_claims', 'id, claim_id, article_id, surface_text, char_start, char_end, evidence_source_field, evidence_excerpt, auditability_state, auditability_note, extraction_method, is_current'),
    readAll(client, 'claims', 'id, event_id, rule_version'),
    readAll(client, 'article_extraction_results', 'id, article_id, model_id, state, output'),
    readAll(client, 'news_detail_public', 'article_id, reviewed_claims', { orderBy: 'article_id' }),
  ])
  return buildClaimAuditabilityPromotionReport({ articles, articleClaims, claims, extractionResults, publicDetails })
}

async function main() {
  const url = process.env.MIP_V2_SUPABASE_URL
  const key = process.env.MIP_V2_SUPABASE_SERVICE_ROLE_KEY
  const outputPath = process.env.MIP_V2_CLAIM_AUDIT_OUTPUT
  if (!url || !key) {
    throw new Error('Set MIP_V2_SUPABASE_URL and MIP_V2_SUPABASE_SERVICE_ROLE_KEY; no credential is stored in this repository.')
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const report = await runClaimAuditabilityPromotionCheck({ client })
  const output = JSON.stringify(report, null, 2) + '\n'
  if (outputPath) writeFileSync(outputPath, output)
  else process.stdout.write(output)
  if (Object.values(report.checks).some((entry) => entry.status === 'FAIL')) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
