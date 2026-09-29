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
