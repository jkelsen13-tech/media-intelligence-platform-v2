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
| H3 | Private immutable PostgreSQL version store and exact-content retry; CAS predecessor, concurrent completion ordering, current authority, request receipt, immutable evidence/method references, private grants/RLS and durable audit. | Not implemented for this feature. Reuse existing private investigation identities and isolated F1 authority boundaries; do not introduce service_role into worker scope. |
| H4 | Evidence reader binds exact retained input versions/spans and permission-backed operations, independence/origin relationships, assumptions and inference edges. Reject unsupported source versions and worker self-attestation. | Contract references exist; authoritative backend binding remains unimplemented. |
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
