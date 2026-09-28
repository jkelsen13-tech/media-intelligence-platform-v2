# Historical standalone Deno runtime qualification

This adds one actual-runtime child group to each existing historical PostgreSQL
profile. It preserves all 12 existing groups and their ambiguous-commit assertions.
The new total is 13 child groups per profile; parent reports actual runner totals
after execution. The author did not execute tests. Parent remote run36449393457/job109019936467 subsequently passed83 checks (57+13+13), 0fail/0skip, cleanupsuccess. No hosted execution occurred.

## Exact source dependencies

- Existing historical base d0954f00a49beba0146de843b9a2543cb6fe3f81,
  tree 0d65c5feee974c0222186283099c165cae5f708e.
- Original PostgreSQL fixture 150b59cf3a5680fd991c7f33840aa8f89cfe02a1
  is extended only with the child launcher and one final, separately scoped group.
- Executor fa2e6a6f04287f45ce75ee0ae79e66afea5a3e1a; handler
  d00b3d331e161f0fb269ed26b173d5c7bcc3cb29; SQL
  6fe6035223de1dac94fba6c238e33324bc0ca266 remain unchanged.
- Planner ad30cb603757888840e737694b333c3b6ae234e1 and engine
  b5b80ee37c6cd068d17f59b506bab6df70839ea6, including their actual lossless
  parser/serializer dependencies, remain unchanged.
- Reuse supabase/functions/native-comparison-display/deno.json, imports-only blob
  9126bd3e8ddc618bfbdc8239f14c84295ed662af, mapping pg to npm:pg@8.23.0.
  This is a test dependency, not a new historical production configuration.
- Reuse tests/nativeComparisonDenoRuntimePin.json
  82305814e17a4fa749c6e7a4c5ea2ba284045722: Deno 2.5.2 Linux x86_64 archive
  SHA256 520fd4bc2d18b50b6ac2ea8b7d0f7f6a35588e412754a081e8c6afd4b15264c4;
  vendor checksum-file SHA256
  4c0fc62463955fa32e56d43d4d14b37424251e4ab78f14beb33e7092fd083cda.
- The parent-controlled generated combined deno.lock must include this probe,
  historical index and their transitive dependencies. Its actual generated3185 bytes were captured from successful main/history jobs,
  SHA256 df06499a54915068be7976853021d67c0b6598927c552cf5e6f19b99c404dbe3, Git blob 11d5e1328c2a0b273f5085dc0a9946881adac3ee. No lock was invented; frozen-only targeted recheck remains required.

## Runtime preparation and invocation

Keep the existing official PostgreSQL 17.6 loopback service, fixture credentials,
source-contract installation, actual SCRAM principals and original cleanup.
Both bootstrap and closed-ordinary profiles are required. Missing DENO_BINARY,
DENO_DIR, binary version, npm cache or frozen lock is a failure, not a skipped group.

After verifying the existing official Deno archive, set DENO_BINARY to its absolute
binary path and DENO_DIR to the isolated absolute cache path. Prepare the combined
lock/cache with the imports-only config and these additional entrypoints:

```text
deno cache --frozen --config=supabase/functions/native-comparison-display/deno.json --lock=supabase/functions/native-comparison-display/deno.lock --node-modules-dir=none tests/historicalQikDenoRuntime.mjs supabase/qualification/historical-qik-executor/index.ts
deno check --frozen --config=supabase/functions/native-comparison-display/deno.json --lock=supabase/functions/native-comparison-display/deno.lock --node-modules-dir=none tests/historicalQikDenoRuntime.mjs supabase/qualification/historical-qik-executor/index.ts
```

Deno check does not support --cached-only. The actual child uses BOTH --cached-only
and --frozen with that same config/lock; it cannot fetch packages on demand.
Parent pins the generated lock and checks it remains unchanged through frozen
checking/runtime execution. Existing main runtime entrypoints stay in the lock.

Run the existing parent-selected commands, now with DENO_BINARY and DENO_DIR:

```text
MIP_HISTORICAL_EXECUTOR_DISPOSABLE=synthetic-pg17-only node --test tests/historicalQikExecutorPostgres17.test.mjs
MIP_HISTORICAL_EXECUTOR_DISPOSABLE=synthetic-pg17-only MIP_HISTORICAL_EXECUTOR_INSTALL_PROFILE=closed-ordinary node --test tests/historicalQikExecutorPostgres17.test.mjs
```

The harness alone spawns the runtime, with a 30-second kill bound, no prompts,
read permission for repository/cache only, network permission for 127.0.0.1:5432
only, no write/run/FFI permission, and an allowlisted child environment. --allow-env
serves Node compatibility within that explicitly constructed environment; no
ambient database/deployment secrets are forwarded. Only bounded stdin receives
the synthetic SCRAM URL, fixed disposable marker, original operation UUID and
manifest hash. The child also independently rejects nonloopback hosts, another
role, a database outside mip_hist_qik_<12 hexadecimal characters>, query/fragment
URL options, another password or extra input keys. No production override exists.

## Actual path and evidence

After all old groups, Node acquires and seals a NEW fixture operation through the
real existing adapter/SQL and original synthetic source databases. No cloning of
capture rows or fake SQL adapters is used. This separate operation preserves the
old groups' original operations and exact unit-count assertions.

Deno initializes Buffer/process exactly as required by the historical entrypoint,
imports real npm pg and the unchanged executor/engine, and authenticates as the
actual mip_history_executor SCRAM login. It verifies sealed exact retry twice,
transfers one fixed unit, finishes the remaining units, and retries completion
with zero newly verified units/bytes. Body-read queries must actually occur.
The unchanged engine performs lossless parsing/hashing, real commit, independent
storage readback and checkpoint handling. A fresh SQL read independently hashes
every original stored payload and checks its recorded length/hash.

The child returns only an exact bounded receipt: status, deno, node_globals,
pg_import, first_verified, finished_verified, retry_verified, body_queries,
manifest_sha256, payload_sha256, records, payload_bytes, units, checkpoint_sha256,
connection_closed and public_processing_authorized=false. No source body, native
identity, title, URL, password, operation UUID, query or raw error is returned.
The payload digest covers the ordered ordinal/byte-length/hash metadata.
The parent independently compares pre/post payload hashes/lengths, manifest,
expected deterministic unit identities/hashes and checkpoint/unit counts.

Success output occurs only after the child awaits actual client.end(). The parent
separately requires the child's application-name/database/login session count to
return to its original baseline. Kill, malformed/oversized output, absent cache,
runtime failure and unobserved cleanup fail with static stage errors; primary and
cleanup failures are preserved independently. stderr is consumed only as a byte
count, never printed. The original owned-database/role teardown remains unchanged.

## Limits of the result

This is actual standalone Deno/npm-pg/engine compatibility on the disposable
PostgreSQL fixture. Source acquisition and canonical sealing happen in Node;
this does not prove Deno acquisition or canonicalization, hosted Edge bundling,
HTTP gateway/JWT, production TLS, Vault, real credentials, hosted memory/CPU
capacity, network route or any actual material transfer. The historical index is
cached/type-checked, not executed: its Deno.serve would start a server. The probe
uses its same explicit Node-global initialization before dynamic imports.

The existing route's synthetic capacity values remain fictional fixture inputs.
They cannot be copied into a real route. No algorithm, schema, retention contract,
deployment setting, source receiver, publication authority or installation pin
was changed by this runtime test.

The current frozen-only source candidate reuses the completed83-check initial
receipt without treating it as hosted success. The targeted42-check recheck
(16 full-native-reader +13 historical bootstrap +13 closed-ordinary) and exact lock
unchanged assertion are NOT RUN at this revision's authorship. No real batch,
Vault configuration, actual TLS, Edge capacity or source access is established.
