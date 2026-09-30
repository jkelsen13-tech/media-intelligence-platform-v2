# Source-captured revision stream continuity — September 14, 2026

This isolated extension continues the hypothesis feature. It does not activate the queued calibration/UI/storage addendum, production replication, or historical-time qualification.

## Current protocol

019 installs a source-side capture and acknowledgement path after 018. Immutable configuration binds the existing source/runtime/observation epoch to a metadata-only logical publication, an exported-snapshot baseline LSN and the exact durable bootstrap hash. A mutable protocol head points to append-only coverage checkpoints.

The recorder asks the source for the next complete transaction. The source validates current authority and the exact metadata publication, locks the binding's slot, requires native confirmed position to match the retained head, and peeks the bounded first transaction. The source stores its exact protocol frames and hash before returning them. These are revision identifiers and transaction metadata, never assessment/article text.

The consumer verifies the entire transcript, configured identity, one complete transaction, exact end position and durable bootstrap. Existing encrypted exact-content delivery and commit records must commit/read back before preparation. The source compares requested end and transcript hash to its committed capture. The current recorder/gateway cannot call 018's older unbound prepare/advance functions.

Advancement serializes through the same source/identity fences. A committed capture and permit precede native slot advancement. A coverage checkpoint and protocol head update commit together with the SQL receipt. Native slot movement itself does not roll back; exact retry reconciles movement to the captured end after SQL rollback, using fresh current authority. Unexpected movement beyond that end, slot loss or revoked authority denies progress and retains evidence for explicit reconciliation.

A completed older capture may replay its stable receipt after later covered transactions, provided the actual slot still matches the current protocol head. It cannot move the slot backward. No force cancellation or automatic reset is introduced.

[PostgreSQL 17 administrative functions](https://www.postgresql.org/docs/17/functions-admin.html) specify transaction-boundary change limits, non-consuming peek, and crash-related slot-position behavior. Empty capture reports no revision transaction observed and leaves coverage unchanged; it does not invent evidence for an empty time interval.

## Verification scope

Native tests install 019 after preserved 018/bootstrap regressions. They use actual synthetic generated revisions, an actual exported snapshot, native pgoutput, encrypted remote journal and constrained SQL roles. They assert exact first/second revision inventories and checkpoint predecessor links; denial of skipped-end or changed-transcript permits; recovery after native advancement plus SQL rollback; externally advanced slot denial; slot-loss retention; publication expansion and source revocation denial; and removal of bypass grants/direct table writes.

Ordinary synthetic tests cover exact transcript/bootstrap binding, strict identities/shape/range, incomplete or multiple transactions, source refusal, incorrect receipts, lost replies and exact committed readback. These are mechanism tests, not real material permission or semantic qualification.

Files: `019_stream_continuity.sql`, `coveredRevisionConsumer.mjs`, `verifier/hypothesis-worker/continuityCases.mjs`, `tests/hypothesisStreamContinuity.test.mjs`. Results must be recorded against the executed candidate, not assumed from this design.

## Remaining requirements

This bounded implementation does not yet establish independent cluster/slot incarnation and restore attestation, a production runtime/custody configuration, large paged bootstrap completeness, empty-stream WAL housekeeping, or arbitrary historical-time reads. Slot loss/mismatch is detected; safe restoration still requires an explicit new authorized binding and verified bootstrap. Administrative publication mutation outside the protocol remains a trusted administrative boundary; pre/post checks are not a general attestation of every administrative change.

A complete hypothesis feature review still needs applicable engineering gaps resolved and an exact finite review packet. F2 methods/calibration and production identities/source permissions remain separately owner-gated. No coherent independent-review boundary is claimed here. CC stays closed at 3/3; prior evidence and all D4/D5/rights/privacy/World View protections are preserved.
