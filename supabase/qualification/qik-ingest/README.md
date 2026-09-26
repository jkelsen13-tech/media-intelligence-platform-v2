# C3 · qik-owned ingestion collector (source-ready)

**Status:** SOURCE-READY · **LIVE HOLD** · **not applied** · **not deployed** · **not scheduled**.

This directory is the Package C3 collector package. It is testable on disposable
PGlite. It is **not** an authorization to install SQL, deploy Edge, create
Vault secrets, enable pg_cron, read real article payloads, or transfer the YHB
corpus.

Phase A (PR #180, tip `509afb3ebb119a1be5181ce9f2a50e96d5fc1190`): C3 is
**MIGRATE**. qik must own `ingest_sources` / `ingestion_runs` / watermarks /
Edge ingest-rss (or successor) / schedule. Best live path today is YHB
`ingest-rss` v8 + paused cron. qik `collector-shadow` remains receipt-only
(`canonical_domain_writes=false`). YHB pause checkpoint **articles=36183**.
qik observed **articles=98**. This package does not change those live counts.

## What this package is

A complete, later-installable **discover → retain** collector owned by qik:

1. Install/order for an eventual owner apply (**not executed here**).
2. Schema/contract deltas as **files only**.
3. Edge source adapted from YHB/repo ingest-rss v8 parser seams (`predecessorV8`)
   with **qik env names**. Vault + pg_cron + pg_net pattern is documented.
   Default schedule is **disabled**; this package never calls `cron.schedule`.
4. Watermark/checkpoint continuity from the YHB pause fence (~36183) **without**
   transferring articles.
5. Idempotent URL upsert / duplicate-delivery behavior on disposable PGlite.
6. Failure/recovery observability: this package **never** advertises `current`.

Out of scope (later capabilities): NER, embeddings, arc origination, extraction
review, comparison, publication, eligibility. Collector-shadow is unchanged and
must not become the canonical writer.

## Hard stops (this package and this PR)

- No hosted qik SQL, grants, Data API exposure, or signing-trust changes.
- No real secrets and no `vault.create_secret`.
- No Edge deploy.
- No YHB cron restart, delete, or `active=true`.
- No real-data transfer or publication.
- No merge of PR #177 or #179.
- No paid spend. NIE hold unchanged. CI: prefer `[skip ci]` / 0 minutes.

## Layout

| Path | Role |
|---|---|
| `INSTALL_ORDER.md` | Eventual apply order and preflight |
| `SCHEMA_CONTRACT_DELTA.md` | qik today vs this delta |
| `WATERMARK_CONTINUITY.md` | Fence 36183; no corpus copy |
| `LIVE_OPERATION_PASTE.md` | One coordinated paste; **LIVE HOLD** |
| `SELF_REVIEW.md` | Non-implementing review + corrections |
| captured YHB v8 | `supabase/runtime-snapshots/ingest-rss-v8-live-20260920/` (lineage; not deployed from here) |
| `fixture_substrate.sql` | Disposable PGlite only — **never live** |
| `010`–`050` | Contract deltas (files only) |
| `090_cleanup.sql` | Ledger-bound drop of **this package** only |
| `collector.mjs` | Testable worker (injected fetch, no network default) |
| `edge/` | Deno serve adapter; not in `supabase/functions/` |

## Later live proof (not this PR)

qik schedule writes articles + `ingestion_runs`; duplicate delivery is idle;
failure/recovery is observable and not named `current`; YHB cron stays off.
That proof requires a separate owner paste.
