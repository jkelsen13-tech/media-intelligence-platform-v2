# Backend client orchestration — source qualification, 2 October 2026

**SYNTHETIC / UNBOUND / NETWORK NONE. No live adapter or execution authority.**
Frozen predecessor: `1021d5c8dd6114907981994ce15d38a1daac1f4a`.
Separate lane: `codex/mip-backend-client-contract-20261002`.

This successor prepares the missing client-command orchestration that can be
built without provider access. It neither executes the held guarded DO nor
connects to PostgreSQL. It does not turn the preceding source gate, synthetic
PostgreSQL receipts, ADMIN feasibility, or owner approval into provider security
evidence. The original backend source gate remains separate and frozen.

## Deliverables and predecessor preservation

- `scripts/qualification/backend-client-contract/contract.mjs`: closed in-memory
  adapter, required-input readiness report and rollback-only state machine.
- `scripts/qualification/backend-client-contract/required-inputs.json`: exact
  predecessor/source pins, bounded synthetic client deadlines and eleven missing
  genuine input slots. No target, connection URL, password, CA path, certificate,
  provider permission, executor identity or live adapter is supplied.
- `tests/qualification/backend-client-contract-20261002.test.mjs`: consequential
  command/recovery counterexamples and exact synthetic baseline comparisons.

Held source hashes remain:

| Unchanged source | SHA256 |
|---|---|
| Guarded transformation proposal | `5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46` |
| Pre-submit deadline fragment | `2ac3ca583a82fc717cca12b9f64d40019339b3be7c2aeefb0948473a5336518d` |

`loadSyntheticManifest()` reads only those local files to verify their hashes.
It never submits their SQL. No old guarded DO, deadline fragment, historical
fixture, executed SQL, receipt, migration or existing test was edited. There is
no new SQL authority wrapper or runnable live maintenance package.

## Required inputs are not self-attested authority

`assessLiveReadiness()` always returns `ready:false` and
`UNBOUND_NO_LIVE_ADAPTER`. It reports missing versus supplied-but-unverified input
names only. Populating JSON strings/booleans/references cannot qualify execution.
The synthetic runner refuses populated live-input claims, live modes, unknown
route fields, altered source pins and invalid command deadlines before BEGIN.
An arbitrary duck-typed adapter, executor callback or URL/credential option is
rejected; the state machine accepts only the private in-memory factory instance.

The manifest leaves these genuine dependencies unbound:

| Required input | Future evidence needed |
|---|---|
| Trusted evidence/authority binding | A separately reviewed implementation that authenticates evidence provenance and binds it to exact target, source, operation and executor; not a manifest assertion |
| Fresh managed identity/all-grantor baseline | Current session/role flags, owner/RLS/policies, exact table and every column ACL including NULL versus empty, every grantor's ADMIN/INHERIT/SET rows, effective privileges and freshness |
| Private exact source/unrelated-row baseline | Exact selected boolean-id row, expected old value and unrelated false rows under the approved secure capture contract |
| Precise provider permission | Only the bound SET-only/no-INHERIT/no-ADMIN temporary membership and missing UPDATE(connection_string), with grantor/recipient/options, transaction scope and restoration approved |
| Real CA evidence | Actual approved path, digest and readability; no fabricated fixture CA is accepted as provider evidence |
| Endpoint/auditor TLS evidence | Genuine chain/hostname coverage, verify-full and distinct auditor identity |
| dblink/server-log secrecy | Actual DETAIL/error/server logging protections and permitted handling of secret-bearing diagnostics |
| Secure executor/client/window | Exact approved executor, client transport/cancellation/acknowledgment semantics, bounded window and secure capture |
| Rollback-only authorization | One exact bounded rehearsal authorization after evidence/security/authority are bound; no durable-write branch in this package |
| Independent restoration verifier | Authorized independent-session baseline comparison and unknown-state reconciliation capability |
| Exact review/package binding | Reviewed source/client/manifest hashes, predecessor disposition and fresh independent review |

The named On the Record UI is conditional product work, not a backend-retirement
or launch prerequisite established by this package. Genuine CA/TLS/log/permission
inputs remain real gates, while this source orchestration delta is complete and
reviewable now.

## Ordered command and authority contract

The adapter interprets symbolic command IDs against synthetic memory. It has no
SQL driver, network import, connect function, target route or callable injected
executor. Each submitted command must finish with the matching acknowledgment
before the next command is submitted. A private one-shot binding refuses
concurrent/repeated rehearsal attempts on the same adapter.

1. Attempt BEGIN and capture a complete baseline. A missing BEGIN acknowledgment
   is treated as potentially opened, so explicit rollback recovery is required.
2. If UPDATE is absent, require the existing owner-role ADMIN feasibility. Add
   only a distinct installer-grantor membership with ADMIN=false, INHERIT=false,
   SET=true. Preserve all original grantors/options. A conflicting original
   installer-grantor row is refused rather than overwritten.
3. Switch to the non-superuser/NOBYPASS owner only to issue the missing column
   UPDATE. No additional SELECT, broad table grant, role-flag change, FORCE/RLS
   disable, policy change or catalog rewrite is modeled. Missing existing SELECT
   is refused.
4. Reset to the existing postgres identity and verify its unchanged
   non-superuser/BYPASSRLS status. The mock does not make the owner BYPASSRLS.
5. Submit the statement deadline and lock deadline as separate acknowledged
   commands before the symbolic operation. They model the unchanged 7000ms and
   500ms fragment. Every command, including these SETs, rollback, cancel/drain and
   independent verification, also has its own bounded client completion deadline.
6. Accept only the modeled exact single selected row/single update and preserved
   unrelated rows. This acknowledgment is synthetic, not a real DO/TLS proof.
7. On success, remove only the introduced column UPDATE, reset role, remove only
   the introduced installer-grantor membership, and compare exact authority with
   baseline before unconditional ROLLBACK. Legitimate pre-existing UPDATE/SET
   needs no temporary grant/revoke and remains intact. Raw ACL NULL and '{}'
   remain distinct; unrelated column/table grants, all role flags and policies
   remain exact.
8. On abort or cleanup failure, skip further transactional cleanup commands and
   explicitly ROLLBACK. Then request a separately labeled mock independent
   comparison of full original rows/ACLs/membership/roles/settings/RLS/policies.
   That models a future separate verifier; it is not an actual independent
   PostgreSQL session.

The PostgreSQL semantics motivating these boundaries are documented in the
official [ROLLBACK command](https://www.postgresql.org/docs/17/sql-rollback.html)
and [SET ROLE command](https://www.postgresql.org/docs/17/sql-set-role.html).
The held predecessor separately proved why a deadline must be established
before submitting its guarded DO. This source delta preserves those SQL bytes.

## Timeout, disconnect and receipt semantics

A command timeout requires acknowledged cancellation/drain before rollback can
follow on the uncertain command channel. The mock fences the outstanding
generation; a late response cannot alter the restored state or become success.
If cancellation/drain lacks acknowledgment, further transactional submissions
stop and the outcome is UNKNOWN. A timed-out rollback is fenced/drained before
verification and is never silently retried.

| Outcome | Meaning within this synthetic contract |
|---|---|
| `REFUSED` | Manifest/adapter refused before attempting BEGIN |
| `REHEARSAL_ROLLED_BACK` | Operation, success cleanup, explicit rollback and full mock independent restoration all acknowledged |
| `ABORT_ROLLED_BACK` | Earlier command/baseline/cleanup failed; explicit rollback and full mock independent restoration acknowledged |
| `UNKNOWN` | Disconnect, undrained command, missing rollback acknowledgment or failed independent restoration; requires future authorized reconciliation, never automatic live replay |

Matching mock baseline after an unacknowledged rollback does not promote UNKNOWN
to success. Disconnect cannot manufacture rollback or verification receipts.
There is no durable-write branch. Returned receipts contain only fixed codes,
command IDs/statuses and synthetic acknowledgment flags. Secret-bearing mock
exceptions are mapped to `COMMAND_FAILED`; raw messages, stacks, SQL, source
values and snapshots are omitted. Adapter inspection is a fixture-only aid;
secure handling of actual provider diagnostics remains unqualified.

## Bounded qualification

Command:

```sh
RUN_SYNTHETIC_PG_QUALIFICATION=0 node --test \
  tests/qualification/backend-client-contract-20261002.test.mjs \
  tests/qualification/qik-audit-route-transform-20261002.test.mjs
```

**31 passed:** 26 new client-contract tests and five existing transform checks.
Coverage includes exact NULL/empty/pre-existing ACLs, multiple owner grantors and
options, preserved UPDATE/SET authority, missing SELECT/admin/ACL/BYPASS refusal,
abort during temporary role/membership/grant/operation, cleanup failure, separate
completed SETs, late pre-submit/operation/rollback responses, missing cancellation
and rollback acknowledgments, disconnect, secret exception redaction, lost BEGIN
acknowledgment, negative independent verification and one-shot concurrency.

`npm run build` passes with the existing browser externalization and chunk-size
warnings. `node --check` and `git diff --check` pass. Build validation does not
integrate this qualification-only module into the application. No disposable
PostgreSQL execution, Docker activation or real provider call was performed in
this delta; predecessor PostgreSQL receipts remain labeled historical evidence.

External receipts are in `/workspace/mip-backend-client-contract-receipts/`, with
source hashes and exact successor SHA/tree recorded separately. Parent review
should review this new source delta only. Before any live adapter can qualify,
the trusted binding, genuine inputs and exact rollback-only authorization above
must be established through a separate reviewed successor; this module cannot
be activated for live use by editing its manifest.

## Review followup: bind caller inputs before execution

The preceding `2f8e999045ce1c43e791554edabbc98df0d9238f` source commit and its
31-test/build evidence remain preserved. Parent review reproduced a consequential
mutable-input defect: validate a 1ms operation deadline, start the async runner,
then immediately change the caller's deadline to 500ms. A 40ms mock operation
wrongly returned `REHEARSAL_ROLLED_BACK` with its operation acknowledged. The
adapter also retained the caller's fault-plan reference: changing an original
abort to a late success and adding a bad rollback acknowledgment changed the
running outcome to UNKNOWN. Both counterexamples are retained as RED receipts.

This followup binds the complete manifest to a private inert snapshot before
validation and the first await, and binds adapter options/baseline/fault plan
before validation and factory return. Operation, pre-submit, cancellation,
rollback and verification deadlines subsequently read only those private bound
values. Neither caller mutation of a nested object nor insertion/replacement of
a fault affects the attempt. There is no mid-transaction caller-config read.

The snapshot boundary admits inert JSON-like data only. Accessors, functions,
exotic objects, cycles and cloning/inspection failures produce fixed
`MANIFEST_REFUSED` or `ADAPTER_REFUSED`; accessors are not evaluated and raw
exceptions do not enter receipts. This is a configuration-binding guarantee
inside the existing closed mock adapter, not a provider security binding or
new live capability.

The two unchanged RED assertions now pass GREEN. One additional regression
covers non-inert/uncloneable manifests and fault plans, fixed-code redaction and
zero command submission. Current bounded scope: **34 passed** (the original
31 plus these three regressions), with a fresh build, syntax and whitespace
checks. No historical guarded SQL, pre-submit fragment, synthetic fixture/receipt
or required-input manifest was changed. The separate trusted live binding and
genuine provider/security/authority inputs remain absent.

Followup receipts in `/workspace/mip-backend-client-contract-receipts/`:
`mutation-counterexamples-red.tap`, `mutation-counterexamples-green.tap`,
`client-input-binding-final.tap`, and `build-input-binding.log`. Exact successor
hashes and tested-byte chronology are retained in a separate followup manifest.
