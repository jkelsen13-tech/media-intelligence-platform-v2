# Native governed activation successor — authored, not qualified

This is a separate permission profile over the unchanged selected native v6 SQL program. It is not installed or activated. No test or SQL execution was performed by this author. It grants no publication, automatic membership approval, reuse eligibility or material-transfer proof. The complete source candidate is pinned by verifier/qik-native-activation-successor.json; the parent must bind that manifest to the actual candidate commit/tree before qualification.

## Identity and authorization

The original native_program_sha256 identifies unchanged native SQL source steps. The new successor_program_sha256 identifies compiled 001_profile.sql. Neither identifies changed JavaScript orchestration. The manifest separately pins the changed native installer, atomic installer, new modules, unchanged transitive runtime modules, lockfile, and concrete fixtures. The unit suite checks each exact UTF8 Git blob. Install manifest hashing incorporates the complete prepared backend/native/profile SQL plan.

Select activationProfile=native-governed-activation-v1 with nativeMode=native-governed-v6 and authorization=owner-authorized-native-governed-activation-bootstrap-install. Provide expectedLogin, operationId and an existing, separate expectedMetadataAuditor. prepareAtomicInstall returns the exact manifest, native program and activation program hashes; the reviewed host supplies all three expected values to installComparisonAtomic. No arbitrary issuer, SQL callback or waiver is accepted.

Use the exports in qik-comparison-adapter/atomicInstall.mjs: prepareAtomicInstall, installComparisonAtomic, reconcileComparisonInstall and qualifyComparisonAudit. The existing v2–v6 optionless activation paths, compiled SQL plans and historical assertions remain unchanged. An old v6 authorization string does not authorize the new bootstrap option.

The existing native-governed-host adapter pins the earlier JS blobs and rejects the extra configuration. It is intentionally not an operational route for this candidate. The separate host.mjs/run.mjs successor now binds those exact APIs and sourceVault blobs, with distinct installer, original autonomous-audit and independent metadata-audit credentials. It accepts install/reconcile/audit only, never activation or material reads. The existing old held host remains separate and cannot run this candidate. Secure configuration and actual hosted execution are not available or claimed.

## Exact bootstrap lifecycle

The installer remains its established genuine nonsuper CREATEROLE/CREATEDB/BYPASSRLS principal. A new operation-bound mip_agi_<operationId> NOLOGIN issuer is temporary CREATEROLE solely while creating these three non-owner API groups: mip_comparison_worker_v1, mip_identity_broker_v2 and mip_arc_native_worker. Their fixed CREATE statements match the selected source. They are created at the original stages, before the original conditional CREATE or exact native CREATE executes, so there is no duplicate/preflight collision. The ordinary temporary creators never create those groups.

The issuer then becomes NOCREATEROLE/NOCREATEDB/NOINHERIT/NOBYPASSRLS/NOSUPERUSER/NOREPLICATION, owns no objects and holds no direct ACL. The installer retains the issuer's automatic ADMIN-only creation edge plus one explicit ADMIN=false/INHERIT=false/SET=true edge. The issuer retains only the three automatic ADMIN=true/INHERIT=false/SET=false creation edges. The original two caller groups retain their original installer ADMIN-only edges. Creation-time role/member/grantor OIDs and flags are captured immediately; all seven retained edges are later checked exactly.

Neither installer nor issuer inherits or can SET any of the five operational groups or protected owners after creator cleanup. The explicit installer SET path reaches only the non-owner issuer. It does not restore a historical owner lease. PostgreSQL17 CREATEROLE alone is not assumed to grant an existing group, and implicit bootstrap-granted ADMIN edges are never assumed revocable by their creator.

Every native source body, including ownership/permission/RLS writes, executes outside the historical checkpoint. Immediately before each original assertion helper, the caller takes SAVEPOINT native_boundary, drops the issuer, cleans the native creator, runs the unchanged assertion, then rolls back and releases that savepoint. This restores only the then-required temporary installation topology; it does not roll back source writes.

The source-pinned assertion tails are:

| Native source | Blob | Assertion-only split |
| --- | --- | --- |
| entity-resolution/native-capture-fields/003_native_fields.sql | ffc192276276cea2345690bccc7b65d54a0f0ab6 | do $assert$ |
| entity-resolution/candidate-review/004_candidate_review.sql | e25930fb4552b7b0086d7d1c50414845df453dbc | do $boundary$ |
| arc-membership-qik-source/001_storage.sql | fc321af39e982e0cb1f06238c81f99d2dcc6fe8a | do $assert$ |
| entity-resolution/canonical-admission/005_canonical_admission.sql | b6487f76f4186a58e7f77d50eecca0a40fd76c27 | do $boundary$ |
| arc-membership-qik-source/002_governed_writer.sql | 7cac6a7cb8ab665886944bf5092edcf01a60cf3f | do $boundary$ |
| arc-membership-native/001_governed_cohort.sql | 3097d03987aee00df912f913d41c6e0cad342b2d | do $final$ |
| arc-membership-native/002_private_score_review.sql | 92c4382b46c83027f4b9b1dd0a615462680083cd | do $final$ |
| arc-membership-native/003_governed_attachment.sql | 94dd9c7cbcf117767f5909fd9a6db0312f14ebe2 | do $boundary$ |
| arc-public-projection/001_native_private_projection.sql | bc58ef8143fdea209bdf91ad9edfb6e96a089657 | do $private_projection_final$ |
| native-comparison-binding/001_private_binding.sql | 7bd78e703b1a81414e3a24b4049ea407d00435c8 | do $native_comparison_final$ |
| native-comparison-display/001_private_display.sql | 6602515e55fe7cb70bba1e505a2d3e21b94398e5 | do $native_display_final$ |
| native-comparison-caller/001_admission.sql | a9428d8b2120514a0d6ee13a53d801dba7b6e060 | do $native_caller_final$ |

The last three remain the original deferred combined verifier chain. Existing caller prerequisite handling and all assertion hashes are unchanged. New preparation helpers are created only while original owner leases still exist, then their schema CREATE/USAGE is revoked. The original native creator and original outer creator are subsequently removed for real.

Only after both genuine creator removals, SAVEPOINT successor_historical_final drops the non-owner issuer and runs the existing residual-membership assertion, autonomous-audit boundary, inspection checks, original019 final_native_permissions/final_retention_chain_permissions, original020 final_doj_permissions, compatibility assertions and complete original fixed v6 verifier. Original019 blob df829634068d4b113862da3f4ba877ccc6cc72b7 and original020 blob 0e0b3d2f3ae200b551b98ce66bc3c90d277ff333 remain intact. Their permission-creation bodies execute earlier, outside this checkpoint.

Rollback restores only the scoped issuer and its exact bootstrap paths, not either creator. sealActivationBootstrapInTransaction independently validates the actual final successor topology, required effective APIs, safe role attributes, no owner access, helper ACL/configuration, and a complete logical non-system catalog hash. It links an immutable bootstrap receipt to the original installation receipt/program before the single COMMIT.

## Two-phase operational provisioning

The installation creates no runtime LOGIN, Auth identity/session, mapping/key approval, scope authority or admission. The trusted host supplies exactly five distinct existing safe bare runtime LOGINS with exact group/member OIDs, one per group. Each runtime has NOINHERIT and no direct ACL, owned object, incoming membership or unrelated outgoing membership. Grants explicitly carry ADMIN=false/INHERIT=true/SET=false.

Call transitionNativeActivation from activation.mjs with authorization=owner-authorized-native-governed-permission-transition and the reviewed install/native/successor hashes. A pending revision requires an actual current Auth session and existing scoped admin can_decide plus gateway/native-worker scoped memberships. It grants only admin, gateway and broker memberships. Native-score and comparison-worker memberships remain absent.

The real broker LOGIN can then call the existing configuration/issue APIs to obtain distinct publisher and comparison-worker sessions. The real admin LOGIN calls the existing configure_admission API under existing scoped authority. Missing hosted identities, Auth authority, mappings, keys or scope authority must be supplied through their established governed processes, not invented by this profile.

The active successor rechecks current admission revision/expiry/gateway, the two broker mapping/key/session chains, actual live Auth, source/evaluated-implementation authority and all seven worker RPC bindings. It installs the remaining two memberships transactionally. Its successful receipt says runtime_memberships_active, never operating success. Existing APIs still enforce native binding, accepted material and other per-operation authorization. No accepted binding or captured material is fabricated or attested by this permission profile.

Revisions are append-only with versioned predecessor CAS and immutable request digest. Exact retries succeed only for the current head and rerun current authority checks. A superseded revision refuses. The request carries transient session UUIDs but new durable activation revisions retain only their hashes. Original broker/admission APIs retain their existing original representations; this module adds no second session/token store.

reconcileNativeActivation takes the exact original request and revalidates current catalog/topology/authority through a fresh genuine installer session. A lost COMMIT acknowledgement yields commit_outcome_unknown and no automatic retry or rollback claim. Close/rollback uncertainty withholds current-success and requires reconciliation.

disabled_bootstrap revokes all five runtime memberships with their exact grantors, appends a successor revision and asserts the successor disabled state. It works after Auth/admission/broker revocation or partial external removal of expected runtime edges. It does not reacquire any owner or automatically repair altered schema/ACL/role identity. Unexpected extra rights or catalog drift still refuse and need separate governed repair. After deactivation, the restored bootstrap issuer means old v6/019 still refuse.

## Independent final metadata audit

auditNativeActivationMetadata from audit.mjs authenticates the supplied distinct metadata auditor. It runs a read-only transaction and an independently source-defined direct catalog query. It verifies role/member/grantor OIDs and flags, protected-owner zero edges, issuer and runtime effective rights, unchanged catalog owners/ACLs/RLS/configuration/source, and the expected receipt/program identities.

The auditor has only new-schema USAGE, bootstrap/head SELECT and explicit non-authority revision-column SELECT. It has no installer membership, SET path, CREATEROLE, raw Auth/capture read or function EXECUTE. This reader returns permission_boundary_current only after actual independent verification and cleanup; authority_current remains false because it never reads sensitive Auth or broker material. It complements the transition's current authority assertion. The original fixed metadata auditor is a historical checkpoint reader and must continue refusing the final successor topology.

## Qualification and cleanup

The manifest gives exact commands. The new armed test is in nativeGovernedInstallerPostgres17.test.mjs, selected by the name “successor concrete”. It prepares the complete real backend fixture, creates only synthetic control accounts/metadata, invokes the actual nonsuper installer, then uses separate real LOGIN connections for pending, broker issuance, admission configuration, active, fresh reconciliation, lost-ack reconciliation, actual admission revocation, partial membership revocation, deactivation and independent audit denial checks. NativeGovernedActivationPostgres17.test.mjs is its assertion module, not a dependency on an unspecified preinstalled database.

The fixture refuses any nonpristine or non-17.6 cluster, requires all explicit synthetic guards, pins vector0.8.2, and restores the cluster/role baseline even after a partial failure. Runtime member roles are dropped before the issuer so issuer-issued grants cannot block cleanup. No production cluster is a valid test target.

Run the original five v2–v6 joint fixtures independently with their existing guard to prove regression coverage; do not mark them as passed from source inspection. The parent-reported four-test PG17 scoped-issuer probe proves only the narrow automatic-grant/drop/rollback semantics, not this application profile. Full successor tests, parent source inspection and required selective external review remain pending. Actual qik secure identities/credentials, host integration, installation, activation and operating acceptance remain separate gates.


## Parent-integrated source/metadata executor

run.mjs is a fixed Node22.14.0 entrypoint for the existing protected qik-forward-controlled GitHub environment. It verifies an exact approved release, clean source, original ancestry, the complete source manifest digest and every listed Git blob, exact sourceVault paths/refs, pinned qik CA and existing budget/host admission before any database call. It rejects rerun attempts and diagnostic/credential-logging switches. Credentials are removed from the inherited environment; source-only git subprocesses receive only a minimal noncredential environment. Receipts never serialize connections or raw errors.

host.mjs validates the exact qik target and distinct installer/audit/metadata-auditor identities. It reconciles before any first installation and refuses automatic replay of uncertain or existing outcomes. The audit action requires both original autonomous audit qualification and the independently authenticated final successor metadata audit; neither alone qualifies the host. The concrete ordered PG fixture exercises that composed audit with actual API implementations. Eight source unit groups cover denial, mismatched receipts, uncertain cleanup and secret redaction.

Required protected secure bindings: QIK_NATIVE_INSTALLER_DATABASE_URL, QIK_NATIVE_AUDIT_DATABASE_URL, QIK_NATIVE_METADATA_AUDIT_DATABASE_URL. Required nonsecret reviewed controls: QIK_APPROVED_RELEASE_SHA, QIK_NATIVE_ACTIVATION_CONFIG_JSON, QIK_NATIVE_ACTIVATION_MANIFEST_SHA256, QIK_CA_PEM_BASE64, QIK_NATIVE_ACTIVATION_HOST_ADMISSION and existing QIK_NATIVE_INSTALL_BUDGET_ADMISSION. The configuration exact fields are listed in host.mjs; expectedManifestSha256 must be obtained from the complete successor plan, not the old v6 plan. Metadata audit URL is the restricted auditor, with no query options, authenticated TLS/CA delivery; the old autonomous audit URL retains its existing verify-full requirements.

Proposed invocation in that existing protected remote route: node supabase/qualification/native-governed-activation/run.mjs, with fixed workflow-dispatch admission and reviewed config. NOT RUN. No new execution service, storage receiver or actual-material path is introduced by this metadata-only host. Activation provisioning and later transition use the separately named existing governed APIs and are not performed by this entrypoint. All source qualification commands above remain NOT RUN until actual parent receipts say otherwise.


## Consequential qualification repair — pending recheck

The first combined remote synthetic qualification at ca29c00b0917c86a9e699565c10ccac67afab25e (run 36464832257, job 109072172761) failed: 51 source checks passed; the original/new ordered PostgreSQL suite reported 49 pass / 7 fail; two atomic PostgreSQL checks passed; owned container/volume cleanup succeeded. The source-clean verification step was skipped after failure. This is not an installation or acceptance receipt.

The repair preserves the original null native plan for v2/v3 reconciliation (`plan?.activation`) and parenthesizes both PL/pgSQL IF/CASE storage-privilege expressions. The preparation, host runtime and successor allowlist pins are synchronized. These repairs are NOT RUN until the next exact candidate receipt. No assertion, effective permission requirement or historical evidence was relaxed.

The repaired candidate f89c1d8b243e580140f0e4736d30075f347f2236 (run36466067286/job109076341316) restored all original v2–v6 checks:55 ordered PostgreSQL PASS, with51 source checks and2 atomic PostgreSQL checks passing. The new successor still refused before lifecycle assertions with SQLSTATE21000 at successor_final_boundary. Cleanup passed; final source-clean step was skipped. The new defect is PL/pgSQL FOREACH consuming ARRAY as grammar instead of a SQL array constructor. `IN ARRAY ARRAY(SELECT oid …)` retains the complete five-group loop. SQL, preparation, host and allowlist pins are synchronized again; this second repair is NOT RUN.

The second repaired combined candidate7d07eb03cffc148aad94588d45b1dba92a934dcd (run36466906536/nativejob109079158368) passed51 source checks,55 original ordered PostgreSQL checks and2 atomic PostgreSQL checks. The new successor installed disabled, reconciled and qualified its autonomous base audit, but the composed independent metadata audit refused; its lifecycle tests were not reached. Owned cleanup passed; final source-clean verification was skipped. The standalone full method-worker job is separate and must not be attributed to this native result.

The independent auditor now sets the same empty local search_path as the installed catalog_hash function: regproc catalog JSON must use identical visibility-dependent representations. All queries, role/ACL/RLS/hash/identity assertions remain. Failure returns only a static phase and validated SQLSTATE, with independently bounded cleanup phase/SQLSTATE. The concrete fixture now directly checks the real metadata auditor before the full host composition and retains only those sanitized failure fields. This audit/fixture repair is NOT RUN until its next exact qualification receipt. Hash meanings and historical assertions are unchanged.

The direct independent audit at3376fa53e8ee5b715d57f21b46e72bb8b5634a76 (run36467783328/job109084632683) refused with static phase auditor_identity, SQLSTATE42809 and verified connection cleanup. The51 source/original55 PostgreSQL/2 atomic checks again passed; new successor lifecycle was not reached. Outer cleanup passed and final source-clean step was skipped. Boolean SQL predicate ordering could evaluate sequence/table/column privilege calls for the wrong object type. Type-specific CASE guards now enforce valid inputs while preserving every object/privilege assertion. This repair is AUTHORED — NOT RUN; no failure is waived.


The type-safe audit candidate13ebf786fbd1a296c4f56d7d07bc9cda41802d45 (run36469939409/nativejob109089348043) passed51 source checks,58 ordered PostgreSQL checks and2 atomic checks, with9 ordered failures. The direct independently authenticated metadata audit and composed host audit now pass. The first consequential failure is the pending transition returning unverified; later lifecycle failures depend on that absent pending state. Owned container/volume cleanup passed; final source-clean verification was skipped. No qik installation or activation is established.

Transition failure diagnostics are now bounded to a fixed internal phase and a validated five-character SQLSTATE. The first pending assertion exposes only state, phase, SQLSTATE, transaction/currentness and cleanup fields. It cannot serialize raw error messages, details, queries, stack, authority, sessions or credentials. Existing permissions, time limits and authority checks remain unchanged. This diagnostic candidate and its redaction checks are AUTHORED — NOT RUN until the next exact qualification receipt.


The diagnostic candidatef3b9f2bdd24e44b3f98f8371a37d308f4fb7248e (run36471380059/job109094202914) passed53 source checks,58 ordered PostgreSQL checks and2 atomic checks, with9 ordered failures. The first pending transition returned static phase transition/SQLSTATE42501/not_committed with verified connection cleanup. Outer cleanup passed; source-clean verification was skipped. This identified a permission dependency; no time limit was enlarged.

The pinned original native-caller SQL grants its Auth owner schema USAGE but revokes that owner's ordinary EXECUTE on assert_session. The successor's Auth-owner helper therefore cannot invoke that function. It now performs the identical original subject/session/token/deadline check using the owner's existing restricted column rights, preserving publication-before-Auth locking. A source assertion compares the check body to the unchanged pinned original. The actual armed fixture verifies original EXECUTE remains denied, the successor helper has its intended owner, valid Auth succeeds and invalid subject/session/token/null-session fail. Original ACLs, original SQL and historical assertions remain unchanged. This repair is AUTHORED — NOT RUN.


Atcb504c18cab6079becbbba58ff464166bb5fd7df/run36472651193/job109098492623,54 source checks and2 atomic PostgreSQL checks passed. The ordered suite reported66PASS/2FAIL: the new Auth-rights metadata assertion and its parent failed; all transition, broker/admin, active currentness, runtime API, exactretry/lostACK, deactivation and independent-audit lifecycle children passed. Tracked-source/historical verification and owned cleanup passed. The fixture tried a name-based function lookup as an installer intentionally lacking native-caller schemaUSAGE. Exact catalog OIDs now inspect the same owner ACL without granting installer access; original EXECUTE remains expectedfalse. Valid/invalid direct successor Auth checks remain required. This fixture-only repair is AUTHORED — NOT RUN; no runtime grant or historical assertion changes.


## Actual integrated synthetic qualification receipt

Candidateca9d05d51cf59bf6c931c48ce61e4ca8216d17af/tree75ccb6122027434d5625566c7da57b777c9074ba (source25bc9c6c3c6f14f08617c64a6fd8b4238f74d4fa/tree085fb9a91d44e9c6096144f5a854db8d5be7e99b), run36473333101/nativejob109100766733:54 source checks,68 complete ordered PostgreSQL checks and2 actual atomic checks PASS;0FAIL/0SKIP. Exact source/historical integrity and owned PostgreSQL container/volume cleanup passed. Environment: existing source/synthetic-only GitHub Ubuntu22.04, Node22.14.0, owned SCRAM-loopback PostgreSQL17.6/170006 and pgvector0.8.2. Separate actual nonsuper installer, autonomous auditor, metadata auditor and runtime LOGINS exercise the full successor and original v2–v6 regression path. This is not qik installation, hosted Auth/TLS, activation, operating proof, public eligibility or historical acceptance.

Fresh applicable Cursor review remains required for this changed candidate; the existing browser connection returned Transport closed again after this qualification. No new external review was dispatched or completed. Secure protected hosted connections remain unconfigured. Historical evidence and hash assertions remain unchanged; successor is UNAPPROVED and owner_field_signature remains null. The user amendment authorizes internal qualification separately from acceptance.
