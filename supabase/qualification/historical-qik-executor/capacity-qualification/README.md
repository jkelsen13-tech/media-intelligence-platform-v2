# Bounded historical capacity and role authority qualification

SOURCE CANDIDATE — TESTS AUTHORED, NOT RUN.
No qik installation, hosted capacity, source connection, or real-data batch is established by this package.

Origin: cc8f1b19171917351548362f82f03fa2b1684831 / tree86a7df4a95894217e4a228e9eb918985a7e99cd9.
Integration parent: ecd66e41123f9f16ec8dd38208571a25273ef093 / treeaaef4a0a53b710ef6f6d92cbffd582acefe693f4.
Existing266/83/57 qualification receipts and Cursor review of unchanged runtime remain separate and valid.
Historical manifests, source digests and acceptance assertions remain unchanged.

## Exact scope

Four capacity files exercise the original historical planner/engine and current adapter, without modifying them:
tests/historicalQikCapacity.mjs,
tests/historicalQikCapacityDeno.mjs,
tests/historicalQikCapacityMetrics.mjs,
tests/historicalQikCapacityMetrics.test.mjs.
The existing tests/historicalQikExecutorPostgres17.test.mjs adds a guarded final capacity subtest.
MIP_HISTORICAL_CAPACITY_DISPOSABLE=synthetic-pg17-only is additionally required; ordinary existing fixture behavior remains unchanged without it.

Full metadata scenario: 32768 synthetic records across both exact predecessor identities, two complete engine invocations, original inventory/fence/deterministic unit refusal.
Payload scenario: one synthetic8MiB article body; actual original acquisition and canonicalization before four measured cold Deno processes:
metadata pair, prefix/refusal, remaining transfer, exact retry.
Refusal is largest original indivisible unit minus one byte and must occur before body access.
Independent SQL verifies exact content hashes/lengths, original identities, units/receipts/checkpoint prefix and cleanup.
Synthetic route admission remains a fictional fixture prerequisite; it is not promoted to measured qualification.

tests/qikRoleLifecyclePostgres17.test.mjs independently qualifies actual PG17 implicit ADMIN issuer/revoke semantics,
a non-owner NOLOGIN issuer with exactly temporary CREATEROLE during worker creation, fixed issuer GRANT/REVOKE,
active-issuer DROP refusal, and exact savepoint removal/rollback without owner re-entry.
It does not install the application activation profile or demonstrate its effective permission contract.

## Prerequisites and ordered execution

Use ONLY the existing remote source/synthetic GitHub Ubuntu22.04 route, never the device or actual source material.
Locked Node22.14.0 dependencies via npm ci --ignore-scripts --no-audit --no-fund.
Pinned standalone Deno2.5.2, verified vendor archive, existing imports configuration and generated frozen deno.lock.
Installed /usr/bin/time is required; no installer or substitute measurement.
Existing official owned loopback PostgreSQL17.6/170006 SCRAM service is required.
The existing historical fixture creates three collision-checked owned databases and scoped synthetic roles.
No production URL or secret is accepted. Actual hosted Vault/Auth/TLS is not simulated as success.

Historical installation order is exactly the existing fixture:
bootstrap extensions transport then selected closed historical install; repeat using closed-ordinary installer against preclosed transport.
The actual contracts/install.mjs/001_historical_executor.sql, original graph/planner/engine and review/reader dependencies exercised by prior combined qualification remain pinned.
This capacity check does not claim a smaller helper as new journal/review/reader qualification.

Proposed invocation in the existing bounded job:
node --test tests/historicalQikCapacityMetrics.test.mjs
MIP_QIK_ROLE_LIFECYCLE_DISPOSABLE=synthetic-pg17-only node --test tests/qikRoleLifecyclePostgres17.test.mjs
MIP_HISTORICAL_EXECUTOR_DISPOSABLE=synthetic-pg17-only MIP_HISTORICAL_CAPACITY_DISPOSABLE=synthetic-pg17-only node --test tests/historicalQikExecutorPostgres17.test.mjs
Repeat last invocation with MIP_HISTORICAL_EXECUTOR_INSTALL_PROFILE=closed-ordinary.
Deno child is cached with --frozen beforehand and runs --cached-only --frozen.
Each capacity child60seconds maximum, four children, bounded input32MiB/output4KiB/error64KiB.
Historical fixture480seconds maximum per profile; whole existing job15minutes, always-owned-container/volume teardown.

Failure is closed: missing runtime/metrics, malformed observations, bad contents/mappings/checkpoints, wrong permissions or unobserved cleanup fail.
Threshold exceedance is retained as measured evidence, never suppressed to make a hosted route pass.
All public/processing authorization flags remain false; originals and publication sentinel must remain unchanged.

## Measurement limits and cleanup

GNU time CPU has centisecond resolution; RSS is Linux KiB converted to bytes.
Whole fresh-process observations include startup/import/stdin/connect/close; metadata pair combines two invocations.
Metadata-only fixture does not establish real PostgreSQL mapping cost at32768 records.
Acquisition/sealing are outside measured child processes.
128MiB units, actual frozen largest unit and complete frozen scope remain unmeasured.
No hosted Edge/Auth/TLS/Vault/capacity or real migration claim follows from these observations.
Supabase documented256MB memory and2seconds CPU remain actual hosted qualification gates:
https://supabase.com/docs/guides/functions/limits

The inserted synthetic body is removed in finally; all operation custody is removed by owned database teardown.
Observed child sessions must return to baseline before success.
Role probe rolls back all generated roles, drops only collision-checked owned setup roles and verifies absence.
Workflow always removes its exact owned container and volumes and checks tracked source/lock unchanged.
No upload/artifact/publication or permanent payload receipt is created.

## Initial attempt and repair

Candidate583fbda16c8db989539886125dc91e62f991a610, source2d555fe2dae5245d09024afbf3ed6f8e3f8613e9,
run36459391029/job109053827943: metric3PASS and role authority4PASS; existing historical12subtestsPASS.
New capacity subtest FAILED, parent group failure recorded; closed-ordinary step skipped, cleanup succeeded.
Synthetic metadata inventory returned generation order against the original canonical manifest.
The new fixture uses original planHistoricalArticles(...).manifest before measurement;32768records and budgets unchanged.
Two new ordinary regression tests cover exact canonical inventory and finite sanitized failure diagnostics.
Required frozen scope/hosted fit remain unproved. Repairs authored; NOT RUN as of this source candidate.
