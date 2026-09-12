# Independent native PostgreSQL verification of PR #151 — attempt 3 inspected

**Production remains ON HOLD. PRs #149, #150, and #151 stay draft and unmerged.**

This is an isolated transactional/interface verification record. It is not semantic qualification, production readiness, owner acceptance, or release approval. Frozen implementation, workflows, packet files, prior findings, and owner acceptance were not modified.

## Disposition

**Native suites: OBSERVED PASS of the four authorized invocations on owner-initiated attempt 3.** Overall production-readiness remains **ON HOLD / NOT APPROVED.** F1/F3/F6 and semantic qualification remain **open**.

This reviewer is distinct from the implementation run. The owner (`jkelsen13-tech`) initiated a fresh rerun of existing workflow run `34606754290`. This review inspects **attempt 3** only. Implementation CI **attempt 1** was not used. An earlier owner rerun **attempt 2** exists and was not used as this requested fresh execution.

The earlier **execution-access blocker** (reviewer token HTTP 403 on `workflow_dispatch` / rerun, watches through `2026-09-12T04:45:54Z`) is preserved below as history. It no longer blocks this native-test inspection because the owner started a new attempt and this reviewer could read that job’s logs.

## Reviewer identity

| Field | Value |
|---|---|
| Distinct from implementation run | yes — implementation run `codex-root-post-review-reconciliation-20260911` is excluded |
| Cursor agent `bcId` | `bc-01a09268-4963-7ccc-887c-79556bb880d0` |
| Agent name | Pr 151 postgresql verification |
| Model | Cursor Grok 4.6 (`cursor-grok-4.6-xhigh`) |
| Agent URL | https://cursor.com/agents/bc-01a09268-4963-7ccc-887c-79556bb880d0 |
| Source | mobile |
| GitHub CLI login used to read logs | `cursor` |
| GitHub MCP `get_me` login | `jkelsen13-tech` (owner-linked MCP; not used to claim this reviewer initiated the rerun) |
| Reviewer initiated workflow | no (still cannot; historical 403s stand) |
| Owner initiated this verification run | **yes** — `triggering_actor=jkelsen13-tech` on attempt 3 |
| Event | `pull_request` rerun of run `34606754290` |

Personal contact details from agent or git metadata were omitted from this public record.

## Frozen candidate (verified)

| Field | Expected | Observed |
|---|---|---|
| Repository | `jkelsen13-tech/media-intelligence-platform-v2` | match |
| PR | #151 | open, draft, unmerged |
| Branch | `codex/post-review-reconciliation-20260911` | head still `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` |
| Commit | `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` | run `head_sha` match; object type `commit` |
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

No hash mismatch. Inspection of implementation sources stopped at this authorized set. `supabase/migrations` was not listed and was not inspected. Node/browser suites were not run. Unrelated workflow logs were not retrieved.

## Execution record (attempt 3 — requested fresh native job)

| Field | Value |
|---|---|
| Run | https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34606754290 |
| Attempt inspected | **3** |
| Job | `concurrent-transactions` `103501954636` |
| Job URL | https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34606754290/job/103501954636 |
| Trigger actor | `jkelsen13-tech` (owner) |
| Event | `pull_request` |
| Job started / completed | `2026-09-12T05:02:23Z` / `2026-09-12T05:03:05Z` |
| Job conclusion | `success` |
| Run `head_sha` | `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` |
| Actual checkout SHA | `b7bccc24ce8987d1db50c24575ff67e01b24611c` (`refs/remotes/pull/151/merge`) |
| Checkout tree | `b81e3d75be73205f69bcefc1681203050552ec07` (**equals expected candidate tree**) |
| Merge parents | `6c716619d3b312682dba2c4c8211936f7f911895` + `ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` |
| Postgres image | `postgres:17.6` digest `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929` |
| `MIP_PG_VERSION` | `PostgreSQL 17.6 (Debian 17.6-2.pgdg13+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit` |
| Observed isolation level | **not printed** (authorized sources never `SET` isolation; no witness invented) |
| Step env | `MIP_DISPOSABLE_POSTGRES: comparison-qualification` |
| `GITHUB_ACTIONS` | set on the postgres service `docker create`; not printed in the Python step env block; all four harnesses completed (they exit unless both guards are true) |
| Artifacts | none (`total_count=0` on the run) |
| Log command | `gh run view 34606754290 --job 103501954636 --log --attempt 3` (login `cursor`; succeeded) |
| Attempt 1 | job `103286951825` (`2026-09-11T13:51:57Z`) — **not used** |
| Attempt 2 | job `103501796072` (`2026-09-12T05:01:04Z`) — owner rerun; **not used** as this requested fresh execution |

Checkout SHA differs from the candidate head because GitHub PR jobs check out the synthetic merge ref. That is an explained synthetic checkout, not a tree mismatch.

Sanitized log excerpt (password redacted): `SANITIZED_ATTEMPT3_LOG_EXCERPT.md`.

## Per-suite results from attempt 3 stdout

Counts below are **inspected unittest lines**, not assumed expected totals. No unittest `FAIL:` / `ERROR:` / `FAILED (` lines appeared in the four Python steps. `ResourceWarning: unclosed file` lines appeared (264 in the raw log) and did not fail the job. Postgres container logs later printed PL/pgSQL `ERROR:` raises used by the tests as denials; those did not fail the job.

### 1. `python3 -B verifier/comparisonPostgresConcurrency.py`

`Ran 14 tests in 6.766s` → **OK**. Observed: **14 pass, 0 fail, 0 skip**.

| Test | Result | `MIP_PG_LOCK_OBSERVED` in this test |
|---|---|---|
| `test_duplicate_enqueue_waits_and_converges` | ok | `{blocked:125, holder:124}` |
| `test_claim_skips_locked_generation_and_rollback_preserves_budget` | ok | none (source has no `blocked()` call) |
| `test_completion_visibility_and_concurrent_exact_retry` | ok | `{115,114}` |
| `test_rolled_back_completion_has_no_visible_output_or_acknowledgement` | ok | `{173,172}` |
| `test_stale_completion_rechecks_committed_replacement_lease` | ok | `{229,228}` |
| `test_locked_exhausted_row_does_not_block_independent_work` | ok | none |
| `test_failure_commit_blocks_completion_and_exact_report_converges` | ok | `{134,133}` and `{138,134}` |
| `test_completion_commit_rejects_waiting_failure` | ok | `{106,105}` |
| `test_failure_rollback_allows_waiting_completion` | ok | `{155,154}` |
| `test_source_capture_keeps_one_snapshot_during_committed_multi_table_correction` | ok | `{204,203}` |
| `test_source_capture_retention_and_queue_rollback_are_invisible_to_observer` | ok | none |
| `test_selection_rechecks_predecessor_after_concurrent_commit` | ok | `{181,180}` |
| `test_selection_rollback_and_concurrent_retry_preserve_withdrawal` | ok | `{192,191}` printed twice |
| `test_bound_release_rechecks_head_after_concurrent_withdrawal` | ok | `{81,80}` |

Sessions in this harness `set role service_role` after connecting as `postgres` on loopback `127.0.0.1:5432`.

### 2. `python3 -B verifier/pr149AuthorityOrdering.py --baseline`

`MIP_AUTHORITY_MODE=frozen-543e423-counterexample`. `Ran 7 tests in 2.459s` → **OK (skipped=4)**. Observed: **3 pass, 0 fail, 4 skip**.

Passing counterexamples (defects reproduced — **not** “baseline is secure”):

| Test | Result | Markers |
|---|---|---|
| `test_completion_paused_after_initial_authorization_then_revoke_commits` | ok | lock `{237,236}`; `MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED`; `MIP_COUNTEREXAMPLE_REVOCATION_AFTER_INITIAL_AUTH=confirmed` |
| `test_cross_runtime_claim_and_completion_replay` | ok | `MIP_COUNTEREXAMPLE_REPLAY_RETAINED_INPUT=confirmed`; `MIP_COUNTEREXAMPLE_REPLAY_SUCCESS_WITHOUT_TOKEN=confirmed` |
| `test_outstanding_lease_is_not_permission_after_revocation` | ok | (same assertion as corrected mode) |

Intentional correction-only skips:

| Test | Skip reason printed |
|---|---|
| `test_completion_acceptance_first_delays_revocation_until_commit` | `ordering fence exists only in corrected contract` |
| `test_concurrent_identical_claim_retry_converges_without_second_lease` | `new request serialization` |
| `test_concurrent_foreign_claim_waits_then_denies_without_consuming_work` | `cross-runtime first-use race` |
| `test_producer_retry_receipt_owner_and_new_session_same_owner` | `producer ownership regression` |

### 3. `python3 -B verifier/pr149AuthorityOrdering.py`

`MIP_AUTHORITY_MODE=corrected-contract`. `Ran 7 tests in 5.672s` → **OK**. Observed: **7 pass, 0 fail, 0 skip**.

| Test | Result | Lock / marker |
|---|---|---|
| `test_completion_acceptance_first_delays_revocation_until_commit` | ok | `{306,296}` |
| `test_completion_paused_after_initial_authorization_then_revoke_commits` | ok | `{314,313}`; `MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED` |
| `test_concurrent_foreign_claim_waits_then_denies_without_consuming_work` | ok | `{335,334}` |
| `test_concurrent_identical_claim_retry_converges_without_second_lease` | ok | `{350,349}` |
| `test_cross_runtime_claim_and_completion_replay` | ok | no lock line immediately before the ok |
| `test_outstanding_lease_is_not_permission_after_revocation` | ok | no lock line immediately before the ok |
| `test_producer_retry_receipt_owner_and_new_session_same_owner` | ok | no lock line immediately before the ok |

### 4. `python3 -B verifier/candidateInterfacesPostgres.py`

`Ran 6 tests in 8.034s` → **OK**. Observed: **6 pass, 0 fail, 0 skip**. File header states these are implementation-agent native tests. Independent execution of that file is still not independent proof that coverage is complete.

| Test | Result | Lock / marker |
|---|---|---|
| `test_completion_acceptance_first_delays_revocation_until_commit` | ok | `{451,428}` |
| `test_completion_paused_after_initial_authorization_then_revoke_commits` | ok | `{459,458}`; `MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED` |
| `test_concurrent_foreign_claim_waits_then_denies_without_consuming_work` | ok | `{493,492}` |
| `test_concurrent_identical_claim_retry_converges_without_second_lease` | ok | `{531,530}` |
| `test_cross_runtime_claim_and_completion_replay` | ok | no lock line immediately before the ok |
| `test_outstanding_lease_is_not_permission_after_revocation` | ok | no lock line immediately before the ok |

Postgres stop-container log `ERROR:` messages observed (job still succeeded): `unbound publication selection`, `invalid or expired comparison lease`, `stale selection predecessor`, `mip_authz_revoked_session`, `mip_request_replay_owner`.

## Coverage limitations (not closed by this green native job)

1. Implementation-authored tests: independent **execution** ≠ independent **coverage**.
2. Isolation level is never selected or asserted; this job did not print one.
3. Original suite binds `service_role`. Interface suite then revokes `service_role` from the qualification schema in the disposable database only.
4. `002_candidate_interfaces.sql` defines `worker_fail`; the Python interface suite never calls it.
5. No interface-suite equivalent of `test_producer_retry_receipt_owner_and_new_session_same_owner`.
6. Native suites do not execute `worker.js` or Node/browser tests.
7. Queue selection is skip-locked / synthetic enqueue, not source-scoped fairness.
8. Durable process-restart / crash recovery is not exercised.
9. JWT / external workload identity / custody are absent by design in the execute-only identity stubs.
10. Production kernel ownership, production RLS, collector parity, publication eligibility, held-out semantics: not in these tests.
11. Advisory-lock fixtures (`987123`, `987149`) force a pause; they are not production contention.
12. Default-branch workflow is a subset; a mistaken `main` dispatch would silently omit suites 2–4. This job used the candidate workflow (all four invocations ran).

## Items that remain OPEN unless separately evidenced

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

**Native transactional/interface behavior:** OBSERVED PASS of these four authorized suites on owner-initiated attempt 3, at checkout tree `b81e3d75be73205f69bcefc1681203050552ec07`. Bounded to that job. Not production approval.

**Overall production-readiness:** ON HOLD. Not approved. PRs #149, #150, and #151 must remain unmerged. This document is not owner acceptance.

## Scope notes

- Frozen packet, prior findings, implementation, workflows, and owner acceptance files were not modified.
- Results live only on this separate unmerged results branch.
- No merges, deployments, production writes, provisioning, schedule changes, publication activation, trials, history rewriting, or legacy retirement.
- Proposed 101-file migration supplement was not inspected or treated as disclosed.

## History: execution-access blocker (preserved)

Recorded `2026-09-11T21:43:33Z`. This independent reviewer verified the exact candidate and authorized hashes, then **could not** start a fresh native execution.

The reviewer's GitHub integration could **list** public workflows and runs. It could not **create** a `workflow_dispatch` event or **rerun** a job. Recorded attempts (workflows and permissions were not changed):

1. `gh workflow run comparison-postgres.yml --ref ddbbbd6dc878dcb38ea0904b6ee58895853b6c26` → HTTP 403 `Resource not accessible by integration`
2. Same command `--ref codex/post-review-reconciliation-20260911` → HTTP 403
3. `POST /repos/jkelsen13-tech/media-intelligence-platform-v2/actions/workflows/comparison-postgres.yml/dispatches` with `ref=ddbbbd6…` → HTTP 403
4. `gh run rerun 34606754290 --job 103286951825` → `job … cannot be rerun` / 403
5. `gh run rerun 34606754290` → `run … cannot be rerun; Resource not accessible by integration`

Token facts used to diagnose, not to escalate: `X-Accepted-Github-Permissions: contents=read`; GitHub CLI account `cursor`; repository permission object reported `admin/maintain/push/triage/pull: false` for that token.

Local substitution was refused: harnesses exit unless `GITHUB_ACTIONS=true` **and** `MIP_DISPOSABLE_POSTGRES=comparison-qualification`. Those variables were not spoofed. Production credentials were not used. Attempt 1 of run `34606754290` was not substituted as independent evidence.

Owner action requested at that time (now fulfilled for this native gate): start one fresh native job at the frozen SHA (Option A `workflow_dispatch`, or Option B rerun of run `34606754290` as attempt ≥ 2). **Do not dispatch against `main`.** Default-branch workflow blob `21661ce14631fb299c348b9ecbd86728b0cb8a9e` is 950 bytes and runs only the original 14-test harness. The candidate workflow is 1751 bytes and runs all four invocations.

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
| 2026-09-12T04:45:54Z | none | Same state. No `workflow_dispatch`. Run `34606754290` remains attempt 1. Attempt 1 was not substituted. Held PRs still unmerged. Blocker stands. |
| 2026-09-12T05:06:12Z | **attempt 3** | Owner `jkelsen13-tech` reran run `34606754290`. Inspected job `103501954636`. Attempt 1 not used. Attempt 2 not used. Checkout tree matches expected candidate. Four authorized suites observed. Production still ON HOLD. |
