# Sandbox spatial history retention — bounded reconciliation

The sandbox and survivor contain different spatial histories. At 18:06 UTC on
9 September 2026, the sandbox held 39 rows across all 15 spatial tables, while
the survivor held 19. Every table's ordered full-payload digest differed even
though the inspected columns, constraints and table ACLs matched. Matching
schemas do not establish matching historical authorities.

This batch installs a separate private archive, `mip_private.spatial_row_versions`,
for exact sandbox-qualified snapshots. It never inserts into the live
`spatial` tables, rewrites an actor or authority ID, imports an Auth identity,
or interprets a sandbox review/release decision as survivor publication approval.

The archive keys each version by source project, fully qualified source relation,
original row ID and SHA-256 of PostgreSQL's complete JSONB representation.
Source observation and retention times are separate. Raw PostgreSQL JSON text
must pass directly between connected databases without parsing/reserializing
numeric payload values in JavaScript. Precision, source-native timestamps,
confidence, nullable fields, arrays and reference IDs remain in the original
payload. Repeated identical rows do not replace the first retention observation.
Distinct observed versions remain separate; intermediate states never observed
cannot be reconstructed.

The importer is invoker-context with an empty search path, bounded to 250 rows
and 2 MiB per call, and explicitly permits only the sandbox and these 15 spatial
relations. Table checks independently bind keys/hashes and finite observation
ordering. RLS is enabled; browser roles have no read/import grants. The worker
has SELECT/INSERT, not UPDATE/DELETE/TRUNCATE. Triggers reject ordinary mutation,
including owner-issued DML. Privileged owners can still change DDL: this is not
tamper-proof storage against database administrators.

Isolated PGlite tests exercise revised and reused IDs, live-table isolation,
exact geometry/large numbers/native time, malformed and partial batches,
rollback, replay, browser denial with schema usage, worker/owner mutation,
and direct hash/key/time forgery. All 1,569 tests passed on Node 22 and 24, both builds passed and the audit reported
zero vulnerabilities in initial Golden run 34387319102. Migration
`20260909181233_spatial_history_retention` was applied; its recorded SQL
exactly matches the tested contract. The Supabase-assigned migration version is
used in the repository; no migration file was generated on the owner's device.

At source observation 2026-09-09 18:10:29.725906+00, 39 complete rows were captured in
one query and then retained as service_role in one destination transaction.
All 15 ordered payload digests and counts match the source before and after
transfer. All 28 internal foreign-key reference checks have zero missing rows.
Eight external foreign-key definitions reference nodes, places, articles,
policy documents and source changes outside this retention scope; those parents
were not copied or inferred. Replaying eight assertion revisions inserted zero.
The survivor's 19 live spatial rows have unchanged full-payload digests.

Production grants/RLS and both enabled immutability triggers match the contract.
The only advisor delta is an expected INFO for the intentionally closed private
RLS table without policies. No browser policy is added merely to silence this
notice. See the [exact receipt](../verifier/spatial-history-retention-2026-09-09.json)
and [read-only inventory](../supabase/tests/spatial_history_inventory.sql).
Final-head checks and deployment/live results are recorded on PR #136.

This verifies a bounded retention prerequisite. Operational
identity mapping, external/public parent dependencies, policy/function/trigger
and deployment-artifact parity, positive spatial writer authorization, runtime
callers, and subsequent deltas remain separate work. The sandbox's existing
five public tables without RLS are not changed by a private archive.
No legacy project is SAFE TO RETIRE; consolidation remains incomplete.

Supabase changelog and current [function](https://supabase.com/docs/guides/database/functions)
and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
guidance were checked. No extension, client package, paid service, schedule,
public API, frontend control or local file is added.

A supplementary read-only function comparison found 16 of 17 inspected spatial
function definitions equal. The differing append_release_decision permits
originating released decisions on the survivor; the sandbox's Gate A rejects
released/restricted decisions. Equal table schemas therefore do not make the
projects' release contracts interchangeable. Neither function was changed.
