# Independent re-review of PR #149 authority corrections

Production cutover remains **ON HOLD**. PR #149 remains draft and unmerged. This document does not edit the frozen packet, original Grok review, implementation, workflows, or owner-acceptance records.

Machine-readable companion: `MIP_PR149_AUTHORITY_REREVIEW.json`.

## Conclusions

### A. Bounded authority/replay corrections

**SEQUENTIAL_ISOLATED_CONTRACTS_CLOSED_WITHIN_TESTED_SCOPE; CONCURRENT_NATIVE_POSTGRES_ORDERING_NOT_INDEPENDENTLY_RUN; PRODUCTION_ORDERING_POLICY_STILL_OPEN.**

This is not production JWT/Auth/IAM qualification, not owner approval of ordering or recovery, and not a cutover authorization.

On the frozen candidate, source inspection plus independent sequential PGlite execution show that corrected `comparison_qualification` SQL:

- rejects foreign runtime/principal reuse with `mip_request_replay_owner` before returning retained input, generation, a receipt, or success;
- rejects changed arguments with `mip_request_replay_conflict` and leaves durable output unchanged;
- keeps identical authorized same-owner retries, including a renewed session for that owner;
- omits lease tokens on claim retry and does not insert a second receipt;
- rejects a new `worker_complete` after `revoke_principal` even when a lease token is still presented; the job stays `processing` and no output row is written.

Those sequential results used default isolation **READ COMMITTED** on PGlite. Other isolation levels were not qualified.

The concurrent races that motivated the correction — completion paused after initial authorization while revocation commits on another connection; rollback of output, acknowledgement and receipt together; the opposite “acceptance obtains the locks first” order; concurrent first-use across the ownership boundary — were **not independently executed** on native PostgreSQL 17.6. The harness exits unless `GITHUB_ACTIONS=true` and `MIP_DISPOSABLE_POSTGRES=comparison-qualification`. This run did not set those variables and did not weaken assertions. Source inspection of the lock fence is consistent with the stated design. GitHub job `103142194267` concluded success on this HEAD; that is implementation-agent evidence, not this review’s reproduction.

The production ordering/recovery policy remains a **proposal**. Isolated tests passing do not make it owner-approved. The 10 September 2026 owner-brief body is still `NOT_RECOVERED`.

No new sequential SQL defect in the bounded corrections was demonstrated.

### B. Overall production-cutover readiness

**BLOCKED.** Production cutover **ON HOLD**.

F1, F3 and F6 remain unfinished production work, accurately represented as such in the frozen packet. Independently: ambient `service_role.complete` still acknowledges after bound principal revocation; `mip_*` RPCs remain unprovisioned stubs; disclosed v16 is still a mutable rebuild that does not call `comparison_qualification`; publication fingerprints, including explicit absence, are not survivor eligibility. Semantic thresholds remain null. `OWNER_ACCEPTANCE.json` is `NOT_SUBMITTED`. PR #149 is draft, `mergedAt` null.

Known unfinished production work keeps overall readiness BLOCKED even where sequential bounded corrections hold. It does not excuse a defect in those corrections; none was newly demonstrated in sequential scope.

---

## Reviewer identity (independence)

| Field | Value |
|---|---|
| This run | `bc-01a08f0e-3fb8-78c0-bd37-deba2549320f` |
| Name | Pr 149 authority re-review |
| URL | https://cursor.com/agents/bc-01a08f0e-3fb8-78c0-bd37-deba2549320f |
| Model as reported | `cursor-grok-4.6-xhigh` |
| Source | mobile |
| Authored implementation, reconciliation, or corrections | no |
| Correction run (excluded) | `codex-root-pr149-authority-543e423-20260911` |
| Earlier review/reconciliation run (excluded) | `bc-01a08bf7-3dc0-7367-b4ff-8299823ccd2e` |
| Transcripts of excluded runs fetched | no |

This identity is distinct from both excluded runs.

## Frozen candidate (independently verified)

| Reference | SHA | This run |
|---|---|---|
| PR #149 HEAD / frozen candidate | `6c716619d3b312682dba2c4c8211936f7f911895` | Git object, GitHub commit, PR `headRefOid` |
| Disclosed-content commit | `e62de90c28fbc3f2a1ab250ebaf454a9c2d3f398` | Parent of HEAD; GitHub commit |
| Tree | `67e17702f01867569aa133acf629dbc46c842842` | `git rev-parse HEAD^{tree}` matches the sanitized receipt |
| Manifest Git blob | `d081d7a1f91a84437ca4a4f4d2407c33e47484e2` | matches receipt |
| Manifest SHA-256 | `04d28b676f15bd63acf5e96d01622d1f9d06aa4f79d68b7b6dae42e3b63f858f` | 13118 bytes |
| Operational main baseline | `1dc317200b7a928fad85d06b43351b60e2a50d92` | PR base and local `main` |
| Original inspected candidate | `543e423928ecb1134c0981ed8d708f1b9ae25608` | named in packet; capability blob matches frozen baseline SQL |
| Synthetic checkout in receipt | `cd434ffb51a437a46a7f001989dd1b9f42becb28` | **not independently verified** (named only) |

Stamp commit `6c71661` changes only `review_packet_commit` in the manifest (`null` → `e62de90…`). All 61 `hashed_files` SHA-256 values and byte lengths matched the tree at HEAD. The manifest does not hash itself.

Frozen baseline `verifier/pr149-authority-baseline.sql` Git blob `cf3ad7270e31f717535dbcb21160725662a489ff` equals `543e423:supabase/qualification/comparison-generations/capability.sql`. SHA-256 `a3785a59fff944d0ee1fd6af0974e85de1f7efa9686c9ac677317d018bd2c711`. Corrected capability SHA-256 `27a3c6dbe1344932d6a64a7016abf143ea992f1d0a4fed8541a953f45137c282`.

Original Grok files in `verifier/independent-cutover-review-v1/` are byte-identical to copy commit `09cfae7` (diff empty) and match the disclosed SHA-256 values. Outcome on that original candidate remains **BLOCKED**. Those files were not rewritten.

PR #149: draft `true`, `mergedAt` null, state `open`, 0 issue comments, 0 reviews. Sanitized receipt is the PR body. Raw CI logs and screenshots were not retrieved.

## Access

Inspected: the 61 hashed files, the manifest, and the sanitized PR receipt (body + check-run conclusions).

Executing disclosed `tests/cutoverReviewPacket.test.mjs` and `tests/mutableV16IsNotQualifiedArchitecture.test.mjs` listed/read `supabase/migrations/` only to assert qualification SQL is absent there. That directory is not in the 61-file allowlist. No other expansion.

Not accessed: production systems, credentials, Auth records, private payloads, raw CI logs/screenshots, the unrecovered owner-brief body, excluded-run transcripts.

## Evidence classes (kept separate)

1. **Source inspection** of disclosed SQL, harnesses, tests, and packet JSON.
2. **Independently executed this run:** guard rehearsal; 50 disclosed Node/PGlite tests; 17 sequential PGlite probe assertions, including baseline defect reproduction on frozen 543e423 SQL.
3. **Supplied implementation-agent/CI:** check-run and workflow-run conclusions on `6c71661` without logs. Claimed test counts in the PR body (14 / 7 / 3+4 skip / 1622 / 118 markers) were **not** independently counted from logs.
4. **Untested / missing:** native concurrent PostgreSQL 17.6 by this run; other isolation levels; production JWT/IAM; held-out semantics; authenticated browser writes; physical devices; synthetic checkout object; live v15 vs v16 bytes.

---

## Findings

Dispositions: **CLOSED WITHIN TESTED SCOPE**, **STILL OPEN**, **NEWLY IDENTIFIED**, **BLOCKED FROM VERIFICATION**.

### Revocation ordering

| ID | Topic | Disposition |
|---|---|---|
| R1 | Completion paused after initial authorization while revocation commits on another connection | **BLOCKED FROM VERIFICATION** |
| R2 | Rejection before final acceptance rolls back output, acknowledgement, and receipt together | **BLOCKED FROM VERIFICATION** |
| R3 | Opposite order: final authorization locks first; revocation waits until commit | **BLOCKED FROM VERIFICATION** |
| R4 | Outstanding lease is not continuing authority | **CLOSED WITHIN TESTED SCOPE** (sequential) |
| R5 | New requests and replay both enforce current authority | **CLOSED WITHIN TESTED SCOPE** (sequential new-complete after revoke; same-owner replay of a committed receipt). Concurrent in-flight overlap: **BLOCKED FROM VERIFICATION** |
| R6 | READ COMMITTED only | **CLOSED WITHIN TESTED SCOPE** for PGlite default `read committed`. Native PG 17.6 not independently run. Other isolation levels **not claimed** |
| R7 | Production ordering/recovery policy | **STILL OPEN** (proposed, not owner-approved) |

**Source inspection (R1–R3).** Baseline `replay`/`record_run` did not take binding locks or re-check authority before insert. Corrected `require_bound_final` documents that initial `require_bound` takes no row locks. `worker_complete` then calls `complete()` (insert `outputs`, mark job `completed`) and only afterwards `record_run` → `require_bound_final` (`FOR SHARE` on `runtime_bindings` ordered by `rpc_name`, then `FOR SHARE` on the session). `revoke_principal` takes `FOR UPDATE` on those binding rows before setting `revoked_at`. If the final fence raises, the statement transaction rolls back output, job update, and receipt together. If the fence already holds `FOR SHARE`, revocation’s `FOR UPDATE` waits. The Python pause is a synthetic `BEFORE INSERT` trigger plus session advisory lock `987149`, not a production object.

**Independent runtime.** Native concurrent tests: **NOT INDEPENDENTLY RUN**. Command `python3 -B verifier/pr149AuthorityOrdering.py` in the candidate tree exited 1 with `Only the explicit disposable GitHub Actions PostgreSQL service is allowed`. `psql` was not present. Guard not bypassed.

**Independent sequential (R4, R5).** After `revoke_principal`, `worker_complete` with the prior lease token raised `mip_authz_revoked_session`; `jobs.state` stayed `processing`; outputs for that generation remained 0.

**Supplied CI (not this run).** Run [34560544898](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34560544898) job [103142194267](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34560544898/job/103142194267) `conclusion=success` on `6c71661`. Steps “Qualify independent PostgreSQL connections”, “Reproduce frozen PR149 authority counterexamples”, and “Verify corrected PR149 authority ordering and replay” each `conclusion=success`. Logs not read.

### Replay ownership and idempotency

| ID | Topic | Disposition |
|---|---|---|
| R8 | Foreign runtime/principal reuse rejected before retained input, generation, receipts, or success | **CLOSED WITHIN TESTED SCOPE** (sequential) |
| R9 | Concurrent first-use cannot cross the ownership boundary | **BLOCKED FROM VERIFICATION** |
| R10 | Identical authorized same-owner retries remain valid | **CLOSED WITHIN TESTED SCOPE** |
| R11 | Session renewal does not silently change ownership | **CLOSED WITHIN TESTED SCOPE** |
| R12 | Changed operation arguments rejected | **CLOSED WITHIN TESTED SCOPE** |
| R13 | Claim retries omit lease tokens and do not consume extra work | **CLOSED WITHIN TESTED SCOPE** (sequential). Concurrent extra-work: **BLOCKED FROM VERIFICATION** |

**Baseline reproduction (independent, sequential PGlite, frozen 543e423 SQL bytes).** Runtime B reusing runtime A’s `worker_claim` request id received the same `generation_id` and `input_text`. Reusing the `worker_complete` request id with a null token returned `completed`. That is defect reproduction, not secure behavior.

**Corrected SQL (independent, sequential PGlite).** Foreign claim raised `mip_request_replay_owner` with `runtime-b` receipt count 0. Foreign complete with null token raised `mip_request_replay_owner`. Same-owner claim retry omitted the token (`mip_request_replay_omits_token`). Same-owner complete retry returned `completed`. Changed output raised `mip_request_replay_conflict`; durable payload stayed `{claims:[]}`. A new session for the same producer owner replayed `producer_enqueue` to the original generation id; runtime B still got `mip_request_replay_owner`.

**Source inspection (R9).** `replay()` takes `pg_advisory_xact_lock(hashtextextended(request\|\|':'||rpc, 149))` and holds it until transaction end, covering first-use `record_run` insert. Hash collisions only add waiting.

### Regression and evidence quality

| ID | Topic | Disposition |
|---|---|---|
| R14 | Generation, lease, retry, failure, scheduler, selection, withdrawal contracts in the disclosed test set | **CLOSED WITHIN TESTED SCOPE** for 50 independently executed disclosed Node tests. Native 14-test harness and claimed 1622-test matrix **not independently run/counted** |
| E1 | Node test title claims “in-flight” for a sequential revoke-then-complete | **NEWLY IDENTIFIED** (label/evidence quality, not a demonstrated SQL defect) |
| E2 | `comparison-postgres.yml` path filter omits the authority harness files | **NEWLY IDENTIFIED** (verification-process gap, not a demonstrated SQL defect) |

Independently executed disclosed tests (candidate tree, PGlite 0.5.8, assertions unchanged): 50 pass, 0 fail, 0 skipped, 17542 ms. Files: `comparisonCapabilitySeparation`, `comparisonGenerationTransaction`, `comparisonSelection`, `comparisonSourceSnapshot`, `cutoverReviewPacket`, `mipCutoverAuthorityDesign`, `mutableV16IsNotQualifiedArchitecture`, `recordCandidateEvaluation`.

Scheduler still raises `mip_scheduler_not_a_worker` without calling `claim()` (disclosed test passed). Publication gates still default false. Withdrawal/revoked-head behavior in disclosed selection/capability tests passed.

Supplied CI conclusions on `6c71661` (logs not retrieved): [34560544869](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34560544869) success (`test (22)` / `test (24)`); [34560544868](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34560544868) success (weather-preview, refinement-preview); push [34560540838](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34560540838) success. Combined GitHub commit status API returned `pending` with 0 statuses; checks are the Check Runs API, all seven `success`.

### Known open production work (must stay unfinished)

| ID | Topic | Disposition |
|---|---|---|
| F1 | Production APIs, verified workload identity, least-privilege runtime authority, credential custody | **STILL OPEN** |
| F3 | Generation-safe worker integration, recovery, conditional acknowledgement, operational/data parity | **STILL OPEN** |
| F6 | Full publication eligibility, transitive privacy/rights, dependency-revocation integration | **STILL OPEN** |
| F2 | Frozen semantic policy, split, independent labels | **STILL OPEN** (thresholds remain null; none invented) |

**F1, independently.** `mip_comparison_worker_v1` is NOLOGIN without `BYPASSRLS`. Stub `worker_complete` raises `mip_cutover_authority_not_provisioned`. After bound `revoke_principal`, `service_role` `comparison_qualification.complete(...)` still returned `completed`. `runtime-permission-proposal.json` `bind-live-workers.chosen` is null. Stubs are not production APIs.

**F3, independently.** Disclosed `source-comparison-run-v16/index.ts` still has `rebuildProjection`, `acknowledgeProjectionQueue`, `SUPABASE_SERVICE_ROLE_KEY`, `Bearer ${serviceKey}`, and no `comparison_qualification`. Architecture notes are not integration. Live v15 vs repo v16 bytes remain NOT TESTED.

**F6, independently.** Disclosed test still matches `mip_private.reader_claim_surfaces:absent` and fails `publisher_release` after fixture article mutation with zero `released` rows. Fingerprints, including stable absence, are not eligibility.

`REVIEW_RESULT.json` remains `PACKET_PREPARED_REVIEW_NOT_PERFORMED` with null outcome. That frozen slot was not written by this review. `OWNER_ACCEPTANCE.json` remains `NOT_SUBMITTED`.

---

## Next necessary steps

1. Keep PR #149 draft and unmerged. No production writes, grants, schedules, publication, trials, or legacy retirement.
2. Owner: approve or replace the proposed revocation ordering and lease-recovery policy. The 10 September 2026 brief body is still missing from the repository.
3. Owner: decide whether implementation-agent native CI plus this sequential independent review is enough to accept concurrent ordering, or require a later independent run **inside** the authorized GitHub Actions disposable Postgres 17.6 service using the unmodified harness (both `--baseline` and corrected), without setting `GITHUB_ACTIONS` outside that service and without weakening assertions.
4. Engineering **F1**: implemented producer/worker/publisher APIs bound to verified least-privilege identities; remove ambient `service_role` complete/claim/enqueue from the production execution boundary. Do not rename `qual_*` onto live `service_role`.
5. Engineering **F3**: atomic real-input capture, evaluated claim/compute, durable generation-bound outputs, conditional acknowledgement, failure/recovery, backlog/delta parity in the **actual** worker — not v16 `rebuildProjection`.
6. Engineering **F6**: complete survivor privacy/rights predicates, immutable approved selection, fail-closed missing evidence, serialized dependency revocation — not isolated fingerprints.
7. Freeze semantic policy/split/labels before any held-out qualification (F2).
8. Separate owner acceptance after this review. CI and this document are not acceptance, provisioning, or cutover authority.
9. Optional later process fix (not required to freeze this candidate): add `verifier/pr149AuthorityOrdering.py` and `verifier/pr149-authority-baseline.sql` to the comparison-postgres workflow path filter.

## What this review did not do

No merge, production write, provisioning, schedule change, publication activation, trial, or legacy retirement. Frozen packet, original Grok review, implementation, workflows, and owner-acceptance records were not modified. Temporary work stayed on this disposable runner, not on the owner’s physical device.
