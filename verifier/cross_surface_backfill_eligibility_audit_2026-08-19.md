# Cross-Surface Backfill Eligibility Audit — 2026-08-19

## Scope

This audit evaluates the completed isolated-v2 BigQuery backfill run, `mip-v2-bigquery-redistricting-exclusion-resume-20260819`, for permitted propagation from News into the Knowledge Graph, Causal Timeline, Story Arcs, and Source Comparison. The review applies the owner-approved rule that newly ingested records cannot create a non-News surface record unless the candidate has literal publisher-text grounding, a resolvable primary-evidence URL, no unresolved Callais/redistricting ambiguity, no likely approved-record duplicate, and an explicit approved candidate state.

## Measured backfill state

| Measure | Count |
|---|---:|
| Newly inserted News article records | 10,000 |
| Records with structured article claims | 7,647 |
| Records with one or more citation records | 674 |
| Records with a resolvable `court_doc` or `agency_release` URL | 0 |
| Strict cross-surface eligible records | 0 |
| Backfill records with a story-arc assignment | 0 |
| Backfill records with a recorded event membership | 0 |
| Backfill records with reviewed `article_claims` records | 0 |
| Approved cross-surface candidates from this backfill | 0 |

The one-record difference between the backfill terminal extraction count and the current structured-claim count reflects retained source data, not a successful non-News propagation record.

## Surface-by-surface result

| Surface | New source-supported record created from this backfill | Result |
|---|---|---|
| News | Yes — immutable publisher records, with claims and citation records where retained | Visible in the News corpus and read path |
| Knowledge Graph | No | No approved graph-node or graph-edge candidate exists; no graph assertion created |
| Causal Timeline | No | No approved event/timeline candidate or recorded event membership exists |
| Story Arcs | No | No approved arc-assignment candidate or article arc assignment exists |
| Source Comparison | No | No verified multi-outlet event and source-lineage record exists for an independent-corroboration or comparison assertion |
| Legal & Policy | No | No approved legal/policy candidate exists |
| Geographic placement | No | No approved geography candidate or target place exists |

## Pending-review closure and exclusions

The review ledger was closed with **18 rejected candidates** and **3 explicit owner holds**. The owner holds are Florida redistricting-sensitive geography candidates and have no target identifier. The original deterministic backfill exclusions remain separate: **11 `redistricting_adjacent_hold`**, **0 `callais_canary_hold`**, and **0 `ambiguous_between_categories_hold`** in the completed run.

> No News record was withheld from the News corpus merely because it lacked an eligible cross-surface candidate. The absence of propagation means only that the platform has not established the additional claim, relationship, event, arc, comparison, or geography record needed by another surface.

## Required condition for future propagation

A future run may update a non-News surface only after it produces a candidate with a literal publisher-text span, an attached resolvable primary-evidence URL, an explicit approval decision, and a surface-specific target whose creation does not infer source independence, causality, location precision, or an outcome unsupported by the record. This audit does not authorize relaxing those conditions.
