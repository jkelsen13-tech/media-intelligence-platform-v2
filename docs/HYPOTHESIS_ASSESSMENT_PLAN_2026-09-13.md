# Versioned hypothesis assessments — implementation and remaining gates

The owner’s September 13 specification is the feature contract: competing explanations, inspectable retained evidence and reasoning, separate likelihood/confidence/quality/relevance, immutable revisions, explicit uncertainty and reassessment, and trustworthy temporal views. The feature extends private investigations in MIP v2. Production cutover remains ON HOLD; this work is isolated implementation, not deployment, source admission, semantic qualification or publication approval.

## Required end state and finite work register

An authenticated, assigned private-investigation user can inspect, compare and author retained hypothesis assessments; a completed revision has exact evidence/method/dependency bindings and a preserved predecessor. Changed evidence, reasoning, source origins or methods create durable reassessment work. Processing uses an immutable generation; acceptance rechecks current authority and eligibility and commits output, acknowledgement and receipt together. Users can distinguish an old saved assessment, pending reassessment and a completed changed/unchanged/less-certain result. Historical time views must prove what was available then.

| Requirement | Implemented evidence | Still required |
| --- | --- | --- |
| H1 — assessment contract | hypothesisAssessment.js and contract tests distinguish better_supported, difficult_to_distinguish and insufficient_to_rank; separate all dimensions; reject unbound argument links/future acquisitions; preserve microseconds and missing estimates. | Method authority must govern any enabled scoring path; structure alone does not qualify a method. |
| H2 — saved reasoning display | HypothesisAssessmentPanel and the existing assessment trail show saved alternatives, argument relations, limitations, change tests, provenance and revision metadata. | Full author/reviewer workflow and rendered visual verification of the new feature. |
| H3 — immutable acceptance and recovery | Qualification 001–003: NOLOGIN owner, FORCE RLS, narrow gateway, current membership, exact retry, predecessor CAS, native source/permission/retained-assessment ordering, append-only records and process-loss tests. | New hypothesis computation must be connected to the evaluated F3 generation/runtime path; existing native client recovery does not prove that integration. |
| H4 — retained evidence and permissions | 002 and evidenceBinding.mjs bind actual saved workspace/observation IDs, native material hashes, exact code-point spans and six operation/domain permissions. Final acceptance repeats sensitive checks. | Real permission-reader qualification for any actual feature material remains unavailable. The completed CC batch cannot be reused. |
| H5 — durable reassessment and completion | 005 records exact source positions, workspace heads, permission changes and retained assessment IDs. Scoped anti-membership reconciliation repairs missed notifications without a watermark. 006 adds explicit cause explanations, atomic revision/resolution/receipt completion and full retained permission-closure binding; its new verification is pending at commit creation. | F3 immutable generation handoff, evaluated computation, failure/retry/recovery lifecycle, and explicit method-authority or other dependency signals not already represented by retained changes. |
| H6 — authenticated delivery and history | Isolated handler/store/client bind verified Auth identity; private workspace can consume an explicitly configured history client. Refresh/scope/account/access races fail closed. History permissions are rechecked. | Production-shaped Auth transport/configuration and trusted historical commit visibility. No as-known-then time claim is enabled by the retained-history control. |
| H7 — complete interaction and validation | Saved-revision selection, pending cause inspection, explicit reconciliation, client/handler/store tests, native concurrency/process loss and inherited regressions. | Authoring/reviewer completion controls, complete end-to-end generation workflow and rendered visual inspection. |
| H8 — methodology and qualification | Missing estimates stay not_estimated; numeric probability/rubric payloads fail closed. Recorded qualitative judgments are distinguished from calibrated probabilities. | Owner-approved methods/rubrics; F2 thresholds, held-out split, labels, sample minima and adjudication. No values or qualification results may be invented. |

The full feature and coherent independent-review boundary remain incomplete. The table preserves the requested end state; a tested component is not a substitute for the remaining workflow.

## Meaning and temporal semantics

Evidence quality, diagnostic relevance, hypothesis likelihood, per-assessment confidence and overall confidence are separate fields, never an average of supporting/contested/missing counts. Reporting an allegation differs from independently supporting it. A favored hypothesis requires a supporting argument at final database acceptance; that structural check does not establish substantive correctness. Shared source origins are not independent corroboration, and retained inputs do not necessarily support a conclusion.

A leading explanation need not be more likely than all alternatives combined. Overlapping hypotheses are not forced into percentages summing to 100. Missing estimates remain missing. Saved qualitative labels include their stated method/basis and are not numerical probabilities or approved calibration.

Each revision retains its question, alternatives, assumptions, evidence references, inference edges, gaps, change conditions, method/model references, review state, predecessor and revision cause/effect. Source event time, publication time, MIP acquisition time and assessment completion remain separate. Acquisitions after the cutoff fail. The database assigns completion identity/time; clients cannot backdate it.

The pure as-known-then selector operates only on an already authorized complete history and is not proof of commit visibility. Current delivered history explicitly reports retained_versions_only and historical_commit_visibility_qualified=false. The existing backend’s historical-query refusal is preserved. Reconstructed-now requires an actual newly saved assessment for that period, not substitution of today’s inputs into an old record.

## Authority, retained inputs and isolated boundaries

All SQL under supabase/qualification/hypothesis-assessments is qualification code, not a live migration. A NOLOGIN/NOBYPASSRLS owner is distinct from the execute-only gateway. Workers receive neither gateway membership nor source tables, policy writes, service_role credentials or production secrets. The future gateway receives a verified Auth UUID from trusted transport; browser JSON, a GitHub username and a worker assertion cannot supply that authority.

The metadata reader reuses evidence_pipeline investigation versions/observations and returns only identities, source clocks and database-native envelope hashes. The excerpt reader checks exact material/version/operation/audience/domain bindings before extracting the admitted span. Six retention/analysis/excerpt_display × rights/privacy checks remain distinct. Unknown, revoked, stale, unbound or unsupported permissions deny. Real receipts require an authoritative reader binding, current admission and primary evidence; synthetic-fixture-v1 positives remain synthetic.

The same existing permission/source fence orders revocation against sensitive acceptance. Membership and question locks follow consistent ordering under READ COMMITTED. An old repeatable-read authority snapshot is rejected. Acceptance-first may commit before revocation; committed revocation first prevents acceptance. Prior accepted records never supply continuing authority.

003 also detects new retained assessment IDs for candidates in the saved assessment/dependency closure, even if source bytes are unchanged. This is a reconsideration trigger, not approval of a new method or a substantive conclusion.

## Durable causes and atomic completion

005 retains immutable pending causes with exact change positions/assessment IDs and sanitized permission references. Source/head/permission triggers share existing fences. Reconciliation compares the exact saved observation and current watched records by anti-membership; it never treats a sequence allocation or timestamp as a safe watermark. Duplicate reconciliation preserves cause identities. Old rows are never deleted or rewritten.

006 keeps resolutions and completion receipts in separate append-only tables. A completing assessment must give an explicit saved explanation for every currently pending cause. Missing, duplicated, unknown or newly changed cause sets reject. New input positions and retained assessment revisions must exist in the supplied saved observation, and workspace changes must belong to its version lineage.

Completion rechecks permissions across the retained observation/dependency closure and previously accepted material. It stores exact non-content permission bindings in the receipt. Reauthorization must use a fresh permission revision for a permission-change cause; the software cannot fabricate that authorization. Unsupported prior material remains blocked rather than being silently omitted.

The new assessment, acceptance binding, cause resolutions and receipt commit or roll back together. Plain append is limited to initial acceptance and exact retry; every later revision requires explicit recorded reassessment work. It cannot bypass pending work or carry acknowledgement annotations. Explicit manual/method-change requests are still required for the complete authoring workflow. Exact completion retries recheck current identity, arguments and permission closure; later causes remain pending and are not absorbed into the old receipt. Changed permission bindings require a fresh bound assessment. Completed payload history also checks the full retained permission closure, including inputs not quoted in the final assessment.

Cause explanations are retained in the new private assessment, not copied into public/sanitized receipt metadata. Completion remains unreviewed and publication_allowed=false. Resolving technical reassessment work is not human review approval, factual-publication eligibility, a semantic qualification result or restored publication.

A backlog response is not a completion receipt. Protocol v2 preserves original causes and identifies resolutions separately; old pending rows do not disappear. The frontend distinguishes those states and rejects inconsistent history/resolution snapshots before consuming v2.

## Frontend and transport

The isolated handler accepts exact input keys, uses verified non-anonymous Auth identity, binds source namespace to trusted configuration, limits request bytes/origins and sanitizes errors. Append/complete cannot assign reviewed/public state. There is no live index.ts, production route, credential or deployment for this feature.

PrivateInvestigationWorkspace mounts the history control only when a hypothesis client is explicitly supplied. The default is unconfigured. The client creates no persistent browser cache. History rejects cross-question/public/malformed responses; account, workspace and client changes, logout, denied access and late responses clear or withhold private text. Permission causes suppress affected text even when separately fetched history and backlog straddle revocation.

Backlog v2 controls now distinguish pending causes from recorded resolutions, link to the completing revision and reveal its saved cause explanations only through permission-checked assessment history. Cross-request history/backlog snapshots must agree; an old protocol response cannot claim a newer completion. Resolving a permission cause does not restore withheld prior text. Scoring controls and author/reviewer completion remain to be finished. Existing World View, private workspace safeguards, D4/D5, provenance and temporal regressions remain required.

## Verification and preserved checkpoints

- 980042f831014d5b4490091e4f372d27ff76c2e8: Golden 1,741/1,741 on Node 22/24 with both builds; native hypothesis 24/24; integrated 53/53; inherited native/extension and browser regressions passed. Browser run 34791603172 completed successfully.
- b61d398457d955dde11f262fc6d1ca9f3be54ed5: history controls, Golden 1,740/1,740 and native hypothesis 20/20.
- 26c9bd03f2ca4a7a1846b1bb2a42105994823a1d: durable cause ledger, Golden 1,732/1,732 and native 20/20.
- 40ed4d1463741d5f953d8d53595c71ddae1ef317: permission-bound history/acceptance, Golden 1,731/1,731, native hypothesis 14/14 and integrated 53/53.
- Earlier feature/store checkpoints and failed privilege attempts remain in Git/CI history. They are not retrospectively rewritten as successes. Prior independent reviews and frozen manifests remain unchanged.

The 006 continuation adds native tests for atomic visibility/rollback, exact competing requests, cause omissions/duplicates, stale observations, bypass rejection, process loss, revocation orderings, unselected dependency permissions and later-cause preservation. New tests must pass at their exact candidate before being reported as verified. Native fixtures are explicitly synthetic and run only on the fixed loopback GitHub disposable PostgreSQL service. No production-shaped claim follows from those fixtures.

## Standing constraints and remaining owner gates

Production cutover remains ON HOLD; PRs #149–#153 stay draft/unmerged. No production writes, grants, credentials, schedules, worker invocations, deployments, publication, automatic approval, canary, paid activation, retirement or history rewriting. No project files are stored on the owner’s physical device. Skill instructions may be read locally; project code/tests/evidence remain remote.

CC stays closed at 3/3 with no activation subject. Tested activation 0da8b5a0a4f9540160b71a39a1bbba3d655bcc95, closed checkpoint cc48e4ba37af89264f7dc308cc82956e9ef80701, failed/inactive attempts and sanitized evidence are preserved. No CC retrieval, admission expansion, historical publisher clearance, external-model disclosure or spatial admission is introduced.

Numerical methodology/F2 and production issuer/subject/runtime, custody/rotation and deployment remain owner-gated. The current isolated work does not require inventing those choices. Continue independent engineering rather than repeatedly asking for unknown historical permissions.

This feature is not an October 3 retirement prerequisite without an actual existing-backend dependency. The separate consolidation records and owner/access proposals at d9ccc76a2001c0cef16a8977c21f18030911a570 remain authoritative for that work. A coherent feature review package and safe backend retirement have distinct gates; neither is declared complete here.

The first 006 native run at 15a66014a8a3e99a8a87de18ddb03ce6e3fd2543 passed 36/37 cases and failed one diagnostic-order assertion: an old observation was rejected for workspace lineage before missing source change. Validation now uses deterministic cause-kind ordering; the missing-source assertion is retained. That failed run remains failed historical evidence. Golden tests/builds passed at that checkpoint. The continuation adds a plain-append bypass regression and resolved-history interaction tests; its own exact-head verification remains required.

At b4a26361f372f4176480aa1933d96c9c1e985912, native hypothesis passed 38/38. Both Golden versions passed 1,747/1,748 and failed the new resolved-history test because it searched serialized React JSON for a sentence split across text nodes. The test now asserts the paragraph’s joined displayed text exactly. Navigation, saved explanation and withholding assertions remain unchanged. That failed run is preserved; the correction requires its own full hosted verification.

A further native case changes the observation to a different synthetic candidate scope after a completed reassessment. The next completion must carry every inherited permission scope, including unquoted inputs omitted from the new observation. Revoking such an inherited permission must withhold the latest payload and record a new pending cause. 006 now rechecks and canonically retains complete prior completion bindings instead of relying only on the new observation and the prior selected excerpts. Exact-head native verification is required for this addition.
