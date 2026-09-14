# Native metadata stream to durable recorder — September 14, 2026

## Implementation and scope

The isolated `pgoutputRecorder.mjs` consumes PostgreSQL protocol-v1 logical replication messages for exactly `mip_hypothesis.revision_transactions`, with a separately configured relation OID and observation epoch. It requires the exact three-column schema (revision UUID, observation epoch UUID, full transaction identifier), insert-only tuples and complete matching Begin/Commit messages. All other message types, unknown relations, changed schemas, foreign epochs, duplicates, malformed/trailing bytes and incomplete transactions deny. LSNs and transaction identifiers retain full precision; PostgreSQL commit microseconds are preserved separately from observation time.

The whole bounded delivery is parsed before effects. Each commit's exact end-LSN delivery binding is stored and read back using the existing encrypted journal; its metadata envelope then passes the existing committed-readback recorder before source acknowledgement. A changed end LSN conflicts even if the revision payload matches. This is not a contiguous coverage certificate.

Protocol source: [PostgreSQL 17 logical replication message formats](https://www.postgresql.org/docs/17/protocol-logicalrep-message-formats.html). The implementation supports a restricted subset intentionally; it does not silently ignore unsupported mutation, origin, streaming or prepared-transaction messages.

## Native verification

The existing GitHub-hosted disposable PostgreSQL service enables logical decoding before fixture setup. A test-only PostgreSQL replication publication selects only the three metadata columns, with inserts enabled; this is not MIP public publication. Actual synthetic worker completions generate actual revision-transaction rows. Native pgoutput bytes are decoded without printing their contents.

The tests compare exact resulting revision IDs, check exclusion of assessment/source-body fields, require incomplete delivery to leave the slot unacknowledged, verify durable metadata before actual slot advancement, replay a lost acknowledgement, and require revoked recorder mapping to leave new native source work retained. The separate recorder runtime/key uses the same explicitly synthetic identity arrangement documented in the preceding component. No production credential is provisioned.

Test locations:
- `tests/hypothesisPgoutputRecorder.test.mjs`: synthetic protocol adversarial and ordering cases.
- `verifier/hypothesis-worker/pgoutputCases.mjs`: real PostgreSQL metadata stream and existing durable encrypted journal, invoked from the existing actual worker suite.
- `verifier/hypothesis-worker/prepareLogical.mjs`: guarded disposable-service setup only.

CI must determine PASS against the actual candidate; this document does not predeclare results. Existing regression assertions remain in place.

## What remains open

This closes the implementation gap between native filtered revision metadata and durable recording only when its tests pass. It does not establish a consistent starting snapshot, pre-slot historical completeness, contiguous coverage, gap/slot-loss detection, source identity attestation or restore safety. The fixture's configured source/stream identifiers are synthetic, not production attestations. An acknowledgement can still race consumer-authority revocation between journal readback and the source operation; a source-side authority fence is required before production-shaped qualification. The native test uses a disposable privileged fixture adapter, not an approved production consumer grant model.

Arbitrary historical-time qualification remains false. Prior frozen evidence, CC closed 3/3, D4/D5, F2, rights/privacy, publication and cutover holds remain unchanged. No new material is retrieved and no project file is stored on the owner's physical device.

Production owner choices remain exact source/runtime binding, dedicated consumer principal and custody, approved restore/epoch protocol and separately authorized bounded live verification. None blocks these isolated tests. No independent review is commissioned solely for this component.
