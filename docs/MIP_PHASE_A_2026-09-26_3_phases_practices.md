## 5. Phases B–F acceptance stubs (marching orders)

### Phase B — Ingestion on qik
- [ ] Deploy/enable qik ingest path (owner gate) with collection flags explicit.
- [ ] One successful scheduled or authorized run writes ≥1 article + ingestion_run row.
- [ ] Watermark/checkpoint advances; duplicate delivery idempotent.
- [ ] Failure leaves observable partial/stale state (no false “current”).
- [ ] YHB crons stay `active=false` unless owner re-authorizes.

### Phase C — Analysis on qik
- [ ] Extraction → candidates for a retained article.
- [ ] Source-comparison fenced generation produces events/claims/explanations under release policy.
- [ ] Entity/agency path preserves accepted vs candidate.
- [ ] Observable failure/retry; no silent empty success.

### Phase D — Product-serving projections
- [ ] Eligible reader projection non-empty for authorized fixtures/real rows.
- [ ] Comparison/Timeline/Graph/World View load qik contracts with version/staleness honesty.
- [ ] Investigation private path unchanged and green on membership matrix.

### Phase E — Caller cutover
- [ ] Inventory: no required caller uses YHB/NIE base URL or service-role ingest.
- [ ] Pages/main and Account UI still qik-only (regression).
- [ ] Legacy Edge/RPC revoke candidates prepared (not applied without owner gate).

### Phase F — Legacy disposition
- [ ] Per-project checklist: responsibilities replaced or explicitly dispositioned; history/attribution preserved; recovery drill named; billing verified.
- [ ] YHB/NIE retirement only with **exact owner authorization** — never delete-first. **JFN is already retired** (2026-09-23).
- [ ] Corpus lane may still be “retain as cold archive” while capabilities are already on qik.

---

## 6. Consolidation practice notes (only where they change *this* plan)

| Practice | Effect on MIP plan | Cite |
|---|---|---|
| **Strangler / expand-contract** | Keep YHB paused-but-present while qik path grows; do not big-bang delete; facade is already qik frontend | Strangler fig / parallel change (industry) |
| **Single writer during move** | Prefer qik-authoritative writes after enable; avoid dual-write races; use watermark + idempotent upsert by version | CDC/strangler notes: single writer + version gates |
| **Cron / Edge move** | Recreate schedule on qik (pg_cron+pg_net+Vault); do not “flip” YHB jobs to point at qik without new credentials/preflight | Supabase pg_cron → Edge pattern; YHB command text is YHB-scoped |
| **Auth vs attribution** | End-user Auth ≠ evidence attribution; NIE historical attribution does **not** require migrating login sessions; RLS membership ≠ provenance | Index G2; authority recon caller matrix |
| **RLS / PostgREST** | Do not copy YHB public SECURITY DEFINER / anon write posture onto qik; paginate (Doc 13); default-deny public views | Doc 13; consolidation security candidates |
| **Watermarks** | qik `mip_consolidation_watermarks` are operational cutover state. YHB **36,183** is the observed pause article count, **not** a complete consistency fence | Live qik table comment; YHB census |
| **Backfill vs continuous** | Continuous ingest on qik first (B); historical backfill parallel (C22)—backfill must not block B–E | Strangler backfill-after-forward-path |
| **Fence / delta** | Comparison/arc enrichment queues require generation fence before any re-enable (qik queue comment already states this) | qik `source_comparison_enrichment_queue` comment; comparison recovery docs |

---

## 7. Classification counts

| Class | Count | IDs |
|---|---:|---|
| **MIGRATE** (must establish on qik) | **12** | C2 population, C3, C5, C6, C7, C8, C9, C10, C11, C15 policies, C17, C20 |
| **EXTEND** (qik already owns; harden/enable) | **7** | C1, C2 contracts, C4, C14, C16, C18, C21 |
| **RECONCILE** (contract merge, not greenfield) | **2** | C12 System-One, C13 absence/change |
| **DISPOSITION / parallel / later** | **4** | C19 Markets, C22 corpus lane, NIE G-ALG history, GDELT staging |

**Owner-facing migrate vs disposition:** **12 migrate** · **4 disposition/parallel**. EXTEND (7) and RECONCILE (2) are qik-side work that do not themselves require predecessor cutover as the primary act.

---

## 8. Blockers needing owner

1. **Enable qik ingestion schedule / collection flags** — required for Phase B; not authorized by this doc.
2. **Publication/eligibility policy** for faster source-only visibility (reader contracts §3) — default-deny stays until exact decision.
3. **NIE credential scrub** in inactive cron command text before any future reactivation (prefer: never reactivate; dispose).
4. **Predecessor retirement** (YHB/NIE) — exact authorization after Phase E/F proofs; billing/PITR unknowns remain. **JFN is already retired** (2026-09-23); do not treat as an active predecessor.
5. **PR #177 / #175 merge policy** — integration code stays unmerged; Phase A does not merge.
6. **PR #179 LIVE HOLD** — do not lift via consolidation narrative.
7. **R4.9 / R4.5 / 02C public / security-privacy** — launch blockers per Index; orthogonal to strangler order but still owner gates for public release.

---

## 9. Explicit non-actions (this phase)

- No SQL migrations applied to qik/YHB/NIE.
- No Edge deploys; no cron `active=true`; no YHB job deletion.
- No PR merges; no project deletes; no paid add-ons.
- Historical corpus work is **parallel**, not gated in front of C3–C7. Operational migration can proceed without a full historical corpus copy.

---

## 10. Index registration

Register this file as the Phase A specialized planning document for backend consolidation final-state + migration DAG. It does not supersede Index status, Master Plan roadmap, or Launch Boundary scope. It does not authorize build beyond existing owner gates.
