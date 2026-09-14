# Native source-incarnation guard — September 14, 2026

## Implemented isolated boundary

020 adds immutable registration records binding a source-version ID to an explicit incarnation ID, PostgreSQL cluster system identifier, database object OID and postmaster start timestamp. The trusted recorder's configured incarnation ID must be retained outside source database restores; it is never discovered or automatically accepted from the restored source. The source compares the registered tuple with current native values.

Capture, permit preparation and advancement each require this pin and native comparison before delegating to the existing authority/coverage path. Current authority and revocation serialization remain required. The former gateway entry points are revoked so the current recorder cannot bypass the pin through 019. Only the existing NOLOGIN registry owner receives execute permission for pg_control_system; gateway/worker roles cannot read registration records, mutate them, or inspect control data through that function.

sourceIncarnation.mjs fixes the expected ID at construction and sends it through each exact RPC shape. It rejects an attempt to supply another ID per call. The SQL wrappers preserve the existing committed-capture, durable-delivery, permit, checkpoint and exact-retry requirements. A producer process restart with fresh current authority may retry the same registration; a database server restart changes the native startup value and requires explicit reconciliation and a new authorized registration/binding rather than automatic acceptance.

[PostgreSQL 17 control-data functions](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-PG-CONTROL) expose cluster-wide control information including system_identifier. A database OID and server start observation add distinctions but are not cryptographic proof of a unique deployment.

## Verification scope

Native synthetic registration cases cover positive covered completion and fresh-session replay; missing/wrong external pins at capture, prepare and receipt replay; simulated cluster/database/startup mismatch; immutable records, FORCE RLS and denied bypass/control-data access; and both real source-revocation lock orders through the new interface. Existing 018/019/bootstrap cases execute first as preserved baselines; the final installed interface includes 020.

Ordinary tests cover required external configuration, fixed pin propagation at every sensitive RPC, immutable transport configuration and rejection of per-call overrides. These are synthetic registrations, not an owner signature, production principal or independent attestation. Results must be tied to actual executed CI.

## What this does not prove

A simulated mismatched native tuple is not an actual restore, clone or failover experiment. System identifiers can be copied in physical backups, OIDs can be reused and timestamps are not a cryptographic incarnation identifier. A privileged database administrator remains inside the trusted source boundary. This guard does not prove unique slot lifecycle, a production authenticated endpoint, a tamper-proof external registration ledger or correctness after restoring that ledger together with the source.

Full source/restore attestation remains unfinished: the isolated package still needs executable independent registration custody and actual clone/restore/restart evidence tying source registration, external checkpoint and fresh bootstrap to an explicit recovery lineage. Do not mark that broader gate complete based on these comparisons.

## Concrete production decision, when production-shaped verification is requested

Select the custodian and already-approved private location for the deployment registration and recovery ledger outside the source backup/restore domain; identify the exact authenticated endpoint/runtime and who may issue a new registration after restart/restore. Recommended treatment is deny until that exact recovery is authorized and fresh bootstrap/current authority are verified. Reusing a source-restored registration automatically would bypass the intended external pin. Minimum later trial scope must name the disposable/non-production target, principal, permitted control-data reads, recovery operations, retention/cleanup and stop conditions. No production grant, identity or credential is requested or created by this isolated implementation.

Empty-stream WAL housekeeping and qualified historical reads remain additional temporal work. Historical-time qualification stays false. No new CC fetch, publication, production change, paid service or owner-device project file is introduced. The addendum remains queued behind current feature completion, verification and freeze.
