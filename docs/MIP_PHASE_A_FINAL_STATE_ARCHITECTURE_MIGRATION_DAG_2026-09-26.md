# MIP Phase A — Final-state architecture + migration dependency blueprint

Date: 2026-09-26 (ET)  
Status: **PLANNING ONLY** — does **not** authorize SQL apply, Edge deploy, cron re-enable, PR merge, project delete, or paid add-ons.

**Correction note — 2026-09-26 (same-day, in-place).** Git history on this branch remains the dated original. This note does **not** start a new architecture series. Five facts are corrected in the living parts (full list at the top of part 1a): `collector-shadow` remains receipt-only; JFN is already retired; NIE historical attribution does not require migrating login sessions; **36,183** is the observed YHB pause article count, not a complete consistency fence; the DAG expresses dependencies (not a serialize-all or corpus-first mandate). Operational migration can proceed without a full historical corpus copy. Intended ingest/retain connect is **C3→native capture** (sibling PR in flight); no new package is named here.

**Continue reading in order (one logical document):**

1a. [Anchors + final-state target + capabilities C1–C11](./MIP_PHASE_A_2026-09-26_1a_capabilities.md)  
1b. [Capabilities C12–C22](./MIP_PHASE_A_2026-09-26_1b_capabilities.md)  
2. [Frontend ruthlessness + migration dependency DAG](./MIP_PHASE_A_2026-09-26_2_frontend_dag.md)  
3. [Phases B–F stubs, consolidation practices, counts, blockers](./MIP_PHASE_A_2026-09-26_3_phases_practices.md)

Concat SHA-256 of parts 1a||1b||2||3: `cfe442d1d361687937b3269fb9207c0b966e865046dd9c3ca87140110cc401d7`

Also registered in `docs/BACKEND_CONSOLIDATION_PLANNING_REGISTRY_2026-09-26.md`.

Authority: Index `canonical/00_INDEX_v2.1.6_2026-09-03.md` · Master Plan `MIP_MASTER_PLAN_v2.1.5_2026-09-03.md` · Launch Boundary v1 · `docs/BACKEND_CONSOLIDATION_AUTHORITY_RECONCILIATION_2026-09-20.md` · `docs/FOUNDATION_RUNTIME_OWNERSHIP_CHECKPOINT_2026-09-20.md`.
Consolidation tip observed: `c4cfd28db7672c631e86af012febda4890e34f33` (PR #177 draft unmerged). PR #179 LIVE HOLD.

**No live mutations in this Phase A run** beyond the previously authorized YHB pause. Historical corpus disposition is a parallel lane, not a blocker in front of capability migration.
