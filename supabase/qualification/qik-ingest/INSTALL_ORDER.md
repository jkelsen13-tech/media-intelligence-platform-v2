# Eventual qik apply order (NOT executed by this package)

**LIVE HOLD.** Do not run these steps against `qikvmopbtijoebdqosyq`,
`yhbwnrtlqbjtcrrlpbge`, `niejaejtbxgakyrsntxm`, or any other hosted project
from this PR.

## 0. Preflight (read-only)

1. Confirm HEAD of this package on the consolidation branch / this PR.
2. Confirm YHB `mip-ingest-rss-hourly` and `mip-source-comparison-enrichment`
   remain `active=false`. Do not alter them.
3. Confirm qik has no `cron.job` for `mip-qik-ingest-rss`.
4. Confirm qik `collector-shadow` is still receipt-only.
5. Record qik `count(public.articles)` and the YHB fence **36183** without
   exporting article bodies.
6. Confirm schema `qik_ingest` / `qik_ingest_operation` and roles
   `qik_ingest_fn_owner` / `qik_ingest_runtime` are absent. Refuse replay.
7. Confirm `evidence_pipeline` / `public.mip_pipeline_v1` already exist on qik
   (native handoff). This package does not install a second pipeline.

## 1. Files (this package)

Apply in one transaction, in this order, from
`supabase/qualification/qik-ingest/`:

1. `05_operation_ledger.sql` — refuse leftovers; snapshot baseline.
2. `010_collection_gate.sql` — roles, gate **false**, token table **empty**.
3. `020_run_ledger.sql` — begin / finish / recover / observe RPCs.
4. `030_retain_upsert.sql` — discovery `observed_items`; no `public.articles` insert.
5. `040_watermarks.sql` — write the YHB pause fence and idle qik forward cursor.
6. `050_schedule_disabled.sql` — schedule **intent** with `active=false` only.

Never apply `fixture_substrate.sql` on a hosted project.

## 2. Still live-gated after a later authorized apply of 010–050

These are **not** performed by applying 010–050:

- Inserting a Vault secret or any `runtime_credentials` row.
- `collection_authorized = true`.
- `ingest_sources.enabled` / `collection_enabled` flips.
- Edge deploy of `qik-ingest-rss`.
- Setting `MIP_QIK_INGEST_RUN_KEY`.
- `CREATE EXTENSION pg_cron` / `cron.schedule` / `cron.alter_job`.
- Exposing `qik_ingest` on the Data API.
- Transferring YHB articles.

## 3. Owner enable (separate paste only)

See `LIVE_OPERATION_PASTE.md`. Enable is a later decision. Default remains
disabled. `cron.schedule` is omitted from 010–050 because pg_cron creates
**active** jobs; a disabled intent row is the source-ready schedule.

## 4. Cleanup

`090_cleanup.sql` drops **only ledgered package objects** (no `DROP OWNED`, no
schema `CASCADE`) and restores recorded `collection_enabled = false` checks.
It refuses if the gate is on, any source is collection-enabled, unexpected
same-role objects exist, or unrelated public privileges were granted to
package roles. It does not delete articles, YHB jobs, NIE, or collector-shadow.
Native handoff is existing `mip_pipeline_v1` enqueue/claim/finish (see
`nativeHandoff.mjs`); identical delivery is idle; changed content is
`revision_pending`.
