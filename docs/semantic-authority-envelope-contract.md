# Semantic authority envelope v1 — bounded source foundation

Authored against c90664dbe3cb77653b4157a1b9f3aeb4350e9ca5,
tree fb387dc5cb1a024dde29e9d1af160b88364e36c9. Source only; tests NOT RUN.
This new pure module does not install, call or replace any authoritative reader.
It is not operational C12/C13 closure, a provider-neutral decision engine,
a cross-user cache, a database receipt, a provider activation, or publication.

## Existing producers and consumers

The canonical foundation stays qik private evidence/decision storage. The module
does not create another store. It projects metadata from these exact contracts:

| Existing source | Exact blob | Connection |
| --- | --- | --- |
| docs/SEMANTIC_DECISION_ABSENCE_CHANGE_AUTHORITY_2026-09-20.md | 11caf18f7da6a8c02d2cfeaecdacec79d4281f94 | Required broader authority/taxonomy; this slice implements only supported mappings. |
| supabase/migrations/20260906051224_evidence_assessment_dependencies_v1.sql | d6092de9540550c4d126c91494cfe3374f02a721 | public.mip_assessments_v1 read returns the immutable assessment plus current stale causes/replacements; append retries can return a stale historical ID. |
| tests/evidenceAssessments.test.mjs | 4b989210d1ad257f75dc24ed030c2696f66cc601 | Existing source tests for exact retry, correction propagation, private status and historical refusal. Not executed here. |
| supabase/qualification/hypothesis-assessments/005_reassessment_causes.sql | 908e72584d14f937292d554c8a9e0a497034be0b | Scoped cause IDs, permission change metadata and backlog v1. |
| supabase/qualification/hypothesis-assessments/006_reassessment_completion.sql | e86b7da084beb9ae0fb723d00153e66a20b21bc3 | Backlog v2 adds resolution metadata; only the separate complete_reassessment API commits a completion receipt. |
| supabase/qualification/hypothesis-assessments/007_human_reconsideration.sql | 5ae00ef13ce49c29884503b2cb5501bdc442be42 | A human request is not approval/override; no stronger canonical mapping is invented. |
| supabase/qualification/hypothesis-assessments/009_generation_worker.sql | 6c95c0f2b0bacd709c62ecc714bad6600b675c95 | Existing generation/method/input-hash/current-permission authority is preserved; not invoked or recreated here. |
| supabase/qualification/hypothesis-assessments/011_method_change_signals.sql | 8777e2bb814c8e67e96ff8d84e3d5970ababb382 | Exact accepted/observed method revisions and active state, classification method_change_requires_reassessment_not_approval. |
| src/lib/hypothesisAssessment.js | 4ce4979a85c2388d9f181b0599fab960ecad7d69 | Existing saved reasoning dimensions and temporal limitations remain unchanged. |
| src/lib/sourceComparisonReadPath.js | ab53e0508e9d3573b62cc82b34f7bd9d95d445d4 | Claim views distinguish omittedBy from coverageUnknown over supplied extraction coverage. |
| tests/comparisonExtractionCoverage.test.mjs | 0a5a9109bda95919d265e9542af3610d0e529386 | Existing partial/false/missing coverage and correction tests. |
| tests/hypothesisMethodSignals.test.mjs | 45495c3603a4ada9d5d957a56875a43095814402 | Existing method-change/pending/private distinction. |

No existing caller is changed. An eventual server/private consumer must supply a
complete fresh response from its authorized reader; independent public-row fetches,
caller identity assertions, worker booleans and receipt UUIDs are not substitutes.
The module cannot authenticate a supplied JavaScript object. Existing database
currentness, scope/membership, rights/privacy and method checks remain mandatory.

## APIs and exact meanings

assessmentAuthorityEnvelope(read) accepts the complete existing assessment-read
shape and returns a frozen metadata envelope. All source fields are explicitly
allowlisted. It retains the assessment/candidate/predecessor/parent/ancestor IDs,
ordinal, source algorithm identity/version, outcome, exact context/extra positions,
original input fingerprint and current stale/supersession metadata. Bigint positions
remain decimal strings; unsafe numeric representations refuse. Supplied timestamp
microseconds and offset remain intact. Context/set ordering is retained; a changed
order conservatively conflicts on exact metadata retry.

Rationale, remaining uncertainty and watch keys are checked for bounded input shape
but are NOT copied into the envelope. The immutable assessment ID remains the
authoritative resolver for its reasoning. Source input_fingerprint is preserved
with its legacy PostgreSQL JSONB scheme; it is not relabeled as a full evidence-hash
digest or replaced by the new envelope digest.

Only insufficient_evidence maps to unknown_or_unresolved, scoped strictly to that
assessment outcome and with negative_evidence=false. Supported, contested and
not_supported remain their exact original outcomes; none becomes an absence fact.
Policy, domain-adapter, provider, explicit temporal scope, entity roles and an
evidence-revision/hash digest are explicitly unrepresented. Null here means
unrepresented by this producer, not disabled, absent, approved or unnecessary.

hypothesisChangeAuthorityEnvelope(backlog,causeId) accepts a bounded complete
backlog v1/v2 response, selects exactly one immutable cause ID and preserves its
revision, metadata and any recorded resolution. It supports:

- method_changed → method_changed, scoped to evaluated-method authority, preserving
  accepted/observed method revision, implementation and active state. It does not
  infer an algorithm, provider/model/config or methodological substantive change.
- permission_changed → visibility_changed, scoped to the exact retention,
  analysis or excerpt_display operation and rights/privacy domain. It preserves
  input position, accepted/observed permission revisions and the original reason.
  A historical denial is not proof that permission remains denied now; it grants
  no access and is not converted into a current blocked-absence observation.

A backlog has no current authorization receipt. Its envelope therefore always has
currentness.state=unknown, even when discovery coverage names reconciliation.
A resolution_revision_id records the original resolution link but does not turn
the backlog into a completion receipt, review approval, or publication decision.

retained_source_change, retained_assessment_change, workspace_changed and
human_reconsideration refuse canonical cause conversion with
semantic_cause_unrepresented. A generic source position does not establish
correction/retraction; an added assessment does not establish supersession;
a reviewer request does not establish a completed human override. Missing mapping
authority must be supplied by the corresponding actual producer, not guessed.

classifyComparisonAbsence({id,omittedBy,coverageUnknown}, outlet) takes only those
three fields projected from the existing claim view. It returns an ephemeral
classification: not_present_in_extracted_coverage, coverage_unknown or
no_absence_observation. It retains the existing opaque claim identifier, not
outlet labels, and sets canonical_absence_kind=null and
persistable_as_canonical_absence=false. Those arrays have no immutable examined
capture/span boundary, so no canonical source-level or retained-evidence absence
is minted. An outlet appearing in both arrays refuses. Unknown coverage cannot
be silently changed to not_extracted, not_searched or source_unavailable.

requireCanonicalAbsence(envelope) exposes only the supported assessment-scoped
unknown observation from an envelope created by this module in the current process.
All comparison classifications and stronger unsupported meanings refuse.

## Digest, retry, currentness and visibility

Envelope version is mip_semantic_authority_envelope_v1. Its digest scheme is
semantic_authority_sorted_json_utf8_sha256_v1: object keys sorted by JavaScript
code-unit order, arrays in retained order, JSON scalar encoding, UTF-8 SHA256.
Canonical encoding is bounded to 65,536 bytes, 10,000 nodes and depth 16.
This is a metadata projection digest, NOT the original SQL fingerprint, a full
source-row/content hash, a signature or a semantic decision-key replacement.
It excludes the envelope_digest field itself. The module uses WebCrypto and
has no runtime imports, I/O, logging, network, storage or mutable external state.

assertSameMetadataRetry(previous,current,{mode}) checks digest integrity and
complete envelope equality. Current must be a newly constructed in-process
envelope; a deserialized/caller-crafted object is not accepted as a fresh read.
Previous may be its serialized historical envelope. Default current_observation
also requires the source assessment observation to be current, not stale or
superseded. historical_metadata permits exact historical equality but never
authorizes reuse. The result always says authorization_conferred=false and
reuse_authorized=false. No timestamp freshness window, signed-reader claim or
authorization intersection is invented. Reprojection itself is not proof that
a caller used a fresh database transaction.

Every envelope remains private and carries five false flags:
authorization_conferred, cross_user_reuse_allowed, publication_allowed,
provider_activation_allowed and semantic_qualification_claimed. Existing public
comparison inputs do not confer public eligibility on this envelope.

Complete top-level envelope fields are contract_version, kind, identity, scope,
producer, metadata, currentness, visibility, time, authority and envelope_digest.
Identity is namespaced; equal UUID strings in different producer namespaces are
not equivalence. Known schemas use exact nested key allowlists, fixed enums,
UUID/hash validation and bounded collections. Unsupported identifiers refuse
rather than normalize lexical text into metadata. Returned objects are frozen.

Assessment limits are the existing 500 context positions, 32 extras, 8 parents
and 128 ancestors, plus this adapter's 500 stale causes and 1 superseding ID.
Backlogs are capped at 256 causes; comparison arrays at 128 entries each.
Overflow refuses; these are supported-envelope bounds, not claims about whole
database scan cost. A larger required real response needs separately qualified
capacity extension rather than truncation.

## Tests and integration boundary

The new test file uses synthetic shapes taken from the cited producers. It covers
supported mappings, original identities/digests, microseconds/large positions,
exact retry, stale/superseded refusal, unknown causes, resolution versus approval,
false omission, malformed nested fields, bounds, metadata sentinels and private
flags. It does not execute SQL or the producer RPC and must not be reported as
end-to-end authority qualification.

Proposed invocation after parent integration:

```text
node --test tests/semanticAuthorityEnvelope.test.mjs
```

Use the existing supported Node runtime with WebCrypto. No package or installation
dependency is added. Existing assessment, hypothesis-method and extraction-coverage
tests remain unchanged. Parent owns integration, execution and applicable review.

Remaining work is the actual scoped reader/caller connection and supported
producer extensions for the unrepresented canonical semantics. This foundation
neither supplies missing historical observation evidence nor approves a method,
provider, domain adapter, cross-user reuse, material access or operational route.
