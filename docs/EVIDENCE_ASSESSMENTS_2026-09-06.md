# Private assessments and evidence dependencies

Repository base: `320b3e09f926a165e9b41799be8645fac5073325` (merged queue registration).
Target: v2 project `qikvmopbtijoebdqosyq` only.
Migration: `20260906051224_evidence_assessment_dependencies_v1`.
Applied and verified on 6 September 2026. Do not reapply to this project.
Deployment verification is recorded in `verifier/evidence_assessments_verification_2026-09-06.json`.

## What this adds

Three private tables retain versioned assessments, durable invalidation causes,
and dependency-processing runs. Assessments refer to existing source-span
candidates, name the assessing algorithm and its version, and record a rationale,
remaining uncertainty, and one of four outcomes. They cannot become public.
Different algorithms can disagree without overwriting each other. Explicit
supersession preserves the earlier assessment and makes its dependents stale.

Assessment context lists exact retained input positions for the source article,
candidate graph endpoints, explicitly added evidence, and inherited dependencies.
These are watched identities, not independently corroborating sources. All retained
versions are available through the input action; the assessor must interpret
corrections and tombstones rather than count every version as support. Reading
context does not prove the server actually inspected or correctly interpreted it.

An append compares the exact supplied context with currently visible evidence.
A delayed assessment fails when it missed a committed correction. Changes that
commit after this validation still make it stale on its next fresh database read.
The same applies to parent supersession. Reads inside an older database snapshot
only see that snapshot. Timestamp or sequence order never establishes knowledge
of concurrent uncommitted evidence.

Parent and ancestor identities are derived from existing assessments, preventing
cycles through this append API. Raw watches are inherited and deduplicated, so a
correction reaches children and grandchildren without adding confidence for
repeated derivation. No confidence or independent-source count is calculated.

## Server interface

`public.mip_assessments_v1(p_action text,p_input jsonb)` is an invoker RPC with an
empty search path. Only the existing trusted server role can use it. New tables
have RLS and no browser grants or policies. Assessments and invalidations reject
updates, deletes and truncation. The service role retains direct table privileges
required by the existing invoker architecture: this is not an untrusted-worker
sandbox, and direct privileged writes can bypass API validation.

| Action | Input | Result |
|---|---|---|
| `context` | candidate_id, optional parents and extra_positions | Candidate plus exact context positions and derived dependency watches. |
| `input` | position | Exact retained capture or record version; unknown positions fail. |
| `append` | candidate_id, algorithm_key, algorithm_version, outcome, rationale, remaining_uncertainty, context_positions; optional parents, extra_positions, predecessor_id | Immutable assessment UUID. |
| `read` | assessment_id | Frozen assessment with current staleness causes, supersession and publicly_eligible=false. |
| `process_dependency` | job_id, lease_token, optional limit 1..100 | One durable invalidation page; partial coverage keeps the job leased. |
| `reconcile` | optional after ordinal and limit 1..100 | At most 100 assessment rows examined and 100 invalidations inserted; next_after and has_more. |

Outcomes: `supported`, `contested`, `insufficient_evidence`, `not_supported`.
Use decimal strings for bigint context positions, extra positions and cursors.
An identical input/version retry returns the original UUID even if now stale;
changed decision text for the same input fingerprint conflicts. Always read its
current status. Context is capped at 500 versions, 32 extra inputs, eight parents
and 128 ancestors. Budget overflow fails explicitly; no evidence is silently
truncated. Partitioning work requires a deliberate later design.

Historical freshness is not implemented: a non-null as_of request raises an
explicit error, except an assessment dated after the requested time returns null.
The system does not present a current reconstruction as what was known then.
Geography candidates are rejected until spatial revision notifications exist.
Other producer families are limited to the queue's capture/history contracts;
entity, lineage, edge and registry changes need explicit version adapters.

## Dependency processing

Claim only `dependency_lookup` through the existing queue RPC, then call
`process_dependency` until coverage is complete. Each page fences its lease,
writes missing invalidations idempotently and records progress. The finishing
page records `dependency-run:<job UUID>` and completes that queue job in the same
transaction. Exact receipt retry is safe. A new_candidate_search job is rejected.
The two-minute lease and five-attempt policy remain in force. Keep pages small;
there is no heartbeat or automatic dead-letter reset.

A completed dependency scan means it recorded all matching missing invalidations
visible at that time. It does not mean semantic reassessment or new connection
search happened. Assessments already containing the change are left current.
Read-time freshness remains authoritative when an assessment commits after a
worker scan. Reconciliation repairs durable invalidations, including parent
supersession. Resume with next_after while has_more is true; an unfinished
assessment may keep the cursor unchanged while up to 100 causes are written.
Periodically restart from zero to catch late commits with lower allocated
ordinals. No cursor is a commit-order high-water mark. The limits bound writes,
not all database scan cost; corpus-scale query planning remains an integration gate.

## Validation and remaining work

Regression tests exercise exact input retrieval, retries, stale contexts,
inherited dependencies, paged fanout, supersession, disagreement, historical-query
refusal, rollback, repair limits, and browser/server access. The deployable smoke
script repeats a synthetic source-to-assessment-to-correction flow under the
actual server role and rolls back fixtures. It requires idle intake and only
prioritizes its own queue jobs. Identity sequences can advance after rollback.
Simultaneous multi-connection load and HTTP/PostgREST invocation are not tested.

This slice adds dependency processing callable through the database. It does
not schedule it, run a model, judge real claims, search absent connections, copy
the Manus corpus, or alter publication gates or frontend behavior. New candidate
search work remains pending until a real retrieval worker can save its results.
An ordinary and late-historical connection still need end-to-end semantic
verification, source independence checks, identity/asset adapters and appropriate
Markets and other surface projections before continuous discovery is complete.

## Repository registration and recovery

Register the exact applied migration; do not replay it on the target. Keep the
existing staging timestamp discrepancy documented: repository
`20260905203600_mip_legacy_graph_private_staging.sql` versus live
`20260906034920_mip_legacy_graph_private_staging`. Do not blanket db push or repair
migration history as part of this handoff. On regression, stop operator processing
and preserve jobs, source history and assessments for an additive repair.

## Verified live state on 6 September 2026

All 896 repository tests pass, including 14 assessment tests; the production
build passes with existing browser externalization and bundle-size warnings.
The live rollback canary passes under service_role. All eight content/count
comparisons match before and after: articles, nodes, edges, pipeline configuration,
spatial projection, source captures, record history and evidence candidates.
Security-advisor additions are three INFO entries for intentionally private RLS
tables without browser policies; there are no new WARN/ERROR entries.
[Advisor definition](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

A one-time bounded operator pass completed the seven retained-input dependency
jobs with seven durable scan receipts. It found zero assessments and wrote zero
invalidations. Seven new-candidate-search jobs remain pending. No scheduler was
activated and no real semantic assessments were manufactured to clear backlog.
