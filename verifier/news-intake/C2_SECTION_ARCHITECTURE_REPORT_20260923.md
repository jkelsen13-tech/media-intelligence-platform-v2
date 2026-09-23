# C2 · Target-backend compatibility and required-worker integration preparation

**Stage:** Stage 4 entry. **Disposition:** COMPLETE for the authorized portable compatibility and inactive worker-preparation scope; hosted qualification and live prerequisites remain open.
**Authority:** owner's explicit C2 authorization, adopted post-consultation workflow v3 and consolidation handoff v3. No historical prompt was re-executed. C1 remains complete and immutable.
**Observation window:** 2026-09-23; bounded current target catalog inspection and isolated execution ending 05:29:53 UTC.
**Baseline:** `2b4e5f3e3b2aab55392385361cf65ca2e79e367a`; repository `jkelsen13-tech/media-intelligence-platform-v2`, branch `codex/mip-backend-consolidation-20260920`. PR177 remains draft/unmerged and targets `codex/mip-efta-runtime-auth-remediation-20260918`, not main.
**Execution identity:** `daf0ce821eca558dfb389cc2c5ed7b5f31e067a9`, tree `92ff01916de76ea5be72646b6ad3c5cfd14f8d26`. Completion successor changes only this report, C2 ledger and restoration of the prior workflow.
**Team:** parent reconciler; reused same-run Sol Medium implementer for worker only; Luna Medium bounded caller/evidence work; fresh non-implementing Astra High reviewer. Independent model/effort runtime telemetry was not exposed. The reviewer inspected exact code, API identities and logs without replaying tests.
**Requirements affected:** target native compatibility, worker execution identity, source identity, pending/review/eligibility separation, trigger/history recovery and reader access. No new publication or acquisition authority.

## 1. What happened and why it matters

C1's adapter is now connected to a small inactive worker binding and exercised against a substantially richer, current-target-derived PostgreSQL substrate. The test installs the actual unchanged source-identity candidate and calls the actual native pipeline through the worker, including history and downstream change-queue triggers. All twelve case groups passed. This demonstrates a bounded executable path beyond C1's minimal substrate, while preserving the distinction between portable PostgreSQL evidence and hosted Supabase operation.

## 2. Architecture before the section

C1 preserved source-shaped payloads through native enqueue and transactional finish/candidate persistence, and connected eligible rows to the existing News consumer. It did not supply an activated worker or reproduce all target dependencies. The deployed qik native enqueue/finish remained their legacy definitions; the C1 candidate was not installed.

Current bounded catalog inspection of `qikvmopbtijoebdqosyq` found PostgreSQL17.6.1.166, pending-review/active article defaults, eligible-and-active reader RLS, restricted service-role article writes, arc interception/invalidation, append-only capture/history and evidence-change dispatch. All inspected registry enablement and collection flags were off. No source endpoints, article bodies, Auth records, private payloads or credentials were exported.

The existing ingestion Python module provides hydrated records and literal extraction. Its legacy direct writer and spool paths are distinct callers. Collector-shadow is receipt-only; the existing ingest-rss path has additional extraction, embedding and analytical responsibilities. None was silently replaced or activated.

## 3. What changed, and what remained unchanged

| Component | Actual change | Boundary |
|---|---|---|
| `native_worker.py` | EXTEND the existing adapter with an injected connection and existing literal-pipeline module; enqueue, claim, bounded process/retry and sanitized diagnostics | Importable inactive operator binding; no CLI, credential lookup, acquisition or scheduler |
| `install_source_identity.py` | RECONCILE installation ordering with exact candidate blob and native enqueue/finish fingerprint checks, owner/search-path/default/ACL checks and one transaction | Preparation helper; caller must separately establish environment and authorization |
| `c2_target_structure.sql` | Reproduce selected target columns, constraints, policies, article triggers and native spatial query dependencies without production rows | Synthetic structural fixture, not a production migration |
| `c2_target_compatibility.py`, fingerprints | Exercise candidate and worker against full native pipeline/change-queue migrations and selected current target dependencies | Twelve source-free portable case groups |
| Temporary Golden manual lane | Freeze exact checkout and run bounded network-isolated PostgreSQL/Python containers | Restored after execution; no build, deployment or artifact upload |

C1 adapter, source-identity SQL, application, tests, lock, Vite configuration, prior report and historical ledgers were not changed. Native publication permissions, reviewed-claim owners and deep product surfaces remain unchanged. Pre-execution review corrected fixture SQL syntax and worker connection-error sanitization before freezing the execution; no failed C2 run is hidden.

## 4. Why this approach was selected

An injected worker binding reuses the existing native job/lease and transaction owners without creating another ingestion architecture. It requires an idle autocommit connection whose effective current user is service_role, rechecks that identity for native RPC actions and bounds each run to 1–10 jobs. Native retry limits remain in the database. The adapter processes the leased retained payload; finish and candidate writes share one transaction.

The installer refuses absent or changed foundations rather than recreating them. It locks the affected article/job tables, checks the exact prior function bodies and pending/browser-execution fences, and applies only the fixed reviewed candidate. Replay is a conflict, not a silently successful redeployment. This helper is intentionally narrower than a full live preflight: it does not prove every catalog dependency or hosted transport.

Full native reliability and change-queue migrations were reused in the isolated database so rollback tests include real append-only history, evidence-change capture and dispatch. Selected target bodies were compared byte-for-byte by SHA256 against fourteen live catalog fingerprints. Omitted spatial/analytical layers remain explicit; permissive omissions are not counted as those layers passing.

## 5. Architecture after the section

Prepared branch path:

```text
existing authorized post-hydration caller (not activated)
  → NativeIntakeWorker(injected service-role connection, existing literal module)
  → unchanged C1 source adapter → native mip_pipeline_v1
  → job/lease + pending article + exact private capture/candidates
  → append-only record history → evidence_changes → pending change_jobs
  → separate review/publication owner → eligible-active reader RLS
  → unchanged C1 News backend/envelope/consumer
```

The deployed target is unchanged. Source permissions, acquisition, scheduling, processing, semantic review and publication remain separate decisions. Enqueueing or extracting cannot publish an article. Change-job creation is demonstrated; execution of those downstream analytical jobs is not.

### Required worker and caller map

| Existing owner/interface | C2 connection | Remaining prerequisite |
|---|---|---|
| `verifier/ingestion_pipeline.py` ArticleCandidate/HydratedArticle and literal extraction | Inject the existing module and already authorized hydrated record into NativeIntakeWorker | Acquisition/retention permission belongs to the caller; no source request added |
| `native_worker.py` enqueue_source, run_one, run | Calls existing `mip_pipeline_v1` enqueue/claim/finish/candidate/fail through one psycopg connection | Approved host, credential custody, effective identity and transaction-preserving transport |
| Native import jobs/captures/history | Existing lease/retry/append-only owners retained | Hosted role/connection and target-version qualification |
| Native evidence_changes/change_jobs | Capture and history events generate existing downstream work | Required dependency-lookup and candidate-search workers remain independently unqualified/inactive |
| Collector-shadow | Receipt-only, unchanged | Cannot become canonical writer under this authorization |
| Existing ingest-rss and legacy direct/spool ingestion | Preserved separate caller contracts | No replacement/cutover claim; broader responsibilities must be reconciled separately |
| News backend/envelope | Existing bound client and publication rules unchanged | Hosted Auth/JWT/PostgREST and authority-change behavior still need their own environment |

The actual target service_role is NOLOGIN. An effective-role portable test does not establish a legitimate hosted login/delegation path. No credential or grant was created to bridge that gap.

## 6. What verification demonstrated

[Execution 35822610895 / job107057500351](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35822610895/job/107057500351), attempt1, standard ubuntu-24.04, ran 05:29:27–05:29:53 UTC: **26 observed runner-seconds**, exit0. Twelve unique case groups passed; cleanup logs reprint the same groups and are not additional executions.

| Executed case | Evidence established |
|---|---|
| Missing foundation refusal | Installer fails without manufacturing the native schema |
| Native target function identity | Fourteen exact native/trigger function bodies match captured current-target fingerprints |
| Guarded install, conflict, ACL and legacy | Wrong default/changed function/replay refused; correct candidate installs; grants and stored legacy payload/hash preserved |
| Worker identity/bounds/legacy | Wrong effective role, invalid bounds and outer transaction refused; retained legacy job processes |
| Atomic native trigger-chain rollback/retry | Injected candidate failure rolls back articles, captures, history, evidence changes and change jobs; retry completes on attempt2 |
| Duplicate and pending correction | Duplicate is idle; changed same-URL capture remains pending and does not overwrite article body or original history |
| Native constraints/history denials | Reader-state check, outlet FK, publication-column denial and immutable capture/history fences remain effective |
| Target unapproved arc attachment | Existing missing candidate-ID default causes SQLSTATE23502; arc remains unattached |
| Native membership invalidation | Explicit synthetic approved premise attaches; withdrawal invalidates membership |
| Reader RLS/private denial/withdrawal | Anon/authenticated see only eligible-active fixture, no unreviewed claims/private captures or pipeline execution; withdrawal hides it |
| Expired lease recovery | Stale finish refused, native retry transition followed by successful recovery |
| Terminal validation/sanitized diagnostics | Invalid literal output dead-letters without partial persistence; no raw source/error payload in worker diagnostic |

Runtime command: pinned Python image entrypoint `python -I -B /workspace/verifier/news-intake/c2_target_compatibility.py`. PostgreSQL17.6 image digest `00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`; existing Python base digest `519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7`, existing pinned dependencies. Preparation used the approved pre-isolation network process. Runtime used Unix socket only, network=none and no published ports or production credentials.

PostgreSQL cap536870912bytes; Python cap268435456bytes, dropped capabilities, read-only root/checkout, unprivileged UID and no-new-privileges. Job timeout900seconds. Observed peak memory was not collected. Containers and socket volume were removed and absence checked: **C2_DISPOSABLE_CLEANUP_PASS**. No build output or artifact uploaded.

Dependency preparation emitted the ordinary pip root-install warning and upgrade notice; the runtime test ran unprivileged. No warning was suppressed. C1's browser-compatibility `node:crypto`, mixed static/dynamic import and large-chunk warnings remain attached to its exact build and report. C2 does not resolve them or add browser-runtime proof.

### Portable and hosted proof limits

| Omitted or reduced dependency | Exact limitation |
|---|---|
| Nullable vector embeddings | No vector extension, embedding generation/storage/search proof |
| Parent lookup write constraints/triggers | Required referenced IDs and article FKs exist; lookup population/update behavior is not qualified |
| Spatial parent write constraints/triggers, populated release/review chains and spatial-owner RLS | Actual spatial query resolves against empty column-compatible parents for null-spatial literal candidates; no positive spatial candidate/World View propagation claim |
| Populated reviewed claims/analytical relations | Withholding and empty nested claim projection tested; semantic evaluation and accepted multi-surface propagation not tested |
| Hosted postgres administrator attributes | Isolated bootstrap postgres is superuser, target postgres is not; privileged hosted installation/ownership capability remains to qualify |
| Hosted Auth/JWT, PostgREST, Edge, pooler, scheduler, Storage/Realtime | No isolated hosted surface with established access/isolation/cost was available; no hosted equivalence claimed |
| Arc attachment staging | Current target candidate-ID default is absent; unapproved direct staging fails23502. Explicit approved-fixture invalidation passes, not successful staging |

The arc limitation was preserved, not repaired by inventing a default. This worker never assigns an arc, so it does not block this literal-intake scope. Any future direct arc writer must address and qualify that prerequisite.

## 7. Meaning for the larger architecture and reader

Canonical intake can now invoke the adapter through a bounded native worker binding without bypassing history or changing publication authority. The trigger chain demonstrably produces pending downstream work, making remaining analytical worker responsibilities visible. Reader behavior remains C1's news-first contract: new processing does not imply eligibility, corroboration or semantic acceptance.

Graph, Timeline, Arcs, Source Comparison, World View and Investigation Context are unchanged. C2 does not establish complete predecessor equivalence, live pipeline operation, consolidation of every identity or readiness to retire yhb, nie or jfn. The October3 priority is unchanged and is not billing/retirement evidence.

## 8. What later sections can reuse

Reuse the tested worker, guarded installer, exact candidate, target fingerprint snapshot, case harness and unchanged C1 News integration. Do not repeat orientation, broad passing regression/build, sample acquisition, canary, restore or completed containment without a changed guarantee.

### Deployment order and secure recovery preparation

1. Establish a separately authorized isolated hosted surface and no-additional-charge evidence, legitimate installer capability and worker login/effective-role path. Qualify connection/pooler transaction behavior and hosted reader/private denials without production material.
2. Refresh only affected target version, function/ACL/default/trigger/source-flag drift. Resolve applicable omitted dependencies; do not replay foundation migrations on a live database.
3. Freeze the exact candidate/installer/worker identities and separately authorize the precise migration action. Hold worker admission inactive. Run the guarded candidate install in one transaction; lock timeout or identity conflict means stop, inspect and preserve diagnostics.
4. Verify hosted post-install identity, grants, publication defaults and scoped compatibility before separately authorizing a host binding. Source acquisition, scheduling, processing admission and publication each retain their own authorization.
5. Only an authorized operator may supply the qualified service-role connection and approved hydrated input to the imported worker. Keep bounded runs and sanitized failure diagnostics; no collector-shadow contract change.
6. On interruption, preserve the database lease/job evidence. Rollback protects finish/candidate/trigger effects together; expired leases follow native retry. Terminal validation remains dead-lettered. If fail bookkeeping cannot be written, the worker reports lease_recovery_pending; do not forge completion.
7. For a later live defect, suspend further admission/invocation through the authorized operator, preserve append-only captures/history and pending queues, and prefer a reviewed forward correction. A migration conflict rolls back atomically. Do not restore unsafe ACLs, replay historic migrations, erase evidence or blindly replace the old enqueue/finish after metadata-bearing jobs exist.

Steps requiring live changes or activation are prerequisites, not instructions executable under C2.

## 9. Remaining risks, costs and owner decisions

**Live authorization packet is not ready.** The smallest unresolved prerequisite is an established, authorized isolated hosted target and worker transport/identity on which to prove Auth/JWT/PostgREST and transaction behavior. Target service_role is not a login. No new sandbox, credential, grant, production mutation or paid capacity was created.

Incremental CI cost was **VERIFIED NO ADDITIONAL CHARGE** before dispatch: repository public, existing standard hosted runner, no cache/artifact uploads or runner upgrade; [GitHub's current Actions billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Bounded existing-target catalog reads were similarly held until existing active compute and enabled spend-cap status were verified privately. No subscription alone was treated as evidence and no billing settings were changed. Raw sensitive catalog/source/billing details remain within their existing boundary; only sanitized structural evidence is recorded here.

Inherited allowance:7executions/899seconds used,3executions/2701seconds left. C2 consumed1execution/26seconds. **Total8executions/925seconds; remaining2executions/2675seconds (44m35s)**. These are observed elapsed job timestamps, excluding queue and skipped matrix job, not an invented bill or ChatGPT quota conversion. The 4GiB build exception is consumed and was not reused. No application build inputs changed, so no new build was needed.

| Campaign verdict | Result |
|---|---|
| AUTHORITY CONSOLIDATED | NOT ESTABLISHED; complete predecessor reconciliation remains |
| PIPELINE VALIDATED IN ISOLATION | NOT ESTABLISHED for complete intended pipeline; C1 and C2 bounded receipts only |
| PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND | NOT ESTABLISHED; no deployment or live invocation |

## 10. Exact continuation state

Parent reconciliation accepts the fresh non-implementing review: no unresolved must-fix within the demonstrated C2 portable scope. No independent replay is claimed. All executable independent work in this bounded section is complete; remaining hosted/live work requires the named environment, identity and authorization prerequisites.

**Next permitted action:** reuse this tested candidate and worker/caller/recovery map in separately authorized hosted qualification planning. No remaining test needs dispatch merely to consume allowance. Do not infer migration, activation, merge, cutover or retirement permission.

**Preserved C1 identities:** reviewed implementation `6a3585ed931be328b1f0199512b6dde69f6415f2`; successful build `b9502dc79949a2b27363b94f495bcfc1b62cf5bc`; report blob `72d2df001cd0a8586f9b2eb6a663e9774b47ef74`. Execution confirms src tree `4cfffc8bbf4c0a105328f0ae543f11dd135cdc13`, tests tree `667b8d39bf77290bcbf1d83ecc9176ab683f8289`, lock blob `b5d44ec6e0a21f931cb2d43884010025ee89889c`; Vite config `6b5514dc489a8e4ec7c5b4d658b1f19c119d8f77` unchanged.

**C2 exact blobs:** worker `4994d8c69f9f1cd7cd2f5321881456c10f4d543c`; installer `9a4c121fc26606885804d778509b9eacedc0b7c0`; harness `468993acea551bce590f32b3e848ad3df00ea309`; structure `9599c3f335bdeda8b7f849b58c213b565eb0f25e`; fingerprints `836579fd03f17a1428da1b847e07a42fd5f0909b`. Unchanged source-identity candidate `d3bc6643998a6aa482c35fcdcc0ab754950dda5d`. Execution workflow `102537ad3bb1c9f828ac91e86001908b019b4265`; closeout restores prior blob `44932ab442e31b83cd855016578d99dbc5afa47e` without dispatch.

All durable changes are sanitized code/evidence in the existing exposure-checked remote branch. Preparation/closeout commits use [skip ci] and retain deployment exclusions. No durable MIP file was created on the physical device. C1 records and historical failures remain intact; no real material, retained artifact, source activation or containment reopening occurred.
