
# Native C9 private scoring successor

Source-only successor to the pinned recovered arc scorer
`08ce23092cfbbe8dcb7eb7c26cf6e3943e177531`. Nothing in this directory installs
itself, retrieves material, attaches an article, approves publication, enables a
release policy, or claims production qualification.

The supported unit is one reviewed candidate and its complete arc membership,
up to 31 members plus the candidate. Historical public members without original
native captures are unsupported: they must not be fabricated as native. The
existing historical retained adapter and its RLS refusals are unchanged.

## Dependencies and installation

Install the actual native reliability migration
`supabase/migrations/20260905082406_evidence_pipeline_reliability.sql`
(blob `e7beb22b9a4dd2e38076b5554c7f5b4e6e0e4e77`), existing selected cutover
collector/publication contracts (004 and 006 with their original dependency
closure), then entity-resolution/001_mentions.sql, native-capture-fields/003_native_fields.sql,
candidate-review/004_candidate_review.sql, qik-source/001_storage.sql,
canonical-admission/005_canonical_admission.sql, qik-source/002_governed_writer.sql,
and finally native/001_governed_cohort.sql then native/002_private_score_review.sql. The new canonical 005 must include the private complete-cohort
prelock and its capture/field/span byte receipt. The installer is a separately
qualified protected database principal; source creation is not installation.

Preserve qik UUID primary keys, ordinary RLS-enabled source tables, and DATE
story_arcs.started_at. Existing source/public/native change recorders remain
unchanged. New arc/candidate statement fences reuse the existing collector lock.
Their append-only `native_arc_source_revision_v1` journal hashes only the
explicitly selected arc/candidate projection, including operation, identity,
transaction and monotone local sequence. It is not a historical full-row hash
and contains no source fields. Public article membership already participates
in the collector fence. TRUNCATE of these new fenced source tables refuses.

Protected `mip_arc_native_owner` is NOLOGIN/NOINHERIT/NOBYPASSRLS and has no
memberships after installation. Narrow selected-column source grants and
explicit role-only RLS policies give the complete member view. Restrictive
applicable RLS or altered selected-column authority refuses current reads;
caller-filtered empty input never proves completeness. No gateway/worker gets
table or native payload access. Existing source ACLs are not revoked.

## Producer and consumer

Existing scoped reviewers with current `can_decide` review:
1. exact original scalar capture/job/article/content and field bindings;
2. explicit completed extraction (including reviewed zero), or unavailable
   for `not_performed` / `method_does_not_provide_entities`;
3. versioned weight selection and operation budgets;
4. exact candidate microsecond revision and complete sorted member IDs.

Extraction reviews bind the entire C6 article admission-head digest, including
revoked heads. Any added/replaced/revoked/stale head invalidates the review even
if reduced entity IDs or weights happen to be equal. Every entity group must
already have a current C6 governed projection. Physical article_entities rows
are not authority; the exact governed reader validates each projection.

Scalar fields are title, summary, outlet and published_at. A binding distinguishes
JSON string, JSON null and missing using SHA256 of PostgreSQL17 JSONB text
`{"present": boolean, "value": scalar-or-null}`. It stores references and hashes
only. Every read checks current scope authority and explicit scalar access, then
the originally admitted capture/hash/job. There is no latest capture substitution.
Native text is transient in the protected resolver and scorer input only.

The C9 selection policy defines an explicitly reviewed uncalibrated evidence
weight cutoff. It is not probability, legacy confidence, accepted-state Boolean,
rank, or the old resolver's default. Policy also supplies, without defaults,
max_members <=31, max_fields <=128, max_total_bytes <=8MiB, and
max_hash_work_bytes <=128MiB. C6 continues to enforce its own existing policy.
C9 conservatively charges C6 capture/field/span input plus original scalar
captures/fields and the expanded input. Duplicate charges are permitted.
Cumulative hash work is separately bounded using complete C6 upper bounds,
four scalar capture hash visits per article, canonical identity and bounded
metadata/expanded hashing. This is a work bound, not memory, cost or billing.
All four scalar fields currently expand for every member; this is correct but
conservative. Larger cohorts require their actual profile to fit these bounds.
Overflow refuses the whole operation; there is no pagination/truncation escape.

`snapshot` records one generation manifest and two distinct digests.
`read_scoring_input` resolves its original references and rechecks current source,
cohort, policy and access. It returns transient exact PostgreSQL17 JSONB text
and SHA256 of its UTF8 bytes. Node never substitutes JSON.stringify canonicalization.
The retained manifest hash has a different domain and excludes native text.
The manifest deliberately retains arc id/title/summary/started_at/last_update_at
because mutable public arcs have no exact historical resolver; those fields are
the concrete scorer canonical-text/date context and drift/replay evidence.
All other retained input context is IDs, scalar bindings, exact extraction/group
references, policy/cutoff/budgets, candidate revision, scorer/runtime/audit constants.

Run `runGovernedNativeArc` with a protected worker connection and exact scope,
generation and expected expanded hash. It owns a read-committed transaction,
calls the current reader, computes only with unchanged recovered scorer,
validates exact nested output allowlists, and appends a private score and audit.
Node22.14.0 is required; one-generation audit population is exactly one, high
sample size one, low cutoff .70. Audit seed derives from generation/model/policy.
This preserves the recovered seeded comparator; it does not rewrite audit logic.

The SQL score writer validates identities, numeric ranges, hard-rejection enums,
nested keysets, closed release gate and exact one-generation audit stratum.
The protected scorer worker is trusted to execute the pinned code; schema
validation is not a SQL reimplementation or proof of arithmetic execution.
An identical exact retry returns the same digest; conflicting retry or current
input drift refuses. Stored outputs contain typed IDs, static enums, numbers
and Booleans only. No expanded input, source text, diagnostic, free-text seed or
driver error enters score/audit/review receipts.

`review_score` binds current input and output hashes, exact generation and
version/predecessor under current reviewer membership. Accepted state is
`accepted_private`, not public approval. `read_current_score` revalidates the
whole source chain and exact current review head. Every result retains
approval_allowed=false, publication_allowed=false and attached=false.

Recorded private scores remain immutable historical evidence if current access
or source changes. Reproducible recorded computation does not imply current
eligibility: the accepted reader refuses drift/revocation. No reader uses an old
score to bypass current review or publication checks.

## Qualification and remaining boundary

Parent owns actual isolated qualification and fresh external review. Source
authorship alone is not a passed test. Node invocation:
`node --test tests/nativeArcScoring.test.mjs`.
Actual PG17.6 invocation and environment are in
`tests/nativeArcCohortPostgres17.test.mjs`; use only its guarded disposable
database, real declared dependencies and cleanup, never a hosted URL.

No automatic/manual public attachment is implemented here. Remaining integration
is the qik guarded attachment writer tied to this exact current generation,
current publication predicates and the actual atomic attachment dependencies.
Historical `20260813_atomic_arc_attach.sql` alone does not supply those gates.
The legacy approval function's weak ACL and release policy are not copied.
Private actual-material connection, protected worker/reviewer provisioning,
operational capacity and source admission remain unqualified.

The actual test installs the full selected atomic backend through
prepareAtomicInstall/installComparisonAtomic and qualifies the real loopback
audit connection before C6/C9 installation. It requires a pristine dedicated
PostgreSQL17.6 cluster with official pgvector0.8.2 available, pgcrypto/dblink,
SCRAM loopback authentication and the fixed synthetic fixture password.
Set MIP_NATIVE_ARC_COHORT_DISPOSABLE=synthetic-pg17-only and run
`node --test tests/nativeArcCohortPostgres17.test.mjs`.
Its complete catalog guard precedes setup and destructive cleanup; it restores
the dedicated postgres database and removes only names proven newly created
and explicitly allowed. It does not clean an existing application database.

The conservative C6 hash charge uses H*(1+N+4*A) for original captures and
(B+L)*(1+N+4*A) for fields/spans after the final grouped context prelock contract.
The implementation deliberately substitutes A=64, the enforced upper bound,
and adds bounded identity/metadata/expanded-input work. These are upper bounds,
not measured runtime counts. Hash-budget refusal is independent of retention
and transient-memory refusal.

Reviewed cohorts also bind a bounded complete set of existing native collector
delta metadata (<=256 relevant records, <=256KiB): capture records for every
cohort article and candidate records for the original captures. Only IDs,
identity/hash/operation metadata are read, never historical row images. The
cohort stores the revision digest; generation manifests retain the exact change
IDs and digest. A newly recorded relevant capture/candidate/supersession changes
the current digest and refuses, even though the original immutable bytes remain
resolvable. Explicit cohort revocation independently invalidates the reader.
Existing comparison generations and their publication review APIs are not
repurposed or claimed as native arc generations.

The hash ceiling reserves two expansions for the actual Node read+completion
transaction. Arbitrary caller loops are not represented as one invocation's
work estimate. Snapshot/review calls are conservatively charged the same bound.

## Exact retained and output allowlists

There are ten new durable tables. The schema is private; none is a browser API.

| Table | Columns |
|---|---|
| scalar_bindings | scope, id, article, capture, job, content_hash, field, value_kind, field_hash, principal |
| scalar_access | scope, binding, allowed |
| extraction_reviews | scope, id, article, capture, content_hash, version, predecessor, state, reason, article_set_digest, principal |
| selection_policies | scope, id, version, predecessor, cutoff, active, max_members, max_fields, max_total_bytes, max_hash_work_bytes, principal |
| cohorts | scope, id, candidate, candidate_revision, article, arc, members, bindings, extraction_reviews, policy, native_revision_digest, principal |
| cohort_revocations | scope, cohort, id, principal |
| generations | scope, id, cohort, manifest, manifest_hash, expanded_hash |
| source_revisions | sequence, source_contract, relation_name, operation, before_id, after_id, before_projection_hash, after_projection_hash, transaction_id |
| private_scores | scope, generation, output, output_hash, principal |
| private_reviews | scope, id, generation, output_hash, version, predecessor, state, reason, principal |

Manifest keys: version, cohort, candidate, candidate_revision, candidate_state,
arc_source_revision, candidate_source_revision, article, arc,
native_revision_digest, native_change_ids, members, scalar_binding_ids,
extraction_review_ids, group_refs, selection_policy, cutoff, max_members,
max_fields, max_total_bytes, max_hash_work_bytes, runtime, scorer_blob,
audit_low_confidence, audit_high_sample_size.
Nested arc keys: id, title, summary, started_at, last_update_at.
Nested group_refs keys: article_id, entity_id, projection_id, set_digest.
Other arrays contain typed UUIDs only.

Expanded input keys (transient): version, codec, runtime, scorer_blob,
scorer_version, generation_id, candidate_id, candidate_revision, candidate, arc,
members, entity_states, selection, audit. Candidate/member keys:
id, title, summary, outlet, published_at. Entity-state keys:
article_id, state, reason, attestation_id, article_set_digest, entities.
Entity keys: entity_id, evidence_weight, projection_id.
Selection keys: policy_id, domain, cutoff.
Audit input keys: low_confidence, high_sample_size, seed.

Private score output keys: contract, generation_id, candidate_id, input_hash,
manifest_hash, runtime, scorer_blob, score, audit, approval_allowed,
publication_allowed, attached. Nested score keys: model_version,
candidate_article_id, arc_id, cluster_confidence, decision,
eligible_for_auto_approval, hard_rejections, signals, evidence, release_gate.
Signals keys: entity, canonical, recent, action, continuity, temporal,
source_diversity. Evidence keys: shared_entity_count, candidate_entity_count,
arc_entity_count, temporal_gap_days, explicit_continuity, recent_member_count.
Release gate keys: fixture_passed, auto_approval_enabled, auto_approval_threshold;
values are false, false, null. Audit item keys: candidate_id, stratum; enum
low_confidence_all or high_confidence_random.

Snapshot receipt: generation_id, input_hash, manifest_hash, publication_allowed,
attached. Scorer input wire: input_text, input_hash, manifest_hash.
Completion receipt: generation_id, output_hash, state, approval_allowed,
publication_allowed, attached. Manual-review receipt: generation_id, review_id,
output_hash, state, approval_allowed, publication_allowed, attached.
Current score result: generation_id, input_hash, output_hash, output, review,
approval_allowed, publication_allowed, attached. Nested review is null or exactly
review_id, version, state, reason. Review scalar/policy/extraction/cohort and
revoke-cohort return only their UUID; scalar access returns void.
Private helper/context outputs are not gateway grants. The context helper
returns version, max_fields, max_context, max_total_bytes; the scalar helper
returns present, value transiently.

INSERT source revisions have null before identity/hash; DELETE has null after;
UPDATE has both. Sequence ordering is local monotone insertion order, not a
wall-clock timestamp or cross-system order. Generation manifest retains the
latest selected arc/candidate revision sequence and native delta IDs/digest.
Source journal data is never overwritten to rescue a stale generation.

Dependency pins from base 2af5109fd85b4d223a40d40b0543e79568575557:
- atomicInstall.mjs: 0cfaf06969881b8c4983c752d893b9f08a84ae3e;
  compileSource.mjs: cd87eb0a0bc758315246e74675339f3ea2972a19;
  catalogPreflight.mjs: a591c92b10d174bd2937e9634f8d491b4c34567b.
- qik-ingest fixture_substrate.sql: 2127adb8743d50cd318fba63b6547cdfedacf039;
  installQikIngest.mjs / LOAD_ORDER: fa5d24041b38592ec950e2e46ca28be11f30d997.
- entity-resolution/001_mentions.sql: 3f86cfdfe0503ca5b4277afcf601c6a716531ca9;
  native-capture-fields/003_native_fields.sql: ffc192276276cea2345690bccc7b65d54a0f0ab6;
  candidate-review/004_candidate_review.sql: e25930fb4552b7b0086d7d1c50414845df453dbc.
- arc-membership-qik-source/001_storage.sql: fc321af39e982e0cb1f06238c81f99d2dcc6fe8a.
- Coordinated new canonical-admission/005: 6ea5d5f3bcaa24a1772387c276c0e5642dcd180b;
  qik-source/002_governed_writer.sql: 7cac6a7cb8ab665886944bf5092edcf01a60cf3f.
The existing atomic compiler verifies its complete selected 001–019 plus
DOJ020 source order/pins and synthetic empty-scope transform. The test does not
extract fence fragments or seed historical material. It creates a temporary
synthetic installer, removes its SUPERUSER before the actual atomic install,
uses the real protected roles and authenticated loopback audit, then executes
the C6/C9 qualification installers with the synthetic substrate administrator.
This does not qualify a live installer principal or change operational rights.

Current native capture eligibility inherits the selected source contract:
ORDER BY captured_at DESC, id DESC LIMIT 1 for the complete authorized article
capture set. New review, preparation, exact retry and current reader refuse if
the named original capture is no longer selected. No newest bytes are returned
under an old capture identity. The protected owner reads captured_at metadata
with explicit complete RLS authority; an inaccessible/excluded newer record is
not silently skipped. Historical original references and private scores survive.

The runner preserves independent static primary-stage, rollback and close failures.
Multiple failures produce AggregateError containing only those bounded codes.
A missing COMMIT acknowledgement is commit_outcome_unknown; no success is inferred.
Retry uses the same exact generation/hash and revalidates current authority.
The adapter rejects audit settings other than exactly .70 and 1.
