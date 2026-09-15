# PR #149 authority ordering and replay correction

Production cutover **ON HOLD**. Isolated qualification only; keep PR #149 draft and unmerged.

Correction author: Codex /root, run label `codex-root-pr149-authority-543e423-20260911` (task-local label, not a provider attestation). This run authored the reproducer and corrections and is **not** the independent reviewer. A subsequent reviewer must use a separate agent run and the final frozen candidate.

## Preserved evidence

Original inspected candidate: `543e423928ecb1134c0981ed8d708f1b9ae25608`. Original Grok review in `verifier/independent-cutover-review-v1/` remains byte-for-byte unchanged and applies to its original candidate, not these corrections. Prior commits and PR #147 remain unchanged.

Before any SQL correction, reproducer commit `6c06555df75c7bfd727bf737a0ec3b3c47ecf5af` ran [native CI 34560139932](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34560139932), job 103140991935. Existing 14 tests passed. The new invocation passed 17 tests (3 authority scenarios plus an accidental duplicate discovery of the 14 existing tests through an imported class alias). Subsequent harness avoids duplicate discovery, retaining all original tests in their original invocation.

Frozen SQL copy: `verifier/pr149-authority-baseline.sql`, SHA-256 `a3785a59fff944d0ee1fd6af0974e85de1f7efa9686c9ac677317d018bd2c711`. Baseline mode asserts the defects on those unchanged bytes; corrected mode asserts rejection on current SQL. The original candidate is never rewritten to pretend it passed the corrected contract.

Confirmed counterexamples:

- Completion entered the synthetic BEFORE INSERT output trigger after initial authorization, replay lookup and lease validation. Another connection held its advisory barrier; a third committed principal revocation. While paused, no output was visible. On resumption the original candidate returned completed and committed output and acknowledgement despite the committed revocation.
- Authorized runtime B reused runtime A's worker-claim request ID and received A's generation and retained input text. Reusing A's completion request ID with a null lease token returned completed. Runtime B acquired no ownership of the original receipt; the success response nevertheless crossed the boundary.
- By contrast, an outstanding lease presented in a new completion call after revocation was already rejected. That existing behavior was not evidence about an already-executing transaction.

## Ordering under the owner brief

The retained conversation's owner brief requires revocation to serialize with claim/completion/publication and preserve history. It does not authorize forced database-session termination or retroactive erasure. The full original brief body is still not a repository artifact; this is an explicit operational interpretation for isolated qualification, subject to owner review before production.

1. Initial authorization permits work to begin, not irrevocable acceptance.
2. Revocation that commits before the final authorization fence wins: recheck rejects; the transaction rolls back output, acknowledgement and receipt together. The outstanding job remains processing until existing lease recovery policy acts; this change does not grant recovery authority.
3. If final authorization obtains the conflicting row locks first, completion may commit first. Revocation waits, then commits and blocks subsequent calls. An already durable result is retained, not erased. This is a permitted serial order, not a claim that an executing transaction was cancelled instantly.
4. An uncommitted/rolled-back completion is never visible; locks last until transaction end. Owner binding/session revocation and acceptance use conflicting row locks. See [PostgreSQL 17 locking semantics](https://www.postgresql.org/docs/17/explicit-locking.html).

The correction checks final authority while holding runtime/principal binding locks in RPC-name order and the session lock. `record_run` performs the final check after work but before its receipt, within the same transaction. Existing-receipt replay performs the same final check before returning. The principal revoker uses the same binding lock order. This is not production Auth integration and does not remove ambient unbound service-role authority.

## Replay boundary

Receipts remain globally keyed by (request ID, RPC). A collision owned by another runtime/principal raises `mip_request_replay_owner` before returning a receipt, input, generation, or success outcome. Owner identity is (runtime ID, capability principal); sessions may renew within that owner, but must be currently authorized. Changed arguments still raise `mip_request_replay_conflict`. Identical same-owner retries remain valid; claim retries still omit lease tokens. An advisory transaction lock serializes concurrent first-use/retry attempts; hash collisions only add waiting, while exact owner/argument checks determine acceptance.

Production mapping from a verified caller to these runtime/principal values remains engineering work. These tests use two separately owner-issued runtime sessions under the worker capability role; they do not claim two production JWT subjects were provisioned.

## Remaining engineering obligations — not closed

| Finding | Status | Required implementation/evidence |
|---|---|---|
| F1 | OPEN production behavior | Replace authorization stubs with implemented producer/worker/publisher APIs; bind real verified workload identities, exact least-privilege grants and custody; remove ambient bypass paths from the production execution boundary; negative identity and revocation tests. NOLOGIN role names and EXECUTE-only stubs are not working runtime behavior. |
| F3 | OPEN worker integration | Implement generation-bound atomic real-input capture, evaluated worker claims, computation over retained inputs, durable semantic outputs, conditional acknowledgement, retry/failure/recovery and backlog/delta parity in the actual worker; qualify external runtime/Auth closure and deployment parity. The v16 architecture note is documentation, not integration. |
| F6 | OPEN publication eligibility | Evaluate complete survivor privacy/rights/publication predicates and transitive dependencies; bind approved immutable output selection; fail closed on missing/ineligible/revoked evidence; serialize dependency changes and withdrawal. Stable fingerprints, including absence fingerprints, do not establish eligibility. Existing fixture release remains a synthetic mechanism test only. |

Also open: actual live source/implementation authority lifecycle, operational lease recovery/revocation policy, independent semantic corpus and labels, exact production SQL/API/security-definer owner review, supported Auth/external-runtime mapping, collector diagnosis and historical parity. No SAFE TO RETIRE result.

## Owner decisions

Approve the precise production ordering/recovery policy and workload identity/credential custody proposal; freeze semantic thresholds, split and independent source-grounded adjudication; review disclosure scope and exclusions; designate a separate review run for this new candidate; independently accept that report; separately authorize any later provisioning, trial, schedule/publication/cutover action. These are distinct from engineering implementation and CI success.

## Verification and freeze

`verifier/pr149AuthorityOrdering.py --baseline` preserves counterexamples; the normal invocation qualifies the corrected scenarios. Both import the existing disposable guard and fixed loopback PostgreSQL configuration. The existing 14-test harness and all existing Node assertions remain intact. All execution is on GitHub's disposable runner; no project files are stored on the owner's device.

The disclosure manifest includes this report, reproducer and frozen SQL. It stamps the disclosed-content commit; subsequent manifest-only stamping does not change disclosed bytes. Final exact candidate/check-out tree, all run/job results, superseded failures and limitations are recorded in the PR #149 verification receipt after checks finish. Independent review and owner acceptance remain pending.
