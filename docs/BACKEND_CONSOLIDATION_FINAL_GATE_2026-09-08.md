# Backend consolidation final gate — INCOMPLETE

This is the requested ten-part consolidation report and current blocking register,
not a declaration of completion. Inspection covers 2026-09-08, approximately
08:11–08:20 UTC, against repository main 8e8f413cf3053743a0e9c0656864f47598ffa341.
The accompanying verifier/backend-consolidation-inventory-2026-09-08.json records
live project/function/migration/catalog metadata. No legacy backend was changed.

## 1. Surviving authoritative project

qikvmopbtijoebdqosyq — account verification project, ACTIVE_HEALTHY.
Frontend VITE_SUPABASE_URL points here. src/lib/mipBackend.js constructs both public
and private clients from the shared Supabase client. Current live functions:
spatial-runtime (6), investigation-api (2), capture-retrieval (5), and five
compatible standalone investigation functions (1 each). Presence is not proof of
successful privileged runtime operations.

## 2. Every legacy project examined

All four projects returned by the connected project inventory were examined.
This does not establish that no inaccessible/deleted project or external backend exists.

| Project | Observed application state | Retirement decision |
| --- | --- | --- |
| yhbwnrtlqbjtcrrlpbge, Manus sandbox | 82 public and 15 spatial tables; five active Edge Functions; two active five-minute schedules; no Auth users or Storage objects | NOT SAFE: active ingestion/analysis dependencies |
| niejaejtbxgakyrsntxm, original project | 92 public tables; six active Edge Functions; two inactive schedules; three Auth users; one bucket, zero Storage objects | NOT SAFE: functions, Auth identities and historical data not fully reconciled |
| jfnzyvzthzqtczlxhjll, spatial verification sandbox | 13 public and 15 spatial tables; no Edge Functions or pg_cron; no Auth users or Storage objects | NOT PROVEN SAFE: external test/runtime consumers and retained spatial evidence not exhaustively reconciled |

The survivor has 45 public, 26 evidence_pipeline, 15 spatial and six
legacy_graph_staging tables. Application-table RLS is enabled on all these.
Platform-managed schemas are counted separately in the inventory.

## 3. Functionality/data migrated from each

Existing transfer receipts document original-to-Manus historical identity mappings
and their subsequent copy into the survivor, plus public-surface schema transfers.
Fresh source/destination readback matches all 3,818 mapping rows and 1,504 conflict
rows using the same ordered full-row digest query. Digests are reconciliation
checks, not authenticity signatures. Conflicts remain preserved, not resolved.
See verifier/mip_ledger_transfer_2026-09-05.json and
verifier/mip_public_surface_transfer_2026-09-05.json.

This proves this ledger subset, not all corresponding corpus rows, immutable
versions or every live delta. The older receipt explicitly left collectors on
Manus. Spatial schema/runtime exists on the survivor, but complete sandbox-to-survivor
data/history parity and original deployment artifacts remain unproven.
No new data transfer was performed during this inventory.

## 4. Intentionally retired functionality

None retired by this batch. Inactive original cron jobs are observed configuration,
not evidence of an approved retirement. Standalone investigation endpoints remain
compatible on the survivor; no unsupported claim that clients no longer use them.

## 5. Remaining dependencies

Manus deployed functions: ingest-rss, backfill-legacy, import-original-source,
source-comparison-run, arc-membership-run. Retrieved source references local
SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY and, where applicable, NER service/key
configuration and runner credentials. Tables include ingestion_runs,
ingestion_source_runs, author_profile_queue, original_source_import_credentials,
source_comparison_enrichment_queue and membership scoring/audit/release-policy
tables absent from the survivor's inspected public table inventory. Blindly
redeploying these functions would neither reconcile contracts nor preserve gates.

Manus cron jobs mip-ingest-rss-hourly and mip-source-comparison-enrichment are
active every five minutes. Both showed 288 successful scheduler statements in the
preceding 24 hours. Their commands use Vault-backed HTTP configuration. The
strict URL-only lookup resolves mip_ingest_rss_project_url to Manus itself.
No token or decrypted credential was emitted. SQL scheduling success alone does not
establish HTTP delivery or processing. A subsequent aggregate read found 4,233
completed ingestion_runs (latest start 2026-09-08 08:20:04 UTC), 4,224 succeeded
source runs (latest attempt 08:20:06 UTC), and eight succeeded enrichment queue
records. These retained run states confirm ongoing legacy processing but do not
certify source eligibility, published output or complete delta transfer.
The survivor separately has ten pending change jobs (two dependency lookups and
eight candidate searches); none were claimed or executed during reconciliation.

Original deployed functions: ingest-rss, debug-parse, policy-ingest,
graph-analysis-run, source-comparison-run and batch-intake. Two inactive schedules
still reference the original project. Three Auth users require identity/membership
and session-consumer reconciliation before any retirement claim.

Cloud Run extraction remains an external dependency to reconcile:
.github/workflows/deploy-cloud-run.yml targets mop-extraction/us-central1 using
GCP_SA_KEY. Repository configuration is not proof of current cloud deployment,
runtime environment, service callers or secret-manager state. The repository's
workflow_dispatch run inventory returned zero runs; deployments outside that
history remain unverified. No cloud credentials
were read. Other collectors/evaluation hosts and manual operators remain open.

## 6. Runtime/configuration verification

All four live migration histories and Edge Function inventories were retrieved.
Eleven legacy function sources were inspected for environment names, table/RPC
calls and embedded project references. This is static dependency discovery, not
full invocation tracing. Database function catalogs and body digests were captured;
digests intentionally differ across projects and are not a parity certification.

No pg_cron/pg_net is installed on the survivor; Manus has both. Survivor SQL function
bodies showed no literal *.supabase.co project references in the bounded scan.
Dynamic Vault/config references require separate resolution; absence of literals
cannot prove absence of a dependency.

Production/live browser verification now asserts that observed managed Supabase
requests in shared-workspace and World View flows use qikvmopbtijoebdqosyq.
The check rejects zero observations and foreign project references, and logs only
project/service/count metadata. It does not cover custom domains, unvisited paths,
external workers or positive signed-in writes. Final run evidence belongs in the PR.

## 7. Security/provenance/history verification

Ledger rows and existing conflicts match between Manus and survivor. No evidence,
identity, Auth user, immutable version, review, grant or publication policy changed.
Survivor application tables have RLS. Its existing advisor findings remain: six
owner-context public views, vector in public, and disabled leaked-password
protection. Private pipeline tables with no browser policies are intentionally
closed; do not add policies solely to silence informational notices.
[View advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

The spatial sandbox has five public tables without RLS; the original has two
security-definer public functions without recorded function configuration.
These catalog flags require access/body review; they are not automatic findings
of exploitation or justification to overwrite a legacy project.
Per-object policy/grant/trigger semantic parity and all historical payload hashes
remain open. Current Auth counts are inventory only, not identity migration proof.

## 8. End-to-end frontend/backend verification

PRs 97–101 have merged with passing release checks. Search opens Explore only
through its explicit control; shared date precision, Graph Time, Timeline recovery,
responsive inspector/Account, arc source retry and World View boundaries have
production and public live checks. The real public arc inventory is empty; its
failure/retry case uses a temporary browser-only fixture, never seeded production data.
The latest baseline Pages run is 34202227803.

Anonymous spatial-writer denial has been verified. Successful signed-in
investigation reads/writes, worker claim/process/acknowledgement, ingestion-to-review
and spatial write-to-projection journeys are not claimed as verified.
They require narrowly scoped test identities, exact records and authorization
evidence without weakening production publication or evaluation gates.

## 9. Legacy projects proven SAFE TO RETIRE

NONE. No project was deleted, paused, disabled or destructively modified.

## 10. What prevents SINGLE-BACKEND CONSOLIDATION COMPLETE

- Active Manus collectors/schedules and missing survivor worker schema/contracts.
- Unreconciled ongoing data deltas, complete corpus/history and identity mappings.
- Original Auth identities and callers; external Cloud Run/collector/evaluation config.
- Missing spatial deployment artifacts and unresolved writer authorization/temporal behavior.
- Exhaustive policies/grants/triggers, secret references, Storage configuration and fallback paths.
- Positive authorized end-to-end reads/writes, workers and ingestion/runtime verification.
- No evidence of a zero-required-dependency state for any legacy project.

Next bounded work: recover scheduled collector contracts and runtime/config metadata,
define tested survivor equivalents with explicit publication/evaluation gates, then
transfer retained data and schedule cutover with idempotency, rollback and delta
verification. Reconcile external service state and Auth identities independently.
Continue frontend batches while isolated source-rights/runtime prerequisites remain
unproven. Overall consolidation and the work plan must remain OPEN until this gate passes.
