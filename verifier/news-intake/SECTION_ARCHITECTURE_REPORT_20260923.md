# C1 · Canonical intake-to-News reader integration

**Stage and mission:** Stage 2 → 3; the owner explicitly adopted 06_NEXT_STAGE_PROMPT.txt, then replaced the initial ceiling with ten additional source-free executions and sixty additional CI runner-minutes. Production, data-transfer, source activation, merge and deployment exclusions remain.
**Before identities:** application repository `jkelsen13-tech/media-intelligence-platform-v2`, consolidation branch `codex/mip-backend-consolidation-20260920`, baseline `d694f172dc4100321a5157562746578ee74417e3` / tree `823087bbe0ad7aed531d084e8c3a517da98ee47a`. Main `1dc3172` and separate integration foundation `4d69243` were inspected; neither was merged. PR177 targets the EFTA remediation branch, not main.
**Requirements affected:** source identity, pending/publication separation, reader eligibility, typed clocks, qualified coverage, version uncertainty and existing consumer navigation in active workflow v3 and proposed reader contracts. The envelope is an implementation choice, not a new publication authority.
**Evidence basis:** source inspection, targeted live metadata only, synthetic execution receipts below, and separately labeled historical restore receipt.
**Team:** parent reconciler, same-run Sol Medium implementation and bounded evidence workers; fresh nonimplementing Astra High review. Requested model/effort routing was accepted, but independent runtime model telemetry was not exposed. A proposed extra evidence worker hit the thread limit; an existing worker was reused. No independent replay by the reviewer is claimed.

**Section result:** COMPLETE within the authorized isolated intake-to-News slice — implementation, native/reader tests, broad regression, full application build and nonimplementing review reconciled. No live enablement or complete-pipeline qualification is implied.
**Observation window:** original implementation 2026-09-23 03:25–04:18 UTC; authorized build completion 05:00:54 UTC.
**After identity:** `6a3585ed931be328b1f0199512b6dde69f6415f2`, tree `a1e09bc42e816fd24f452007ffed8b1d5f44e99e`. The single build execution used `b9502dc79949a2b27363b94f495bcfc1b62cf5bc`, tree `b6edff95b7f4a4804ec4e095fdb83e2b1851ec17`, with unchanged application/test identities. A receipt/workflow-restoration successor records completion.

## 1. What happened and why it matters

This section connected existing source-shaped intake to native persistence and the existing News reader interface. Synthetic records now pass through SQL authority, the installed SDK and a rendered existing News card. Native tests and the full non-skipped application regression suite pass. The full application build subsequently passed under the owner's single 4GB build-only exception. This closes the bounded section's build gate; the section is not presented as globally complete or production-ready.

## 2. Architecture before the section

The native `mip_pipeline_v1` owner already persisted jobs, leases, article identity, exact captures, pending candidates and record history. The deterministic extractor already understood hydrated source records. The existing News backend bound its reads to one supplied Supabase client; its consumer was the existing NewsView. These were reusable foundations, not new-table requirements.

The integration gap was concrete: native enqueue retained article content but discarded registry source metadata, and finish used a generic pipeline feed. There was no exercised path from a source-shaped record, through native persistence, into the actual News backend and rendered card. Existing branch tests and a bounded historical restore did not establish that connection.

Targeted qik catalog inspection confirmed eligible-and-active article RLS, pending defaults and a separate reviewed-claim projection. Those observations informed the disposable substrate; they did not turn this branch into deployed code. The older native synthetic qualification and later bounded real-material restore remain preserved. Only the sanitized later receipt was read.

## 3. What changed, and what did not

| Component | Actual delta | Scope |
|---|---|---|
| `verifier/news-intake/native_adapter.py` | EXTEND existing hydrated source records into native enqueue; process leased retained payload and finish/candidate writes in one transaction | Reusable source-free worker adapter |
| `supabase/production-candidates/news-intake-reader/001_native_source_identity.sql` | EXTEND enqueue/finish with bounded exact source key/feed/label retention and source feed on new article rows | Unapplied candidate; no live migration |
| `src/lib/newsReaderEnvelope.js`, `src/lib/supabase.js` | RECONCILE existing feed/detail rows into an additive qualified reader envelope | Existing bound News methods retained |
| Native bridge, Node test, Golden manual lane | Connect real SQL persistence and anon reads to installed Supabase JS and existing NewsView | Disposable synthetic qualification only |

Legacy inputs without metadata retain their original hashing shape. Metadata-bearing captures preserve exact nonblank identity strings; reviewer-detected trimming and blank collapse were corrected. Corrections create pending capture history instead of overwriting the original public article. Publication defaults, accepted claim owners, deep view logic and live callers remain unchanged.

## 4. Why this approach was selected

Extending native persistence avoids a second ingestion owner and preserves existing lease, idempotence and history behavior. An additive envelope is compatible with existing consumers and makes uncertainty explicit. A new reader table would duplicate authority without solving the observed metadata loss. Keeping the old generic feed would leave source identity ambiguous.

The transaction boundary addresses a real failure mode: finishing a job before candidate persistence could leave a partially completed record. The adapter computes from the leased retained payload and rolls back finish with candidate failure. The SQL candidate changes only the narrow source contract; historical rows are not bulk-rewritten.

The HTTP bridge is deliberately test infrastructure. It executes SQL under anon and rejects unsupported projections and filters; it is not a substitute implementation of hosted PostgREST, authentication or production acquisition. Exact nested view definitions are reused against minimal dependencies. This permits an honest consumer integration test without adding production credentials or network access.

## 5. Architecture after the section

Branch / isolated flow:

```text
synthetic HydratedArticle → native adapter → mip_pipeline_v1
  → private captures/candidates/jobs/history + pending public article
  → explicit preapproved synthetic eligibility fixture
  → native article RLS + reviewed-claim view
  → test HTTP transport → installed Supabase client → bound News backend
  → qualified reader envelope → existing NewsView
```

The deployed architecture is unchanged. Extraction is not allowed to approve its own output. The fixture admission is a test premise, not evidence of a semantic evaluator or an automatic publishing policy.

## 6. What verification demonstrated

Executions 1–6 used original synthetic text and disposable PostgreSQL 17.6, with Node24 and the installed Supabase SDK. Execution 7 was build-only: no PostgreSQL, reader/native tests, broad regressions or source input were rerun. Runtime containers had no external network, no published ports or production credentials. Dependency installation occurred before isolation. No artifact upload, restore or source acquisition was part of this lane.

| Check / receipt | Executed result | Bounded meaning |
|---|---|---|
| [Run 1](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816031343), `47d265c` | FAIL: missing disposable validator dependency SELECT | Earlier native steps completed; no reader PASS attributed |
| [Run 2](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816262855), `174b24a` | Native/reader PASS; 2,137 regression pass, four scratch-filesystem failures, eight skips | Actual SQL→SDK→rendered News card and permission-denial path exercised |
| [Run 3](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816777517), `35869f5` | Native/legacy compatibility PASS; fixture copy failed ownership preservation | Same legacy payload/hash observed before and after candidate; Node checks not reached |
| [Run 4](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816973752), `728c578` | Native 2/2 PASS; regression 2,144 PASS, zero FAIL, eight existing skips; build heap OOM | Broad suite passes; default 512MB V8 build heap was insufficient |
| [Run 5](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35817437990), `34cb7f7` | Native 2/2 PASS; build 768MB V8 heap OOM | Application/test blobs unchanged from broad PASS; build still unqualified |
| [Run 6](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35817649764), `6a3585e` | Native 2/2 PASS; build 896MB heap OOM, exit 134 | Same 1GB container cap; no container OOM-kill claim |

| [Run 7](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35820587212), `b9502dc` | Full application build PASS, exit 0; cleanup PASS | Single authorized 4GB exception; identical reviewed application/test/config/dependency inputs |

Native assertions covered duplicate replay, exact source metadata, same-URL distinct capture, rollback after post-finish interruption, stale lease refusal, retry, pending correction history, private/RPC denial, withdrawn-source withholding and legacy hash compatibility. The reader assertions exercised typed clocks, unknown independence/version fields, stable article destination, empty unapproved claim output and permission-denied feed/detail reads. Existing frontend regressions rejected out-of-order details and destinations.

The full regression command was `node --test --test-concurrency=1 $(find tests -type f -name "*.test.mjs" | sort)`. Eight existing durable-registration tests were skipped, not counted as passed. Native checks used `node --test --test-concurrency=1 verifier/news-intake/newsReaderNative.test.mjs`. The build used the ordinary Vite production configuration, with runner config loading and temporary output rather than deployment. The reviewer inspected code and exact logs independently, but did not independently replay execution. All six runs retained diagnostics and observed disposable cleanup. Runs 5–6 changed only workflow and ledger, so run 4's broad regression result applies to identical application and test blobs.

## 7. Meaning for the larger MIP architecture

This slice reuses the canonical job/capture owner instead of creating parallel news persistence. Article identity remains canonical URL; source metadata qualifies capture/job identity. It does not establish one global identity across every predecessor store. Exact captured text and pending candidates remain private. A changed capture is reconsideration input, not a silently accepted correction.

The same adapter functions can be called by a later authorized worker without duplicating extraction logic. The existing frontend consumes the existing bound News backend. No API, CLI or MCP source acquisition was activated. Graph, Timeline, Arcs, Source Comparison, World View and Investigation Context retain their distinct semantics and routes; this work does not replace them with article lists.

### 7.1 Reader-facing meaning and publication boundary

An eligible source card now carries a qualified contract alongside its existing fields. Publication time is publisher-supplied; fetched time means first observation in the public article row. Event time and material-change time remain unknown. A newly fetched old article is therefore not labeled a new event or assessed Breaking news.

The envelope exposes article ID, feed, URL and outlet, while private capture ID and input revision remain null. Coverage is scoped to the current page, and independent origins are unknown. Two outlets repeating a statement do not establish independent corroboration. The envelope does not claim that separately queried graph, event and claim projections form an atomic snapshot.

Existing News feed and article detail integration are exercised within the bounded test. Following is not implemented: the existing local visit marker is not an account-following store. On the Record remains a later consumer; existing investigation definition/revision and input-impact clients are located reusable seams. Following preferences would not confer evidentiary support or publication authority.

## 8. What this enables next

| Consumer / section | Reusable prerequisite | Remaining gate |
|---|---|---|
| Authorized worker integration | Source payload adapter, transactional native processing and metadata candidate | Hosted dependency/authority qualification and explicit activation |
| News reader development | Additive envelope, actual bound backend and synthetic integration lane | Any new public field, version projection or editorial policy |
| Following / On the Record | Located investigation revision and input-impact contracts | Separate implementation scope and product rules |
| Consolidation / retirement planning | Scoped test and historical restore receipts | Complete caller, runtime and recovery qualification; separate live authorization |

Do not repeat sample acquisition, canary, retained-artifact retrieval or completed containment. This section does not turn the October 3 cost-containment target into billing evidence or authorize retirement. The final Max audit remains a later explicitly kicked-off prelaunch task.

## 9. Remaining risks, recovery and owner decisions

The owner explicitly authorized the single 4GB build-only exception after this report's original checkpoint. Run 7 passed and exhausted that exception; no second build is authorized by it. The temporary workflow is restored to its exact pre-exception blob in this completion record. The earlier three heap failures remain historical evidence; they do not prove the minimum build memory or a container OOM. Build warnings and observed peak are retained below.

The test transport is not hosted Supabase. Auth/session refresh, PostgREST behavior, Edge, poolers, Storage, Realtime, enabled collectors and predecessor reconciliation are outside the proof. Empty analytical dependencies verify withholding; they do not qualify semantic evaluation or accepted multi-surface propagation. Permission-denied reads and stale detail-response rejection are separately tested properties; there is no claim of atomic invalidation of every already in-flight response when authority changes.

Recovery for this branch-only change is a reviewed code reversal or secure forward correction. There is no production state to roll back from this slice, and no authorization to restore unsafe historical ACLs. The existing SQL migration is untouched; the source-identity extension remains an unapplied production candidate. Prior retained-material custody and deadlines were neither extended nor reopened.

| Campaign verdict | Scoped result | Changed? | Limitation |
|---|---|---|---|
| AUTHORITY CONSOLIDATED | NOT ESTABLISHED | No | No complete predecessor reconciliation |
| PIPELINE VALIDATED IN ISOLATION | NOT ESTABLISHED for complete intended pipeline | Bounded slice evidence added | No full semantic/analytical/hosted path |
| PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND | NOT ESTABLISHED | No | No deployment, enablement or live invocation |

## 10. Exact continuation state

**Parent disposition:** COMPLETE for the authorized isolated slice. The full build closes the last named resource gate. No additional implementation defect within this slice remains identified by the reconciled review.
**Next permitted action:** reuse these code/contracts and receipts in separately authorized work. Production migration, deployment, activation, cutover and retirement remain gated; no additional execution is needed for this section.
**Preserved identities and history:** application/test implementation `6a3585ed931be328b1f0199512b6dde69f6415f2`; original report-only checkpoint `1c35afb632b10b6f02f284c68e380474949f8db1`; broad regression application/test identities from `728c578` remain unchanged. Seven immutable run receipts retain all earlier diagnostics.
**Do not repeat or undo:** orientation, material acquisition, canary, retained-artifact restore, containment or passing broad regression without a changed guarantee.
**Permission remaining:** three of ten executions and 45m01s of the sixty-minute elapsed-runner allowance. The one-run 4GB exception is consumed; remaining allowance is not permission to repeat it.
**Durable receipt:** this report and `verifier/backend-consolidation-2026-09-20/intake-reader-section-20260923.json` in the existing remote branch. Workflow restoration uses exact pre-exception blob `44932ab442e31b83cd855016578d99dbc5afa47e`.
**Private-material/device status:** no new real material or retained artifact accessed, no durable MIP project file created on the physical device. All seven disposable cleanups passed; no build artifact was uploaded or deployed.
**Observed usage:** seven dispatches, 899 runner-seconds (14m59s), calculated from executed job start/end timestamps. Queue time and the skipped test job are excluded. This is observed elapsed usage, not independently verified billing or ChatGPT quota conversion.

### 10.1 Single authorized build receipt

- Execution commit: `b9502dc79949a2b27363b94f495bcfc1b62cf5bc`; tree: `b6edff95b7f4a4804ec4e095fdb83e2b1851ec17`. Compare against reviewed `6a3585e` changed only workflow, report and ledger. Relevant build inputs were unchanged.
- Unchanged identities: `src` tree `4cfffc8bbf4c0a105328f0ae543f11dd135cdc13`; `tests` tree `667b8d39bf77290bcbf1d83ecc9176ab683f8289`; lock blob `b5d44ec6e0a21f931cb2d43884010025ee89889c`; Vite config blob `6b5514dc489a8e4ec7c5b4d658b1f19c119d8f77`. Package manifest, public assets and entry HTML also unchanged.
- [Run 35820587212 / job 107051378112](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35820587212/job/107051378112), attempt 1, standard `ubuntu-24.04` hosted runner. Job 05:00:01–05:00:54 UTC: **53 seconds**, below 15-minute timeout. Exactly one build dispatched; ordinary test matrix skipped.
- Dependency preparation: existing lock, `npm ci --ignore-scripts --no-audit` before isolation. Pinned runtime `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`.
- Command: `node --max-old-space-size=3072 node_modules/vite/bin/vite.js build --configLoader runner --outDir /tmp/mip-build --emptyOutDir`. Ordinary production build/configuration, no module exclusion, altered validation or application behavior.
- Result: **BUILD_EXIT=0**, Vite 7.3.6 transformed **7,331 modules**, reported **23.13 seconds** build time; build step elapsed 25 seconds. Temporary output included main, map and Cesium bundles plus normal static assets.
- Limits and observations: container **4,294,967,296 bytes (4GiB)**; V8 old space **3072MiB**; observed cgroup peak **2,934,505,472 bytes (~2.733GiB)**. This is container memory accounting, not V8 heap-only peak or a measured minimum requirement. `oomKilled=false`.
- Isolation/cleanup: `network=none`, read-only checkout/root, dropped capabilities, no-new-privileges, pids128, unchanged 128MiB temporary filesystem, no exposed ports or supplied production credentials. Boundary inspection confirmed exit0; container removal and absence check logged **DISPOSABLE_BUILD_CLEANUP_PASS**. No upload/deployment step.
- Warnings preserved: `node:crypto` externalized for browser compatibility from `temporalAssessment.js`; mixed static/dynamic imports for `demoData.js`, `timelineDedup.js`, and `supabase.js`; chunks over 500kB. No warning suppression or chunk/module changes were made. A build PASS does not itself establish browser execution of every path or performance suitability.
- Exposure/trigger check: public sanitized code/receipts only; exact consolidation branch's deployment exclusions unchanged. Preparation and completion commits use `[skip ci]`; execution identity had zero automatic runs before the one manual dispatch. No paid runner or billing setting changed.
- Fresh nonimplementing High reviewer independently inspected exact logs, API run/job records, hashes and the reviewed-to-execution compare; accepted the bounded slice with no unresolved must-fix finding. No independent replay was performed.
- Significance: this resolves full-build qualification for the exact application/test inputs already covered by native 2/2 PASS and broad 2,144 PASS / zero FAIL / eight existing skips. It changes no architecture or publication guarantee and does not establish hosted Supabase, complete semantic pipeline, deployment or retirement readiness.


The sanitized historical restore receipt remains [separately scoped](https://github.com/jkelsen13-tech/mip-production-qualification/blob/e543e2b3577257662730a6a25f357edb74970c05/real-material/restore-only/restore-followup-20260922.md). Its artifact was not retrieved. This report adds bounded integration evidence without reopening that completed work.
