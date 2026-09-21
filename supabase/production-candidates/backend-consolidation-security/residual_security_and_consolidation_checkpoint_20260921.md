# Residual security and consolidation checkpoint — 2026-09-21

This is the parent-reconciled active checkpoint for the bounded continuation.
It preserves completed containment, records only sanitized evidence, and does
not authorize a live change.

## Repository and observation boundary

- Repository: `jkelsen13-tech/media-intelligence-platform-v2`
- Branch: `codex/mip-backend-consolidation-20260920`
- Prepared against head `4fdeca5fe3e830b38505f8bd2dbc585bcfa4f2d5`
- PR #177 remains open, draft and unmerged.
- Live catalog/data observations in this checkpoint were bounded read-only
  checks from 2026-09-21 17:00:08 through 17:26:01 UTC.
- The yhb three-view write containment, two deny-all Edge replacements,
  five-function GDELT containment, accepted source-forward recovery standard,
  and qik predicate KEEP_WITH_JUSTIFICATION remain completed and were not
  repeated or changed.

## Parent-reconciled residual authorization dispositions

### READY_FOR_AUTHORIZATION

`public.mip_retract_arc_membership_projection(uuid)` is the highest-risk
independently actionable unit. It is postgres-owned, SECURITY DEFINER, and has
no caller-identity or candidate-state authorization check. Direct invocation
marks the projection run retracted and deletes associated edges, sources, arc
events and nodes. Current direct EXECUTE is explicit for postgres, anon,
authenticated and service_role; PUBLIC is absent. Browser roles have no
inherited role path.

The only stored-function caller located is the enabled postgres-owned
`mip_arc_membership_projection_state_change()` trigger. Retained statement
statistics contain two top-level postgres calls; this is positive operator
evidence, not exhaustive external-caller closure.

The successor removes only explicit anon/authenticated EXECUTE:

- Candidate blob: `cdc7e531c7490c37417780027dba7bdcd1f315a6`
- Candidate SHA-256: `a1b5f940fd7a45666c7aac544b1c275c1b6b28d33e0f58db598cf2d1e86abf98`
- Candidate UTF-8 length: 367 bytes
- Inverse blob: `df1d06072e7ac32022f657feb987743bcdcb00a4`
- Inverse SHA-256: `33e227a5fd50f5035820b07f39229d84fb8e4fee36b221c9d61d2e269cec8678`
- Inverse UTF-8 length: 326 bytes
- Target definition SHA-256:
  `232c921ca5c157da976cd25b70f59fa0fa6364a0fe437092d5c4a55ba87d3023`
- Trigger definition SHA-256:
  `ddeb2f97ad70b568c66770782f9fc7a724c7feebb0c9d810e409ab52ff9d0569`

Exact-head run `35631547770`, job `106438686545`, passed the native-body
isolated harness. It reproduced browser destructive behavior before the
candidate; denied anon/authenticated afterward; preserved service_role direct
execution and the internal definer-trigger path; preserved definition hashes
and the non-target trigger ACL; restored the normalized ACL with the exact
inverse; replayed the candidate; and proved transaction rollback.

The fresh High reviewer independently classified the candidate
**READY_FOR_AUTHORIZATION**. Limits: synthetic rows; no milestone evidence rows;
the refresh helper is stubbed; approval/project branches, the full production
constraint/trigger graph, Edge callers and external operator integrations were
not executed. The inverse restores ACLs only and is not permission to regrant
browser access.

### PREPARE_NARROW_CONTAINMENT

- `mip_approve_arc_membership_candidate(uuid)`
- `mip_project_approved_arc_membership(uuid)`
- `mip_refresh_arc_projection_milestone(uuid)`
- `mip_seed_arc_membership_candidates(integer)`
- `mip_sync_arc_source_comparison_events(integer)`
- `mip_v2_promote_deterministic_article_claims(uuid)`

These direct/control-plane helpers remain browser executable and need
function-specific caller and dependency qualification. They are not coupled
merely by prefix.

The read-disclosure partition also remains open:

- `authors_public`: **NO_CHANGE_JUSTIFIED** for its current id/name projection.
- `news_detail_public`: **PREPARE_NARROW_CONTAINMENT**; a native aggregate
  probe found 13 ineligible article rows and 14 current claim surfaces.
- `comparison_public`: **PREPARE_NARROW_CONTAINMENT**; all 35 projected
  explanation objects observed were nonpublished or non-OK.
- `graph_coverage_public`: **PREPARE_NARROW_CONTAINMENT**; its 34,591 article
  population is not an eligible-only population.

A view-only change cannot establish full disclosure containment. Direct
browser SELECT and permissive policies remain on articles, events,
explanations, nodes, edges, story_arcs and citations; authenticated access is
also broader on several claim/review tables. The next design must reconcile
the public-disclosure contract and live callers before selecting filtered
replacement definitions or a temporary cutoff.

### CALLER_TRANSITION_REQUIRED

The writer-key interfaces
`mip_v2_ingestion_begin_run(...)`,
`mip_v2_ingestion_write_batch(...)`, and
`mip_v2_ingestion_finish_run(...)` have a supported retained client using an
anon JWT plus writer key and positive retained execution counts. Browser-role
revocation must follow a separately qualified caller transition.

### NO_CHANGE_JUSTIFIED

Enabled trigger functions, the two boolean schedule-authorization predicates,
the ingestion writer-key assertion helper, and other trigger-only helpers do
not justify mechanical revocation solely because an advisor labels their
SECURITY DEFINER EXECUTE grants. This disposition is scoped to the present
browser-EXECUTE review, not a blanket security certification.

## Consolidation prerequisites — corrected live facts

The parent independently rechecked reviewer findings and corrected earlier
empty-project summaries.

| Project | Bounded current evidence | Concrete missing prerequisite |
|---|---|---|
| qik canonical intent | 98 articles; newest fetched row 2026-09-16; 2 Auth users; no storage buckets/objects; no cron schema. Collector-shadow records feed receipts only and does not write canonical articles. | Target-shaped isolated restore, real rights-approved retained input custody, scheduler/worker binding, canonical stage transitions and recovery rehearsal. |
| yhb active predecessor | 34,591 articles at 17:24:17 UTC; newest fetched row 17:20:08 UTC; two enabled five-minute jobs; no Auth users or storage objects. | Consistent export/fence, ongoing-delta procedure, worker/caller cutover and replay/rollback proof before any cutover or retirement decision. |
| nie predecessor | 752 articles, 347 events, 839 claims, 1,892 explanations, 750 nodes, 411 edges and 3 Auth users; zero profiles; one empty storage bucket; six ACTIVE Edge functions. | Full table/provenance reconciliation, Auth identity and attribution decision, Edge caller/package disposition, restore proof and target population verification. |
| jfn predecessor | 1 article and 1 node; zero Auth users, buckets and objects. Both records are absent from qik, yhb and nie by hashed ID checks; the article URL is also absent. | Preserve and classify these unique records, export schema/functions/config, establish restore procedure and close all callers before disposition. |

Qik and yhb contain 3,818 mapping rows and 1,504 conflict rows with identical
ordered full-row SHA-256 values under the same query:

- mapping: `49c53ff2678220325c4d6d21cdd654b0ad54d4a08e8f6a5fc3cd3e01cf3fb32d`
- conflicts: `b6bc9645f4ac7d86609b939743901ddee94766de3cc7c0045ac6633a44a8cf66`

This proves ledger-copy fidelity for that bounded snapshot, not operational
replacement. The nie article source-ID set has 752 rows and hash
`25e4e6037a0aacec09c85df57fed860ad7123682b103276775ec16a08a72cb54`,
exactly matching the nie article source-ID mapping group. Mapped target IDs
exist in yhb; qik holds only three of those target article IDs. Thus qik has
the ledger but not the mapped corpus or operating ingestion history.

The smallest next pipeline-validation prerequisite is an existing,
target-shaped isolated Supabase environment with relevant roles/extensions
and authenticator/pooler path, an independently accessible restore input, and
one rights-approved retained capture whose exact bytes may enter private
isolated custody. Existing collector and cutover qualifications are synthetic
or receipt-only; they do not supply that evidence.

## Dependency-ordered path

1. Apply no further live change without a fresh bounded owner authorization.
2. If authorized, preflight and apply only the ready projection-retraction ACL
   candidate; verify effective denial and retained worker/trigger authority.
3. Separately authorize private isolated custody/transfer for one retained
   input plus a target-shaped restore environment.
4. Exercise native capture, ingestion, extraction, evidence, decision and
   recovery transitions; label every unexercised semantic stage.
5. Reconcile the nie corpus/Auth/Edge state and jfn unique records into an
   independently restorable canonical package.
6. Bind and verify qik schedulers/workers/callers before any live cutover.
7. Only then assess predecessor cutover readiness, recovery time and
   retirement/billing effects. No predecessor is currently retirement-ready.

## Independent verdicts

- **AUTHORITY CONSOLIDATED: FAIL.** Active runtime/data authority remains on
  yhb; nie retains data, Auth users and active Edge functions; jfn has unique
  records; caller and recovery closure are incomplete.
- **PIPELINE VALIDATED IN ISOLATION: FAIL.** Individual native ACL and
  concurrency harnesses pass, but there is no authorized target-shaped,
  real-input end-to-end analytical exercise.
- **PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND: FAIL.** Qik has no
  canonical ingestion scheduler/history and its deployed collector-shadow is
  receipt-only.

No project is cutover-ready or retirement-ready. This checkpoint makes no
production, data, credential, scheduler, billing, project-state, frontend,
merge or retirement change.
