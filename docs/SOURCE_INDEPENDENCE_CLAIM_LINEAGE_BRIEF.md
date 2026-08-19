# Source Independence and Claim-Lineage Implementation Brief

**Status:** Read-only design brief; no schema, production data, connector, or deployment changes are authorized by this document.

**Scope:** Define a future implementation for tracking whether sources independently support a claim, while preserving the existing six-axis uncertainty model and the current honest UI state: **“Unverified — source lineage not yet tracked.”**

## 1. Design boundary

Source independence is a provenance property, not a confidence score. It must never be inferred from outlet reputation, review status, article count, edge weight, or the presence of multiple URLs. The implementation must preserve the locked precedence rules: each axis remains independently stored; presentation follows the weakest-link rule; review status licenses labels only; remaining uncertainty is never suppressed; and legacy composite percentages or numeric reliability displays are not reintroduced.

The first release should support **claim-level lineage** for current assertions and relationship explanations. It should not automatically decide that two sources are independent. Automated stages may discover candidate overlap and assign a machine-detected relationship, but a human review boundary must control any user-facing “independent” designation.

## 2. Lineage categories

| Category | Meaning | User-facing eligibility |
|---|---|---|
| `independent` | Sources support the same claim through materially distinct reporting or primary evidence paths, with no unresolved shared-origin dependency. | May be displayed only after human review and required evidence fields are present. |
| `shared_origin` | Sources appear to derive from the same wire, release, interview, filing, dataset, or other upstream origin. | Display as corroboration with shared origin; never count as independent. |
| `syndicated` | One source republishes or substantially reproduces another source’s report. | Display as a derivative source; never count as independent. |
| `引用_or_translation` | A source quotes, translates, summarizes, or republishes a material portion of another source. | Display as derivative unless a reviewer explicitly resolves the relationship. |
| `unknown` | Lineage has not been assessed or available evidence is insufficient. | Preserve the current unverified state. |
| `disputed` | Reviewers disagree about the lineage classification or supporting evidence. | Display the disagreement and block an independent claim. |

The implementation should use an ASCII identifier such as `quoted_or_translation` rather than a multilingual database enum. The label can remain plain-language in the UI.

## 3. Proposed data model

The model should be introduced only through a separately authorized migration. It should avoid copying lineage fields into every claim row and should preserve historical review decisions.

### 3.1 `claim_lineage_groups`

Represents a reviewed grouping of source assertions about one claim or claim cluster.

| Field | Purpose |
|---|---|
| `id` | UUID primary key. |
| `claim_key` | Stable application-level identifier for the normalized claim; not a free-form display title. |
| `status` | `unreviewed`, `in_review`, `reviewed`, or `disputed`. |
| `independence_level` | `unknown`, `candidate`, `independent`, `shared_origin`, `syndicated`, `quoted_or_translation`, or `disputed`. |
| `reviewed_at` | Timestamp only when a reviewer accepts or disputes the current assessment. |
| `reviewed_by` | Reviewer identity if the authorized review model supports it; nullable until that decision is made. |
| `review_note` | Human-readable rationale and unresolved questions. |
| `version` | Monotonic version for optimistic concurrency and rollback. |
| `created_at`, `updated_at` | Audit timestamps. |

### 3.2 `claim_lineage_members`

Associates a claim or explanation with its source record and preserves the role of that source.

| Field | Purpose |
|---|---|
| `id` | UUID primary key. |
| `lineage_group_id` | Foreign key to `claim_lineage_groups`. |
| `assertion_id` | Foreign key to the current assertion or explanation where available. |
| `source_id` | Foreign key to the canonical article/source record. |
| `source_role` | `primary`, `reporting`, `quoted`, `translated`, `syndicated`, or `context`. |
| `evidence_ref` | Structured pointer to the passage, filing section, transcript, or artifact used in review. |
| `current` | Whether the membership belongs to the current claim version. |
| `created_at`, `retired_at` | Membership lifecycle timestamps. |

### 3.3 `claim_lineage_relations`

Stores pairwise or directed relationships that explain why sources are not independent.

| Field | Purpose |
|---|---|
| `id` | UUID primary key. |
| `lineage_group_id` | Parent group. |
| `from_source_id`, `to_source_id` | Directed source relationship. |
| `relation_type` | `quotes`, `translates`, `syndicates`, `cites`, `shares_release`, `shares_wire`, `shares_interview`, or `unknown_dependency`. |
| `detection_method` | `manual`, `metadata_match`, `text_overlap`, `publisher_metadata`, or `external_registry`. |
| `detection_score` | Optional machine score for triage only; never a user-facing confidence percentage. |
| `review_state` | `candidate`, `accepted`, `rejected`, or `disputed`. |
| `evidence_ref` | Pointer to the supporting comparison or metadata. |
| `created_at`, `reviewed_at` | Audit timestamps. |

### 3.4 `claim_lineage_events`

Append-only history for creation, review, dispute, correction, retirement, and rollback. Each event records the prior and next version, actor or mechanism, reason, and affected identifiers. No accepted lineage decision should be overwritten without an event.

## 4. Detection and persistence stages

The pipeline should be staged so that automated detection cannot silently mutate a presentation-eligible claim.

| Stage | Operation | Write boundary |
|---:|---|---|
| 1 | Normalize claim identity and collect current source memberships. | Read source and assertion tables; write only a candidate job record if jobs are authorized. |
| 2 | Gather explicit metadata: quoted URLs, “according to” phrases, wire/byline markers, publication timestamps, feed identifiers, and document citations. | Write candidate relation rows with `review_state='candidate'`. |
| 3 | Run similarity and dependency heuristics over bounded passages. | Write scores and evidence references only; do not assign `independent`. |
| 4 | Present a review queue containing candidates, source roles, evidence passages, and missing fields. | Read-only UI or review table; no publication transition. |
| 5 | Human reviewer accepts, rejects, or disputes each relation and the group-level classification. | Append an event and create a new group version; require reviewer identity if available. |
| 6 | Recompute the read-path view. | Read-only derived query or view; exclude `unknown`, `candidate`, and `disputed` from independent claims. |
| 7 | Propagate corrections or withdrawals. | Reuse the existing source-change audit boundary; mark affected lineage groups for renewed review and remove independent presentation until resolved. |

A source with high outlet reliability may still be weakly evidenced or dependent on another source. The read path must therefore expose lineage as a separate axis and must never elevate the evidence or authentication axes.

## 5. Read and write boundaries

The current application read path should continue returning the honest fallback until a future migration and review policy are authorized. The existing relationship provenance seam can later accept a lineage view with explicit states such as `verified_independent`, `dependent`, `unverified`, and `disputed`; it must not fabricate a verified value when the lineage tables are absent or incomplete.

The write path should be limited to ingestion of candidate observations, reviewer decisions, and append-only lineage events. Automated ingestion may create candidates and evidence pointers, but it must not publish an assertion, change its factual text, or set a group to `independent`. A reviewer decision must not rewrite prior explanation versions. If a source is corrected or withdrawn, the existing D5 behavior should mark linked current assertions for renewed review and retain the lineage history.

## 6. Presentation contract

The UI should use plain language and preserve the distinction between relationship evidence and node evidence. Recommended states are:

- **Source independence: Verified — distinct evidence paths**
- **Source dependence: Shared origin identified**
- **Source dependence: Derivative or quoted reporting**
- **Source lineage: Disputed — review required**
- **Source independence: Unverified — source lineage not yet tracked**

The words “independent sources” must not appear solely because a claim has multiple source rows. Counts should be labelled as **sources reviewed**, **source records**, or **candidate sources** according to the actual state. No composite confidence percentage, average reliability number, or implication of guilt or innocence may be introduced.

## 7. Rollback and correction

Every accepted or rejected review must create an append-only event containing the prior classification, next classification, actor or mechanism, timestamp, rationale, and evidence references. A rollback is a new event that restores a prior version; it is not an in-place delete. If a source correction, withdrawal, or lineage dispute affects a current claim, the system should:

1. mark the lineage group `in_review` or `disputed`;
2. remove any independent presentation from the read path;
3. mark linked current assertions for renewed human review through the existing source-change machinery;
4. retain all prior explanation and lineage versions; and
5. require a fresh human decision before the claim can again be presented as independently supported.

## 8. Acceptance fixtures

The first implementation should ship with temporary, isolated fixtures and zero-count cleanup proofs.

| Fixture | Expected result |
|---|---|
| Two unrelated primary documents supporting the same normalized claim | Candidate first; after review, `independent`; read path may show verified distinct evidence paths. |
| Two outlets carrying the same wire copy | Candidate relation becomes `shared_origin` or `syndicated`; independent presentation remains blocked. |
| Article quoting another article | Directed `quotes` relation; source role is `quoted` or `derivative`; no independent designation. |
| Translation of a source report | `translates` relation; lineage remains dependent unless a reviewer separately establishes a distinct primary path. |
| One reliable outlet with weak or unattributed evidence | Reliability remains separate; lineage may be unknown; presentation follows the weakest-link rule. |
| Conflicting reviewer decisions | Group becomes `disputed`; independent presentation is blocked and disagreement is visible. |
| Corrected source with linked current assertion | Existing D5 propagation marks the assertion for renewed review, retains prior versions, and records a source-change audit link. |
| Unrelated assertion sharing no changed source | No mutation; negative control remains unchanged. |
| Missing lineage tables or unavailable evidence | Read path returns the current unverified state rather than failing open. |

Each fixture must be created in the isolated sandbox only, tested through both candidate and reviewed states, and deleted afterward with explicit zero-count verification. No production schema or data change is implied by this brief.

## 9. Authorization gate for implementation

Implementation requires a new owner-authorized run covering the migration, reviewer identity model, candidate detection budget, read-path enablement, and fixture cleanup. Until that authorization exists, the repository should retain the current honest wording and make no schema, cron, ingestion, production Supabase, Google Cloud, or public-release changes.
