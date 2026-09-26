# Semantic decision, absence, and knowledge-change authority

Date: 2026-09-20

Decision: **EXTEND qik; the complete provider-neutral contract is not yet
implemented. Do not activate or purchase Jev or another provider.**

## Provider-neutral System-One decision layer

The intended canonical owner is qik's private `evidence_pipeline`, particularly
`assessments`, `assessment_invalidations`, evidence changes, record versions,
and the `mip_assessments_v1` service-only interface. It is a useful foundation,
not a complete System-One contract.

| Required property | Current qik representation | Finding / required extension |
|---|---|---|
| Canonical decision contract | private assessment RPC and fixed append fields | version the full provider-neutral request/result schema explicitly |
| Decision ID | immutable assessment UUID and ordinal | retain |
| Semantic decision key | `input_fingerprint` over candidate, algorithm/version, context, parents and extras | extend with contract/operation/scope, temporal interpretation, evidence digest, policy and adapter versions, and visibility |
| Evidence-set digest | ordered context positions included in the fingerprint | expose a canonical digest over evidence revision IDs/hashes, not only positions |
| Subject/entity bindings | candidate ID plus article/graph watch keys | normalize multiple subject/entity IDs and binding roles |
| Temporal scope | indirect evidence timestamps only | add explicit as-of/valid/known temporal interpretation |
| Algorithm/policy/domain-adapter versioning | algorithm key/version | add policy and domain-adapter identities/versions |
| Provider/model/config metadata | absent | add nullable provider/model/prompt/schema/config/input metadata; never make provider identity authoritative |
| Immutable revisions | append-only assessment, predecessor and ancestry | retain; make supersession reason explicit |
| Reuse/cache semantics | exact fingerprint retry returns the historical result | require full-key equality, current dependency validity, and authorization-safe visibility before reuse |
| Invalidation/supersession | watch keys, evidence changes, predecessor and invalidation rows | extend cause taxonomy and add new-candidate/relevance discovery; dependency lookup alone is insufficient |
| Cross-user authorization safety | private/service-role only; release state fixed private | add explicit rights/visibility envelope and intersection checks before any cross-user reuse |
| Downstream deterministic disposition | outcome plus rationale/uncertainty; `publicly_eligible=false` | define typed downstream dispositions and deterministic mapping; keep publication separately gated |
| Provider-disabled behavior | no canonical field | return a typed degraded/unknown/abstained state; never fabricate a result or silently use a provider-specific cache |

Live evidence observed one qik assessment, no invalidations, and 195 evidence
changes. Outcomes are `supported`, `contested`, `insufficient_evidence`, and
`not_supported`. Historical read freshness is explicitly unimplemented. No
live provider-specific decision store was proven. Legacy model/audit fields and
qualified packages are inputs or history, not competing authority.

The prelaunch archive's Jev document is planning material only: activation and
purchase are not authorized, Jev is not required for this consolidation, and
the canonical contract must remain provider-neutral.

## Canonical absence-semantics taxonomy

No single canonical enum currently owns all absence meanings. The strongest
existing foundations are qik evidence/review state plus the Source Comparison
projection, but representations conflict across booleans, free text, UI-only
labels, review states, and assessment outcomes. The canonical extension should
use an explicit typed `absence_kind` (or equivalent immutable observation)
with scope, evidence/context IDs, method/version, coverage boundary, review
state, rights visibility, timestamps, and provenance.

| Meaning | Existing representation/evidence | Canonical disposition |
|---|---|---|
| Not reported in examined source | Source Comparison omission says “not present in extracted coverage,” scoped to the ingested sample | **EXTEND** with `not_reported_in_examined_source`; require source/capture and examined-boundary IDs |
| Not present in retained evidence | `missing_evidence` markers and reviewed “confirmed absent” copy | **RECONCILE** into `not_present_in_retained_evidence`; distinguish reviewed confirmation from an assertion pending review |
| Not extracted by current algorithm | `coverage_unknown`, empty extracted claims, and “not extracted” UI copy | **EXTEND** as `not_extracted`; attach extractor/version/run and do not infer source omission |
| Not searched / coverage incomplete | coverage-gap flags, partial job coverage, and remaining uncertainty | **NEW canonical value** `not_searched` or `coverage_incomplete`; store search scope/checkpoint |
| Unavailable from source | `source_unavailable` review state and unavailable UI load states | **RECONCILE** as `source_unavailable`; separate upstream unavailability from application/read failure |
| Rights/privacy blocked | spatial audience/visibility artifacts and UI withholding copy | **EXTEND** as `rights_or_privacy_blocked`; preserve the existence of a withheld item without leaking protected content |
| Rejected by review | review decisions and withdrawn/rejected-like states across domains | **RECONCILE** as `rejected_by_review`; attach immutable decision/reviewer authority and reason |
| Unknown / unresolved | assessment `insufficient_evidence`, uncertainty text, pending/unknown UI states | **RECONCILE** as `unknown_or_unresolved`; do not merge with not searched, unavailable, or negative evidence |

Compatibility rule: presentation code may map typed states to friendly copy,
but must not write a generic null/`missing` value back as if the distinctions
were equivalent. Existing `missing:` free text is legacy evidence requiring a
qualified mapper, not the future canonical representation.

## Canonical knowledge-change taxonomy

The current implementation records only parts of the required “why changed”
history. `source_change_events` is limited to `corrected`/`withdrawn`;
assessment invalidations identify a new evidence position or a superseding
assessment but do not type the semantic cause. Spatial policy/revision lineage
adds domain-specific history. These should feed one provider-neutral,
append-only change-cause contract on qik rather than be replaced.

| Required cause | Current evidence | Canonical disposition |
|---|---|---|
| New relevant evidence | evidence changes, watch keys and dependency jobs | **EXTEND** with explicit `new_relevant_evidence` cause and discovery receipt |
| Source correction/retraction/revision | `source_change_events` supports corrected/withdrawn | **EXTEND** to distinguish correction, retraction, and non-substantive revision |
| Source-lineage/dependency change | record versions, spatial lineage and dependency keys | **RECONCILE** under `source_lineage_changed` |
| Entity identity merge/split/remap | identity mapping is distributed/unfinished | **NEW canonical causes** with old/new entity IDs and mapping authority |
| Relationship reassessment | review/relationship state is domain-specific | **RECONCILE** under `relationship_reassessed` with predecessor decision |
| Hypothesis/assessment revision | assessment predecessor/supersession | **EXTEND** with typed `assessment_revised` reason |
| Temporal reinterpretation | temporal evidence/policy artifacts exist, general cause absent | **NEW canonical cause** with prior/new temporal scope and policy |
| Algorithm/policy change | algorithm version and spatial policy artifacts exist | **EXTEND** with distinct `algorithm_changed` and `policy_changed` causes |
| Domain-adapter change | not canonical | **NEW canonical cause** with adapter identity/version |
| Provider/model/method change | method/model fields are scattered; absent from assessments | **NEW canonical cause** with provider/model/config/method versions and non-authoritative semantics |
| Authorization/rights visibility change | spatial audience scopes and release state exist | **RECONCILE** under `visibility_changed`, with policy/actor and no protected payload leakage |
| Authorized human review/override | review decisions and source-change actor exist | **RECONCILE** under `human_review_or_override`, with authority, reason and immutable audit |

Every change event should identify the prior state/revision, new state/revision,
typed cause, triggering artifacts, actor or system identity, applicable policy
and method versions, authorization envelope, and time. A new revision must not
overwrite the earlier explanation. Dependency invalidation and new candidate
discovery are separate duties; both are required when knowledge may have
changed.

## Authority and implementation gate

- Canonical destination: qik private evidence/decision foundation.
- Current authority state: incomplete and distributed; **AUTHORITY
  CONSOLIDATED fails**.
- Provider activation: disabled/not required; no Jev or other purchase.
- Safe next implementation: prepare additive schema and contract tests on the
  isolated branch only.
- Live application, migration, scheduler activation, provider credentials, or
  publication changes require owner review under the Phase 1 gate.
