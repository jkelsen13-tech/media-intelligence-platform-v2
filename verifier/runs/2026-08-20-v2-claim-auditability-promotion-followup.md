# V2 Claim Auditability and Structured-Claim Promotion Follow-up

**Scope:** isolated V2 sandbox `yhbwnrtlqbjtcrrlpbge` and the V2 public application only. **V1 was not queried or changed.** No Legal/Policy page, Document 07, Callais, or redistricting-adjacent record was changed. This follow-up diagnoses the two retained claim issues, applies the permitted V2 repair, and records the post-repair database and public-read contract checks.

## Outcome by requested item

| Item | Result | Evidence |
|---|---|---|
| **1. Claim auditability** | **Repaired with explicit disclosure.** Every current public claim surface now has either a verified retained-source span or a visible `unverified_against_retained_source` state. | 2,394 verified spans; 19 explicit unverified disclosures; 2,394/2,394 verified spans exactly matched the declared retained source substring. |
| **2. Claim promotion** | **Repaired as a standing, event-independent V2 process.** Literal deterministic candidates promote automatically to News-detail claim records when active and outside every protected scope. | 1,548 unique public surfaces across 1,213 articles were promoted; the automatic extraction-result trigger is present; no Source Comparison rule was added or changed. |

## Item 1 — auditability diagnosis and repair

The original audit found 865 current public claim surfaces. Of those, 578 had a direct raw-text match in V2-retained title, summary, or body text. Another 268 were not raw-byte matches but did have an unambiguous retained literal after punctuation and whitespace normalization; 264 resolved to titles and 4 to summaries. The remaining 19 had no literal retained excerpt: 15 had retained text but no literal match, while 4 came from legacy claim JSON without retained source text.

> **Diagnosis:** the public surface stored claim wording but did not persist a durable source-field/span/excerpt contract. A UI reader therefore could not distinguish a verified literal surface from a legacy or otherwise unmatched surface.

The repair adds `auditability_state`, `evidence_source_field`, `evidence_excerpt`, and `auditability_note` to `article_claims`. A V2-only before-write trigger recomputes this metadata deterministically from the stored publisher title, summary, or body text. It accepts a normalized match only when database regex matching resolves an actual retained excerpt; it uses no semantic similarity or generated paraphrase. Records without an exact excerpt remain public but receive an explicit unverified state and note.

The `news_detail_public` security-barrier projection now exposes only the fields rendered by News: the existing surface/canonical text and evidence URLs, plus auditability state, source field, source excerpt, and note. The expanded News UI visibly renders either **“Verified against retained [field] text”** or **“Unverified against retained source”**. Anonymous reads of `article_claims`, `claims`, `article_extraction_results`, and `claim_evidence_links` remain denied.

| Post-repair auditability state | Claim surfaces | Detail |
|---|---:|---|
| Verified retained source | 2,394 | 1,538 body-text spans, 564 summary spans, and 292 title spans; all exact at stored offsets. |
| Explicitly unverified retained source | 19 | 8 manual curated-report, 5 manual primary-source, 4 legacy JSON, and 2 manual surfaces. |
| Current public claim surfaces | 2,413 | All projected through `news_detail_public` with an explicit auditability state. |

## Item 2 — promotion diagnosis and repair

The original full-corpus census found 8,862 deterministic extraction results containing 12,719 candidate claim-output rows, yet none had a public `article_claims` surface. This was not a literal-evidence failure: every candidate in the initially permitted subset had an exact body span, active article status, and a recorded event link. The cause was a missing conversion step between `article_extraction_results.output.claims` and current public News-detail claim records.

> **Diagnosis:** the writer persisted bounded deterministic candidates and article-level legacy JSON, but no V2 writer stage materialized those already validated literal claims as public News-detail claim rows.

The V2 repair introduces a database promotion function and an `after insert` trigger on `article_extraction_results`. It runs on the same transaction cadence as deterministic extraction storage. The promoter requires a candidate-state `deterministic-literal-v1` result, active source status, a valid exact body span, and an explicit non-protected scope. It does not inspect or alter `cross_surface_candidates`; it cannot create graph edges, events, arcs, timelines, geography, Legal/Policy rows, or Source Comparison groups.

A follow-up schema correction makes `claims.event_id` optional for this V2 News-detail claim type. Event linkage is preserved where exactly one event already exists, but it no longer blocks a literal News claim when no event exists. No event is fabricated. `comparison_public` continues to show only `sc-v2-event-projection` claim groups, so non-event News claims do not appear in Source Comparison.

| Promotion accounting | Result |
|---|---:|
| Deterministic candidate output rows reviewed | 12,719 |
| Promoted output rows | 1,558 |
| Unique promoted article/text surfaces | 1,548 |
| Articles with one or more promoted surfaces | 1,213 |
| Duplicate candidate output rows collapsed deterministically | 10 |
| Candidate rows withheld by protected-scope rule | 11,161 |
| Protected-scope promotions | 0 |
| Source Comparison claim-group rule changes | 0 |

The 11,161 withheld output rows are not an unaddressed conversion stall. They fall under the hard protected-scope predicate, including the excluded redistricting-run population and 22 direct protected-content candidate rows. The redistricting record identified during the precheck remained untouched; no owner-ambiguous scope was auto-promoted.

## Repeatable verification and retained diff

The new `npm run verify:claims` command runs a service-role **read-only** verifier outside the repository credential boundary. It checks literal source spans, visible auditability states, eligible deterministic-promotion coverage, protected-scope withholding, Source Comparison rule isolation, and parity between current public claim surfaces and the narrow News projection. Any failure exits non-zero. The project’s regression suite includes deterministic fixtures for passing, bad-span, protected-scope, and missing-projection-state cases.

| Retained V2 artifact | Change |
|---|---|
| `20260820_v2_claim_auditability_and_deterministic_promotion.sql` | Adds auditability fields, deterministic span trigger, literal promoter, protected-scope predicate, promotion trigger, and idempotent backfill. |
| `20260820_v2_event_independent_public_claim_promotion.sql` | Makes only News-detail promotion event-independent; does not create events or change comparison eligibility. |
| `20260820_v2_public_news_claim_auditability.sql` | Extends the security-barrier `news_detail_public` contract with only rendered auditability fields. |
| `src/lib/supabase.js`, `src/views/NewsView.jsx`, `src/styles/news.css` | Preserves projection metadata, gives audited records precedence over legacy JSON duplicates, and renders visible verified/unverified disclosures. |
| `verifier/runV2ClaimAuditabilityPromotion.mjs` | Standing read-only V2 verification entry point. |

The complete suite passed **470 tests** and the production build completed successfully before deployment. Post-deployment live UI validation is recorded below after the GitHub Pages workflow completes.

## References

[1]: `../CLAIM_AUDITABILITY_PROMOTION_CHECK.md` "Standing V2 claim-auditability and promotion verifier"
[2]: `2026-08-20-v2-claim-followup-working-evidence.md` "Raw V2-only census and exclusion evidence"

## Live deployment validation — verified sample

GitHub Pages deployment for commit `64a38c4` completed successfully. On the deployed News page, searching **“Mathilde Favier”** returned the selected promoted record. Expanding it rendered the source-bounded claim and the visible label **“Verified against retained title text.”** The record retained its publisher source URL and did not show fabricated linked-evidence metadata.

## Live deployment validation — unverified sample

On the same deployed News page, searching **“As Trump reshapes foreign policy”** returned the selected non-protected legacy record. Its expanded detail rendered the legacy surface with the visible label **“Unverified against retained source — No exact retained publisher excerpt supports this public claim surface.”** It continued to show the publisher URL and source-mapping context, without relabeling the manual metadata as verified publisher prose.
