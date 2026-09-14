# Saved-boundary sealed delivery: isolated unqualified candidate

Base PR166: `406512127399e63e117f2a8e0b089f97579bd0d9`. Draft PR172 only. No deployment or live role admission.

## Preserved contrary evidence

Initial candidate `8b2a29ee88907751a16c4de8ca4fae0ae6f0badb` failed independent material-boundary review: its SQL gateway returned unfiltered current history and relied on a JavaScript filter; plain caller identity was injectable; delivery had no finite permission lease. Initial native run 34865775126 failed an inherited stale-revision assertion because its suite-start session expired. Its complete log is retained on evidence branch commit `49c8c12875dd07e8569205c24832ae059249f2f9`.

Test-only head `e2c16bd379bfaadd35e577ccaf1b09362979e36e` fixes that test with a fresh valid session (without changing the expected denial), and adds native readiness/query deadlines. Native run 34867294717 succeeded. This did not resolve the product review FAIL.

## Candidate trust split

A sealed proof-authority service owns only the new NOLOGIN proof-issuer capability. It internally validates the signed Auth context through the existing authenticator, checks the configured retained-prefix verifier under registration custody, and asks SQL to mint an opaque permit. No public verified-user UUID seam remains. The consume service owns only the new NOLOGIN history gateway. Neither role inherits the other or an owner role. The issuer never receives assessment payloads; the consumer cannot mint permits or select permit storage.

The private SQL permit binds source session, registration binding, incarnation, contract digest, source/stream/observation epochs, terminal capture/marker/LSN, exact sorted prefix IDs and digest, authenticated user, investigation, request, backend PID, transaction xid8 and finite expiry. SQL intersects the history inside its private definer boundary before any assessment crosses to the gateway. Admission stores the bounded payload; consumption rechecks native authority/current permissions and requires byte-equivalent JSONB payload. Changed disclosure fails closed. No source-wide attestation or unrelated investigation is returned.

Issuer and consume connections are distinct; a challenge reserves the consumer transaction without source locks, then issuance completes, then consumption acquires source/membership/material locks. Those locks and custody last through the awaited delivery callback. Production issuer authentication/transport and key/custody independence are **not configured or qualified**. Ordinary roles/SQL are not a defense against the database administrator.

## Finite delivery and rollback semantics

The maximum permit lease is ten seconds and is capped by the verified JWT expiration, source broker session/key/principal expiration, and retained material-permission expirations for available acceptance/reassessment/generation entries. The delivery timer deducts the full measured SQL roundtrip from native remaining time. Bounds: 256 captures, 512 prefix revisions, 128 returned entries, 1 MiB payload; exact envelope/payload keys and entry-key allowlist; statement/lock timeout five seconds, idle-in-transaction timeout fifteen seconds, total coordinator deadline thirty seconds.

The transaction adapter MUST reserve one authenticated backend and cancel/close/rollback it on AbortSignal. The delivery callback MUST honor AbortSignal and must not independently publish or perform irreversible work. The isolated psql fixture demonstrates cancellation/rollback, not production network delivery admission. A successful callback is a bounded authorization snapshot receipt, not a claim that permissions never change afterwards. Natural expiration aborts delivery even while revocation writes are blocked.

Consumption is atomic within PostgreSQL, **not globally nonrollbackable**. Rollback to a savepoint can consume again only in the same PID/xid, at the original expiry, returning the exact sealed payload and same delivery identity. It cannot include later revisions or change scope. New transactions/PIDs fail; committed consumption fails replay. The SQL layer cannot prevent a malicious authorized recipient from copying an already received payload. No external durable spend ledger or second delivery identity is claimed.

## Remaining gates and tests

All historical/source/user/publication qualification flags remain false. Arbitrary wall-clock history is unsupported. Clone/restore checks remain inherited native-identity tests, not production recovery qualification. Production real permission adapters, Auth provider/session freshness contract, independently protected custody, issuer/consumer runtime admission, cancellation transport, external boundary review and root reconciliation remain required.

Hosted adversarial tests cover direct prefix escape, alternate identities/investigations, role/ACL/owner/search-path catalog, same-transaction savepoint limitation, source/member/material revoke ordering, natural material/session/JWT expiry, hung callback rollback, strict response keys and parameter faults. Fixture-admin row copies and expiry edits are explicit synthetic fault injection; no production equivalence is claimed. New results must be attached to their exact commit; tests are not predeclared passed.

No live Supabase writes, migrations, deployment, merge, production credentials, user-device project files, real provider calls or publication.


## Rejected redesign syntax head

Root exact-read rejected `551bda27d5817d0be89fe1c46bfa1ad0462beb8b`: three new expiry helper function delimiters were reduced from SQL `$$` to `$` by JavaScript replacement-string interpolation. No native result from that head establishes this candidate. The follow-up restores literal paired delimiters using replacement callbacks; hosted validation remains mandatory. The generic SQL concurrency workflow does not install SQL023, so its success cannot detect this defect.
