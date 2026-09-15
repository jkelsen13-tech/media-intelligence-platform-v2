# Actual disposable clone and database restart evidence — September 14, 2026

## Scope

This extends the source-incarnation tests using the existing GitHub-hosted PostgreSQL service. It does not deploy or write to a live MIP backend. The workflow already identifies its own disposable service for metadata-decoding setup; this change passes that same service ID to the native test step so the existing guarded restart helper can operate on it. GitHub permissions remain contents:read.

## Actual clone experiment

The native case commits a source capture and covered permit, then creates a separate disposable database with PostgreSQL CREATE DATABASE ... TEMPLATE from the fixture database. It compares the copied registration, transcript hash and permit count exactly and verifies that the database OIDs differ. The copied session and original external registration ID cannot advance the source through the clone. Both the original and clone remain without a checkpoint at rejection; the original subsequently completes normally.

The observed clone rejection is the existing source/database-name binding check. It is not presented as proof that the new database-OID comparison alone caused that rejection. Copied database state, credentials or registration records do not by themselves authorize a different endpoint. The clone is removed only after its test, without FORCE or terminating source connections. Only synthetic fixture data exists in these databases.

## Actual server restart experiment

The native case commits a source capture and covered permit before restarting the exact disposable PostgreSQL service container. It verifies that postmaster startup changed while registration, transcript hash and committed permit survived. After fresh broker authentication, both capture and advancement with the old configured incarnation are rejected by the native identity check. No checkpoint or advancement receipt appears and the registration is unchanged.

This tests a real database server restart, distinct from the existing producer/worker process restart tests. It does not simulate a restart merely by editing a timestamp. Durable work remains available for explicit reconciliation; no source slot is force-cancelled and no automatic new registration or bootstrap is invented.

## Evidence boundaries and remaining work

The tests must pass on their actual candidate before this document is treated as execution evidence. Previous simulated mismatch cases and failed control-data permission attempt remain preserved.

This closes actual disposable clone refusal and database-restart refusal evidence if verified. It does not establish physical backup restoration, failover, source/registration-ledger co-restoration safety, independent durable registration custody or a fresh-authorized recovery lineage. Those remain concrete isolated engineering work. Production custodian/location/runtime/endpoint and any later trial remain separate owner decisions.

Historical-time qualification remains false. Empty-stream housekeeping and qualified historical reads remain open. The queued addendum, F2 settings, publication, production cutover and retirement stay gated. CC remains closed3/3 with no new fetch. No project files are stored on the owner's device.
