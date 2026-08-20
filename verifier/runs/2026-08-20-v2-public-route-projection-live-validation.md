# V2 public-route projection batch — live validation

**Deployment:** `eb700eb`  
**Date:** 2026-08-20  
**Scope:** the post-revocation compatibility projections and reader migrations.

## Initial live result

A fresh anonymous reload of the public V2 application succeeded after the batch deployment. The News feed rendered **12,558 articles**, including the expected public filters, outlet list, and initial page of article cards. The previously observed `authors` and `article_claims` permission errors did not occur during this full-feed load.

| Surface | Initial result | Next validation |
|---|---|---|
| News feed | Pass — 12,558 article corpus loaded | Open a card and inspect claims/evidence and comparison-link behavior. |
| Story Arcs | Pending | Verify list and detail use the narrow milestone projection. |
| Causal Timeline | Pending | Verify normal flat route and the withheld grouped enhancement behavior. |
| Source Comparison | Pending | Recheck a populated card through `comparison_public`. |
| Knowledge Graph | Pending | Confirm baseline graph still loads with optional withheld enhancements absent. |

No base-table grant was restored during this deployment.

The live DOM contains the expected `news-card-trigger` controls for the loaded article cards. The first cards include the current corpus headlines, confirming that the route rendered interactive article controls rather than only static feed text.

A live first-card expansion was triggered after the feed loaded. The viewport was occupied by the expanded outlet filter list, so the next check will inspect the rendered detail panel directly before drawing a result.

## Live surface checks completed

| Surface | Result | Observed public behavior |
|---|---|---|
| Expanded News card | Pass | The selected article rendered substantive reviewed claims, its publisher-source record, and an honest no-linked-evidence disclosure. The page contained no `permission denied` text. |
| Story Arcs list and default detail | Pass | The list rendered populated arcs and a selected detail rendered status, coverage, lifecycle, attached-record chronology, and the truthful `No milestones tracked yet` state. The new milestone projection did not produce a base-table error. |
| Causal Timeline | Pass | The default arc-scoped timeline loaded with 13 ordered records, sequence-only labels, filters, and Timeline/Connections/Evidence controls. The optional grouped-timeline control remained absent, matching the intentional fail-closed behavior of its unreadable operational flag; no placeholder, retry, or misleading value appeared. |
| Source Comparison | Pass | A populated four-outlet card loaded with 20 extracted claims, timing, per-outlet framing, article links, explanation disclosures, and the awaiting-review state. The page rendered through `comparison_public` without a direct base-table permission error. |
| Knowledge Graph | Pass | The graph loaded 805 nodes and 22 documented relationships in its focused view. Geography mode opened as an integrated Graph mode, with reset/return controls and an explicit zero-marker state: 0 confirmed locations, 0 automated candidates surfaced, and 20 nodes withheld rather than geocoded from inference. |
