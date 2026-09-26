# Disabled persistent C3 installation — source candidate

This entrypoint installs the existing C3 package in one transaction through an actual password-authenticated, non-superuser CREATEROLE database owner. It preserves session_user and current_user, uses the existing operation ledger and native caller facade, and creates no CAS operation, runtime credential, feed approval or scheduler. It leaves the collection gate false, runtime credential table empty and schedule intent inactive.

This is an unpromoted development path, not authorization to install on qik. Existing A/B pins and their operation packets remain separate.

## Explicit installation

On the existing execution host, set nonsecret operation configuration:

```sh
export MIP_C3_INSTALLER_LOGIN=postgres
export MIP_C3_OPERATION_ID=<new-32-character-lowercase-hex-operation-id>
export MIP_C3_PERSISTENT_AUTHORIZATION=owner-authorized-disabled-install
export MIP_C3_SESSION_POOLER_HOST=aws-0-us-west-1.pooler.supabase.com
node supabase/qualification/qik-ingest/runPersistentInstall.mjs install --execute --prompt-secrets
```

The terminal prompt hides the password-bearing PostgreSQL URL; do not put it in command history. The alternative MIP_C3_INSTALLER_DATABASE_URL environment variable is for protected process delivery. Connections allow 10 seconds to connect, 30 seconds per server statement and a 40-second client query deadline, with one attempt and no automatic retry. Connections use verified TLS and the existing exact qik direct/session-pooler target validation; transaction pooling is rejected. The operation needs its separately reviewed owner authorization before execution.

A successful receipt reports installed_disabled. Record the operation ID, installer identity and SQL manifest hash privately. Active sources refuse installation before DDL and again inside the transaction with a source-table lock; the installer does not disable another operation. Duplicate installation refuses existing packages. An uncertain COMMIT acknowledgement reports needs_reconciliation: true: inspect the operation receipt and state before any retry. There is no automatic teardown.

No runtime is provisioned here. Separately reviewed owner provisioning must supply the existing restricted runtime membership, token admission, approved source and gate activation before the existing one-shot native host can collect. See NATIVE_HOST.md. No service_role membership is required by this installation path or its restricted runtime.

## Reserved removal

Removal is a separate owner action, not part of install or normal caller operation:

```sh
export MIP_C3_PERSISTENT_AUTHORIZATION=owner-authorized-persistent-cleanup
node supabase/qualification/qik-ingest/runPersistentInstall.mjs cleanup --execute --prompt-secrets
```

Use the original operation ID, authenticated installer and exact SQL manifest. First explicitly close collection, disable sources and remove separately provisioned runtime membership/credentials under their own ownership records. Removal checks the receipt and existing operation ledger; foreign grants or membership changes refuse atomically. It removes the receipt inside that same transaction before invoking existing cleanup. No second cleanup framework is introduced.

Native retained evidence, audit rows and current watermarks remain after removal. The installer does not rewind completed ingestion. The YHB count 36,183 is a historical observation at 2026-09-26T05:03:32Z, not a consistency or continuity fence and not a corpus transfer. A new qik idle marker records the transaction-time article count and timestamp. Preexisting watermarks are preserved.

## Disposable verification

```sh
sudo -n -u postgres env MIP_DISPOSABLE_POSTGRES=qik-persistent-install MIP_TEST_ROOT_SOCKET=/var/run/postgresql /exec-daemon/node --test tests/qikPersistentInstallAuthenticated.test.mjs
```

The fixture uses root only for disposable provisioning and final removal. The generated-password NOSUPERUSER CREATEROLE CREATEDB INHERIT BYPASSRLS database owner performs installation and package cleanup. Tests cover rollback, actual CLI installation, reconnect persistence, disabled defaults, separate runtime credentials and local HTTP feed through the existing native host, foreign-cleanup refusal and exact removal. This is PostgreSQL 16 execution-host source proof, not PostgreSQL 17, hosted qik, Edge/JWT or live RSS proof.

## Separately authorized, one-shot runtime access (source candidate)

The persistent installer still installs disabled. A later, separately approved owner action can call runPersistentRuntime.mjs provision --execute --prompt-secrets on the same existing host after setting MIP_C3_RUNTIME_AUTHORIZATION=owner-authorized-restricted-runtime, MIP_C3_OPERATION_ID, MIP_C3_INSTALLER_LOGIN and the exact session-pooler host. Its three hidden inputs are the installer database URL, a generated 40–128-character runtime password, and a separate generated 40–128-character token. The password/token can instead arrive as protected process variables MIP_C3_RUNTIME_PASSWORD and MIP_C3_RUNTIME_TOKEN; never use shell arguments, chat, source or logs. The command neither generates nor stores plaintext secrets for later recovery.

The action requires the original authenticated non-superuser database owner and matching installation receipt, a closed gate, no enabled collection source, no running discovery run, and no existing runtime login or token. It locks the source and gate tables in the same order as revocation, then rechecks the stopped state before creating the login; concurrent activation commits first and is refused, or waits until the provisioning transaction ends. It creates only `cnc_<operation-id>_collector` with LOGIN, INHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS and NOREPLICATION, then grants only `qik_ingest_runtime` with ADMIN false, INHERIT true and SET false. PostgreSQL also creates an automatic creator-to-new-role ADMIN membership; the receipt records its grantor separately and revocation verifies that exact edge before dropping the login. The existing logging-checked temporary helper assigns the password with a 30-minute VALID UNTIL. The token hash, role name and operation ID are recorded in the existing persistent installation receipt; no plaintext is retained. Gate, source, scheduler and publication state do not change. This is one-shot access, not recurring credential delivery or permanent caller cutover. An ambiguous COMMIT result requires receipt reconciliation before any retry.

After collection is explicitly stopped, close the gate and every enabled source, reconcile any running discovery run and close runtime database sessions. A separately authorized runPersistentRuntime.mjs revoke --execute --prompt-secrets with MIP_C3_RUNTIME_AUTHORIZATION=owner-authorized-restricted-runtime-revocation removes the exact token hash, membership and operation-owned login atomically. Admission through `qik_ingest.require_token` holds a token-row share lock to transaction end; revocation deletes that exact token row first, waiting for already admitted writes, then locks gate/source tables and rechecks state. It refuses another active runtime session, running run, unfinished token-bound observation/native job, token-bound run with unresolved, failed-job or extraction-incomplete debt (even if its job completed), member/grant drift in either direction, and foreign role dependents. A failed run with no token-bound observation cannot be attributed to this credential from the existing schema and must be reconciled as an operating boundary before approval to revoke. The receipt returns to empty runtime fields; the existing package cleanup then checks its original membership snapshot. Revocation does not delete article, capture, history or run evidence. No qik invocation is authorized by this source candidate.
