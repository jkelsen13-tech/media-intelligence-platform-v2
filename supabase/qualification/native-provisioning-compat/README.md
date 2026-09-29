# Sealed auditor custodian — disposable candidate proof only

This new-file fixture explores PostgreSQL 17 auditor lifecycle with a sealed NOLOGIN custodian and a narrowly callable protected-owner cleanup helper. It is **not** an integrated production profile. Existing zero-membership auditor contracts, qualification receipts, installation source, and owner approvals are unchanged.

Run only inside the separately approved, loopback-only disposable Supabase PostgreSQL 17.6 harness:

```
MIP_CUSTODIAN_LIFECYCLE_ARM=synthetic-pg17-local-only
MIP_DISPOSABLE_POSTGRES=qik-persistent-install
node --test supabase/qualification/native-provisioning-compat/auditorLifecycle.test.mjs
```

The harness securely injects MIP_COMPAT_ADMIN_PASSWORD for the disposable supabase_admin setup/cleanup principal and MIP_COMPAT_CUSTOMER_PASSWORD for the real nonsuper postgres customer. The test never accepts a hosted URL. Auditor passwords are generated in memory, converted to SCRAM verifiers before SQL, and never emitted. All ordinary lifecycle operations use authenticated nonsuper connections; only fixture teardown uses provider superuser authority.

Coverage sought, not yet established until an exact remote result exists:
- rollback of temporary creation, sealed custodian and protected owner after issuer removal;
- real distinct auditor connections, installer and auditor inability to SET protected roles or self-grant;
- auditor self-password rotation, old-password denial, no installer reset capability;
- narrow NOLOGIN revocation, existing-session limitation, and fresh-login denial;
- installed-policy dependency refusing auditor DROP;
- explicit candidate protected-owner helper removing only the synthetic policy and INSERT grant;
- idempotent cleanup of the same auditor, followed by provider-owned disposable teardown and no fixture roles/schema remaining.

Limitations are intentional and must not be reported as production success:
- Both current production auditors reject these retained custodian ADMIN edges. Source successor and fresh applicable review are required.
- The real protected-owner cleanup helper does not exist; this fixture's helper is new candidate behavior, not permission to change the existing contract.
- NOLOGIN does not terminate existing sessions. The fixture closes its owned auditor session before DROP. An operating revocation path needs explicit session and pool handling.
- Final removal of the sealed custodian itself needs separate provider authority; the fixture's provider teardown proves owned disposable cleanup only.
- The helper names are fixed synthetic names; this is a semantic proof, not a reviewed production OID/operation-bound compiler.
- Secure generated-password persistence to GitHub is a separate unresolved route. This fixture creates no production credentials and stores no secrets.


## Later managed-image finding and explicit successor

The retained sealed-custodian fixture failed on the actual managed-image
qualification: run 36508367360/job 109214819651 stopped at identity denial;
diagnostic run 36508584477/job 109215490523 established that trusted customer
postgres could ALTER ROLE mip_lcp_audit PASSWORD NULL even without ADMIN.
These failures are preserved; the old test is not relaxed or declared passing.

Supautils v3.4.0's ALTER ROLE hook elevates the configured privileged role for
non-reserved, non-privileged targets (except SUPERUSER option changes).
The original atomicInstall audit boundary already treats installer and true
superusers as trusted administration. The stronger custodian password-reset
immunity assumption was not that original independent-auditor requirement.

After an explicit owner decision accepting trusted-installer ADMIN edges for
both restricted auditors, trustedInstallerAuditorLifecycle.test.mjs is the
separate proposed lifecycle proof. It acknowledges and transactionally
demonstrates ADMIN self-grant/SET capability; it never labels ADMIN-only
membership an isolation boundary. The old production zero-edge predicates
remain unchanged and require an explicit reviewed successor before use.

Run this new file with the same disposable environment/guard configuration.
It additionally proves wrong-password rejection against the configured
loopback SCRAM rule before interpreting rotation results. Real distinct
auditor sessions must lack installer and provider-privileged authority.
Customer postgres performs rotation, NOLOGIN, exact owned-session termination,
dependency cleanup through a candidate fixed protected-owner helper, and
auditor DROP with exact retries. It does not claim production secure storage
or an already integrated installed helper.

The separate protected owner remains outside customer ADMIN. Provider-only
final harness cleanup is labeled and verifies the original role baseline.
This proof does not authorize or claim production protected-owner retirement,
predecessor deletion, actual material processing, or installation.

## Managed prerequisite successor — held, not hosted

The separate secure delivery canary passed run 36510586597, job 109221577048,
at source 76e96de8a9589cf87287455aea9e7c828ecfd3ff. It used the owned disposable
Supabase PG17 image with managed logging defaults and scanned actual server
logs and pg_stat_statements without returning either. This evidence covers
that synthetic bound-SCRAM delivery proof; it is not a hosted provisioning receipt.

The new provision.mjs composes two fixed restricted auditor logins, explicit
trusted postgres ADMIN membership, and provider-owned dblink 1.2 isolated in
installer-only mip_factual_transport_raw. Creation, extension isolation and
one immutable metadata receipt commit together under the existing install
advisory/table locks. Its config supplies the exact prerequisite operation,
C3 operation/manifest and managed profile; no replacement operation is generated.
The receipt contains role/edge/catalog identities and nonsecret configuration
hash only. Authentication is separately verified with both secure bindings.
An unknown COMMIT acknowledgment requires reconciliation of the same operation;
this component never rotates credentials or retries an uncertain operation.

The trusted managed installer must match observed provider attributes, including
REPLICATION and effective USAGE of supabase_privileged_role. Auditors remain
NOREPLICATION, NOINHERIT and without runtime authority. Client TLS must be
verified even when a session pooler uses a separate backend transport.

run.mjs and .github/workflows/qik-managed-prerequisites-held.yml are a held,
manual-only route with exact approved release/checkout identity, code pins,
configuration digest, pinned public CA, shared installer concurrency and
existing resource admission. Secure environment bindings enter only its final
step. No artifact, cache, actual article, runtime activation or publication
route exists. Source presence does not register or authorize dispatch.

provision.test.mjs is a disposable actual-component proof with synthetic C3
metadata stand-ins; host.test.mjs proves early host refusal and source binding.
These new component/host tests have no completed receipt recorded here yet.
Applicable fresh review and qualification remain required before provisioning.
Production cleanup, auditor retirement and installed protected-owner lifecycle
must follow the separately integrated exact-operation contracts; disposable
provider teardown is not customer retirement authority.

## Managed integration and credential phase boundary (successor)

The owner explicitly approved trusted-installer ADMIN in this successor;
this is not isolation from postgres. Provider-owned raw dblink objects remain
behind an installer-only schema. Independent metadata audit directly checks
the same managed installer identity and role attributes as SQL currentness.

Post-install credential rotation is **unsupported in this installation phase**.
The prerequisite host refuses both provision and reconcile once installation
or activation schemas exist; it never treats a changed secure binding as
permission to alter an existing database password. The combined fixture must
prove this refusal leaves the stored audit connection unchanged.

Credential consumers are distinct: provision.mjs authenticates the two initial
bindings; atomicInstall.mjs stores the autonomous URI in the protected
mip_factual.audit_connection row; log_rejection uses that row for server-side
dblink; audit.mjs uses the independent metadata binding directly; held hosts
receive the corresponding environment bindings. Terminal retirement removes
only authorized policy/ACL dependencies and roles, and is not rotation.

An operating maintenance procedure would have to coordinate the database
password, protected stored URI, secure host bindings, quiescence/owned sessions,
uncertain outcomes and fresh autonomous verification. No such post-install
procedure is claimed by the standalone role-lifecycle fixture. Do not alter
any real binding/password or route under that narrower evidence. If maintenance
is needed before a qualified procedure exists, hold the affected operation.

qualifyComparisonAudit's initial audit_probe(true), outer rollback and
audit_probe(false) readback prove autonomous persistence in that invocation.
Its existing-receipt shortcut is historical qualification, **not a fresh
connection test**, and must never be reused as connection proof after a
credential or route change. A transport probe alone is not publication-guard
coverage. Hosted proof remains absent until exact installation prerequisites
and actual server-side TLS/authentication and rejected-publication checks pass.

The current combined fixture and real host source-gate tests are under targeted
qualification. Passing source checks or authored fixtures do not establish
hosted installation, activation, full operating lifecycle or publication.

## Explicit narrow session-lock successor — 2026-09-29 owner amendment

New selection `supabase-managed-solo-session-lock-v1` preserves both older
profiles and source SQL bytes. It replaces only the exact Auth row read/lock in
012 and native caller admission; the surrounding EFTA policies, identities,
receipts, reader and authorization functions retain restricted owners.
Customer postgres uses existing SELECT and UPDATE(id), with NO UPDATE grant
option and no Auth-owner SET path. It installs two fixed postgres-owned,
VOLATILE/PARALLEL UNSAFE/SECURITY DEFINER SQL-standard functions in private
mip_auth_session_lock in the same joint transaction as CREATE/REVOKE/GRANT.
Only the protected NOLOGIN session owner gets schema USAGE and EXECUTE; no new
Auth-column access or postgres membership is given to that owner/runtime.

key_share returns only a boolean for the exact subject/session with FOR KEY SHARE.
share returns only the locked nullable expiry, zero rows when absent, with FOR SHARE;
the original wrapper preserves pre/post-lock token and session expiry checks.
Locks stay in the caller transaction. KEY SHARE allows concurrent non-key
expiry updates exactly as the original EFTA path; it is not SHARE and must not
be described as providing session-expiry linearization. Native SHARE blocks
expiry updates until the transaction completes. No DML, arbitrary SQL, lock-mode
parameter, cached response, separate connection or Auth row/token result.

Independent catalog boundary checks owner, signature, exact canonical parsed
SQL body, SQL language, volatility/security/config, dependency on auth.sessions,
effective runtime ACLs, absence of protected-role Auth grants/memberships and
absence of broader postgres paths. Activation catalog hash also binds all new
objects; the independent auditor uses fixed source SQL, never a helper claim.
Old provider delegation prerequisite stays with older profiles. This successor
requires existing installer lock privilege and the exact helper after creation.

Managed combined fixture must not supply UPDATE WITH GRANT OPTION. Customer
installs helpers through actual joint installation. Provider prepares only
representative infrastructure and owned synthetic Auth rows/test wrappers.
Coordinated real transactions inspect actual blocking PIDs, then release/commit
and verify final outcomes; a timeout alone is not a lock proof.
Nested test wrapper isolates EFTA session-owner context, not a replacement for
its surrounding policy/receipt machinery. Actual native assert_session is tested.
Fixture-only DML/connection failure tests never run on live qik sessions.

State: AUTHORED / NOT YET QUALIFIED OR REVIEWED / NOT HOSTED.
Existing 7c combined qualification and review retain their narrower historical
scope, and do not qualify this amendment. No hosted operation/release promoted,
credential change, support duplication, material transfer or publication.
