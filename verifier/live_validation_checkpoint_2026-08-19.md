# Live Validation Checkpoint — 2026-08-19

## Isolated backfill and News read-path checkpoint

During the isolated backfill, the deployed v2 News surface rendered newly ingested publisher records, the enlarged outlet filter, source-record disclosure, literal substantive claims where retained, citation-record sections where retained, and explicit extraction-gap language where a record had no framing marker or byline. These are record-specific disclosure outcomes, not fabricated completeness claims.

The completed isolated BigQuery run inserted 10,000 immutable article records. The application changes prepared for deployment add server-filtered **Last 24 hours**, **Last 7 days**, **Last 30 days**, and custom date-range controls; expanded topic controls; and a transparent source-order control. The default source order is a literal corpus article count. The UI expressly avoids any composite reliability, trust, or vendor-ranking score and does not assert first-to-report or source independence without verified source-lineage records.

## Candidate-review and propagation gate result

The owner-authorized self-approved-sample method was attempted only after the full pending review. **No candidate qualified for self-approval.** The eligibility gate required all of the following: literal publisher-text grounding, a resolvable primary-evidence URL, no likely duplicate of an approved record, and no Callais/redistricting-adjacent ambiguity.

| Final state | Count | Surface effect |
|---|---:|---|
| Approved | 0 | No sample existed; no propagation attempted |
| Rejected | 18 | No target entity or arc assignment created |
| Owner hold | 3 | Redistricting-sensitive only; no target entity or arc assignment created |

A direct isolated-sandbox verification found all 21 reviewed candidates had `target_id = null` and their article records had no arc assignment. The set comprises 20 geography candidates and one graph-node candidate. Therefore, no rejected or owner-held item created a graph node, geographic placement, timeline event, arc membership, source-comparison event, Legal & Policy item, or other live-surface record.

> The absence of a propagation sample is the safe result of the owner’s mandatory evidence gates, not a relaxation of the no-auto-promotion rule. No still-pending candidate was used for display testing.

## Graph and timeline baseline during backfill

The pre-deployment live checkpoint retained **47 total nodes**, a focused view of **15 nodes with 14 documented relationships**, and **4 visible confirmed city-level geographic points**. The privacy-safe Epstein process arc retained the existing process-only treatment. No new article was automatically promoted to graph, timeline, arc, source-comparison, legal/policy, or geography surfaces during the backfill.

## Completed live deployment validation

GitHub Pages successfully deployed commits `09a23a6`, `c0c4947`, `78feae8`, and `6f08660`. The desktop News surface rendered a **12,558-article** live corpus with working date, publisher-country, evidence, and topic controls. The source list now shows separate literal fields: **V** for current-filter article volume, **F** for a unique earliest publisher timestamp in a recorded multi-outlet event, and **C** as unavailable pending verified source lineage. No composite vendor, trust, reliability, or independence score is displayed or calculated.

A target **390 × 844** mobile render of the deployed `6f08660` build confirmed that the filters, source-field definitions, source-order selector, and disclosure text wrap within the viewport without horizontal page overflow. The screenshots are retained locally under `verifier/live_validation/` and are intentionally not committed as build artifacts.

The final desktop cross-surface pass confirmed the following visible baseline: Knowledge Graph retained **47 total nodes**, a focused view of **15 nodes and 14 documented relationships**, and **4 confirmed city-level points**; the Causal Timeline showed only its documented arc/event records; Story Arcs kept arc age in Overview and article sources in Evidence; Source Comparison retained explicit one-outlet and unverified-lineage disclosures; and Legal & Policy retained source-linked Project 2025 and process-only Epstein records with stated uncertainty. No newly backfilled record was propagated to any non-News surface because the strict eligibility count remained zero.
