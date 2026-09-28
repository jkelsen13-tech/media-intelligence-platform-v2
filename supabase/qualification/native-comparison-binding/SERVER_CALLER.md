# Closed server caller for native/comparison bindings

Source authored, NOT RUN. This is a server-only consumer of the existing private SQL contract, not a service, credential loader, browser endpoint, publication action or SQL installer.

## Dependency and installation order

Base source:77772ac151df65752f09b4f8f0d31d50026dd629, treec8830db56affb34bf03f299120ea02c2e01eec99. The parent's binding SQL repair/qualification remains separate. Install and qualify the selected v4 backend/native/private/binding SQL and effective ACL closure before using this caller. Preserve the parent's repaired additive immutable-trigger assertion; this module does not read or replace SQL files.

The module imports the existing authenticated transport:
- `../collector-native-capture/authenticatedPgDriver.mjs`, blob `af0f3b69c34695f9241934fae89ac00cedd08515`.
- Its logging guard `credentialDelivery.mjs`, blob `354679fadc48eb9f8a8154456f3d38e7faab3e61`.
- Existing `pg` dependency; intended Node22.14.0 environment. No additional package.

The host supplies connection options through ordinary server memory. No environment credential lookup, file credential read, session issuance, durable journal, logging or transmission outside the supplied database connection occurs. Only the disposable safety flag reads an environment variable. TLS validation, exact qik direct/session-pooler target and logging checks remain in the existing driver. Its one pre-SQL pooler-password-cache retry is unchanged; it does not replay a binding operation.

## API and strict input

`callNativeComparisonBinding({connection,request})` accepts exactly these connection keys:
```js
{
 connectionString, expectedLogin,
 sessionPoolerHost: null, // or exact existing aws-0-us-west-1.pooler.supabase.com
 disposable: false
}
```
Database must be `/postgres`. No `effectiveRole`, custom SSL override, SQL callback or arbitrary client is accepted. The real authenticated session must inherit only `mip_mentions_gateway` beyond itself; collector, worker, service/owner or other role memberships are refused. Database membership/can_decide checks remain authoritative per operation. No SET ROLE is performed.

Admission:
```js
{
 action:'admit',scope,binding_id,projection_id,dependency_hash,display_hash,
 private_review_id,release_request,event_id,
 native_generation_id,comparison_generation_id,
 broker:{session,runtime}
}
```
Current read:
```js
{
 action:'read',scope,binding_id,manifest_hash,
 native_generation_id,comparison_generation_id,
 broker:{session,runtime}
}
```
Local revocation:
```js
{action:'revoke',scope,binding_id}
```
Revocation follows the SQL contract: native can_decide may revoke a stale binding without obtaining a publisher session or first making its sources readable. It does not confer publication authority. All UUIDs and SHA256 values must be canonical lowercase strings. Separately named native/comparison generation IDs are required for admission/read receipt verification. Equal UUID values are valid across these distinct namespaces; value equality does not make the identities equivalent. Unknown/extra/nested input keys refuse before connecting.

Dispatch contains only the three fixed parameterized binding calls: `admit`, `read_current`, `revoke_binding`. Admission/read broker session/runtime stay transient. The caller neither guesses them nor obtains a new session. Every attempt uses the actual authenticated driver, principal check, READ COMMITTED transaction and the driver's existing1000ms statement bound. Expensive real routes may refuse; this source does not silently relax that bound.

## Receipt and outcome semantics

SQL receipts accept exactly:
`contract,scope,binding_id,manifest_hash,native_generation_id,comparison_generation_id,state,publication_allowed,attachment_allowed`.

Contract must be `native-comparison-binding-receipt-v1`; state `bound_private`; both action flags false. Scope/binding/two generation IDs must match the supplied identities; reads must match the supplied manifest hash. Extra keys or invalid flags fail closed before COMMIT. No unknown source values are returned.

The caller result has exactly:
`state,receipt,needs_reconciliation,connection_closed,diagnostics,reconciliation_identity,publication_allowed,attachment_allowed`.

- `current_binding_confirmed`: transaction acknowledged, or an uncertain prior commit was followed by a successful fresh authenticated current read of the exact original binding/hash/generations.
- `revoked_private`: revocation COMMIT acknowledged.
- `committed_cleanup_unresolved`: COMMIT acknowledged but connection close failed; retain the verified receipt and report cleanup uncertainty.
- `operation_refused`: no COMMIT attempted, rollback/close were verified where needed.
- `outcome_unknown`: commit/rollback/cleanup or fresh-read outcome remains uncertain. This never means missing/revoked/not committed.

`receipt` is null for unknown outcomes. If a validated admission/read receipt was obtained before uncertainty, `reconciliation_identity` retains only scope,binding_id,manifest_hash,native_generation_id,comparison_generation_id. It is an exact future read target, not current acceptance. No broker session/runtime is included. The host may later supply a fresh authorized broker session to a new explicit `read` request against this same identity.

The caller never chooses a new binding ID or looks up latest generations. Exact explicit admission retries use the same caller-supplied original IDs. After a lost COMMIT acknowledgement it closes the original connection, then makes at most one new authenticated current-read transaction using the validated original manifest hash. It never automatically repeats admission. A refused/revoked/stale read remains unknown; it does not prove absence or undo the original write. If original close cannot be verified, it does not open another connection.

Ambiguous revocation cannot be established from a read failure, so it remains unknown without an automatic retry. An explicit subsequent same-ID revocation is idempotent at the SQL boundary.

Diagnostics are fixed stage codes only. Primary, rollback and close failures are independently retained. No driver message, SQLSTATE payload, detail, context, causes, options, arguments or source text is propagated. The shared driver hides cleanup outcomes on connection failure; therefore this caller reports `connection_cleanup_unverified` instead of claiming closure.

## Qualification source and remaining route

`node --test tests/nativeComparisonServerCaller.test.mjs` is an authored synthetic Node contract test. It mocks `pg.Client` methods while exercising the real imported driver checks and the caller's fixed dispatch. It is NOT actual PostgreSQL, broker or operational-host qualification. Thirteen tests cover strict shapes/role refusal/receipt allowlist, real dispatch parameter identity, ambiguous-commit fresh reads, stale read refusal, bounded attempts, independent cleanup diagnostics, opaque driver cleanup, exact read identities and revocation uncertainty.

For an actual PG fixture, use the already authorized dedicated synthetic route and two real accepted generations. Supply a real gateway reviewer login, current scope membership and broker session through the fixture; no SQL callback seam is exposed by this module. Parent owns that integration and execution. Run logging guards and full v4 boundary checks after actual installation cleanup before activating fixture-only logins. This caller creates no schema/role/data fixtures and performs no installation.

Actual qik connection availability, configured reviewer principal/membership, trusted publisher session delivery, installed source pins/effective ACLs, timeout/capacity qualification and applicable external review remain unobserved. No public UI connection or public eligibility is claimed. Required public/caller work remains separate; do not import this module into Vite/browser code or reuse the collection-only operational credential.
