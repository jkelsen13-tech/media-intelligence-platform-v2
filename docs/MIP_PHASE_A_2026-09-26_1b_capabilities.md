### C12 · Assessment / hypothesis / System-One decisions — EXTEND + RECONCILE
1. **qik:** assessment/change/record_version foundations; repo `hypothesisAssessment*`; semantic decision taxonomy doc.
2. **Best today:** **qik** overlapping live objects + **repo-only** hypothesis packages (PR #175 unmerged).
3. **Move:** **algorithm/schema** from integration branch → qik (no parallel belief engine).
4. **Proof:** one provider-neutral decision path on qik with typed invalidation; no second store.

### C13 · Absence semantics / knowledge-change taxonomy — RECONCILE
1. **qik:** typed observations on existing owners (F14/F15); not a new product DB.
2. **Best today:** **distributed** (repo + qik change ledgers + comparison absence language).
3. **Move:** **schema contract** (enums/causes) onto qik owners.
4. **Proof:** every Launch/reader absence type maps to a stored cause; no collapse of not-reported vs not-extracted.

### C14 · Investigation workspace (private) — EXTEND
1. **qik:** private investigation Edge cluster + RPCs; `mipBackend.investigations`.
2. **Best today:** **qik**.
3. **Move:** nothing.
4. **Proof:** member/reviewer/revoked matrix; YHB/NIE unused.

### C15 · Review / publication / release gates — EXTEND + MIGRATE (policies)
1. **qik:** algorithm_release_policies; spatial release; comparison/arc/timeline release_policy rows; default-deny.
2. **Best today:** **qik** spatial release closed (R3); **YHB** comparison/arc release tables operational historically.
3. **Move:** **config** + release **state** for comparison/arc/timeline onto qik.
4. **Proof:** no public projection without qik gate; predecessor RPCs not callable for publication.

### C16 · Spatial / World View projection — EXTEND
1. **qik:** `spatial_projection_v1` + chain; Edge `spatial-runtime`; `spatialBackend` → World View.
2. **Best today:** **qik** (R3/R4 shipped). **JFN is already retired** (2026-09-23); unique spatial history already lives in the qik private archive — not an active predecessor.
3. **Move:** nothing from a live jfn. R4.9 renderer is frontend/repo (not YHB/NIE). Retired-jfn archive already on qik (historical-only).
4. **Proof:** World View continues on qik; removing YHB/NIE does not break spatial.

### C17 · Temporal intelligence assessments — MIGRATE (when R4.5 executes)
1. **qik:** temporal assessment store referenced by Investigation Context (spec); clocks on articles/events.
2. **Best today:** **repo-only** specs + partial YHB timeline evidence; not a live qik product owner.
3. **Move:** **schema contract** + **algorithm** when authorized; uses qik-owned data as operational ingest and selective history land. Full predecessor corpus copy is not a prerequisite.
4. **Proof:** shared temporal assessment ID across surfaces; no per-view recomputation.

### C18 · Search / discovery / Investigation Context — EXTEND
1. **qik:** public loaders + deepLinks + exploreShell; Investigation Context client state bound to qik IDs.
2. **Best today:** **qik** frontend (R4.75 closed). Backing corpus thin.
3. **Move:** population via C2–C7; nothing from NIE/YHB HTTP.
4. **Proof:** search/explore resolve only qik-eligible subjects.

### C19 · Markets evidence (launch-scoped, default-closed) — DISPOSITION until owner enable
1. **qik:** future install of markets packages; default-closed endpoints.
2. **Best today:** **repo-only** (PR #175).
3. **Move:** nothing live; install later under own gate.
4. **Proof:** N/A for YHB/NIE retirement; Markets must not block consolidation.

### C20 · Config / secrets / scheduler registry — MIGRATE
1. **qik:** non-secret config registry; Vault names; single project ref in frontend env.
2. **Best today:** split across GitHub/Vault/YHB cron commands/NIE legacy bearer text in inactive jobs.
3. **Move:** **config**; scrub NIE stored command secrets before any reactivation (**never re-enable without scrub**).
4. **Proof:** one documented registry; no hidden ref fallbacks to YHB/NIE.

### C21 · Recovery / watermarks / fence·delta — EXTEND + MIGRATE (ops discipline)
1. **qik:** `mip_consolidation_watermarks`; mapping/conflict ledgers; fenced enrichment generations; append-only run ledgers.
2. **Best today:** **qik** watermarks + import mappings; **YHB** live checkpoints/runs; bounded recovery receipt (post-consultation).
3. **Move:** **state/cursors** at cutover; keep YHB/NIE as restore sources until retirement gate. **JFN is already retired.**
4. **Proof:** restore drill identity named; watermark advance only after qik success; predecessor not needed for forward progress.

### C22 · Historical corpus disposition lane — DISPOSITION (parallel)
1. **qik:** import mappings/conflicts; selective reconcile jobs; cold archive designation.
2. **Best today:** **YHB** primary corpus; **NIE** analytical history. **JFN is already retired**; spatial archive already on qik (not an active predecessor).
3. **Move:** YHB/NIE **historical records** on their own DAG (export → map → reconcile → verify → retire). This lane does **not** precede operational migration.
4. **Proof:** retirement checklist (workflow Stage 4): every responsibility replaced/dispositioned; callers closed; recovery usable; billing verified — **exact owner authorization**.

---
