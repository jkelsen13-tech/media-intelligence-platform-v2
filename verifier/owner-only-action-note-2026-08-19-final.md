# Owner-Only Action Record — 2026-08-19

## Completed isolated-v2 work

The v2 sandbox now has a provenance-first ingestion schema, approved source catalog, resumable run ledger, checkpoint table, extraction-result table, and a review-gated cross-surface candidate ledger. The implementation is confined to the isolated Supabase project `yhbwnrtlqbjtcrrlpbge` and the isolated BigQuery project `mip-v2-gdelt-bigquery-sandbox`. **No production Supabase writes and no Google Cloud changes to `mop-extraction` were made.**

The worker enforces a maximum manifest size of **10**, deterministic Callais and redistricting-adjacent exclusions that are separately logged, source-level URL deduplication, robots-aware bounded publisher hydration, literal-evidence validation, and a 30% rolling-100 extraction-failure circuit breaker. It does not automatically create graph nodes, graph edges, timeline records, arc memberships, source-comparison events, or geographic placements.

## Completed BigQuery backfill

**Completed run:** `mip-v2-bigquery-redistricting-exclusion-resume-20260819`

| Measured output | Count |
|---|---:|
| Newly inserted immutable article records | 10,000 |
| Structured extraction records retained | 7,648 |
| Hydration skips | 2,352 |
| Pre-existing articles skipped | 1,269 |
| Redistricting-adjacent holds | 11 |
| Callais canary holds | 0 |
| Ambiguous-between-categories holds | 0 |
| Automated cross-surface promotions | 0 |

The completed run respected the ten-item manifest ceiling. Detailed manifest-level success, skip, and failure records remain locally in the gitignored run directory; the concise committed audit summary is `verifier/ingestion_working_notebook.md`.

## Candidate review and propagation outcome

All 21 candidates pending at review start were individually decided and logged in both the isolated database and `verifier/pending_candidate_decision_ledger_2026-08-19.md`.

| Final state | Count | Basis |
|---|---:|---|
| Approved | 0 | No candidate had a machine-resolvable primary-evidence URL, even where a descriptive primary-citation label existed. |
| Rejected | 18 | Failed the required primary-evidence-link gate; one also failed literal publisher-text grounding. |
| Owner hold | 3 | An NPR Florida-primary article directly discusses redistricting and revised congressional maps. It is not Callais, but remains a hard-stop owner review category. |

No likely duplicate of an already approved candidate was found. No Callais match was found. Because no pending candidate passed the approval gate, no self-approved propagation sample existed. The controlled propagation step therefore did **not** relax the no-auto-promotion rule or test unapproved records. No candidate data entered Graph, Timeline, Arcs, Source Comparison, Legal & Policy, or geographic placement surfaces.

A sandbox-only migration, `20260819_candidate_owner_hold_review_state.sql`, adds the explicit `owner_hold` state so hard-stop records remain distinguishable from ordinary pending work and cannot be propagated inadvertently.

## Credential record and required rotation

The GDELT ingestion service account is **`mip-v2-gdelt-ingestion@mip-v2-gdelt-bigquery-sandbox.iam.gserviceaccount.com`**. Its downloaded private key is stored only in the gitignored local credential directory used by the isolated worker. **Rotate or revoke that service-account key before any operator handoff, environment sharing, repository export, or move beyond this clone/test environment.**

The isolated Supabase ingestion writer uses a separate, locally stored one-purpose key. Its plaintext is retained only in the ignored local key file; Supabase stores only its hash. Rotate or deactivate it before host migration or operator change. Neither credential is a production MIP credential.

## Transparent 3D Möbius logo status

A transparent true-3D Möbius asset was not generated because the connected image tooling did not provide a dependable free modeling-and-alpha-export path. The best free production workflow is **Blender**: model or generate the strip, use a transparent film/background, then export a high-resolution PNG or WebP with alpha plus a compressed web derivative. **Spline** is the most accessible browser alternative; its free-tier export and account limits should be verified before relying on it. The final asset should retain an alpha background and avoid any matte, white, blue, or textured canvas.
