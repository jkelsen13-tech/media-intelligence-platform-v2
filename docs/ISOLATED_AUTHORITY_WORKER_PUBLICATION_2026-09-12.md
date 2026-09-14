# Isolated F1/F3/F6 extension — 2026-09-12

Draft PR #153. No merge, deployment, credential provisioning, publication activation, automatic approval, or cutover.

## Frozen authority evidence remains historical

Parent candidate: PR #151, branch codex/post-review-reconciliation-20260911, commit ddbbbd6dc878dcb38ea0904b6ee58895853b6c26, tree b81e3d75be73205f69bcefc1681203050552ec07.
Independent attempt 3: run 34606754290, job 103501954636. PR #152 records its observed PASS. Neither candidate branch nor reviewer branch is changed.
All files covered by the old disclosure manifest are preserved verbatim in the final extension tree. Earlier extension commits briefly exported a test helper and failed that hash regression; the helper was moved into a separate file and the original restored. Historical results are not rewritten.

## Implemented isolation boundary

003_scoped_queue.sql is opt-in after 002. It filters source and evaluated implementation before lease mutation, rotates least-recently-served eligible sources within each runtime, and holds source/implementation rows through transaction end. Revocation UPDATEs serialize on those rows. Queue polling never recycles or cancels processing rows; explicit recovery remains required. A per-runtime advisory lock serializes source-turn selection. This is fairness among available, unlocked rows; no strict global scheduler or cross-runtime starvation guarantee is claimed.

durableWorker.js writes immutable operation arguments to a host-supplied remote durable journal before sending an RPC. It retains completion/failure arguments and request IDs, excludes session credentials, and retries under a fresh current session for the same runtime. Server replay remains the authority check; journal receipts never substitute for it. Unknown claim outcomes yield retained_pending_explicit_recovery when the server returns receipt-only replay. There is no force cancellation. The durable storage adapter is not provisioned. Map-backed tests exercise the adapter protocol across reconstructed calls, not an operating-system crash or a deployed durable store.

workloadIdentity.js verifies an RS256 signature with an explicitly supplied issuer-scoped public key, exact issuer/audience/subject, key validity/revocation, token validity and owner-configured lifetime. It maps only to an explicitly configured producer/worker identity. Token role/runtime/user_metadata values cannot select database authority. It rejects remote key URLs and algorithm changes. It neither issues a database session nor creates credentials.

004_publication_staging.sql stores immutable approved payloads and immutable dependency versions. Selection checks the complete recursively reachable closure against exact approved versions, source binding, freshness, withdrawal/revocation state, and explicit privacy, rights, retained-evidence, correction, explanation and publication booleans. Missing values/dependencies fail closed. A shared global transaction fence serializes selection with dependency/topology writes. Only isolated owner fixtures can populate or call this surface; no execute grants are added. This is executable staging and selection, not a public release path. The existing publisher_release stub continues refusing.

## Remaining integration work — NOT closed by these primitives

- The trusted broker must load immutable owner-approved identity configuration and atomically recheck mapping/key revision when issuing a narrowly bound database session. The verifier return object is NOT proof of continuing authority.
- Qualification kernel functions, including new kernel helpers, still have trusted fixture ownership. Full production NOLOGIN function ownership, exact grants/RLS, and external Auth transport are not complete. No service_role credential belongs in the worker compromise boundary.
- Journal putOnce/get must be implemented by an authorized remote durable service with exact-content conflict checks, encryption, runtime isolation, retention, and verified commit acknowledgement. Lease tokens in the journal are secrets and must never enter GitHub evidence/logs. Loss after claim but before token retention remains stranded pending explicit recovery.
- Collector/backlog/delta checkpoints, process-crash tests, operational parity and actual live v15/v16 runtime reconciliation remain open. Existing immutable source capture and retained v16 computation are reused; this extension does not claim collector parity.
- Survivor predicate adapter is not implemented. Read-only inspection of qikvmopbtijoebdqosyq confirmed reader_claim_surfaces and comparison_public, including the event-bound explanation condition. The separate complete privacy/rights contract is not established by those views. Adapter-produced booleans must be grounded in authoritative current predicates and retained evidence; a worker must never attest its own eligibility.
- The adapter must ensure all relevant source mutations participate in revocation fencing, including transitive graph/topology changes. The isolated fence covers only the new staging tables, not live source writes. Actual release wiring remains disabled and unimplemented.
- Explicit restoration must create fresh eligibility versions and fresh immutable payload approval; there is no automatic restoration/release process here. Administrative direct head manipulation is trusted fixture setup, not a production recovery API.
- F2 thresholds, held-out split, minimum samples, labels and adjudication remain owner-gated; no semantic qualification is asserted.

## Production identity and custody decisions reserved to owner

Exact external issuer, audience, workload subject and runtime mapping; chosen broker/runtime; public-key trust source and rotation/revocation procedure; maximum credential lifetime; credential and journal custodians; recovery operator identity and approval authority. No values are invented and no production credentials, identities, permissions or schedules are provisioned.

Proposed custody boundary: workers receive short-lived execute-only sessions; the trusted broker holds identity verification configuration; an independent authority administrator owns mapping/revocation; remote journal access is runtime-scoped and retains lease secrets; key rotation appends a new trust revision, revokes the prior revision, and rechecks current revision at issue and sensitive acceptance. Restoring old credentials is not recovery authorization.

## Reproduction

Existing Golden regression suite runs npm ci, npm test and npm run build on GitHub-hosted Node 22 and 24. New native workflow isolated-extension-postgres.yml runs verifier/isolatedExtensionPostgres.py against the guarded loopback postgres:17.6 disposable service. The harness prints the server version and default isolation. It cannot target production DSNs. Original workflows and native authority evidence remain unchanged.

Review scope is the extension files and their explicit inherited fixture/kernel dependencies. Tests are implementation-authored. Native extension results must be distinguished from the prior independent review. No SAFE TO RETIRE or production-readiness conclusion is authorized.
