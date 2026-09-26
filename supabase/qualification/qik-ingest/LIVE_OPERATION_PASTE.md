# Coordinated eventual live operation — LIVE HOLD

**LIVE HOLD.** Coordinated collector → native capture **hosted-database/driver**
qualification (bound claim, residual trail) lives in
`supabase/qualification/collector-native-capture/LIVE_OPERATION_PASTE.md`.
This C3 file is package-local. Do not treat it as Edge/cron/live RSS
authorization.

**This paste is not authorization. Do not perform it from this PR.**

No hosted SQL, Edge deploy, Vault write, Data API change, cron mutation, or
article transfer is in scope for Package C3 source-ready.

---

> I authorize one bounded **qik-owned ingest collector enable** on project
> `qikvmopbtijoebdqosyq` only, at commit `<THIS_PR_HEAD>`, cost boundary $0.
> **LIVE HOLD until I paste this block in an authorized session.**
>
> **Setup**
> 1. Read-only preflight: YHB `mip-ingest-rss-hourly` and
>    `mip-source-comparison-enrichment` are `active=false`; do not change them.
>    NIE hold unchanged. qik `collector-shadow` stays receipt-only. Record
>    `count(articles)` on qik and confirm YHB articles fence 36183 without
>    exporting bodies.
> 2. Apply `05_operation_ledger.sql` then `010`–`050` from
>    `supabase/qualification/qik-ingest/` in `INSTALL_ORDER.md` order. Refuse if
>    schema `qik_ingest` / package roles already exist. Do **not** apply
>    `fixture_substrate.sql`. Native retain is observe + existing
>    `mip_pipeline_v1` enqueue/claim/finish; do not insert `public.articles`
>    from C3.
> 3. Do not `GRANT` execute to `anon` / `authenticated` / `PUBLIC`. Do not
>    expose schema `qik_ingest` on the Data API.
> 4. Create Vault secret `mip_qik_ingest_scheduler_token` **only if absent**;
>    never commit the value; never paste it into GitHub. Bind
>    `qik_ingest.runtime_credentials` **or** replace the hash check with
>    `vault.decrypted_secrets` on the owner machine — not in this repository.
>    Create Edge secret `MIP_QIK_INGEST_RUN_KEY` only if absent.
> 5. Deploy Edge slug `qik-ingest-rss` from
>    `supabase/qualification/qik-ingest/edge/` with `verify_jwt=true`. Do not
>    overwrite YHB `ingest-rss` or qik `collector-shadow`. Hash the owner run
>    key and/or scheduler token into `runtime_credentials` (or vault-bind
>    `mip_qik_ingest_schedule_authorized`). Edge accepts owner header
>    `x-mip-qik-ingest-key` **or** scheduler header
>    `x-mip-qik-ingest-scheduler-token`, matching YHB v8.
> 6. Leave `qik_ingest.collection_gate.collection_authorized=false` and
>    `schedule_intent.active=false` until the checks below pass. Do **not**
>    call `cron.schedule` in setup (pg_cron jobs start active).
>
> **Checks**
> 1. `mip_qik_ingest_observe` with a valid token returns `is_current=false`,
>    fence `articles=36183`, `corpus_transfer=false`, schedule `active=false`.
> 2. Gate false: Edge POST returns writer disabled (503) even with the run key.
> 3. After a **separate** sentence authorizing the gate and one test source,
>    one authorized run observes ≥1 item, enqueues native jobs, claim/finish
>    inserts pending_review articles + captures + history. Duplicate POST of
>    the same URL+payload is idle. A changed title at the same URL is
>    `revision_pending` and does not rewrite body/title/`reader_state`.
>    Bind capture bytes with existing `bindExactCaptureBytes` only if C4 is
>    in the same authorized op.
> 4. Induced source failure leaves `failed` or `completed_with_errors`,
>    forward `qik_forward_stale` or inflight, `is_current=false`.
> 5. YHB crons still `active=false`. Operation-ID URL prefix
>    `https://qualification.invalid/...` has the expected article/job/capture
>    deltas; pre-existing articles and grants unchanged. Do not use a 36183
>    jump check.
>
> **Cleanup (failure or completion of this bounded op)**
> 1. If this run turned the gate on, turn it off and set **only the source
>    this run enabled** `collection_enabled=false` before 090. Do not
>    fixture-wide disable every ingest source.
> 2. Run `090_cleanup.sql`. Stop if it refuses (gate still on, source still
>    collection-enabled, unexpected objects, unrelated privileges). No
>    `DROP OWNED`. No schema `CASCADE`.
> 3. Undeploy `qik-ingest-rss` only if this run deployed it. Delete
>    `MIP_QIK_INGEST_RUN_KEY` and `mip_qik_ingest_scheduler_token` only if this
>    run created them.
> 4. No `CASCADE` on `public`. No `DISABLE TRIGGER` on articles. No YHB job
>    delete. No PR #177/#179 merge. No NIE change. No paid add-on.
>
> Do not perform that operation from the C3 source-ready commit.

---

## Pattern notes (documentation only)

YHB invokes Edge via pg_cron + pg_net + a Vault-held token. Recreate that
pattern **on qik** when authorized:

- Jobname `mip-qik-ingest-rss` (do not reuse `mip-ingest-rss-hourly`).
- Header `x-mip-qik-ingest-key` (do not reuse YHB secret material).
- Create the job only in the owner enable paste; immediately keep it inactive
  until the gate and one bounded run are accepted. Prefer inserting
  `cron.job` inactive if the platform supports it; **do not** `cron.schedule`
  then hope to disable before the first tick.

This package's `050_schedule_disabled.sql` stores that intent with a check
constraint `active=false` and does not call pg_cron.
