# Watermark / checkpoint continuity (no article transfer)

## Fence

YHB pause checkpoint used by Phase A / this package:

| Field | Value |
|---|---|
| Predecessor | `yhbwnrtlqbjtcrrlpbge` |
| Channel | `ingest_pause_fence` |
| `articles` | **36183** |
| `freshness` | `fence` |
| `corpus_transfer` | **false** |

This number is a **count fence**, not a rowset. `040_watermarks.sql` writes the
count and the denial of transfer. It does not `INSERT` 36183 articles, URLs,
bodies, embeddings, or run payloads.

qik observed population at the Phase A note is **98** articles. The forward
cursor records that observation as context, not as a claim that qik is current.

## Forward cursor

| Field | Value |
|---|---|
| Survivor | `qikvmopbtijoebdqosyq` |
| Channel | `ingest_forward` |
| Starting `freshness` | `qik_forward_idle` |
| `is_current` | **always false** in `mip_qik_ingest_observe` |

Allowed `freshness` values:

- `fence` — predecessor pause count only
- `qik_forward_idle` — no successful qik retain run yet
- `qik_forward_inflight` — a discover run is `running`
- `qik_forward_stale` — last finish was `failed` / `completed_with_errors` / recovered
- `qik_forward_ok` — last qik discover run **completed** (inserted/duplicate counted)

**Forbidden:** `current`, `up_to_date`, `latest`, `live_current`.

`qik_forward_ok` means “the last qik retain run finished without source
failures.” It does **not** mean the product corpus is current. YHB still holds
the large paused corpus; this package does not strangler-cut over readers.

## Honesty on failure

| Situation | Run ledger | Forward freshness | `is_current` |
|---|---|---|---|
| `begin_run` then crash | `state=running` remains | `qik_forward_inflight` | false |
| `recover_inflight` | `running` → `failed` only | `qik_forward_stale` | false |
| Source fetch/parse error, 0 inserts | `failed` | `qik_forward_stale` | false |
| Mixed source success/failure | `completed_with_errors` | `qik_forward_stale` | false |
| All sources succeeded | `completed` | `qik_forward_ok` | **false** |

`finish_run(..., 'completed')` is rejected if any `ingestion_source_runs` row
for that run is `failed`. Completing an inflight run as `completed` after
`recover_inflight` is rejected.

The YHB fence row is never updated by begin/finish/recover.

## What still requires owner enable

Advancing the forward cursor on **hosted** qik requires the live-gated path
(credentials, gate, sources, Edge). This package only proves the cursor
contract on disposable PGlite with synthetic feeds.
