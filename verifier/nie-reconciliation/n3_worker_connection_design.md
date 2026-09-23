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
or new link blocks the custody manifest. The revised native fixture requires
the pinned Supabase PostgreSQL image to create `vector` and exercises its
actual `embedding vector(384)` column. The image-backed rerun remains pending.

The source worker opens one session-bound REPEATABLE READ, READ ONLY transaction.
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
scopes within the same 15-minute job. The signed supervisor now implements
those checks using an unprovisioned privileged issuer. The write adapter checks the same
operation scope digest/ID plus a scope-provisioning receipt before an
owner-approved destination write. This design does not wait for a human
while retaining payload in runner memory. The issuer implementation, key
custody and live scope provisioning remain missing and block the real route.
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

The injected `connect()` must be a trusted PostgreSQL client factory.
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

## Implementation milestone after 692a6b84

Before this change, the adapter had the source fence, manifest and narrow qik
transaction methods, but a caller could merely assert an `owner_approved`
object and inject an unverified connection. The signed-operation supervisor
now checks an Ed25519 approval against an independently pinned verifier key
before calling the source adapter. The approval binds operation UUID, host,
source and destination project refs and logins, exact endpoint hosts, selected
IDs, full field allowlists, source-group scope digest, maximum bytes and
runtime, retention/permission/route/cost references and expiry. A separate
signed issuer claim is required before source connection. The issuer must
atomically consume this operation and install its exact NIE ID scope; the
issuer execution and signing authority are not provisioned by this code.
The live manifest carries the signed source-group scope digest. The issuer
checks that digest, run prefix, byte bound and every ordered row ID against
the approval before granting qik pages.

After source COMMIT, the supervisor computes the manifest's exact qik run IDs,
tables, page hashes and sizes from the buffered records. It requires a second
signed issuer receipt covering those pages, manifest SHA, operation and attempt
before a destination connection. The issuer must have installed those SQL
page scopes under the narrow destination LOGIN. Runtime and expiry are checked
before every page and readback. A destination COMMIT acknowledgment loss now
discards the connection and uses a fresh narrow-login readback of the exact run;
it never retries that uncertain page. Unknown or divergent readback remains
incomplete. This preserves one source snapshot per attempt and makes partial
qik completion explicit to the larger consolidation campaign.

The connection factory accepts a direct endpoint or an explicitly supplied
Supabase **session** pooler hostname on port 5432. It configures full TLS
certificate and hostname verification and derives the project attestation
from its own checked connection. For the pooler, it authenticates with
`LOGIN.PROJECT_REF` while the source/destination adapters check backend
`session_user = LOGIN`. The pooler hostname must be verified by the operator
against the approved project's dashboard and included in the signed approval;
the factory never guesses a region. Transaction pooling on port 6543 cannot
preserve the pinned source session. GitHub hosted runners generally need the
IPv4 session pooler because the direct project endpoint is IPv6 by default.

The revised native PostgreSQL source fixture creates `vector`, stores one
384-dimensional value and one NULL, checks native type, dimension, text and
`row_to_json` representation, and rejects two dimensions. This has yet to
run in the pinned Supabase PostgreSQL image; its availability is a diagnostic
gate, not an assumed PASS. A local PGlite 0.5.8/pgvector 0.0.9 isolated run
did confirm the type and representation without entering the committed test
dependency set. The operator-side issuer module uses separate administrator
connections to insert the exact NIE operation and ID scope in one transaction,
then exact qik pages in another; its signed receipts are returned only after
known COMMIT. The source operation's unique key makes a repeat claim fail,
including after process loss. The qik issuer locks the signed run prefix and
refuses any prior page under that prefix, including an expired page, before
installing one manifest's exact pages. The approved prefix must therefore be
unique to the operation. A signed receipt cannot prove the administrator
roles are correctly restricted. The public key pins and issuer signing key must come from reviewed
operator configuration, not from the operation document or worker repository.
Host governance, actual SQL grants and revocation remain live release gates.
No live credentials or grants were created.

The issuer module is operator-side code. It must execute outside the GitHub
worker process: the worker sends the signed owner approval to an authenticated
operator channel; the operator verifies it, installs source scopes, and returns
only a signed claim document. After source COMMIT, the worker sends that claim,
manifest and exact page metadata; the operator installs qik scopes and returns
only a signed page grant. The supervisor verifies both documents before using
the narrow worker logins. No authenticated worker-to-operator channel, pinned
operator identity or approved key/administrator-secret custody is installed.
Direct in-process issuer wiring in a test proves callback agreement only and
must not be used as the live deployment topology.

## Exact page review correction

Before this correction, 002's enqueue wrapper checked page hash, count and
source table. The issuer inserted a page hash supplied through the worker
callback. That did not independently bind a page to the manifest's ordered
source IDs, each payload digest or the exact retained field keys. The new
**uninstalled** `004_exact_page_candidate.sql` adds `expected_rows` and
`expected_fields` to the qik page scope and replaces the enqueue wrapper.
The operator-side issuer derives those values from the validated source
manifest, checks the manifest's ordered IDs, run prefix, byte bound and
source-group scope digest against the signed approval, then inserts them as
admin-only scope. The wrapper rejects a matching-size page with a foreign ID,
different payload digest or extra/missing field before enqueue. It also checks
the outer record keys and source identity. A submitted page SHA remains useful
for job integrity, but it no longer grants authority without the row and field
matches. 002 and 004 must be reviewed and installed together for this guarantee;
neither was applied here. The previous 002-only synthetic PASS remains
historical evidence, not proof of the corrected route.

The signed approval now includes `issued_at`; both source-ID and qik-page SQL
scope expiry and both receipts use the same absolute bound: the earlier of the
owner-approved expiry and `issued_at + max_runtime_ms`. A lost administrator
COMMIT acknowledgment discards the connection and issues no receipt. The new
native fixture exercises real `vector(384)` text, a second approved article
whose selected embedding is JSON null, exact narrow-login readback, foreign-ID
and extra-field refusal, and expired-scope denial after 004. Its expected
digest is computed by the fixture administrator before the narrow LOGIN reads
it. The native fixture has not run in the pinned Supabase PostgreSQL image.
The source fixture installs pgvector in an `extensions` namespace without
USAGE for the narrow role, then checks the native type and dimensions as
administrator and the selected vector serialization as the narrow role. This
fixture also selects a native SQL NULL embedding in a separate synthetic
read-only fence and checks its JSON null serialization. Both source-side
serialization checks select only the authorized `embedding` column; a whole
row would require the deliberately denied private fixture field. The qik NULL
page uses a distinct synthetic target mapping from the vector page. This models the
required ACL boundary without changing 003. The actual NIE
extension namespace and effective ACL still require a bounded catalog check;
if the pinned fixture image preinstalls pgvector in another namespace, the
native run will fail diagnostically until that configuration is reconciled.
The authenticated
worker-to-operator receipt channel and operator key custody remain concrete
hosted release gates. No signing key or administrator connection belongs in
the GitHub worker process.

## Issue comment channel candidate (source-free, unprovisioned)

`scripts/mipNieIssueChannel.mjs` now supplies concrete callback functions for
`superviseNarrowParentCustody` and a separate operator processor using an
existing GitHub Issues comment API. It does not create an issue, token, key,
scope, role, workflow, or live process. A dedicated issue in a separately
controlled private repository is a proposed mailbox. An owner-signed channel
authorization pins the repository ID/name, issue number, run ID, run actor ID,
worker comment actor ID, exact head commit, operator comment actor ID,
operator X25519 key digest, signed
operation approval digest, issue and expiry. The signed operation's `host_id`
must equal that run ID. Both sides inspect the GitHub run's repository, actor,
head commit and active state through the API. GitHub comment actor identity is
checked as a routing constraint; it is not treated as grant authority. The
operator verifies the signed approval and existing issuer verifies it again
before any administrator SQL. The worker verifies each Ed25519 issuer receipt
with its independently pinned issuer key in the existing supervisor.

The worker encrypts the signed approval and source claim request to the pinned
operator key. After the source fence commits, it encrypts the exact manifest
and page metadata for the page grant request. The operator invokes the
existing `createNarrowScopeIssuer` with its own local signing key and separate
administrator connections, then encrypts the signed receipt to a fresh
worker reply key held only in runner memory. X25519-derived AES-256-GCM uses
request, phase, direction and authorization digest as associated data. The
comment body contains ciphertext and routing nonces only. Schema checks reject
payload-shaped callback arguments, oversized comments, malformed ciphertext,
cross-run replies and late authorization. The SQL operation and run-prefix
uniqueness checks are the persistent replay fences. The operator process is
one-shot per request; an uncertain response must be reconciled from source/qik
scope state, not blindly retried.

GitHub Issues would gain a **durable encrypted copy of selected ID/digest
metadata**. Encryption does not erase that custody or its retention question.
The worker would need a separately reviewed `issues:write` token for that
private repository; the present public application workflow's `contents:read`
token does not supply it. The operator would need reviewed Issues read/write
and Actions read authority. Neither privilege is granted here. A public issue,
workflow input, log, uploaded artifact, or GitHub secret containing an NIE
payload, plaintext selected IDs, database DSN or administrator key is outside
this candidate. There is no claim that comment deletion or an expiry removes
GitHub's durable copy. A large or incompressible manifest exceeding the bounded
comment size fails closed and needs a separate reviewed custody route.

The existing qik page-scope rows could eliminate the *page grant response*
mailbox only with a new narrow read wrapper and signed receipt storage. They
cannot deliver the prerequisite NIE source claim before the source connection,
and making the worker poll source or qik administrator tables would widen its
authority. That alternative would require its own SQL, rights and retention
review. The Issue candidate reuses GitHub's existing API without adding a
backend, while keeping the administrator and issuer keys off the worker.
Its source-free tests cover delivery, account/run pinning, ciphertext failure,
request shape, expiry and no plaintext metadata in comment bodies. They do
not qualify the real host, token permissions, account authority, GitHub
retention, network path, live grants or payload transfer.

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
