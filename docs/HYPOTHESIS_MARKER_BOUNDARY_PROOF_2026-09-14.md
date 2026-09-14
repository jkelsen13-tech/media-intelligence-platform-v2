# Native marker boundary proof — isolated prerequisite

This draft provides a strict distinct marker decoder, retention proof, and native PostgreSQL 17.6 tests. It does **not** provide the complete source-attested empty-stream consumer.

## Implemented scope

- New isolated 021 creates an append-only metadata-only marker table with forced RLS and no gateway or worker grants.
- Disposable CI administrator emits markers in transactions. The native pgoutput transcript supplies the Commit end LSN.
- A distinct marker proof retains exact transcript bytes and metadata in the existing encrypted remote journal with exact readback.
- The original revision decoder, commit envelope, source capture, incarnation wrappers and advancement permits remain unchanged.
- Marker proof has no acknowledgement capability. Only the synthetic native fixture administratively advances a slot, after retained readback.
- Native tests exercise unrelated WAL, an actual worker revision transaction held open across consumed marker, rollback, intervening revision, retained retry, revoked journal mapping and slot loss.
- No wall-clock historical qualification; every marker proof retains historical_time_qualified=false and authority_integrated=false.

## Required next implementation

1. Bind marker issuance to current source registration, incarnation, observation epoch and mapping under existing fences. Assign marker fields server-side and durably reserve/reuse request IDs.
2. Register a versioned exact two-table publication contract. Existing check_stream intentionally rejects it; do not weaken that original contract.
3. Extend source capture with distinct typed marker delivery and source-side marker identity verification. Process intervening revisions without skipping.
4. Bind source permits to independently retained marker delivery and bootstrap evidence; add end-to-end revocation and rollback-after-native-advance tests through real gateway roles.
5. Preserve current slot loss/incarnation discontinuity behavior and require fresh registration when continuity is lost.
6. Establish bounded marker frequency and retention. No marker/evidence deletion is implemented or authorized.

Only after these are implemented and independently reviewed could this become an integrated empty-stream coverage capability. The current proof cannot authorize production or frontend historical views.

## Interpretation

An observed committed marker can bound committed published transactions in WAL order, including an interval with no revision commit. A revision transaction opened earlier but committed later belongs after that boundary and must remain recoverable through the native slot. Empty peek plus current WAL position proves no such boundary. Marker commit time is retained as source metadata only, without wall-clock completeness claims.

PostgreSQL documents commit-order decoding and exclusion of rolled-back transactions:
https://www.postgresql.org/docs/17/logicaldecoding-output-plugin.html

The protocol defines the Commit end LSN separately from message LSN:
https://www.postgresql.org/docs/17/protocol-logicalrep-message-formats.html

Slot restart/confirmed positions:
https://www.postgresql.org/docs/17/view-pg-replication-slots.html

The table approach keeps messages=false. Enabling logical messages would require separate issuer authentication and filtering because messages are not confined to table publication membership.

## Execution and custody

All implementation writes use GitHub. Native execution uses the existing disposable hosted workflow; no live Supabase connection, credential, new infrastructure, merge, production deployment or local project files.
