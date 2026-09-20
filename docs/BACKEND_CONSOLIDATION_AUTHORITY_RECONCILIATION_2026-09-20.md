# MIP version 2 backend consolidation and canonical-authority reconciliation

Date: 2026-09-20

Target deadline: 2026-10-03
Decision: **not complete; no project is retirement-ready**

## Independent acceptance verdicts

### A. AUTHORITY CONSOLIDATED — **FAIL**

Qik is the intended destination and owns the strongest Auth, investigation,
evidence, assessment, spatial, and public-projection foundations. Authority is
not consolidated: yhb still owns the active large corpus and both scheduled
workers; nie retains unique Auth/data/history; jfn retains unique spatial
history; caller closure and full data/identity mappings are incomplete; the
provider-neutral System-One contract is only partially implemented; and no
predecessor has a proved isolated restore. Therefore retirement readiness
cannot be affirmed for any predecessor.

### B. PIPELINE VALIDATED IN ISOLATION — **FAIL**

The repository contains substantial isolated foundations for hypothesis
assessment, entity/agency resolution, content-addressed storage, Markets
evidence, authority, comparison, and collector behavior. Exact integration-head
and current-branch CI prove many individual contracts. They do not yet prove a
single representative retained article through the complete intended ingestion,
extraction, provider-neutral decision, graph/event/timeline, publication and
observable-failure path in one production-shaped isolated system. Component
qualification therefore remains evidence, not a substitute for full-pipeline
isolation validation.

### C. PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND — **FAIL**

The intended qik ingestion and analytical pipeline is not operational. Qik has
no active cron. Its collector shadow proved authorization and HTTP reachability
to seven feeds, but intentionally wrote no articles, events, claims,
explanations, operational runs, or downstream analysis. The active ingestion
and source-comparison schedules remain on yhb. No representative retained
article traversed a qik-owned schedule, ingestion, extraction, semantic
decision, graph/event/timeline, and observable completion path. The surviving
pipeline therefore still relies on predecessor authority.

These three verdicts are independent. Neither backend consolidation nor live
launch readiness may be inferred from component isolation or the bounded
security and shadow work in this report.

This report began with read-only inventory and now records the bounded live
reconciliation expressly authorized by the owner on 2026-09-20. It includes
six canonical migrations, one canonical Edge upgrade, a new receipt-only
collector shadow, two legacy function grant repairs, one sandbox RLS repair,
and append-only retention of the current yhb collector delta. It does not
rotate credentials, cut off a required caller, pause/delete a project, change
billing, merge main, or change publication data.

The inspectable reconstructed Phase 1 decision record is
`docs/PHASE1_BACKEND_RECONCILIATION_CHECKPOINT_2026-09-20.md`. The checkpoint
requirement arrived after bounded Phase 2 work had started, so it is explicitly
labelled as a reconstruction from retained pre-change evidence. Further live
production work is paused at the new owner-review gate. The System-One,
absence-semantics, and knowledge-change reconciliation is recorded in
`docs/SEMANTIC_DECISION_ABSENCE_CHANGE_AUTHORITY_2026-09-20.md`.
The corrected eight-stage foundation/runtime ownership checkpoint is
`docs/FOUNDATION_RUNTIME_OWNERSHIP_CHECKPOINT_2026-09-20.md`.

## 1. Git identity and protected reference

- Delivery branch: `codex/mip-backend-consolidation-20260920`
- Starting commit: `08ede62269390aeec13b10d34c945b72563fc6a0`
- Starting tree: `7d559e9d3ea51a6178fe453b2b178f2321d3898e`
- Final delivery commit/tree: reported by the handoff after the commit is made;
  a commit cannot truthfully contain its own hash.
- Current `main` observed: commit
  `1dc317200b7a928fad85d06b43351b60e2a50d92`, tree
  `5ebc3687e7b22b4a78fce1681999035b57738995`.
- Former isolated demo historical branch:
  `codex/mip-september-22-demo-20260918`, commit
  `195109b48f12ae5d472b1794e9680d53f2c0de34`, tree
  `785de273770e7365eae90b7ca73d29be3f0e45ac`.
- The demo branch was inspected only. It was not edited, committed, pushed,
  deployed, merged, or repurposed.
- It is frozen historical work only and has no behavioral, architectural,
  algorithmic, presentation, qualification, or acceptance authority. The
  September 22 consultation uses the current live MIP platform as its primary
  surface. No isolated-demo output contract or presentation was used to define
  correct MIP behavior in this reconciliation.

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

A read-only re-verification from `2026-09-20T17:48:08Z` through
`17:50:27Z` confirmed all four projects remain `ACTIVE_HEALTHY` on PostgreSQL
17.6. Yhb's two `*/5` jobs are actively operating, not merely configured:
`mip-ingest-rss-hourly` and `mip-source-comparison-enrichment` each recorded
288 successes, zero failures, and a latest successful start at `17:45Z` during
the preceding 24 hours. The historical project name does not change its current
collector ownership. Qik still has no `pg_cron`; its seven shadow receipts do
not establish recurring canonical ingestion.

The sanitized durable receipt is
`verifier/backend-consolidation-2026-09-20/live-reverification-20260920T175027Z.json`.

A later foundation/runtime recheck at `19:02Z`–`19:04Z` confirmed that yhb
collection is actively producing data, not merely scheduled: all seven sources
were enabled, both five-minute jobs again had 288/288 successful runs and zero
failures, 239 articles had been fetched in the preceding 24 hours, and the
latest ingestion run completed at `19:00:19.631Z`. The deployed v8 function
accepts either the owner key or its Vault-backed scheduler token; it is not the
later repository-only implementation that returns a disabled response when an
owner key is absent. The sanitized checkpoint receipt is
`verifier/backend-consolidation-2026-09-20/foundation-runtime-checkpoint-20260920.json`.

There were no database branches on qik, yhb, or jfn. Nie had a default `main`
branch entry. Secret values were not inspected. Vault *names* on yhb show live
scheduler/config ownership: `mip_ingest_rss_anon_jwt`,
`mip_ingest_rss_project_url`, `mip_ingest_rss_scheduler_token`, and
`mip_source_comparison_scheduler_token`.

The sanitized point-in-time evidence is in
`verifier/backend-consolidation-2026-09-20/live-inventory-summary.json`. The
full local read-only capture is retained outside Git because it is an audit
working artifact, not product configuration.

After the initial census, qik received the append-only collector history,
canonical operational contracts, a private seven-source shadow registry and
seven successful shadow receipts. It now has 42 migration records and nine
Edge Functions. Its live row/table totals therefore no longer equal the
initial table above. The exact receipts are
`verifier/backend-consolidation-2026-09-20/live-reconciliation-receipt.json`
and `collector-shadow-live-receipt.json` in the same directory.

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
| Provider-neutral System-One decisions | qik assessment/change foundation plus unmerged hypothesis/authority contracts; no provider-specific live authority proven | **RECONCILE/EXTEND qik** | Unify the located decision IDs, evidence bindings, temporal/method revisions, permission-safe reuse, typed invalidation, deterministic disposition and provider-disabled behavior; do not create a parallel store |
| Reconsideration and source history | qik change queues, dependency runs, record versions, 9,537 collector versions and 45 spatial versions | **EXTEND qik** | Confirm all legacy generations/leases/checkpoints are represented before cutover |
| Investigation workspace/context | qik private evidence pipeline and eight deployed Edge functions | **EXTEND qik** | Reduce service-role blast radius without weakening RPC membership/reviewer checks |
| Search/discovery | front ends read qik public projections; backing corpus authority is split | **RECONCILE around qik** | Projection parity after corpus move; Data API exposure and ACL tests |
| Spatial projections / World View | qik schema/runtime is intended authority; jfn retains 46 verification/release rows | **RECONCILE into qik** | Import unique jfn history; add admin-controlled capability model; complete reproducible runtime bundle |
| Terrain/runtime dependencies | repository/Vercel build assets; no separate Supabase storage objects observed | **EXTEND repository contract** | Reproducible dependency install/build and deployment evidence |
| Temporal intelligence | yhb owns material timeline data; qik temporal/publication output is incomplete | **RECONCILE into qik** | Preserve date evidence, uncertainty, placement audits and release gating |
| Markets | typed evidence contract, private workspace/transport, isolated Markets evidence package and unapplied graph-compatibility candidate are located in integration/current; none is live authority | **RECONCILE/EXTEND qik; not NEW** | Review the candidate against qik graph/evidence foundations, retain default-closed endpoints, and require installation/data/E2E evidence before enablement |
| Publication/public projection | qik public views are intended surface; legacy yhb/nie functions also mutate publication | **RECONCILE around qik** | Fix qik view write ACLs; migrate callers before revoking legacy entrypoints |
| Private/public boundary | qik private investigation boundary is strongest; the direct public-view and self-service spatial escalations are remediated | **EXTEND and harden qik** | Close residual `supabase_admin` defaults and shared-runtime ambient authority |
| Content-addressed storage/rehydration | qik evidence identities/captures and `capture-retrieval`; zero storage objects | **EXTEND qik** | Prove actual byte-level restore/rehydration, not only metadata rows |
| Jobs/workers/selective ingestion | yhb two active five-minute jobs; legacy Edge workers on yhb/nie; qik has no active cron | **RECONCILE into qik** | Scheduler ownership, idempotency, credentials, in-flight work and rollback window |
| Environment/configuration | GitHub, Vercel, Vault names, Supabase project settings and branch code all participate | **RECONCILE** | Establish a single non-secret config registry and eliminate hidden ref fallbacks |

Former-demo observations are excluded from the authority map and product-gap
definition. Any code with former-demo provenance must be evaluated
independently against the governing requirements, current architecture, live
backend state, security boundaries, and foundation-reuse rules before adoption.

Absence and change semantics are also incomplete. Current code correctly
distinguishes some states—Source Comparison omission versus extraction/coverage
unknown, source unavailable, reviewed absence markers, and partial/unavailable
loads—but no canonical backend enum owns all required meanings. Similarly,
source changes only type `corrected`/`withdrawn`, while assessment invalidations
identify evidence or supersession without a complete “why knowledge changed”
taxonomy. The semantic authority report maps every required distinction and
classifies it as EXTEND, RECONCILE, or NEW.

## 4. Project-by-project disposition

| Project | Disposition | Exact reason |
|---|---|---|
| qik | **KEEP; canonical intent; NOT CONSOLIDATION-COMPLETE** | Owns canonical Auth/investigation/evidence/spatial foundations and the two direct High paths are remediated, but legacy corpus/jobs and residual ambient/default authority remain |
| yhb | **CONSOLIDATE; NOT RETIRE-READY** | 177,478 rows, 34,277 articles, 45,399 article-entity links, 13,008 events, active ingestion/comparison jobs, six Edge functions and Vault scheduler references; no proved restore/caller cutover |
| jfn | **CONSOLIDATE; NOT RETIRE-READY** | Not empty: 46 rows including eight assertion revisions, nine policy artifacts, four release decisions and three lineage rows; its five formerly RLS-off owner-only tables are now RLS-enabled, but no full export/restore proof exists |
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
| Former isolated demo preview | historical artifact; not a product caller or reference | protected historical surface | none in this run | not required | no target | no cutover | preserve remotely; spend no reconciliation effort |
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
| `collector-shadow` | 1 | false | custom high-entropy Vault token; fetch/hash/count receipt-only contract and no schedule, but the host still carries ambient service-role credentials and is not a least-authority runtime |

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

The `17:48Z`–`17:50Z` re-verification found zero public base/partitioned tables
with RLS disabled across all four projects. That closes the literal base-table
condition, not the authorization review. Current security advisors still report:

- qik: six owner-authority (`security_invoker=false`) public views, plus 84
  RLS-enabled/no-policy informational findings;
- yhb: four owner-authority views, 27 effectively anon-callable and 27
  authenticated-callable SECURITY DEFINER routines, and 13 mutable search paths;
- jfn: one anon/authenticated-callable SECURITY DEFINER routine; and
- nie: the `feed_posts` owner-authority view, 92 GraphQL-exposed tables for each
  browser role, three anon/authenticated-callable SECURITY DEFINER routines,
  and 11 mutable search paths.

These counts are reachability leads, not automatic vulnerability verdicts.
Each effective grant must be reconciled with its RLS policy, function body,
owner, search path, downstream calls, and intended caller. The new read-only
catalog audit in `supabase/tests/backend_consolidation_20260920_verification.sql`
reports those edges and flags unsafe implicit default function privileges;
dynamic SQL and dashboard-only Data API settings remain separately unresolved.

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
- Extended qik with the five missing private operational contracts:
  `ingestion_runs`, `ingestion_source_runs`, `author_profile_queue`,
  `original_source_import_credentials`, and
  `source_comparison_enrichment_queue`. All use RLS + FORCE RLS, deny browser
  roles, and explicitly grant only service-role DML. The queue trigger exists,
  but no worker or schedule was activated.
- Installed `pg_net` as transport only; qik still has no `pg_cron` extension and
  no collector schedule.
- Deployed qik `collector-shadow` v1. An unauthenticated probe failed 401. Seven
  explicitly dispatched probes fetched all seven retained yhb feed endpoints
  successfully and wrote only immutable private receipts. Post-probe canonical
  counts remained 98 articles, one event, four claims and zero explanations;
  all five new operational tables remained empty.
- Advanced the yhb collector-history fence through
  `2026-09-20T15:42:51.302400Z`. Source and qik archive now match at 7,672
  ingestion runs (`db13a5...96da9`) and 7,652 source runs
  (`e8d67a...23a1b`) by exact ordered full-payload SHA-256.
- Retrieved and retained the live yhb `ingest-rss` v8 and
  `source-comparison-run` v15 source text, normalized only for line endings and
  trailing whitespace, with the authoritative deployed package hashes under
  `supabase/runtime-snapshots/*-live-20260920`.
- Reverified all jfn spatial content: 39 spatial rows and six parent rows across
  21 relations remain exact ordered-hash matches in qik's 45-row archive. The
  only non-archived row is `pipeline_config.account_ui=true`, already present on
  qik with the same value and description.
- Added regression tests that reject missing projection coverage, future-object
  default ACL drift, row DML, view replacement, `security_invoker` flips, and
  accidental grants in that candidate.
- Prepared, but did not apply, an isolated follow-up index for the
  `ingestion_source_runs.run_id` foreign key after PostgreSQL schema review.
- Prepared, but did not deploy, a network-free collector algorithm-shadow
  candidate under `supabase/functions/collector-algorithm-shadow-candidate`.
  It evaluates caller-supplied staged text with the captured yhb v8 pure
  parser/extractor seams, hard-disables providers, records typed absence,
  malformed-input, URL-taint, and coverage state, and can call only dedicated
  claim/complete/fail
  capabilities supplied by a future host. It contains no Supabase client,
  service-role credential, environment access, table interface, fetch path,
  scheduler, publication action, or predecessor acknowledgement.
- Reused the existing generation-fenced Source Comparison candidate and v16
  pure projection snapshot as the comparison foundation. The live yhb v15
  entrypoint is not reusable as a shadow host because it destructively
  rebuilds derived rows, can approve events, and acknowledges a mutable
  all-pending queue.
- Added a Vercel branch deployment guard and a regression test for it.
- Preserved the protected demo and made no destructive backend change.

The spatial gate preserves the current principal set to avoid a caller cut-off;
it does not assert that both principals should permanently retain all three
capabilities.

## 10. Tests and verification

Isolated branch checks include:

- Node syntax/static tests for the new SQL candidate and Vercel guard.
- JSON parse of `vercel.json` and the sanitized inventory summary.
- Repository diff/secret scan and branch-identity check.
- Collector-shadow contract tests, JSON receipt validation, live 401 negative
  authorization, service-role-only RPC/table privilege checks, and seven live
  source successes.
- Acceptance-document tests requiring separate authority/pipeline verdicts,
  the Phase 1 evidence sections, all decision-layer fields, all eight absence
  meanings, all twelve knowledge-change causes, and a no-provider-activation
  rule.
- Twelve focused algorithm-shadow tests pass, including the full sanitization
  golden corpus, deterministic staged-input derivation, typed
  `not_extracted`/`coverage_incomplete` semantics, internal source/rights/method
  binding checks, absence of ambient database/network/provider paths, exact retry,
  remote-journal request recovery mechanics, and fail-closed journal behavior.
  These are not a proved production recovery path. The six
  existing dependency-free collector-shadow checks and four golden
  sanitization checks also pass.

- A separate qualification-only collector algorithm-shadow SQL contract passes
  five PGlite tests and a native PostgreSQL 17.6 workflow passes all 25 bounded
  concurrency/security/recovery tests (GitHub Actions run `35530600346`). The native
  suite uses separate direct-login connections and verifies effective identity,
  owners/default ACLs/RLS, denial of role escalation and unrelated callers,
  `SKIP LOCKED`, rollback attempt accounting, exact replay, atomic terminal
  visibility, complete/fail and rights-revocation ordering, authority rechecks
  after a blocking lock, expired-session rejection, lease-token rotation,
  bounded recovery contention/exhaustion, deterministic backend termination
  before and after commit, and persistence across a graceful database restart.
  It now also proves completion/replay ordering for source, session, runtime,
  implementation, configuration, and rights rollback, and creates new
  owner-defined functions to verify effective default ACLs rather than treating
  absent `pg_default_acl` rows as safe. It also performs a same-cluster custom
  logical dump and single-transaction restore without replaying contract DDL,
  then compares catalog/owner/ACL/RLS/policy/function/sequence fingerprints and
  every private history table, exercises replay/denial/claim behavior, and
  appends a new sequenced recovery event. The 145,129-byte archive had SHA-256
  `f72d017793cc115146c166a2365502d69894a5fc5ced43af92905195931bfd8c` and
  restored in 506 ms in that disposable run.
  This is bounded native-core qualification evidence—not deployment evidence
  and not a predecessor or disaster-recovery rehearsal. It does not establish Supabase
  authenticator/pooler behavior, the target database's complete inherited
  `PUBLIC`/security-definer privilege graph, production provenance/rights
  authority, isolated credentials/host, remote-journal controls, claim/fail
  variants of the authority-revocation matrix, rights/lease expiry after each
  applicable lock, fresh-cluster/global-role reconstruction, PITR, crash
  recovery, or dump-and-restore recovery of the intended target.

The transient local environment could not complete the full dependency-backed
PGlite batch because of host resource limits. That is not counted as a local
pass. The independent native PostgreSQL workflow result above is the durable
concurrency evidence; repository-wide CI status is recorded separately and
does not convert this qualification contract into a deployed or recovered
system.

## 11. Recovery evidence

Recovery is not proven for any predecessor.

- The synthetic collector qualification contract now has a successful
  same-cluster PostgreSQL 17.6 logical dump/restore rehearsal with object,
  authority, history, sequence, replay and post-restore mutation checks. Its
  pre-existing global roles and same service container are explicit limits;
  this is not evidence for predecessor data, Supabase Auth/Storage/Edge/Cron,
  a fresh cluster, PITR, or crash/disaster recovery.

- Existing `backend_recovery_verification_2026-09-05.json` covers 15 snapshot
  files and explicitly says fixture tests do not establish production
  readiness.
- `mipConsolidationRestore.mjs` starts from simplified fixture DDL and synthetic
  examples; it is not a full production disaster restore.
- The retrieved spatial-runtime v6 package references lock/module/test inputs
  that are absent from the eight-file snapshot, so exact redeployment is not
  reproducible from the retained bundle alone.
- The two active yhb collector worker packages are now durably retained in Git
  with deployed versions and package hashes. This improves code recovery, but
  does not yet prove database/secret/scheduler restore or output equivalence.
- Auth counts are not identity/session equivalence. Source IDs link profiles,
  memberships, review receipts and audit attribution and must survive migration.
- Empty storage objects do not prove bucket configuration, policies, URL
  compatibility or external callers are recoverable.
- Restoring an older database also restores its older authorization state. The
  collector contract has no independent restore epoch or external revocation
  checkpoint, so a faithful archive can still predate a rights/session/runtime
  revocation. Any restored system must remain quarantined until current
  authority is reconciled; archive fidelity alone cannot authorize reactivation.

Each predecessor needs a fresh consistent export or verified backup/PITR point,
an independently accessible encrypted copy with a named recovery owner, and a
successful isolated restore covering schema, owners, grants, RLS, sequences,
functions, jobs, Auth flows, storage config/bytes, Edge build inputs, secrets by
reference, histories, in-flight leases and publication behavior. Counts,
hashes, referential invariants, negative authorization and RPO/RTO must be
recorded.

## 12. Former demo lane disposition

The former 93-source isolated demo branch, its output contracts, presentation,
qualification receipt (including the historical 1,588-pass/25-failure result),
and preview are frozen historical evidence only. They are not an acceptance
baseline for this run, and their failures are not consolidation work.

Before this scope correction, a Windows reproduction was attempted and some
portability symptoms were classified. All detailed results have been removed
from this validation record and are excluded from both acceptance verdicts and
the recommended work queue. No demo test, contract, presentation, or
implementation was changed or adopted. No further run budget will be spent
repairing or reconciling the former demo lane.

An ancestry and changed-path audit confirms that the frozen demo commit is not
an ancestor of this consolidation branch. Of the 52 paths changed from the
authorized consolidation base through commit `dd36905`, only `vercel.json`
also exists at the frozen demo commit. The files differ: this branch contains
only an independently required deployment-disable guard for
`codex/mip-backend-consolidation-20260920`; it contains no demo route, header,
output contract, corpus, or presentation behavior. This audit found no
demo-derived implementation adopted by the consolidation changes.

## 13. Unresolved blockers

1. `supabase_admin` public-schema default ACLs remain permissive because the
   connected migration role lacks authority to change another owner's defaults.
2. Qik's spatial runtime still has shared-role ambient authority beneath the
   now-correct external capability gate.
3. Yhb active schedulers, large unique corpus and unresolved in-flight state.
4. Nie unique Auth/history and legacy workers; jfn unique spatial history.
5. Browser-callable owner-authority views/functions and their complete
   downstream privilege graph, especially the yhb and nie advisor findings.
6. Full service-secret/ambient-runtime boundary and external caller inventory.
7. Exact per-project billing, backup/PITR and recovery authority.
8. Full data hashes/identity maps and isolated restore rehearsal.
9. Reproducible Edge bundles outside the newly retained collector packages,
   especially spatial-runtime v6.
10. Qualified lockfile install, full test baseline and integration/auth tests.
11. Production realization of the qualified collector-shadow boundary. The
    isolated SQL now defines the required direct-login/three-RPC model, but
    actual Supabase role creation, effective PUBLIC/security-definer privilege
    closure, pooler behavior, host secret isolation, real authority-record
    integration, remaining claim/fail revocation cases, archive/crash recovery,
    and connection-path semantics remain unproved. The
    worker must not be hosted with an ambient service-role credential.

## 14. Remaining owner/platform gates

The owner's later clarification authorizes non-destructive reconciliation
across all backends, including isolated production DDL and new bounded Edge
functions. That authority was used for the live changes recorded here. It does
not erase the mission's express irreversible/destructive reservations.

- `supabase_admin` default ACL repair requires a Supabase platform-owner path;
  the current database principal cannot perform it. Broad role membership is
  not an acceptable workaround.
- Secret disclosure/rotation, a new paid recovery project, backup-plan or
  billing changes remain explicit credential/cost gates.
- Public publication changes, main-branch merge, destructive schema/data
  changes, project pause/delete/downgrade, or permanent caller/scheduler
  shutdown remain gated until their rollback and recovery evidence is complete.
- Private staging imports, additive canonical contracts, bounded shadow
  functions and reversible verification remain authorized and in scope.

The later checkpoint acceptance rule now makes the already-observed production
mutation requirement, split runtime authority, and residual authorization
ambiguity an owner-review gate. No further live production mutation, scheduler
activation/cutover, corpus import, provider activation, or credential change is
being performed in this run after that rule. Isolated documentation, tests,
candidate migrations, and review packaging remain safe.

## 15. Is consolidation complete?

**No. AUTHORITY CONSOLIDATED fails.** Canonical intent is clear, but authority,
unique data, active callers, recovery, decision semantics, and authorization
state remain unresolved.

**PIPELINE OPERATIONAL also fails independently.** Qik has no active scheduler
and no representative article has completed the intended canonical end-to-end
analytical path. The receipt-only shadow is not an ingestion pipeline.

## 16. Is any redundant paid project demonstrably retirement-ready?

**No.** All four share an organization-level Pro plan, but project-specific
cost impact is unknown. More importantly, every predecessor has unique or
unreconciled data/configuration, and yhb has active production-like jobs.

## 17. Exact recommended next action

Owner review should authorize an **isolated qik restore rehearsal**, not a live
deployment. Apply the qualification design there with newly provisioned
restricted direct-login identities; connect it to synthetic or independently
approved retained captures; audit all inherited PUBLIC/security-definer paths;
run real two-connection claim/completion/revocation/requeue races and
connection-loss/restart recovery; and verify the remote journal's controls.
The rehearsal and any later host must have no ambient service role or shared
project writer credential.
Only a clean rehearsal should produce a timestamped production migration and
host proposal for a separate owner decision. It must not move either
five-minute schedule. Only a later gate, after production-authority approval,
restore proof, measured shadow parity, and an end-to-end qik article traversal,
may consider scheduler cutover. Yhb must remain active through a measured
rollback window; pause, deletion, and destructive retirement remain out of
scope.
