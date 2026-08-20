# V2 claim follow-up — retained working evidence

**Target:** isolated V2 sandbox `yhbwnrtlqbjtcrrlpbge`. All figures below come from read-only V2 census queries except the documented V2-only migrations already applied. No V1, Legal/Policy, Document 07, Callais, or redistricting-adjacent record was changed.

## Baseline

| Measure | Result |
|---|---:|
| Current public article claim surfaces | 865 |
| Exact raw match in stored title/summary/body | 578 |
| Normalization/punctuation-only retained match | 268 |
| Legacy claim JSON without a literal retained match | 4 |
| Retained text present but no literal match | 15 |
| Deterministic extraction results | 8,862 candidate rows |
| Deterministic candidate claim output rows | 12,719 |
| Deterministic candidate claims with a public surface before repair | 0 |

All 268 normalization-only matches resolve through a strict, unambiguous regex to a stored publisher excerpt: 264 title excerpts and 4 summary excerpts. The existing 865 public claim surfaces had no Callais, Document 07, or redistricting-adjacent match.

## Scope precheck

The deterministic backlog contained 11,159 candidate claims from the explicitly excluded redistricting batch. A further 22 candidate rows matched protected-scope content directly, including two candidates for a Galveston County redistricting record. Those candidates remain excluded from all promotion work.

The permitted source runs contained 1,560 candidate output rows. The automatic backfill promoted 1,558 candidate output rows, representing 1,548 unique article/text public surfaces across 1,213 articles. Ten pairs of duplicate candidate output rows collapsed to one current public surface by the deterministic dedupe contract.

## Post-repair verification

| Measure | Result |
|---|---:|
| Current public claim surfaces | 2,413 |
| Verified against retained source | 2,394 |
| Explicitly unverified against retained source | 19 |
| Verified source-span integrity | 2,394 / 2,394 exact retained excerpts |
| Verified excerpts in body text | 1,538 |
| Verified excerpts in summaries | 564 |
| Verified excerpts in titles | 292 |
| Promoted deterministic public surfaces | 1,548 |
| Protected-scope deterministic promotions | 0 |
| News projection claim states | 2,394 verified; 19 unverified |
| Promotion trigger | Present on `article_extraction_results` |
| Anonymous SELECT on `article_claims`, `claims`, `article_extraction_results`, `claim_evidence_links` | false for all four |

The remaining 11,161 deterministic output rows are intentionally excluded by the existing hard protected-scope rule; they are not an unaddressed pipeline stall. The deployed promotion function requires active source status, one event relationship, an exact body span, and a non-protected scope. It never reads or promotes cross-surface candidates and does not use the Source Comparison rule version.
