# Immutable mentions and reviewed attribution — replacement Slice 1

Exact base: 3244b26ce0f4972b3272df949c169c25d82f4cbb.
The earlier detached 6b78f982 is rejected, not composition-qualified. Its direct
actor participant references, duplicate physical occurrences, stale candidate
acceptance, unlocked policy lookup, promise-only race test and global sequence
cursor are preserved as contrary review evidence, not silently declared sound.

The second detached a09999b95dda15bd2152e190e131015704163b53 also failed review:
candidate-page context could outlive supporting/conflicting source access;
current annotation reads did not serialize with writers; annotation authorship
and time were not recorded. This replacement preserves that contrary evidence.

The third detached d086763d0a001059e1523588db9a98826cbbbdbd failed review:
all-row pagination high-water leaked inaccessible off-page counts; page-derived
resource bounds allowed excessive aggregate decoding; put_mention acquired field
locks before referenced mention locks. This replacement removes those contracts
rather than describing them as qualified.

The fourth detached 67295efe2e053dec84174e99f4dbe19b56be54a7 failed review:
access-row locking and later counting used different snapshots, new literal bytes
were omitted from admission, raw admin DML could invert locks, and mention creation
decoded the field again. This replacement is not a declaration that prior
candidates were sound.

## Source records and interpretation are separate

A physical occurrence has exactly one immutable identity per scope, canonical
field ID, explicit offset unit, start and end. A second ID at the same coordinate
fails the unique index, including concurrent insertion. Different occurrences of
the same literal receive distinct IDs. Wrong source/field version, hash, literal,
UTF-8, offset unit, Unicode normalization or bounds fail closed. No similar,
summary, embedding, latest-version or normalized-literal fallback is allowed.

Speaker/addressee in a mention are only null, unresolved, or same-scope mention
locators. Both SQL schema and API reject direct actor references. Locators are
retained extraction/coreference interpretations, not proof of an actor. Corrections
append participant_annotations with their own predecessor/version and reason.
read_mention keeps the original record and a separately named current annotation;
it never edits source text or presents corrected interpretation as original text.
Annotations record session_user and clock_timestamp() inside the server operation.
Neither is accepted from caller input. Exact retry includes the original principal
and preserves the original database timestamp. Current reads take the same mention
advisory lock as annotation writers before selecting the successor.

Actor identities exist only as scoped synthetic stubs with nonunique labels.
Candidates link a mention to multiple possible actors, with rank, method, separate
supporting/conflicting exact mention references, and per-actor version history.
Candidates do not attach an actor or assert identity. Direct actor attributes are
not smuggled into mention or annotation payloads.

An explicit reviewer appends unresolved/rejected/accepted decisions separately.
Acceptance requires the current candidate head for that actor while holding the
per-mention lock. Each decision captures the candidate-set ceiling. resolved_actor
requires the exact current accepted decision ID, current candidate head, unchanged
candidate-set ceiling and current source access for supporting AND conflicting
context. New candidate context makes projection stale until another explicit
review. Its result is labelled reviewed_interpretation, not source fact.
Mechanical exact-byte checks do not establish semantic correctness of a reviewer.

## Locking and current authorization

Every operation first locks the singleton policy_head row FOR SHARE and captures
one immutable policy version. activate_policy takes that same row FOR UPDATE.
No operation rereads a floating active policy midway through its work.

Fixed order: policy head SHARE, membership SHARE, then per-mention advisory lock
where mutation/current-attribution requires it, then all relevant field_access
rows SHARE in UUID order. Immutable referenced mention rows are first SHARE-locked
in global UUID order; field-access rows then use global field UUID order. Relevant source sets are collected before source
locking. Policy/source/membership changes wait for already-admitted transactions
to commit or roll back. Calls admitted afterward apply the new policy/access.
No caller-set GUC/user UUID authorizes a request: the fixture uses session_user
and scoped membership. This is a DB-principal test model, not live JWT authority.

The synthetic administrative mutation contract is exclusively set_membership,
set_field_access and activate_policy, executable by the separate NOLOGIN admin
role. Each takes policy_head FOR UPDATE BEFORE any membership/access operation,
including absent-row grants and removals. Owner-seeded immutable policy versions,
source fields and actor stubs are fixture setup, not a runtime admission service.
Raw superuser/owner DML after setup is explicitly outside concurrency qualification;
it must not be substituted for these procedures in any integration. The tests use
a non-superuser admin login for held operational changes and reject its direct
table writes. This is a synthetic admin boundary, not production authorization.

Access authorization uses one MATERIALIZED ordered FOR SHARE row set and counts
only rows returned by that locked snapshot. A later newly inserted access row can
never satisfy an earlier operation's lock/count check.

All ten tables use FORCE RLS; evidence/actor/candidate/annotation/decision tables
also have scope-membership predicates for the session principal under the internal
owner. Gateway gets only explicit functions, no tables, private helper functions,
source admission, memberships or policy activation. Functions have empty
search_path. Source fields, actor stubs and policy versions are owner-seeded;
that owner remains an explicitly trusted, unqualified synthetic boundary.

## Bounded locator/history foundations

Candidates retain an internal per-(scope,mention) ordinal for indexed ordering,
never a global sequence. The ordinal is not returned by candidate writes or pages.
Pages use bounded keyset selection of at most n+1 rows and no all-row count/max/
ceiling. A continuation names only the last returned candidate UUID, bound to
scope, mention and policy version. Its source context must still authorize.
All selected rows, including lookahead and cursor row, must validate before any
envelope is returned; an unavailable row denies the operation without skipping or
scanning to find replacements. A row beyond the bounded lookahead cannot influence
the current page metadata. Pages are live keysets, not historical snapshots: later
appends can appear on subsequent pages. No total, high-water or frozen-set promise.

Candidate actor IDs are locator-only, identity_accepted=false hypotheses;
resolved_actor remains a separate reviewed projection. Ranks are not probabilities.
Decision candidate-set ceilings stay internal for stale-attribution denial and are
not emitted as counts or pagination metadata.

Independent immutable operation budgets bound context references, distinct fields
and aggregate source-plus-retained-span bytes before hashing/UTF8 decoding. Repeated
span validation therefore cannot multiply work beyond the byte budget. Fixture defaults: 20-row
pages, 64 context references, 32 distinct fields, 1 MiB per field, 2 MiB aggregate.
Hard safety ceilings: 50-row pages, 128 context references, 64 fields, 2 MiB per
field, 8 MiB aggregate. These are deliberately small qualification budgets, not
production sizing. Context multiplicities across the selected candidates and
cursor count conservatively against the independent context budget before expansion;
deduplication does not bypass that admission bound. Larger pages can fail budget
checks and require a smaller requested page, never silent truncation of evidence.

One shared validator performs policy→membership→operation advisory→mention UUID
SHARE locks→field-access UUID SHARE locks. put_mention passes its new field as
an extra field to that validator, not a prior separate field-lock operation.
Source sizes, retained-span sizes and proposed-new-literal octet length are
aggregated before any source hash/decode. Distinct fields are then checked in one
MATERIALIZED query and span validation joins that grouped result. New mention
creation receives that same validated text/version/hash envelope from the shared
validator; it does not requery or redecode its field. No per-mention source
query/hash loop or operation-wide duplicate field decode is required.

Scope-leading occurrence, field lookup, candidate-head/keyset, annotation-head and
decision-head indexes remain. No full-corpus fuzzy scan is introduced. Physical
partitioning, durable quotas/backpressure, streaming large-field admission,
paged decision/annotation history and 1M/10M load/EXPLAIN gates remain unqualified.

## Evidence reuse and qualification limits

The assessment-specific content-addressed-storage/exactCitation.mjs is referenced
as an existing exact retained parent/field/span invariant, not coerced into a
general mention authority. A later qualified bridge must admit these immutable
fields from real current-authorized capture. No adapter or storage code changes.

Every production_qualified, source_authority_qualified, transport_qualified and
publication_allowed flag remains false. No UI, actor alias/revision service,
search, threshold calibration, agency/causation vocabulary, hypothesis dependency
integration, live source authority, deployment or publication is enabled.

## Tests

Seven JS groups retain exact-source/Unicode/scope/reference/decision contract
adversaries, including a syntactically valid actor ID refused as a participant.
Native groups include sequential and held-transaction same-span clones; valid,
direct-actor and cross-scope speaker/addressee attempts; annotation correction, server-authored principal/time and different-principal retry denial;
held annotation successor/read and competing-successor serialization;
stale candidate rejection; current accepted actor projection; conflicting-source
revocation; separate support-only and conflict-only page revocation, sequential
and held in both read-before-revoke and revoke-before-read orders; candidate and decision successor serialization; policy shrink;
membership/source revocation; private internal ordinals and RLS/ACL/index catalog checks. New cases cover off-page
revocation invariance and authorized lookahead, independent context/field/byte
budget denial, grouped-validator structure, creation-versus-read serialization,
and both annotation writer-before-read and read-before-writer orderings. Additional
tests cover absent access-row grant/admission/removal races through the early admin
lock, mixed admin/user operation orderings, new-literal exact-budget/+1 denial,
malformed/extra-key/revoked-anchor cursors, and validated-text reuse structure.

The race harness keeps transaction A open after the operation has returned,
starts B with a distinct PostgreSQL application_name, and requires
pg_stat_activity.wait_event_type = Lock while B remains unfinished. Only then
does it commit A and verify B's post-wait outcome. It is not a pair of uncontrolled
promises or a sleep-based assumption of overlap.

The PR-only workflow checks out exact PR head and runs JS/native tests against
disposable PostgreSQL 17. No workflow is dispatched by detached authoring.
At authoring, only remote readback and transformed JS syntax/delimiter review
are verified; SQL/native execution and independent reconciliation are still
required. No local project files or live system changes were made.

Security/index guidance:
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/changelog
