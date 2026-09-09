# Comparison lease retry qualification

The isolated comparison contract previously reclaimed expired leases without a
retry budget or delay. A repeatedly crashing worker could retry forever.
This batch limits each retained generation to three lease attempts, waits thirty
seconds after the first expiry and sixty after the second, and marks an expired
third attempt failed with the fixed code lease_attempts_exhausted.

Failed is an operational disposition, never semantic completion, publication,
contrary evidence or proof of absence. Retained input stays immutable and no
output is inserted. Enqueue replay cannot reset the budget. There is no operator
retry/reset API in this package. A different observed generation remains separate.

The claim function reconciles exhausted rows using row locks with SKIP LOCKED.
Other pending generations remain claimable during backoff. Completion still
requires a live exact lease and exact input binding; all older leases fail.
Job constraints reject partial leases and inconsistent failed-state metadata.

Synthetic PGlite tests cover successive expiry, distinct tokens, both backoff
windows, exhaustion, stale completion, replay, retained input and unrelated work.
Time passage is simulated by owner-only fixture updates; this is not wall-clock
or simultaneous-connection qualification. The constants are qualification policy,
not approved production operating values.

No production schema or worker is changed. At 2026-09-09 21:46 UTC, this schema
was absent from both survivor and Manus. Explicit worker failure reporting,
evaluated authorization, real atomic producer input closure, concurrent PostgreSQL
qualification, backlog/delta reconciliation and immutable public projection
integration remain required. No legacy backend is SAFE TO RETIRE.
Final remote checks and release verification are recorded on the pull request.
