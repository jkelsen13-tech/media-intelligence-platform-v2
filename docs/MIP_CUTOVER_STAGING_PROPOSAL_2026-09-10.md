# Staged isolated qualification / shadow-canary / cutover / rollback

**Status:** Proposal only. This prompt authorizes **none** of: shadow/canary deployment, credential provisioning, production permission change, schedule change, publication activation, restoration, or final cutover.

## Stage A — Isolated qualification (this packet)

**Where:** Disposable Postgres (PGlite in `npm test`; GitHub Actions native Postgres when `GITHUB_ACTIONS=true` and `MIP_DISPOSABLE_POSTGRES=comparison-qualification`).

**Permissions required:** none on live Supabase projects. No Vault writes, no live GRANT changes, no `service_role` in CI for this schema.

**Evidence obtained here:**

- Generation/job/selection transaction tests.
- Bound RPC grant matrix, revocation, request replay without tokens, publication disabled, membership auto-approve disabled, reader RLS, parity copy-as-pending, authorization diagnosis.
- Concurrent withdrawal vs release on native Postgres (**CI only**; local NOT TESTED).

**Evidence that cannot be obtained here:**

- Live JWT / API gateway behavior.
- Real `auth.sessions` (`not_after`, no `revoked` column).
- Edge Function `verify_jwt` enforcement.
- pg_cron firing.
- Secret rotation of `MIP_PIPELINE_SERVICE_KEY` / `GCP_SA_KEY`.
- Semantic held-out performance under a frozen policy.

**Rollback:** drop the disposable database. Qualification SQL is not installed on any of the four live projects (verified this run).

## Stage B — Proposed tightly bounded shadow / canary (NOT AUTHORIZED)

**Intended bound (for a later owner prompt):**

- Retain copies of Manus comparison operational state onto **private** survivor tables using a `retain_parity`-equivalent path.
- Do **not** acknowledge Manus (`source-comparison-run` stays on Manus; Manus crons stay as they are).
- Do **not** enable survivor pg_cron.
- Do **not** GRANT bound RPCs to live `service_role` or `anon`.
- Do **not** set `publication_release_enabled` or `membership_auto_approval_enabled`.
- Do **not** change Cloud Run.

Live Manus this run (counts only): `source_comparison_enrichment_queue` has 8 `succeeded` rows and no pending; `ingestion_runs` count is 4786. A shadow retain would copy **operational hashes/state**, not payloads, and would not treat succeeded rows as newly acknowledged work.

**Permissions a later owner would have to grant (not granted now):**

- Read-only (or hash-only export) access to Manus queue/history already in private storage.
- Write to new private survivor tables that are not on the public API.
- No publication / no globe / no membership auto-approve.

**Evidence that can only be obtained in a separately authorized live trial:**

- Real JWT + gateway latency and `verify_jwt` mismatch (Manus `import-original-source` v12 `verify_jwt=false`; original `source-comparison-run` v17 and `batch-intake` v14 `verify_jwt=false`).
- Lease timing under actual Edge concurrency.
- Whether `auth.sessions.not_after` can substitute for isolated `revoked_at`.
- Secret-holder inventory after rotation (who still has `MIP_PIPELINE_SERVICE_KEY`).
- Byte compare of live Manus `source-comparison-run` v15 vs repo v16.

**Rollback for Stage B, if later authorized:** drop the private retain tables; leave Manus crons and functions untouched; survivor cron remains absent.

## Stage C — Final operational cutover (NOT AUTHORIZED)

Would require, at minimum, a later owner prompt plus:

- Independent review retained as `MIP_PRODUCTION_CUTOVER_REVIEW_v1` with a non-null outcome written **after** review (currently `PACKET_PREPARED_REVIEW_NOT_PERFORMED`).
- Separate owner acceptance document.
- Frozen evaluation policy and frozen split **before** final semantic eval.
- Explicit permission to change schedules, JWT flags, grants, and publication gates.
- Auth/session reconciliation decision (survivor 2 users / 3 sessions vs original 3 / 4 vs Manus 0).

**Rollback for Stage C:** leave Manus `mip-ingest-rss-hourly` and `mip-source-comparison-enrichment` **active**; do not retire `yhbwnrtlqbjtcrrlpbge` or `niejaejtbxgakyrsntxm`; qualification schema remains uninstalled until a later install is explicitly authorized. This packet does not disable any live cron.

## What each stage is not

A favorable design review of Stage A is **not** production approval.  
Stage B evidence is **not** publication eligibility.  
Stage C is **not** implied by preparing this packet.
