# MIP V2 backend consolidation and canonical-authority reconciliation

Date: 2026-09-20

Target deadline: 2026-10-03
Decision: **not complete; no project is retirement-ready**

This report began with read-only inventory and now records the bounded live
reconciliation expressly authorized by the owner on 2026-09-20. It includes
three canonical migrations, one canonical Edge upgrade, two legacy function
grant repairs, one sandbox RLS repair, and append-only retention of the current
yhb collector delta. It does not rotate credentials, cut off a required caller,
pause/delete a project, change billing, merge main, or change publication data.

## 1. Git identity and protected reference

- Delivery branch: `codex/mip-backend-consolidation-20260920`
- Starting commit: `08ede62269390aeec13b10d34c945b72563fc6a0`
- Starting tree: `7d559e9d3ea51a6178fe453b2b178f2321d3898e`
- Final delivery commit/tree: reported by the handoff after the commit is made;
  a commit cannot truthfully contain its own hash.
- Current `main` observed: commit
  `1dc317200b7a928fad85d06b43351b60e2a50d92`, tree
  `5ebc3687e7b22b4a78fce1681999035b57738995`.
- Protected demo acceptance fixture: branch
  `codex/mip-september-22-demo-20260918`, commit
  `195109b48f12ae5d472b1794e9680d53f2c0de34`, tree
  `785de273770e7365eae90b7ca73d29be3f0e45ac`.
- The demo branch was inspected only. It was not edited, committed, pushed,
  deployed, merged, or repurposed.

The two supplied ZIP archives were read before implementation:

| Archive | SHA-256 | Verification |
|---|---|---|
| `MIP_PRELAUNCH_SEQUENCE_RECONCILED_v5_2026-09-19.zip` | `8E21E4B4ACAB96EDF8F33FC36C2B5A1AA122FD6910A1431D24829744C5C7AEFB` | 14 files extracted; 13/13 internal manifest entries matched |
| `Media intelligence platform version 4.zip` | `50E4B6B2C26B713FFCE761CE44EBDEE2086DC807B34B7CDB540C7DDD7A13D41A` | 167 files extracted; root 4/4 and assessment handoff 5/5 manifests matched |

The archives establish the governing sequence
`consolidate -> stabilize -> remaining product -> freeze -> final qualification`
and make `EXTEND` the default. Historical descriptions of a project as a
sandbox, original, or excluded system are treated as leads, not retirement
evidence.

## 2. Verified current backend inventory

All four projects were `ACTIVE_HEALTHY` in organization
`ntmqymyaujspymfqmxew` (`jkelsen13-tech's Org`) on an organization-level Pro
plan. Exact per-project compute size, line-item cost, backup/PITR retention,
egress, and direct-connection consumers were not exposed and remain unknown.

| Project | Current name | Region / PostgreSQL | Tables / views / exact rows | Auth users | Edge / migrations | Jobs and storage |
|---|---|---|---:|---:|---:|---|
| `qikvmopbtijoebdqosyq` | `mip-v2-account-verification-20260831` | `us-west-1` / `17.6.1.166` | 95 / 9 / 16,506 at initial census | 2 | 8 / 36 initially | no active cron; no buckets/objects |
| `yhbwnrtlqbjtcrrlpbge` | `mip-v2-manus-sandbox-20260818` | `us-west-1` / `17.6.1.155` | 97 / 12 / 177,478 | 0 | 6 / 66 | two active five-minute crons; no buckets/objects |
| `jfnzyvzthzqtczlxhjll` | `mip-spatial-verification-sandbox-20260829` | `us-west-1` / `17.6.1.166` | 28 / 0 / 46 | 0 | 0 / 5 | no active cron; no buckets/objects |
| `niejaejtbxgakyrsntxm` | `jkelsen13-tech's Project` | `us-west-2` / `17.6.1.104` | 92 / 3 / 14,103 | 3 | 6 / 77 | two inactive crons; public `post-media` bucket with zero objects |

There were no database branches on qik, yhb, or jfn. Nie had a default `main`
branch entry. Secret values were not inspected. Vault *names* on yhb show live
scheduler/config ownership: `mip_ingest_rss_anon_jwt`,
`mip_ingest_rss_project_url`, `mip_ingest_rss_scheduler_token`, and
`mip_source_comparison_scheduler_token`.

The sanitized point-in-time evidence is in
`verifier/backend-consolidation-2026-09-20/live-inventory-summary.json`. The
full local read-only capture is retained outside Git because it is an audit
working artifact, not product configuration.

After the initial census, qik received 5,786 append-only collector-history rows
and three migration records; its live row and migration totals therefore no
longer equal the initial table above. The exact post-change receipt is
`verifier/backend-consolidation-2026-09-20/live-reconciliation-receipt.json`.

## 3. Canonical authority map

`qikvmopbtijoebdqosyq` remains the intended destination, but authority is still
split. The decision column uses the archive's required vocabulary.

| Capability | Current owner/evidence | Destination decision | Missing reconciliation or gate |
|---|---|---|---|
| Account, profile, Auth | qik has the deployed account UI contract, two users, profiles, investigation membership | **EXTEND qik** | Preserve user IDs, sessions, profile and membership semantics; fix self-service profile/capability confusion |
| Retained articles and corpus | yhb has 34,277 articles and active ingestion; qik has 98 retained/reference articles | **RECONCILE into qik** | Source-qualified identity map, freshness/watermark, duplicate and conflict rules |
| Captures, exact spans/hashes, candidate evidence | qik `evidence_pipeline`: 95 captures/identities/import jobs/receipts, 96 candidates, 195 evidence changes | **EXTEND qik** | Preserve hashes, capture bytes/rehydration contract, revisions and invalidations |
| Review queues and evidence checks | qik investigation RPCs, reports, receipts and memberships | **EXTEND qik** | Keep default-deny private schemas and operation-specific membership gates |
| Claims, entities, actor identity/agency, relationships | large operational graph remains on yhb; qik contains a small gated projection/reference set; nie retains historical graph material | **RECONCILE into qik** | Per-entity provenance, stable IDs, accepted/candidate distinction, source and review semantics |
| Source lineage and comparison | yhb active comparison/ingestion; nie legacy comparison; qik retained collector/comparison history | **RECONCILE into qik** | Stop unsafe legacy public mutations; preserve run generations, mappings and audit history |
| Events, timelines, arcs/collections | yhb owns the large live population (13,008 events and timeline/arc state); qik has limited gated/reference state | **RECONCILE into qik** | Identity mapping, membership/release policy, temporal precision and publication parity |
| Assessments and revisions | qik migration `20260906051224_evidence_assessment_dependencies_v1` is already live; one assessment observed | **EXTEND qik** | Do not replay migration; later semantic model/scheduler remains separate algorithm work |
| Reconsideration and source history | qik change queues, dependency runs, record versions, 9,537 collector versions and 45 spatial versions | **EXTEND qik** | Confirm all legacy generations/leases/checkpoints are represented before cutover |
| Investigation workspace/context | qik private evidence pipeline and eight deployed Edge functions | **EXTEND qik** | Reduce service-role blast radius without weakening RPC membership/reviewer checks |
| Search/discovery | front ends read qik public projections; backing corpus authority is split | **RECONCILE around qik** | Projection parity after corpus move; Data API exposure and ACL tests |
| Spatial projections / World View | qik schema/runtime is intended authority; jfn retains 46 verification/release rows | **RECONCILE into qik** | Import unique jfn history; add admin-controlled capability model; complete reproducible runtime bundle |
| Terrain/runtime dependencies | repository/Vercel build assets; no separate Supabase storage objects observed | **EXTEND repository contract** | Reproducible dependency install/build and deployment evidence |
| Temporal intelligence | yhb owns material timeline data; qik temporal/publication output is incomplete | **RECONCILE into qik** | Preserve date evidence, uncertainty, placement audits and release gating |
| Markets | no authoritative live implementation was proven | **UNKNOWN; NEW only after requirements gate** | Do not create a parallel store from name-only requirements |
| Publication/public projection | qik public views are intended surface; legacy yhb/nie functions also mutate publication | **RECONCILE around qik** | Fix qik view write ACLs; migrate callers before revoking legacy entrypoints |
| Private/public boundary | qik private investigation boundary is strongest; the direct public-view and self-service spatial escalations are remediated | **EXTEND and harden qik** | Close residual `supabase_admin` defaults and shared-runtime ambient authority |
| Content-addressed storage/rehydration | qik evidence identities/captures and `capture-retrieval`; zero storage objects | **EXTEND qik** | Prove actual byte-level restore/rehydration, not only metadata rows |
| Jobs/workers/selective ingestion | yhb two active five-minute jobs; legacy Edge workers on yhb/nie; qik has no active cron | **RECONCILE into qik** | Scheduler ownership, idempotency, credentials, in-flight work and rollback window |
| Environment/configuration | GitHub, Vercel, Vault names, Supabase project settings and branch code all participate | **RECONCILE** | Establish a single non-secret config registry and eliminate hidden ref fallbacks |

The demo findings—no structured SPO output, verified lineage, canonical
admission, accepted relationship/event output, or generated
hypothesis/assessment state, plus incomplete temporal/publication timestamps—
remain algorithm/product gaps. They are registered above only so later work
extends canonical stores rather than creating parallel ones.

## 4. Project-by-project disposition

| Project | Disposition | Exact reason |
|---|---|---|
| qik | **KEEP; canonical intent; NOT CONSOLIDATION-COMPLETE** | Owns canonical Auth/investigation/evidence/spatial foundations and the two direct High paths are remediated, but legacy corpus/jobs and residual ambient/default authority remain |
| yhb | **CONSOLIDATE; NOT RETIRE-READY** | 177,478 rows, 34,277 articles, 45,399 article-entity links, 13,008 events, active ingestion/comparison jobs, six Edge functions and Vault scheduler references; no proved restore/caller cutover |
| jfn | **CONSOLIDATE; NOT RETIRE-READY** | Not empty: 46 rows including eight assertion revisions, nine policy artifacts, four release decisions and three lineage rows; five RLS-off owner-only tables; no full export/restore proof |
| nie | **CONSOLIDATE; NOT RETIRE-READY** | 14,103 rows including 752 articles and 1,892 explanations, three Auth users, six Edge functions, historical lineage/config and a public bucket definition; recovery and caller closure unproved |

No project qualifies as `RETIRE-READY`. Historical labels such as “sandbox” or
“original” do not override current data and callers.

## 5. Caller/dependency matrix

| Caller | Backend/project | Operation | Auth identity | R/W | Necessity | Target | Cutover and verification |
|---|---|---|---|---|---|---|---|
| GitHub Pages/public browser | qik REST/public views | public news, graph and projection reads | publishable/anon | R | required | qik | contract snapshots, anonymous read parity, forbidden-write tests |
| Account UI | qik Auth + `mip_profiles` | OTP/session/profile | end-user JWT | R/W own profile | required | qik | login/session/profile regression and capability separation |
| Private investigation UI | qik `investigation-api` | workspace, checks, reviews, spans | authenticated non-anonymous user | R/W gated | required | qik | member/reviewer/revoked/non-member matrix |
| `investigation-api` and private Edge handlers | qik RPCs | dispatch allowlisted private operations | service role after custom user check | R/W | required | qik | narrow runtime identity design plus RPC contract tests |
| `spatial-runtime` | qik direct DB | twelve append/review/release operations | user JWT plus shared `spatial_writer_runtime` | W | required foundation, unsafe gate | qik | admin capabilities, operation separation, immutable user attribution |
| `capture-retrieval` | qik | bounded capture status/retrieval/run-next | configured service credential | R/W jobs | required | qik | preserve lease/generation/idempotency; narrow authority |
| Operator CLI/scripts | qik | service RPCs and verification | service key/operator | R/W | required for operations | qik | named owner, scoped credentials, audited runbooks |
| yhb cron `mip-ingest-rss-hourly` | yhb | ingestion | Vault-backed scheduler token/JWT | W | currently active | qik successor | shadow run, watermark parity, pause only after owner gate |
| yhb cron `mip-source-comparison-enrichment` | yhb | comparison/enrichment | Vault-backed scheduler token | R/W | currently active | qik successor | generation/hash/count parity and rollback window |
| yhb `import-original-source` | reads nie, writes yhb | paginated legacy import and downstream comparison | function credential; JWT gateway disabled | R/W | legacy dependency until reconciled | remove after canonical import | source-qualified import receipt and zero-caller observation |
| yhb/nie legacy ingestion/graph functions | local project | ingestion, graph, comparison, publication | mixed service/writer keys; some JWT gateway disabled | R/W | unresolved per function | qik or retire | body/auth review, caller migration, negative RPC tests |
| Vercel production site | qik via `VITE_SUPABASE_URL` and publishable key | public UI/API | browser publishable key | R plus exposed surface | current deployment | qik | environment-name/ref check and public contract test; do not disclose values |
| GitHub workflow `.github/workflows/blank.yml` | qik | Pages build config | repository variables/static ref | build/read | active on main | qik | workflow scan and successful protected CI |
| Frozen demo preview | same-origin fixture/private replay; qik refs retained in code | acceptance fixture | protected Vercel login | fixture | protected reference | unchanged | exact branch/SHA/tree and URL smoke only |
| Tests/fixtures/runtime snapshots | all four refs appear | provenance, migration and replay evidence | none/live calls generally mocked | read/fixture | required as evidence | retain qualified history | distinguish executable callers from documentation/snapshots |

Static project-ref matches are intentionally not equated with active callers.
Main contained qik/yhb/jfn/nie match counts of 103/119/19/26; the integrated
foundation branch contained 122/133/27/37. Each match still requires semantic
classification before retirement.

Vercel evidence: the connected repository is
`jkelsen13-tech/media-intelligence-platform-v2`; the observed Production
deployment is from demo-lineage commit
`f4932d82b989ae95a176ff2427d6892c9b0d418f`. The project has only the names
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured for Production and
Preview; values were not opened. No deploy hooks were listed. The isolated
branch adds an explicit `deploymentEnabled: false` guard so a branch push
cannot become a Vercel preview deployment.

## 6. Unique data/schema reconciliation

Matching relation names were not treated as matching data. Exact point-in-time
counts demonstrate unique required state:

- qik uniquely contains the private evidence/investigation and retained-history
  foundation: 95 captures, 95 identities, 96 candidates, 195 evidence changes,
  390 change jobs, 100 record versions, 9,537 collector row versions and 45
  spatial row versions.
- yhb uniquely contains the active large corpus and processing state: 34,277
  articles, 45,399 article-entity links, 13,463 entities, 13,008 events, 13,586
  event-article links, 7,661 ingestion runs, comparison/timeline/arc scores and
  active scheduler checkpoints.
- jfn contains unique spatial verification/history despite its small size:
  eight assertion revisions, nine policy artifacts, four release decisions,
  three lineage rows and associated authority records.
- nie retains unique historical content and identity state: 752 articles,
  1,892 explanations, three Auth users, lineage/config, legacy workers and its
  bucket definition.
- Migration histories differ materially: qik 36, yhb 66, jfn 5, nie 77. A
  migration count or matching table name is not schema or semantic parity.
- Storage object count was zero in all four projects, but bucket policies,
  external URLs, deleted-object history and client configuration still require
  recovery/caller proof.

A safe reconciliation must export source-qualified primary keys, timestamps,
version/generation fields, hashes, review/publication state and foreign-key
edges; compute deterministic per-domain manifests; import idempotently into an
isolated qik-shaped restore; and reconcile counts, hashes, conflicts and domain
invariants. This run performed only the bounded append-only collector-history
delta described above; it did not copy or overwrite live canonical domain rows.

## 7. Edge Function authority map

### qik intended survivor

| Function | Version | Gateway JWT | Contract and effective authority |
|---|---:|---|---|
| `spatial-runtime` | 7 | true | operation-bound, administrator-controlled capability gate, then shared direct-wire writer; external self-service escalation fixed, ambient-role risk remains |
| `investigation-workspace` | 1 | true | non-anonymous user, fixed allowlist, service RPC with membership checks |
| `investigation-evidence-checks` | 1 | true | non-anonymous user, read/run allowlist, service RPC |
| `investigation-evidence-reviews` | 1 | true | non-anonymous user, read/history/decide; reviewer gate in RPC |
| `investigation-input-impact` | 2 | true | authenticated user, workspace read with injected user ID |
| `investigation-source-spans` | 1 | true | authenticated workspace read before projection |
| `investigation-api` | 3 | true | fixed route dispatcher to private handlers and fixed qik host |
| `capture-retrieval` | 6 | true | exact configured service credential, browser-Origin rejection, bounded routes |

`verify_jwt=true` authenticates a gateway token; it does not prove action-level
authorization. The private investigation RPCs are SECURITY INVOKER with narrow
EXECUTE grants and enforce membership/reviewer constraints, but the Edge
runtime's service credential remains broadly powerful if function code or its
environment is compromised. The spatial DB role is narrower in normal use, but
ambient project credentials were not proven absent from the hosted runtime.

### predecessors

- yhb: `ingest-rss` v8, `backfill-legacy` v9,
  `import-original-source` v12 (`verify_jwt=false`),
  `source-comparison-run` v15, `arc-membership-run` v5, and
  `membership-qualification` v1.
- nie: `ingest-rss` v41, `debug-parse` v16, `policy-ingest` v16,
  `graph-analysis-run` v16, `source-comparison-run` v17
  (`verify_jwt=false`), and `batch-intake` v14 (`verify_jwt=false`).
- jfn: no Edge Functions.

Gateway-disabled does not automatically mean unauthenticated; each body and its
custom secret check must be verified. Conversely, the legacy yhb/nie
`publish_explanation(uuid,text)` SECURITY DEFINER functions have browser
EXECUTE and no caller-authorization check. Yhb's GDELT staging writer has the
same caller-authority defect. These are unsafe parity targets and must not be
ported unchanged.

## 8. RLS and security findings

### High, remediated: qik anonymous writes through owner-authority views

Qik has RLS enabled on all 95 application base tables. The September advisory
did **not** mean those base tables currently lack RLS. The live issue is more
specific and more serious:

- `authors_public`, `arc_milestones_public`, and `news_detail_public` are
  postgres-owned, `security_invoker=false`, automatically updatable/insertable
  views.
- `anon` and `authenticated` have full `arwdDxtm` relation ACLs.
- Anonymous REST GET returned HTTP 200 for all three.
- In `BEGIN READ ONLY; SET LOCAL ROLE anon`, `EXPLAIN` accepted UPDATE rewrites
  to the underlying `authors`, `arc_milestones`, and `articles` relations. No
  write was executed. Authors has no trigger defense; other runtime constraints
  still need a disposable positive/negative test.
- Qik default ACLs grant broad table privileges and function EXECUTE to browser
  roles on future objects, so the exposure can recur.

Migration `20260920145928_public_projection_write_revoke_v1` is live. All seven
reviewed projections retain SELECT for `anon`/`authenticated` and have no
browser INSERT/UPDATE/DELETE; an anonymous UPDATE plan now fails with
`permission denied`. Migration
`20260920150006_postgres_public_default_acl_hardening_v1` closes future table
and function defaults for objects created by `postgres`. The same defaults for
objects created by `supabase_admin` remain a platform-owner gate: the connected
`postgres` session is not a member of that role, and the combined transaction
was rejected atomically before the two successful migrations were separated.

### High, externally remediated: qik spatial profile escalation

`spatial-runtime` authorizes all twelve append/review/release operations after
checking only `mip_profile_exists(authUserId)`. Authenticated users can insert
their own profile, and the signup trigger accepts user-editable
`raw_user_meta_data.app='mip'`. Public email signup is enabled. There is no
operation-specific reviewer/releaser membership check, and the database sees a
shared `spatial_writer_runtime` principal rather than the human identity.

Migration `20260920150416_spatial_runtime_capability_gate_v1` installed a
private default-deny capability history with separate `write`, `review`, and
`release` grants. It preserved exactly the two confirmed, non-anonymous
preexisting principals (six active grants); new profiles receive no grant.
Unknown users and operations fail closed, and only `spatial_writer_runtime` can
execute the gate. `spatial-runtime` v7 binds the authenticated user and exact
operation at the existing transaction gate. Its deployed package hash is
`f60e1646c364ae177dc19bab8ff4b17ca1d63c37559211c2535926a4d0e2d210`.

Residual architectural risk: compromised Edge code still holds the shared
direct-wire writer role and could call underlying append functions without the
adapter. Closing that requires wrapper-level database enforcement or distinct
database principals, not another browser-facing check.

### RLS-disabled advisory distinction

The five RLS-disabled public tables found on jfn were:
`arc_membership_candidates`, `authors`, `outlets`, `policies`, and
`story_arcs`. Their current ACLs are postgres-owner-only, so no direct
anon/authenticated CRUD path was demonstrated. Migration
`20260920151010_spatial_sandbox_public_rls_hardening_v1` enabled RLS on all five;
their ACLs remain postgres-owner-only.

## 9. Reconciliation work completed

- Added a sanitized, reviewable live-inventory summary.
- Applied and recorded the qik public-projection write revoke and postgres-owned
  future-object default-ACL hardening.
- Applied and recorded the qik spatial capability store and deployed
  `spatial-runtime` v7.
- Enabled RLS on jfn's five drifted public tables.
- Revoked browser EXECUTE on the proven caller-unchecked yhb/nie
  `publish_explanation` functions and yhb GDELT staging entrypoint while
  retaining explicit `service_role` compatibility.
- Appended 2,893 newer yhb `ingestion_runs` and 2,893 newer
  `ingestion_source_runs` records to qik's immutable source-qualified archive.
  At their fences, source/archive counts and ordered full-payload SHA-256 hashes
  are identical: 7,668 / `2b6b7f...b4dcb` and 7,648 /
  `e014dc...c9e4` respectively.
- Reverified all jfn spatial content: 39 spatial rows and six parent rows across
  21 relations remain exact ordered-hash matches in qik's 45-row archive. The
  only non-archived row is `pipeline_config.account_ui=true`, already present on
  qik with the same value and description.
- Added regression tests that reject missing projection coverage, future-object
  default ACL drift, row DML, view replacement, `security_invoker` flips, and
  accidental grants in that candidate.
- Added a Vercel branch deployment guard and a regression test for it.
- Preserved the protected demo and made no destructive backend change.

The spatial gate preserves the current principal set to avoid a caller cut-off;
it does not assert that both principals should permanently retain all three
capabilities.

## 10. Tests and verification

Isolated branch checks to run before delivery:

- Node syntax/static tests for the new SQL candidate and Vercel guard.
- JSON parse of `vercel.json` and the sanitized inventory summary.
- Repository diff/secret scan and branch-identity check.

Full frozen-demo reproduction was attempted twice with bundled Node v24.19.0
using a Windows-compatible sorted 237-file invocation. Dependency installation
failed on TLS certificate verification, so the observed result is **not** the
qualified historical baseline: 837 tests, 699 passing, 138 failing, zero
skipped/cancelled (42.745s and 37.505s). Remaining failures were dominated by
missing `@supabase/supabase-js`, PGlite, React, esbuild, graphology,
browserslist, PostCSS, Vite and Cesium; MapLibre byte verification also lacked
installed bytes. Both builds failed immediately because Vite was absent.

Six dependency-free assertions were proven CRLF artifacts under
`core.autocrlf=true`; an in-memory CRLF-to-LF diagnostic made all 26 tests in
their five files pass without changing disk contents. A separate latent
Windows bug uses `new URL(...).pathname` as a filesystem path in
`r475Step8Closeout.test.mjs` and then compares Windows paths to slash-only
regexes. These are test-harness portability issues, not established backend
defects.

## 11. Recovery evidence

Recovery is not proven for any predecessor.

- Existing `backend_recovery_verification_2026-09-05.json` covers 15 snapshot
  files and explicitly says fixture tests do not establish production
  readiness.
- `mipConsolidationRestore.mjs` starts from simplified fixture DDL and synthetic
  examples; it is not a full production disaster restore.
- The retrieved spatial-runtime v6 package references lock/module/test inputs
  that are absent from the eight-file snapshot, so exact redeployment is not
  reproducible from the retained bundle alone.
- Auth counts are not identity/session equivalence. Source IDs link profiles,
  memberships, review receipts and audit attribution and must survive migration.
- Empty storage objects do not prove bucket configuration, policies, URL
  compatibility or external callers are recoverable.

Each predecessor needs a fresh consistent export or verified backup/PITR point,
an independently accessible encrypted copy with a named recovery owner, and a
successful isolated restore covering schema, owners, grants, RLS, sequences,
functions, jobs, Auth flows, storage config/bytes, Edge build inputs, secrets by
reference, histories, in-flight leases and publication behavior. Counts,
hashes, referential invariants, negative authorization and RPO/RTO must be
recorded.

## 12. Frozen-head failures

The historical qualification reported 1,588 passes and 25 platform-sensitive
failures. This Windows environment could not reproduce that exact dependency
graph, so it must not replace the historical receipt.

Confirmed portability ownership:

| Files | Classification | Disposition |
|---|---|---|
| `articleInputReadback`, `comparisonPreparedWorker`, `comparisonProjectionConfig`, `membershipScoreReadback`, `originalSourceImportGuard` tests | literal-LF/CRLF comparison | test-infrastructure owner; normalize text in tests or enforce checkout EOL |
| `r475Step8Closeout.test.mjs` | URL pathname and slash-regex misuse on Windows | test-infrastructure owner; use `fileURLToPath` and normalized relative paths |
| `security/buildDependencyPatches.test.mjs` symlink subcase | explicitly skipped on Windows | keep Linux CI evidence; do not infer Windows coverage |
| missing dependency/build failures in this run | TLS/install environment | rerun from a verified lockfile/cache on the qualified platform |

No frozen failure was changed in this consolidation branch because none was
shown to conceal a consolidation defect and the demo fixture is protected.

## 13. Unresolved blockers

1. `supabase_admin` public-schema default ACLs remain permissive because the
   connected migration role lacks authority to change another owner's defaults.
2. Qik's spatial runtime still has shared-role ambient authority beneath the
   now-correct external capability gate.
3. Yhb active schedulers, large unique corpus and unresolved in-flight state.
4. Nie unique Auth/history and legacy workers; jfn unique spatial history.
5. Legacy browser-callable SECURITY DEFINER mutations.
6. Full service-secret/ambient-runtime boundary and external caller inventory.
7. Exact per-project billing, backup/PITR and recovery authority.
8. Full data hashes/identity maps and isolated restore rehearsal.
9. Reproducible Edge bundles, especially spatial-runtime v6.
10. Qualified lockfile install, full test baseline and integration/auth tests.

## 14. Actions requiring owner authorization

- Change `supabase_admin` defaults through an authorized Supabase platform-owner
  path; do not grant broad role membership as a workaround.
- Replace the spatial shared-role append surface with database-enforced wrappers
  or separately scoped runtime principals.
- Use or rotate any production credential or reveal/configure secret values.
- Create a billable recovery project or change paid resources/backups.
- Pause/cut over yhb cron or any legacy Edge/external caller.
- Import production data, Auth users, storage objects/config or in-flight jobs.
- Change live Vercel/GitHub/Pages/publication state.
- Merge to main, deploy production functions, drop schemas/tables, pause or
  delete a project, or downgrade/change billing.

## 15. Is consolidation complete?

**No.** Canonical intent is clear, but authority, unique data, active callers,
recovery and authorization state are unresolved.

## 16. Is any redundant paid project demonstrably retirement-ready?

**No.** All four share an organization-level Pro plan, but project-specific
cost impact is unknown. More importantly, every predecessor has unique or
unreconciled data/configuration, and yhb has active production-like jobs.

## 17. Exact recommended next action

Build the qik collector shadow from the recovered live yhb v8/v15 packages and
the already-qualified generation-fenced queue foundation. First install the
five missing private operational contracts, transfer a new write-fenced source
snapshot, and run qik manually with publication and acknowledgement disabled.
Only after count/hash/output parity should the two every-five-minute schedules
be moved from yhb to qik. Keep yhb running until that exact cutover fence is
verified; deletion/pausing remains out of scope.
