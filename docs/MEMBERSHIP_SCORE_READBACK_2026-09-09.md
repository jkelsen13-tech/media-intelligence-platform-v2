# Membership score readback — 9 September 2026

The deployed Manus comparison worker version 12 exactly matched the retained
source-comparison-run-v13 package (four files, JWT verification enabled) before
this batch. Membership persistence read all scores for the model ordered only
by event_id, even though retained history permits multiple scores per event.
It then silently filtered audit entries whose score ID was absent from readback.
A successful response could therefore report persisted scores and omit their audits.

The new complete v14 package uses event_id plus unique id for deterministic
pagination and verifies every computed score against exactly one retained row.
The event, model, input fingerprint/hash, confidence, decision, rejection reasons,
member scores and release gate must agree. Missing, duplicate or mismatched rows
return an error before audit writes or approval consideration. JSON object order
is immaterial; array order and exact timestamp strings remain material.
Unrelated retained history is not changed. Errors do not include source payloads.

Tests execute the actual previous/current membership function with isolated
persistence adapters, reproduce silent omission, and verify rejection before
audit/approval writes. A separate pagination counterexample exercises the actual
pagedSelect helper with valid but changing tie order. Scope assertions preserve
authorization, client pin, scoring, projection, release policy and queue logic.
Fixtures and writes run only in CI, never in production.

At 16:10:00 UTC, read-only production observation found 88 scores, 88 audits,
and 44 events with retained history. Both release policies had auto approval
disabled and null thresholds. This does not assert an observed production
pagination loss. The observed corpus is below the 500-row page boundary.

This is not snapshot isolation, transactional score/audit persistence, current
event-generation approval fencing, or comparison projection/queue repair.
Concurrent inserts can still cause offset readback to fail; completeness and
duplicate checks now reject that result instead of silently omitting work.
Earlier successful score inserts remain immutable on a later readback failure.
The collector cutover, authenticated end-to-end proof, ongoing history parity,
Markets evidence/rights and physical-device gates remain pending.

No local files, database migration, schedule or provider changes are included.
Candidate CI, runtime deployment/readback and postmerge verification are recorded
on the pull request. No legacy backend is SAFE TO RETIRE.
