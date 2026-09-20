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

## 1. Git identity, governing handoff, and protected history

- Delivery branch: `codex/mip-backend-consolidation-20260920`
- Starting commit: `08ede62269390aeec13b10d34c945b72563fc6a0`
- Pre-delivery head: `d5472ba791c2b27722938ba94d90a1b5ba8e70e5`
- Final delivery commit/tree: reported by the handoff after the commit is made;
  a commit cannot truthfully contain its own hash.
- Current `main`: commit
  `1dc317200b7a928fad85d06b43351b60e2a50d92`, tree
  `5ebc3687e7b22b4a78fce1681999035b57738995`.
- Integration branch: `codex/integrated-reconciliation-20260914`, head
  `4d69243cd2de91d7588e4eb263cc05b48e8fd0ef`; PR #175 remains open,
  draft, and unmerged.
- The owner-rejected isolated demo branch remains frozen historical evidence
  only. It was not edited, deployed, merged, repurposed, or used to define
  product behavior in this reconciliation.

The supplied archives were read and verified before relying on them. No local
project checkout, extraction directory, report copy, or generated consolidation
artifact is retained on the user's device.

| Archive | SHA-256 | Verification |
|---|---|---|
| `MIP_PRELAUNCH_SEQUENCE_RECONCILED_v5_2026-09-19.zip` | `8E21E4B4ACAB96EDF8F33FC36C2B5A1AA122FD6910A1431D24829744C5C7AEFB` | internal manifests previously matched |
| `Media intelligence platform version 4.zip` | `50E4B6B2C26B713FFCE761CE44EBDEE2086DC807B34B7CDB540C7DDD7A13D41A` | root and assessment manifests previously matched |
| `MIP_CONSOLIDATION_HANDOFF_RECONCILED_v2_2026-09-20.zip` | `522BBA1EBCA36F32EC5FA0B7F167C1779F499267EE629E0AE3A19CD7AE0FD4B0` | read in memory; successor prompt/map/notes and original provenance members matched the supplied hashes |

The controlling instruction from the latest archive is only
`01_NEXT_RUN_CONSOLIDATION_PROMPT.txt` (24,996 bytes,
SHA-256 `DAA660C2E905471D3FE5393E5239256A48311100BF810BCE7A1574E214E753F7`).
The bundled original prompts are provenance, not competing instructions.

## 2. Verified current backend inventory

All four projects were `ACTIVE_HEALTHY` in organization
`ntmqymyaujspymfqmxew` on an organization-level Pro plan during the latest
read-only verification. Exact per-project compute size, line-item cost,
backup/PITR retention, egress, and direct-connection consumers were not exposed
and remain unknown.

| Project | Current name | Region / PostgreSQL | App tables / views / exact rows | Auth | Edge / migrations | Jobs and storage |
|---|---|---|---:|---:|---:|---|
| `qikvmopbtijoebdqosyq` | `mip-v2-account-verification-20260831` | `us-west-1` / `17.6.1.166` | 104 / 9 / 22,321 | 2 | 9 / 42 | no cron table; no buckets/objects |
| `yhbwnrtlqbjtcrrlpbge` | `mip-v2-manus-sandbox-20260818` | `us-west-1` / `17.6.1.155` | 97 / 12 / 177,996 | 0 | 6 / 67 | two active five-minute crons; no buckets/objects |
| `jfnzyvzthzqtczlxhjll` | `mip-spatial-verification-sandbox-20260829` | `us-west-1` / `17.6.1.166` | 28 / 0 / 46 | 0 | 0 / 6 | no active cron; no buckets/objects |
| `niejaejtbxgakyrsntxm` | `jkelsen13-tech's Project` | `us-west-2` / `17.6.1.104` | 92 / 3 / 14,103 | 3 | 6 / 78 | two inactive crons; public empty `post-media` bucket |

Latest exact evidence through approximately `2026-09-20T20:07Z`:

- qik: 98 articles, exactly three `reader_state = 'eligible'`; 95 captures;
  95 identities; 96 evidence candidates; 195 evidence changes; 100 record
  versions; one assessment; zero decision-worker evaluations/revocations;
  15,331 collector row versions; seven shadow sources and seven shadow receipts.
- yhb: 34,343 articles; 1,604 article claims; 45,630 article-entity links;
  9,020 extraction results; 13,541 entities; 13,008 events; 13,586
  event-article links; 218 story arcs; all seven ingest sources enabled; all
  seven ingestion sources active; 7,722 ingestion runs. The latest observed
  ingestion completed at `2026-09-20T19:55:19.482Z`.
- nie: 752 articles; 898 article claims; 1,550 article-entity links; 839
  claims; 963 entities; 411 edges; 347 events; 1,892 explanations; 49 arcs;
  340 sources; five of five ingest-source rows enabled, but no active cron.
- jfn: 39 spatial rows and seven public rows, including eight assertion
  revisions, nine policy artifacts, four release decisions, and three lineage
  rows.

Yhb's two `*/5` pg_cron jobs each recorded 288 successes and zero failures in
the observed 24-hour window. Their commands use pg_net plus Vault-backed
scheduler tokens; their functions run with service-role authority. Qik has no
recurring scheduler. Its collector-shadow receipts prove only bounded
authorization and source reachability. Nie's two old jobs are inactive; their
stored command text contains legacy bearer material and therefore requires
credential cleanup before any future reactivation. Secret values were not
reported.

No GitHub workflow has a schedule trigger, and the checked-in Cloud Run
workflow is manual. An external scheduler/caller outside the inspected
surfaces remains `NOT_DEMONSTRATED`, not disproven.

The sanitized receipts remain under
`verifier/backend-consolidation-2026-09-20/`. No full local read-only capture
or extracted archive directory is retained.

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

| Project | Consolidation disposition | Retirement status | Exact reason |
|---|---|---|---|
| qik | **KEEP_REQUIRED** | not applicable | Canonical destination and live product backend; owns Auth, evidence, investigation, assessment, spatial and public-projection foundations, but not yet the active ingestion/scheduler authority |
| yhb | **CONSOLIDATION_PENDING** | **BLOCKED** | 177,996 rows, active five-minute ingestion/comparison jobs, unique analytical data, six Edge Functions, Vault scheduler references, critical browser-callable authority, and no proved complete restore/cutover |
| jfn | **CONSOLIDATION_PENDING** | **BLOCKED** | 46 unique rows including spatial revisions/policy/release/lineage history; no complete export/restore and provenance reconciliation |
| nie | **CONSOLIDATION_PENDING** | **BLOCKED** | 14,103 rows, three Auth users, unique history/config, six Edge Functions, an empty public bucket definition, a critical callable service-role ingest path, and no recovery/caller closure |

No predecessor is `READY_TO_AUTHORIZE_CUTOVER` or `SAFE_TO_RETIRE`.
Historical labels such as “sandbox” or “original” do not override current data,
callers, authorization state, or recovery obligations.

## 5. Caller/dependency matrix

| Caller | Backend/project | Operation | Auth identity | R/W | Current necessity | Target after consolidation | Cutover / verification |
|---|---|---|---|---|---|---|---|
| Canonical GitHub Pages live UI at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` | qik REST/public views | public articles, outlets, citations, graph, events and projections | publishable/anon | R | required; verified live from main run `34440532626` | qik | live bundle `assets/index-BUxP66NE.js` called only qik; preserve anon read and forbidden writes |
| Account UI | qik Auth + `mip_profiles` | OTP/session/profile | end-user JWT | R/W own profile | required | qik | login/session/profile regression and capability separation |
| Private investigation UI | qik `investigation-api` | workspace, checks, reviews, spans | authenticated non-anonymous user | R/W gated | required | qik | member/reviewer/revoked/non-member matrix |
| qik private Edge handlers | qik RPCs | dispatch allowlisted private operations | service role after custom user check | R/W | required | qik with narrower ambient authority | function-specific auth plus reachable-privilege tests |
| qik `spatial-runtime` | qik direct DB | append/review/release operations | user JWT plus shared runtime role | W | required foundation; residual ambient-risk gate | qik | operation capability and immutable attribution tests |
| qik `capture-retrieval` | qik | capture status/retrieval/run-next | configured service credential | R/W jobs | required | qik | lease/generation/idempotency and credential-boundary tests |
| qik `collector-shadow` | qik private receipt tables | network/source probes only | custom Vault token; gateway JWT disabled | W receipts | qualification only; no recurring caller proved | remove or retain as bounded verifier after cutover | verify caller identity before disposition |
| yhb cron job 2 `ingest-rss` | yhb | ingestion every five minutes | anon JWT + Vault scheduler token; service role in function | W | actively required today | qik successor | shadow parity, watermarks, observability, owner-gated move, rollback window |
| yhb cron job 3 `source-comparison-run` | yhb | enrichment every five minutes | anon JWT + Vault scheduler token; service role in function | R/W | actively required today | qik successor | generation/hash/count parity and rollback window |
| yhb `backfill-legacy` | yhb | destructive reset/backfill and derivation | any valid JWT reaches service role; no app-level auth | destructive R/W | not a required public caller; critical exposure | disabled/owner-only until reconciled | immediate containment candidate; negative anon and positive owner tests |
| yhb 27 public SECURITY DEFINER RPCs | yhb | ingest, promotion, membership and graph mutation | PUBLIC/anon/authenticated execution | R/W | browser execution not demonstrated as required | dedicated worker/service identity only | revoke candidate, caller scan and worker compatibility |
| nie `policy-ingest` | nie | external fetch plus service-role writes | any valid JWT; no app-level auth | R/W | schedule inactive; callable exposure remains | disable/owner-only, then reconcile | immediate containment candidate; negative anon and positive owner tests |
| yhb `import-original-source` | reads nie, writes yhb | legacy import and downstream comparison | function credential; gateway JWT disabled | R/W | legacy dependency until reconciled | remove after canonical import | source-qualified import receipt and zero-caller observation |
| Operator CLI/scripts | all projects | service RPCs and verification | service/operator keys | R/W | required where evidenced | qik plus named recovery authority | scoped credentials, named owner and audited runbook |
| Vercel project `media-intelligence-platform-v2` | former-demo deployment residue | historical deployment/config only | Vercel project config | none for canonical product | not a product caller/reference | no target | preserve as evidence; any removal remains owner-gated and off critical path |
| GitHub workflow `.github/workflows/blank.yml` | qik | Pages build config | repository variables/static ref | build/read | active on main | qik | verified successful Pages deployment |
| External scheduler/operator not present in repo/pg_cron | unknown | possible collection trigger | unknown | unknown | **NOT_DEMONSTRATED** | explicit registry | obtain platform inventory before caller closure |
| Tests/fixtures/runtime snapshots | all four refs appear | provenance, migration and replay evidence | none/live calls generally mocked | read/fixture | required as evidence | retain qualified history | distinguish executable callers from docs/snapshots |

The live UI resolves the apparent article-count discrepancy: it requests the
three qik rows with `reader_state = 'eligible'`, while qik contains 98 article
rows in total. These are different populations, not conflicting same-query
measurements.

Static project-ref matches remain leads rather than proof of active callers.
Vercel's former-demo deployment is explicitly non-authoritative; it does not
reopen the canonical live-surface decision.

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

## 8. RLS, authorization, and ambient-authority findings

This section reconciles a High-effort security review of all four live projects.
No write or exploit was attempted.

### Literal RLS advisory status

Read-only catalog checks found zero RLS-disabled base or partitioned tables in
`public`, `storage`, or `graphql_public` across qik, yhb, jfn, and nie.
The earlier “RLS disabled” advisory is therefore no longer a current
base-table condition. RLS-enabled tables with no policy are deny-by-default,
not evidence of anonymous exposure: current no-policy counts were qik 84, yhb
52, jfn 21, and nie 42.

That does not make the Data API safe by itself. Views, function EXECUTE grants,
SECURITY DEFINER ownership, Edge service-role credentials, and custom exposed
schemas are separate authorization surfaces.

### Critical: yhb `backfill-legacy`

Deployed yhb `backfill-legacy` v9
(`5cd76641e068fb512c9d0815f9d35325a9806be11593829df1daf62f87de8f68`)
requires a gateway-valid JWT but performs no application-level authorization
before creating a service-role client. A holder of the active public legacy
anon JWT can therefore reach service-role execution. Its `?reset=1` path
deletes citations and article-entity state, clears article derivation fields,
and wipes/rebuilds the arc layer, including story arcs, nodes, edges, sources,
and related material. This is an actual destructive authorization
vulnerability. No invocation or exploitation evidence was found, and the path
was not called during review.

### Critical: yhb browser-callable SECURITY DEFINER RPCs

Twenty-seven public SECURITY DEFINER functions are executable through PUBLIC,
`anon`, or `authenticated`. They include ingestion writer functions,
deterministic claim promotion, arc membership approval/projection/retraction,
source-comparison scheduling and GDELT staging/materialization. Many are
mutators with no caller authorization check. REST RPC exposure was confirmed.
A production-gated candidate now inventories exact signatures, validates
`prosecdef`, revokes browser execution, explicitly grants `service_role`,
and provides an exact rollback file. It is not applied.

### High: yhb owner-executed public views

Yhb's owner-executed public views remain readable by browser roles. Read-only
anon checks returned 1,098 authors, 34,343 `news_detail_public` rows and four
comparison rows. The news view does not apply qik's reader-eligibility filters:
23,858 noneligible articles were visible, including 13 noneligible articles
with 14 current claim surfaces. This is an actual data-boundary leak relative
to the canonical public projection. The candidate revokes browser SELECT on
all four reviewed yhb owner views pending caller verification and a constrained
replacement; it changes no rows.

### High: nie `policy-ingest`; bounded `debug-parse` risk

Deployed nie `policy-ingest` v16
(`f18ec228daf35dd5001a436c1299a1229bab32fcc1657179bf44d0ef5c6143ef`)
accepts a gateway-valid JWT, performs no app-level authorization, then uses a
service-role client for external fetches and writes. An anon-key holder can
trigger it. Its schedule is inactive, but HTTP reachability is a live
authorization vulnerability. `debug-parse` lacks an application gate but is
currently a compute/cost abuse surface rather than a demonstrated data writer.

Nie's profile UPDATE policy omits an explicit `WITH CHECK`, but PostgreSQL
reuses `USING` when `WITH CHECK` is omitted. This review does **not** claim a
profile-takeover vulnerability; an explicit check is defense-in-depth clarity.

### Qik and residual ambient authority

Qik has six owner-executed public views. Anonymous read checks returned three
filtered news rows, one comparison row, and one spatial projection row; the
same noneligible leak was not reproduced. Qik has no public SECURITY DEFINER
function executable by browser roles. Two `mip_private` arc-approval predicate
functions are nevertheless executable by PUBLIC/browser roles without need; a
separate non-deployed candidate revokes them and preserves service-role use.

Seven private investigation functions re-authenticate the user and check
database membership before service-role operations, but compromised Edge code
would still inherit service-role authority. `capture-retrieval` is
secret-gated. `collector-shadow` uses a custom token. `spatial-runtime`
uses a non-bypass login role with no table grants but can execute twelve
SECURITY DEFINER operations. These are bounded yet nonzero ambient authorities.

Leaked-password protection is disabled on qik and nie. Enabling it requires an
Auth regression gate. Custom PostgREST exposed-schema settings remain
unresolved where the connected catalog cannot prove dashboard configuration.

### Prepared but not applied containment

The exact production candidates are under
`supabase/production-candidates/backend-consolidation-security/`. They:

- make no row/data changes;
- require exact object/signature preflight;
- revoke yhb browser RPC/view access and qik unnecessary predicate execution;
- preserve explicit rollback grants;
- specify deny-all-first Edge containment and later owner-secret gates;
- require negative anon/auth tests, positive dedicated-worker tests, unchanged
  row counts/hashes, advisor recheck, and caller verification.

Immediate production application, Edge deployment/disablement, credential
creation, and leaked-password changes remain owner-gated.

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
- Added production-gated, rollback-ready authorization containment candidates
  for the exact 27 yhb SECURITY DEFINER signatures, four yhb owner-executed
  views, two unnecessary qik private predicates, and the yhb/nie Edge
  authorization gates. These candidates were not applied or deployed.
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

1. Critical live authorization: yhb `backfill-legacy`, yhb's 27
   browser-callable SECURITY DEFINER RPCs, yhb's unfiltered owner views, and
   nie `policy-ingest` require owner-authorized production containment.
2. `supabase_admin` public-schema default ACLs remain permissive because the
   connected migration principal cannot alter another owner's defaults.
3. Qik spatial runtime retains shared-role ambient authority beneath the
   external capability gate; private investigation handlers retain service-role
   authority after application checks.
4. Yhb remains the active ingestion and comparison authority with unique
   corpus, in-flight state, Vault-backed schedules, and unresolved cutover.
5. Nie retains unique Auth/history/config; jfn retains unique spatial history.
6. Full service-secret, external scheduler/operator, webhook and direct
   connection ownership is not closed.
7. Exact per-project billing, backup/PITR, RPO/RTO, export custody and recovery
   authority remain unknown.
8. Full data hashes, identity mappings and a target-shaped isolated restore
   rehearsal remain incomplete.
9. A single representative retained article has not traversed every canonical
   ingestion, extraction, decision, graph/event/timeline, publication-gate and
   observable terminal stage in isolation or on qik.
10. The provider-neutral decision contract remains distributed. Canonical
    semantic key/evidence digest/binding/version/cache/invalidation and
    cross-user reuse safety are not fully integrated.
11. Absence causes and knowledge-change causes have located foundations but no
    one installed canonical representation; several current paths still
    collapse analytically distinct states.
12. Reproducible Edge bundles, qualified lockfile install, full baseline tests,
    and complete auth/integration tests remain incomplete outside the bounded
    packages already recorded.

The Vercel former-demo deployment is not a blocker to identifying the canonical
live product. GitHub Pages on verified `main` is the canonical live surface.
Any Vercel cleanup is a separate owner-gated historical-resource action.

## 14. Remaining owner/platform gates

The owner authorized broad non-destructive reconciliation. That authority
supports the isolated candidates and remote branch work in this report. It does
not override the express gates on production mutation, credential creation or
rotation, paid infrastructure, destructive action, caller cutoff, deployment,
or retirement.

The next gate is narrowly scoped production security containment:

- deny all access to yhb `backfill-legacy` and nie `policy-ingest` before
  any later owner-secret re-enable;
- revoke browser execution from the 27 exact yhb SECURITY DEFINER signatures;
- revoke browser SELECT from the four reviewed yhb owner views pending caller
  verification and safe projection replacement;
- revoke unnecessary browser/PUBLIC execution from the two qik private
  predicate functions;
- preserve current definitions/grants as rollback evidence; make no row/data
  changes; verify authorized worker compatibility before any permanent grant
  narrowing.

Separate later gates remain for leaked-password protection, platform-owner
default ACLs, any credential change, a paid recovery environment, protected
data export, scheduler/caller cutover, publication, main merge, and retirement.

## 15. Consolidation and runtime verdicts

### AUTHORITY CONSOLIDATED — **FAIL**

Qik is the unambiguous intended destination and the canonical live UI uses it,
but yhb still owns active collection/comparison, every predecessor retains
unique or unrecovered state, critical authorization exposure is unresolved,
external caller closure is incomplete, and no predecessor restore/cutover is
proved.

### PIPELINE VALIDATED IN ISOLATION — **FAIL**

Individual and cross-component qualifications pass for substantial foundations,
including the 25-test collector authority core. No single production-shaped
isolated system has traversed the complete required path with real authority,
failure observability, recovery behavior, semantic decision ownership,
absence/change semantics, and provider-disabled behavior.

### PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND — **FAIL**

The canonical qik live UI and public reads operate, but qik has no active
collector schedule and no representative retained article has completed the
intended canonical analytical path. Qik's seven receipt-only probes are not
ingestion. Yhb's active predecessor pipeline does not make qik operational.

## 16. Is any redundant paid project demonstrably retirement-ready?

**No.** Qik is `KEEP_REQUIRED`; yhb, jfn, and nie are
`CONSOLIDATION_PENDING / BLOCKED`. Exact per-project billing effect remains
unknown. Unique data/configuration, active or callable authority, recovery, and
caller closure prevent `READY_TO_AUTHORIZE_CUTOVER` and
`SAFE_TO_RETIRE` for every predecessor. No pause, deletion, downgrade, or
billing change is authorized or proposed for execution.

## 17. Exact recommended next action

The exact next bounded owner-authorization prompt is:

> Authorize immediate production security containment on yhb
> `yhbwnrtlqbjtcrrlpbge` and nie `niejaejtbxgakyrsntxm`, plus the bounded
> qik predicate cleanup, exactly as prepared under
> `supabase/production-candidates/backend-consolidation-security/`: deploy
> temporary deny-all versions of yhb `backfill-legacy` and nie
> `policy-ingest`; revoke PUBLIC/anon/authenticated EXECUTE from the 27
> enumerated yhb SECURITY DEFINER functions while retaining explicit
> `service_role` access; revoke anon/authenticated SELECT from the four
> enumerated yhb owner-executed views pending caller verification; and revoke
> unnecessary PUBLIC/anon/authenticated EXECUTE from qik's two enumerated
> private predicate functions while retaining `service_role`. Preserve the
> current deployed function bodies and exact grants for rollback; make no
> row/data, scheduler, source, publication, credential, billing, project-state,
> or retirement change. After application, run negative anon/authenticated Edge
> and RPC tests, positive authorized-worker compatibility checks, public
> projection checks, unchanged row-count/hash verification, and fresh security
> advisors. Roll back any revoke that breaks a verified required caller.

After that containment is verified, return a separate authorization request
for a fresh, access-controlled PostgreSQL 17/Supabase-compatible recovery and
full-pipeline rehearsal. That later request must specify the destination and
cost, approved source/rights/privacy cohort, recovery custodian and deletion
date, secret-handling boundary, disabled schedules/publication/provider calls,
and exact restore plus one-article end-to-end verification plan. It must not
move the yhb schedules or cut over any caller.

