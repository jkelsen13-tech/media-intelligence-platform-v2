# Explicit comparison failure transaction qualification

This extends the isolated comparison contract with a terminal worker failure
report. It is not a production migration, worker rollout or approved operating
policy. No live project receives this schema.

The current, unexpired lease may call fail with its generation, token, retained
input hash and implementation reference. One immutable report and the failed job
state commit together. Exact report replay returns failed without changing the
original report time or attempt. Stale/expired tokens, foreign bindings and
already-completed work are rejected. A report cannot produce output, acknowledge
a sibling, reopen a generation or reset its attempt budget. The existing expired
lease exhaustion path remains separate and does not invent a worker report.

The report records only exact binding fields, the claimed attempt, database report
time and the fixed code worker_reported_failure. It accepts no free-form error
text or source payload. Report time is operational observation time, not source
event time. Failure is not an evidence finding, confidence score, rights decision,
semantic evaluation result or publication approval.

The report table has RLS and denies direct worker writes and browser access.
Ordinary owner UPDATE/DELETE/TRUNCATE is rejected by history triggers; privileged
DDL is still possible. The fixed-search-path definer function is a qualification
API, not proof of evaluated producer/worker authority in production.

Four additional PGlite scenarios cover exact replay and independent work, invalid
bindings/leases/terminal states, injected transactional rollback, and role/history
boundaries. Three additional native PostgreSQL scenarios observe actual lock waits
for failure versus completion in both commit orders, exact concurrent failure
replay and rolled-back failure followed by waiting completion. Existing retry,
retention, precision, projection, concurrency and browser tests remain required.

This closes the explicit terminal failure transaction checkpoint only. Production
failure classification, retry/recovery and alert policy remain unapproved by this
qualification. Atomic real-input closure, evaluated authority, backlog/deltas,
immutable public projection selection and rollback remain integration gates.
Auth access, Markets evidence/rights, physical-device rendering and external caller
proof remain pending. No legacy backend is SAFE TO RETIRE.

All edits and execution occur remotely. Exact final-head and postmerge deployment
and live-browser receipts are recorded in the PR.
