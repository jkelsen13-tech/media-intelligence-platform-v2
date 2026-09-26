# MIP Phase A — Final-state architecture + migration dependency blueprint

Date: 2026-09-26 (ET)
Status: **PLANNING ONLY** — docs/branch deliverable. Does **not** authorize SQL apply, Edge deploy, cron re-enable, PR merge, project delete, or paid add-ons.
Authority stack: Index `canonical/00_INDEX_v2.1.6_2026-09-03.md` (status) · Master Plan `MIP_MASTER_PLAN_v2.1.5_2026-09-03.md` · Launch Boundary v1 · `docs/BACKEND_CONSOLIDATION_AUTHORITY_RECONCILIATION_2026-09-20.md` · `docs/FOUNDATION_RUNTIME_OWNERSHIP_CHECKPOINT_2026-09-20.md` · post-consultation workflow Stage 2 dispositions.
Consolidation tip observed: `c4cfd28db7672c631e86af012febda4890e34f33` on `codex/mip-backend-consolidation-20260920` (PR #177 draft unmerged). PR #179 remains LIVE HOLD (hosted-synthetic only).

## 0. Settled live anchors (read-only, 2026-09-26)

| Project | Role | Edge (ACTIVE) | Scheduler | Corpus signal |
|---|---|---|---|---|
| **qik** `qikvmopbtijoebdqosyq` | **Survivor / destination** | 9: `spatial-runtime`, `investigation-*` (5), `investigation-api`, `capture-retrieval`, `collector-shadow` | no `cron.job` | articles **98** / eligible **3**; ingest_sources 7 (collection not recurring); mapping ledger 3818 / conflicts 1504; watermarks 6 |
| **YHB** `yhbwnrtlqbjtcrrlpbge` | Operational collector **PAUSED** | 6: `ingest-rss` v8, `source-comparison-run` v15, `arc-membership-run`, `backfill-legacy`, `import-original-source`, `membership-qualification` | `mip-ingest-rss-hourly` **active=false**; `mip-source-comparison-enrichment` **active=false** (jobs retained) | articles **36183** (checkpoint); events 13008; entities 15259; extraction_results 9020; ingestion_runs 9185 |
| **NIE** `niejaejtbxgakyrsntxm` | Preserve / disposition lane | 6: `ingest-rss` v41, `source-comparison-run` v17, `graph-analysis-run`, `batch-intake`, `policy-ingest`, `debug-parse` | `mip-ingest-rss-daily` / `mip-backfill-legacy` both **active=false** | articles **752**; events 347; claims 839; explanations 1892; edges 411; arcs 49 |

**No live mutations in this Phase A run** beyond the previously authorized YHB pause.

**Parallel lane (not a capability-migration blocker):** historical corpus disposition (YHB ~36k articles + analytical graph; NIE closed-beta graph/explanations; jfn spatial history) proceeds beside capability migration. Capability cutover proves a qik path; corpus backfill/reconcile is separate and may trail.

---

## 1. Final-state target (one sentence)

**qik owns every required write path, schedule, identity, private investigation boundary, and public reader projection; YHB/NIE become recovery/disposition sources only after each capability’s replacement proof; frontend callers already bound to qik public/investigation seams keep that binding and grow population via qik pipelines—not via predecessor refs.**

SEE_FULL_FILE_IN_NEXT_COMMIT