# Coordinated eventual live operation — LIVE HOLD

**This paste is not authorization. Do not perform it from this PR.**

This operation is **hosted-database / driver qualification** only. It does
**not** qualify Edge, gateway JWT, cron, Vault, live RSS fetch, or PostgREST.

No hosted SQL, Edge deploy, Vault write, Data API change, cron mutation, YHB
restart, real-data transfer, publication, PR merge, or deletion is in scope
until an owner pastes this block in an authorized session.

Execution SHA: see the commit hash in the fenced quote after it is pinned on
this branch. Until then treat PR #183 HEAD as the candidate.

---

> I authorize one bounded **collector → native capture hosted-database/driver
> qualification** on project `qikvmopbtijoebdqosyq` only, at commit
> `<EXECUTION_SHA>`, cost boundary $0. **LIVE HOLD until I paste this block
> in an authorized session.** This is not Edge, gateway, cron, or live RSS
> qualification.
>
> **Setup**
> 1. Read-only preflight: YHB `mip-ingest-rss-hourly` and
>    `mip-source-comparison-enrichment` are `active=false`; do not change them.
>    NIE hold unchanged. qik `collector-shadow` stays receipt-only. Confirm
>    `evidence_pipeline` / `public.mip_pipeline_v1` already exist. Confirm
>    `qik_ingest`, `qik_ingest_operation`, `mip_cas`, and
>    `mip_cas_source_install` are absent.
> 2. Snapshot **operation-ID** baselines (do not use a 36183 jump check):
>    `count(*)` of `public.articles`, `evidence_pipeline.import_jobs`,
>    `article_captures`, `record_versions` where `record_kind='article'`, and
>    grants on `public.articles`. Confirm zero rows whose `url` or
>    `canonical_url` starts with
>    `https://qualification.invalid/collector-native-capture/<EXECUTION_SHA>/`.
>    Record the current `ingest_forward` watermark and the
>    `collection_enabled`/`enabled` flags of **no** existing source except the
>    synthetic source this run will insert.
> 3. Apply C3 `05_operation_ledger.sql` then `010`–`050` via
>    `installQikIngest.mjs`. Refuse pre-existing package roles/schemas/RPCs.
>    Do **not** apply `fixture_substrate.sql`.
> 4. Apply C4 `00_preflight.sql` → unmodified `001_store.sql` →
>    `05_operation_ledger.sql` via `installCaptureCas.mjs`. Do not load
>    `002_exact_citation.sql`.
> 5. Do not `GRANT` execute to `anon` / `authenticated` / `PUBLIC`. Do not
>    expose `qik_ingest` or `mip_cas` on the Data API. Do not create Vault or
>    Edge secrets. Do not deploy Edge. Do not `cron.schedule`. Do not fetch
>    live RSS.
> 6. Leave `qik_ingest.collection_gate.collection_authorized=false` and
>    `schedule_intent.active=false` until the exercise sentence below.
>
> **Exercise** (separate authorizing sentence required for the gate + one
> synthetic source)
> 1. Insert **one** synthetic source this run owns, then enable only that
>    row after the gate is on:
>    `id = 'c0c1ec70-ca5c-4e11-9f3a-000000000001'`,
>    `feed_url = 'https://qualification.invalid/collector-native-capture/<EXECUTION_SHA>/feed.xml'`,
>    `outlet_name = 'CNC qualification'`, `enabled=true`,
>    `collection_enabled=true`. Do not update any other `ingest_sources` row.
> 2. Driver-run `runQikIngestCollector` with injected synthetic XML (two
>    items) whose URLs are
>    `https://qualification.invalid/collector-native-capture/<EXECUTION_SHA>/water`
>    and `.../second`. `run_id = 'qik-cnc-<EXECUTION_SHA>'` (length ≥ 8).
>    Native handoff must use `mip_qik_ingest_claim_bound` on those enqueued
>    job ids plus existing `mip_pipeline_v1` enqueue/finish. Do **not** call
>    unscoped `mip_pipeline_v1('claim')`.
> 3. Expected native deltas for this operation id (exact; no publication
>    eligibility):
>    - `+2` `public.articles` with those URLs, `reader_state='pending_review'`,
>      `ingestion_run_id='qik-cnc-<EXECUTION_SHA>'`. Pre-existing articles
>      unchanged.
>    - `+2` `evidence_pipeline.import_jobs` (`first_run_id` = that run id,
>      `state='completed'`, `outcome='inserted'`).
>    - `+2` `article_captures` with `review_state='pending'`.
>    - `+2` `record_versions` article `insert` rows for those new ids.
>    - Bind one capture with existing `bindExactCaptureBytes` (SHA-256 of
>      `payload::text` UTF-8).
> 4. Identical re-run of the same XML: `duplicates=2`, `unresolved=0`, no
>    new articles. Changed title at the water URL: `revision_pending`;
>    reviewed title/`reader_state` unchanged; new capture `review_state`
>    stays `pending`.
> 5. `mip_qik_ingest_observe` remains `is_current=false`; fence
>    `articles=36183`, `corpus_transfer=false`; YHB crons still
>    `active=false`.
>
> **Temporary cleanup** (package objects only)
> 1. Turn **this run's** source `collection_enabled=false` and `enabled=false`
>    (that id only). Then set `collection_authorized=false`. Do not
>    fixture-wide `UPDATE ingest_sources`.
> 2. Run C4 `90_cleanup.sql` then C3 `090_cleanup.sql`. Stop on unexpected
>    objects, unapproved external dependents, unrelated privileges, or
>    gate/source still enabled. No `DROP OWNED`. No `DROP FUNCTION CASCADE`.
>    No `CASCADE` on `public`. No `DISABLE TRIGGER`. No drop of
>    `public.articles` or `evidence_pipeline`. Do **not** bypass append-only
>    history guards to erase `record_versions` / captures / jobs.
> 3. Do not undeploy Edge, delete Vault/Edge secrets, or alter YHB/NIE (this
>    run must not have created them). No PR merge. No paid add-on.
>
> **Proposed retained synthetic audit trail** (owner must explicitly approve)
> Package cleanup **leaves** native pipeline rows. Proposed residual, all
> tagged by this operation SHA / run id, none publication-eligible:
> - 2 `public.articles` at the qualification.invalid URLs above
>   (`pending_review`)
> - 2 completed `import_jobs` + receipts + job_events for that run
> - 2 `article_captures` (`review_state='pending'`) and matching
>   `article_identities`
> - 2 article `record_versions` insert rows (plus any `revision_pending`
>   capture from the changed-title check)
> - the disabled synthetic `ingest_sources` row this run inserted
> - `ingest_forward` watermark last_run_id for this run
> Pre-existing articles, grants, and unrelated jobs must remain. Future
> authorization to delete this residual is a **separate** sentence and must
> still not disable history triggers.
>
> Do not perform that operation from this source-ready commit.
