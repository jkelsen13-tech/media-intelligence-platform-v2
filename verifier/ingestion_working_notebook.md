# Isolated V2 Ingestion Working Notebook

This commit-safe notebook records the material run outcomes and safeguard decisions for the v2 sandbox. Per-manifest event logs, failed hydration details, and raw retry records remain in the local, gitignored `verifier/ingestion_runs/` directory. No log in this repository contains credentials.

## Isolation and scope

| Control | Recorded state |
|---|---|
| Supabase write target | Isolated v2 sandbox only: `yhbwnrtlqbjtcrrlpbge` |
| Production Supabase | Not used for writes |
| Discovery path | GDELT BigQuery public data through the isolated GCP project only |
| Per-manifest ceiling | Enforced at 10 articles or fewer |
| Existing article records | Immutable; duplicates were skipped |
| Cross-surface effect | All generated candidates began in `pending`; no automatic propagation occurred |
| Exclusion logging | Callais and redistricting-adjacent exclusions recorded separately |

## Feasibility and preflight record

The isolated BigQuery feasibility checks confirmed the GDELT public BigQuery dataset exposed publisher URL, outlet/source metadata, and timestamps required by the discovery workflow. The run used BigQuery only to discover original publisher URLs and scope-screening context. It did not treat GDELT metadata as publisher prose, citation evidence, or a cross-surface promotion signal.

| Validation item | Result |
|---|---|
| GDELT BigQuery discovery source | Registered in the isolated v2 sandbox |
| Batch ceiling | Contract-tested and enforced at 10 |
| Literal-span extraction | Contract-tested |
| Callais exclusion | Contract-tested as an independent `callais_canary_hold` category |
| Redistricting exclusion | Contract-tested as an independent `redistricting_adjacent_hold` category |
| Ambiguous overlap | Contract-tested for `ambiguous_between_categories_hold` handling |
| Rolling failure circuit breaker | Implemented at 30% of a rolling 100-result window |

## Completed BigQuery backfill

**Run ID:** `mip-v2-bigquery-redistricting-exclusion-resume-20260819`

| Outcome | Count |
|---|---:|
| Inserted immutable article records | 10,000 |
| Extracted structured records | 7,648 |
| Hydration skips | 2,352 |
| Pre-existing articles skipped | 1,269 |
| Redistricting-adjacent holds | 11 |
| Callais canary holds | 0 |
| Ambiguous-between-categories holds | 0 |
| Automatic candidate promotions | 0 |

The 10,000 inserted article records were written in a pending-review posture for any extracted cross-surface candidate. Hydration skips and discovery duplicates were logged in the detailed local run records. The completed run did not trigger the 30% rolling extraction-failure circuit breaker.

## Candidate review closure

The subsequent controlled review found 21 pending cross-surface candidates: 20 `geography_mention` candidates and one `graph_node` candidate. All records were reviewed individually under the owner-authorized requirement for literal publisher-text grounding and a resolvable primary-evidence link. The full per-candidate ledger is committed as `verifier/pending_candidate_decision_ledger_2026-08-19.md`.

| Final review state | Count | Effect |
|---|---:|---|
| `approved` | 0 | No candidate qualified for propagation |
| `rejected` | 18 | Explicitly closed; no propagation |
| `owner_hold` | 3 | Florida redistricting-sensitive records retained for owner review only |

The three `owner_hold` records are not Callais. They remain an explicit hard stop because their article directly discusses redistricting and revised congressional maps. The `owner_hold` state was added only to the isolated sandbox review ledger and does not propagate a node, edge, timeline event, arc assignment, source-comparison event, or geographic placement.

## Reproducibility

The implementation and audit materials committed with this notebook are:

| Artifact | Purpose |
|---|---|
| `verifier/ingestion_pipeline.py` | Resumable BigQuery-backed discovery, bounded hydration, literal extraction, exclusions, and authenticated isolated writer |
| `verifier/test_ingestion_pipeline.py` | Contract tests for key ingestion and independent-exclusion behavior |
| `verifier/doc07_canary_exclusions.json` | Versioned Callais-only canary configuration |
| `verifier/redistricting_adjacent_exclusions.json` | Versioned redistricting-adjacent configuration |
| `supabase/migrations/20260819_gdelt_bigquery_discovery_source.sql` | Discovery-source registration |
| `supabase/migrations/20260819_candidate_owner_hold_review_state.sql` | Explicit hard-stop review state for owner-held records |
| `verifier/pending_candidate_decision_ledger_2026-08-19.md` | Complete individual candidate decisions and recorded reasons |
