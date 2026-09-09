# Concurrent comparison transaction qualification

This extends the isolated PGlite qualification with independent PostgreSQL 17.6
connections in a disposable GitHub Actions service. It executes the exact
checked-in qualification contract, without installing it on any Supabase project.

Six scenarios exercise duplicate enqueue convergence after a real lock wait,
SKIP LOCKED progress and claim rollback, uncommitted output/acknowledgement
visibility with concurrent exact completion, completion rollback followed by
the waiting completion, stale completion after committed lease replacement,
and an independently locked exhausted generation alongside unrelated work.

Persistent psql sessions hold explicit transactions. An observer requires
pg_blocking_pids to name the expected holder before releasing blocked races;
thread timing alone does not establish that the race happened. Distinct backend
PIDs are checked. Statement, lock, subprocess and job deadlines bound failures.
Assertions use normal READ COMMITTED behavior. Roles model service_role API
access; only fixture setup/time advancement and lock observation use the owner.
The fixed loopback target and explicit CI/disposable guards reject ordinary
invocation or inherited production PG connection settings.

The container stores synthetic inputs only. Source dates and exact JSON numeric
values remain in PostgreSQL; no live credentials, evidence or providers are used.
This is transaction qualification, not a throughput benchmark, exhaustive race
proof, live Supabase role/JWT verification or semantic evaluation approval.

Production integration still requires atomic real-input closure, evaluated
producer/worker authority, explicit failure reporting and operating policy,
backlog/delta reconciliation and immutable public projection selection. No
worker/scheduler/cutover is activated and no legacy backend is SAFE TO RETIRE.
Existing PGlite, build and browser verification remain required. Exact final-head
and postmerge receipts are recorded on the PR.

References: [PostgreSQL SELECT locking](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE)
and [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html).
