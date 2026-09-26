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

The terminal prompt hides the password-bearing PostgreSQL URL; do not put it in command history. The alternative MIP_C3_INSTALLER_DATABASE_URL environment variable is for protected process delivery. Connections use verified TLS and the existing exact qik direct/session-pooler target validation; transaction pooling is rejected. The operation needs its separately reviewed owner authorization before execution.

A successful receipt reports installed_disabled. Record the operation ID, installer identity and SQL manifest hash privately. Duplicate installation refuses existing packages. An uncertain COMMIT acknowledgement reports needs_reconciliation: true: inspect the operation receipt and state before any retry. There is no automatic teardown.

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
