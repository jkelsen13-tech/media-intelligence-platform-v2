# Atomic comparison installation and historical transfer qualification

This is a successor source candidate under the current consolidation amendment. It is not a rewrite of historical acceptance, a hosted installation receipt, or evidence of real article custody. Earlier source-only limits were superseded only within the expressly authorized consolidation scope.

## Selected dependencies and boundaries

The comparison compiler pins the reviewed native-lineage source at d40e42fdc1b9b92ec6c6117597cbfd24d17906c1: comparison contract, selection, capability and source snapshot, then authority 001 through 019. The atomic adapter additionally pins 020 DOJ private permission at 53355765bcc579930130f16ac4bff9a5fe498e92. Its manifest hashes the actual transformed program; per-step compiled hashes describe transformed SQL. Historical fixed qualification manifests and assertions remain unchanged.

The installer requires the existing disabled C3 installation and exact persistent operation receipt/manifest, closed sources/gate/schedule, verified public/native schema shape, existing owner-transfer authority, and an existing isolated audit login. It preserves C3 configuration and receipt hashes. It provisions no execution host or credential channel. The qik installer retains its existing role attributes; runtime/owner permissions are asserted separately.

The selected extension prerequisite is preinstalled dblink 1.2 in extensions, with exact metadata digest, installer ownership of the extension and functions, and no external dependents or foreign servers. Relocation into the private transport schema occurs within the install transaction. Provider-supported extension creation is a separate prerequisite, not an atomic installer success claim. Current qik metadata showed dblink available but absent; provider configuration permits privileged creation, but this has not been executed.

A protected caller supplies the same-qik verified-TLS audit connection through the existing credential logging guard. No literal credential belongs in a command, source file, receipt or ordinary log. Browser credential handoff and the actual secure execution route remain separate technical requirements. There is no new public execution interface or CLI in this adapter.

Final audit-secret and transport checks must reject unexpected effective grants, column privileges, policies, owners, function execution or membership paths. Unrelated default privileges are not globally changed. The synthetic harness must establish a pristine dedicated cluster before arming destructive cleanup and refuse unrelated-schema sentinels.

Temporary role-creator rights and new-schema CREATE grants are removed before final native/DOJ/compatibility assertions. The seven freshly created compatibility roles change only NOINHERIT; the original full attribute assertions remain unchanged. The installer retains explicit, nongrantable USAGE on exactly mip_comparison_kernel_v1, mip_cutover_authority and mip_identity for catalog name resolution. This three-schema contract is included in the plan digest; final checks deny CREATE, owner membership, table rights and direct protected function execution. Existing C3 permissions are restored to their baseline. Installation returns installed_disabled_audit_pending. COMMIT acknowledgement loss requires a fresh-session receipt reconciliation; it does not authorize replay or imply rollback. A separate synthetic metadata rejection probe must survive caller rollback before an append-only audit qualification receipt is recorded. Even audit success leaves activation_allowed false; operational activation has its own existing conditions.

## Synthetic qualification

Actual test sources:

- tests/qikComparisonAtomicInstall.test.mjs — pinned transformations, exact digests and configuration/target refusal.
- verifier/qikComparisonAtomicInstallPostgres17.mjs — complete SQL installation by a password-authenticated non-superuser owner, mid-install rollback, lost COMMIT/ROLLBACK acknowledgements, fresh-session reconciliation, role cleanup, disabled C3 preservation, immutable receipts and autonomous audit.
- tests/mipHistoricalArticleTransferPlan.test.mjs and tests/mipHistoricalArticleTransfer.test.mjs — metadata planning and injected source/sink/checkpoint orchestration. Passing these does not qualify actual adapters or material custody.
- verifier/nativeLineageMinimizationPostgres.py and verifier/dojPrivatePermissionPostgres.py — existing full native/C3/journal/review/accepted-reader regression closure.

The dedicated synthetic workflow uses Node 22.14.0 and exact PostgreSQL 17.6 (server_version_num 170006). The full installer fixture additionally needs pgvector 0.8.2, matching the observed qik type version. Official source commit cab9da72c04353f143bb06b42ab70a403daac64a archive SHA-256 is 0af705b6c9b2a3a1fd1f6fd991425c125387d3c8edc68b75ef027d2e0a05e57a. The archive is checked before extraction/build. Build package versions are recorded; the entire compiler toolchain is not claimed to be pinned.

Run only in the dedicated pristine loopback fixture with its synthetic password and no inherited hosted credentials:

```sh
node --test --test-concurrency=1 tests/qikComparisonAtomicInstall.test.mjs tests/mipHistoricalArticleTransferPlan.test.mjs tests/mipHistoricalArticleTransfer.test.mjs
MIP_QIK_COMPARISON_DISPOSABLE=synthetic-pg17-only MIP_DISPOSABLE_POSTGRES=qik-persistent-install node --test verifier/qikComparisonAtomicInstallPostgres17.mjs
```

Initialize the disposable server with POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256. Before setup or destructive cleanup is armed, the fixture verifies SCRAM host rules including internal 127.0.0.1/32 (used by dblink), and separately rejects a wrong password through the runner connection. A supplied password alone does not prove password authentication when an earlier trust rule matches.

The actual PostgreSQL fixture prepares required public columns (including vector), Auth substrate, native reliability migration, existing ordered C3 installation source, and synthetic receipt/audit identities. A separate synthetic bootstrap identity performs prerequisite creation and final cleanup; the tested installer is demoted to the non-superuser role flags. The fixture checks empty starting state, restores its disposable database/role inventory, and the enclosing workflow always removes its container and anonymous volumes. No hosted cleanup is implied or permitted by this fixture.

The unchanged full native/DOJ suites passed 11 + 11 cases in run 36367070570 at 43e4f7169b17a06bdc83572bb00e00956714cb98; its 45 Node cases also passed, while its then-new atomic fixture failed. These component receipts are reused only for unchanged source. Subsequent targeted runs repaired ordinary fixture/permission issues without weakening gates.

The final targeted run [36369561852](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/36369561852), job 108762798524, passed at d592bd44e6959fde87efc1490b172af2b5d54213: six atomic unit tests and the complete non-superuser PostgreSQL fixture, with container/volume cleanup verified. It exercised pinned dependencies, exact negative ACL reasons, rollback and lost acknowledgement recovery, final permissions, installer inspection denials, autonomous audit readback and immutable receipts. Tested Node 22.14.0, PostgreSQL 17.6 and pgvector 0.8.2. PostgreSQL runtime/client packages remained 17.6; development headers were 17.11, so this is not a wholly pinned compiler toolchain claim. It is not hosted success, activation approval or historical acceptance.

Fresh external Cursor review of the changed integrated installer and these results is pending. Existing independent reviews remain evidence for unchanged work; they are not relabeled Cursor.

## Historical custody contract

The transfer orchestrator is an automated bounded engine, not a network or credential adapter. It consumes one exact metadata manifest and original snapshot identities, requires trusted route admission, canonical lossless record representation, explicit field allowlists and verified object bytes, and writes only through a private pending insert-if-absent sink. Source project/table/identity/version remain distinct. Receipt/checkpoint metadata contains no payload copy.

A lost write acknowledgement is resolved through independent exact readback of the same unit. Checkpoint compare-and-swap outcomes are reconciled without blind retries. A resumed run must re-establish the same source snapshot/inventory; current rows or website fetches cannot substitute for missing bytes. Previously verified prefixes depend on qualified immutable sink custody and trusted durable checkpoints. Cancellation and late remote commits remain adapter obligations; ambiguous units are accounted for, not labeled migrated.

Metadata-manifest capacity and per-invocation material budgets are distinct. Record pages split deterministically at the global unit byte ceiling. An indivisible oversized record/object, or a chosen invocation allowance smaller than the next unit, yields an explicit capacity refusal with byte counts; it must not be silently skipped or treated as an endlessly resumable normal pause. Larger inventory representation does not itself authorize increased transfer concurrency, spend or memory consumption by a real route. The actual adapter must verify capacity and enforce the approved limits before material access.

Remaining real-route requirements are concrete source snapshot custody, read-only source adapters, private atomic destination/object adapters, trusted durable checkpoint storage, secure credentials, current allowlist/counts/bytes/headroom, bounded real-batch qualification, and full content/object verification. No current source counts, object-byte custody or successful transfer are claimed. No import may activate collectors, enqueue the corpus for processing, overwrite qik content or confer publication eligibility.

Operational C5/C6/C8/C9/C10/C12/C13 and remaining caller/recovery obligations stay open in the existing consolidation ledger. This package alone is not full backend consolidation or predecessor retirement authorization satisfaction.
