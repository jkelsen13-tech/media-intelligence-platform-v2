# Committed history observations — isolated backend foundation

The feature requires trustworthy historical views. completed_at is assigned before transaction commit and cannot establish committed availability. Existing arbitrary as_known_then selectors remain disabled. This continuation records actual committed revision membership at a retained observation; it does not substitute that observation for an arbitrary historical timestamp or declare temporal work complete.

## Evidence model

015_committed_observations.sql records a revision's top-level xid8 and qualification epoch atomically through an append-only insertion trigger. There is no provenance backfill. An observation obtains existing publication/membership/question fences, takes a fresh PostgreSQL snapshot and enumerates the permission-checked retained history. Each row must have matching epoch provenance, belong to another transaction and be visible in that snapshot. Database row presence excludes rolled-back transactions; snapshot visibility alone is not treated as proof that an arbitrary transaction committed.

The retained observation stores revision IDs/numbers, observed availability status, a hash of the exact reference serialization, internal transaction/snapshot metadata and a bounded server-clock observation interval. No assessment, article body or excerpt is copied. The result fixes the enumerated prefix: later revisions are never silently added to a prior observation. Exact same-user/request retry returns the original receipt under current investigation access.

Capture returns a receipt requiring committed readback. Reading an observation created in the same still-open transaction rejects. A later read must find the committed observation row, match the current enabled epoch and observer identity, and repeat existing current permission checks. An originally withheld entry stays withheld in that observation; a new observation requires fresh current authorization. A later withdrawal/permission denial suppresses previously visible reasoning. Current dependency flags describe the current state and are not reconstructed historical flags.

Observations are personal to the authenticated caller within their assigned investigation. They do not expose another member's activity or grant a worker observer/reviewer authority. Gateway callers receive execute-only functions, not tables; workers have neither observation calls nor epoch/table grants. NOLOGIN/NOBYPASSRLS ownership, FORCE RLS and append-only receipt/provenance protections are retained.

## Default-closed epoch and limits

The observation epoch installs disabled. Only disposable fixtures enable it with synthetic administration. It is an internal database generation marker, not a production identity, signature, credential or owner approval.

Disabling/changing the epoch blocks old observation readback and new capture from mismatched provenance. This is not automatic restore detection. A production restoration/clone/import must remain closed until an explicitly qualified epoch and historical-evidence procedure is established; none is provisioned here. Missing legacy provenance fails closed instead of relabelling old records with today's transaction ID. Cross-database/restore qualification and legacy historical coverage remain open.

The observation interval is when this enumeration occurred, not when each assessment committed or became visible to all clients. No arbitrary wall-clock cutoff can be supplied. The stored snapshot is not used as a timestamp index or numeric watermark. Frontend observation selection/readback and a complete temporal coverage model remain to be implemented; the existing saved-version UI and as_known_then refusal are unchanged.

## Primary technical basis

PostgreSQL documents that pg_current_xact_id returns the top-level xid8 even within a subtransaction, while snapshot visibility must not be evaluated with subtransaction IDs. It also notes that a completed transaction in a snapshot may be committed or rolled back, hence the separate actual-row/provenance check here. [Transaction and snapshot functions](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-PG-SNAPSHOT).

The existing transaction-level advisory fences are held to transaction end. Their protocol remains application-enforced; no claim is made that advisory locks protect paths that do not use them. [Explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).

## Verification required

Eleven native tests add commit-first/rollback ordering, own-subtransaction rejection, observation committed-readback enforcement, fixed-prefix/exact retry, present and past withholding, per-user/membership isolation, missing legacy provenance, disabled/rotated epochs, immutable tables/grants and missing-fence/old-isolation refusal.

The configured HTTP-client/handler/native worker integration exercises capture/readback and permission revocation through the trusted gateway, rejects caller-supplied revision lists before SQL, and extends actual worker privilege-escalation denials to the new tables/functions. These are synthetic hosted tests; their exact candidate must pass before being reported as evidence.

No live migration, deployment, source admission, CC retrieval, numerical methodology, production principal, credential, schedule, publication or local project-file storage is introduced. Cutover remains ON HOLD; PR153 remains draft/unmerged. Prior frozen candidates and failed/inactive permission attempts remain intact. The coherent independent-review boundary is not declared reached by this foundation.
