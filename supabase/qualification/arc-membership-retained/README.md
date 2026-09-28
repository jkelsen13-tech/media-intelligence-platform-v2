# Historical-public immutable arc input qualification

Source successor to exact candidate ea4e771d9948a8767ef2f0e7654367f70e9016f9.
This directory implements private historical-public input retention and original
readback. It does not implement native admission, score persistence, qik guarded
approval, publication, automatic release, or hosted installation. Native mode
fails before connection, source access, or writes. No supplied capture reference
can convert a public row into native authority.

## Producer and consumer

The producer is admitHistoricalArc in retained.mjs. It opens a fresh owned
PostgreSQL connection and repeatable-read read-write transaction, selects the
complete bounded scorer input with the same explicit projections and keyset
paging as arc-membership-prepared/prepare.mjs blob
e32d65d45cefe43125e6bf617a4ab6aff92308fd, checks a mandatory expected complete
input SHA from preparation, and admits one canonical input representation.
No reviewed prepared file is changed and no pg implementation is monkeypatched.

SQL admit_input independently compares projected values and complete
member/entity context sets to the same transaction snapshot before inserting.
No SECURITY DEFINER visibility change occurs during these source comparisons:
the adapter explicitly SET LOCAL ROLE mip_arc_retained_owner, and admission
is SECURITY INVOKER. The source relations are pinned ACCESS SHARE before their
effective SELECT and RLS configuration is checked. Only ordinary source tables
with RLS disabled are supported by this qualification. Any RLS-enabled table is
refused, even if the supplied context might happen to be complete. This is a
deliberate completeness boundary, not permission to disable hosted RLS.
An authoritative hosted RLS reader remains a separately qualified prerequisite.

The consumer readHistoricalArc reads the generation's original retained input,
validates its version/blob/hash/canonical encoding and full shape, and invokes
the unchanged recovered arc-membership-run/lib.js scorer
08ce23092cfbbe8dcb7eb7c26cf6e3943e177531. Its fixture/audit/scoring arithmetic and
legacy fingerprint are unchanged. Its receipt contains IDs, digest, counts,
typed numeric scoring results and audit IDs/strata; no article/arc text is
copied into that receipt. Scores are returned privately, never persisted.
eligible_for_auto_approval remains the unchanged arithmetic result, not
authorization; approval_allowed/publication_allowed/scores_persisted are false.

A generation ID permanently identifies its original full input SHA and scorer.
Exact existing-generation admission retry reads the original input after current
access validation, even if public rows changed or disappeared. It checks the
original candidate request/revision and audit options as well as the mandatory
digest. A different digest or candidate request conflicts. A NEW generation
with an old digest fails if sources drifted. This distinguishes original replay
from the prepared adapter's current-source freshness check.

## Deliberate retention

One canonical UTF-8 JSON string is stored in inputs.canonical_input; there is
no parallel JSONB payload column. The SQL SHA is computed over this exact text,
never PostgreSQL jsonb::text. Transient JSONB parsing supports SQL validation.
The digest domain is the unchanged arc-membership-consumed-input-v1 envelope,
including source_kind historical_public and original scorer version/blob.
Arrays retain the qualified deterministic source ordering; object keys are
recursively sorted by the same Node canonicalization as preparation.

The canonical string deliberately retains these concrete historical-public
inputs because this source chain has no exact historical resolver for them:

* Candidate ID, article ID, arc ID, state and exact updated_at text, including
  microseconds: binds the admitted candidate and scorer receipt revision.
* Article ID, title, summary, published_at, outlet and arc_id, once per article:
  supplies exact scoring text/date/outlet fallbacks after mutable rows change.
* Arc ID, title, summary, started_at and last_update_at: supplies exact arc
  context and date fallbacks.
* Member article/arc ID pairs: reconstructs the exact complete cohort without
  duplicating member article values.
* Entity article ID, entity ID and confidence text: reconstructs exact relation
  selection and entity-confidence cutoff effects.
* Entity cutoff presence/value; release-policy presence, fixture flag, enabled
  flag and threshold; audit cutoff/sample size/seed: reproduces configuration
  presence, defaults, scoring and audit selection.
* Input version, source kind and recovered scorer version/blob: binds consumer.

Body text, URLs, native payloads, excerpts, embeddings, generation_evidence,
nested source copies and fabricated native references are excluded. No retry
journal or receipt stores another copy of retained source fields. inputs stores
only scope/generation IDs, digest, canonical string and admitted principal.
There is no append-per-retry journal: exact retries add zero rows.

## Authority and access

Installation creates NOLOGIN, non-superuser, non-BYPASSRLS owner and reader
roles. No application, gateway, browser, collection worker or service role is
granted either role. The installation explicitly revokes actual PUBLIC EXECUTE on all functions created in the new private schema before granting the sole reader wrapper. It does not rely on schema-scoped default privilege revocation, which cannot subtract the global function default, and it changes no unrelated schema privileges.

Final installation assertions verify schema/table/function ownership, the sole read_input SECURITY DEFINER boundary, fixed search paths, exact function/schema/table ACLs, role memberships/attributes, all source-column effective SELECT rights, absent source writes and source-schema CREATE, and denial for existing anon/authenticated/service_role principals. Effective PUBLIC rights are included; unsupported ambient permissions cause a closed installation failure instead of revoking unrelated grants.

The owner alone receives explicit SELECT columns on six
existing historical source tables, no body/URL or write access. Its temporary
installer membership is revoked before commit.

A separately authorized operator must establish the intended login's owner
membership for admission, or reader membership for readback, and seed exact
scope/principal access rows. This is a private database-principal contract,
not Supabase JWT integration or recovered native source authority. Protected
caller/DB integration remains the parent-owned prerequisite. The source does
not seed real users, scope admissions, source permissions or credentials.

Current session_user scope access is locked FOR SHARE before admission or
readback. Owner UPDATE/DELETE of that same ACL row serializes revocation:
after revocation commits, every retry/readback is refused. The ACL is mutable
and distinct from retained immutable data. Reader gets EXECUTE only on
read_input; it receives no table SELECT and cannot call admission. Stored input
rows reject UPDATE, DELETE and TRUNCATE. Raw superuser/owner DDL disabling
triggers or changing functions is outside this contract.

Direct admit_input is owner-only and checks hash, source equality, context
completeness, shape, cardinalities and transaction isolation. Canonical textual
encoding and complete semantic replay validation are enforced by retained.mjs;
direct owner insertion or bypassing this adapter is not an alternative qualified
admission transport. Database-owner credentials are inherently privileged.

Default bounds match preparation: 32 candidates, 4096 members, 32768 entity
relations, 128-row pages, 64 KiB projected row and 4 MiB source budget.
Hard bounds: 64 candidates, 8192 members, 65536 relations, 512-row pages,
256 KiB row, 8 MiB source/canonical input. SQL counts source sets with bounded
LIMIT before aggregate equality. Node bounds retained text before parsing,
validates nested allowlists and foreign/duplicate context before scoring.
Unknown fields are refused. A returned result is committed before exposure.
Failures roll back and always attempt connection close; outward Node errors
are static codes without driver cause, detail, source values or credentials.

## Dependencies and qualification order

1. Use Node 22.14 and the repository's existing pg package; no new runtime
   dependency, queue, model or service is introduced.
2. Provision an explicitly disposable PostgreSQL 17.6 database for synthetic
   qualification. The test creates six synthetic historical source tables
   with RLS disabled. These are not actual material.
3. Apply this directory's 001_retained.sql AFTER those six source tables
   exist. In a separately reviewed runtime install, use existing actual table
   contracts and fail closed if source authority is unsupported.
4. Establish only synthetic test owner/reader membership and scope access.
   The harness owns these test grants and removes them.
5. Run the unit and actual PostgreSQL test source below. No actual test was
   executed by the implementation agent; parent qualification is separate.

This historical-only component does NOT depend on or exercise
entity-resolution/native-capture-fields/003_native_fields.sql. Full native C9
would require a separately coordinated successor: exact original field
resolution for nullable outlet/published_at plus text, whole-generation
permission/budget semantics, and authoritative admission. Existing 003 only
supports title/summary/body_text; its mention permission checks are not
bypassed or broadened here. No native claims are inferred from owner seeding.

Unit invocation:
    node --test tests/arcMembershipRetained.test.mjs

Actual PostgreSQL invocation requires BOTH explicit environment values:
    MIP_DISPOSABLE_POSTGRES=arc-membership-retained
    MIP_ARC_RETAINED_DATABASE_URL=postgres://...@127.0.0.1:PORT/mip_arc_retained_test
    node --test tests/arcMembershipRetainedPostgres.test.mjs

The actual harness refuses another database name, non-loopback host, URL
query/fragment, non-17.6 server, occupied catalog or preexisting owned role.
It proves an empty dedicated catalog before arming cleanup, has a 90-second
test timeout plus 5-second statements and 10-second queries, and always attempts
Client.end, including failed connect/cleanup. If installation rolls back, cleanup checks whether the transactional owner role exists before revoking its owned public-schema usage. Failures preserve the primary static stage and SQLSTATE/allowlisted contract code separately from cleanup stages; driver objects, values, queries, causes and assertion details never enter these diagnostics. It drops only its owned schema
and six tables and removes its two contract roles plus one synthetic outsider role; it never cleans a nonempty database.
Schema CASCADE is limited to the exact new schema in that proved-empty target.
The harness verifies actual grants/RLS denial, immutable writes, original
readback after mutation, missing/revoked scope, conflicts, pagination over 1000
members, and a concurrent source mutation during owned snapshot admission.
The actual test exercises the allowed reader wrapper without direct table SELECT, denied read/admit/table calls for every existing anon/authenticated/service_role principal and an always-present synthetic outsider, and checks that refusal diagnostics omit the synthetic secret sentinel. It does not create absent ambient Supabase roles. Mock transports in the unit suite are not actual PostgreSQL evidence.

Remaining chain: a qualified hosted caller/source authority boundary, native
retained input admission/resolution if native is required, hash-bound score
persistence, and a qik approval guard that revalidates complete source identity.
This source does not install the missing guard or copy the legacy broad ACL,
and it never enables release policies.

The SQL admission exception handler emits only a fixed internal validation-stage label and SQLSTATE in DETAIL. It never copies SQLERRM, original DETAIL, query text, context or values. The production adapter continues to strip all driver details. The synthetic PostgreSQL ClientClass can capture only a fully allowlisted stage/SQLSTATE pair before that sanitation to locate a qualification failure; it does not expose the original driver object.
