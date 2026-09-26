## 3. Frontend ruthlessness (release surfaces → contracts)

Composition root: `mipBackend` = `investigations` + `publicData` (qik client). Independently loaded projections ≠ one snapshot (`publicDataBackend.js`).

| Surface | Backend contracts consumed | Removing **YHB** breaks? | Removing **NIE** breaks? | Action |
|---|---|---|---|---|
| News / Explore / Search | `newsBackend` → articles, outlets, citations, corpus meta, event grouping, eligibility resolve | **No** (already qik; thin pop) | **No** | MIGRATE population via C2–C3; disposition YHB/NIE HTTP |
| Story / article detail | article detail, graph links, timeline key, comparison events | **No** | **No** | same |
| Source Comparison | `loadSourceComparisonView` / comparison read path | **No** for HTTP; **Yes** for *fresh enrichment data* until C7 on qik | **No** (historical only) | **MIGRATE C7**; then disposition |
| Timeline / Arc | `chronologyBackend`, arcGroupedTimeline, supabase arc/event loaders | **No** HTTP; **Yes** data richness until C8–C9 | **No** product path | **MIGRATE C8–C9** |
| Graph | `loadGraph`, coverage, node locations | **No** | **No** live Pages path; NIE G-ALG was producer | **MIGRATE C10** producer; disposition NIE function |
| World View | `spatialBackend` → spatial_projection_v1; weatherSourceRights fail-closed | **No** | **No** | EXTEND qik; JFN already retired (qik archive, not an active predecessor) |
| Investigation (private) | investigation Edge/API | **No** | **No** | EXTEND |
| Provenance / explanations | explanationReadPath | **No** HTTP; **Yes** row richness until C11 backfill | **Yes** if product requires NIE explanation corpus before reconcile | **MIGRATE C11** (parallel OK) |
| Account | Auth + mip_profiles | **No** | **No** — NIE historical attribution does not require migrating login sessions | EXTEND qik Auth |
| Markets | default-closed | **No** | **No** | DISPOSITION / later gate |
| GDELT staging (YHB) | not a launch reader surface | N/A | N/A | **DISPOSITION** (keep staged until owner handoff policy) |

**Rule:** every “yes, removing predecessor breaks X” becomes a **migration task** above; every “no” is **disposition** after replacement proof (or immediately if never a caller).

---

## 4. Migration dependency DAG

The DAG records **dependencies** (what a later capability needs to exist). It does **not** require serializing all implementation work, and it does **not** require old-corpus transfer before operational migration.

### Trunk (capability dependencies)
1. **qik foundations** — Auth/RLS/private-public boundary; config registry; watermarks/mapping ledgers; evidence/capture; release-policy tables; no predecessor public SECURITY DEFINER copied blindly.
2. **Ingestion** — qik C3 ingest/retain path + source config + run ledger + owner-gated schedule; `collector-shadow` remains receipt-only (not a retain writer); intended connect is **C3→native capture** (sibling PR in flight). YHB **36,183** is the observed pause article count, not a complete consistency fence.
3. **Extraction / processing** — structured candidates, capture linkage, idempotent jobs.
4. **Comparison / analysis** — source-comparison generations; claim/entity/agency; assessment/System-One reconcile.
5. **Graph / timeline / arcs** — graph-analysis; timeline placement; arc membership; cross-surface candidates still review-gated.
6. **Review / publication** — eligibility + release policies; reader_state; spatial already closed.
7. **Readers** — News/Explore/Comparison/Timeline/Graph/World View/Investigation Context consume qik only at required population.

### Cross-cutting (always-on constraints)
- **Auth vs attribution:** end-user Auth ≠ evidence attribution; never conflate (Index/G2).
- **Provenance:** explanations/assertions remain typed; absence ≠ contradiction.
- **Temporal:** bitemporal clocks; no future-data leakage on replay.
- **Evidence lineage:** captures/hashes/versions before publication.
- **Recovery:** YHB/NIE retained until Stage-F disposition; **JFN is already retired**; fence/delta on queues; expand→cutover→contract (strangler).

### Parallel (non-blocking)
- Historical corpus reconcile/backfill (YHB/NIE). **JFN is already retired.** Operational migration can proceed without a full historical corpus copy.
- R4.9 true-globe renderer work (frontend; does not unlock YHB).
- Markets / election / crypto specs (Launch Boundary) — not consolidation blockers.
- PR #179 hosted-synthetic — LIVE HOLD; do not treat as migration progress.

---
