# Qik private host/controller source — 2026-10-03

The bounded controller and Node-to-Python private pipe integration are implemented
as source. Production execution remains unavailable. The operational CLI inspects
public source only; it has no run, connect, credential, module, or activation flag.
This work made no database connections or mutations and obtained no credentials.

## Frozen package and implemented source

The work starts at frozen675 `675654be5a778c3173e682c4013031cb7796ed36` and imports
the existing `backend-live-rehearsal/package.mjs` `buildSubmissionBundle()`.
The original package, SQL boundary, submission protocol, and deadlines are
unchanged. This is a controller around their exact submissions, not a second SQL
maintenance engine.

The guarded DO remains 7,101 bytes, SHA-256
`5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46`.
The original deadline fragment remains SHA-256
`2ac3ca583a82fc717cca12b9f64d40019339b3be7c2aeefb0948473a5336518d`.
The two separately completed submissions are still `SET LOCAL statement_timeout =
'7000ms'` and `SET LOCAL lock_timeout = '500ms'`, followed by the fixed observation
of identity, privileges, and both settings before the DO.

| Source | Implemented behavior |
| --- | --- |
| `source.mjs`, `artifact-lock.json` | Hold and deeply freeze the exact bundle; check original source pins and host bytes twice; produce public artifact descriptors. |
| `integration-lock.json` | Pin the final native transport/inventory and authority modules/empty registry. Authority bytes are checked before importing its production loader; native bytes are checked before transport mapping/spawn. |
| `controller.mjs` | Fixed success/failure ordering; typed completion/tag/shape/transaction observations; private parameter bindings; minimal authority planning; one DO and one rollback attempt; distinct recovery verification. |
| `bridge.mjs` | Internal production port maps that controller to two separate fixed Python workers and private pipes. Fixed executable/module locations and phase IDs; no caller adapter, SQL, connection URL, script, callback, or driver option. |
| `private-pipe.mjs` | Actual single-request framing/lifecycle used by the bridge; bounded frames, sequence checking, malformed/extra-output termination, fixed error suppression, pending-request exclusion. Its closed stream tests confer no authority. |
| `private_worker.py` | Import-only bounded private framing loop maps fixed command IDs and serialized parameters to the real native transport API. Primary and verifier have separate workers and capability inventories. No executable main or credential CLI. |
| `closed-fixture.mjs` | Fixed test-only response/transaction model, with inert fault descriptions. It cannot issue production authority or qualify PostgreSQL/libpq. |
| `inspect.mjs` | The only operational entrypoint: offline public source inspection. |
| `inert.mjs` | Host-owned recursive Proxy rejection before reflection, then inert clone validation; frozen675's inherited helper is unchanged. |

The peer source pins correspond to native transport commit
`a39e901ede2111a311ff610bfd25d208052a52dd` and authority commit
`9cc46a5c536cdd0c8a4709e795c67aa79919cd49`. Native transport source SHA-256 is
`d2669a2fec291aa12d61e5c4d55be729a785ce91658df363402b43c43498b0d0`;
its fixed submission inventory is
`09b6e70225313ae00428219ba86cc945c82dccdce29b8b84681caef0aebf959f`.
Local byte equality remains source inspection, never external source approval.

## Controller and recovery boundaries

The controller marks BEGIN uncertainty before awaiting its acknowledgment. It
accepts a completed command only with the exact command tag, transaction status,
column names, PostgreSQL type OIDs, row count, and required values. Every frozen
boolean postcondition must be exactly `true`; false, NULL, missing/extra columns,
wrong OIDs, and additional rows refuse the next dependent submission.

Public counts and private guard observations must agree. The existing
`deriveMinimalAuthorityPlan` must accept the complete captured baseline before
temporary authority is introduced. Its current precise baseline requires missing
column UPDATE, absent postgres-grantor transient SET membership, the exact
provider grantor/options, and retained SELECT. Broad UPDATE, existing transient
membership, ambiguous grantors, or missing SELECT are refused. Cleanup uses only
the original fixed correct-grantor REVOKEs and follows acknowledged transformed
row verification. No SELECT or grant option is introduced.

Private row and security baselines remain in host memory outside transaction
rollback. The private security capture must equal the public catalog capture
after removing only `private_security_details`. The same captured private values
bind transformed comparisons, rollback comparisons, authority restoration, and
same-primary settings/security observation. Receipts contain no private values,
credential hashes, parameter values, raw errors, or tracebacks. Clearing references
and overwriting framing buffers does not prove zeroization of JavaScript/Python
strings; an approved private host memory/capture policy is still required.

Uncertain primary completion is fenced by cancel/drain before rollback. Separate
`cancelDispatched`, fixed `cancelCode`, and `originalDrained` observations prevent
a successful original drain from claiming cancellation succeeded. A failed cancel
may still permit rollback after a genuinely quiescent original drain. Failed drain
prevents queueing rollback. A timed-out or invalid rollback acknowledgment is never
retried and remains UNKNOWN even if a separate verifier finds equality.

Every begun attempt goes through the distinct verifier authorization gate,
including primary disconnect, failed cancellation, missing baselines, and lost
rollback acknowledgment. Fresh recovery authority is checked before opening its
worker/connection, before each comparison, and before the final verified decision.
An expired or unavailable recovery scope refuses connection, records the attempted
gate, and requires external recovery. No stale execution grant authorizes recovery.

The verifier worker is separate from the primary request queue. It only has the
three frozen independent SELECT commands. Transport metadata checks distinct
connection IDs, database, authenticated PQuser, host/address/port, and the native
TLS/target match observations. The private security comparison later establishes
actual SQL identity/security equality, excluding only verifier-local deadlines.
The same primary connection must separately observe its original settings after
acknowledged rollback. PID plus backend start identify the original backend for
transaction/advisory-lock completion checks.

The Node pipe cannot dispatch cancellation while Python is still inside the
original serial request. Native observation has a nominal 10-second budget and
the host a 12-second budget, but that ordering is not a qualification guarantee.
If the outer host budget expires first, the production port terminates the
uncertain primary, queues no rollback, and opens the independently authorized
verifier worker separately. Closing the primary supplies no rollback ACK and the
result remains UNKNOWN. The closed controller fixture's directly callable cancel
model does not prove this real pipe timing or real encrypted cancellation.

At connect, metadata explicitly says `sqlIdentityObserved:false` and
`serverReadOnlyObserved:false`. Authenticated PQuser and matched transport fields
do not assert SQL `session_user`/`current_user`, the project identity, or a server
transaction-read-only setting. `clientReadOnlyInventory` describes the restricted
client command inventory. No new SQL probe was added to the frozen bundle, and no
server read-only GUC qualification is claimed.

## Production authority and private handoff

The production loader is fixed. Its checked-in accepted root registry is EMPTY.
It returns `TRUST_ROOT_UNBOUND` and never grants live authorization. The separate
candidate verifier performs real cryptographic/context checks and always returns
`trusted:false` / `liveAuthorized:false`; its result is not consumed as production
authority. The closed model's test authority is also never accepted by the
production port. Eleven populated input claims, supplied callbacks, and caller
roots cannot promote inspection or the test model.

The production port refuses before private handoff, child spawn, native library
loading for connection, or connection creation. Both bridge and worker keep
`PRODUCTION_RUNTIME_BOUND = false`; there is no external activation input. The
fixed private handoff function has no accepted issuer/route and refuses rather
than reading argv, environment variables, files, URLs, or caller credentials.
When a future host has actual accepted evidence, source wiring is already present
for separate primary/verifier handoff through memory and inherited private pipes.
The private controller entrypoint remains unexported and uncalled operationally.

Before any future spawn, fixed production authority must bind the exact held
host/frozen/peer source artifacts, exact observed native source hashes, and public
Node/Python/libpq executable/library fingerprints. It must attest immutable
deployment, trusted clock, and private runtime binding. Public fingerprints alone
are inadequate. Source files being reread cannot establish filesystem/runtime
immutability or prevent privileged concurrent replacement.

The remaining unavailable facts are specific:

| Required accepted fact | Current state |
| --- | --- |
| Production root key IDs/public keys, issuer policy, allowed algorithms, target/operation/source scope | No accepted production roots or issuer policy exists in the registry. |
| Authoritative issuer/collection route for all eleven inputs, including fresh private row/security baselines and exact reviewed artifact approval | No actual issuer/route or genuine evidence is bound. |
| Revocation issuer/delivery route, freshness policy, durable monotonic checkpoint store | All registry bindings are null. Pure candidate revocation checks confer no trust. |
| Trusted clock source, allowed skew, exact signed execution and recovery windows | No accepted clock binding; fixture expiry tests are synthetic. |
| Immutable deployment attestation for Node/Python/libpq/dependencies and the trusted private host's memory/capture policy | Source exists; accepted deployment/runtime attestation is absent and activation guards stay false. |
| Private credential handoff issuer and inherited pipe/memory route for the already-approved primary and distinct verifier identities | No accepted issuer or route exists. The source refuses without reading credentials. |
| Actual qik provider grantors, permissions, exact source/baselines, CA readability/digest, certificate chain/hostname, distinct auditor TLS, dblink/provider/server-log secrecy, bounded owner authorization, approved window | None is newly qualified by this work. No connections or secret-dependent observations were made. |

These facts cannot be manufactured by filling claims, generating test roots, or
enabling a flag. No new credentials, accounts, installations, paid resources,
denied routes, or Cursor were used.

## Offline validation

Run public inspection with:

```sh
node scripts/qualification/backend-private-host/inspect.mjs
```

`--run`, `--connect`, and `--activate` are refused. In the host-only source
worktree, peer authority files are absent and inspection reports
`AUTHORITY_SOURCE_UNAVAILABLE`; with the exact integrated peer source it reports
`TRUST_ROOT_UNBOUND`. Both states refuse production execution before spawn.

`node --test tests/qikPrivateHost.test.mjs` passes 29 tests without skips. Tests
exercise exact phase order/deadline observation; each required boolean independently
false/NULL; missing/extra columns, wrong OIDs, extra rows, wrong tags, incomplete
ACKs and transaction states; pre-phase expiry/revocation; rejected baselines;
private baseline reuse/leak prevention; exceptions, timeout/cancel/drain ordering;
primary disconnect; unknown rollback acknowledgment; distinct verifier/primary
settings/PID-start checks; expiry before verifier connect and final decision;
populated claims/callback/root rejection with a spawn counter; top/nested Proxy
refusal with zero trap calls; actual pipe fragmentation/pending exclusion,
malformed/extra/sequence/oversize refusal, diagnostic suppression, disconnect and
write-failure cleanup, and independent verifier pipe after primary termination;
immutable in-memory
bundle behavior; altered original/host/peer source; CLI and worker activation guards.

The positive journey is a closed in-memory model. It uses no genuine PostgreSQL
server, native client connection, live TLS/dblink auditor, provider logging,
real execution window, or genuine private baseline. The native peer supplies actual
libpq17 transport source; its separate local library inspection establishes only
installed client/library availability. This document does not claim a live client,
controller, authority, or database qualification.

The broader inherited `qikRollbackClientPackage.test.mjs` suite was also attempted
in this host-only worktree. It could not start because `@electric-sql/pglite` is
absent. No dependency was installed; this is a validation environment limit, not
a passing inherited-suite result.

External public receipts are under
`/workspace/mip-launch-receipts/qik-private-client-source/host/`.
