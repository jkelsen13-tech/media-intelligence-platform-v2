# Independent native PostgreSQL verification of PR #151 — execution-access blocker

**Production remains ON HOLD. PRs #149, #150, and #151 stay draft and unmerged.**

This is an isolated transactional/interface verification record. It is not semantic qualification, production readiness, owner acceptance, or release approval. Frozen implementation, workflows, packet files, prior findings, and owner acceptance were not modified.

## Disposition

**BLOCKED — reviewer could not initiate a fresh native execution.**

Inspection of the authorized starting report, current manifest, sanitized PR #151 receipt, and native-test dependencies completed at the exact candidate. One reviewer-directed run of `Comparison PostgreSQL concurrency` (or a fresh attempt of its exact-candidate `concurrent-transactions` job) was **not** obtained. Prior implementation-authored CI run `34606754290` was **not** substituted as independent evidence. Job logs of that run were **not** retrieved.

Native transactional/interface behavior: **NOT OBSERVED by this reviewer.**
Overall production-readiness: **ON HOLD / NOT APPROVED.**

## Reviewer identity

| Field | Value |
|---|---|
| Distinct from implementation run | yes — implementation run `codex-root-post-review-reconciliation-20260911` is excluded |
| Cursor agent `bcId` | `bc-01a09268-4963-7ccc-887c-79556bb880d0` |
| Agent name | Pr 151 postgresql verification |
| Model | Cursor Grok 4.6 (`cursor-grok-4.6-xhigh`) |
| Agent URL | https://cursor.com/agents/bc-01a09268-4963-7ccc-887c-79556bb880d0 |
| Source | mobile |
| GitHub CLI login used for Actions attempts | `cursor` |
| GitHub MCP `get_me` login | `jkelsen13-tech` (owner-linked MCP; not used to claim owner-initiated execution) |
| Reviewer initiated workflow | attempted, **failed** |
| Owner initiated this verification run | **no** |
| GitHub trigger actor for a fresh native run | **none** (no new run) |

Personal contact details from agent metadata were omitted from this public record.

## Frozen candidate (verified)

| Field | Expected | Observed |
|---|---|---|
| Repository | `jkelsen13-tech/media-intelligence-platform-v2` | match |
| PR | #151 | open, draft, unmerged |
| Branch | `codex/post-review-reconciliation-20260911` | head still `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` |
| Commit | `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` | object fetched; type `commit` |
| Tree | `b81e3d75be73205f69bcefc1681203050552ec07` | `git rev-parse ddbbbd6^{tree}` match |
| Manifest path | `verifier/mip-production-cutover-review-v1/disclosure-manifest-post-review.json` | present at candidate |
| Manifest SHA-256 | `061f21964ee084257e1b3effcaa0b5c4f9057b4034ecda235bd6b918dcdebf59` | match (14560 bytes) |
| PR #149 | unmerged | open draft `6c716619d3b312682dba2c4c8211936f7f911895` |
| PR #150 | unmerged | open draft `b04d13980475892c921e52643599811b451a09c3` |
| PR #151 | unmerged | open draft, same head as above |

A moving branch name was not treated as identity. The commit object and tree were verified.

## Authorized-file hashes at the exact candidate

All hashes are SHA-256 of git blob bytes at `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26`. Where the current 68-file manifest lists the path, the observed hash and byte length match the manifest.

| Path | Bytes | SHA-256 | Git blob | Manifest |
|---|---:|---|---|---|
| `.github/workflows/comparison-postgres.yml` | 1751 | `96c288466b8b252b87158631f549e6ba0e015bbf90aba06e8bb6784af484a347` | `dfac22454785cd74c4a35a5f9ced3744b2d4886f` | match |
| `verifier/comparisonPostgresConcurrency.py` | 21526 | `b74ee42533583e5550f1ff09b63d4267df5f18d353b06c380363820d68c161f2` | `815902d79aa8986a54d33de1f4b9432eca181278` | match |
| `verifier/pr149AuthorityOrdering.py` | 11441 | `eed39690e7a474841ede2b5be52bbc525efa84134419c4b05a40794aca406690` | `2bf8fa85fe654d6e97e41e27410ec506b5f1977d` | match |
| `verifier/candidateInterfacesPostgres.py` | 10475 | `350b87d35fdc08ec305a7909d8311f3eec894f573d150bbd1e82cb9914ef8306` | `63bbdd65cd25906383b2ee62c4592acb71fff54a` | match |
| `verifier/pr149-authority-baseline.sql` | 45844 | `a3785a59fff944d0ee1fd6af0974e85de1f7efa9686c9ac677317d018bd2c711` | `cf3ad7270e31f717535dbcb21160725662a489ff` | match |
| `supabase/qualification/comparison-generations/contract.sql` | 12529 | `650a70f5dd8d5acacc74b73cd225d1c1755e822062e0ba88648e5a9e43715776` | `5a58066fdf10c68c0c22f112de46c06548d5708e` | match |
| `supabase/qualification/comparison-generations/selection.sql` | 4975 | `a910c8da881593c4e2d5689c6acbac0d81882531f4b1fb78589008254a416e81` | `e5b2fdbe236db31e273ef3939f3d3ed36be3b0c6` | match |
| `supabase/qualification/comparison-generations/capability.sql` | 48088 | `27a3c6dbe1344932d6a64a7016abf143ea992f1d0a4fed8541a953f45137c282` | `07777c1463dba6b20de37ed08d4fe4aefd70da1d` | match |
| `supabase/qualification/comparison-generations/source-fixture.sql` | 1883 | `80b165977c67f92a107ceb8fc9fb46c53ef880d816d08789cce96c59de45a805` | `d78c5d0edcc3f5271d3e9b15b0f4a3d989cabdcf` | match |
| `supabase/qualification/comparison-generations/source-snapshot.sql` | 2795 | `7bef311c9f551f88ca6bbb51f57b71593c64017e0931d9db4c275885c42dc968` | `401078a9921f90259904d95745708134b6c2bda8` | match |
| `supabase/qualification/mip-cutover-authority/001_execute_only_identities.sql` | 5907 | `cb4c245c04bd7e69722a7866ea94515d953f98ac8d4972837b835d6b0835c3b5` | `136204c77c0e18bce2592493db4765cdeb4c9d1b` | match |
| `supabase/qualification/mip-cutover-authority/002_candidate_interfaces.sql` | 10652 | `63f9b3ca34730c86029b446172496151849079b304ac45a0e4459a98af75790e` | `f5a9fba65d3b5bac782afd511f94c46e7e9e6315` | match |
| `verifier/post-review-2026-09-11/README.md` | 10645 | `6ebde590d5515eaf48fb8176833960c979235a72dc48bfe21e494ac769362223` | `7acbcf00049b507f8eb10b8e433726d57a37eade` | match |
| `verifier/mip-production-cutover-review-v1/disclosure-manifest-post-review.json` | 14560 | `061f21964ee084257e1b3effcaa0b5c4f9057b4034ecda235bd6b918dcdebf59` | `f67d50f8c63484a097e98399232f6f1acc5cb51d` | file SHA-256 equals expected |

No hash mismatch. Inspection stopped at this authorized set. `supabase/migrations` was not listed, not approved by this prompt, and was not inspected. Node/browser suites were not run. Unrelated workflow logs were not retrieved.

Python harnesses read only the SQL paths above (plus each other). No additional undisclosed filesystem dependency was opened. Runtime checkout of the full candidate by GitHub Actions would still materialize the rest of the tree; this reviewer did not inspect that remainder.

## Access limitation (blocker)

The reviewer's GitHub integration can **list** public workflows and runs. It cannot **create** a `workflow_dispatch` event or **rerun** a job.

Recorded attempts (all failed; workflows and permissions were not changed):

1. `gh workflow run comparison-postgres.yml --ref ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` → HTTP 403 `Resource not accessible by integration`
2. Same command `--ref codex/post-review-reconciliation-20260911` → HTTP 403
3. `POST /repos/jkelsen13-tech/media-intelligence-platform-v2/actions/workflows/comparison-postgres.yml/dispatches` with `ref=ddbbbd6…` → HTTP 403
4. `gh run rerun 34606754290 --job 103286951825` → `job … cannot be rerun` / 403
5. `gh run rerun 34606754290` → `run … cannot be rerun; Resource not accessible by integration`

Token facts used to diagnose, not to escalate:

- `X-Accepted-Github-Permissions: contents=read` on a commit GET
- GitHub CLI account `cursor`
- Repository permission object reported `admin/maintain/push/triage/pull: false` for this token
- `/user` → 403 for this token
- Actions permissions endpoint → 403

Local substitution was refused: the harness exits unless `GITHUB_ACTIONS=true` **and** `MIP_DISPOSABLE_POSTGRES=comparison-qualification`. Those variables were not spoofed. Production credentials, production DSNs, and production payloads were not used.

## Exact owner action required

An account with **Actions write** on `jkelsen13-tech/media-intelligence-platform-v2` must start **one** fresh native execution against the frozen SHA, then tell this same reviewer the new run URL (or let this agent observe it). Do not merge PRs, do not edit the workflow, do not grant production secrets, and do not change the tested implementation.

### Option A (preferred): fresh `workflow_dispatch` of the existing workflow on the exact SHA

```bash
gh workflow run comparison-postgres.yml \
  --repo jkelsen13-tech/media-intelligence-platform-v2 \
  --ref ddbbbd6dc878dcb38ea0904b6ee58895853b6c26
```

GitHub UI equivalent:

1. Open https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/workflows/comparison-postgres.yml
2. **Run workflow**
3. Select branch `codex/post-review-reconciliation-20260911`
4. After the run appears, verify `head_sha` is exactly `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26`. A branch name alone is not identity.

**Do not dispatch against `main`.** Default-branch workflow blob `21661ce14631fb299c348b9ecbd86728b0cb8a9e` is 950 bytes, SHA-256 `6b4b5772e5cec681723339eebc9566e4db57782760544ee76af911ecb2196770`, and runs only `verifier/comparisonPostgresConcurrency.py`. The frozen candidate workflow is 1751 bytes and runs all four authorized invocations. GitHub uses the workflow file from the dispatched ref; choosing `main` would be an incomplete native job.

### Option B: fresh attempt of the exact-candidate native job

On https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34606754290 use **Re-run all jobs** / re-run `concurrent-transactions` so GitHub creates **attempt ≥ 2** of that same run at SHA `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26`. That is a new attempt, not reuse of attempt 1 logs as independent proof.

### After the run starts

1. Confirm event is `workflow_dispatch` (Option A) or `pull_request` attempt ≥ 2 (Option B).
2. Confirm job `concurrent-transactions` and checkout SHA/tree.
3. If this reviewer still cannot read job logs, grant the Cursor GitHub App **Actions read** for logs/artifacts only. Prefer **not** granting this reviewer Actions write; owner-initiated dispatch is enough.
4. Reply on the agent thread https://cursor.com/agents/bc-01a09268-4963-7ccc-887c-79556bb880d0 with the run URL.

This reviewer will then inspect **only** that native job’s logs/artifacts.

## Execution record (this reviewer)

| Field | Value |
|---|---|
| Fresh run ID | none |
| Attempt | none |
| Job ID | none |
| Checkout SHA/tree from Actions | not observed |
| PostgreSQL image identity | **not observed** (workflow source specifies `postgres:17.6`; digest requires the job log) |
| Observed isolation level | **not observed** (authorized SQL/Python never `SET` isolation; Postgres 17 default is typically `read committed`, but that is not a witness from this execution) |
| `GITHUB_ACTIONS` provided by Actions | not observed |
| Guard unchanged | source-inspected; not executed |

## Per-suite results from this execution

All suites: **NOT RUN**. Counts below are **source inventory**, not inspected stdout from a reviewer-directed job.

### 1. `verifier/comparisonPostgresConcurrency.py` — original native suite

Source inventory: **14** `test_*` methods, **0** `skipIf`.

| Test | Source expects lock witness (`pg_blocking_pids`) |
|---|---|
| `test_duplicate_enqueue_waits_and_converges` | yes |
| `test_claim_skips_locked_generation_and_rollback_preserves_budget` | no (`SKIP LOCKED` path; no `blocked()` call) |
| `test_completion_visibility_and_concurrent_exact_retry` | yes |
| `test_rolled_back_completion_has_no_visible_output_or_acknowledgement` | yes |
| `test_stale_completion_rechecks_committed_replacement_lease` | yes |
| `test_locked_exhausted_row_does_not_block_independent_work` | no |
| `test_failure_commit_blocks_completion_and_exact_report_converges` | yes (two waiters) |
| `test_completion_commit_rejects_waiting_failure` | yes |
| `test_failure_rollback_allows_waiting_completion` | yes |
| `test_source_capture_keeps_one_snapshot_during_committed_multi_table_correction` | yes (advisory lock 987123) |
| `test_source_capture_retention_and_queue_rollback_are_invisible_to_observer` | no |
| `test_selection_rechecks_predecessor_after_concurrent_commit` | yes |
| `test_selection_rollback_and_concurrent_retry_preserve_withdrawal` | yes (two waits) |
| `test_bound_release_rechecks_head_after_concurrent_withdrawal` | yes |

Claimed expected result: 14 passing. **Not confirmed by this execution.**

Sessions in this harness `set role service_role` after connecting as `postgres` on loopback `127.0.0.1:5432`.

### 2. `verifier/pr149AuthorityOrdering.py --baseline` — frozen counterexamples

Source inventory: **7** tests; **4** `@unittest.skipIf(BASELINE, …)`.

Runs (expected as counterexamples, not as security success):

- `test_completion_paused_after_initial_authorization_then_revoke_commits` — baseline asserts completion **succeeds** after revoke-while-blocked; prints `MIP_COUNTEREXAMPLE_REVOCATION_AFTER_INITIAL_AUTH=confirmed`
- `test_cross_runtime_claim_and_completion_replay` — baseline asserts foreign runtime receives retained input and completion without token; prints the two `MIP_COUNTEREXAMPLE_REPLAY_*` markers
- `test_outstanding_lease_is_not_permission_after_revocation` — same assertion in both modes (`mip_authz_revoked`)

Skipped when `--baseline`:

- `test_completion_acceptance_first_delays_revocation_until_commit`
- `test_concurrent_identical_claim_retry_converges_without_second_lease`
- `test_concurrent_foreign_claim_waits_then_denies_without_consuming_work`
- `test_producer_retry_receipt_owner_and_new_session_same_owner`

Baseline fixture also asserts SHA-256 of `verifier/pr149-authority-baseline.sql` equals `a3785a59fff944d0ee1fd6af0974e85de1f7efa9686c9ac677317d018bd2c711` (verified on disk at the candidate; not executed).

Claimed expected result: 3 passing counterexample scenarios, 4 intentional correction-only skips. **Not confirmed by this execution.** Baseline success would mean historical defects were reproduced; it would **not** mean the baseline is secure.

### 3. `verifier/pr149AuthorityOrdering.py` — corrected authority suite

Same 7 tests, `BASELINE=false`. Four skip decorators inactive. Corrected paused-completion path asserts `mip_authz_revoked` and zero outputs; replay path asserts `mip_request_replay_owner`.

Claimed expected result: 7 passing, 0 skips. **Not confirmed by this execution.**

### 4. `verifier/candidateInterfacesPostgres.py` — mip interface suite

Source inventory: **6** tests, **0** skips. Calls `mip_cutover_authority.worker_*` after applying `001_execute_only_identities.sql` then `002_candidate_interfaces.sql`. `BASELINE` is hardcoded `False`. Producer capture is a fixture `mip_cutover_authority.producer_enqueue` once per test, not a seventh concurrent-producer case.

Claimed expected result: 6 passing, 0 skips. **Not confirmed by this execution.** File header states these are implementation-agent native tests, not independent review. Independent execution of that file, if later obtained, is still not independent proof that coverage is complete.

## Coverage limitations identified from authorized sources (not closed by a future green run)

A later PASS of these four invocations would still leave the following open:

1. Implementation-authored tests: independent **execution** ≠ independent **coverage**.
2. Isolation level is never selected or asserted.
3. Original suite binds `service_role`. Interface suite then revokes `service_role` from the qualification schema in the disposable database only.
4. `002_candidate_interfaces.sql` defines `worker_fail`; the Python interface suite never calls it.
5. No interface-suite equivalent of `test_producer_retry_receipt_owner_and_new_session_same_owner`.
6. Native suites do not execute `supabase/functions/source-comparison-generation-candidate/worker.js` or Node/browser tests (those were out of scope here).
7. Queue selection is skip-locked / synthetic enqueue, not source-scoped fairness.
8. Durable process-restart / crash recovery is not exercised (in-memory sessions only).
9. JWT / external workload identity / custody are absent by design in `001_execute_only_identities.sql` comments and stubs.
10. Production kernel ownership, production RLS, collector parity, publication eligibility, held-out semantics: not in these tests.
11. Advisory-lock fixtures (`987123`, `987149`) force a pause; they are not production contention.
12. Synthetic JSON payloads only (`{"value":9007199254740993,…}`, `{"claims":[]}`, empty lexicon `{"entries":[]}`).
13. Default-branch workflow is a subset; a mistaken `main` dispatch would silently omit suites 2–4.

## Items that remain OPEN unless separately evidenced

These are **not** closed by this native-test program even after a future PASS:

- source/evaluation revocation (beyond the isolated qualification RPCs)
- queue fairness
- durable restart recovery
- external identity/custody
- production permissions
- collector parity
- publication eligibility
- held-out semantics
- F1 / F3 / F6 production gaps already acknowledged (not re-litigated here)

## Conclusions

**Native transactional/interface behavior:** BLOCKED / NOT OBSERVED. Candidate identity and authorized-file hashes match. Reviewer-directed Actions execution was denied (403). No per-scenario pass/fail/skip/lock witnesses were collected by this run.

**Overall production-readiness:** ON HOLD. Not approved. PRs #149, #150, and #151 must remain unmerged. This document is not owner acceptance.

## Scope notes

- Frozen packet, prior findings, implementation, workflows, and owner acceptance files were not modified.
- Results live only on this separate unmerged results branch.
- No merges, deployments, production writes, provisioning, schedule changes, publication activation, trials, history rewriting, or legacy retirement.
- Proposed 101-file migration supplement was not inspected or treated as disclosed.

Recorded at `2026-09-11T21:43:33Z`.

## Watch log

| UTC | Fresh native run | Notes |
|---|---|---|
| 2026-09-11T22:02:07Z | none | Re-checked public Actions list. Newest Comparison PostgreSQL concurrency run for SHA `ddbbbd6…` remains `34606754290` `pull_request` **attempt 1**. No `workflow_dispatch`. Attempt 1 was not substituted. PRs #149/#150/#151/#152 still draft/unmerged. Blocker stands. |
| 2026-09-11T22:17:51Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-11T22:33:25Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-11T22:49:17Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-11T23:04:59Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-11T23:20:27Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-11T23:36:01Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-11T23:51:36Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T00:07:19Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T00:22:48Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T00:38:16Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T00:53:44Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T01:09:15Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T01:24:43Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T01:40:09Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T01:55:38Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T02:11:09Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T02:26:34Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T02:42:03Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T02:57:28Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T03:12:54Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T03:28:21Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T03:43:47Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T03:59:16Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T04:14:43Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T04:30:15Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
