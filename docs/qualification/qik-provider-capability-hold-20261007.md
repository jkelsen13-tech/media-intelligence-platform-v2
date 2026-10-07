# Qik provider capability HOLD — 2026-10-07

This document records the guard-only worker candidate `516b910628de1251a0f91952c127c3447b902cd2` and its exact historical pins/unchanged-source findings. The coherent successor separately integrates the cleanup repair, reconciles native/host pins and marks historical consumer mapping complete with current-live binding unqualified. Current candidate status is in [qik-provider-revision-and-next-gates-20261007.md](qik-provider-revision-and-next-gates-20261007.md); the worker receipt is not extended to the integrated source.

The production bridge now refuses the original server-side dblink package with
`PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD`. This source change prevents later
accepted authority roots, accepted-looking caller claims, or runtime bindings
from activating a method whose required managed server trust interface the
provider has not confirmed as supported. It does not select a replacement
architecture or establish that every alternative is impossible.

This is an offline source repair. No qik connection, provider probe, credential
read, installation, authentication change, trust-registry change, support message,
push, CI dispatch, merge, or deployment belongs to this qualification.

The checked-out parent was `a9ce6b29f46cc965fd45c9edefcb7428f3493c69`, tree
`a44cabcecfb55b0f9da0921e6c7538ff3c640c64`, on
`codex/mip-qik-provider-capability-revision-20261007`; its working tree was clean
before edits. No applicable checkout or ancestor `AGENTS.md`/`SKILL.md` was present.

## Exact provider evidence and scope

The public data contract is
`scripts/qualification/backend-provider-policy/evidence-contract.json`. Its source
is the already authenticated provider exchange, ticket `SU-495218`, thread
`1a10bb76d10d2ea8`. It records these exact identifiers and original message dates:

| Evidence | Message | UTC timestamp |
| --- | --- | --- |
| Initial technical reply | `1a115364f2345ce3` | `2026-10-07T07:14:01Z` |
| Customer clarification of password-authenticated dblink and endpoint | `1a11546d42c12d7f` | `2026-10-07T07:32:05Z` |
| Final technical reply | `1a11571c51facd28` | `2026-10-07T08:18:59Z` |

The scope is project `qikvmopbtijoebdqosyq`, endpoint
`db.qikvmopbtijoebdqosyq.supabase.co`, port 5432, database `postgres`. The
`sslrootcert` question concerns chain and hostname verification of the server;
the planned dblink authentication is by password, not client certificates.

External libpq `sslmode=verify-full` with the downloaded Supabase CA supplied
through `sslrootcert` is supported for certificate-chain and hostname verification.
For managed server-side dblink, the provider supplies no supported
customer-accessible trust file and does not guarantee the managed host's system
trust store as a stable interface. The final reply cannot confirm a supported
server-side dblink configuration providing verify-full guarantees for this endpoint.
Encryption alone does not satisfy the package's chain-and-hostname requirement.

The replies provide no documented dblink credential-exposure matrix. Project-log
visibility and an offer to investigate a specific synthetic failure do not
establish absence from unobserved provider systems or every failure path. The
contract does not contain credential values, connection strings, authentication
links, support-access tokens, or private application data.

## Preserved original dependency

The frozen DO first reads `pg_catalog.current_setting('ssl_ca_file',true)` and
requires an absolute path. It carries that value into the target's `sslrootcert`,
verifies the distinct auditor through server-side dblink, then performs the one-row
`audit_connection` compare-and-swap. A downloaded external-client CA is not evidence
that this server setting points to an equivalent supported outbound trust source.

The original DO, deadlines, all 18 frozen source pins, generated transport
inventory, rollback/client/controller routines, integration source lock, and exact
empty production registry remain byte-for-byte unchanged. The provider HOLD is
independent of the authority refusal and preserves its later checks in source.

The actual operational-consumer source and requirements mapping remain incomplete.
An external-only substitute is not established as equivalent and is not activated.
Reconsidering the HOLD requires a new reviewed source change plus the existing
authority, immutable artifact, runtime, private handoff, TLS, privacy, baseline,
execution-window, and recovery qualifications.

## Production boundary and integrity chain

`inspectPrivateBridgeGate()` validates inert input and the existing held source,
then returns the fixed refusal and a deeply frozen `providerCapability` contract.
`createFixedProductionPort()` validates its zero-argument boundary and held source,
then throws the fixed refusal. Both act before production-authority import,
runtime-executable fingerprints, private handoff, child spawn, or connection.
The private phase-authorizer, runtime-fingerprint, worker-launch and handoff
boundaries also contain the same fixed guard.

The bridge reads only two fixed public JSON paths in `backend-provider-policy`.
It imports no provider-policy program and accepts no caller-selected path,
configuration, verifier, root, callback, or connection. The guard always refuses;
it has no ready switch or dynamic exception. Missing, modified, or repinned policy
data fail with `PROVIDER_POLICY_SOURCE_DRIFT`.

The existing host artifact lock pins the successor bridge bytes. The bridge in
turn hard-pins the provider source-lock digest; that lock pins the evidence
contract. The provider lock and contract are reread to detect ordinary concurrent
drift. Local hash equality is source integrity only; it establishes neither
review approval nor an immutable deployment and does not close filesystem TOCTOU.

| Source | SHA-256 |
| --- | --- |
| Provider contract (3,161 bytes) | `4983438238b3b5e70e08f26edd30bb1222d2f630a0331bbadbb5fa825a47baf7` |
| Provider source lock | `87288d8c4e0fd6410999163a8624484774707732061023b29620a83d79cdf767` |
| Successor bridge (14,047 bytes) | `422506e1cd797146f124c9ed30b7bb67efdd96db5118d0fb4cf778bbab3f5d1a` |
| Successor host artifact lock | `3adfdc334490c1cfc9cad367b9e1dee32c8b2c7ec3fec959aa841884c913dc6d` |
| Unchanged host integration lock | `5561931199ef60f1f69f964573dedb47144f86d7c6754bd60583d993bbb02d30` |
| Unchanged frozen 18-source lock | `be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c` |
| Unchanged transport inventory | `09b6e70225313ae00428219ba86cc945c82dccdce29b8b84681caef0aebf959f` |
| Unchanged original DO | `5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46` |

There is no existing lock-generation command for these host JSON pins. The host
lock update recomputes the bridge's exact byte count and SHA-256 only; every other
entry, including the integration-lock entry, is unchanged. The original frozen
lock is not regenerated or repinned.

## Source and synthetic qualification only

The original `runClosedHostQualification()` remains runnable historical source
qualification. Its response model is synthetic, its receipt says
`CLOSED TEST-ONLY CONTROLLER MODEL`, its network mode is `none`, and its production,
libpq, native PG17, and live-readiness fields remain false. Its modeled successful
rollback does not establish hosted dblink capability or operational readiness.

The focused regressions verify exact provider scope and message provenance,
deep immutability, unchanged original trust/dblink/CAS ordering, rejection of
caller claims and configuration, and policy/bridge/frozen-source drift. A
disposable synthetic future-authority fixture repins only copied public source
files, then instruments builtins before importing the bridge. It confirms zero
authority imports, runtime or private reads, child launches, and network attempts.
The actual production registry and authority sources are never changed.

Final receipts:

```text
Node v24.19.0:
node --test tests/qikProviderCapabilityPolicy.test.mjs tests/qikPrivateHost.test.mjs tests/qikPrivateAuthorityVerifier.test.mjs tests/qikPrivateLibpqTransport.test.mjs
63 tests, 63 pass, 0 fail, 0 skipped

Node v22.23.3:
/workspace/mip-runtime22/node_modules/node/bin/node --test tests/qikProviderCapabilityPolicy.test.mjs tests/qikPrivateHost.test.mjs
36 tests, 36 pass, 0 fail, 0 skipped

Inherited SQL and client synthetic qualification, Node v24.19.0:
node --experimental-loader /tmp/qik-provider-capability-validation-20261007/existing-pglite-loader.mjs --test tests/qikRollbackClientPackage.test.mjs tests/qikRollbackSqlBoundary.test.mjs
23 tests, 23 pass, 0 fail, 0 skipped
```

The fake-libpq transport suite also runs 30 Python test cases, all passing, without
a server or installed native library. The SQL and client suites use synthetic
embedded PGlite only. A first broader command could not start the client suite
because this worktree lacks PGlite; a temporary resolution loader then used the
existing local `@electric-sql/pglite` 0.5.8 package at
`/workspace/mip-qik-rollback-sql-boundary/node_modules/@electric-sql/pglite`.
No package installation, download, repository dependency, or lockfile change
was required. The loader maps only that one package specifier to its existing
`dist/index.js`; its remaining imports use normal resolution.

The single existing host-test adjustment expects the new exact provider refusal
before the still-empty authority registry; the existing callback, proxy, input,
source-drift, zero-spawn, rollback, recovery and uncertainty assertions are retained.
