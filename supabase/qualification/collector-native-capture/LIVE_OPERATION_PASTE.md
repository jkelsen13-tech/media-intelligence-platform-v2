# Coordinated eventual live operation — LIVE HOLD

**This paste is not authorization. Do not perform it from this PR.**

No hosted SQL, Edge deploy, Vault write, Data API change, cron mutation, YHB
restart, real-data transfer, publication, PR merge, or deletion is in scope.

---

> I authorize one bounded **collector → native capture qualification** on
> project `qikvmopbtijoebdqosyq` only, at commit `<THIS_PR_HEAD>`, cost
> boundary $0. **LIVE HOLD until I paste this block in an authorized session.**
>
> **Setup**
> 1. Read-only preflight: YHB `mip-ingest-rss-hourly` and
>    `mip-source-comparison-enrichment` are `active=false`; do not change them.
>    NIE hold unchanged. qik `collector-shadow` stays receipt-only. Confirm
>    `evidence_pipeline` / `public.mip_pipeline_v1` already exist. Record
>    `count(articles)` on qik and confirm YHB articles fence 36183 without
>    exporting bodies. Confirm `qik_ingest`, `qik_ingest_operation`, `mip_cas`,
>    and `mip_cas_source_install` are absent.
> 2. Apply C3 `05_operation_ledger.sql` then `010`–`050` via
>    `installQikIngest.mjs`. Refuse pre-existing package roles/schemas/RPCs.
>    Do **not** apply `fixture_substrate.sql`.
> 3. Apply C4 `00_preflight.sql` → unmodified `001_store.sql` →
>    `05_operation_ledger.sql` via `installCaptureCas.mjs`. Do not load
>    `002_exact_citation.sql`.
> 4. Do not `GRANT` execute to `anon` / `authenticated` / `PUBLIC`. Do not
>    expose `qik_ingest` or `mip_cas` on the Data API. Do not create Vault or
>    Edge secrets in this setup step.
> 5. Leave `qik_ingest.collection_gate.collection_authorized=false` and
>    `schedule_intent.active=false`. Do **not** call `cron.schedule`, deploy
>    Edge, enable sources, or write real article payloads.
>
> **Checks**
> 1. `mip_qik_ingest_observe` with a later owner-bound token returns
>    `is_current=false`, fence `articles=36183`, `corpus_transfer=false`,
>    schedule `active=false`.
> 2. Gate false: writer remains 503. `collection_enabled` cannot flip.
> 3. After a **separate** sentence authorizing the gate, one test source, and
>    native `mip_pipeline_v1` enqueue/claim/finish: observed items hand off to
>    import jobs + captures + `record_versions`; `reader_state` stays
>    `pending_review`; identical URL+payload is idle; a changed title at the
>    same URL is `revision_pending` and does not rewrite the reviewed row or
>    inherit eligibility. Bind capture bytes with existing
>    `bindExactCaptureBytes` (SHA-256 of `payload::text` UTF-8).
> 4. Induced source failure leaves `failed` or `completed_with_errors` and
>    `is_current=false`.
> 5. YHB crons still `active=false`. qik article count did not jump by 36183.
>
> **Cleanup on failure or completion**
> 1. If the gate was turned on, turn it off and set sources
>    `collection_enabled=false` before C3 `090`.
> 2. Run C4 `90_cleanup.sql` then C3 `090_cleanup.sql` (ledger-bound). Stop on
>    unexpected objects, unapproved external dependents, unrelated privileges,
>    or gate/source still enabled. No `DROP OWNED`. No `DROP FUNCTION CASCADE`.
>    No `CASCADE` on `public`. No `DISABLE TRIGGER`. No drop of
>    `public.articles` or `evidence_pipeline`.
> 3. Undeploy `qik-ingest-rss` only if this run deployed it. Delete
>    `MIP_QIK_INGEST_RUN_KEY` and `mip_qik_ingest_scheduler_token` only if this
>    run created them.
> 4. No YHB job delete. No PR #177/#179 merge. No NIE change. No paid add-on.
>
> Do not perform that operation from this source-ready commit.
