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

## Follow-up validation on deployment

After the v2 commit is deployed, the live GitHub Pages site will be checked on desktop and mobile against the permitted reference set for the new News date, topic, and source-order controls. Cross-surface validation will explicitly confirm that the no-propagation result is preserved and that only the existing confirmed records render beyond the News corpus.
