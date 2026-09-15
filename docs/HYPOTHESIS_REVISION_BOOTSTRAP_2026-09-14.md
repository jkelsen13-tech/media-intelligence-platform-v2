# Isolated revision snapshot bootstrap — September 14, 2026

The current hypothesis work remains active. The belief/uncertainty/calibration/UI/storage addendum is queued until this work is completed, verified and frozen; none of its future phases is activated here.

## Snapshot and stream contract

The existing disposable PostgreSQL service creates a logical pgoutput slot through the replication protocol with an exported snapshot. A separate read-only repeatable-read transaction imports that exact snapshot while its exporting connection remains open. The exporter's next action is closing after capture; no intervening command invalidates the snapshot.

The capture reads all assessment revision IDs with a left join to transaction metadata. It does not filter missing metadata or foreign transaction epochs out of the inventory. Canonical metadata rows preserve exact identifiers; missing transaction provenance stays explicit. A bootstrap record states only that these records were visible in the exported snapshot. It does not manufacture their original commit times or qualify arbitrary wall-clock history.

The immutable bootstrap binds configured source/stream/current observation epoch, consistent LSN, exported-snapshot identifier and sorted metadata. Its existing encrypted journal put must commit and read back identically. A stream gate then rejects absent/mismatched bootstrap, pre-baseline commits and overlap with baseline IDs before forwarding a bounded delivery to the existing durable recorder and source-side fenced acknowledgement.

Reference: [PostgreSQL 17 replication protocol](https://www.postgresql.org/docs/17/protocol-replication.html). The consistent point and exported snapshot are a matched native pair; a separately timed ordinary query is not substituted.

## Evidence to verify

Ordinary tests cover unknown/foreign provenance, strict shape and duplicate rejection, uncertain durability and missing/pre-baseline/overlapping stream denial.

Native cases create an actual synthetic revision before export, pause an imported snapshot reader, commit another actual revision, then compare exact snapshot IDs and stream IDs against the complete bounded revision inventory. Their union must match, and the later commit must not appear in the snapshot. The tests also check missing-bootstrap non-advancement, encrypted exact replay, conflicting baseline denial, fenced actual slot advancement and inability to import an expired export as a new snapshot.

Files: `temporalBootstrap.mjs`, `verifier/hypothesis-worker/snapshotExporter.mjs`, `bootstrapCases.mjs`, and `tests/hypothesisTemporalBootstrap.test.mjs`. CI results must be attached to their actual candidate; no result is predeclared here.

## Limits and remaining engineering

This is a bounded metadata bootstrap in the existing authorized disposable environment, not production replication access. Operational size bounds are not semantic qualification thresholds. Larger sources require a paged snapshot reader preserving the same transaction and an exact completeness manifest; truncation is not permitted.

Still open: durable contiguous coverage and gap/slot-loss detection; source/cluster/incarnation and restore attestation independent of restored state; qualified historical reads and independent review. A matching snapshot/stream pair does not establish pre-bootstrap historical availability. `historical_time_qualified` remains false. Missing legacy transaction metadata is retained as unknown, never backfilled with invented identifiers.

No real material fetch, production credential/grant/deployment, public release, F2 setting, paid activation or project-file storage on the owner's device is introduced. CC remains closed3/3; all existing D4/D5, rights/privacy, provenance and cutover holds remain.
