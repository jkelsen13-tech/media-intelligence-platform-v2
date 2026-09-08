# Backend consolidation final gate — INCOMPLETE

This is the requested ten-part report, updated for PR #109 on 8 September 2026.
The bounded collector-history transfer passed its production integrity checks.
The overall consolidation phase and work plan remain OPEN.
Evidence: [catalog and transfer receipt](../verifier/backend-collector-retention-2026-09-08.json),
[retention method](COLLECTOR_HISTORY_RETENTION_2026-09-08.md), and
[PR #109](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/109).
All changes and retained records were written directly to GitHub and Supabase;
no project files or datasets were saved on the owner's device.

## 1. Surviving authoritative project

**qikvmopbtijoebdqosyq** is the intended surviving authoritative project,
ACTIVE_HEALTHY. Frontend VITE_SUPABASE_URL and the shared clients target it.
It is not yet the sole production backend.
Current functions: spatial-runtime v6, investigation-api v3,
investigation-input-impact v2, capture-retrieval v5, and investigation-workspace,
investigation-checks, investigation-reviews and investigation-source-spans v1.
All eight have JWT verification enabled. Installed migration
20260908180013_collector_history_retention adds private retained collector history.

## 2. Every legacy project examined

All four projects exposed by the connected project inventory were examined.
This does not prove the absence of inaccessible/deleted projects or external backends.

| Legacy project | Live state examined | Decision |
| --- | --- | --- |
| yhbwnrtlqbjtcrrlpbge — Manus | 82 public tables, 12 public views, 15 spatial tables; five Edge Functions; two active five-minute schedules; zero Auth users, buckets or objects | Required collector runtime remains |
| niejaejtbxgakyrsntxm — original | 92 public tables, three views; six Edge Functions; two inactive schedules; three Auth users; public post-media bucket, zero objects | Auth, function callers and historical corpus reconciliation remain |
| jfnzyvzthzqtczlxhjll — spatial sandbox | 13 public and 15 spatial tables; no Edge Functions or cron; zero Auth users, buckets or objects | Spatial history and external consumers not proven reconciled |

The survivor now has 45 public, 26 evidence_pipeline, 15 spatial,
six legacy_graph_staging and two mip_private tables, all with RLS enabled.
Catalog inspection covered 103/109/95/28 application relations and
228/186/132/137 functions respectively (survivor/Manus/original/sandbox),
plus grants, policy metadata, constraints, view/function digests and triggers.
The evidence file records object-level names, ACLs, policy identities,
function configuration and dependency flags. Catalog equality is not asserted.
No foreign servers or subscriptions were found in the inspected catalogs.

## 3. Functionality/data migrated from each

**Manus to survivor in this batch:** 8,699 exact row snapshots:
4,356 ingestion_runs with started_at before 2026-09-08 17:50:00 UTC;
4,336 ingestion_source_runs linked to those runs; all seven ingest_sources
at observation. Source project, relation, original key, complete JSONB payload,
payload hash, source observation and retention times are retained in
mip_private.collector_row_versions. Numbers were transferred as raw PostgreSQL
JSON text, without JavaScript numeric conversion.

All three destination counts and ordered SHA-256 digests match the corresponding
source queries both before and after transfer. There are zero missing retained
parent-run/source-register references. Replaying the seven source-register rows
as service_role received seven, inserted zero, and found all seven already retained.

This is historical operational retention, not functional collector migration or
a continuous replication pipeline. Later runs/deltas remain on Manus.
A snapshot cannot reconstruct states overwritten before observation.

**Original:** prior original-to-Manus identity mapping/history receipts and their
survivor copies remain applicable. Earlier same-day checks matched all 3,818
mapping rows and 1,504 conflict rows between Manus and survivor.
See verifier/mip_ledger_transfer_2026-09-05.json and
verifier/mip_public_surface_transfer_2026-09-05.json.
This batch did not migrate original Auth identities or claim full corpus parity.

**Spatial sandbox:** survivor spatial schema/runtime is present; complete
sandbox history/data and deployment-artifact parity are still unproven.
No sandbox data was migrated in this batch.

## 4. Intentionally retired functionality

None. No legacy project, schedule, function, identity or bucket was deleted,
disabled or destructively modified. Inactive original cron jobs are observed
configuration, not an approved retirement. Compatible standalone survivor
investigation endpoints remain supported.

## 5. Remaining dependencies

Manus still deploys ingest-rss v8, backfill-legacy v9,
import-original-source v12, source-comparison-run v9 and arc-membership-run v5.
Fresh cron reads confirmed mip-ingest-rss-hourly and
mip-source-comparison-enrichment both active on */5 schedules.
Private history retention does not replace their operational tables or writers.

Required reconciliation includes author_profile_queue,
original_source_import_credentials, source_comparison_enrichment_queue,
membership scoring/audit/release-policy dependencies, original source imports,
and ongoing corpus/assessment/history deltas. The live comparison worker has a
documented broad pending-job acknowledgement race; source generation, durable
semantic output and conditional acknowledgement must be qualified before cutover.
The deployable repository comparison entrypoint is older than recovered live code.
See [collector contract analysis](COLLECTOR_CONTRACT_RECONCILIATION_2026-09-08.md)
and [generation isolation](COLLECTOR_GENERATION_ISOLATION_2026-09-08.md).

Original functions remain ingest-rss v41, debug-parse v16, policy-ingest v16,
graph-analysis-run v16, source-comparison-run v17 and batch-intake v14.
Original cron jobs mip-ingest-rss-daily and mip-backfill-legacy are inactive.
Original three Auth users and survivor two users require explicit identity,
membership/session and caller reconciliation; counts are not migration evidence.
The original post-media public bucket has no objects but remains configuration
to reconcile. Zero stored objects does not prove no upload/download callers.

External extraction remains unresolved: deploy-cloud-run.yml targets
mop-extraction/us-central1 using GCP_SA_KEY. Current cloud deployment,
environment, callers, secret-manager state and external/manual collectors or
evaluation hosts have not been verified. No secret values were copied.

## 6. Runtime/configuration verification

Live Edge Function inventories and migration histories were retrieved for all
four projects. Current catalog inspection records function signatures, ACLs,
definer status, search paths, body digests, literal project references and
Vault/HTTP flags, plus triggers and relation metadata.
Prior recovered legacy function sources provide environment/table/RPC discovery;
static inspection is not an exhaustive invocation trace.

Survivor has no pg_cron or pg_net; Manus has both. Its Vault contains named
ingestion URL/JWT/scheduler and comparison scheduler configuration. The earlier
strict URL-only inspection resolved the ingestion URL to Manus itself.
No decrypted tokens were emitted. Original apply_ingest_schedule still contains
an original-project URL and HTTP dependency. Survivor function body scanning found
no literal legacy project URL or Vault/HTTP flags within the inspected scope;
dynamic config, custom domains and external callers still require verification.

The collector-retention migration is installed under the tool-assigned version,
and its recorded SQL matches the reviewed migration text. Runtime permission
checks confirm browser denial and no worker UPDATE/DELETE/TRUNCATE grants.
No collector schedule was activated on the survivor.

## 7. Security/provenance/history verification

The archive is private, RLS-enabled, source-qualified and append-only.
Browser roles cannot read/import; service_role can select/insert through an
invoker importer with an empty search path. Hash and key checks bind the payload
to its retained identity. UPDATE/DELETE/TRUNCATE triggers reject ordinary SQL
history mutation, including owner-issued DML. A database owner can still alter
DDL; this is not tamper-proof storage against a privileged administrator.

Tests cover revised versions, cross-project identities, idempotent replay,
large integer/timestamp preservation, malformed/oversized/duplicate batches,
transaction rollback, role boundaries, independent hash/key forgery and invalid
observation times. Source hashes are integrity checks, not authenticity signatures.
No publication/evaluation gate, evidence admission or worker completion was bypassed.

Security-advisor categories are unchanged before/after this migration:
closed RLS tables without policies (INFO), owner-context public views (ERROR),
public extension placement (WARN), and leaked-password protection (WARN).
Existing findings remain for separate review; no new advisor category appeared.
[View advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).
The spatial sandbox still has five public tables without RLS. These are
unresolved legacy security review items, not authorization to rewrite it.
Per-object semantic policy/grant parity, all immutable histories and Auth
identity reconciliation are still incomplete.

## 8. End-to-end frontend/backend verification

PR #108's Node 22/24 checks passed with 1,460 tests, and Pages run
34257864381 completed tests, build, deployment and live verification.
Manual production checks covered shared evidence/date precision, Cleveland
World View recovery/weather boundaries, Timeline shared subject and mobile Account.
The deployed bundle was index-CBaKQOlV.js. Investigation API v3 and input-impact
v2 deployment contents were checked against the reviewed sources.

This batch changes private retention, tests and reports; it adds no UI feature.
Its initial Node 22/24 checks passed with 1,463 tests and both builds.
Final-head checks and postmerge deployment/live results are recorded on PR #109.
Observed live browser checks assert survivor Supabase routing and reject zero
observations/foreign projects, within their visited paths.

Positive signed-in production investigation writes, worker process/acknowledgement,
ingestion-to-review, spatial writes/projection, custom domains and all external
runtime paths are **not** certified. Anonymous denial and public UI checks cannot
substitute for those journeys. No synthetic production evidence was seeded.

## 9. Legacy projects proven SAFE TO RETIRE

**NONE.** Required dependency closure has not been proven for any legacy project.
Actual deletion/retirement remains subject to explicit owner authorization.

## 10. What prevents SINGLE-BACKEND CONSOLIDATION COMPLETE

- Active Manus workers/schedules and missing survivor operational/semantic contracts.
- Ongoing deltas and unproven full corpus, immutable history and provenance parity.
- Original Auth identities, Storage configuration and remaining function callers.
- External extraction/collector/evaluation configuration and runtime trace gaps.
- Spatial history/artifacts, writer authorization and temporal runtime qualification.
- Per-object security/publication policy parity and all fallback read/write paths.
- Positive authorized end-to-end worker, ingestion, spatial and signed-in UI proof.
- No legacy backend has demonstrated zero required dependencies.

Next independent batches can qualify the version-bound comparison output contract,
reconcile operational schemas and preserve subsequent deltas while external/Auth
prerequisites are resolved. Do not mistake the completed history-retention batch
for completed backend consolidation or overall plan completion.

## Subsequent reconciliation — PR #117

The four-project inventory was refreshed; all four remain ACTIVE_HEALTHY.
A complete source-comparison-run v9 readback confirmed the required Manus runtime.
[Release-threshold hardening](COMPARISON_RELEASE_THRESHOLD_2026-09-08.md)
fixes its missing-threshold coercion without enabling auto-approval. Both observed
release policies remain disabled with null thresholds. The complete guarded
runtime package is retained in GitHub; deployed version and exact readback are
recorded on PR #117. The survivor still lacks the live comparison operational
contracts; collector migration and all ten-part completion blockers above remain.

Frontend PRs #115/#116 are merged in 40a4bc6b2c08a79ed78a805ce29df9685b5dfb36.
Golden 34276775036 and Pages 34276775080 passed, including live article identity
reload and mobile graph selection/zoom checks in Chromium/WebKit. These public
UI results do not certify signed-in writes or legacy dependency closure.
