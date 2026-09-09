# Comparison generation/output transaction qualification

The live legacy comparison queue overwrites one row per event and broadly
acknowledges pending work after rebuilding mutable projections. The survivor
discovery queue already has immutable capture/record jobs, but its routes are
dependency lookup and new-candidate search. Whole-projection comparison work
must not be relabelled as either route merely to reuse transport.

This package qualifies a dedicated comparison transaction boundary in isolated
PGlite. contract.sql is outside migrations and deployment entrypoints. It is
not installed on any production project and has no scheduler, HTTP endpoint,
public reader, evaluation approval or worker activation.

## Qualified scope

An enqueue retains an immutable JSONB input, source namespace, independently
observed time and implementation reference. Repeating the same observation is
idempotent; a correction, different source, implementation or observation time
is a separate generation. IDs are neither event time nor a commit-order cursor.
The claim returns raw PostgreSQL JSONB text and its hash so retention precision
is not dependent on JavaScript number serialization.

A claim leases one generation. Completion verifies its input and implementation
binding and the current lease, inserts the exact output, and completes that job
in one transaction. A later failure rolls both operations back. Exact retry is
idempotent; stale tokens, changed output or foreign input bindings fail. A late
correction or another source generation remains independently pending.

The generation and output tables reject ordinary UPDATE/DELETE/TRUNCATE history
mutation. All three tables have RLS. Browser roles lack schema usage and API
execution; service_role has SELECT and the narrow enqueue/claim/complete APIs,
not direct table mutations. The three mutating APIs use fixed-schema definer
functions with empty search_path to perform these narrowly granted operations.
Database-owner DDL remains privileged; this is not administrator-tamper-proof
storage. The qualification API is not a production authorization design.

Tests run actual runEventProjection output through retained inputs and completion,
and check exact output/input retention, later generations, failure injection after
output insertion, lease replacement, stale/repeated/conflicting completion,
raw large-integer/decimal/time retention, oversized/malformed input/output and
role/history boundaries. Tests use synthetic records only. Explicit interleavings
and single-database rollback are exercised; simultaneous independent PostgreSQL
connections and deployment behavior are not certified.

## Required integration before production

This contract deliberately has no work_ref-only completion and no publication
side effect. A shape-valid output remains trusted worker output, not proof of
semantic correctness, source authenticity, rights or completed evaluation.
The real producer must atomically retain the entire projection input closure
(including membership, article versions, configuration and lexicon/implementation
identity) and prevent unobserved changes from being acknowledged. Current
paginated mutable reads cannot supply that proof.

Production integration must add evaluated worker/producer authorization,
concurrent-connection qualification, bounded retry/dead-letter/backoff behavior,
backlog/delta reconciliation, immutable public projection selection and rollback.
An arbitrary caller-supplied implementation reference or fixture success is not
an evaluation receipt. Existing evidence/publication gates remain authoritative.
The legacy queue and all live workers/schedules are unchanged by this package.

This completes only the isolated generation/output transaction checkpoint.
Auth provisioning, Markets typed/dated retained evidence and rights, physical
device qualification, external runtime/caller proof and the full backend gate
remain pending. No legacy backend is SAFE TO RETIRE. No local files are created.
Final-head regression, preview and postmerge live evidence are recorded on the PR.
