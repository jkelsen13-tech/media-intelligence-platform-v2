# MIP foundation-to-runtime ownership checkpoint

Date: 2026-09-20

Status: parent-reconciled, read-only checkpoint recorded before any further
foundation implementation. The former isolated 93-source demo is excluded from
product, architecture, algorithm, presentation, qualification, and acceptance
authority.

## Verified comparison anchors

- `main`: `1dc317200b7a928fad85d06b43351b60e2a50d92`
- integration branch: `codex/integrated-reconciliation-20260914`
- integration head: `4d69243cd2de91d7588e4eb263cc05b48e8fd0ef`
- PR #175: open, draft, unmerged, base `main`, exact head above
- consolidation pre-checkpoint head: `498b68e73985b6a201cc979f7d10578a4c712aad`
- Both verified anchor commits are ancestors of the consolidation branch. This
  establishes file lineage only; it does not establish deployment or authority.

GitHub Pages deployed `main` successfully in run `34440532626`. PR #175 records
14 successful component/integration workflows on its exact head, including the
repaired Markets parser run `34917764936`. Those runs prove only their stated
isolated/integration scopes. The integration branch and PR remain unmerged.

Push safety was rechecked before checkpoint delivery. GitHub Pages deploys only
on a push to `main`; Cloud Run deployment is manual; generic branch pushes run
tests only; and the consolidation branch's tracked `vercel.json` disables
Vercel deployment for that exact branch. Vercel's live deployment list showed
no consolidation-branch deployment after the prior pushes. The connector could
not return the project-settings object because of a connector schema mismatch,
so that project-level setting remains unverified rather than inferred.
The same read-only list returned the latest production deployment for Vercel
project `media-intelligence-platform-v2` from the former-demo branch at
`f4932d82b989ae95a176ff2427d6892c9b0d418f`. That deployment is caller/config
evidence only and has no product-reference authority. It conflicts with the
verified GitHub Pages `main` deployment as a claimed live surface, so the owner
must identify the canonical live URL/project before frontend caller closure or
any deployment proposal.

## Eight required runtime stages

Every capability is evaluated separately at these stages:

1. **Foundation located** — relevant code, schema, candidate, or live overlap was found.
2. **Contract / implementation coverage** — the located foundation implements a bounded requirement.
3. **Tested in isolation** — exact-scope executable evidence exists.
4. **Integrated with required components** — the component is composed with its required peers.
5. **Installed / deployed** — the exact implementation is present in the applicable runtime.
6. **Enabled** — its entrypoint, worker, source, or schedule is active as intended.
7. **Authorized real data** — non-fixture data has passed the applicable source, rights, privacy, and identity gates.
8. **End-to-end operational verification** — a representative item completed the intended path with observable failure handling.

`Proven`, `partial`, `not proven`, and `no` are evidence states, not completion
percentages. A missing relation name does not prove a missing capability, and a
present table, validator, UI, or successful cron invocation does not prove the
later stages.

## Corrected foundation-to-runtime matrix

| Capability / intended owner | Foundation located | Contract / implementation coverage | Tested in isolation | Integrated with required components | Installed / deployed | Enabled | Authorized real data | End-to-end operational verification | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| Canonical evidence, investigation, assessment base / qik | **Proven:** live `evidence_pipeline`, investigation Edge functions and public RPCs | **Proven for bounded base:** captures, versions, changes, investigation reads/reviews and assessment dependencies | **Proven for bounded components** in repository and prior exact-head CI | **Partial:** several live qik functions compose; collector and semantic generation do not | **Proven:** live qik migrations/functions | **Partial:** user-facing reads and bounded operations exist; no general analytical scheduler | **Partial/unknown authority:** live records exist; complete source/rights chain is not re-proven | **No:** no full article-to-decision-to-publication traversal | **EXTEND qik** |
| Hypothesis assessment / qik | **Proven:** `src/lib/hypothesisAssessment.js` plus `supabase/qualification/hypothesis-assessments/` revisions 001–023; live qik has overlapping assessment/change foundations | **Proven for bounded contract:** revisions, history, reassessment, observations, boundary custody, worker/recovery and review acknowledgement | **Proven for isolated scope:** integration exact-head workflows and current hypothesis PostgreSQL run `35530600347` pass | **Partial:** App composition and cross-component tests exist; no production-shaped full-pipeline proof | **Partial:** qik assessment foundation is installed; exact `mip_hypothesis` qualification schema is absent | **Partial:** live assessment reads/writes exist; no canonical generation schedule/provider path | **Unknown:** one live qik assessment exists, but the full qualification authorization chain is not installed | **No** | **EXTEND/RECONCILE qik; not NEW** |
| Provider-neutral System-One decision layer / qik | **Proven:** assessment, evidence-change, hypothesis and authority foundations are located | **Partial:** decision IDs, evidence bindings, temporal/method revisions and provider-disabled behavior exist in separate contracts; one canonical contract does not yet own all fields | **Partial:** component tests exist | **No full integration proof** | **Partial overlap only:** qik assessment/change tables; no complete canonical decision store | **No complete decision runtime** | **No complete authorized decision population proven** | **No** | **RECONCILE around qik** |
| Entity identity and actor agency / qik | **Proven:** live graph/entity implementations plus `supabase/qualification/entity-resolution/` | **Proven for bounded mention, candidate, actor-revision, agency and lineage contracts** | **Proven for isolated scope:** exact integration-head entity/agency workflows passed | **Partial:** contracts compose in the integration candidate, not the canonical live pipeline | **Partial:** predecessor graph implementations are live; exact `mip_mentions` qualification schema is absent on qik | **Predecessor only:** yhb ingestion remains active | **Proven on predecessor, not reconciled to canonical authority:** large real entity/link corpus exists | **Predecessor pipeline activity proven; canonical E2E not proven** | **RECONCILE into qik; not NEW** |
| Content-addressed storage and exact citation / qik | **Proven:** qualification package plus qik capture/identity/hash/retrieval foundation | **Proven for bounded CAS, tier, locator, rehydration and exact-span contracts** | **Proven for isolated scope:** exact integration-head CAS workflow passed | **Partial:** hypothesis worker and citation contracts reference it; no live byte path proof | **Partial overlap:** qik capture metadata/RPC installed; exact `mip_cas` schema absent and Supabase storage has zero objects | **Partial metadata path only** | **Unknown:** 95 live captures/identities exist, but authorized durable bytes and rights-complete rehydration are not proven | **No exact live rehydration traversal** | **EXTEND qik; do not duplicate** |
| Markets evidence and semantic path / qik | **Proven:** `marketsEvidenceContract.mjs` and `supabase/qualification/markets-evidence/` | **Proven for bounded private identity/path, retained assessment/capture, exact excerpt and rights checks** | **Proven for isolated scope:** exact integration-head Markets workflows passed | **Partial:** UI/handler/store/contract compose in the integration tree | **No exact package proof:** qik has no Markets-named relations and `mip_markets` is absent | **No:** entrypoint is default-closed/unconfigured | **No** | **No** | **EXTEND/RECONCILE qik graph/evidence foundations; not NEW** |
| Private Markets workspace and transport / qik application | **Proven:** `PrivateMarketsWorkspace.jsx`, private contract and transport | **Proven for a bounded private workspace; no quote feed or publication authority** | **Proven for isolated browser/transport scope** | **Partial:** composed into `PrivateInvestigationWorkspace` in integration/current tree | **No live proof:** absent from main and PR #175 is unmerged | **No:** endpoint approval/config remains empty/default-closed | **No** | **No** | **EXTEND after backend authority gate** |
| Markets graph compatibility / qik | **Proven:** unapplied production-candidate package | **Partial candidate:** privacy compatibility, public-view ACL reset, absence semantics, index/recovery and drift verification | **Proven only for candidate scope:** the first parser run failed; repaired exact-head run `34917764936` passed | **No:** candidate explicitly is not composed with the typed Markets evidence migration | **No:** unapplied, and live qik lacks `mip_markets` | **No** | **No** | **No** | **RECONCILE after representative restore review; do not execute archived/candidate SQL** |
| Weather rights gate / current application | **Proven:** `weatherSourceRights.js` exists unchanged in main/integration/current | **Proven for narrow event-time display rights:** hosted terms are separate from data license | **Proven:** focused tests and integration-head weather workflow passed | **Proven in code:** `eventTimeWeather` → `spatialBackend` → `WorldView` | **Proven for main application:** main Pages deployment run `34440532626`; exact live bundle behavior was not browser-reverified here | **Gate enabled; feeds disabled:** Open-Meteo blocked, NASA/NOAA pending, adapter absent | **No weather feed data authorized in this path** | **No live weather fetch; intentionally outside critical path** | **KEEP fail-closed; optional feed work excluded** |
| Operation evidence and cutover authority / qik | **Proven:** qualification 008–010 in integration/current; 011–012 are later current-only extensions | **Partial:** 008 rights/privacy operation evidence, 009 factual enforcement, 010 exact CC reader; 011 is rejected-demo-scoped and cannot define product behavior; 012 is a reusable authentication mechanism only after independent review | **Proven only for disposable scopes:** exact integration/head and retained current qualification runs; not fresh live certification | **Partial in current tree; not canonical product integration** | **No:** `mip_identity`, `mip_factual`, `mip_cutover_authority`, and related qualification schemas are absent on qik | **No** | **No production authority population proven** | **No** | **RECONCILE reusable 008–010/012 ideas; reject demo-specific 011 authority** |
| Collector ingestion / qik destination, yhb current owner | **Proven:** live yhb v8 and qik shadow/qualification contracts | **Proven for predecessor behavior and bounded shadow contracts** | **Proven:** collector native run `35530600346` passes 25 tests, including same-cluster logical restore | **Partial:** qik shadow is receipt-only and does not feed canonical analysis | **Proven on yhb; shadow only on qik** | **Proven on yhb:** seven enabled sources and active five-minute cron | **Proven activity on yhb:** 239 articles fetched in 24 hours; source-rights completeness remains a separate gate | **Operational on predecessor:** latest run completed at 19:00Z; not operational on qik | **RECONCILE/cut over only after owner gate** |
| Source-comparison enrichment / qik destination, yhb current owner | **Proven:** live yhb function/job and qik candidate/history foundations | **Proven for predecessor and bounded generation contracts** | **Proven for isolated concurrency scope** | **Partial:** canonical qik consumer/cutover not integrated | **Proven on yhb, candidate/history on qik** | **Proven on yhb:** active five-minute cron | **Real predecessor corpus is populated; canonical authorization reconciliation incomplete** | **Operational on predecessor schedule, not verified end to end on qik** | **RECONCILE** |

## Live observations reconciled at this checkpoint

Read-only SQL at `2026-09-20T19:02:20Z`–`19:04:39Z` found:

- qik has 95 article captures, 95 article identities, 96 evidence candidates,
  195 evidence changes, 100 record versions, two investigation observations,
  one assessment, and zero worker evaluations/revocations. The live
  `evidence_pipeline` is a real foundation, not proof that the separate
  qualification packages are installed.
- qik has no `mip_hypothesis`, `mip_mentions`, `mip_cas`, `mip_markets`,
  `mip_identity`, `mip_factual`, or `mip_cutover_authority` schema. The only
  `mip_*` schema is `mip_private`. This proves those exact packages are absent;
  it does not prove their capabilities lack overlapping foundations.
- yhb has seven sources and all seven are enabled. Its two `*/5` pg_cron jobs
  each recorded 288 successes and zero failures in the preceding 24 hours,
  most recently at 19:00Z. It held 34,333 articles; 239 had `fetched_at` within
  24 hours, and the latest ingestion run completed at `19:00:19.631Z`.
- The deployed yhb v8 function accepts either an owner run key or the
  Vault-backed scheduler token verified by
  `mip_ingest_rss_schedule_authorized`; it selects only enabled sources. This
  differs from the repository's later fail-closed implementation and confirms
  that yhb collection is active rather than globally disabled.
- nie has five enabled sources, but both pg_cron definitions remain inactive.
  Enabled rows do not override an inactive scheduler.

No GitHub workflow has a scheduled trigger. The checked-in Cloud Run workflow
is manual only. No external Cloud Scheduler, operator, or third-party caller
was proven or disproven; absence of pg_cron alone is not caller closure.

## Parent reconciliation of review evidence

- Ara's review is treated as evidence about `main` and the live state it
  inspected, not a complete inventory of integration, qualification,
  production-candidate, or current consolidation foundations.
- A mechanical review incorrectly reported no consumer for
  `weatherSourceRights.js`; direct caller tracing proves the World View chain.
- The same review stopped at the Markets parser's retained first failure;
  GitHub PR #175's exact-head record proves the repaired final run passed.
- The High authority review correctly distinguishes 008–010 from later
  extensions. 011 remains former-demo-scoped and is not adopted as product
  authority. 012 is not production authority merely because its disposable
  authentication tests passed.
- The live deployed yhb v8 source, not the later repository body, determines
  current ingestion authorization behavior.
- Branch existence and green tests establish stages 1–4 only to their exact
  scopes. They do not establish stages 5–8.

## Preserved semantic ownership

The provider-neutral decision inventory, eight-state absence-semantics taxonomy,
and twelve-cause knowledge-change taxonomy remain authoritative requirements in
`SEMANTIC_DECISION_ABSENCE_CHANGE_AUTHORITY_2026-09-20.md`. None of the located
packages alone owns the complete contract. The canonical direction remains
**RECONCILE/EXTEND qik**, preserving distinct absence causes and inspectable
knowledge-change causes rather than creating a provider-specific parallel store.

## Independent verdicts

### AUTHORITY CONSOLIDATED — FAIL

Yhb still owns active ingestion/comparison and the large corpus; unique
predecessor identity/history and recovery remain unresolved; the exact
qualification packages are not installed on qik; and external caller closure
is incomplete.

### PIPELINE VALIDATED IN ISOLATION — FAIL

Multiple components have exact isolated and integration evidence, including a
25-test native collector contract and successful integration-head workflows.
There is no single production-shaped isolated traversal of all required stages
with real authority boundaries and observable failure/degraded states.

### PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND — FAIL

Yhb's predecessor pipeline is demonstrably active. The intended qik pipeline
has no recurring collector schedule and no representative item has traversed
canonical ingestion, extraction, decision, graph/timeline, and publication.

## Safe continuation and owner gate

Eligible isolated work may continue: contract/test reconciliation, machine-
readable inventory, caller tracing, native disposable qualification, and
non-deployed migration planning. Do not enable sources/workers/schedules, copy
protected production data, provision credentials, create paid infrastructure,
deploy, cut over, or retire a predecessor without the applicable owner gate.

The next bounded gate is authorization for a fresh, isolated recovery and
full-pipeline rehearsal using approved source/rights scope, schedules and
publication disabled, no production writes, and an owner-approved destination
and credential custodian. It also requires designation of the canonical live
frontend URL/project because GitHub Pages and the Vercel project currently
point at different source trees. Exact requested language is retained in the
final handoff rather than implied by this checkpoint.
