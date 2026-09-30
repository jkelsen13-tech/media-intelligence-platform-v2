# Saved-boundary sealed delivery: research-only FAIL for boundary admission

Base PR166: `406512127399e63e117f2a8e0b089f97579bd0d9`. Draft PR172 only. No deployment or live role admission.

## Preserved contrary evidence

Initial candidate `8b2a29ee88907751a16c4de8ca4fae0ae6f0badb` failed independent material-boundary review: its SQL gateway returned unfiltered current history and relied on a JavaScript filter; plain caller identity was injectable; delivery had no finite permission lease. Initial native run 34865775126 failed an inherited stale-revision assertion because its suite-start session expired. Its complete log is retained on evidence branch commit `49c8c12875dd07e8569205c24832ae059249f2f9`.

Test-only head `e2c16bd379bfaadd35e577ccaf1b09362979e36e` fixes that test with a fresh valid session (without changing the expected denial), and adds native readiness/query deadlines. Native run 34867294717 succeeded. This did not resolve the product review FAIL.

## Candidate trust split

A sealed proof-authority service owns only the new NOLOGIN proof-issuer capability. It internally validates the signed Auth context through the existing authenticator, checks the configured retained-prefix verifier under registration custody, and asks SQL to mint an opaque permit. No public verified-user UUID seam remains. The consume service owns only the new NOLOGIN history gateway. Neither role inherits the other or an owner role. The issuer never receives assessment payloads; the consumer cannot mint permits or select permit storage.

The private SQL permit binds source session, registration binding, incarnation, contract digest, source/stream/observation epochs, terminal capture/marker/LSN, exact sorted prefix IDs and digest, authenticated user, investigation, request, backend PID, transaction xid8 and finite expiry. SQL intersects the history inside its private definer boundary before any assessment crosses to the gateway. Admission stores the bounded payload; consumption rechecks native authority/current permissions and requires byte-equivalent JSONB payload. Changed disclosure fails closed. No source-wide attestation or unrelated investigation is returned.

Issuer and consume connections are distinct; a challenge reserves the consumer transaction without source locks, then issuance completes, then consumption acquires source/membership/material locks. Those locks and custody last through the awaited delivery callback. Production issuer authentication/transport and key/custody independence are **not configured or qualified**. Ordinary roles/SQL are not a defense against the database administrator.

## Finite delivery and rollback semantics

The SQL permit expiry is at most ten seconds and is capped by the verified JWT expiration, source broker session/key/principal expiration, and retained material-permission expirations for available acceptance/reassessment/generation entries. The callback receipt deadline deducts the full measured SQL roundtrip from native remaining time. These are returned-data/interface bounds, not end-to-end resource guarantees: 256 captures, 512 prefix revisions, 128 returned entries, 1 MiB payload; exact envelope/payload and status-specific entry keys/types, with the existing shared nested assessment validator plus explicit nested key checks; statement/lock timeout five seconds, idle-in-transaction timeout fifteen seconds, total coordinator deadline thirty seconds.

The transaction adapter MUST reserve one authenticated backend and cancel/close/rollback it on AbortSignal. The delivery callback MUST honor AbortSignal and must not independently publish or perform irreversible work. The isolated psql fixture exercises cooperative cancellation/rollback, not production network delivery admission. Absolute monotonic checks before and after the callback reject a success receipt after the deadline even if timer callbacks were stalled. They CANNOT prevent a synchronous callback or transport from transmitting after expiry during an event-loop stall, and cannot retract any earlier transmission. No arbitrary-delivery expiry guarantee is claimed.

Consumption is atomic within PostgreSQL, **not globally nonrollbackable**. Rollback to a savepoint can consume again only in the same PID/xid, at the original expiry, returning the exact sealed payload and same delivery identity. It cannot include later revisions or change scope. New transactions/PIDs fail; committed consumption fails replay. The SQL layer cannot prevent a malicious authorized recipient from copying an already received payload. No external durable spend ledger or second delivery identity is claimed.

## Remaining gates and tests

All historical/source/user/publication qualification flags remain false. Arbitrary wall-clock history is unsupported. Clone/restore checks remain inherited native-identity tests, not production recovery qualification. Production real permission adapters, Auth provider/session freshness contract, independently protected custody, issuer/consumer runtime admission, cancellation transport, external boundary review and root reconciliation remain required.

Hosted adversarial tests cover direct prefix escape, alternate identities/investigations, role/ACL/owner/search-path catalog, same-transaction savepoint limitation, source/member/material revoke ordering, natural material/session/JWT expiry, hung callback rollback, strict response keys and parameter faults. Fixture-admin row copies and expiry edits are explicit synthetic fault injection; no production equivalence is claimed. New results must be attached to their exact commit; tests are not predeclared passed.

No live Supabase writes, migrations, deployment, merge, production credentials, user-device project files, real provider calls or publication.


## Rejected redesign syntax head

Root exact-read rejected `551bda27d5817d0be89fe1c46bfa1ad0462beb8b`: three new expiry helper function delimiters were reduced from SQL `$$` to `$` by JavaScript replacement-string interpolation. No native result from that head establishes this candidate. The follow-up restores literal paired delimiters using replacement callbacks; hosted validation remains mandatory. The generic SQL concurrency workflow does not install SQL023, so its success cannot detect this defect.

## Independent f26c FAIL and bounded follow-up

Exact head `f26c59bd5a34bcb0c1b1aefdc6b7476920f0bb1b`, native run34869847462/job104062740733: 115 tests,110 passed,5 failed including three parent aggregates. Five new groups passed (prefix boundary, Auth, ACL, savepoint, hung callback). The material wait asserted the custody PID although the consumer owns the material publication lock. The corrected test observes the consumer PID, matching operation_check's transaction-scoped publication fence; the new result is still pending. The short JWT expired at the second Auth check before admission, so no delivery occurred. A deterministic expired-token test now requires that fail-closed denial; it is not claimed as delivery-expiry coverage. Existing material/session cooperative-expiry tests remain.

The full f26c failure is preserved at evidence branch commit `41e11b62962d6cfd95225f483b88c27b3a0e88a4`, path `verifier/pr172-evidence/native-f26c-failed-34869847462.log`. The independent exact-head review remains FAIL for boundary admission even if the bounded follow-up tests pass.

### Explicit unresolved resource and custody blockers

- The private SQL gateway filters before returning data to the consume role, but its underlying history reader materializes the full current investigation history BEFORE that filter and size check. Returned payload limits do not bound that intermediate computation/memory.
- The issuer interface does not enforce cancellation/timeout independently of its supplied transport. The thirty-second AbortSignal is not an end-to-end guarantee. The final cleanup awaits work and can wait indefinitely if an adapter ignores cancellation.
- Immutable full-payload permit records accumulate with no implemented quota, expiry cleanup, retention policy or independently approved storage custodian. Short permit expiry does not remove retained sensitive data.
- JavaScript monotonic receipt checks are not a transport-safe delivery fence during synchronous stalls. A separately admitted cancellable transport is still required.

This bounded follow-up does not redesign those systems or qualify production independence. It adds precise response validation, omission/type/nested adversaries and a synchronous-stall no-success-receipt test, while preserving the unresolved FAIL and all false admission/publication flags. No schema redesign, live database action or new production authority is included.
