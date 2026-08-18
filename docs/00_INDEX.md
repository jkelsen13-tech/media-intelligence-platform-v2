# MIP — Index and Governing Rules

> **Authoritative. Adopted by the owner 2026-07-29; fixture-run results folded in 2026-07-31 per Rule 14. Phase 3 authorization and sequencing resolution folded in 2026-08-04. Graph Analysis Layer (G-ALG) status and CI regression folded in 2026-08-05. Source Comparison View (06C) build and auto-promotion reversal folded in 2026-08-07. Document 07 cross-surface ingestion canary folded in 2026-08-08. 06C functional closure (live full-corpus write, three surfaced write-path repairs, key rotation) folded in 2026-08-09. Manual pre-demo ingest-rss runs (0801Z/0804Z) folded in 2026-08-09; core-table census verified live 2026-08-10. r5 live-form correction, golden-fixture staleness finding, and accepted known drift folded in 2026-08-10. Tier 3 gate round 3 closure — r6 guard live, weeks/months-after gap closed and regression-locked, Tier 3 marked VERIFIED by the owner — folded in 2026-08-10. Doc 13 (scaling/pagination ceiling) closure and post-close live census folded in 2026-08-12, together with reconciliation of three stale working-document status fields (04 addendum Step 3, 05, 07 — see table). Doc 15A (atomic centroid and idempotent attach) closure folded in 2026-08-12 — write-path correctness fix, zero-delta census. Doc 08 (Project 2025 Tracker, Track 1: DOJ Civil Rights Division enforcement posture) Stage D closure folded in 2026-08-12 — six-goal canary written and owner-reviewed, Stage E deliberately not authorized. Doc 16 (Account Pipeline) closure, SMTP/email-delivery closure, duplicate_actor_label_monitor security-invoker repair, and the feed_posts out-of-scope ruling folded in 2026-08-13. All governing rules, shared vocabulary, integration seams, and the execution contract are carried forward unchanged unless explicitly noted below.**

Always attach this document. Attach exactly one active working document with it.

## Purpose and authority

*(Unchanged.)* This is the permanent constitution for the Media Intelligence Platform build. The Index owns current status; if another document disagrees with the Index, the Index wins. Working documents own requirements and acceptance criteria for their scope. Working-document numbers are filenames, not project phases.

## Working documents

| Document | Scope | Current use |
|---|---|---|
| 00_INDEX | Governing rules, shared vocabulary, integration seams, current checkpoint | Always attach |
| 01_PHASE_0_REPAIR | Correctness repair and regression protection | **Closed — verified** |
| 02A_PHASE_1_AMENDMENTS | Spec amendments only | **Closed — verified** |
| 02B_PHASE_2_PROVENANCE | Per-assertion provenance and explanation objects | **Closed — owner sign-off 2026-07-31** (read path live; 561 rows structurally blocked, see below) |
| 02C_PHASE_3_LEGAL_POLICY | Policy lifecycle and curated legal-case layer | **Internal closed beta LIVE since 2026-08-05. Public release blocked pending existing gate.** |
| 03_BACKLOG | Later features and captured ideas | Item 1 (Source Comparison View) — **CLOSED 2026-08-09** (see 06C). Item 2 (Silence Detection Dashboard) — not started. |
| 04_TRACK_B_DESIGN | Light, open public-knowledge visual system | Step 1 authorized to run in parallel — deployment status still unconfirmed |
| 04_ADDENDUM_STEP3_ARC_GROUPED_TIMELINE | Arc-grouped timeline view (Step 3) | **CLOSED 2026-08-10 — shipped and verified** (hard count 362 canonical events exactly-once; unit suite green; CI green). Corrects a stale "Not started" carried in a prior audit. |
| 05_CROSS_WINDOW_NAVIGATION | Cross-window navigation | **Shipped — CLOSED** (owner-confirmed 2026-08-12). Corrects a stale "Not started" carried in a prior audit. |
| 07_DOC07_CALLAIS_CANARY | Cross-surface ingestion test corpus (Louisiana v. Callais) | **Canary ingestion COMPLETE 2026-08-08 (see 06D below). Extraction NOT authorized — separate checkpoint.** (Status already correct here — ingestion complete, extraction held; supersedes any stale "Not started" in a prior audit.) |
| 13_SCALING_PAGINATION_CEILING | PostgREST 1000-row silent truncation — paginate every unpaginated select | **CLOSED 2026-08-12** — all nine sites fixed, regression tests banked, CI green; final commit `8d6f8ef` (see Doc 13 closure below). |
| 15A_ATOMIC_CENTROID_IDEMPOTENT_ATTACH | attachToArc lost-update race + duplicate-attach double-count — atomic in-SQL attach | **CLOSED 2026-08-12** — migration `20260813_atomic_arc_attach` live, both callers on `attach_article_to_arc` RPC, four before/after tests passed, CI green; final commit `85ad23e` (see Doc 15A closure below). |
| 08_PROJECT2025_TRACKER | Project 2025 Tracker, Track 1: DOJ Civil Rights Division enforcement posture (Mandate for Leadership Ch. 17) | **STAGE D CLOSED 2026-08-12** — six-goal canary written and owner-approved at review; goals #1/#6 unwritten by design; Stage E NOT authorized (see Doc 08 closure below). |
| 16_ACCOUNT_PIPELINE | Account pipeline (renumbered 2026-08-12 per Rule 14: formerly 05_ACCOUNT_PIPELINE — 05 retained by 05_CROSS_WINDOW_NAVIGATION, CLOSED and already folded) | **CLOSED 2026-08-13** — all four acceptance criteria met incl. owner-confirmed session persistence and logout/login round-trip; SMTP closed via custom SMTP (Resend) with known shared-domain limitation (see Doc 16 closure below) |
| MIP_MASTER_PLAN | Consolidated owner reference | Archive, not an execution prompt |

## Governing rules

*(Unchanged: rules 1–14 carry forward verbatim — Phase 0 priority; one active scope per run; combined shared-screen work; verify actual content; diagnose→fix→adversarial gate pipeline; byte-verify every push; no success by absence; no silent connector loops; failed calls may have side effects; every positive control is temporary; do not advance while a gate is pending; byte and database state outrank progress narration; legacy write-path caution (Rule 13); Index reconciliation discipline (Rule 14).)*

## Shared uncertainty vocabulary

*(Unchanged. Locked under G2 — owner-countersigned 2026-07-28. Six dimensions: source reliability, evidence strength, authentication, relationship type, review status, remaining uncertainty. Missing evidence is not contradicting evidence.)*

---

## Authoritative current checkpoint

Checkpoint supplied by the owner: **2026-08-09** (supersedes 2026-08-08 checkpoint). Source Comparison View functional status and auto-promotion reversal added 2026-08-07. Document 07 canary completion added 2026-08-08. 06C functional closure added 2026-08-09 (see 06C section). Manual pre-demo ingest-rss runs (0801Z/0804Z) folded in 2026-08-09 (see census note below); census verified live 2026-08-10.

### Phase 0 — verified-closed

*(Unchanged. All six items verified. G1 golden suite: 47/47 PASS at time of Phase 0 closure — historical figure only; do not assume still true without a fresh run.)*

**Correction and amendment, 2026-08-10 (incident session, owner-authorized):**
- **Live form of `edges_causal_evidence_guard` (public.edges) is r6** — migration `20260810_tier3_causal_edge_guard_r6_weeks_months_after.sql` (applied history version `20260810181209`), `convalidated=true`, verified live via `pg_get_constraintdef` 2026-08-10 (byte-compared against the pre-built candidate; diff vs r5 = exactly two inserted branches, one per arm). **Lineage, plainly:** r4's `'amidst?'` missed bare `'amid'` — r5 (`20260803_tier3_causal_edge_guard_r5_amid_fix.sql`) closed it via `'amid(st)?'` in BOTH arms. r5's alternation omitted the weeks/months-after family — r6 closed it by appending `|weeks?\s+after|months?\s+after` in BOTH arms. Both holes were caught by adversarial gate testing (gate round 3, 2026-07-27 and 2026-08-10 respectively), not by routine development. r4/r5 migrations remain untouched as applied history. Documented non-scope under r6 (admitted live, owner-confirmed, no decision made): `'in the (days|weeks|months) after/following …'` leads and numeric leads (`'1 day after'`).
- ~~**Golden-fixture staleness finding**~~ **RESOLVED 2026-08-10 (same day, owner-authorized repair chain):** the synthetic `r5_constraint.sql` fixture and divergent harness mirror were repaired end-to-end — fixture regenerated byte-exact from live (commit `59423be7`), harness `causalEvidence`/`decideEdge` resynced to shipped semantics (commit `2ab75826`), r6 fixture/harness/drift guards rolled out with the r6 apply (commit `0bed8c59`). Drift guards now enforce fixture↔harness equality across the FULL phrase space plus behavioral reject/admit sweeps per branch; the suite consumes these guards semantically, so silent divergence fails CI. Original finding text retained in git history at commit `70c3369d`.
- **Known drift accepted (owner decision, 2026-08-10):** arc `317eb508`'s centroid embedding, title/category, `title_article_count`, and `last_update_at`, plus all 38 arcs' `last_assignment_run`, carry 2026-08-09 sweep-mutated values with no prior values stored anywhere — not cleanly reversible, accepted as known drift. These fields recompute from member text on the next authorized assignment cycle (self-healing). Pre-rollback state of arcs `317eb508` and `18db1b9f` preserved in `story_arcs_canary_sweep_backup_20260809`.

**Tier 3 closure — gate round 3, 2026-08-10 (owner-marked PASS):**
- **Tier 3 status: VERIFIED** (was: implemented, gate round 3 pending). Final evidence: `Tier3_Gate_Round3_FINAL_Evidence_2026-08-10.md`.
- **Gate round 3 outcome, plainly:** adversarial mutation-phase testing found two real issues in this session — the Doc07 canary exposure (unrelated to Tier 3 directly; surfaced during gate preflight) and the weeks/months-after guard gap (directly in scope: deployed r5 admitted `'weeks after'`/`'months after'` causal-evidence leads, proven by two live probe inserts). Both fully closed and regression-locked: the canary exposure by the run-key gate + held_run_tags filter + Set A rollback; the guard gap by r6, locked at three levels (live constraint, drift-guard behavioral sweep, guardCase r5∧¬r6 mutation proof). This is a feature of the gate working correctly, not a mark against Tier 3's history.
- Gate round 3 also caught and repaired a golden-harness divergence (`causalEvidence` empty-refs pass-through, inverse of shipped) — fixed in the same session (commit `2ab75826`) and drift-guarded.

### G2 — locked

*(Unchanged. Shared uncertainty vocabulary locked and owner-countersigned 2026-07-28.)*

### Phase 1 (02A) — verified-closed

*(Unchanged. Closure commit `e3d28ad5`, 2026-07-28.)*

### Phase 2 (02B) — CLOSED (owner sign-off 2026-07-31)

*(Unchanged core build. See reversal below for the one live-state change.)*

**Post-closure update — REVERSED 2026-08-07.** The 2026-08-03 auto-promotion pass (8 of 579 explanation rows promoted to `auto_verified` at evidence_strength ≥ 0.75) was reversed on 2026-08-07 on the owner's explicit direction. All 8 rows demoted back to `awaiting_review`. Current live state: **0 rows auto_verified.** Manual review is still not the chosen path either. Reversal rationale was not recorded in the 2026-08-07 session — carry forward from the 2026-08-06 session record if the specific rationale is needed later.

Article count discrepancy note superseded: count grew from 580 → 699 via a manual backfill the owner ran directly (erratum, not an unexplained discrepancy — the earlier "cause UNKNOWN" note is resolved).

**Current flags and runtime state (updated 2026-08-09 post ingest-rss runs; census verified live 2026-08-10):**
- `pipeline_config.provenance_ui = true` — unchanged.
- Explanation read path: implemented, integrated, live.
- pg_cron: `mip-ingest-rss-daily` and `mip-backfill-legacy` both `active=false`.
- Cron status (2026-08-09): both jobs remain `active=false` — confirmed unchanged by the 06C source-comparison work (dry-run/full-corpus test made zero cron mutations). Re-enabling `mip-ingest-rss-daily` is tracked as open thread (f) and requires explicit owner authorization before any `active=true` flip.
- Core-table counts as of Document 07 canary close (2026-08-08): articles 728 (was 699 pre-canary; +29 from Doc 07 canary), edges 398, story_arcs 48, nodes 737, arc_entities 57, arc_events 67, arc_milestones 31, sources 336, citations 36, entities 924, article_entities 1490, explanations 581, bias_incidents 0. All non-articles counts confirmed unchanged by the canary's after-count discipline — the 29 new rows are inert pending extraction (see 06D). **06C closure (2026-08-09) added 347 events / 839 claims / 898 article_claims / 413 event_articles and moved explanations 581 → 1892 (+1,311 sc-v1 rows, planned carve-out); the 12 core tables above verified zero-delta.** **Two manual ingest-rss invocations (2026-08-09, pre-demo; 0801Z and 0804Z runs) moved articles 728 → 736 → 744 (+16), with the associated graph-layer deltas itemized in those two runs' verifier records: nodes 737 → 800, edges 398 → 450, story_arcs 48 → 50, arc_entities 57 → 69, arc_events 67 → 75, arc_milestones 31 → 39, sources 336 → 365, citations 36 → 37, entities 924 → 1011, article_entities 1490 → 1650; bias_incidents 0 (unchanged). Current census (re-verified live 2026-08-10 20:03 UTC): articles 752, nodes 750, edges 411, story_arcs 49, arc_entities 61, arc_events 70, arc_milestones 35, sources 340, citations 38, entities 963, article_entities 1550, explanations 1892, bias_incidents 0. Deltas since the prior same-day census are fully accounted for by two authorized events: the gate-round-3 Set A rollback (the negative derived-table deltas — nodes/edges/story_arcs/arc_*/sources/entities/article_entities) and the authorized INGEST_RSS_RUN_KEY gate verification ingest of 2026-08-10 16:19 UTC (Call 2 of 2: +8 articles, +1 attachment, +1 citation, heldExcluded 3, zero errors; ingestion_run_id NULL expected — a normal RSS cycle, not a tagged batch-intake manifest). No unexplained movement.** **Doc 07 extraction remains NOT authorized and did not run: every post-2026-08-08 movement in nodes/edges/arc-layer counts traces to the two manual ingest-rss runs above and to the 06C source-comparison run — not to Doc 07 scoped extraction. The 06D authorization status is unchanged.**

### Phase 2 — gated items (require explicit owner authorization)

1. Phase 2 final acceptance fixtures — CLOSED 2026-07-31.
2. Human review of the 567 awaiting_review explanation rows — SUPERSEDED 2026-08-03, then that supersession itself REVERSED 2026-08-07 (see above). Current live state: 0 rows auto-promoted; manual review still not chosen. 561 rows remain structurally blocked pending a future provenance-completeness backfill (not yet scoped).
3. Open observations (non-blocking): unchanged — 40 of 209 distinct explanation source_ids resolve to no live source row. **Backup-table RLS posture — VERIFIED CLOSED 2026-08-12** (was: decision deferred). Basis: owner-run live query 2026-08-12 — all 84 public-schema tables, including all backup tables, `rls_enabled=true`; backup tables correctly carry 0 policies (deny-all default, working as intended). Independently re-verified same day via pg_class/pg_policies: 90/90 public tables RLS-enabled, 42 backup/audit tables 0-policy (count difference vs the owner query is relkind scope only, posture identical).
4. Phase 3 (02C) legal/policy work — RESOLVED 2026-08-04 (unchanged).

### 02C Phase 3 — internal beta, LIVE

*(Unchanged from 2026-08-05. `phase3_beta=true`, both fixtures verified live, `phase3_public` confirmed false. Public release remains blocked pending the existing public-release gate — independent legal review, privacy/minor-protection review, owner signoff.)*

### 06A — Extraction microservice Step 0

*(Unchanged — COMPLETE 2026-08-04, deployed and verified.)*

### 06B — Graph Analysis Layer (G-ALG) and CI regression

*(Updated 2026-08-10. CI regression CLOSED, both Golden regression suite and Deploy to GitHub Pages green on `b8a14a59`, byte-verified. G-ALG-0 and G-ALG-1 shipped and CI-confirmed. G-ALG-1 full functional verification CLOSED 2026-08-09: endpoint canonicalization repaired (`source`/`target` → `source_id`/`target_id`, commit `0b435aa`, owner-authorized), graph-analysis-run redeployed (v15, ezbr `af6d606f…`; deployed source re-pulled 2026-08-10 and byte-identical to repo main), two-call insert/reuse verification run against production — exactly one graph_checkpoints row (800 nodes / 450 edges, created 2026-08-09 22:15:23 UTC) and exactly one linked graph_layout_versions row, checkpoint hashes independently recomputed via SHA-256 inside Postgres, GRAPH_ANALYSIS_RUN_KEY rotated post-verification (owner-side). Note for future readers: the live graph has since changed (post-verification cleanup later that evening; current live counts 750 nodes / 411 edges), so a fresh run today would correctly insert a NEW checkpoint rather than reuse — expected reuse semantics, not a defect.)*

### 06C — Backlog Item 1: Source Comparison View — CLOSED 2026-08-09

Batches 1 (schema), 2 (pipeline), and 3 (UI) code-complete and CI-verified 2026-08-07. Functional closure completed 2026-08-09: key set, full-corpus live write succeeded, populated UI owner-checked.

Live closure write (source-comparison-run v12, ezbr `85fee3d9…`, HTTP 200 in 59s): events 347 (19 multi-outlet), claims 839, article_claims 898, event_articles 413; explanations 581 → 1,892 (+1,311 sc-v1 rows: 413 event_membership + 898 claim_grouping — the planned carve-out). Zero-delta verified on the other 12 core tables. Sanity pulls passed, including a dedupe-winner spot check. CPU remediation shipped same day: tokenize hoist + Date cache in lib.js (behavior-preservation proven by byte-identical full-corpus output diff, sha256 `4de7046a…` both runs; 5.8× faster), which also retired the chunk-probe question — no worker ceiling remains at current corpus scale.

Three latent write-path bugs surfaced and repaired during closure — all invisible until the first production-scale write because dry-runs never insert and CI never exercises the write path:
1. article_claims unique-constraint violation — one article can legitimately contribute multiple distinct surface texts to one claim group. Fixed by insert-time dedupe in index.ts (Option A: highest extraction_confidence, tiebreak longer surface_text then lexical; explanations deduped with the identical winner set). lib.js untouched. Counts: article_claims 974→898, explanations 1,387→1,311.
2. Rebuild cleanup `.in()` with hundreds of UUIDs exceeds the PostgREST URL ceiling — fixed by chunking all cleanup deletes/selects at 100 ids (commit `68c5ddfc`).
3. `explanations_assertion_type_check` never extended for the 06C vocabulary — fixed by migration `20260809_extend_explanations_assertion_type_check` (commit `eca00157`, byte-verified, rollback documented in-file).

**Process observation (standing):** staging/CI never exercises the production-scale write path; full-corpus dry-run plus at least one real write against a throwaway namespace is the only way this class of bug surfaces. Also on record: `syndicated_articles = 0` on the current corpus (verified two ways) — the syndication-collapse UI path is live but unfired; `syndicated_single_source` flags (57 claims) mean "single independent outlet," not wire collapse. `SOURCE_COMPARISON_RUN_KEY` rotated post-closure. Repair commits: `3991aea` (tokenize hoist; supersedes `cf32f75` which carried a transcription error caught by byte-verify before any deploy), `0d3c93ea` (dedupe), `68c5ddfc` (cleanup chunking), `eca00157` (constraint migration).

### 06D — Document 07: Callais Cross-Surface Ingestion Canary — NEW SECTION, 2026-08-08

Not previously tracked in the Index (Document 07 postdates the 2026-08-05 version). Cross-surface ingestion test using real coverage of the Louisiana v. Callais Supreme Court ruling (April 29, 2026) and downstream redistricting effects, capped at 300 articles shared across all tracks.

Infrastructure (completed same session):
- Migration `add_pre_ruling_tag_columns_to_articles` applied: `is_pre_ruling` + `different_causal_chain`, both boolean not null default false, zero backfill writes to existing 699 rows. Byte-hashed, rollback documented pre-apply, verified live in information_schema.
- batch-intake v2 deployed (commit `c5b39e69`) — schema accepts both flags; byte-verified remote vs. local; redeployed as version 3, ACTIVE, independently read back and matching.
- Canary manifest: 29 rows finalized — 8 pre-ruling / 21 post-ruling, 14 news_wire / 16 advocacy_legal. Every URL confirmed. A livestream excluded as non-ingestible (not counted in the 29). Two additional approving sources (PILF, HEP/ALEC) added via a manifest-only balance pass, explicitly not a standing universe change. Date floor extended to 2025-10-14 (oral reargument day). `BATCH_INTAKE_RUN_KEY` set directly in Supabase by the owner, value never shared in chat — confirmed only via the 503→401 gate flip. Rotation recommended since the raw curl command (with key placeholder) did pass through chat text; the key value itself never appeared in any artifact.

Ingestion — COMPLETE 2026-08-08:
- Attempt 1 (full 25-item payload, i.e. non-holdback rows): hit WORKER_RESOURCE_LIMIT mid-loop (sequential embedding computation). 13 rows had already committed (all 8 PRE + 5 post) before the crash — confirmed via read-only check before any retry. Recovery via `allow_append: true` on the same run tag, two batches of 6: 13 → 19 → 25. Zero invalid/duplicate/error rows.
- Lesson recorded and binding for future manifests: batch-intake's sequential embedding loop has a practical ceiling of ~13 articles per invocation. Chunk all future manifests at ≤10 per call.
- 4 holdbacks (AL-07, AL-08, NW-03, AL-10) held pending owner review of the 25-row results — reviewed and authorized. Fresh live-table pre-check confirmed 0 of 4 present before insert. Inserted as one chunk of 4 (`allow_append: true`, same tag). 200, inserted: 4, zero errors.

Verification (full row-level, not aggregate-only, both passes):
- 29/29 rows present; outlet, published_at, flags cross-checked field-by-field against the manifest payload — zero mismatches.
- 8 pre-ruling rows: is_pre_ruling=true AND different_causal_chain=true, all 8. 21 post-ruling rows: both false, all 21. Zero flag leakage either direction — including specifically checked on the 4 holdbacks, which sit adjacent to the tagged PRE rows.
- 29/29 have embeddings and body_text — the mid-crash partial write left no half-formed rows.
- After-count vs. pre-canary baseline: articles 699→728 (+29) ✓; tagged 0→29 (single run tag `doc07-canary-2026-08-08`) ✓; is_pre_ruling=true exactly 8 ✓; different_causal_chain=true exactly 8 ✓. All downstream counts unchanged: story_arcs 48, nodes 737, edges 398, sources 336, citations 36, entities 924, article_entities 1490, arc_entities 57, arc_events 67, arc_milestones 31, explanations 581, bias_incidents 0.

Disclosures on record: 4 rows carry headline-derived summaries (NW-08, NW-09, PRE-NW-04, PRE-AL-02 — retrieval failures, disclosed); one mid-May placeholder date resolved to 2026-05-15; outlet reference table gained new resolve-or-create rows (PILF, HEP/ALEC, Common Cause, CLC, WAFB, NOLA, etc.) — designed ingest-rss behavior, not a baseline deviation.

Current live state: All 29 rows are RAW/INERT. They are visible in the News feed (default "All" view queries articles directly, no arc/extraction filter) as bare articles — outlet chip, date, headline, summary, full-text search. Expanding one shows "None extracted," "No citations extracted," no arc badge. Invisible everywhere else — Arcs, Graph, Timeline, node panels all read story_arcs / nodes / edges / citations, confirmed untouched by the after-count. Live DB check: 0 of 29 have arc_id, entities_extracted_at, claims, or citations.

Extraction — deliberately NOT authorized. Would run as backfill-legacy's scoped mode (`?run=doc07-canary-2026-08-08`): entity extraction → claims/citation extraction → Tier-1 cosine arc assignment (existing-arc attachment or new-arc origination, with hub-entity exclusion / min-shared-entity / similarity floor / anti-snowball gates). This is the step that would move nodes/edges/sources/citations/entities/arc_* counts and make the Callais material appear in Arcs/Graph/Timeline. Explicitly held as its own separate checkpoint/session, not bundled into ingestion. Caution on record: scoped mode is the safe path; the `?reset=1` path wipes the entire arc layer and is not part of any proposal.

### Doc 13 — Scaling/Pagination Ceiling — CLOSED 2026-08-12

Every unpaginated `.select()` that could exceed PostgREST's silent 1000-row cap now paginates (keyset by `id`, composite-key keyset for `node_topics`, offset pagination for the source-comparison cleanup read). Read-path changes only — no algorithm, schema, or UI changes. One commit per site, each byte-verified after push; acceptance bar per site: fixture-seeded past-1000 proof with named rows beyond position 1000 present in the result, zero-count cleanup proof for temporary fixtures, full suite green.

Site ledger (all live on main):
- Sites 1, 2, 3, 5 (frontend loaders: node_topics composite-PK, loadGraph, loadTimeline five reads, loadOutlets) and site 4 (arc-grouped timeline, seven reads) — commit `4ca5b0f`; regression-proven in `tests/frontendPagination13.test.mjs` / `tests/arcGroupedTimelinePagination.test.mjs` (named deep rows `nd-001001`/`nd-001300`, `n-001001`/`n-001300`, outlet existing only at position 1500; flat/grouped views agree on deep rows).
- ingest-rss keyset helper (`lib.js` plain-ESM `keysetAll`) — commit `69cc315`, blob `bd87b63b…`.
- Site 6 (backfill-legacy actorsPass/topicsPass event-node reads) — commit `f331960`, blob `db6bc28…`; suite 187/187 at push.
- Site 9 (source-comparison-run rebuild cleanup event-id read; shared `pagedSelect`) — commit `9c38262`, blobs `18d8d64…`/`eef9c44…`; suite 190/190.
- Sites 7–8 (ingest-rss nodes label dedupe; citations full keyset read then client-side sort/slice to the stated most-recent 2000 — `.limit(2000)` was already silently capped at 1000) — commit `98dfb6e`, blob `00b2cc1…`; suite 194/194.
- Five Doc 13 test files — commit `9642aae`, all five blobs byte-verified; full suite 204/204.
- Final commit (verifier v4 criteria + append-only run log): `8d6f8ef`; both CI workflows (Golden regression suite, Deploy to GitHub Pages) green on it. Verifier records: `verifier/v4/doc13-pagination.md`, `verifier/runs/2026-08-11-doc13-per-site.md`.

Post-close core-table census (read live 2026-08-12, read-only publishable key): **entities 963, nodes 750, edges 411, articles 752** — zero-delta vs the 2026-08-10 20:03 UTC census, as expected: sites 6–9 are read-path-only and mutate no row counts, and both cron jobs remain `active=false`.

### Doc 15A — Atomic Centroid and Idempotent Attach — CLOSED 2026-08-12

Correctness fix, not an optimization. The defect: `attachToArc` read the arc centroid, computed the running centroid in JS, and wrote it back — a lost-update race under concurrent attach, plus a double-count when the same article attached twice. The fix: migration `20260813_atomic_arc_attach` (applied live 2026-08-12) adds `attach_article_to_arc(uuid, uuid, vector, jsonb)` — membership write, in-transaction member-count derivation, and the centroid fold in ONE SQL statement sequence, serialized on arc-row `FOR UPDATE`, idempotent via article-row `FOR UPDATE` + `already_attached` no-op (float8[] text round-trip for the fold; pgvector cannot subscript, 42804). Deliberate, owner-approved failure-contract change: a centroid failure now rolls back the membership too (retryable), replacing the silent try/catch. Both `attachToArc` callers (ingest-rss, backfill-legacy) switched to the RPC; arc-selection logic untouched (0.78 cosine floor, two-informative-entity rule, hub filtering exactly as-is).

Four required tests, before-state first then after-state, live DB (`verifier/runs/2026-08-12-doc15a-atomic-attach.md`):
- T1 concurrent distinct attaches: BEFORE lost A's contribution (0.045 written vs correct 0.06) — premise proven; AFTER serialized, centroid exactly 0.06, delta 0.
- T2 concurrent duplicate attach: AFTER second call returned `already_attached`, centroid unchanged, exactly one membership.
- T3 sequential duplicate attach: BEFORE re-fold double-counted (0.035 vs correct 0.03); AFTER idempotent no-op, 0.03 held.
- T4 partial failure: BEFORE orphaned state reproduced (membership landed, centroid stale); AFTER forced intra-function failure rolled the membership write back — neither direction orphaned.

Push ledger (all blobs byte-verified after push): migration + test file + verifier v6 records — commit `4decac7`; ingest-rss caller switch (one byte-exact re-push after verify caught 3 transcription errors) — verified blob `660fbe64…`; backfill-legacy caller switch (one byte-exact re-push after verify caught a 1-char transcription error) — commit `85ad23e`. Unit suite 212/212 (204 baseline + 8 new drift-guard tests in `tests/atomicAttach15A.test.mjs`). Both CI workflows (Golden regression suite, Deploy to GitHub Pages) green on final commit `85ad23e`.

Post-close census (read live 2026-08-12): **articles 752, story_arcs 49, attached 189** — zero-delta vs the pre-run census, as expected: this is a write-path correctness fix, not a data change; all scratch fixtures deleted, and both cron jobs remain `active=false`. Recorded, not fixed (owner-directed): if an article ever moves from Arc A to Arc B, Arc A keeps a stale contribution indefinitely — inherited, out-of-scope limitation, noted in the verifier record.

### Doc 08 — Project 2025 Tracker, Track 1 (DOJ Civil Rights Division Enforcement Posture) — STAGE D CLOSED 2026-08-12

First track of the Project 2025 tracker: the DOJ Civil Rights Division enforcement-posture goals stated in Mandate for Leadership Chapter 17 (pp. 545–580, Gene Hamilton), tracked on the existing 02C Phase 3A stated-objective / actual-outcome lifecycle. Staged rollout per the working document: Stage A (read-only candidate manifest) COMPLETE and owner-approved 2026-08-12; Stage B (dry-run classification, zero writes) COMPLETE 2026-08-12; Stage C (six-goal canary write) COMPLETE 2026-08-12; **Stage D (owner review) CLOSED 2026-08-12 — all four review items accepted**: candidate scope (6 of 8 written; #1/#6 correctly held), schema fit (policy-only shape; reserved nullable `source_locator` extension column on `p3_policy_track_event` accepted as-is), sourcing-tier results (all locators page-verified from Stage A, zero drift into the write), rollback proof (single `method_version` tag scopes deletion to exactly this batch).

Schema (additive only, migration `add_p2025_track1_agency_and_source_locator`; repo mirror `supabase/migrations/20260812_p2025_track1_agency_source_locator.sql`, rollback documented in-file):
- `p3_policy.agency text` — single-valued owning agency (Track 1: always DOJ), policy-only placement; track events reach it via the `policy_id` FK (owner decision 2026-08-12: no duplication).
- `p3_policy.source_locator jsonb` + shape CHECK requiring keys `{chapter, chapter_title, pages, edition}` — provenance anchor to the origin document; chapter is the stable unit, pages are edition-specific, edition carries the 2023-04-21 publication stamp.
- `p3_policy_track_event.source_locator jsonb` — RESERVED extension point (real nullable column + COMMENT ON, by owner-confirmed design) for a future actual-outcome event whose source differs from the stated-objective source (e.g. a court docket). NULL and unused for all Stage C rows; no read path consults it.

Canary ledger (run tag `p2025-track1-canary`; every event `method_version='p2025-track1-stageC-v1'`, track `stated_objective` / state `stated_objective`, `event_date 2023-04-21`, `review_status='draft'` — Stage C establishes that the goals exist; no outcome statuses were resolved, and none from recall):

| Goal | Stated objective (abbrev.) | Locator |
|---|---|---|
| #2 | Review all consent decrees and settlement agreements in force | Ch. 17, p. 557 |
| #3 | Seek to terminate unnecessary or outdated consent decrees | Ch. 17, p. 557 |
| #4 | Consider intervention where decrees bind parties years/decades later | Ch. 17, p. 557 |
| #5 | Enact policies/regulations prohibiting settlement payments to third parties | Ch. 17, p. 557 |
| #7 | Reorganize and refocus the Civil Rights Division; first-year prosecutorial push | Ch. 17, pp. 561–562 |
| #8 | Reassign 18 U.S.C. § 241 election-offense prosecution from CRT to Criminal Division | Ch. 17, p. 562 |

**Goals #1 and #6 remain unwritten by design, not by omission.** Both are real stated objectives whose progress may be structurally unobservable from public records; their `not_publicly_observable` handling (missing_evidence marker + explicit remaining_uncertainty token, per Stage B) was designed but has not been exercised. Writing them is Stage E scope, not a backlog item to drift into.

Verification: single-transaction write of 12 rows (6 policies + 6 events); byte-verify re-selected every row field-by-field against the owner-approved Stage B constructions — 6/6 goals, zero field mismatches. Full suite 212/212. Both CI workflows (Golden regression suite, Deploy to GitHub Pages) green on final commit `0fd92c3` (migration mirror byte-exact, SHA-256 matched both sides). Consistency check (corrected policy-only expectation): 6/6 policy rows `agency='DOJ'` with all four locator keys; 6/6 events carrying neither field.

Zero-delta census confirmation (read live 2026-08-12): articles 752, `p3_legal_case` 2 with both fixtures (Chow, Wells) `reviewed`, Doc 07 canary `doc07-canary-2026-08-08` still 29 rows RAW/INERT — Doc 08 shares no rows, no run tag, and no dependency with Doc 07; per-goal overlap check at Stage B was no-intersection for all 8 goals.

**Stage E is NOT authorized.** No scope ceiling proposed, no expansion plan drafted, goals #1/#6 not written. Stage E requires its own separate owner authorization with an explicit scope ceiling set at that time, per the working document's staged-rollout gate. This is a deliberate pause point.

### Doc 16 — Account Pipeline — CLOSED 2026-08-13

Magic-link account pipeline shipped behind the `account_ui` pipeline_config flag (withhold posture: unreadable → false). All evidence in `verifier/runs/2026-08-13_run4.md` through `run7.md` (repo mirror) and the session screenshots.

Schema and trigger (namespaced — shared Supabase project `SUPABASE_PRODUCTION_REF_REDACTED` also hosts Threshold; `public.profiles` and neighbors belong to Threshold and were not touched):
- `public.mip_profiles` — migration `20260813_mip_profiles.sql` (applied history version `20260812175607`): `id uuid PK references auth.users(id) on delete cascade, display_name text, created_at timestamptz not null default now()`; RLS enabled from creation; policies `mip_profiles_select_own/insert_own/update_own`, all `auth.uid() = id`; no delete, no public read.
- `public.handle_new_mip_user()` + trigger `on_auth_user_created_mip` — migration `20260813_scope_mip_signup_trigger.sql`: security definer, `set search_path = public`, inserts only when `new.raw_user_meta_data->>'app' = 'mip'`, `on conflict (id) do nothing`. Scoped to MIP signups by metadata key (not domain gating), so Threshold signups produce zero mip_profiles rows.

Frontend: `src/lib/auth.js` (`MIP_USER_METADATA = { app: 'mip' }`, `sendMagicLink` via `signInWithOtp` with `options.data` verified wired in built bundle, session detection, `useAuthSession` hook), `src/panels/AccountPanel.jsx` (idle/sending/sent/error states, expired-link notice from URL hash, signed-in view with display_name/email + Log out), `src/styles/auth.css`, `tests/auth.test.mjs` (4 tests). `account_ui` flag migration `20260813_account_ui_flag.sql`. Commits `3c9bf74`, `a2c5339`, `ac3446c`, `6782546` — all blobs byte-verified, CI green.

Acceptance (all four criteria met):
1. Cross-user SELECT rejection — proven: JWT sub=B sees own row only (`rows_visible_to_B=1`, `a_row_visible_to_B=0`).
2. Cross-user UPDATE rejection — proven asymmetric: B's UPDATE of A's row silently no-ops (A's row unchanged `'User A'`); B's own-row update succeeded. INSERT with foreign id rejected `42501: new row violates row-level security policy for table "mip_profiles"` verbatim (same error-form bar as the anon proof).
3. Session persistence — owner-confirmed: close/reopen retains login.
4. Logout/login round-trip — owner-confirmed: same profile returned, no duplicate row.

Cleanup per Rule 10: all test rows/sessions were created inside rolled-back transactions (BEGIN…ROLLBACK) — zero-count proof, no residue (auth.users count unchanged). No orphaned rows from the owner's earlier rate-limited manual attempt.

### SMTP / email delivery — CLOSED 2026-08-13

Supabase Auth now routes through custom SMTP (Resend); magic links deliver. **Known limitation:** currently sending from the shared `onboarding@resend.dev` address, which restricts delivery to the Resend account owner's email only. A verified custom sending domain is required before magic links can reach arbitrary recipient addresses — i.e. before real multi-user signup is viable. Domain purchase is the owner's next action, not yet scheduled.

### Security Advisor — public.duplicate_actor_label_monitor — CLOSED 2026-08-13

Recreated `WITH (security_invoker = true)` (view definition byte-identical pre/post), overbroad INSERT/UPDATE/DELETE grants revoked from anon/authenticated. Migration `20260813_secure_monitor_view_invoker.sql` (rollback documented in-file), commit `6dc76e0`, byte-verified push, CI green. Before/after proof: result set identical and empty — 0 rows service-role and 0 rows anon-role probe, both before and after (empty stayed empty, proven by count, not by absence of error).

### Security Advisor — public.feed_posts — OUT OF SCOPE (flagged, not MIP's object)

Investigated read-only 2026-08-13: `feed_posts` is absent from MIP's entire migration history and reads Threshold's tables (`posts`, `profiles`, …) — it belongs to the Threshold application on the same Supabase project. Latent exposure on record: the view is SECURITY DEFINER over `profiles.username`/`avatar_color`, and Threshold's `profiles` carries no select policy, so the invoker-facing posture leaks those fields to any role the view is granted to. Recorded here as an out-of-scope finding to hand to Threshold's owner; MIP made no change to it, per the standing rule against touching Threshold's objects.

### Next authorized action

Four open threads:
- (b) ~~G-ALG-1 full functional verification~~ — RESOLVED 2026-08-09; this entry was stale (same class of drift as the r4/r5 and Doc07 cap issues caught 2026-08-10). Verification closed earlier in the session: endpoint rename commit `0b435aa`, graph-analysis-run v15 deployed (source byte-identical to main), two-call insert/reuse verified against production hashes, key rotated post-verification. See 06B.
- (c) Document 07 extraction (06D) — attach 00_INDEX + 07_DOC07_CALLAIS_CANARY as its own dedicated session/checkpoint. Authorizes backfill-legacy scoped mode against `doc07-canary-2026-08-08` only. Do not bundle with other scope.
- (d) Phase 3 (02C) continued build — attach 00_INDEX + 02C_PHASE_3_LEGAL_POLICY for any further Phase 3 work beyond what's already shipped and live internally. Unchanged.
- (e) Track B Step 1 — deployment status still unconfirmed; needs verification before any token values are treated as deployed.
- (f) ingest-rss cron re-enable — `mip-ingest-rss-daily` has been `active=false` since containment; re-enabling it is its own scoped action requiring explicit owner authorization (schedule confirmation, then post-enable first-run verification against the after-count discipline). Not bundled with any other thread; `mip-backfill-legacy` stays `active=false` under Rule 13 regardless.
- (g) Resend custom sending domain — owner action, not yet scheduled. Required before magic links reach arbitrary recipients (real multi-user signup). See SMTP closure above.

No further database mutations, ingestion, cron activation, UI work, or scope expansion beyond the selected item/document without explicit owner authorization.

### Completed-work checklist (as of 2026-08-13)

- Phase 0 (01) — all six tiers verified-closed; Tier 3 RE-VERIFIED 2026-08-10 via gate round 3 (owner-marked PASS) after the r5→r6 guard closure; golden suite 171/171 at commit `0bed8c59` (the 47/47 figure below is the Phase 0 closure historical)
- G2 shared uncertainty vocabulary — locked, owner-countersigned 2026-07-28
- Phase 1 (02A) — spec amendments approved, closure commit `e3d28ad5`
- Phase 2 (02B) — provenance/explanation object built, owner sign-off 2026-07-31
- Phase 2 post-closure — auto-promotion executed 2026-08-03, then reversed 2026-08-07 (0 rows currently auto_verified)
- 06A — Cloud Run extraction microservice Step 0, deployed and verified
- 02C Phase 3 — internal beta authorized, read path + beta UI shipped, CI-confirmed green, LIVE 2026-08-05
- G-ALG-0 / G-ALG-1 — shipped, CI-confirmed green as of `b8a14a59`; G-ALG-1 functional verification CLOSED 2026-08-09 (commit `0b435aa`, graph-analysis-run v15, insert/reuse verified against production hashes, key rotated)
- CI regression fix — CLOSED 2026-08-05 (missing dependency + poisoned mirror registry + stale workflow assumption, all three root-caused and fixed)
- 06C Source Comparison View — CLOSED 2026-08-09: live full-corpus write verified (347 events / 839 claims / 898 article_claims / 413 event_articles / +1,311 explanations), zero-delta on other 12 core tables, owner UI check passed, key rotated; three latent write-path bugs surfaced and repaired same day (dedupe Option A, cleanup chunking, assertion_type CHECK extension)
- 06D Document 07 Callais canary — ingestion COMPLETE 2026-08-08, 29/29 rows verified row-level and count-matched; extraction deliberately held as separate checkpoint
- Manual pre-demo ingest-rss runs (2026-08-09, 0801Z/0804Z) — articles 728 → 744 and graph-layer deltas itemized in the two runs' verifier records; folded into the census above
- 04_ADDENDUM_STEP3_ARC_GROUPED_TIMELINE — CLOSED 2026-08-10 (shipped, verified; corrects stale "Not started")
- 05_CROSS_WINDOW_NAVIGATION — shipped, CLOSED (owner-confirmed 2026-08-12; corrects stale "Not started")
- 13_SCALING_PAGINATION_CEILING — CLOSED 2026-08-12, all nine sites + tests banked per-site, final commit `8d6f8ef`, CI green, post-close census entities 963 / nodes 750 / edges 411 / articles 752
- 15A_ATOMIC_CENTROID_IDEMPOTENT_ATTACH — CLOSED 2026-08-12, migration `20260813_atomic_arc_attach` + both callers on RPC, four before/after tests passed (race loss, duplicate double-count, orphan state all reproduced before; all exact after), final commit `85ad23e`, CI green, zero-delta census articles 752 / story_arcs 49 / attached 189
- 08_PROJECT2025_TRACKER Track 1 — STAGE D CLOSED 2026-08-12: six-goal canary (#2/#3/#4/#5/#7/#8) written under run tag `p2025-track1-canary`, migration `add_p2025_track1_agency_and_source_locator`, final commit `0fd92c3`, CI green, zero-delta census; goals #1/#6 unwritten by design; Stage E NOT authorized
- 16_ACCOUNT_PIPELINE — CLOSED 2026-08-13: `mip_profiles` + scoped `on_auth_user_created_mip` trigger (migrations `20260813_mip_profiles`, `20260813_scope_mip_signup_trigger`), magic-link UI behind `account_ui` flag, all four acceptance criteria met (two owner-confirmed), zero-residue cleanup, commits `3c9bf74`/`a2c5339`/`ac3446c`/`6782546`, CI green
- SMTP/email delivery — CLOSED 2026-08-13 via custom SMTP (Resend); shared `onboarding@resend.dev` limitation on record, custom domain is owner's next action
- Security Advisor duplicate_actor_label_monitor — CLOSED 2026-08-13: recreated `security_invoker=true`, write grants revoked, migration `20260813_secure_monitor_view_invoker`, commit `6dc76e0`, CI green, 0/0 before/after proof
- Security Advisor feed_posts — flagged OUT OF SCOPE 2026-08-13 (Threshold's object; handed to Threshold's owner; no MIP change)
- 561 awaiting_review rows — structurally blocked on provenance-completeness backfill, not yet scoped
- Backlog Item 2 (Silence Detection Dashboard) — not started
- Track B (04) — Step 1 authorized to run in parallel, deployment still not confirmed
