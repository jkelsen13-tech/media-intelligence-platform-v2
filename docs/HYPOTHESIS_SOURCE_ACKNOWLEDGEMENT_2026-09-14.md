# Isolated source acknowledgement authority — September 14, 2026

## Executable contract

`018_source_acknowledgement.sql` introduces a source-side capability over the existing disposable PostgreSQL slot. Source bindings are immutable versions with revocable heads. Mapping/key revocation and source-head mutation use the existing identity serialization fence; the current observation epoch is checked through the established hypothesis epoch gate. A retired binding cannot be re-enabled: restoration requires a fresh binding version.

The trusted recorder reads the exact encrypted delivery and commit envelopes, derives a stable request identifier, and prepares an immutable permit in a separate committed transaction. The permit binds source version, current owner mapping revision, end LSN and exact delivery hash. The acknowledgement gateway cannot create permits or change bindings. Workers, service_role and the gateways receive no owner-role membership.

The advancement function holds current authority locks through the native slot operation, rechecks expiry after waiting, requires a committed permit and accepts no caller-supplied slot or end position. A stored receipt is read only after fresh authority validation. Different mapping revisions cannot reuse an old permit.

The isolated function owner has NOLOGIN and REPLICATION, not SUPERUSER or BYPASSRLS. The gateway has neither REPLICATION nor owner membership. This privilege arrangement is a tested isolated design, not an approved production role or credential. The trusted permit issuer remains outside the worker compromise boundary; database code does not decrypt the journal or independently certify the recorder's decoding judgment.

## Nontransactional slot effect and recovery

PostgreSQL slot advancement is not a rollbackable SQL data update. This design does not claim otherwise. A permit must commit before advancement. If advancement occurs and the SQL receipt transaction rolls back, the permit survives and the receipt is absent; exact retry under fresh current authority reconciles the observed position. If the source has advanced beyond an unreceipted requested position, the function denies with an inspectable ambiguous-position diagnostic instead of inventing a completion receipt or resetting the slot.

Reference: [PostgreSQL system administration functions](https://www.postgresql.org/docs/17/functions-admin.html).

## Tests and scope

The actual pgoutput-to-journal native path now invokes the constrained prepare/advance functions instead of direct privileged advancement. Added tests exercise gateway/worker escalation denial, rejection of an uncommitted permit, actual advancement followed by SQL rollback and fresh-session recovery, and both source-revocation lock orderings. Revocation-first must preserve the permit and leave the slot unchanged; acknowledgement-first must make revocation wait. Reactivating a retired source binding must deny.

Three ordinary adapter tests verify stable request identity across reconstruction, exact durable evidence binding and response-substitution denial. Native tests live in `verifier/hypothesis-worker/sourceFenceCases.mjs`; the adapter is `fencedAcknowledgement.mjs`. CI must establish results against the candidate; this document does not predeclare PASS.

## Remaining requirements

Still open: consistent snapshot bootstrap; contiguous coverage/gap and slot-loss detection; authoritative source/cluster/incarnation mapping; restore invalidation independent of a restored database; and qualification of historical-time queries. Source binding UUIDs and the producer-principal vocabulary used by the fixture are synthetic. A matching slot name and plugin are not proof of slot incarnation after recreation.

This closes a same-database source-side authority race only when the native tests pass. A remote production topology must put the fence at the source or prove an equivalent protocol; holding a lock on a different server is insufficient. Production runtime, dedicated identity, replication custody and approved bounded trial remain owner-gated. No new credential is needed for these disposable tests.

Production cutover/public release remain on hold, CC remains closed 3/3, and F2, D4/D5, rights/privacy, provenance and history requirements are unchanged. No live writes, source retrieval, paid activation or project-file storage on the owner's device are introduced. No broad independent review is commissioned solely for this component.
