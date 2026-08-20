# V2 pre-launch Track 1 — Knowledge Graph quality audit

**Scope:** isolated V2 only. Legal/Policy automation was not altered. This is an assessment of graph legibility, connection precision, and automatic extraction quality before Track 1 repairs.

## Findings

| Audit area | Evidence | Result |
|---|---|---|
| Default graph legibility | Live default focused graph rendered 20 of 805 nodes and 22 documented relationships, with category clusters, edge legend, reliability control, expansion, fit, and reset controls. | **Pass.** The default is deliberately bounded; the optional full graph remains a dense exploration mode rather than the starting state. |
| Geographic mode | Live Geography mode was part of the Graph surface, not a detached page. It showed 0 confirmed markers, 0 surfaced candidates, and 20 unlocated nodes with an explicit withholding explanation. | **Pass.** The zero-marker state is truthful and interactive controls remain available. |
| Citation-derived relationships | Sampled 8 citation-derived actor/documentary relationships. Every sampled edge carried a documented source label, reliability 1, and a specific evidence/provenance field. | **Pass: 0/8 false connections observed.** |
| Shared-entity relationships | Sampled 12 shared-entity actor relationships after resolving each source reference through the private mapping ledger. All 12 had a literal canonical entity mention in retained publisher title, summary, or body text. | **Pass: 0/12 false connections observed.** |
| Edge precision sample | Citation and shared-entity samples combined. | **0/20 observed false connections (0%).** This is a precision sample, not a claim of complete graph correctness. |
| Claim grounding sample | Audited 24 deterministic, literal-retained claim surfaces across BBC, Al Jazeera, New York Times, South China Morning Post, Democracy Now!, Guardian, NPR, Times of India, and others. Each selected surface exactly appeared in the retained publisher title, summary, or body field. | **0/24 observed hallucinated or misattributed claims (0%).** |
| Entity extraction sample | The corpus has 3,388 article-entity links; 3,274 (96.6%) have a literal canonical-name mention in retained text. A 20-link non-literal sample showed most are alias/punctuation forms such as `Trump's` → `Trump`, but at least two clear boilerplate artifacts (`CLICK HERE TO START`, `Weather Sign In TOI Today's`) were extracted as entities. | **Systematic normalization/artifact issue.** Canonicalization is too permissive for UI/CTA fragments. |
| Claim retention/gating | Of 865 active public claim surfaces, 578 (66.8%) have an exact match in a retained publisher field; 287 (33.2%) do not. Missing body text accounts for 661 surfaces, but many literal statements survive in summaries. The 287 unmatched cases cannot be classified as hallucinations from current retained fields. | **Material auditability gap.** The system cannot consistently prove literal grounding after ingestion. |
| Structured extraction coverage | 8,862 deterministic candidate results exist and 8,861 have claim arrays, but only 368 of 12,558 articles have current public claim surfaces. Candidate outputs include citations for 751 rows but no cross-surface or location output; only 20 public claim surfaces carry structured loaded-language markers. | **Major propagation/coverage gap, deferred to Track 3.** It is not evidence of invented public claims, but it prevents algorithmic cross-surface coverage. |

## Root causes

The focused graph is readable because it begins in a bounded cluster view. The full graph is expected to be dense but is opt-in. The principal graph bug is not a visual-density failure: all 293 shared-entity actor edges retain `article_id` provenance in edge metadata, yet **none** of those direct identifiers resolve to a V2 article row. Each does resolve through `original_source_import_mappings`, proving an incomplete source-to-target identifier rewrite during original import. This makes in-graph provenance harder to inspect even though the relationship itself can be verified through the private mapping ledger.

The literal-claim gap stems from incomplete retained publisher text and from legacy `existing_claims_jsonb` surfaces that were projected without a durable evidence-span contract. The deterministic candidate pipeline has high claim-output coverage, but its results are still candidate-state material rather than algorithmically propagated public records. This is a Track 3 concern; no review-gated Legal/Policy material was promoted or changed.

## Track 1 outcome

The following V2-only algorithmic repair is justified and will be applied next: update the importer so `edges.metadata.article_id` and `edges.metadata.entity_id` are rewritten through the existing private source-to-target mapping ledger at import time. Existing edges will be backfilled using the same mapping, retaining every original provenance value only inside `metadata.original_source`. This is a traceability correction, not an edge-creation or edge-deletion rule change.

The boilerplate-entity and claim-retention findings require standing pipeline rules rather than one-off manual edits; they remain in scope for the later propagation check. No owner design decision is required for the mapping repair. A product choice would be needed only if the owner wants the full 805-node mode to become the default; the current focused default is legible and does not require that change.

## Applied V2 repair and verification

The importer now rewrites edge-level `article_id` and `entity_id` metadata through the private source-to-target mapping ledger before inserting a new V2 edge. It simultaneously retains the source IDs under `metadata.original_source.edge_metadata_source_ids`. An isolated-V2 migration backfilled the existing imported shared-entity actor edges using the identical rule.

| Post-repair verification | Result |
|---|---:|
| Shared-entity actor edges | 293 |
| Metadata article references resolving to a V2 article | 293 / 293 |
| Metadata entity references resolving to a V2 entity | 266 / 293 |
| Edges retaining original source metadata identifiers | 293 / 293 |

The remaining 27 entity references did not have an entity mapping in the import ledger, so their original value was intentionally retained rather than fabricated. No edge was created, deleted, or reclassified by this repair. The V2 authenticated importer was deployed at version 11 with the same mapping behavior for future imports.
