# Versioned hypothesis assessments — implementation plan and first slice

Owner specification: the 13 September 2026 request describing competing explanations, inspectable evidence/inferences, separate likelihood and confidence, preserved revisions, temporal views and reassessment. Baseline PR #153 checkpoint d9ccc76a2001c0cef16a8977c21f18030911a570. This specifies isolated feature engineering, not production deployment, source admission, numerical scoring policy or publication approval.

## Full intended end state

A signed-in, authorized private-investigation user can inspect and compare immutable completed hypothesis assessments; expand evidence, arguments, counterevidence, assumptions and change conditions; choose as-known-then or reconstructed-now history; and see pending reassessment separately from a completed changed/unchanged/less-certain conclusion. Authorized backend processing retains exact evidence and method versions, handles invalidation and restart safely, and never promotes an allegation, confidence rating or public release automatically.

This feature extends the existing investigation/assessment trail. It does not repurpose the World View temporal assessment or aggregate supporting/contested/missing counts into confidence. It is not an October 3 retirement prerequisite unless an actual required existing backend dependency is identified.

## Finite implementation sequence

| Step | Work and acceptance evidence | Current state |
| --- | --- | --- |
| H1 | Shared contract for competing hypotheses, evidence quality, diagnostic relevance, likelihood, per-hypothesis confidence and overall confidence; explicit non-estimation; arguments and revision causes. Unit tests reject unbound links and future knowledge. | Implemented in hypothesisAssessment.js; qualification pending hosted CI at commit creation. |
| H2 | Collapsed/expanded display integrated with saved reasoning; inference status, limitations, clocks, review/publication separation; accessibility and disclosure tests. | Saved-payload consumer implemented in HypothesisAssessmentPanel.jsx and InvestigationAssessmentTrail.jsx. It does not make an existing backend emit new records. |
| H3 | Private immutable PostgreSQL version store and exact-content retry; CAS predecessor, concurrent completion ordering, current authority, request receipt, immutable evidence/method references, private grants/RLS and durable audit. | Initial isolated PostgreSQL store and trusted-gateway adapter implemented, with append-only rows, exact retry, predecessor conflict, membership fences and server completion time. PGlite durable close/reopen tests added. Native concurrency/process-kill, full parent-assessment binding and production-shaped transport remain open; no service_role enters worker scope. |
| H4 | Evidence reader binds exact retained input versions/spans and permission-backed operations, independence/origin relationships, assumptions and inference edges. Reject unsupported source versions and worker self-attestation. | Retained-observation metadata/span adapters and gateway preparation implemented in isolation. Exact native digests, operation/domain scopes and acquisition clocks are checked. Real-material authoritative reader binding remains unavailable; synthetic positives do not qualify it. Atomic binding with revision acceptance remains open. |
| H5 | Append-only invalidation/reassessment jobs for new evidence, correction, withdrawal, contradiction, shared-origin discovery and methodology changes. Atomic current-generation acceptance; pending/failed/retry/restart with exact receipts and no force cancellation. | Not implemented for hypothesis assessments. Reuse F3 rather than create a parallel mutable worker. |
| H6 | Complete history endpoint and authenticated workspace client/controller: as-known-then uses trusted recorded completion/observation visibility, reconstructed-now uses a newly saved assessment for the same subject period. No historical evidence substitution or client clock authority. | Pure retained-history selector implemented; authoritative endpoint, visibility/commit semantics and controls remain unimplemented. |
| H7 | End-to-end private author/reviewer workflow, compare revisions, changed/unchanged/less-certain outcomes, source correction regression, access revocation, actual restart and native concurrency evidence; remote rendered visual inspection. | Not implemented. Existing saved-rationale integration is not full authoring or backend delivery. |
| H8 | Approved scoring methods/rubrics and calibrated probability path with provenance, held-out evaluation and explicit undefined estimates. Public promotion remains separately gated. | Owner-gated numerical/semantic settings. No values, labels, priors, thresholds, normalization assumptions or qualification results invented. |

The full feature is not complete until H3–H7 are implemented and verified and any method required for an enabled rating is explicitly authorized. Qualitative labels may be displayed as recorded judgments with a method reference and basis; structural validation does not approve that method or establish calibration. Numeric probability/rubric payloads currently fail closed rather than masquerade as meaningful estimates. Synthetic Moderate in a display test is not a production rubric.

## First-slice contract and scope

Three comparison states are distinct: better_supported, difficult_to_distinguish and insufficient_to_rank. A favored alternative need not exceed 50%; no percentages are manufactured or normalized, particularly for overlapping explanations. Evidence quality and relevance remain separate fields. Reports-allegation, supports, weakens, compatible and context edges remain distinct stored relations. An origin-group identifier is not independently verified source independence.

Each saved record names its question and revision, hypotheses, exact retained input positions/material versions, argument references, assumptions, gaps, change tests, methodology/model version, rationale, review state, predecessor, cause and effect. Likelihood and confidence are independently absent or explicitly recorded qualitative judgments. Their reasons remain visible. This contract does not compute an assessment or attest that a model actually inspected an input.

Knowledge cutoff and assessment completion require explicit UTC instants with preserved microsecond precision. Acquisition after the cutoff is rejected even when publication/event dates are older. Event and publication values are displayed at their retained precision; no date is borrowed from another clock. The later backend must assign trusted recording times and serialize visibility; client-provided timestamps are not authority.

The retained-history selector rejects incomplete/duplicate/inconsistent chains. It operates only on an already authorized complete retained response and cannot establish historical freshness by itself. The existing backend's explicit historical-query refusal remains intact until H6 is implemented.

The panel is added only when a saved assessment includes hypothesis_assessment. Legacy saved reasoning and trails remain unchanged. It does not enable a route, synthesize a record or fetch new evidence. The panel renders saved strings as React text, keeps detail content deferred until expansion, and preserves private access gating inherited from the workspace. A malformed payload reveals no saved hypothesis content.

## Backend and review design to implement next

Use immutable records plus append-only processing/invalidation events. An assessment revision owns a retained evidence snapshot, argument graph and separately versioned method references. Publication eligibility is independent of all ratings. A correction marks current dependents pending and requires a new authorized assessment; it never mutates a prior rationale or republishes anything. Method changes carry a distinct cause.

The backend must lock question/generation and current authority before acceptance; a committed revocation invalidates acceptance and rolls back output/ack/receipt atomically. A completed assessment and its generation receipt commit together. Retrying requires identical arguments and current owner/runtime authority. Source rights/privacy/admission reader results must bind the exact operation, material and audience. The CC batch remains closed and supplies no new material for this feature.

Reuse current investigation assignment and access checks; authorized server delivery must bind the hypothesis record to its parent assessment/question/investigation. A browser payload, GitHub username, saved rationale or worker claim is not authorization. Do not add a second live source of policy or permission truth.

Preserve prior candidates/reviews/manifests and all D4/D5, F1/F3/F6 and World View regressions. Production cutover remains ON HOLD. No deployment, migration application, schedule, credential, live source retrieval, public publication or local project-file storage is authorized.

## Verification

New tests cover missing estimates, comparison states, numeric-method denial, microsecond acquisition boundaries, impossible timestamps, exact bigint positions, ambiguous links/history, overlapping hypotheses, separate methodology revisions, historical selection and unchanged input snapshots. Component tests cover collapsed inference/uncertainty, deferred expansion, exact references, reporting-versus-support language and invalid-record refusal.

Run Golden tests/builds on hosted Node 22/24 and inherited isolated/native suites. Fixtures are explicitly fictional. This first slice requires no new source admission, production identity, external model or paid service.

## Isolated revision store follow-up

`supabase/qualification/hypothesis-assessments/001_revision_store.sql` is qualification SQL, not a migration and never applied to live projects. A NOLOGIN/NOBYPASSRLS function owner is separate from the execute-only trusted gateway role. FORCE RLS protects revisions; mutation and truncation fail. The gateway receives a verified user UUID from the future authenticated transport, then the database rechecks existing investigation membership using the same advisory fence as the current access-change RPC. Viewer reads and reviewer appends are distinct. Workers get neither gateway membership nor table/function access.

The API checks current authority before receipt replay. Exact retries preserve the first saved result; changed arguments/owners conflict. Per-investigation serialization and expected predecessor prevent two independent callers from silently overwriting a head. Completion time, revision and ID are assigned by the server; old evidence dates do not backdate completion. Reading returns complete retained history for the authorized investigation. No public read/release endpoint exists.

`store.mjs` enforces the shared hypothesis contract before parameterized SQL. The database envelope/temporal checks are defense in depth, not a replacement for authoritative evidence validation. A trusted gateway is outside the worker compromise boundary; it is not yet wired into the existing live service or a production principal. No new production identity, permissions or credentials are provisioned.

The new durable test closes and reopens the disk-backed PGlite database on the GitHub runner and verifies old versions and exact retries. This is **not** SIGKILL or multi-connection native PostgreSQL proof. Test files contain only explicitly synthetic inputs; temporary database files are removed afterward. H4–H7 remain open and the feature is not complete.

## Retained evidence binding continuation

The gateway preparation adapter reads only the named saved investigation/version/observation. It rejects ambiguous positions, different immutable versions, substituted acquisition/publication/event clocks, missing database-native envelope hashes and unbound argument spans. Unicode code-point span boundaries and excerpt SHA-256 are independently checked. A favored hypothesis needs a linked supporting argument; allegation reporting alone cannot satisfy that structural requirement. This does not establish that the inference is substantively correct.

`002_retained_observation_reader.sql` reads the existing evidence_pipeline investigation versions and observations. It adds no permission registry or source copies. The metadata endpoint returns source identities/times and database-computed hashes, omitting all title/summary/body text. A narrow permission endpoint derives material/version scopes from that same retained record and delegates to the existing operation_check implementation.

The excerpt endpoint independently rechecks current membership and all retention/analysis/excerpt_display × rights/privacy scopes before returning only the exact requested passage. The existing permission checker holds its permission/revocation fence through transaction completion. Missing permissions, wrong hash/span, revoked membership or revoked privacy deny. The closed CC batch namespace is explicitly refused; its prior admission is not reused for this feature.

All hypothesis entrypoints now require read committed isolation, so an older repeatable-read membership snapshot cannot masquerade as current authority after waiting on a revocation fence. Native concurrent proof for the feature still remains H7 work; these tests do not replace it.

The integration test loads the actual existing pipeline/workspace migrations, creates synthetic retained inputs through their APIs, and uses the frozen 008 operation-check function/table definitions with six explicitly synthetic permission records. It exercises the new adapter under the narrow gateway role. It does not introduce real policy, new source admission, live database changes or new CC retrieval. Real mode requires additional bound primary evidence and admission references and rejects synthetic receipts. No actual real-material positive qualification is claimed.

Preparation returns **prepared_requires_atomic_acceptance**, never a committed assessment, eligibility approval or public-release authorization. H5 still must couple current source/method changes, acceptance and durable reassessment receipts atomically; the old 001 append remains an isolated store primitive, not the completed feature's public write route. Authenticated frontend delivery and committed-observation history remain H6–H7 work.
