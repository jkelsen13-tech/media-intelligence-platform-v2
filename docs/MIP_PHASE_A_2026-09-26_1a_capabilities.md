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

---

## 2. Capability matrix

Legend — **Move:** algorithm / schema contract / config / state·cursors / historical records / nothing.  
**Class:** **MIGRATE** (required on qik for launch/ops) · **DISPOSITION** (predecessor-only or optional; no product break if removed after proof) · **EXTEND** (already on qik; harden/enable).

For each capability: (1) canonical qik owner, (2) best existing implementation today, (3) what must move, (4) replacement proof.

### C1 · Account / Auth / profiles — EXTEND
1. **qik:** Auth users; `public.mip_profiles`; session/JWT; RLS membership.
2. **Best today:** qik (2 profiles; live Pages + Account UI).
3. **Move:** nothing operational; optional NIE Auth user identity map if unique humans must retain sessions (**historical records** + mapping).
4. **Proof:** login/OTP/session/profile round-trip on qik; no NIE/YHB Auth required for product.

### C2 · Public news / eligible reader projection — EXTEND + MIGRATE (population)
1. **qik:** `articles` + `reader_state='eligible'` (and related public views); `newsBackend` / `publicDataBackend` / `supabase.js` loaders.
2. **Best today:** **qik** contracts (Pages live bundle → qik only); population thin (3 eligible). Corpus authority still YHB.
3. **Move:** **historical records** (selective eligible corpus) + **algorithm/config** for eligibility; not YHB browser binding.
4. **Proof:** representative articles eligible on qik; News/Explore load from qik; YHB not read by frontend.

### C3 · Ingestion collector (RSS discovery → retain) — MIGRATE
1. **qik:** `ingest_sources` / `ingestion_sources`; `ingestion_runs` / `ingestion_source_runs`; `mip_consolidation_watermarks`; future Edge `ingest-rss` (or successor); pg_cron/pg_net schedule; Vault scheduler token.
2. **Best today:** **YHB** `ingest-rss` v8 + paused cron (largest live path). qik `collector-shadow` = receipt-only (`canonical_domain_writes=false`).
3. **Move:** **algorithm** (ingest-rss), **schema contract** (run ledger/checkpoints), **config** (sources/keys), **state/cursors** (watermarks/checkpoints), later **historical records** (parallel).
4. **Proof:** qik schedule writes articles + run ledger; failure/recovery observable; YHB cron remains off and is not required for freshness.

### C4 · Capture / CAS / exact citation — EXTEND
1. **qik:** evidence_pipeline captures/identities/candidates; Edge `capture-retrieval`; CAS package in repo (qualification).
2. **Best today:** **qik** (95 captures/identities observed historically; retrieval Edge live).
3. **Move:** nothing from YHB; **algorithm** from repo CAS → install when proving byte rehydration.
4. **Proof:** byte-level retrieve/rehydrate on qik; rights/custody gate held.

### C5 · Extraction / structured candidates — MIGRATE
1. **qik:** extraction result tables + review state (extend/reconcile from YHB `article_extraction_results` / candidate model); worker Edge or Cloud Run per repo contract.
2. **Best today:** **YHB** (9020 extraction results). NIE has older extract/graph path.
3. **Move:** **algorithm** + **schema contract** + selective **historical records** (parallel).
4. **Proof:** retained qik article → extraction row with review≠fact; predecessor extractor not required.

### C6 · Claims / entities / agency / relationships — MIGRATE
1. **qik:** `claims`, `article_claims`, `entities`, entity-resolution/agency packages (repo); accepted vs candidate distinction.
2. **Best today:** **YHB** operational graph; **NIE** historical explanations/graph; qik tiny reference set.
3. **Move:** **schema contract** + **algorithm** + ID map; **historical records** parallel.
4. **Proof:** qik IDs stable; provenance per entity; YHB/NIE not required for new analysis.

### C7 · Source Comparison — MIGRATE
1. **qik:** events/claims/event_articles/explanations + enrichment queue + release policy; Edge `source-comparison-run` successor; `sourceComparisonReadPath` reader.
2. **Best today:** **YHB** v15 + enrichment queue (paused). NIE v17 closed historical write. Repo comparison-* docs/tests.
3. **Move:** **algorithm**, **config** (release thresholds), **state** (queue/generations), selective history parallel.
4. **Proof:** fenced generation on qik; UI `loadSourceComparisonView` populated from qik; YHB enrichment not required.

### C8 · Chronology / Timeline placement — MIGRATE
1. **qik:** chronologyBackend + timeline placement tables/contracts (repo/YHB overlap); bitemporal clocks.
2. **Best today:** **YHB** timeline_placement_* + contracts; frontend `chronologyBackend` on qik client (empty/sparse).
3. **Move:** **algorithm** + **schema contract** + **state**; history parallel.
4. **Proof:** Timeline surface reads qik placements; NIE/YHB not required.

### C9 · Arcs / membership / milestones — MIGRATE
1. **qik:** `story_arcs`, arc_* , membership candidates/scores/audits/release_policy; Edge `arc-membership-run` successor.
2. **Best today:** **YHB** (227 arcs + membership/audit tables). NIE 49 arcs historical.
3. **Move:** **algorithm** + **config** + selective history.
4. **Proof:** Arc surface + attach RPCs on qik; predecessor membership workers idle forever after cutover.

### C10 · Graph analysis / layout — MIGRATE (ops) / DISPOSITION (NIE checkpoint history)
1. **qik:** `nodes`/`edges` + graph_checkpoints/layout (to be owned); Edge `graph-analysis-run` successor or repo G-ALG.
2. **Best today:** **NIE** `graph-analysis-run` v16 (historical). YHB small nodes/edges. qik 1 node / 0 edges.
3. **Move:** **algorithm**; checkpoint **historical records** → disposition/archive unless product needs them.
4. **Proof:** qik graph loaders return governed graph; NIE function not called.

### C11 · Provenance / explanations read path — MIGRATE
1. **qik:** `explanations` + explanationReadPath / eligibility; G2 dimensions unchanged.
2. **Best today:** **NIE** 1892 explanations (06C-era). YHB 51. qik 0.
3. **Move:** **schema contract** + selective **historical records**; algorithm already in repo/NIE.
4. **Proof:** provenance UI on qik; auto_verified remains owner-gated (Index: 0 auto_verified posture preserved unless owner changes).
