# Schema / contract delta (files only)

Observed live anchors are Phase A (2026-09-26) / consolidation docs. This file
does not re-query hosted catalogs.

## qik already has

| Object | Notes |
|---|---|
| `public.ingest_sources` | 7 rows; `enabled` default false; **`check (collection_enabled = false)`** |
| `public.ingestion_sources` | Distinct keyed register; collection also fenced false |
| `public.ingestion_runs` / `ingestion_source_runs` | Canonical run ledger present; presence ≠ collection |
| `public.mip_consolidation_watermarks` | Mapping/import watermarks; not a qik ingest schedule |
| `public.articles` | ~98 rows; `reader_state` default `pending_review`; unique `url` |
| Edge `collector-shadow` | Receipt-only; `canonical_domain_writes=false`; no schedule |
| `pg_net` | Transport only (historical); **no qik ingest cron.job** |

qik does **not** own a canonical RSS retain writer, a qik-named run-key, or a
disabled-but-installed ingest schedule.

## YHB (predecessor; do not mutate)

| Object | Notes |
|---|---|
| Edge `ingest-rss` **v8** | Best live collector algorithm; Vault-backed scheduler token or owner run key |
| `mip-ingest-rss-hourly` | Was `*/5`; **paused `active=false`**; jobs retained |
| articles **36183** | Pause fence; **not copied by this package** |

Captured live YHB v8 source is
`supabase/runtime-snapshots/ingest-rss-v8-live-20260920/`. Repo
`supabase/functions/ingest-rss/` is a later local body. C3 parser seams reuse
captured YHB v8 `predecessorV8.js` (sanitize/parseFeed). Edge auth follows the
v8 owner-key **or** scheduler-RPC pattern under qik names. This package does
**not** port NER, embeddings, or arc origination (C5/C9).

## This package adds (unapplied)

| Delta | Why |
|---|---|
| Schema `qik_ingest` | Isolated gate, empty credential hash table, disabled schedule intent |
| Roles `qik_ingest_fn_owner` / `qik_ingest_runtime` | Function owner ≠ browser; runtime has EXECUTE only |
| Drop hard `collection_enabled = false` **replace with owner gate** | Expand without enabling; trigger still refuses true while gate is false |
| `public.mip_qik_ingest_*` RPCs | service_role + runtime EXECUTE; **no** anon/authenticated/PUBLIC |
| Retain / observe | `qik_ingest.observed_items` then existing `mip_pipeline_v1` enqueue; publication fields refused |
| Native handoff | claim/finish; identical hash idle; changed URL content → `revision_pending` |
| Operation ledger | `qik_ingest_operation` records exact created objects and dropped collection checks |
| Watermark channels | `yhb…/ingest_pause_fence` = 36183; `qik…/ingest_forward` starts idle |
| Schedule intent | `mip-qik-ingest-rss` **`active=false`** with a check that forbids true |

## Explicit non-deltas

- No change to collector-shadow, NIE, YHB cron, or PR #179 hosted-synthetic.
- No `public` grants for write RPCs (unlike isolated-v2 `mip_v2_ingestion_*` which granted anon).
- No Data API extra schema exposure.
- No `vault.create_secret`, `cron.schedule`, `net.http_post`.
- No article body import from YHB/NIE.

## Live-gated after apply

Function owner on hosted qik must remain `NOLOGIN` without `BYPASSRLS`. Edge
still carries ambient `service_role` today; least-authority runtime is an
owner/platform gate, not proved by PGlite. Pooler/authenticator identity is
not proved here.
