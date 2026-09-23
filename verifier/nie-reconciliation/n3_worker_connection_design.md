# N3 narrow connection candidate (2026-09-23)

This is a source-free qualification design, not a live grant, credential, or
custody authorization. The installed `finish_nie_parent_job` is unchanged.
The SQL files `002_narrow_worker_candidate.sql` and
`003_nie_source_read_candidate.sql` are deliberately outside migrations.

## Authority and provisioning

An administrator first approves a bounded source operation: one dedicated
short-lived LOGIN, an operation UUID, expiry, exact selected event/article IDs,
the permitted field lists, and a selected-event-root membership closure digest.
The administrator records those IDs in `nie_parent_access.allowed_source_ids`.
Discovery of candidate IDs is a separate, bounded metadata-only administrator
phase; this operation is not allowed to read every NIE parent payload.
The LOGIN inherits only `nie_parent_source_read`, with column-specific SELECT
on `events`, `articles`, and `event_articles`. Restrictive RLS intersects any
pre-existing permissive policies. The selected-root metadata helper includes
even membership links hidden from the payload reader, so an unapproved endpoint
or new link blocks the custody manifest. Native fixture uses a simplified
`embedding text` column: pgvector storage/type fidelity remains unproved.

The source worker opens one direct REPEATABLE READ, READ ONLY transaction.
`prepareNarrowPgParentCustody` builds the manifest, reads the exact fields and
selected-root closure, then buffers the verified payload in memory under the
128 MiB raw JSON byte bound (expanded JS heap can be larger). It returns only
after source COMMIT and connection close;
the provided `buildScopedNarrowManifest` uses only the approved sorted ID
lists, exact field allowlists, row digests and full selected-root closure.
`writePreparedParentCustody` then requires exact manifest authorization and
writes destination pages. The owner decision would pre-authorize the bounded
ID scope, field contract, project refs, permission/retention/route/cost basis,
host identity and operation. The adapter checks the bound scope digest before
opening a source connection. An approved supervisor must authentically issue
that pre-read authorization, compare the runtime manifest to it, and issue its exact hash/page
scopes within the same 15-minute job. The write adapter checks the same
operation scope digest/ID plus a scope-provisioning receipt before an
owner-approved destination write. This design does not wait for a human
while retaining payload in runner memory. The supervisor trust boundary and
live scope provisioning remain missing and block the real route.
`pg_current_snapshot()` is snapshot state, not a unique
transaction ID; the client attaches a fresh random fence UUID. A new source
transaction must get a new fence and reverify every approved ID, row hash and
selected-root closure. There is no cross-project atomic transaction. The
bounded in-memory payload is lost on process death; no disk or remote
payload cache is provided.

After the approved manifest is checked, an administrator inserts exact qik
page scopes: authenticated LOGIN, run ID, source table, page SHA-256, size,
manifest SHA-256 and expiry. The destination LOGIN inherits only
`nie_parent_worker_call`, never the executor or `service_role`. SECURITY
DEFINER wrappers run as a NOLOGIN, NOBYPASSRLS executor, with empty
`search_path`, and check `session_user` through RLS-bound scope. They expose
enqueue, claim, scoped finish and completed-job readback only. Direct staging
table DML, original helper execution, unrelated run/job access and scope
insertion are denied. The executor must not own any RLS-protected table.
Post-commit readback uses a fresh connection as the same LOGIN and compares
the exact source-qualified row set, JSON payload, version and digests.

## Authority preflight and host gate

PostgreSQL cannot subtract inherited PUBLIC grants with a role-local DENY.
Before any live provision, enumerate effective schema, table, column,
sequence, function and role rights on both projects. Classify every callable
non-system function by exact signature/body hash, owner, search path and
side effects. Unknown, privileged or data-widening authority is a stop gate;
remediation needs separate review rather than blanket PUBLIC revocation.
Check all three source tables have RLS enabled, and check qik executor is
neither owner nor BYPASSRLS. Current candidate SQL and fixtures do not prove
the live grants or helper-body audit.

The injected `connect()` must be a trusted direct PostgreSQL client factory.
It must verify the exact project endpoint and TLS certificate hostname with
full server-certificate verification, and derive `connectionInfo.projectRef`
and `tlsVerified` from that checked transport. `pg_stat_ssl.ssl=true` proves
encryption only. The mock adapter tests exercise this contract, not live TLS.
The existing private GitHub Free runner is qualified only for credential-free
synthetic data: it has no environment-secret gate, broad workflow/action
settings, unresolved writer inventory, 90-day log retention and unapproved
real-payload egress/retention. No real NIE credential belongs in that runner
until host governance, terms and owner approval are settled; no upgrade or
additional service is proposed by this candidate.

Provisioning would require two distinct independently generated secrets and
LOGINs, one on NIE and one on qik, each dedicated to a single approved
operation. Proposed bounds are `CONNECTION LIMIT 1`, `VALID UNTIL` no more
than 30 minutes after issue, `lock_timeout=5s`, `statement_timeout=30s`,
`idle_in_transaction_session_timeout=2min`, and a 15-minute host-job cap;
these are candidate values, not applied settings. The host must inject the
secrets privately and never print/cache them. Revocation must first stop the
writer, then block new authentication with NOLOGIN/expiry and revoke the
operation scopes and callable memberships. Only then terminate both active
database backends, verify no sessions remain and a fresh connection is
denied, and remove injected secrets. A source failure before its COMMIT yields no prepared custody and
therefore no qik writes. After source COMMIT, only the bounded in-memory
prepared payload and exact manifest authorization may enter qik.
An already-open REPEATABLE READ transaction can retain a prior authorization
snapshot, so merely changing scope rows or `VALID UNTIL` does not revoke it
immediately. No live credentials, roles or grants have been provisioned.

## Failure and recovery

Each destination page is one transaction; an error rolls it back. On an
unknown COMMIT outcome, reconnect as the same narrow identity while the exact
scope is valid and read back the run. A completed exact row/digest can be
recognized as committed; a missing or divergent result is not success.
The private writer stops after one uncertain page attempt, pending readback
and a recorded recovery decision. The database `attempt_count` also rolls
back with the page transaction and does not enforce a retry budget across
rolled-back attempts. A host-level one-attempt-per-page/process cap is
required; the current orchestration stops on an incomplete page.
After process loss, a new source transaction must use a new fence UUID and
manifest. An incomplete page without securely retained approved source
payload requires a new operation and explicit disposition of prior partial
rows. The first candidate intentionally fails closed on source identity that
was already staged by an expired or foreign job; it does not grant blanket
historical staged-row access or silently resume a new snapshot.
