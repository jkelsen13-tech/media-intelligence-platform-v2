# Narrow qik arc source storage qualification

Base source: d185a305579e22a44a3c350668985334591f69e2, tree
a6bdab3ad79ccf3e4cd71d193fb21b3e5272123e. Existing prepared, retained, recovered
scorer, native-field and native-occurrence source is unchanged.

This is a storage compatibility successor, not a scorer-input adapter, entity
admission service, deployment, publication writer, or completed native C9 route.
The two new tables start empty and all attempted entity/release writes are
fenced with explicit unqualified-authority errors. Empty means no qualified
input, not a valid proof that no entities or release requirements exist.

## Required existing source

The installer validates ordinary RLS-enabled public articles, entities,
story_arcs, pipeline_config and arc_membership_candidates. Articles, entities
and story_arcs must each have a UUID NOT NULL single-column id primary key.
story_arcs.started_at must be DATE NOT NULL. These limited requirements match
parent-reported read-only qik catalog metadata; no column values were retrieved.
This package does not speculate about uninspected entity-name or confidence
column types or modify any existing key, date type, policy, row or grant.

Source relations are pinned ACCESS SHARE for the install transaction. All five ordinary-table/RLS requirements are rechecked after acquiring those locks, so pre-lock metadata is never the final selected shape. An
existing article_entities, arc_membership_release_policy, private schema or
owner role is refused: this script does not silently reconcile unknown objects.
A separately authorized installer needs CREATEROLE, public schema CREATE and
the ability to grant column REFERENCES on article/entity IDs. Installation is
not authorized by this source package.

## New storage and exact fields

public.article_entities uses the existing article and entity UUIDs as foreign
keys and a composite primary key. Its columns are article_id, entity_id,
confidence, extraction_method, role and created_at. The required confidence
numeric has a 0..1 constraint and NO default; extraction_method is required and
bounded to 128 UTF-8 bytes with NO heuristic default. Optional role is bounded
to 256 bytes. The new relation has the recovered entity lookup index. Neither
a label, extraction occurrence, mention rank nor owner-seeded actor stub can
create a relation or establish confidence.

public.arc_membership_release_policy has model_version (bounded 128 bytes),
fixture_passed (default false), auto_approval_enabled (default false) and
auto_approval_threshold. A closed constraint requires auto approval false and
threshold NULL. No policy row, threshold or model release is seeded. A future
reviewed release successor, not this script, would have to change that fence.

Both new tables have ENABLE and FORCE RLS, no policies, no runtime grants and
a dedicated NOLOGIN/NOINHERIT/NOBYPASSRLS owner. The private schema contains only
require_entity_authority and reject_unqualified_write, both SECURITY INVOKER
with empty search_path. The former is an explicit missing-authority assertion,
not a mock producer. Unconditional BEFORE STATEMENT INSERT/UPDATE/DELETE/TRUNCATE triggers invoke it, including zero-row UPDATE/DELETE; release writes raise their separate unqualified-authority error. All four fences are ENABLE ALWAYS. Even synthetic
superuser DML hits those triggers. Privileged DDL disabling fences is outside
this qualification.

The private owner receives only public-schema USAGE and REFERENCES(id) on
articles/entities; temporary schema CREATE and installer role membership are
revoked before commit. It cannot select source fields or write source tables.
No worker, browser, service_role, reader or authenticated caller receives owner
membership or function access. No source text or original payload is copied.

## Final permission closure and provider defaults

Functions in this newly owned schema explicitly lose default PUBLIC EXECUTE;
new tables explicitly lose PUBLIC grants. Because objects are created under
a new owner, unrelated postgres/installer default ACLs are not assumed to be
their defaults. The final assertions check actual effective privileges anyway:
role attributes/membership; schema ownership and ACL; exact function owner,
SECURITY INVOKER, empty search_path and ACL; new-table ownership, FORCE RLS,
absence of policies and table/column ACLs; exactly two uniquely named, ALWAYS-enabled, unconditional statement fences per new table, with exact function identity/event/timing, no arguments or constraint/deferred topology; zero source SELECT/write privileges;
only the two intended REFERENCES(id) grants; no source/public-schema ownership
or CREATE; and no private path for existing anon/authenticated/service_role.

A provider mechanism granting additional rights makes installation fail and
roll back. This package does not revoke service_role or repair unrelated source
ACLs to force success. Actual provider default ACL/event-trigger behavior must
be reconciled in the parent-owned protected installation workflow. Bare PG
synthetic success does not prove that hosted permission closure.

## Existing algorithm and consumer obligations

Phase A C9 (docs/MIP_PHASE_A_2026-09-26_1a_capabilities.md, blob 9d7a118b4b06198fefe3152ce1b4b58e7d8bdb0e)
requires qik-owned membership and Arc/attach consumers. Recovered worker index
26423833f2010c0dbde95fdd921208f28529d9b3 consumes article_entities entity IDs and
confidence, complete article/member context and release policy. Scorer
08ce23092cfbbe8dcb7eb7c26cf6e3943e177531 is unchanged.

This extracts only the needed relation structure from migration
20260728_entity_resolution_sanitization.sql (b451f252e6aa7e124c05020dcfe99a9f44ceeddb).
It deliberately does not execute that old migration's corpus re-sanitization,
config seeds, public-read policies or heuristic defaults.

arc-membership-prepared is a historical-public projection; an RLS-filtered empty
set is not authority for a complete qik input. arc-membership-retained explicitly
rejects RLS-enabled source tables and remains unchanged. These new tables do
not make either module a qualified qik adapter. A successor must bind complete
RLS-authorized input, the original full consumed-input hash and exact replay;
it must call the missing-authority boundary before treating this storage as
ready. No current module is silently rerouted to this package.

Native mention attribution is likewise not a drop-in entity producer:
docs/ENTITY_RESOLUTION_SLICE1_2026-09-14.md distinguishes synthetic actor stubs,
reviewed interpretation and ranks from canonical identity/probability.
Native 003/004 modules are not dependencies of this storage-only test and are
not broadened. Required mapping from original authorized evidence to accepted
canonical qik entity ID and scorer-compatible confidence remains unresolved.

Guarded score persistence, audit persistence, stale-source approval checks,
attach authorization and publication remain separate unimplemented consumers.
No eligibility flag is made true and no automatic attachment occurs.

## Actual synthetic qualification and cleanup

No tests were run by the implementation agent. Parent stages these three files plus verifier/qik-c6-c9-caller-source-successor.json (proposed manifest blob 98e6f0e09bf1df6807b34da6f3dad3031b23cc80),
executes qualification and obtains the applicable fresh independent review.

Use existing repository pg with Node 22.14 and a dedicated disposable PostgreSQL
17.6 database named mip_arc_qik_source_test. The harness creates five synthetic
RLS-enabled source tables with qik DATE/UUID-key shapes, then installs
001_storage.sql. No Supabase/native installation or material is required.

Explicit invocation:
    MIP_DISPOSABLE_POSTGRES=arc-membership-qik-source
    MIP_ARC_QIK_SOURCE_DATABASE_URL=postgres://...@127.0.0.1:PORT/mip_arc_qik_source_test
    node --test tests/arcMembershipQikSourcePostgres.test.mjs

Missing opt-in skips; it is not success evidence. The harness rejects a
non-loopback/other database, non-17.6 version, occupied catalog, or existing
owned roles. It proves catalog emptiness including functions/types/other user
schemas before arming cleanup, uses an advisory lock and 90-second test timeout,
5-second statement and 10-second query limits. A synthetic outsider role
guarantees effective denial testing even without Supabase ambient roles.
Existing ambient roles are tested if present but never created or changed.

Cases include atomic refusal of wrong DATE shape, wrong UUID key type, missing primary key and
disabled source RLS; exact RLS/FORCE RLS/private-table/FK assertions; refused
entity/release writes even under the privileged fixture connection; no source
SELECT under the internal owner; direct ambient read/function/write denial;
unchanged source title/body/entity sentinels/RLS and empty new destinations; and refusal of a second unreviewed installation. Actual pg_attribute column lists are compared with manifest stages[1] and stages[2] retained_fields before and after refusal tests. No mirrored static list substitutes for those manifest checks.

The authored two-client DDL race holds an RLS-changing ACCESS EXCLUSIVE lock, starts the installer, requires pg_stat_activity to show an actual Lock wait, then commits the change and requires the installer to refuse its newly observed disabled RLS. Polling is bounded and both connections are closed. This is test source awaiting execution, not a claim that the race has passed.

Assertion-only drift tests extract the final DO assertion block from the installation source and execute it after transactional disabling, origin-only enabling, repointing, WHEN filtering, row-level replacement, duplicate addition and release-TRUNCATE disabling of fences. Each mutation must fail the trigger boundary; rollback and the assertion block alone must restore/pass. The installer is never replayed to normalize drift in these tests.

Cleanup attempts every stage, rolls back failed installer transactions, drops
only its proved-owned new tables/schema, the five synthetic source tables and
two new roles, and revokes the owned public USAGE only if that role exists.
All connections close, including failed connect. Only static stage labels,
SQLSTATE and allowlisted contract errors escape; original driver details,
values, causes and assertion payloads are discarded.
