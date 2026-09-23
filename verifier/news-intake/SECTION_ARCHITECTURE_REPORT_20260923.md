# C1 · Canonical intake-to-News reader integration

**Stage and mission:** Stage 2 → 3; the owner explicitly adopted 06_NEXT_STAGE_PROMPT.txt, then replaced the initial ceiling with ten additional source-free executions and sixty additional CI runner-minutes. Production, data-transfer, source activation, merge and deployment exclusions remain.
**Before identities:** application repository `jkelsen13-tech/media-intelligence-platform-v2`, consolidation branch `codex/mip-backend-consolidation-20260920`, baseline `d694f172dc4100321a5157562746578ee74417e3` / tree `823087bbe0ad7aed531d084e8c3a517da98ee47a`. Main `1dc3172` and separate integration foundation `4d69243` were inspected; neither was merged. PR177 targets the EFTA remediation branch, not main.
**Requirements affected:** source identity, pending/publication separation, reader eligibility, typed clocks, qualified coverage, version uncertainty and existing consumer navigation in active workflow v3 and proposed reader contracts. The envelope is an implementation choice, not a new publication authority.
**Evidence basis:** source inspection, targeted live metadata only, synthetic execution receipts below, and separately labeled historical restore receipt.
**Team:** parent reconciler, same-run Sol Medium implementation and bounded evidence workers; fresh nonimplementing Astra High review. Requested model/effort routing was accepted, but independent runtime model telemetry was not exposed. A proposed extra evidence worker hit the thread limit; an existing worker was reused. No independent replay by the reviewer is claimed.

**Section result:** PARTIAL — isolated integration implemented and verified; whole-application build qualification remains gated.
**Observation window:** 2026-09-23 03:25–04:18 UTC.
**After identity:** `6a3585ed931be328b1f0199512b6dde69f6415f2`, tree `a1e09bc42e816fd24f452007ffed8b1d5f44e99e`. Documentation-only successor records this report.

## 1. What happened and why it matters

This section connected existing source-shaped intake to native persistence and the existing News reader interface. Synthetic records now pass through SQL authority, the installed SDK and a rendered existing News card. Native tests and the full non-skipped application regression suite pass. Full build qualification remains incomplete because three bounded build configurations exhausted V8 heap; the section is not presented as globally complete or production-ready.

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

All executions used original synthetic text and disposable PostgreSQL 17.6, with Node24 and the installed Supabase SDK. Runtime containers had no external network, no published ports or production credentials. Dependency installation occurred before isolation. No artifact upload, restore or source acquisition was part of this lane.

| Check / receipt | Executed result | Bounded meaning |
|---|---|---|
| [Run 1](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816031343), `47d265c` | FAIL: missing disposable validator dependency SELECT | Earlier native steps completed; no reader PASS attributed |
| [Run 2](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816262855), `174b24a` | Native/reader PASS; 2,137 regression pass, four scratch-filesystem failures, eight skips | Actual SQL→SDK→rendered News card and permission-denial path exercised |
| [Run 3](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816777517), `35869f5` | Native/legacy compatibility PASS; fixture copy failed ownership preservation | Same legacy payload/hash observed before and after candidate; Node checks not reached |
| [Run 4](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35816973752), `728c578` | Native 2/2 PASS; regression 2,144 PASS, zero FAIL, eight existing skips; build heap OOM | Broad suite passes; default 512MB V8 build heap was insufficient |
| [Run 5](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35817437990), `34cb7f7` | Native 2/2 PASS; build 768MB V8 heap OOM | Application/test blobs unchanged from broad PASS; build still unqualified |

| [Run 6](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35817649764), `6a3585e` | Native 2/2 PASS; build 896MB heap OOM, exit 134 | Same 1GB container cap; no container OOM-kill claim |

Native assertions covered duplicate replay, exact source metadata, same-URL distinct capture, rollback after post-finish interruption, stale lease refusal, retry, pending correction history, private/RPC denial, withdrawn-source withholding and legacy hash compatibility. The reader assertions exercised typed clocks, unknown independence/version fields, stable article destination, empty unapproved claim output and permission-denied feed/detail reads. Existing frontend regressions rejected out-of-order details and destinations.

The full regression command was `node --test --test-concurrency=1 $(find tests -type f -name "*.test.mjs" | sort)`. Eight existing durable-registration tests were skipped, not counted as passed. Native checks used `node --test --test-concurrency=1 verifier/news-intake/newsReaderNative.test.mjs`. The build used the ordinary Vite production configuration, with runner config loading and temporary output rather than deployment. The reviewer inspected code and exact logs independently, but did not independently replay execution. All six runs retained diagnostics and observed disposable cleanup. Runs 5–6 changed only workflow and ledger, so run 4's broad regression result applies to identical application and test blobs.

## 7. Meaning for the larger MIP architecture

This slice reuses the canonical job/capture owner instead of creating parallel news persistence. Article identity remains canonical URL; source metadata qualifies capture/job identity. It does not establish one global identity across every predecessor store. Exact captured text and pending candidates remain private. A changed capture is reconsideration input, not a silently accepted correction.

The same adapter functions can be called by a later authorized worker without duplicating extraction logic. The existing frontend consumes the existing bound News backend. No API, CLI or MCP source acquisition was activated. Graph, Timeline, Arcs, Source Comparison, World View and Investigation Context retain their distinct semantics and routes; this work does not replace them with article lists.

### 7.1 Reader-facing meaning and publication boundary

An eligible source card now carries a qualified contract alongside its existing fields. Publication time is publisher-supplied; fetched time means first observation in the public article row. Event time and material-change time remain unknown. A newly fetched old article is therefore not labeled a new event or assessed Breaking news.

The envelope exposes article ID, feed, URL and outlet, while private capture ID and input revision remain null. Coverage is scoped to the current page, and independent origins are unknown. Two outlets repeating a statement do not establish independent corroboration. The envelope does not claim that separately queried graph, event and claim projections form an atomic snapshot.

Home/Feed and existing article detail integration are exercised within the bounded test. Following is not implemented: the existing local visit marker is not an account-following store. On the Record remains a later consumer; existing investigation definition/revision and input-impact clients are located reusable seams. Following preferences would not confer evidentiary support or publication authority.

## 8. What this enables next

| Consumer / section | Reusable prerequisite | Remaining gate |
|---|---|---|
| Authorized worker integration | Source payload adapter, transactional native processing and metadata candidate | Hosted dependency/authority qualification and explicit activation |
| News reader development | Additive envelope, actual bound backend and synthetic integration lane | Any new public field, version projection or editorial policy |
| Following / On the Record | Located investigation revision and input-impact contracts | Separate implementation scope and product rules |
| Consolidation / retirement planning | Scoped test and historical restore receipts | Complete caller, runtime and recovery qualification; separate live authorization |

Do not repeat sample acquisition, canary, retained-artifact retrieval or completed containment. This section does not turn the October 3 cost-containment target into billing evidence or authorize retirement. The final Max audit remains a later explicitly kicked-off prelaunch task.

## 9. Remaining risks, recovery and owner decisions

The remaining execution decision is narrowly bounded: an exception to the preserved 1GB build-container allocation, for one source-free build-only run on the same standard hosted runner. The proposed cap is 4GB with a 3GB V8 heap, a 15-minute timeout, network disabled, no credentials, temporary output and no upload/deployment. It consumes the existing allowance and must incur no additional charge. This exception has **not** been authorized or executed. Three heap failures at 512/768/896MB support the need for more build headroom; they do not measure the minimum required memory or prove a container OOM.

The test transport is not hosted Supabase. Auth/session refresh, PostgREST behavior, Edge, poolers, Storage, Realtime, enabled collectors and predecessor reconciliation are outside the proof. Empty analytical dependencies verify withholding; they do not qualify semantic evaluation or accepted multi-surface propagation. Permission-denied reads and stale detail-response rejection are separately tested properties; there is no claim of atomic invalidation of every already in-flight response when authority changes.

Recovery for this branch-only change is a reviewed code reversal or secure forward correction. There is no production state to roll back from this slice, and no authorization to restore unsafe historical ACLs. The existing SQL migration is untouched; the source-identity extension remains an unapplied production candidate. Prior retained-material custody and deadlines were neither extended nor reopened.

| Campaign verdict | Scoped result | Changed? | Limitation |
|---|---|---|---|
| AUTHORITY CONSOLIDATED | NOT ESTABLISHED | No | No complete predecessor reconciliation |
| PIPELINE VALIDATED IN ISOLATION | NOT ESTABLISHED for complete intended pipeline | Bounded slice evidence added | No full semantic/analytical/hosted path |
| PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND | NOT ESTABLISHED | No | No deployment, enablement or live invocation |

## 10. Exact continuation state

**Next permitted action:** read-only reconciliation of these receipts; further build execution awaits the specific allocation exception above. No remaining independent code correction was identified by fresh review.
**Parent disposition:** WAIT AT NAMED RESOURCE GATE for full-build qualification; the implemented native integration and regression evidence are preserved.
**Next report must inherit:** unchanged application/test blobs from `728c578` through `6a3585e`, six immutable run receipts, pending-only publication and explicit reader uncertainty.
**Do not repeat or undo:** orientation, material acquisition, canary, retained-artifact restore, containment or passing broad regression without a changed guarantee.
**Permission remaining:** four of ten additional executions; 45m54s of the sixty-minute elapsed-runner allowance, using observable job start/end times. This is elapsed runner usage, not verified billing; remaining dispatches must reserve their maximum timeout against the lower boundary.
**Durable receipt:** this report and `verifier/backend-consolidation-2026-09-20/intake-reader-section-20260923.json` in the existing remote branch. The parent verifies the committed blobs after writing.
**Private-material/device status:** no new real material or retained artifact accessed, no durable MIP project file created on the physical device. Disposable containers/volume cleanup passed in all six runs; no retained build artifact was uploaded.
**Observed usage:** six dispatches, 846 runner-seconds (14m06s). Actual ChatGPT quota/billing conversion is not inferred.

The sanitized historical restore receipt remains [separately scoped](https://github.com/jkelsen13-tech/mip-production-qualification/blob/e543e2b3577257662730a6a25f357edb74970c05/real-material/restore-only/restore-followup-20260922.md). Its artifact was not retrieved. This report adds bounded integration evidence without reopening that completed work.
