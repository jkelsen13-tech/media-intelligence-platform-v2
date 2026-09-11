# MIP production cutover review reconciliation — 11 September 2026

**This document is not the independent Grok review.** Grok’s original artifacts are preserved unchanged at `verifier/independent-cutover-review-v1/` and remain adversarial evidence, not ground truth.

**Production cutover:** ON HOLD. **PR #147:** unmerged (`47075711ff78393ac3b1690ddbffca615e8f20ce`, draft). This work does not merge that PR, provision credentials, change live permissions or schedules, enable publication or automatic approval, run a production trial, or retire any legacy backend.

Machine-readable companion: `verifier/mip-production-cutover-review-reconciliation-2026-09-11.json`.

## Independent verification of the frozen candidate

Frozen HEAD inspected: `47075711ff78393ac3b1690ddbffca615e8f20ce`. `capability.sql` git blob on that commit equals the blob on this branch before these corrections (`624dfb13f95013ff138147a77b5da9e06dedb8f2`). Independent PGlite probes loaded `git show 47075711:` copies of `contract.sql`, `selection.sql`, and `capability.sql` (SHA-256 `69e6544cb304c5e510a678da75e5e9a0ba6bda9f7da753ca4ee5ac144e14eff6` for frozen `capability.sql`).

Grok review bytes (unchanged; do not edit):

| File | SHA-256 |
|---|---|
| `MIP_PRODUCTION_CUTOVER_REVIEW_v1.md` | `3bedb192385a8c47f44efb00e650eb5242b296b938ab5a140c6f4c09d36937d9` |
| `MIP_PRODUCTION_CUTOVER_REVIEW_v1.json` | `a869298baa7125a65a818decb6d2fbcef0ff72badde7c5f447714815fe2b26ba` |
| `README.md` | `d4da264472f0cbe4c277c9b7976879e480f1039e13fce2a99c8c1a8ea7b2c855` |

## F1–F8 dispositions

### F1 — HIGH — Proposed runtime choices vs owner `mip_*` identities

**Classification:** CONFIRMED (design gap / missing production package; not a hidden SQL bug in the frozen isolated schema).

**Evidence:** Frozen `capability.sql` creates `qual_*` roles only. Independent probe: `pg_roles` listed seven `qual_*` names and zero `mip_*` names. `has_function_privilege(service_role, complete(...))` was true; `worker_complete` was false. `runtime-permission-proposal.json` `bind-live-workers.alternative_a` keeps live workers on unbound `service_role`; `chosen` is null. v16 `index.ts` uses `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` and `Bearer ${serviceKey}`.

**Not:** a defect that renaming `qual_*` would fix. Isolated qualification is allowed to demonstrate the ambient hole.

**Correction:** New isolated design `supabase/qualification/mip-cutover-authority/` with owner-named NOLOGIN identities, EXECUTE-only stubs, no `service_role` EXECUTE on worker/producer/publisher RPCs, no JWT subjects. **Not** a migration and **not** deployed. `qual_*` is not renamed onto `mip_*`.

**Regression:** `tests/mipCutoverAuthorityDesign.test.mjs`.

### F2 — HIGH — No frozen semantic policy, split, or independent labels

**Classification:** CONFIRMED (missing evidence). **Not an engineering defect to fill.**

**Evidence:** `evaluation-policy.json` status `proposed_not_approved`; all `measures.thresholds` null; `critical_error_threshold` null; `minimum_cases` null. Packet SHA-256 of that file on the frozen candidate remains the disclosed hash. No held-out labels or scores were invented.

**Correction:** none. Semantic-policy and adjudication remain owner-gated.

**Regression:** existing `tests/cutoverReviewPacket.test.mjs` and `tests/recordCandidateEvaluation.test.mjs` (null thresholds / not_assessed). Do not add fitted thresholds.

### F3 — HIGH — Disclosed v16 worker is not the isolated generation contract

**Classification:** CONFIRMED (architecture split). Mutable v16 is **not** equivalent to the qualified immutable-generation architecture merely because both exist in the repository.

**Evidence:** `source-comparison-run-v16/index.ts` defines `rebuildProjection` and `acknowledgeProjectionQueue` (all pending enrichment-queue rows → `succeeded`). It does not contain `comparison_qualification` or `capture_source`. Isolated `contract.sql` / `source-snapshot.sql` define `enqueue` / `complete` / `capture_source`. Live Manus recorded as v15 in packet inventory; byte equality vs repo v16 is still **NOT TESTED**.

**Correction:** Architecture note `docs/MUTABLE_V16_IS_NOT_QUALIFIED_ARCHITECTURE_2026-09-11.md`. v16 was **not** rewritten into a qualification worker.

**Regression:** `tests/mutableV16IsNotQualifiedArchitecture.test.mjs`.

### F4 — MEDIUM — Bound request-id replay acknowledgement without argument binding

**Classification:** CONFIRMED (engineering defect).

**Evidence (independently reproduced on frozen SQL):** `worker_complete` with the same `p_request` and output A then output B both returned `completed`; durable `outputs.output_payload` stayed `{claims:["A"]}`. `producer_enqueue` with the same `p_request` and a changed payload/implementation returned the first `generation_id`. Cause: `replay()` returned the existing row without comparing arguments (`capability.sql` at frozen HEAD).

**Correction:** `request_runs.argument_hash`; `replay` raises `mip_request_replay_conflict` on mismatch; identical arguments remain idempotent. Applied to bound mutating RPCs including `worker_complete`, `producer_enqueue`, `worker_fail`, `selector_select`, `publisher_propose`, `publisher_release`, `retain_parity`. Lease tokens are still not stored.

**Regression:** `tests/comparisonCapabilitySeparation.test.mjs` — “request-id replay acknowledges only identical arguments…”. Existing session-revoke and lease-omit assertions were not weakened.

### F5 — MEDIUM — `scheduler_claim` shares `claim()`; per-RPC revocation is not principal-wide

**Classification:** CONFIRMED for scheduler lease sharing. PARTIALLY CONFIRMED for revocation.

**Evidence (independently reproduced on frozen SQL):** With a single pending job, `scheduler_claim` returned a `lease_token` and subsequent `worker_claim` returned null (`stranded: true`). With extra pending jobs, a later worker could still claim a different generation — stranding is not guaranteed, but the scheduler **is** acting as a worker. After `revoke_binding(...,'worker_claim')`, `worker_complete` still returned `completed`. Bound `revoke_session` blocking `worker_complete` was already asserted in the frozen tests and remains true. Unbound `service_role.complete` still succeeds after bound revocation.

**Distinction:** Per-RPC `revoke_binding` of `worker_claim` is unbind-one-RPC, not a principal kill-switch. The missing piece was principal-wide revoke covering in-flight `worker_complete`. Session revoke was already correct.

**Correction:** `scheduler_claim` raises `mip_scheduler_not_a_worker` and does not call `claim()`. New owner fixture `revoke_principal` revokes all bindings and sessions for that runtime principal.

**Regression:** scheduler lease test; revoke_binding vs `revoke_principal` test. Existing “session revocation blocks bound completion immediately; unbound service_role complete still works” is unchanged.

### F6 — MEDIUM — Isolated producer not server-bound; publication not survivor-gate parity

**Classification:** CONFIRMED (isolated gap). Live survivor publication eligibility is still **not installed** and is not claimed.

**Evidence:** Frozen `producer_enqueue` accepted `attacker-source` / `attacker-impl`. `capture_source` remains a qualification helper granted to `service_role` with synthetic namespace `qualification-source` (intended qualification-only; left in place). Frozen `follow_publication` hashed input/output/implementation/context only. Survivor predicates live in `supabase/migrations/20260905182355_mip_nested_claim_publication_gates.sql` (`mip_private.reader_claim_surfaces`: `verified_retained_source`, approved, non-timeline, eligible+active, ≥2 outlets) — those relations are absent from the isolated capability fixture.

**Correction:** Owner fixtures `bind_source_scope` / `bind_evaluated_implementation`; `producer_enqueue` denies unbound source/implementation. `publication_dependency_hash` includes generation identity, the copied survivor reader-predicate fingerprint (not invented thresholds), and relation fingerprints for the selection-doc closure; **absence is explicit** (`…:absent`). `publisher_release` re-checks that hash after the proposed-head and gate checks so concurrent withdrawal still raises `unbound publication selection`. Isolated owner-fixture release with no public fixture tables still works (stable absence fingerprints). Mutating `public.articles` after follow fails `mip_publication_closure_mismatch`.

**Not claimed:** this isolated hash is live survivor publication eligibility, or that `reader_claim_surfaces` is present.

**Regression:** producer source/implementation tests; publication-closure mutation test.

### F7 — LOW — Packet evidence not fully bound to final HEAD

**Classification:** CONFIRMED (packet completeness of frozen `47075711`, not an SQL defect).

**Evidence:** Hashed `verification-history.json` on the frozen packet stopped at superseded `e0d240b`. Frozen `REVIEW_RESULT.review_packet_commit` is null while the disclosure manifest was stamped `60914115`. Concurrency **doc** said six scenarios; harness has fourteen `test_*` methods (independently counted in `verifier/comparisonPostgresConcurrency.py`).

**Correction:** Concurrency doc now states fourteen tests. This candidate’s disclosure allowlist includes the unchanged Grok review, this reconciliation, mip_* design, and v16 split tests. `REVIEW_RESULT` remains `PACKET_PREPARED_REVIEW_NOT_PERFORMED` — this HEAD is a new candidate, not a back-fill of Grok’s BLOCKED outcome into the frozen packet slot. Manifest `review_packet_commit` stays null until a post-hash stamp of **this** candidate.

**Regression:** packet builder/tests; concurrency doc text.

### F8 — LOW — `verify_jwt=false` and Cloud Run `--allow-unauthenticated`

**Classification:** PARTIALLY CONFIRMED as reconciliation items. REJECTED as authorization to flip JWT or redeploy Cloud Run.

**Evidence:** Packet `runtime-inventory.json` records `verify_jwt=false` on named functions (supplied inventory, not re-queried live this run). `.github/workflows/deploy-cloud-run.yml` still has `--allow-unauthenticated`. Frozen `GRANT EXECUTE` of `diagnose_*` / `bound_code` to `anon` existed; independent probe: `has_function_privilege(anon, diagnose_authorization)=true` and `has_schema_privilege(anon, comparison_qualification, usage)=false`; call error `permission denied for schema comparison_qualification`.

**Correction:** Revoke diagnose/bound_code EXECUTE from `anon`/`authenticated` in isolated SQL only. **Do not** enable JWT. **Do not** change Cloud Run.

**Regression:** anon execute grant assertion.

## What remains owner-gated or for independent re-review

This candidate closes the independently reproduced **engineering** defects F4 and F5 (scheduler + missing principal revoke), the isolated F6 producer/closure gaps, F3 documentation/tests, F1 design package (not provisioned), F7 documentation/allowlist completeness, and F8 grant hygiene. It does **not** make production cutover ready.

Still required from the owner (not invented here):

1. Freeze semantic policy, split, adjudicators, and corpus **before** any held-out scoring (F2).
2. Choose live identity binding: dedicated `mip_*` workload credentials vs remaining on `service_role` (`chosen` still null). Provisioning is a later prompt.
3. Authorize any later independent re-review of **this** HEAD (Grok reviewed `47075711`, not this tree).
4. Hash-only live Manus v15 vs repo v16 compare, if in scope.
5. Auth session mapping (`not_after` vs isolated `revoked_at`).
6. Whether `verify_jwt=false` functions stay until a later auth proposal — **do not flip from this change**.
7. Owner acceptance of MIP_PRODUCTION_CUTOVER_REVIEW_v1 after a non-null independent outcome on the candidate the owner designates.
8. Any shadow/canary, credential provision, schedule change, publication, or cutover.

Native PostgreSQL 14-test harness: still **NOT TESTED** here (CI disposable guard unchanged). Live projects were not written.
