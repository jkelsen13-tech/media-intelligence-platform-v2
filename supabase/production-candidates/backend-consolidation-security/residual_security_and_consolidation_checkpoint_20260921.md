# Residual security and consolidation checkpoint — 2026-09-21

This is the parent-reconciled active checkpoint for the bounded continuation.
It preserves completed containment, records only sanitized evidence, and does
not authorize a live change.

## Repository and observation boundary

- Repository: `jkelsen13-tech/media-intelligence-platform-v2`
- Branch: `codex/mip-backend-consolidation-20260920`
- Updated through native-path implementation head `e1816b8d49d961888b9017ea3b6552cc2cb8ec0b`, tree `93f8d10d71988d6f3ae3428d335b2dc61b8b23bd`
- PR #177 remains open, draft and unmerged.
- Live catalog/data observations in this checkpoint were bounded read-only
  checks from 2026-09-21 17:00:08 through 19:56:47 UTC.
- The yhb three-view write containment, two deny-all Edge replacements,
  five-function GDELT containment, projection-retraction EXECUTE containment,
  accepted source-forward recovery standard, and qik predicate
  KEEP_WITH_JUSTIFICATION remain completed and were not repeated or changed.

## Parent-reconciled residual authorization dispositions

### COMPLETED AFTER SEPARATE OWNER AUTHORIZATION

`public.mip_retract_arc_membership_projection(uuid)` is **APPLIED AND
VERIFIED**, not pending authorization. Migration
`20260921175457_contain_yhb_arc_projection_retract_browser_execute_20260921`
removed only explicit anon/authenticated EXECUTE. PUBLIC remained absent;
postgres/service_role and the enabled internal postgres trigger retained
effective authority. Target and trigger definition hashes, memberships and
all recorded non-target ACL/definition fingerprints were unchanged.

Bounded negative role checks returned PostgreSQL `42501` without executing
the mutator. Fresh postflight advisors reduced the historical 22
browser-executable SECURITY DEFINER findings per browser role to 21 and
excluded the target. The exact private receipt is commit
`287514de511ea01c281e9cafd5bf01ea0c9b40c4`, blob
`8eae3d8581bb18e0e56ef72eb452bda6d5c8d4ca`. The inverse remains unapplied
recovery evidence and is not authorization to restore browser access.

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
| qik canonical intent | At 19:55:09 UTC: 98 articles; newest fetched row 2026-09-16; 2 Auth users; no storage objects; no cron schema. Collector-shadow remains receipt-only and does not write canonical articles. | Target-shaped isolated restore, real rights-approved retained input custody, scheduler/worker binding, canonical stage transitions and recovery rehearsal. |
| yhb active predecessor | At 19:55:02 UTC: 34,630 articles; newest fetched row 19:50:10 UTC; two enabled five-minute jobs; no Auth users or storage objects. | Consistent export/fence, ongoing-delta procedure, worker/caller cutover and replay/rollback proof before any cutover or retirement decision. |
| nie predecessor | At 19:55:10 UTC: 752 articles, 347 events, 839 claims, 1,892 explanations, 750 nodes, 411 edges and 3 Auth users; zero profiles/storage objects; six ACTIVE Edge functions, including the completed deny-all policy-ingest v17. | Full table/provenance reconciliation, Auth identity and attribution decision, Edge caller/package disposition, restore proof and target population verification. |
| jfn predecessor | At 19:55:12 UTC: 1 article and 1 node; zero Auth users/storage objects; no Edge functions. Both records are absent from qik, yhb and nie by hashed ID checks; the article URL is also absent. | Preserve and classify these unique records, export schema/functions/config, establish restore procedure and close all callers before disposition. |

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

## Bounded native isolated execution and recovery

Code head `e1816b8d49d961888b9017ea3b6552cc2cb8ec0b`, tree
`93f8d10d71988d6f3ae3428d335b2dc61b8b23bd`, run `35648523721`,
native job `106494809370` passed with fresh High review.

The existing deterministic literal extractor generated two pending literal
claim candidates from 216 original synthetic bytes (SHA-256
`fd357bc7ff7646368600db86a009133b51ba99d9bb22e2b6157592455a8dec81`).
The unchanged native evidence-pipeline migration persisted input admission,
capture bytes, stable identity, candidates, job events and version history.
The lane exercised duplicate admission, rollback/reconnect, stale completion,
retry/new lease, correction as `revision_pending`, pending-only review state
and private/public denials. It did not inject supplied judgments or fabricate
accepted graph/public state.

A plain dump (SHA-256
`55b75e1e10ef3b823cc0f9151fdb8374b159f58a007abb89964cf8b6b1083bc7`)
was checksummed and restored into a second socket-only PostgreSQL 17.6
database. Eight row hashes and the native function-definition fingerprint
matched after scoped current-authority revocation. Containers had no network
or published ports and received no production credential.

Private receipt and exact synthetic input custody are at commit
`90bc84f3fedf7736274714c1d1a203a95c85601d`. The dump was deleted after
rehearsal, so durable dump custody and cluster-role restore remain unproved.
The public CI lane is authorized only for synthetic material. No qualifying
real retained input was located: prior CC bytes are gone/closed and the EFTA
rights matrix remains unapproved.

This is concrete validation of a bounded portable native segment, not the
complete intended pipeline. Semantic evaluation, assessment/review generation,
downstream invalidation/reconsideration, comparison, graph, temporal,
investigation, hosted Auth/pooler/gateway/Edge/Storage/Realtime and managed
backup/PITR remain untested.

## Dependency-ordered path

1. Preserve all completed containment; apply no further live change without a fresh bounded owner authorization.
2. Obtain one exact rights-approved retained capture and verify private custody/readback; the bounded synthetic native segment is already qualified.
3. Extend the isolated lane through the actual provider-neutral semantic evaluator, assessment/review and stale-output reconsideration contracts without supplied judgments.
4. Reconcile the nie corpus/Auth/Edge state and jfn unique records into independently restorable canonical packages, including a consistent yhb fence plus ongoing deltas.
5. Preserve a durable private restore artifact and rehearse definitions, data, identities and independently recreated roles/authority.
6. Bind and verify qik schedulers/workers/callers plus hosted Auth/gateway/Edge behavior before any live cutover.
7. Only then assess predecessor cutover readiness, recovery time and retirement/billing effects. No predecessor is currently retirement-ready.

## Independent verdicts

- **AUTHORITY CONSOLIDATED: FAIL.** Active runtime/data authority remains on
  yhb; nie retains data, Auth users and active Edge functions; jfn has unique
  records; caller and recovery closure are incomplete.
- **PIPELINE VALIDATED IN ISOLATION: FAIL for the complete intended pipeline.**
  The bounded portable deterministic-extraction → native capture/candidate
  persistence → ephemeral dump/restore segment now passes. Real retained input,
  semantic assessment and later analytical stages remain unqualified.
- **PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND: FAIL.** Qik has no
  canonical ingestion scheduler/history and its deployed collector-shadow is
  receipt-only.

No project is cutover-ready or retirement-ready. This checkpoint makes no
production, data, credential, scheduler, billing, project-state, frontend,
merge or retirement change.
