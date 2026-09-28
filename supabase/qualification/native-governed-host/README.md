# Existing-service native installer host — source candidate

The integrated source/synthetic candidate c6d3d7b21108fd9993a1e990fdff79cdf63ac6da / tree 8152c09d4d80b5fc7b7de294cd5b839d5772ffc4 incorporates the qualified v6 installer, caller and this metadata-only host. Its applicable qualification receipts are recorded below. This workflow has not been dispatched against qik; secure configuration, hosted transport, installation, audit and operation remain unproved. Source/synthetic qualification does not establish those prerequisites.

## Scope and route

Use only the already named GitHub Actions service and existing environment qik-forward-controlled. Proposed .github/workflows/qik-native-installer-held.yml has workflow_dispatch only, defaults held, no push/PR/schedule, contents:read, no token persistence, one serialized job, a 15-minute job ceiling and 10-minute operation ceiling. It uploads no artifacts or extra log files. Its ordinary Actions output is bounded source/setup output and one sanitized metadata receipt; no captured material is admitted to this service. No new host, provider, role issuer, collector, worker, upgrade or subscription is introduced.

The existing user authorization covers ordinary scoped installation and secure configuration within existing-services $25 one-time / $10 monthly limits. Admission variables below record verified technical constraints; they are NOT a request for new owner approval. Parent may set them after establishing those facts. Their strings alone do not establish actual billing headroom, environment availability, stored credentials, reviewed source, or a functioning transport. Do not run when account/resource headroom remains unverified. The proposed workflow does not calculate GitHub billing, buy capacity, raise provider limits or introduce a recurring schedule. One bounded job is not by itself a monetary-cap proof.

This is an installer, reconciliation and isolated synthetic audit route only. It is not the collector one-shot workflow, source receipt adoption, corpus transfer, approved-content export, publication, private display, or material-reader transport. It creates the same qualified disabled installation through existing APIs. Public eligibility and activation remain false.

## Exact program and data-flow closure

run.mjs fixes native-governed-v6. It pins all transitive installer JS files and package-lock.json by Git blob, checks the exact reviewed release HEAD and clean checkout, requires it to descend from d706, checks Node 22.14.0 and the exact public qik CA, then compiles the existing plan and compares BOTH supplied manifest and native-program SHA256 BEFORE a database connection. Source reads are only git cat-file of the compiler/native module's existing fixed Git blobs. Unknown path/ref pairs, missing objects, non-UTF8 bytes and more than 8MiB of unique source refuse. Fetch-depth 0 supplies source history; missing historical blobs refuse rather than fetch arbitrary URLs. The workflow runs npm ci --omit=dev --ignore-scripts before credential injection. No shell SQL or replacement installer is used.

Actual imported installer is supabase/qualification/qik-comparison-adapter/atomicInstall.mjs blob b73fcfa4782bd56ec220a2744aa749e8f50830a7:
- prepareAtomicInstall constructs pinned source only.
- installComparisonAtomic lines 295–440 calls catalog preflight, dblink catalog validation, closed C3 config digests, role/ACL checks, pinned DDL/final assertions and insertion of installation metadata. It does not invoke capture, claim, publication-review, accepted comparison or private-display readers.
- C3_SQL hashes gate/schedule/credential/source/receipt configuration inside PostgreSQL. Only digest and closed-state booleans return; no feed URL, notes, runtime token hash, capture or article payload is exported.
- catalogPreflight a591c92b10d174bd2937e9634f8d491b4c34567b selects pg_catalog identity, relation/column/type/owner/RLS/function/extension metadata, not relation row values.
- auditProbeDDL uses only the deterministic operation UUID, assertion_id install-audit:<operation>, provenance rule and a synthetic rejection digest. qualifyComparisonAudit lines 487–527 verifies that synthetic audit survives caller rollback. Probe results are booleans; no existing explanation/approval payload is requested.
- reconcileComparisonInstall lines 442–484 reads installation/native-program receipt fields, catalog/remnant checks, unchanged C3 digests and fixed final assertions. It does not rerun installation, recreate owner memberships or read display/native material.
- native-governed-install/install.mjs c56aa3e050fdb9342ef90dc71dca44f2810782ea selects NATIVE_CALLER_ORDER, including native-comparison-caller/001_admission.sql blob a9428d8b2120514a0d6ee13a53d801dba7b6e060, under the existing original creator lease, and executes the complete source-pinned final verifier after actual native/backend temporary privilege cleanup. New material-reader function definitions are source, not invocations.

The installer principal has powerful existing authority, including required source relation SELECT/ownership checks. That authority is not authorization to export rows: this fixed route never selects those values. Source metadata and error sanitization are therefore essential; do not expose an arbitrary SQL/callback/browser endpoint. Pinned source installation can execute source-defined DDL and catalog assertions within qik; describing the receiver as source/metadata-only does not describe installation as read-only.

Underlying module pins:
- atomicInstall b73fcfa4782bd56ec220a2744aa749e8f50830a7
- catalogPreflight a591c92b10d174bd2937e9634f8d491b4c34567b
- compileSource cd87eb0a0bc758315246e74675339f3ea2972a19
- native install c56aa3e050fdb9342ef90dc71dca44f2810782ea
- persistentInstall 24625b8382399db71e9dba6e3ddb88a936ade33f
- installQikIngest fa5d24041b38592ec950e2e46ca28be11f30d997
- authenticatedPgDriver af0f3b69c34695f9241934fae89ac00cedd08515
- credentialDelivery 354679fadc48eb9f8a8154456f3d38e7faab3e61
- package-lock 2b1796f9fa6bf6490f8d935863c8b6dd0a41a7f0

Canonical displayContract.mjs successor blob e5975cf78bfe875c17a8e5ce3be2bc39f248a20a belongs to the coordinated caller/display consumer. It is not imported by this installer or its transitive JS dependencies, so the host does not import or execute that display contract. Caller SQL is already bound by NATIVE_CALLER_ORDER and the resulting native program digest; it is not an arbitrary extra source path. BASE remains the reviewed d706 runtime ancestor; the release SHA must identify the eventual complete qualified v6 integration, not d706 alone.

The v6 disabled final profile preserves exactly two automatic CREATE-role ADMIN edges: mip_mentions_gateway and mip_mentions_admin to the original installer login, ADMIN=true, INHERIT=false, SET=false. The fixed verifier binds the observed role/member/grantor OIDs captured at creation; it refuses replacement edges or role recreation. These non-owner administrative edges are distinct from the seven protected native roles, which retain zero edges. Runtime incoming LOGIN memberships are excluded by the disabled final profile; this route neither activates callers nor asserts an activated state. Temporary native/backend creator privileges are still cleaned before the final verifier and commit. The host does not add any membership-management operation.

A changed dependency requires a new explicit source candidate/qualification, not a dynamically relaxed pin. The existing C3 receipt, disabled sources/gate/schedule, exact qik schema/owner shape, preinstalled unused installer-owned dblink1.2, isolated audit login and owner-transfer authority remain prerequisites. This adapter provisions none of them.

## Secure configuration, names only

Existing environment qik-forward-controlled must provide:
- Secret QIK_NATIVE_INSTALLER_DATABASE_URL: existing qik installation principal; never the collector login or public service-role key.
- Secret QIK_NATIVE_AUDIT_DATABASE_URL: distinct restricted isolated audit login. Its privileges are verified by the original installer.
- Variable QIK_APPROVED_RELEASE_SHA: exact future qualified adapter commit, equal dispatch release_sha and GITHUB_SHA.
- Existing variable QIK_CA_PEM_BASE64: public certificate hashing to 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7.
- Variable QIK_NATIVE_INSTALL_CONFIG_JSON: exact nonsecret keys listed below.
- Variable QIK_NATIVE_INSTALL_HOST_ADMISSION = qualified-source-metadata-only-v1: records verified existing environment, current source/metadata-only receiving scope, exact-source controls and secure injection capability.
- Variable QIK_NATIVE_INSTALL_BUDGET_ADMISSION = within-existing-25-once-10-monthly: records verified available allowance under the already authorized limits, with no upgrade/new provider. It is not a fresh authorization request or telemetry measurement.

Nonsecret JSON keys: releaseSha, operationId, expectedLogin, auditLogin, c3OperationId, c3ManifestSha256, expectedManifestSha256, expectedNativeProgramSha256, dblinkMetadataSha256, collectorSource. IDs are exact original operations; hashes must be independently prepared from selected source/current prerequisite metadata. collectorSource is the existing qik-* configuration identity. No source URLs, source body, query, arbitrary stages, mode, runtime token or broker session belongs in this JSON. v6 mode and its original authorization marker are fixed in code.

Installer URL accepts only exact qik direct host db.qikvmopbtijoebdqosyq.supabase.co or observed aws-0-us-west-1.pooler.supabase.com session pooler, /postgres and port5432/default, exact principal/project suffix, password, no query/fragment. Existing pg transport uses rejectUnauthorized:true and the pinned public CA. Audit URL additionally requires exactly sslmode=verify-full, sslrootcert=system and connect_timeout=5, matching the original qik dblink contract. The audit connection is from qik to qik, not a new material destination.

Secrets are injected only into the final Node step, never argv, shell interpolation, npm, source, artifacts or receipts. The adapter deletes their process-environment entries before source/API execution; values remain transient process memory until exit (no secure heap-erasure claim). Source-only git subprocesses receive a minimal environment with no credential variables. Original installer intentionally persists the isolated audit credential inside existing protected qik mip_factual.audit_connection via the guarded parameter-only helper, with exact ACL/RLS/logging assertions and bounded credential window. This is the existing server-side audit dependency, not a secret log or runner file. No secret readback or credential rotation capability is introduced.

Absent config refuses. Only unavailable secure credential-setting capability needs a human handoff; do not paste credentials in chat, repository or dispatch inputs. Existing environment names are not proof they are configured.

## Operation, retries and receipts

The only invocation is node supabase/qualification/native-governed-host/run.mjs, with the workflow's fixed environment. No arguments, arbitrary API selection or disposable hosted bypass is accepted.
- install: fresh authenticated exact-operation reconciliation first. Only not_installed with needs_reconciliation=false AND connection_cleanup_verified=true permits one installComparisonAtomic call. Existing receipt, drift, inflight or unknown state never triggers replay.
- reconcile: fresh authenticated reconcileComparisonInstall only, same operation/manifest/program. A workflow rerun is refused; dispatch a fresh reconciliation action with the SAME identity.
- audit: qualifyComparisonAudit only; its existing fresh reconciliation and rollback-surviving synthetic probe remain unchanged. No automatic audit follows install.

A lost COMMIT, thrown error, timeout, signal or unknown/mismatched receipt is not rollback/success. Return needs_reconciliation, preserve exact original configuration, and use a separately invoked fresh reconciliation. Never regenerate an operation or automatically replay a mutation. Audit uncertainty likewise requires exact readback; no activation follows audit success.

Output exact keys: contract, state, operation_id, release_sha, manifest_sha256, native_mode, native_program_sha256, needs_reconciliation, audit_qualified, activation_allowed, publication_allowed, material_access_allowed, connection_cleanup_verified, diagnostic. Startup/interruption failures emit a smaller static unknown envelope without config values. All three permission flags remain false. Arbitrary API phase/diagnostic/native_failure/error fields are discarded; no raw driver message/detail/context/cause/params enters output. Process-level error/signal handlers also emit static codes only. The revised atomic API awaits rollback/close cleanup before returning, adds connection_cleanup_verified and a fixed cleanup_diagnostic, and preserves the original transaction state. Any cleanup failure forces needs_reconciliation=true and audit_qualified=false; an acknowledged commit remains acknowledged, and commit_ambiguous remains ambiguous. The host retains only a static native_host_cleanup_unverified diagnostic. Missing cleanup evidence refuses; no state alone authorizes installation, audit success or replay. Verified client closure is not an independent hosted session-baseline or unattended-operation receipt.

Success exit requires verified cleanup, no reconciliation demand and the requested result: audit qualified, install acknowledged installed-disabled, or reconciliation observed not-installed/installed-disabled. A missing installation is not successful audit/install. The output never establishes production/material/publication qualification.

## Tests and installation order

Parent invocation: node --test tests/nativeGovernedHost.test.mjs on Node22.14.0. Sixteen authored synthetic tests cover exact config, target/TLS refusals, source bytes, exact operation dispatch, no replay after ambiguity/drift, audit separation, result identity/allowlist, payload/secret error suppression and fail-closed cleanup evidence including absent reconciliation, acknowledged/ambiguous commits, audit and legacy receipts. Injected API methods are a trusted internal orchestration test seam, never workflow config or an arbitrary SQL seam. These sixteen tests passed in the combined source/synthetic qualification recorded below. They do not qualify real qik pg transport, existing environment credentials or hosted install.

Add source files only after parent inspection of workflow event effects. The selected original installation SQL and historical assertions remain unchanged; the atomic lifecycle and host receipt interpretation are separately revised and source-pinned. The applicable synthetic adapter checks, combined regression and fresh review are recorded below. Verify the existing route/config/prerequisite metadata and secure injection before executing an already authorized operation. Do not invoke the existing destructive disposable PG harness against qik. Runner cleanup removes only its public CA staging file; database cleanup/reversal, source mutation, payload transfer and activation are not adapter actions.

The new v6 final prerequisite/caller/bootstrap assertions resolve exact schema, relation and function identities using pg_catalog OIDs, because the native verifier owner deliberately lacks Auth and caller schema USAGE. Their effective owner/ACL/RLS/shape checks remain complete. No Auth/caller schema or payload-read grant is added to the verifier; the restricted-principal fixture explicitly checks that denial after success.

The existing tests/qikComparisonAtomicInstall.test.mjs additionally supplies 12
synthetic lifecycle/source tests. The existing armed
verifier/qikComparisonAtomicInstallPostgres17.mjs runs two separate pristine
PostgreSQL17.6/pgvector0.8.2 profiles, bounded to 240 seconds each. Both retain the
full original install/rollback/audit checks; one loses actual COMMIT acknowledgement,
the other loses close acknowledgement after an acknowledged install. Fault injection
awaits actual pg.Client.end() before a static error, restores the prototype in finally,
and independently checks pg_stat_activity returns to baseline. Reconciliation absence
and audit cleanup failures must block progress while exact committed receipt state is
preserved. These checks passed in the combined source/synthetic qualification recorded below.
Only the existing source/synthetic runner may execute the disposable fixture;
never point it at qik.


## Actual source/synthetic qualification

- Combined candidate 5f3fb644c9bdc7554d36375ac7fa5098e901769b / tree 09a7a5c94f4c34a6e2e9e79c16a0fe8236791a37: [run 36449315760](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/36449315760), job 109019669886, 266 PASS / 0 FAIL / 0 SKIP. Includes the sixteen host tests, twelve atomic lifecycle tests, two actual separate atomic PostgreSQL lifecycle profiles, full selected journal/review/accepted-reader dependencies and 55 restricted ordered-install v2-v6 assertions. Browser build and owned-session/container/volume cleanup passed.
- Candidate c6d3d7b21108fd9993a1e990fdff79cdf63ac6da / tree 8152c09d4d80b5fc7b7de294cd5b839d5772ffc4: [run 36451184785](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/36451184785), job 109026077851, 57 PASS / 0 FAIL / 0 SKIP. Targeted integration recheck used the exact generated Deno lock unchanged, exercised the native/current-reader path and both historical custody profiles, and checked the separate unused semantic foundation. Earlier 266-check evidence is reused only for unchanged code.
- Actual environment: existing source/synthetic-only remote GitHub Actions, Ubuntu22.04, Node22.14.0, owned loopback PostgreSQL17.6 (170006), pgvector0.8.2, standalone Deno2.5.2. Synthetic Auth and loopback SCRAM are distinct from hosted qik Auth, verified TLS, secure injection or unattended operation. No credentials or actual article material entered these jobs.

These receipts qualify the named source/synthetic candidates. They are not a hosted qik installation receipt, resource-headroom observation, activation receipt, owner field-by-field signature or historical acceptance. The original installation and acceptance evidence remains unchanged.

Fresh non-implementing Cursor source review [bc-24fbba5a-0f83-41ff-978e-ec92e0bbf485](https://cursor.com/agents/bc-24fbba5a-0f83-41ff-978e-ec92e0bbf485) inspected exact c6d3d7b21108fd9993a1e990fdff79cdf63ac6da / tree 8152c09d4d80b5fc7b7de294cd5b839d5772ffc4 and its 52 changed files/transitive dependencies. Exposed model: cursor-grok-4.6-xhigh. The actual result was retrieved: no required source defects. Hosted assumptions and secure-access, activation and capacity gaps remain unwaived. This subsequent documentation correction synchronizes the atomic pin and records existing qualification facts; no runtime code or fixture changes, and no unchanged tests are claimed rerun.
