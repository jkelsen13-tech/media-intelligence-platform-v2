# Collector algorithm-shadow SQL qualification

This directory is isolated design and test evidence. `contract.sql` is not a
migration and must not be applied to qik, yhb, jfn, nie, or any other live
project. It deliberately creates no scheduler, provider, HTTP, publication,
predecessor acknowledgement, or canonical-domain mutation path.

The contract addresses the next reversible design step for the non-deployed
`collector-algorithm-shadow-candidate`: database-selected immutable input,
direct-login identity, exact request replay, leased completion, revocation
fencing, and explicit expired-lease recovery. It does not prove production
provenance, rights approval, host isolation, journal security, or operability.

## Required pre-existing qualification roles

The SQL intentionally does not provision credentials. A disposable test
database must create these roles first:

- `mip_shadow_store_owner_v1`: `NOLOGIN NOINHERIT`, owns private schemas and
  tables only.
- `mip_shadow_worker_fn_owner_v1`: `NOLOGIN NOINHERIT`, owns only the three
  worker entrypoints.
- `mip_shadow_authority_fn_owner_v1`: `NOLOGIN NOINHERIT`, owns admission,
  session, revocation, and recovery controls.
- `mip_shadow_runtime_a_fixture` and `mip_shadow_runtime_b_fixture`: independent
  `LOGIN NOINHERIT` qualification identities. Production must provision a
  separate restricted login for every runtime incarnation instead of reusing
  these fixture names.
- `mip_shadow_admitter_fixture` and `mip_shadow_recovery_fixture`: separate
  qualification control identities.
- `anon`, `authenticated`, `service_role`, and `authenticator`: negative-test
  identities with no contract access.

None of the login roles may be a member of an owner role. The runtime logins
receive only schema usage and execute on `shadow_claim`, `shadow_complete`, and
`shadow_fail`; they have no private-schema usage or table DML. Caller-supplied
runtime/session values are selectors. Authentication is the direct PostgreSQL
`session_user`, bound to the runtime and a short-lived owner-issued session.
PostgREST, `service_role`, a shared database writer, or a hosted process that
also possesses a broader project credential does not satisfy this boundary.
The contract fails immediately when a shadow role is missing, inherits,
participates in role membership, or has superuser, `BYPASSRLS`, role/database
creation, or replication authority.

## Authority and immutable admission

An authority operator registers source, retained capture, rights,
implementation, and configuration revisions. Admission assembles the exact
worker envelope from those rows. A worker cannot assert its own source, URL,
bytes, rights, method, predecessor, or configuration. The stored config digest
is an approved canonical digest; it is not recomputed with PostgreSQL
`jsonb::text`, because the JavaScript canonicalizer has a different byte
representation.

Qualification fixture approval is not evidence that production source
provenance or rights approval exists. Production integration must bind the
contract to actual canonical authority records without duplicating those
systems.

Every worker operation takes a shared authorization-fence lock and rechecks
the direct login, runtime binding, session, source, implementation, and current
rights. Relevant authority changes take the exclusive fence lock. Revocation
is complete only after that transaction commits. Acceptance is linearized at
the final locked database checks; arbitrary clients can otherwise hold a
transaction open beyond a wall-clock lease deadline.

Every entrypoint requires `READ COMMITTED`; old-snapshot isolation modes are
rejected. Runtime and session authority are checked again after potentially
blocking request and job locks. Rights, session, runtime, source,
implementation, and configuration authority each have an explicit one-way
revocation/retirement path; retired revisions cannot be reactivated in place.

## Replay and recovery policy

Request UUIDs are globally unique. A replay with a different operation,
principal, runtime, or argument digest fails. A claim replay never discloses a
lease token: it returns only a generation/attempt receipt. A lost claim token
is recovered only after expiry through the separately authorized
`requeue_expired` control, followed by a fresh claim with a new token and
attempt. Tokens are stored only as hashes in PostgreSQL.

The database recomputes a digest over PostgreSQL's retained JSON byte
representation. The worker's JavaScript canonical digest is retained
separately as an assertion and is not described as independently verified by
SQL.

The remote journal still has to retain a plaintext lease token and completion
arguments for exact recovery. Its access control, encryption, atomic `putOnce`,
concurrency, log redaction, corruption handling, and retention policy remain
independent deployment gates. A JavaScript `assertSecurity` call is not proof.

## Current native qualification result

GitHub Actions run `35530600346` passed all 25 tests against an isolated native
PostgreSQL 17.6 service. It used distinct direct-login connections and covered
effective identity; owners, default ACLs, forced RLS, and runtime grants; role
escalation and foreign-caller denial; `SKIP LOCKED`; rollback attempt
accounting; exact replay without token/input disclosure; atomic completion;
complete/fail and rights-revocation races; authority rechecks after blocking;
session expiry; expired-lease requeue with token rotation and bounded attempt
exhaustion; deterministic backend termination before and after commit; and
committed-state persistence over a graceful database restart. The expanded
matrix also covers source, session, runtime, implementation, and configuration
authority-first rollback/commit plus worker-first replay ordering, rights
rollback, effective future-function default ACLs for all three owner roles, and
a same-cluster custom logical dump/single-transaction restore that compares the
bounded catalog, owners/ACLs/RLS, functions/policies, sequences and every
private history before exercising replay, denial, claim, and a new recovery
event on the restored database.

That result proves a bounded PostgreSQL core contract only. It does not prove
the Supabase authenticator/pooler identity path, the intended target's complete
reachable privilege graph, authentic source/rights approvals, the remaining
claim/fail revocation matrix, production credential or host isolation, remote-journal
security, fresh-cluster/global-role reconstruction, predecessor recovery, PITR,
or crash recovery. The same-cluster rehearsal is intentionally narrower than
those gates.

## Required qualification before any deployment proposal

PGlite tests establish constraints, grants, deterministic state transitions,
rollback, replay, and wrapper integration. The bounded native PostgreSQL result
above adds direct-login contention, selected revocation races, `SKIP LOCKED`,
backend termination around commit, graceful restart persistence, and the
qualification database's actual owners/default privileges. A target-shaped
Supabase restore must still verify pooler/authenticator identity, all exposed
schemas and extensions, the complete effective privilege graph, the remaining
revocation cases, crash behavior, and dump/restore recovery.

The complete reachable privilege graph must also be audited. Every role
inherits `PUBLIC`; an unrelated callable security-definer function elsewhere
in a database can defeat the narrow three-function grant. Production
provisioning, credentials, an isolated host, authentic approvals, deployment,
scheduling, and cutover are owner-gated. The current yhb collector remains
authoritative and active until those gates and end-to-end parity/recovery are
proven.

The former isolated September 22 demo is excluded from this design and from
all acceptance criteria.
