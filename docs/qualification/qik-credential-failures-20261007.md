# Synthetic credential-failure qualification — 2026-10-07

This document records the credential-only worker candidate `6679e266309485786fdfcc768f83f47dc65b9b98`. The coherent successor has now reconciled the native/host integration pins; this historical worker receipt is preserved within its own scope. Current integrated status is in [qik-provider-revision-and-next-gates-20261007.md](qik-provider-revision-and-next-gates-20261007.md).

This package starts from source `a9ce6b29f46cc965fd45c9edefcb7428f3493c69`, tree `a44cabcecfb55b0f9da0921e6c7538ff3c640c64`. It exercises the existing libpq transport, private worker, private pipe, closed controller and production refusal gate with marked dummy credentials and fake C functions. No qik connection, real credential retrieval, provider support message, paid spend, server installation, image acquisition, account creation, certificate creation or trust mutation occurred.

The actual native transport source receives one cleanup repair. `finish()` now converts Python exceptions from connection release to fixed transport codes while retaining closed local state. `connect()` preserves its original refusal when cleanup also fails. The reproduced precursor was a credential-bearing Python exception supplied by a fake `PQfinish`, overriding the original refusal. The real C signature is `void(PGconn*)`; this does not demonstrate a native libpq diagnostic, real credential leak, or provider leak. The frozen DO, source lock and command inventory are unchanged. Host integration pins must be reconciled by the parent lane before combining this native-source change with the host package.

## Executed synthetic matrix

| Cases | Existing callable boundary | Observation | Count |
| --- | --- | --- | ---: |
| Authentication, hostname verification, untrusted CA, missing CA, rejected role, rejected database | `PrivateTransport.connect()` and closed worker loop | Fake polling failure produces fixed transport/worker refusal; no marked credential in console, displayed traceback or reply | 12 |
| URI in host/user/database, relative CA path, NUL in password | Transport input validation and closed worker loop | Refused before fake `PQconnectStartParams` | 10 |
| Password environment input | Transport connect | Environment rejected before C call and left unchanged | 1 |
| Connection timeout | Transport and closed worker with fake clock/readiness | Fixed timeout/worker refusal and connection release | 2 |
| Host, role and database target mismatch | Transport native target comparison | Fixed target refusal; raw copied private values absent from displayed traceback | 3 |
| TLS unavailable after connect | Transport | Fixed TLS refusal | 1 |
| Connect-start, polling and nonblocking exceptions | Transport | Credential-bearing fake exceptions become fixed codes | 3 |
| Query submission exception, interruption and exit | Transport execute | Fixed codes; outstanding uncertainty retained | 3 |
| Native error result and malformed query parameters | Transport execute | Error result freed/drained; malformed parameters never sent | 2 |
| Notices, private representations, native diagnostics | Actual no-op callback and concrete library binding | No notice output; private representation omits values; diagnostic/trace symbols unavailable | 1 |
| Release exception, interruption and exit; failed-connect cleanup for each | Transport finish and connect | Cleanup repair returns fixed codes and preserves original connect refusal | 6 |
| Post-connect query exception and final cleanup exception | Closed worker loop | Worker replies contain fixed outcomes and release is contained | 2 |
| Malformed JSON, unknown operation, wrong session | Worker protocol | Fixed refusal without input echo | 3 |
| Unbound runtime and credential CLI argument | Worker public guard and in-process inspection CLI | Guard precedes input consumption/C calls; inspection refuses operational arguments | 2 |
| Injected status/transaction-status precheck faults | Direct private execute API and closed worker | Direct Python-fault tracebacks contain injected markers; worker contains both; native reachability unqualified | 2 |
| Child/stdin/stdout errors, write callback/throw, malformed/out-of-sequence/extra/nonbuffer/error replies | Actual `FixedPrivatePipe` with closed streams | Fixed errors and private frame wipe | 10 |
| Credential in operation, accessor/proxy payload, oversize frame, pending request/termination errors | Actual pipe | Fixed refusal; accessors/proxy traps not invoked | 5 |
| Private error during BEGIN, operation, cancellation, rollback and verifier security check | Existing closed controller | Public structured outcomes omit the fixture's private row/configuration markers | 5 |
| Credential options at production gate | Actual bridge public functions | Refusal without child spawn or live authority | 1 |

The receipt runner reports 53 Python probes and 21 pipe/controller probes, zero failures and zero skips. The focused Node suite adds a separate inspection-CLI subprocess check and an actual closed-child `/proc` check: marked input is retained in the child's memory while its process arguments and minimal environment contain no marked credentials. The worker's unchanged production guard consumes none of that input. This is evidence about this synthetic child invocation, not qualification of the unavailable production handoff. The four focused Node tests pass; the existing five Node transport regressions, including all 30 original fake-C Python tests, also pass. The exact-source validation uses the existing Node 22.23.3 binary at `/workspace/mip-runtime22/node_modules/node/bin/node`; no runtime installation occurred.

Authentication/CA/hostname cause names label deterministic fake poll failures. They do not prove that real native certificate verification, authentication, timeout, network or rejected-role/database behavior was exercised. The private pipe intentionally carries private success data and is not a generic credential scrubber; these probes inspect failure replies and public controller outcomes. Two direct private precheck methods still propagate our injected credential-bearing Python exceptions. Their reports contain booleans and function names only, and explicitly retain `nativeReachabilityQualified: false`. No credential content, digest or exception text enters the reports.

## Native PostgreSQL 17 remains blocked

`psql`, `postgres`, `initdb` and `pg_ctl` are absent from PATH. `/usr/lib/postgresql` and `/var/run/postgresql` are absent. The local Docker socket exists, but an explicit read-only inventory of all local containers returns zero containers. No usable approved isolated PG17 server fixture is available. No container was created or started and no acquisition was attempted. Installed libpq 17.11 symbols are local library evidence only.

Real PG17 authentication failures, hostname/CA verification, malformed native parameters, rejected role/database, native timeout, post-connect failures, cancellation/drain and disconnect behavior remain unexecuted here. Server/provider logs and internal provider telemetry were not observed. This package makes no claim that credentials are absent from those systems. Historical native PostgreSQL 17.6 qualification remains exactly the earlier 24 cases at `8316`; those files and results are unchanged.

## Reproduction and evidence

```sh
node --test tests/qualification/qik-credential-failures-20261007.test.mjs
node --test tests/qikPrivateLibpqTransport.test.mjs
node scripts/qualification/qik-credential-failures-20261007/run.mjs --report-json
```

Logs and receipts are outside the checkout at `/workspace/mip-qik-provider-revision-20261007-evidence/credential-qualification/`: focused test TAP, transport regression TAP, Python and pipe matrices, combined source-pinned receipt, installed-library inspection, server/Docker fixture availability and final commit receipt. The source-pinned receipt identifies the exact committed source/tree, worktree state and exercised file hashes. This package grants no live authorization.

## Proposed customer-visible project-log entry

Completed a nonlive synthetic qualification of credential-failure handling through the existing transport, worker and pipe boundaries. The matrix covers 53 Python probes and 21 pipe/controller probes, with zero failures or skips, plus process-argument/environment and inspection-CLI checks. A small connection-release safeguard preserves fixed-code errors when cleanup fails. Two additional injected faults in direct private status checks remain unqualified and are contained by the worker. No qik connection or real credentials were used. Native PostgreSQL 17 server qualification remains blocked by the absence of a usable approved fixture; the earlier 17.6 qualification of 24 cases at `8316` is unchanged. Provider telemetry was not observed.
