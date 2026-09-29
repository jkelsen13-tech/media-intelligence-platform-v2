# Held installer authentication preflight successor

This is a distinct manual source/metadata route, not an installer profile. No hosted invocation has been performed. Its successful receipt establishes only an authenticated genuine installer, actual TLS, selected PostgreSQL/vector versions and the current existing C3 closed receipt/digest. It never establishes installation readiness, activation, material access, publication or production qualification.

## Existing protected route

Workflow: .github/workflows/qik-native-auth-preflight-held.yml.
Entrypoint: supabase/qualification/native-provisioning-compat/preflight-run.mjs.
Environment: qik-forward-controlled. Existing GitHub service and existing resource budget only.
No push, pull_request, schedule, workflow_run, automatic dispatch, artifacts, audit credentials, material reader, raw SQL input, installer or activation API.

Before any dispatch, reconcile external operations, qualify/review this exact successor, verify current existing budget headroom, and establish these protected bindings:

- Secret QIK_NATIVE_INSTALLER_DATABASE_URL: existing exact qik installer connection, never reset or exposed through source/logs/inputs.
- Variable QIK_NATIVE_PREFLIGHT_APPROVED_SHA: exact reviewed release commit.
- Variable QIK_NATIVE_PREFLIGHT_HOST_ADMISSION: qualified-installer-auth-metadata-preflight-v1, set only after the represented controls are verified.
- Variable QIK_NATIVE_PREFLIGHT_CONFIG_JSON: exactly expectedLogin, c3OperationId and c3ManifestSha256. Recover the exact existing C3 receipt, never invent a replacement.
- Existing variable QIK_NATIVE_INSTALL_BUDGET_ADMISSION: within-existing-25-once-10-monthly; the string is not budget evidence.
- Existing variable QIK_CA_PEM_BASE64: base64 of the exact public qik CA certificate with SHA256 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7.

Supabase officially directs certificate acquisition to the project's Dashboard Database Settings/Connect certificate control: https://supabase.com/docs/guides/database/psql and https://supabase.com/docs/guides/troubleshooting/powerbi-service-error-the-remote-certificate-is-invalid-according-to-the-validation-procedure-640a98 . These docs do not supply a verified stable raw certificate download URL. No URL is guessed and no certificate is embedded here. Acquire/configure the public certificate through that provider-controlled interface in an authorized remote route, never the user's physical device. A changed certificate refuses and requires explicit source/config reconciliation; do not silently trust a replacement CA.

Select execute=run-auth-metadata-preflight and release_sha equal to the exact approved SHA. The dispatch ref's GITHUB_SHA, approved SHA, requested release and checked-out HEAD must all match. Merely selecting a different checkout cannot bypass workflow/source identity. The source must descend from the original preflight integration, the checkout must be clean, and all pinned transitive modules/lockfiles must match before loading the runtime.

Only the final bounded Node step receives the installer secret. The runner removes it from process-environment inheritance before source-only git subprocesses, which receive a minimal environment. The public CA is staged only on the remote runner and removed afterward; Node receives NODE_EXTRA_CA_CERTS before startup and the connector also supplies the verified CA explicitly with rejectUnauthorized=true.

Rerun attempts refuse. A manual later attempt is separately bounded and must not be confused with an installation replay. The component starts a read-only transaction, uses bounded timeouts, returns only fixed diagnostics, booleans and a C3 digest, and verifies rollback plus client closure. Failure categories distinguish authentication, TLS, permission, missing prerequisites, network/timeout, identity, CA, configuration, query and cleanup; raw errors/URIs never enter receipts. It cannot prove passwords for other principals or provider provisioning rights.

## Qualification

Required source/synthetic checks (not yet run for this new host):
node --test tests/nativeProvisioningInstallerPreflight.test.mjs tests/nativeProvisioningPreflightHost.test.mjs

Fresh review and actual held invocation are separate gates. No previous review/test receipt is relabeled as covering this successor.
