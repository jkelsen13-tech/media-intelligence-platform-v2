# Markets graph compatibility candidate — REVIEW REPAIR, NOT APPLIED

This descendant repairs the failed candidate at `b9e2507749ffffa3c2e89c9f4be0cc102b60c9c1`. The original frozen code parent was `7cde1087fb5089a74c6329e05d447bb2127d2750`. Live inspection remained read-only on `qikvmopbtijoebdqosyq` (PostgreSQL 17.6).

## Deliberate public behavior changes

All four public views have **ALL privileges revoked from PUBLIC, anon and authenticated**, followed by SELECT-only grants. A postcondition rejects inherited write privileges. This closes the observed auto-updatable comparison_public write route; investigation_surface_public also had full API-role DML grants.

Unresolved citations are no longer public, including explicitly public-classified rows with NULL endpoints. A new immutable `citations.public_eligible` designation is required alongside a visible public endpoint. Existing rows receive the current published baseline designation; new inserts default false and must explicitly opt in. Existing citation eligibility must be independently reviewed before applying. There is no mass UPDATE or private-to-public promotion. Publicly designated resolved citations keep their behavior.

The public review-queue **metric is removed**: `pending_graph_candidate_count` is always NULL and graph_coverage_public has no dependency on cross_surface_candidates. The NULL column remains solely to avoid destructive view replacement or breaking column order; it carries no activity information. A future API version may physically omit that obsolete column. Do not render NULL as a measured zero.

These changes intentionally supersede the earlier claim that every prior public behavior would remain unchanged.

## Concurrency invariant

Classification stays immutable on nodes and edges. Public edges are validated by an AFTER constraint trigger, after immediate FK processing. Each endpoint must be found with SELECT INTO STRICT and locked FOR KEY SHARE in UUID order. A missing snapshot-visible endpoint fails closed (23503); it never proves public classification by absence. Private endpoints fail with an explicit error. No global fence or full graph scan is added.

`concurrency.mjs` drives two held-open psql sessions. For both source and destination positions it verifies B is actually blocked on A using pg_blocking_pids, then exercises private-endpoint commit, private-endpoint abort, and public-endpoint commit controls. Private outcomes must leave no edge; the public control must succeed. Only loopback/CI service hosts and mip_disposable_ database names are accepted. Repeatable-read/serializable and broader load qualification remain additional gates.

## Exact security drift

`security-baseline.json` and `security-fingerprint.sql` record the inspected owner, table/view ACL, column ACL/default/type, view options/definition, RLS/FORCE flags, policies, constraints, and application triggers with function bodies/owners/ACLs for all nine surfaces. compatibility.sql recomputes and checks the fingerprint before changes. This catches security drift that a view-definition hash alone misses.

Investigation's existing security_invoker=true option is preserved without introducing security_barrier. Geography retains security_barrier alone; the two existing explicit definer options remain. Definer views continue to filter private identities explicitly because switching their private governed-table joins to invoker would require a separate authorization redesign. The security-advisor definer-view findings remain open.

## Disposable verification

Run only on an independently restored, sanitized production-schema fixture with the exact pre-cutover security baseline and representative synthetic public rows. No production data, identities, credentials, or schema dump are embedded.

1. `psql -X -v ON_ERROR_STOP=1 -f verifier.sql` checks role-visible, nonempty sentinels on all nine surfaces; snapshots normalized output; applies the candidate; builds and validates all four indexes; and repeats a build to verify resumption.
2. Private fixtures cover both edge directions, topic/membership references, private resolved and unresolved citations on otherwise public articles, and explicitly public-but-unresolved citations. An explicitly public resolved citation is a positive control; designation mutation is denied.
3. Comparison must demonstrably select the private event under the **old** timeline ordering. A fixture where it does not win fails.
4. `spatial-fixture.sql` clones a complete existing synthetic released geography chain, including authority snapshot, assertion, revision, review, public release, evidence links, and existing governed policy/place/geometry/evidence ancestors. The unfiltered old projection must expose it, while the corrected projection must not. The clone helper exists only in pg_temp, preserves enabled constraints/triggers, and proves projection isolation rather than validating real-world evidence or production authoring methods.
5. `acl-and-absence.sql` individually checks all sentinel surfaces, queue redaction and absence of its catalog dependency, raw restrictive policies, trigger/options, effective ACLs, and actual denied INSERT/UPDATE/DELETE attempts on each view. Auto-updatable comparison DML must fail specifically with 42501. Intrinsically non-updatable views may reject earlier with 55000/0A000, backed by independent ACL checks.
6. Run `MARKET_TEST_DATABASE_URL=... node concurrency.mjs` against the disposable candidate database. It needs only Node and psql.

Unresolved citations and the removed queue metric are normalized out of baseline comparisons because their suppression is intentional. All retained public outputs must stay equal after private inserts. Queue invariance is additionally established by no queue dependency and constant NULL, independent of queue row content.

**Execution status:** none of these PostgreSQL/index/concurrency tests has run in this remote-only agent session. Authored tests are not passed tests. The JavaScript runner was parsed in memory; SQL checks were structural. No hosted runner or ref was created/dispatched. Qualification remains BLOCKED until execution evidence on the exact detached commit is recorded.

## Independently gated indexes and recovery

`indexes.sql` accepts exactly one allowlisted requested_index, stops on errors, validates the entire pg_get_indexdef plus indisvalid/indisready/indislive before skipping an existing index and after building it, and never treats an invalid same-name object as success. Run one invocation at a time outside a transaction. Each build has lock/statement deadlines; interruption leaves a visible gate.

`index-recovery.sql` is a separately reviewed operation for an exact-definition invalid index only. It refuses missing, wrong-definition, already-valid, non-live or currently-building objects, runs REINDEX INDEX CONCURRENTLY, then checks all postconditions. It does not drop data or undo privacy. A failed reindex leaving _ccnew/_ccold objects requires another exact catalog review; no cleanup is automated.

Concurrent builds/recovery have not been executed here. Exact global counts still scan eligible entries, and existing spatial/comparison work may be expensive. Million-row EXPLAIN/BUFFERS measurements, concurrent ingestion/read budgets, interrupted-build recovery tests, pagination and frontend NULL handling remain gates.

## Separate live default-ACL remediation gate

Read-only inspection found postgres defaults in public grant anon/authenticated full table privileges (`arwdDxtm`), sequence privileges and function EXECUTE. Existing CREATE OR REPLACE view grants were therefore unsafe to assume. This candidate fixes its four views explicitly and changes no global defaults.

Before any future live DDL workflow, separately review and authorize the postgres/public default-table, sequence and function ACL policy; audit existing exposed objects and require explicit SELECT/EXECUTE grants only where intended. Coordinate other workloads and creators. No global ALTER DEFAULT PRIVILEGES command was applied or smuggled into this candidate; changing defaults alone would not fix existing objects.

## Remaining scope limits

This is a non-applied graph compatibility candidate, not complete Markets or a deployable typed-evidence migration. No seed principal, identity provider, node-type expansion, publication adapter, live deployment, rollback that republishes private rows, or private ingestion enablement is included. The old qualification/markets-evidence/001 cannot be applied after this without composition.

Dynamic SQL/RPC, computed relationships, non-FK JSON identifiers, caches/exports/Realtime/CDC, every exposed schema and inherited role paths still require independent inventory and API tests. Review the deliberate raw-table schema additions and default eligibility behavior. Current predicate tests do not establish rights/privacy admission, historical validity, real-data claim quality or release qualification.

Files remain outside supabase/migrations because the required CLI migration-generation workflow was not run; no project files were stored on the user's device. No new ref or PR was created.

## Official references consulted

- [Supabase views](https://supabase.com/docs/guides/database/views)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase explicit Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [PostgreSQL 17 concurrent indexes](https://www.postgresql.org/docs/17/sql-createindex.html)
- [PostgreSQL 17 invalid-index recovery](https://www.postgresql.org/docs/17/sql-reindex.html)

## Hosted parser gate after delimiter repair

The delimiter-only repair fixes accidental lone-dollar DO block delimiters in verifier.sql and acl-and-absence.sql. All candidate SQL files were rescanned; compatibility.sql is unchanged.

On the disposable hosted CI runner, install the pinned PostgreSQL 17 parser and run:

```sh
python -m pip install "pglast==7.10"
python supabase/production-candidates/markets-graph-compatibility/parse-sql.py
```

The parser entry point reads every candidate SQL file, rejects lone block delimiters, handles the explicitly allowlisted psql directives/parameter, and parses outer SQL. It performs no database writes. [pglast 7.10](https://pypi.org/project/pglast/7.10/) provides the PostgreSQL 17 parser family.

Parser installation/execution was not performed in the remote-only repair session. PL/pgSQL compilation, psql include execution, and all PostgreSQL/index/concurrency tests remain pending on the exact repaired commit.
