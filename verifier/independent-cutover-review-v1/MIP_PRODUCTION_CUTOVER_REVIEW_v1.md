# MIP_PRODUCTION_CUTOVER_REVIEW_v1 — Independent technical review

**Outcome:** `BLOCKED`  
**Scope:** Frozen PR #147 candidate `47075711ff78393ac3b1690ddbffca615e8f20ce` under the 48-file disclosure allowlist, plus the owner-supplied 10 September 2026 Decision Brief as a **supplement** (not a manifest file).  
**This is not authorization to merge, deploy, provision credentials, change permissions or schedules, enable publication, run a production trial, or retire infrastructure.**

Machine-readable companion: `MIP_PRODUCTION_CUTOVER_REVIEW_v1.json` (hashes of both artifacts are recorded at the end of that JSON under `this_review_artifacts`).

---

## 1. Scope, identity, tools, candidates, access

### Reviewer identity and independence

This review was performed by **Cursor Grok 4.6** as an owner-designated independent technical evaluator for this run only.

| Item | As actually available |
|---|---|
| Product identity | Cursor Grok 4.6 |
| Cloud-agent launch name | `cursor-grok-4.6-xhigh` |
| Run | `bc-01a08bf7-3dc0-7367-b4ff-8299823ccd2e` |
| xAI API `grok-4.6` + `xhigh` verified | **No** |
| xAI API zero-retention verified | **No** |
| Production write credentials | **None** |
| Release / merge / cutover authority | **None** |
| Independent label adjudicator | **No** — this run did not create or certify reference labels |
| GitHub MCP principal | `jkelsen13-tech` (owner account). Inspection only; no GitHub writes |

Independence is limited to: separate from the PR #147 implementation process; own instructions and conclusions; primary-artifact inspection; restricted-packet reproduction. It is **not** a separate GitHub identity, not an xAI API retention arrangement, and not owner release authority. Model agreement with any labels this model might invent would not be ground truth; none were invented.

### Tools used

- Git fetch of the named SHAs; `git show` of allowlisted paths only; Python SHA-256 of full file bytes
- GitHub MCP: `get_me`, `get_file_contents` at the frozen SHA, `pull_request_read` (`get`, `get_commits`, `get_status`, `get_check_runs`)
- cursor-cloud `run-info`
- Isolated `/tmp` tree of the 48 hashed files plus the authorized disclosure manifest; `npm ci` from the disclosed lockfile; Node v22.14.0; PGlite 0.5.8
- Independent PGlite probes of bound-RPC replay, scheduler claim, and per-RPC revocation
- Native concurrency script invoked **only** to confirm it refuses outside the disposable GitHub Actions guard

**Not used:** Supabase MCP or any live project SQL; raw CI logs/screenshots; Auth records; Vault; credentials; production browsers; files outside the allowlist except a **name-only** `git diff` used to identify missing dependencies.

### Candidate binding (independently observed)

| Reference | SHA | Independently observed git tree |
|---|---|---|
| Operational baseline | `1dc317200b7a928fad85d06b43351b60e2a50d92` | `5ebc3687e7b22b4a78fce1681999035b57738995` |
| Disclosed-content commit | `60914115f22009722c0cb47cb81ddea206a38620` | `32615f1d053eecc50b7194bca42dfd48e116fbdb` |
| Frozen candidate HEAD | `47075711ff78393ac3b1690ddbffca615e8f20ce` | `af4d590697c716cbdc4ef355b3c99bd7b614f0ab` |
| Synthetic PR checkout (PR body) | `288b476c8b2bda449527ed7a65df5fcd13787539` | `af4d590697c716cbdc4ef355b3c99bd7b614f0ab` |

HEAD and the synthetic PR checkout trees are **equal**. The content-commit tree **differs**. That is a reconciliation question, not proof of different disclosed bytes: all **48 hashed files are byte-identical** between `60914115` and `47075711`.

Disclosure manifest (authorized, not in `hashed_files`): **10,633 bytes**, SHA-256 `ae896f578c2a239491a31dfc7133ef065c3c7fb272f28f9fd494f2e785b74f86`, git blob `e29978d7b368526831789033ae909873cd1fd47e`. Matches the PR #147 claimed manifest hash. All 48 hashed files: **FULL_FILE access**, hash and length **match**. Hash verification: **PERFORMED**.

PR #147 vs baseline (name-only): 20 paths changed. The other disclosed files exist unchanged on baseline and were still read in full from the frozen HEAD.

Owner Decision Brief: **not** in the 48-file list; packet still marks `NOT_RECOVERED`. This review used the brief **as supplied in the owner prompt**. File hash of the brief: **NOT PERFORMED** (prompt text, not a repo file).

### What could not be retrieved

Reported immediately as inaccessible or not retrieved (not claimed as read):

- `supabase/migrations/**` (required by `tests/cutoverReviewPacket.test.mjs`)
- `tests/golden/fixtures/uncertainty_vocabulary.json` and `tests/golden/CHANGELOG.md` (cited by locked vocabulary / lexicon)
- `services/extraction/**` (Cloud Run workflow source)
- Live Edge Function bodies; `mip_source_comparison_schedule_authorized`; `original_source_import_credentials`
- Survivor publication predicates / live grants / RLS
- Raw CI logs and screenshots

---

## 2. Findings (ranked by impact)

Missing evidence is labeled as such. Passing synthetic tests are not semantic, production, or live-write proof.

### F1 — HIGH — Proposed runtime choices do not satisfy the owner identity brief; no production package exists

**Affected:** `runtime-permission-proposal.json`; `rpc-signatures.json`; `capability.sql` (`qual_*` roles and unbound `enqueue`/`claim`/`complete`/`select_output`); `source-comparison-run-v16/index.ts` (`authorizeWriter`, `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`).

**Evidence:** The owner brief requires dedicated `mip_*_v1` capability identities, NOLOGIN function-owner roles, EXECUTE-only APIs, and **no shared `service_role` worker credentials**. Isolated SQL creates `qual_*` roles only. The permission proposal’s `alternative_a` is to keep live workers on unbound `service_role`. `chosen` is null. v16 builds a Supabase client with the service-role key and treats `Bearer ${serviceKey}` as writer authorization. Packet inventory records the qualification schema **absent** on live projects (supplied, not independently reproduced).

**Impact:** Isolated qualification cannot be installed as production authority. Effective runtime authority remains ambient privileged credentials.

**Confidence:** high. **Requirement:** Owner Decision Brief §§3–4; producer/worker authority PASS condition.

**Verification:** A later, separately authorized grant/RLS/RPC/JWT manifest naming exact `mip_*` subjects. Do not rename `qual_*` and grant it to live `service_role`.

### F2 — HIGH — No frozen semantic policy, split, or independent labels

**Affected:** `evaluation-policy.json` (SHA-256 `7dbf83d21ea736430e07663753bcd55341fd6bfd3d754c8305b010c7cc7b598d`); policy companion doc; `evaluateRecordCandidates.mjs`.

**Evidence:** Status `proposed_not_approved`; all thresholds null; `critical_error_threshold` null; `minimum_cases` null; no corpus/labels/predictions. Harness always emits `qualification: not_assessed`. Independently reproduced on synthetic fixtures only.

**Impact:** Semantic fidelity is **BLOCKED**. Owner PASS is impossible. This is not a fitted PASS.

**Confidence:** high.

**Verification:** Owner freeze of policy + split **before** held-out scoring; human dual adjudication; baseline and candidate predictions for every held-out case including misses/abstentions/unresolved.

### F3 — HIGH — Disclosed v16 worker is not the isolated generation contract

**Affected:** `index.ts` `rebuildProjection`, `acknowledgeProjectionQueue`, `buildEventInputs`; isolated `contract.sql` / `capture_source`.

**Evidence:** v16 deletes then inserts mutable claims/explanations; scheduled non-dry-run updates **all** pending enrichment-queue rows to `succeeded`; inputs are assembled from separate paged reads. Isolated `capture_source`/`complete` are never called. Live Manus is recorded as **v15**; byte equality vs repo **v16** is NOT TESTED. Folder `v16` vs `RULE_VERSION='sc-v1'` vs `EVENT_PROJECTION_RULE_VERSION='sc-v2-event-projection'` is a **reconciliation question**, not proof of different live bytes.

**Impact:** Passing isolated SQL does not qualify the disclosed comparison runtime.

**Confidence:** high. **Requirement:** atomic inputs; durable generation-bound acknowledgement.

**Verification:** A worker that only completes a retained generation and cannot acknowledge sibling pending rows; owner-authorized hash-only v15 vs v16 compare.

### F4 — MEDIUM — Bound RPC request-id replay acknowledges without binding arguments

**Affected:** `capability.sql` `worker_complete`, `producer_enqueue` (same pattern on `selector_select` / `publisher_release`).

**Evidence (independently reproduced):** same `p_request` completing output A then B both returned `completed`; durable output remained A. Same `p_request` enqueue with a different payload/implementation returned the first generation id.

**Impact:** History is not overwritten. The bound API still reports success for a changed output/payload (**incorrect acknowledgement** at that layer).

**Confidence:** high.

**Regression:** reject replay unless arguments match the recorded request; add a `comparisonCapabilitySeparation` test. Do not “fix” by deleting assertions.

### F5 — MEDIUM — `scheduler_claim` shares `claim()`; per-RPC revocation is not principal-wide

**Affected:** `scheduler_claim`, `worker_claim`, `worker_complete`, `revoke_binding`.

**Evidence (independently reproduced):** scheduler obtained a `lease_token`; subsequent `worker_claim` returned null. After `revoke_binding(...,'worker_claim')`, `worker_complete` still returned `completed`. Bound **session** revocation blocking `worker_complete` **was** independently reproduced; unbound `service_role.complete` still succeeded (packet test, independently reproduced).

**Impact:** Scheduler can strand comparison work. Revoking claim does not stop completion. Matches the owner brief’s warning that lease-vs-revocation must be evaluated explicitly.

**Confidence:** high.

**Regression:** scheduler must not take worker leases; principal-wide revoke covering all RPCs; complete-after-claim-revoke must fail if that is the chosen policy.

### F6 — MEDIUM — Isolated producer is not server-bound; publication is not survivor-gate parity

**Affected:** `producer_enqueue`; `capture_source`; `publisher_release` / `follow_publication`.

**Evidence:** Producer accepts caller `p_source`, `p_payload`, `p_implementation`. `capture_source` is granted to `service_role`, not the producer role, and uses synthetic namespace `qualification-source`. `publisher_release` checks the isolated gate and `proposed` head only. `dependency_hash` is sha256 of input/output/implementation/context — not the public closure named in the selection doc (events, membership, articles, claims, explanations, evidence, corrections, nodes, arcs). Sequential PGlite withdrawal **does** keep withdrawn heads from being restored by old receipt retry (independently reproduced).

**Impact:** Isolated publication/selection is a transaction checkpoint, not production publication eligibility.

**Confidence:** high.

### F7 — LOW — Packet evidence is not fully bound to final HEAD

**Affected:** `verification-history.json`; `REVIEW_RESULT.json`; `docs/COMPARISON_POSTGRES_CONCURRENCY_2026-09-09.md`.

**Evidence:** Hashed history stops at superseded `e0d240b`. `REVIEW_RESULT.review_packet_commit` is still null while the manifest is stamped `60914115`. The concurrency **doc** describes six scenarios; the harness has fourteen tests. Final CI lives in the PR body (supplied).

**Impact:** Completeness of the hashed receipt, not a demonstrated SQL defect.

### F8 — LOW — `verify_jwt=false` and Cloud Run `--allow-unauthenticated` are reconciliation items

**Affected:** `runtime-inventory.json` (supplied); `deploy-cloud-run.yml`; v16 `authorizeWriter`.

**Evidence:** Inventory records `verify_jwt=false` on Manus `import-original-source` v12 and original `source-comparison-run` v17 / `batch-intake` v14. v16 still has service-key, scheduler-token RPC, and original-import-key application paths. Cloud Run workflow deploys with `--allow-unauthenticated`.

**This review does not recommend flipping JWT flags or redeploying Cloud Run.** Those application-auth contracts were not fully present in the allowlist (`mip_source_comparison_schedule_authorized` source was not retrieved).

**GRANT EXECUTE of `bound_code` / `diagnose_*` to `anon`:** catalog grant exists, but **schema USAGE is not granted to `anon`**. Independent probe: `permission denied for schema comparison_qualification`. Not a working browser oracle; leftover grant hygiene.

---

## What is sound (limited isolated Stage A)

These are **not** production PASS:

- Immutable generation/output/failure/selection history with empty `search_path` definers, RLS enabled, no browser schema usage, no capability-role DML.
- Completion binds generation, lease, input hash, implementation, and exact JSONB output; stale/foreign/conflicting complete fails; explicit fail is terminal; three-attempt exhaustion does not acknowledge output (PGlite, independently reproduced).
- Default `publication_release_enabled` and `membership_auto_approval_enabled` are false; `membership_auto_approve` has no isolated release path even if flipped.
- Bound RPCs are **not** granted to `service_role`; the ambient hole is **demonstrated**, not hidden.
- `qual_public_reader` sees only `released` publication rows.
- Numeric/date precision retained as JSONB text in isolated tests.
- Evaluation policy thresholds were not fitted; `REVIEW_RESULT` was not pre-populated PASS; `OWNER_ACCEPTANCE` remains `NOT_SUBMITTED` (this reviewer did not write those frozen files).
- v16 membership scorer requires an explicit finite `[0,1]` threshold **and** `autoApprovalEnabled` **and** fixture pass; null threshold does not become zero. That is local scorer hardening, not production auto-approval authorization.

---

## 3. Invariant results

| Invariant | Result | Class |
|---|---|---|
| Atomic source capture | Isolated sequential PGlite **PASS**; native concurrent capture **NOT TESTED** by this reviewer; live closure **NOT TESTED** | inspected + independently reproduced (narrow) + supplied CI (unread logs) |
| Generation / lease / output ack | Unbound `complete` PGlite **PASS**; bound request-id replay **GAP (F4)** | independently reproduced |
| Failure / recovery | Isolated PGlite **PASS**; live crash/Auth mapping **NOT TESTED** | independently reproduced |
| Concurrent withdrawal vs release | Sequential PGlite withdrawal **PASS**; native concurrent **NOT TESTED** by this reviewer | inspected; supplied CI conclusion only |
| Principal / implementation / session / revocation | Bound session revoke **PASS** (PGlite); unbound `service_role.complete` **FAIL** vs production authority; per-RPC revoke **GAP (F5)**; no evaluated-implementation allowlist | independently reproduced |
| Effective runtime authority | **FAIL vs owner brief** | inspected v16 + isolated SQL; live inventory **supplied**, not reproduced |
| Provenance / publication gates | Narrow isolated selection **PASS**; survivor publication parity **FAIL / absent** | independently reproduced (narrow) |
| Semantic fidelity | **BLOCKED** | missing labels/policy/corpus |
| Reconciliation | **BLOCKED** | no live key/version manifest; v15 vs v16 bytes NOT TESTED |
| End-to-end intended runtime | **NOT TESTED** | public anonymous tests would be insufficient anyway |

**Native PostgreSQL 14-test suite:** this reviewer **could not independently execute** it. The script exits unless `GITHUB_ACTIONS=true` and `MIP_DISPOSABLE_POSTGRES=comparison-qualification`. GitHub check `concurrent-transactions` conclusion `success` is **supplied**, not a re-run. Raw logs were not read.

**Restricted-packet `cutoverReviewPacket.test.mjs`:** subtests 1–3 passed; subtest 4 **failed** `ENOENT supabase/migrations`. That incomplete run is **not a pass**. Migrations were **not** fetched, substituted, or asserted away.

**Full 1,610-test Node suite and browser preview:** **NOT independently run** (would execute undisclosed tests / need excluded screenshots). Check conclusions `success` are supplied only.

---

## 4. Evaluation-policy and reference-label recommendations

Needed **owner decisions before any held-out scoring**. This reviewer does **not** invent thresholds, choose a split to fit results, or use self-agreement as truth.

1. Freeze a policy identifier (keep `mip-semantic-evaluation-policy-proposal-1` or issue a new id if the text changes). Record its SHA-256 (`7dbf83d2…` for the current JSON).
2. Freeze numeric thresholds, `critical_error_threshold`, `minimum_cases`, dual-adjudication fraction, and confidence-bound methodology **without** looking at this candidate’s held-out scores. Empty denominators stay null.
3. Freeze the development/held-out id list and its SHA-256 using the existing grouping keys. Residual near-duplicate leakage remains a limitation until owner-adjudicated duplicate discovery.
4. Map policy error categories (`false_merge`, `source_lineage_error`, `temporal_leakage`, `identity_substitution`, `stale_current`, `unsupported_confidence`, …) onto an executable harness. **Current `evaluateRecordCandidates.mjs` cannot score those categories**; it only scores coarse supporting/disconfirming/unrelated/abstain plus retrieval flags. Either extend the harness or freeze a reduced in-scope metric set — do not pretend the current report is the policy.
5. Designate human adjudicators (not this Grok run, not the implementation agent). Critical cases: second human; disagreement stays unresolved until owner decision. Blind first pass.
6. Rights-cleared retained captures with exact version ids and distinct source / event / publication / observation times. No invented bodies.
7. Require baseline predictions (recovered lexical comparison / arc scorers, per `EVIDENCE_DISCOVERY_EVALUATION_V1.md`) and candidate predictions for **every** held-out case.
8. Keep automatic membership approval and publication **disabled** regardless of any future score.
9. Do not treat implementation-agent labels, queue acknowledgement, membership scores, or model agreement as ground truth.

---

## 5. Missing evidence and smallest additional access

Smallest next disclosure, if the owner wants a less blocked **technical** re-review (still not cutover):

1. `supabase/migrations/**` **names and hashes only**, or the directory, so migration-exclusion can be independently checked without rewriting the test.
2. Hash-only compare of live Manus `source-comparison-run` v15 vs repo v16 (bodies still excluded from GitHub).
3. Exact production RPC/grant/RLS draft mapped to `mip_*` names, JWT iss/aud/sub, and credential custodian — secrets omitted.
4. Current survivor publication-predicate SQL (redacted), to compare with isolated `publisher_release`.
5. `mip_source_comparison_schedule_authorized` definition (no token values) if that callable surface is in scope.
6. Frozen policy numbers + split + independently adjudicated label pack, or an explicit owner decision that semantic scoring remains out of scope for the next review.

Still **not** requested by this reviewer: raw CI logs/screenshots, Auth emails/sessions, Vault, production payloads, golden article bodies, live write access.

---

## 6. Separate conclusions

**Limited technical review (this disclosure):** Isolated Stage A generation/selection/failure contracts are coherent and, in PGlite, largely behave as documented. Several bound-RPC acknowledgement/revocation/scheduler gaps are **independently demonstrated**. The disclosed v16 runtime is a different, still-mutable worker. Native concurrency, live authority, publication parity, and semantics were not independently closed. **BLOCKED** — not a conditional PASS of Stage A as production.

**Overall production-cutover readiness:** **BLOCKED**. Production principals do not exist; ambient `service_role` remains the live-compatible authority; semantic policy/labels are unfrozen; isolated SQL is not installed and must not be treated as an approved migration; no SAFE TO RETIRE result.

Owner acceptance remains **not submitted**. This reviewer did not populate `OWNER_ACCEPTANCE.json` or the frozen `REVIEW_RESULT.json`.

---

## 7. PASS / FAIL / BLOCKED

**`BLOCKED`** for `MIP_PRODUCTION_CUTOVER_REVIEW_v1` as a production-cutover review.

Justification: missing frozen acceptance policy and independent labels; unavailable independent native/live runtime evidence; unapproved additional disclosure; unspecified thresholds; production identity/RPC package absent. **BLOCKED is not a conditional PASS.**

Demonstrated isolated contract gaps (F4–F6) and owner-brief noncompliance (F1, F3) would **prevent PASS** even after evidence arrives. They are not upgraded into an overall `FAIL` of a live unauthorized action, because this review did not exercise production systems. They are also not waived.

`pass`: false. `fail`: false. `blocked`: true. `owner_acceptance`: null.

Recommended principal/grant/deployment manifest: **none**.

---

## 8. Next steps

### Implementation agent (engineering only — not permission)

- Do not merge PR #147; do not apply qualification SQL; do not enable gates; do not provision `qual_*` or `mip_*` roles.
- Do not treat this review as transmission back into the frozen packet.
- If work continues: design production RPCs for the **owner’s `mip_*` names**, EXECUTE-only, no `service_role` worker key in the runtime. Do not grant isolated `comparison_qualification.*` caller-context APIs to live `service_role`.
- Bind producer capture to server-side source and evaluated implementation; do not ship caller-supplied “approved” implementation as authorization.
- Do not use v16 mutable rebuild + blanket pending acknowledgement as the production worker.
- Close F4/F5 with regressions; keep concurrent native tests in the disposable CI guard.
- Extend or explicitly narrow the evaluation harness to the frozen policy categories **after** owner freeze — do not fill thresholds from fixtures.

### Owner decisions (distinct)

- Accept or reject this `BLOCKED` review; keep cutover **ON HOLD**.
- Freeze evaluation policy, split, adjudicators, and corpus disclosure **before** held-out scoring.
- Choose the runtime/identity alternative: dedicated workload credentials (brief) vs remaining on `service_role` (proposal `alternative_a`). Those are not equivalent.
- Identify recovery vs restoration authority; restoration must re-check rights and publication eligibility.
- Decide whether `verify_jwt=false` functions stay until a later auth-mapping proposal — **do not flip flags from this review**.
- Authorize any later shadow/canary, credential provisioning, schedule change, or deployment manifest in a **separate** prompt.
- Provider disclosure: this review used Cursor Cloud Agent, not a verified xAI API zero-retention setting.

No backend is SAFE TO RETIRE.
