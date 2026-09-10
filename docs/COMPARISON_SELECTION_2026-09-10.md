# Comparison selection transaction qualification — 10 September 2026

Selection is a separate transaction from completing a semantic job. A later
generation, retry or withdrawal must not silently replace the selection a caller
actually observed. This package adds an isolated, private selection journal and
per-source head. It is outside migrations and deployable entrypoints.

A selection names an exact completed output hash in its source namespace and its
expected predecessor. A row lock serializes head changes. The journal append and
head movement commit together. A stale caller fails rather than overwriting a
new selection. Explicit withdrawal appends a null generation; there is no fallback
to the last non-null generation. Exact retries return their original receipt
without restoring superseded or withdrawn output. Conflicting retries fail.
A deliberate return to an older output requires a new action and current
predecessor; it does not rewrite old history or assert new evidence.

Caller context is retained as exact bounded JSONB, including numeric/date precision,
but is not an evaluated authority, rights decision or publication receipt.
This API must never become a public reader or production release API by relabelling
context. It deliberately exposes no browser access and performs no live writes.
Existing generation/output histories and job acknowledgement are unchanged.

Both new tables have RLS. Browser roles have neither schema access nor execution;
service_role has SELECT and the narrow definer API, not direct DML. Definer
search_path is empty. History rejects ordinary UPDATE/DELETE/TRUNCATE, including
owner DML; privileged owner DDL remains outside that guarantee. Head state is
mutable only through the API for the worker role.

Four PGlite tests cover exact binding, replacement, withdrawal, stale/foreign and
conflicting requests, pending-output rejection, numeric/time retention, injected
rollback, size/shape checks and role/history boundaries. Two native PostgreSQL
tests observe real lock waits, stale predecessor rejection after commit,
rollback convergence, and an old retry racing withdrawal. All data is synthetic;
tests run remotely in disposable CI.

## Integration still required

The production sizing and dependency receipt on PR #144 confirms current complete
semantic inputs fit 2 MiB. It also identifies a larger public-read closure:
events, membership, articles, claims/surfaces, explanations, evidence links,
corrections, nodes and arcs. The survivor's private reader_claim_surfaces and
publication predicates are stricter than the older Manus view and must remain.

A production selector still needs independently evaluated producer/worker
identity, a retained public payload and the full versioned dependency closure,
verified publication/rights authority, and defined current withdrawal/revocation
behavior. Existing live views remain authoritative. The legacy acknowledgement
race is not fixed by isolated selection qualification. Auth and external-runtime
closure, deltas/full parity, Markets evidence/rights and physical-device checks
remain pending. No legacy backend is SAFE TO RETIRE.

This completes a selection transaction checkpoint, not production cutover or the
overall work plan. Exact final-head and postmerge receipts are on the PR. No local
files are created.

Reference: [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS).
