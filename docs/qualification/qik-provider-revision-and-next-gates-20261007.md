# Qik provider revision and next gates — 2026-10-07

The original server-side dblink maintenance method is held by the provider capability evidence. The isolated successor adds an explicit fixed production HOLD and a small connection-cleanup safeguard; it does not replace the operational audit engine or authorize a qik connection. External libpq verification is supported, but cannot qualify a different server-originated audit channel.

## Authority and preserved evidence

The preserved integrated source is `a9ce6b29f46cc965fd45c9edefcb7428f3493c69`, tree `a44cabcecfb55b0f9da0921e6c7538ff3c640c64`. Public CI run `37087452319` passed 1,789 tests on each Node22/24, both builds, with Node24 audit zero. Independent review `bc-45235dbb-1587-5587-94db-e1cb2f3f0f27` was clean for its bounded source gate and explicitly not execution-ready.

The preserved original rollback package is `675654be5a778c3173e682c4013031cb7796ed36`, tree `c2b1e0cd6bdf2777fb035a060abe81970a2f8358`. Its original 18 source pins, DO and submission protocol remain unchanged. The historical native PostgreSQL17.6 24-case receipt belongs to `8316cf6742693402ca36b4b6a8a558801d0c9fb7`; it is not relabeled as qualification of this successor.

Current source work was performed only in the existing remote saved executor. The app candidate `06833f99de62877182305eda6fb034800b905f1e` and the frozen logo board were untouched. No protected state, real credential, account, certificate installation, qik connection, support message, paid service, deployment, merge, retirement or live rehearsal was used.

## Durable requirements and provider reconciliation

Current Library records were resolved and completely read before source edits: bounded handoff v21; qik prerequisite v4; exact scope v5; progress v4; original checkpoint v6; source-review packet v2; smallest access step v5; whole-platform source register v9; outside-review packet v21; public-CA and acquisition records. The Library remains the human-facing durable record and GitHub the source/CI authority.

The authenticated SU-495218 thread is `1a10bb76d10d2ea8`. Initial technical reply `1a115364f2345ce3` is dated 2026-10-07 07:14:01 UTC; owner scope clarification `1a11546d42c12d7f` is dated 07:32:05 UTC; final technical reply `1a11571c51facd28` is dated 08:18:59 UTC. Old SU-488436 and related SU-495193 were reconciled for context, not substituted for the final scoped answer. Original quoted typo “sslrrootcert” remains in the retained correspondence; normalized analysis uses `sslrootcert`.

The final answer supports external libpq `sslmode=verify-full` with the downloaded Supabase CA for chain and hostname verification. For managed server-side dblink the provider offers no supported customer-accessible trust file, does not guarantee the managed system store as a stable interface, and cannot confirm a supported verify-full configuration for this endpoint. This is an unsupported/unconfirmed interface finding, not proof every conceivable hosted architecture is impossible. Password authentication and server trust verification are separate; client `sslcert` authentication is not the requested mechanism.

No documented dblink exposure/retention/redaction matrix was supplied. Project-log visibility and help with a specific synthetic failure do not establish absence from every provider system. Encryption and `pg_stat_ssl.ssl=true` alone do not prove chain/hostname verification. No further support message or provider experiment was sent.

## Changes and coherent integration

Bounded implementation commits were `516b910628de1251a0f91952c127c3447b902cd2` (provider HOLD) and `6679e266309485786fdfcc768f83f47dc65b9b98` (synthetic failure qualification and cleanup). Their separate receipts remain preserved. The integration reconciles native/host pins and updates the policy's historical-source status; the exact review head/tree and CI belong in the accompanying external candidate manifest.

The fixed bridge refuses `PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD` before authority import, runtime fingerprints, private handoff, child spawn or connection. It reads two fixed public JSON paths; a bridge-pinned lock pins the evidence. Caller claims, alternate paths, callbacks, accepted-looking future roots and modified/repinned evidence cannot lift the HOLD. Authority/runtime/rollback/recovery gates remain separately required. Local hashes are integrity checks, not immutable-host attestations.

`PrivateTransport.finish()` sanitizes Python cleanup exceptions and closes local state; `connect()` preserves its original sanitized refusal if cleanup also fails. The reproduced precursor uses a fake Python `PQfinish` raising a marked error. The real native signature is void(PGconn*), so this is defensive source hardening, not evidence of a native/provider credential leak.

## Operational consumer recovered and mapped

Ten historical files at exact source `948f83d050ec6b15badd9aa96d867e2840e54840` were recovered through the authorized GitHub app. Complete bytes matched the tree's Git blob IDs, with SHA256/size receipts. They are historical source, not current installed-definition observations.

The full property trace is [qik-audit-consumer-property-trace-20261007.md](qik-audit-consumer-property-trace-20261007.md). Critical sources are [009 factual enforcement](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/948f83d050ec6b15badd9aa96d867e2840e54840/supabase/qualification/mip-cutover-authority/009_factual_enforcement.sql), [atomic install](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/948f83d050ec6b15badd9aa96d867e2840e54840/supabase/qualification/qik-comparison-adapter/atomicInstall.mjs), and [managed policy](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/948f83d050ec6b15badd9aa96d867e2840e54840/supabase/qualification/native-provisioning-compat/managedPolicy.mjs).

The publication BEFORE INSERT/UPDATE trigger invokes the protected factual logger for invalid published claims. The logger reads the stored singleton URI, calls the installer-owned security-definer transport shim, then provider-owned raw dblink_exec. The distinct `mip_native_audit_v1` session commits a minimal rejection_audit INSERT before the publication trigger raises its fixed rejection. Audit failure still rejects publication. The audit row has no FK to an uncommitted outer explanation.

This is more than a second TLS vantage. The remote auditor has only schema USAGE and rejection_audit INSERT with an insert-only RLS policy. It has no audit/config SELECT, configuration write, update/delete/truncate, material, raw-schema or owner capability. Protected factual functions, shim/raw dependency, roles, RLS/FORCE RLS and immutable audit history must remain intact.

The maintenance DO probes only remote identity and SSL before its local UPDATE. It does not run the logger, test audit INSERT/RLS, reread committed route, or prove autonomous retention. Separately, `qualifyComparisonAudit` calls audit_probe(true), ROLLBACKs, begins again and requires audit_probe(false) to find the retained event before a separate qualification receipt COMMIT. That later write/receipt is not part of the rollback-only maintenance approval.

## Functionality-preserving architecture assessment

| Candidate | Present finding |
| --- | --- |
| A: remove all dblink and preserve required properties | Not established. Removing just the rehearsal SELECT leaves operational dblink. Same-transaction INSERT/outbox/NOTIFY loses the audit on publication abort. Client-only catch-and-log misses admitted SQL callers and changes before-error/crash semantics. |
| B: retain dblink solely for autonomous transaction while another supported boundary provides trust | A real non-trust purpose is identified, but no authenticated supported local/gateway/outbound trust boundary is established. External verify-full on another socket does not authenticate this dblink channel. |
| C: required functionality impossible on hosted Supabase | Global C is not established. The exact old server trust method is held, and specific substitutions fail; neither proves every supported hosted design impossible. |

A wider mediated publication/durable audit architecture might be technically possible, but would change admission/caller controls, credential custody, payload delivery, synchronous acknowledgment and failure/crash semantics. It cannot inherit this one-column maintenance approval or be implemented as a silent second publication engine. No product-policy reopening or security weakening is proposed.

## Qualification and limits

The integrated focused suite passed 90/90 on Node22.23.3 and Node24.19.0, zero failures/skips/cancellations. It includes policy/source drift, future-looking authority refusal with zero runtime/private reads/spawns/network, inherited PGlite rollback/client SQL regressions, original 30 Python fake-libpq cases, and the new synthetic failure package.

The new package runs 53 Python probes and 21 pipe/controller probes, plus actual closed-child argv/environment and CLI refusal checks. Two injected direct-private status/transaction-status Python faults remain explicitly unqualified; their marked tracebacks are contained by the worker. The probe count includes those limitation checks and is not a claim every direct API exception is credential-safe. Cause-labeled fake authentication/CA/hostname errors are not real handshakes.

No usable approved native PG17 server fixture is present. Server executables/directories are absent; the local Docker socket exists but its read-only inventory contains zero containers. No fixture was created or started. Installed libpq17.11/42-symbol inspection is ABI availability, not native TLS/auth/cancel qualification. Provider logs and internal telemetry were not observed.

Full exact-source Node22/24 regression/build/audit and fresh independent review are recorded separately when completed. Source/synthetic, native, hosted, owner-device and execution gates stay distinct. This report is not a security certification or permission to install or execute.

## Public certificate custody

Authenticated parent Dashboard acquisition on 2026-10-03 02:17:57 UTC recorded the public Supabase Root2021 CA in Library `libfile_1c3506ff7f20819187236b55c15cd47d` v0 and acquisition ZIP `libfile_15fecbc4c0c081919232648d2208f240` v0. Parent-attributed PEM: 1,367 bytes, SHA256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`; DER fingerprint `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`. Parent record: 2021-04-28 through 2031-04-26 validity, CA=true and certificate/CRL signing. These metadata were read, not independently reparsed from PEM here.

Current supported Library materialization failed before transfer because the remote Library connection was unavailable. Library API text reads succeeded, but public certificate bytes and acquisition ZIP did not materialize. A read text/size discrepancy from final LF omission is not original-byte qualification. No denied URL was retried/bypassed and no CA was installed. Public acquisition closes parent custody only; consumer bytes, endpoint/rotation/current-version binding and any actual handshake remain separate.

## Smallest remaining gates, in order

1. **Current candidate source gate:** exact coherent GitHub head/tree, Node22/24 receipts and fresh independent Cursor review. Source review grants no execution, merge or deployment authority.
2. **Public artifact delivery:** restore supported remote Library transfer of the existing public PEM/acquisition ZIP; verify hashes, ZIP manifest, parse/validity and parent endpoint binding. This needs no new product decision or paid provider.
3. **Nonlive native qualification:** use an already approved isolated PostgreSQL17 fixture with marked dummy credentials to exercise real TLS hostname/CA/authentication, native timeout/role/database failure, cleanup, encrypted cancellation/original drain and distinct verifier. New fixture/server/certificate/credential creation is outside the present boundary.
4. **Consumer correspondence:** a separately authorized, exact SELECT-only current catalog observation can compare compiled reviewed public expectations internally and return fixed booleans. The prepared trace templates do not read connection_string, passwords, audit rows, call installed routines or invoke dblink. PostgreSQL17 canonical expected definition hashes/profile must be prepared first; no actual definition/config/hash is printed. Owner/role/grantor/RLS/FORCE/ACL/trigger/shim/raw/manifest correspondence also remains required.
5. **Supported operational channel:** establish an actual provider-supported authenticated boundary preserving autonomous audit, admitted SQL coverage, minimal payload and least privileges; or prepare a broader property-equivalent source proposal under explicit compatible scope. The server trust interface/logging matrix remain external facts, not arbitrary owner preference.
6. **Accepted private execution bindings:** all eleven frozen inputs remain unbound; the production registry is empty, runtime false and private handoff unbound. Exact trusted issuer/root/revocation, host clock/artifact/runtime, identities/grantors/private rows, narrow SET/column UPDATE authority, channel trust/logging, capture/window, independent verifier, exact hashes and one-attempt owner authorization must be real evidence. Populated claims do not grant trust. The provider HOLD additionally requires a reviewed supported-method revision.
7. **Only then prepare a new exact rollback authorization:** name one attempt, target true row/connection_string, precise introduced postgres-grantor SET-only membership and owner-granted UPDATE(connection_string), deadlines separately ACKed before DO, no policy/RLS/general table privilege changes, and mandatory cleanup/ROLLBACK. Never reuse original approval for changed bytes or consumers.

## Recovery semantics preserved for any future reviewed attempt

No COMMIT occurs in the rollback rehearsal. Every begun attempt must terminate the original command, drain its acknowledgment, restore introduced grants by exact grantor and ROLLBACK. Successful completion is not inferred from cancel dispatch, closed connection or equality alone. Primary private row/security equality plus a distinct read-only command-inventory verifier and primary backend/transaction/advisory-lock completion are required.

`REHEARSAL_ROLLED_BACK` or `ABORT_ROLLED_BACK` requires complete acknowledged restoration evidence. Missing/ambiguous command acknowledgment, verifier or completion evidence yields `UNKNOWN`, even if later equality appears correct. No replay, automatic retry, COMMIT, cutover, persistent audit-qualification receipt, pipeline activation, historical-data disposition or predecessor retirement is authorized.

A successful future rehearsal unlocks preparation and review of a later exact persistent route COMMIT package only. Persistent route change, autonomous audit-write qualification/receipt, operational live consolidation, historical disposition and retirement remain separate finish lines. There is no execute-now owner rehearsal request while the earlier gates remain open.
