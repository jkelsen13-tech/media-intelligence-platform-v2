# Agency and identity — bounded qualification Slice 2

Parent: `7cde1087fb5089a74c6329e05d447bb2127d2750`. Additive disposable PostgreSQL 17 fixture after Slice 1. This is not a migration and is not connected to the application, Supabase, production source authority, authentication, or publication.

## Meaning

An immutable mention remains an exact physical source occurrence. The new registry gives an existing scoped synthetic actor stub immutable, explicitly reviewed revisions with their own label, kind, evidence, reason, principal and timestamp. Labels are nonunique. Registering an actor revision is not an identity decision.

Merge, split and supersession are immutable reviewed lineage interpretations between exact actor revisions. The anchor's append-only history has exact predecessors; a withdrawn successor can withdraw a prior interpretation. No alias is rewritten and no transitive identity resolution occurs. The current-lineage reader requires the exact current lineage and actor revisions. Actor identities on the two sides must all differ. Actor creation beyond the existing scoped synthetic stub admission remains unqualified.

Agency assertions are a separate append-only stream per action mention and role, with an exact participant mention. Roles are speaker, addressee, agent, principal, beneficiary and affected_actor. Direct action and attributed action are distinct values. Neither value proves the action occurred. Separate assertions can share an action mention without collapsing its speaker into its agent.

Unresolved and rejected assertions have no selected identity choices. Proposed interpretations may retain up to eight distinct candidate revisions. Accepted agency interpretations require one exact accepted identity decision, its exact candidate revision and current candidate-set ceiling, and the exact current actor revision. All identity candidates must belong to the participant mention and match the actor revision's scoped actor. Changes to candidate, candidate set, decision or actor head invalidate a current agency read. A new assertion explicitly advances its own stream.

Each choice has identity_confidence. role_confidence, evidence_quality, evidence_relevance and assessment_confidence are independent finite unit-interval scores. No averaging, threshold promotion or inferred calibration is provided. Review status is not a documented-fact flag. Every response explicitly has documented_fact=false, publication_allowed=false, production_qualified=false, source_authority_qualified=false and transport_qualified=false.

## Evidence, access and concurrency

Actor revision and role evidence are exact immutable mention IDs, whose source/field revisions and byte/span hashes remain bound by unchanged Slice 1. Identity support and conflict context, actor evidence, participant and action mentions, and agency evidence are revalidated together using Slice 1's grouped byte-budget validator. Authorization and field access are checked again on every read; an old cursor is not a capability.

The owner remains NOLOGIN/NOBYPASSRLS with forced scoped RLS. Callers get only named gateway functions; internal helpers and tables are private. Principal and timestamp are server-authored. Immutable triggers prohibit UPDATE, DELETE and TRUNCATE on new history tables. Mutations reject duplicate/stale versions rather than silently replaying or rewriting them.

Lock order within a single API call is inherited policy SHARE, membership SHARE, sorted scoped actor advisory locks, sorted Slice 1 mention advisory locks where needed, then grouped mention/field SHARE locks. New actor locks use an actor namespace; no new global exclusive lock or corpus scan is added. Slice 1's existing administrative policy lock remains unchanged. Composition of multiple arbitrary operations in one transaction, principal authorization in a real pool/JWT transport, and production revocation are not qualified by this fixture.

## Bounded retrieval and scale limits

Actor history uses (scope, actor_id, version) keysets, with at most three returned revisions plus lookahead and cursor anchor. Agency history returns one assertion, one lookahead and an optional exact cursor anchor. Cursors bind scope, stream, policy version and exact historical ID. Historical responses say historical_only=true and do not claim current acceptance; stale historical identity choices remain retrievable only with current evidence authorization. Rows are never skipped past revoked evidence, and no total count, global high-water mark or ordinal is emitted.

Current actor, lineage and agency heads use scope-leading B-tree indexes. Candidate heads and candidate-set ceiling reuse Slice 1's mention-leading indexes. No recursive alias traversal or fuzzy/full-corpus query is introduced.

Hard admission caps: eight identity choices; sixteen evidence references per actor revision/assertion/lineage; eight revisions on each lineage side; sixteen actors locked per operation; inherited whole-operation context/field/byte limits (normally 64 references, 32 fields, 1 MiB per field, 2 MiB aggregate). Historical lookahead and anchor consume the same budget. An otherwise valid large page fails closed rather than truncating evidence. Registry and agency head lookups have credible bounded index access at millions of records, but actual million/ten-million load tests, EXPLAIN plans, partitioning, durable quotas and operational throughput are still unqualified.

Lineage has a current exact reader and append-only retained events; a paged lineage-history endpoint is not included in this bounded slice. Multi-actor equivalence closure and automatic actor reassignments are deliberately not implemented.

## Verification

Seven JavaScript contract groups exercise actor shape, all roles/action modes, unresolved/multiple candidates, accepted decision requirements, five independent confidence dimensions and malformed/capped requests. At authoring these groups passed using the in-memory transformed module and assertion harness. The native harness's transformed JavaScript syntax parsed.

The new PR-only workflow isolates PostgreSQL in its own job, avoiding Slice 1's cluster-wide role names. It loads unchanged 001 then additive 002 and runs native cases for scope/RLS/privacy, immutable history, current-head invalidation, competing revisions, separate roles, exact lineage, keyset history, candidate-set/decision invalidation and source/membership revocation. The held-transaction harness observes a real PostgreSQL Lock wait before releasing its first transaction.

SQL and native tests have NOT executed at detached authoring. Hosted workflow results and independent SQL review are required before claiming native qualification. Neither a PR ref nor main is moved by detached authoring; no deployment, local project file or live database is changed.

Reference: PostgreSQL 17 explicit locking documentation, https://www.postgresql.org/docs/17/explicit-locking.html.

## Independent-review corrections

The initial detached Slice 2 was not natively qualified. Review found two late function bodies with invalid lone-dollar delimiters; these now use matching tagged dollar quotes. The native harness explicitly enables check_function_bodies, submits the entire fixture through psql with ON_ERROR_STOP, and verifies both late functions were installed before running cases. Delimiter inspection is not represented as PostgreSQL execution.

A withdrawn lineage event now requires an existing non-withdrawn exact predecessor and identical ordered from/to revision arrays. Version-one, missing-target, unrelated-side and repeated-withdrawal requests fail. The predecessor ID is the withdrawal target, and the stored prior interpretation remains immutable.

Actor labels are capped at 256 raw stored characters. Actor, lineage and agency reasons are capped at 4096 raw stored characters, independently of the nonblank trimmed check. Native cases include leading/trailing oversized whitespace padding and exact-boundary success with rollback; JS adversaries cover the corresponding actor/agency validators, which already apply raw string-length limits.

At corrected detached authoring, seven transformed JavaScript contract groups passed in memory and the native harness parsed as transformed JavaScript. SQL/native execution is still unexecuted: no disposable PostgreSQL runtime or workflow run was invoked by this remote-only authoring task. The PR-only native workflow remains the execution path. All previous qualification and authority limits remain.
