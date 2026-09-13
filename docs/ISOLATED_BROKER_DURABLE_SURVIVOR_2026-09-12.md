# Isolated broker, durable worker and survivor release integration

This document supersedes the implementation-status sections of ISOLATED_AUTHORITY_WORKER_PUBLICATION_2026-09-12.md for PR #153. It does not supersede owner authorization or independent evidence. Production cutover remains ON HOLD. Everything below is opt-in qualification code, executed only on disposable GitHub-hosted PostgreSQL and synthetic fixtures. No MIP project file was downloaded or written on the owner's physical device.

## Authority and custody

005_broker_sessions.sql and brokerSession.js connect RS256 verification to database session issue. The broker loads immutable owner-approved key and issuer/audience/subject/runtime mapping revisions; issue rechecks those exact revisions, token digest, signed claims and lifetime atomically. Sensitive worker, collector, journal and publisher operations recheck current authority, including after waiting. Mapping/key/source/evaluated-implementation revocation serializes before acceptance or waits behind acceptance according to the accepted contract. Source/evaluation revocation retires runtime mappings. Rebinding scope alone cannot restore an old session.

NOLOGIN, NOSUPERUSER, NOBYPASSRLS function owners are separate from NOLOGIN leaf capability roles and the schema owner. FORCE RLS protects internal tables. Leaf roles receive only named wrapper EXECUTE privileges; direct old worker entrypoints, table access, broker issue, service_role escalation and kernel-role escalation are denied. The internal kernel is trusted infrastructure outside the worker compromise boundary.

The actual worker runs in a separate non-root, read-only, networkless container with all capabilities dropped, no-new-privileges, and bounded memory/PIDs. Only worker code, the frozen computation library and a narrow message harness are mounted read-only. No database transport fixture, Git checkout credentials, Docker socket, broker key, encryption key or service_role credential is mounted or passed. SQL execution and encrypted-journal custody stay outside that container. Tests check exposed paths, identity and environment, and exercise the broker-mediated path from this container. This is an isolated boundary proof, not attestation of any future production host.

Production owner decisions still required: issuer/audience/subject/runtime identities; approved workload host and broker transport; issuer key trust source; broker/database credential custodian; journal key custodian and recovery access; key rotation, maximum lifetime and retention periods. Synthetic values and short fixture sessions are not production defaults. No identities or credentials have been provisioned.

## Durable generation worker and reconciliation

The original worker.js and all historical disclosure-manifest files remain byte-for-byte frozen. workerV2.js adds the frozen live runner's deterministic surface/explanation deduplication. durableWorker.js selects that extension. It persists an exact operation intent before RPC and a receipt only after RPC returns.

brokerSession.js implements AES-256-GCM runtime-scoped putOnce/get over PostgreSQL ciphertext storage. The gateway derives runtime from current session authority and binds runtime plus journal key as authenticated data. Conflicts decrypt and compare exact serialized content, rather than accepting equal hashes alone. PostgreSQL synchronous_commit and fsync are checked. Random fixture encryption keys are held by the test gateway, not used as an in-memory recovery store; a production key-provider/custodian remains owner-gated.

SIGKILL after committed completion, before its response, preserves one output and one completion receipt. A new container recovers exact retained arguments under a fresh session. SIGKILL after claim leaves processing retained; receipt-only replay does not reconstruct a lease secret or force-cancel work. Source/evaluation/key/mapping revocation denies recovery even when a journal entry or lease remains. A separate test restarts the remote PostgreSQL service itself and then recovers the committed operation.

006_collector_reconciliation.sql captures append-only before/after rows from real isolated source tables. Source mutation and delta capture share a fence. Each change ID is linked atomically to its exact retained generation. Reconciliation exposes each change's relation/key, before/after hash, generation/input/output hash, job state and conditional acknowledgement. A later unprocessed delta is not acknowledged by an earlier completion. Wrong-source generation capture rolls back the generation and mappings together. Rollback leaves no fictitious source changes; truncate is refused.

Queue selection filters current source and implementation authority before leasing. For a finite set of eligible, available, unlocked sources within one runtime, serialized successful claims rotate least-recently-served sources. Tests cover sustained finite-source backlog. There is no wall-clock bound, global cross-runtime fairness, locked-row starvation bound or guarantee for infinitely arriving sources. Processing work remains outside automatic polling recovery.

## Survivor adapter and isolated release

007_survivor_release.sql installs an executable retained-evidence adapter and PRIVATE release receipt path. Actual public release always refuses. Workers cannot write eligibility reviews, policy versions, heads, staged payloads or release receipts.

The adapter binds an immutable owner review to exact retained generation and output hashes, current policy revision, current source input, and an exact database-native relationship snapshot. JavaScript is not used to round-trip that snapshot: fixture large integers, high-precision numerics and microsecond timestamps must remain exact.

Known survivor predicates are implemented from read-only inspection of mip_private.reader_claim_surfaces and public.comparison_public: approved non-timeline multi-outlet events; current eligible/active article membership; active sc-v2-event-projection claims; source-exact retained excerpts and field hashes; event/article-bound grouping explanations with reviewed/current/published/ok status, supporting text, falsification and retained archive references; admitted evidence-link sources; eligible same-event correction sources. Existing corrections and evidence links are retained in the approved payload. Missing bindings fail closed.

The closure is conservatively overinclusive: every row of the configured source/relationship set is retained, including source/config rows, claims/surfaces/evidence/corrections/explanations, arcs/nodes/edges and arc relationship tables. Mutation triggers serialize with staging/release and append revoked dependency versions. Missing relations or fences fail closed. Explicit withdrawn/revoked states or privacy/rights ineligibility cannot be relabeled current by a fresh review. This conservative scope may block unrelated publication and is not a scalability claim.

Policy versions and review records are immutable and separately owner-controlled. Policy/head revocation serializes with release. Retired revisions cannot be reactivated. Restoration requires a new current policy where applicable, a new eligibility review/version, new immutable payload approval and current publisher session/source/evaluation authority. Historical private release receipts remain append-only; they are not a public-serving fallback.

**Owner-policy blocker:** the inspected survivor views do not establish the complete authoritative privacy and publication-rights policy. Tests therefore use explicitly named synthetic owner policy decisions. They prove execution/fencing and refusal behavior, not actual policy sufficiency or semantic qualification. The source of those complete rules and their authorized decision owner must be identified before the adapter can be declared complete for the coherent production-candidate review. No worker self-attestation or invented policy substitutes for that authority.

## Live v15/v16 behavior reconciliation

Read-only inspection on 2026-09-12 found the deployed legacy source-comparison-run labeled ACTIVE v15, with its previously recorded seven text files equal to frozen v16 sources. The existing mip-source-comparison-enrichment cron entry (job 3) is active every five minutes. No schedule was changed or invoked.

The exact eight observed legacy queue IDs are 148767fa-327b-4eac-8681-dcce57c829e2, 27585e5f-1548-482a-b987-f26337aaaaf9, 3a71b4e0-f7c3-4064-b7d5-5f7aa3ceb4e7, 516c5029-def1-44d7-8b9f-be5311a0a886, a8d6dd4b-921e-40f7-a0e5-ed0da49988cf, aa6069bd-fbb8-4a6f-835a-b54ff485c84c, cb71f4bc-3a1d-4dbb-8765-8e6c3c3d165c and f3a654dd-2fb6-49ab-9bae-55008466c45b. All were succeeded, enqueued at 2026-08-23 21:36:36.296746+00 and processed at 21:37:58.092+00. These rows do not provide generation/output bindings.

runtimeParity.mjs executes the frozen handler after substituting only a synthetic in-memory Supabase transport and Deno host. It exercises actual handler input selection, deterministic projection, scheduling branch, deletes/inserts and acknowledgement logic. It does not invoke the live endpoint. Comparisons prove equal synthetic claim/surface/explanation computation and expose intentional architectural differences:
- live-equivalent multi-request mutable input reads versus one retained database snapshot;
- mutable deletion/insertion versus append-only generation output;
- blanket pending-queue acknowledgement, including work arriving mid-run, versus exact generation/change acknowledgement;
- partially deleted prior projection on write failure versus retained previous output plus an explicit failed generation;
- no durable completion request in the old handler versus exact encrypted remote recovery.

These are executable behavior reconciliation and explicit non-equivalences, not production operational parity or authorization to mirror/canary live traffic. No historical queue row is falsely mapped to a newly invented generation.

## Reproduction and review status

Run the existing Golden suite (Node 22/24 tests and builds), existing native concurrency workflow, existing isolated extension workflow, and integrated-isolation.yml on GitHub-hosted runners. The integrated suite refuses non-CI or non-disposable targets and uses only loopback PostgreSQL plus restricted worker containers. Log output is test state/error codes, never SQL arguments, credentials, tokens or encrypted-journal plaintext. Failing SQL statement logging is disabled before fixture secrets exist.

Implementation-authored native tests are not independent review. The accepted PR #151 attempt-3 review and its baseline counterexamples remain historical and unchanged. No new independent reviewer is requested. PRs #149–#153 remain draft/unmerged. The next coherent review boundary remains blocked on complete authoritative privacy/rights rules; production identity/custody choices are separately reserved to the owner. F2 thresholds, labels, held-out splits, sample minima and adjudication remain untouched.
