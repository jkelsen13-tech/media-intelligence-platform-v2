# N1 · Nie responsibility reconciliation and private membership preservation

**Section result: PARTIAL toward nie retirement; isolated integration increment PASS.** Stage 4 predecessor consolidation under the owner's N1 authorization, observed 2026-09-23 approximately 08:14–08:31 UTC. Nie still carries substantial source and analytical state. This section added a private, source-qualified preservation path for its Source Comparison memberships and executed it with synthetic native dependencies. No nie record moved and no live caller changed.

**Identities.** Repository `jkelsen13-tech/media-intelligence-platform-v2`, branch `codex/mip-backend-consolidation-20260920`; before `dc04a3197206914bdeb576cd0f6c7e36f9fdf67c`; tested application/test/workflow `009251cbcf62b231b867a2acd0e8de970acfbeaa`, tree `34dd80d2ac979fda84a2e8d31310f6aa313497be`. The report and workflow-restoration successor do not change tested SQL/JS/tests. Source `niejaejtbxgakyrsntxm`, destination `qikvmopbtijoebdqosyq`; yhb protected and jfn retired. PR #177 remained draft/unmerged at section entry.

**Evidence basis and team.** Direct bounded Supabase catalog/aggregate reads, branch/main/qualification code inspection, source-free GitHub runner, independent High review, and preserved C1/C2/J1 receipts. Sol Medium implemented the bounded candidate; Luna Medium inspected distinct source/destination/caller evidence; a fresh non-implementing Astra High reviewer examined the code, workflow and logs. Parent configured model/effort telemetry was not exposed, so no exact parent setting is asserted. The adopted post-consultation v3 workflow, consolidation handoff v3 and owner instructions govern; the news-first identity, evidence and publication requirements remain unchanged. No source material or Auth identity was exported.

## Architecture before and observed gap

The application browser origin is locked in code to qik. Nie retains source comparison, graph and analytical tables, three Auth users, and six Edge functions marked ACTIVE. Qik has the existing private `legacy_graph_staging` foundation and 3,818 nie-qualified ID mappings across 15 families, but the staging and payload-version tables contain **zero** rows. Direct target joins found only 3 of 752 mapped articles, 1 of 347 mapped events, 0 of 750 mapped nodes and 0 of 411 mapped edges in qik canonical tables. A mapping records an intended identity, not a matching payload, full history, independent recovery or live integration. Qik has no nie archive evidenced by this bounded catalog inspection.

The source snapshot counted 752 articles, 347 events, 839 claims, 1,892 explanations, 750 nodes, 411 edges, 340 sources, 963 entities, 38 citations, 898 article-claim associations and 413 event-article memberships. These are separate read-only statements on two projects, not a synchronized cross-project transaction. The private [N1 observation and run receipt](https://github.com/jkelsen13-tech/mip-production-qualification/blob/dde2395ca123acb93eac220dba0df6f51cf068ce/evidence/nie-reconciliation/2026-09-23-n1-bounded-reconciliation.json) carries exact aggregate scope and limits.

The existing generic staging foundation keys records by UUID `source_id`. Nie's native `public.event_articles` instead has composite `(event_id, article_id)` identity, with both columns referencing native parents and with membership method, confidence and creation time. Treating that row as another UUID record would lose native identity or invent one. Existing `comparison_public` publication gates must remain distinct from historical custody.

## Responsibility and disposition matrix

| Nie responsibility | Observed preservation/replacement | N1 disposition and exact gap |
|---|---|---|
| Articles and source captures | 752 mapped; only 3 mapped targets present; 752 historical no-pre-import-snapshot gap records | Required real history. Current source snapshot and older versions are not independently preserved by mapping; private custody and rights decision needed. No automatic News eligibility. |
| Events and event-article memberships | 347 event mappings; 1 target; 413 composite memberships without a mapping family | Required Source Comparison history. New private composite adapter qualifies future custody only after same-source event and article snapshots are staged. |
| Claims, explanations, article-claim links | Nie counts 839, 1,892 and 898; qik counts 4, 0 and 6; no complete source-qualified mappings | Required analytical outputs and lineage until provenance/evidence roots, generation versions and review meaning are classified. Copying duplicates must not increase corroboration or confidence. |
| Graph nodes, edges, entities, citations, arcs | Mappings exist for several families; 0 mapped nodes/edges present in qik; other payload/history parity unproved | Required real structure and spatial/temporal meaning; preserve exact dependencies and source-qualified versions before any runtime replacement. |
| Qualification and unresolved provenance | Aggregate table counts cannot distinguish these records reliably | Keep private and source-qualified; do not label all synthetic or promote old approvals. |
| Auth and attribution | Nie has 3 users and a legacy profile structure with retained session records; qik has 2 users and a different profile structure | Required access versus historical attribution versus tests unresolved. Build private source-qualified purpose map before any account transition. No email merge, token/password copy or role change. |
| Edge, cron, Storage and callers | Six nie Edge entries ACTIVE; two nie cron jobs inactive; one empty public Storage bucket; code contains retained importer/manual analysis paths | ACTIVE is metadata, not useful execution. Browser code points to qik; deployed bundle and out-of-band operator use remain unproved. Preserve needed analytical callers; do not invoke historical functions. |
| Jfn and yhb | Jfn retirement confirmed; yhb protected | No new dependency on deleted jfn and no responsibility shifted to yhb. |

## Change, rationale and architecture after

This section **EXTENDs** the existing private legacy graph staging owner with `supabase/qualification/nie-membership/001_private_membership.sql`, `scripts/mipNieMembership.mjs` and `tests/mipNieMembership.test.mjs`. The [exact tested qualification candidate](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/009251cbcf62b231b867a2acd0e8de970acfbeaa/supabase/qualification/nie-membership/001_private_membership.sql) remains unapplied and is the only proposed SQL identity. The procedure accepts exactly the five native membership fields with a fixed nie source ref, verifies deterministic JSONB hash, and requires pending source-qualified event and article staging rows. A `gap_recorded` or quarantined parent cannot satisfy dependency closure. Same-content retry is idempotent; divergent content appends an immutable predecessor-linked version and quarantines review without overwriting the original. It writes no public event/article/comparison row.

The first review found an important missing-snapshot defect: the initial predicate admitted `gap_recorded` parents. The corrected predicate requires `pending`; tests now reject that case. The correction also rejects SQL-level non-string native fields, narrows service-role table grants after revocation, and tests a successful write followed by rollback and retry. Direct qik catalog inspection confirmed its source-qualified staging uniqueness constraint, correcting an incomplete earlier table-list observation. No qik table, role, policy, migration, Auth record, source configuration or function was changed in N1.

Isolated architecture now is:
`nie-qualified staged event + article → private composite membership + immutable divergent versions → pending human/reconciliation decision`.
The live architecture remains unchanged:
`nie historical state / code → existing qik identity mappings and sparse canonical rows`.
A proposed staging contract is not a running transfer or public Source Comparison integration.

## Verification, limits and cost

[Run 35837335077/job 107103832218](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35837335077/job/107103832218) checked out exact `009251cb` / tree `34dd80d2` on standard `ubuntu-24.04`. After locked dependency preparation, it ran `node --test --test-concurrency=1 tests/mipNieMembership.test.mjs tests/mipLegacyGraphStaging.test.mjs` inside a non-root, read-only, network-disabled container capped at 1 GiB and V8 768 MiB. **29/29 PASS**, zero fail/cancel/skip; broad build job SKIPPED; disposable cleanup PASS; no artifact uploaded. Cases cover native composite PK, cross-language hashes, missing/gap parents, exact fields, retry/divergence, immutable history, successful transactional rollback/retry, service-role rights, anon/authenticated denials, and unchanged public comparison readback. Existing staging regression cases passed in the same execution.

Fresh non-implementing High review independently fetched exact code and logs, reconciled all four corrections, and returned PASS for this scoped isolated delta. It did not independently replay the test. The run does not prove hosted Supabase Auth/PostgREST/Edge behavior, actual 413-row custody, a dump/restore of new membership tables, ongoing transitive dependency revalidation, complete analytical pipeline or nie retirement. It qualifies a private synthetic adapter.

N1 ledger: **1 of 6 executions**, 39 of 3,600 observed runner-seconds; 5 executions and 3,561 seconds remain. GitHub's [billing rule for standard runners in public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions) supports **VERIFIED NO ADDITIONAL CHARGE**; the timing endpoint reported zero billable milliseconds. No paid runner, new service, storage artifact or Supabase project was added. All 20 application workflow blobs were restored to their before-state after the run; no restoration-triggered run occurred. The old build exception and prior campaign test allowance remain consumed.

## Larger architecture, readiness and next unit

Canonical ownership is clearer: qik's existing mapping ledger is useful for identity but does not replace nie's source/history custody; the new contract handles a native composite association without inventing an ID. It preserves uncertainty and review separation so an old membership or duplicated analytical output cannot become fresh corroboration. Home/News, Graph, Timeline, Arcs, Source Comparison, World View and Investigation Context render and publication behavior did not change. A fast article card or historical membership is not an accepted claim or approved comparison.

| Readiness boundary | N1 conclusion |
|---|---|
| Required real state/history preservation | NOT READY: sparse qik target presence; no complete payload/version/dependency custody |
| Independent recovery | PARTIAL: isolated transaction/retry PASS, no actual-row or new-table dump/restore |
| Canonical runtime replacement | NOT READY: six Edge entries need responsibility-specific caller/functional closure |
| Auth and caller closure | NOT READY: three users' purpose/transition and external/manual invocations unresolved |
| Nie retirement and billing reduction | NOT READY: no pause, deletion, transfer or savings in N1 |

Campaign verdicts remain distinct: **AUTHORITY CONSOLIDATED — not established campaign-wide**; **PIPELINE VALIDATED IN ISOLATION — not established for the complete intended pipeline**, despite this bounded PASS; **PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND — not established**. Jfn's confirmed retirement and C1/C2 results remain intact. Nie's state does not force a fixed order relative to yhb; specific qik preservation and runtime closure determine its path.

**Next exact owner authorization proposed:** authorize one qik-only application of the exact private membership SQL candidate, after fresh bounded target-definition/ACL/cost preflight and security-advisor review, with no source rows, account changes, provider invocation, public grant or publication. The action would record exact installed definitions and private/public denials; any failure stops without a forced regrant. This is a schema prerequisite for later separate, data-specific nie custody authorization, not permission to copy 413 memberships or retire nie. No live installation is authorized by N1 itself.

**Continuation state.** No further N1 dispatch is needed on this PASS. The next owner decision is the exact private qik installation unit above; absent that decision, retain the candidate and private receipt for later. Reuse the tested composite-key contract, existing staging foundation, qik target constraint evidence and High review. Do not repeat jfn qualification, C1/C2, sample acquisition or this completed isolated run. No durable MIP files were created on the owner's physical device.
