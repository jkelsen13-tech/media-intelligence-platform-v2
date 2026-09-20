# MIP foundation-to-runtime ownership checkpoint

Date: 2026-09-20

Status: parent-reconciled, read-only checkpoint recorded before any further
foundation implementation.

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
tests only; and the consolidation branch's tracked deployment configuration
denies external deployment for that exact branch.

The canonical live product surface is
`https://jkelsen13-tech.github.io/media-intelligence-platform-v2/`. GitHub
Pages run `34440532626` successfully deployed verified `main`
`1dc317200b7a928fad85d06b43351b60e2a50d92`; its live bundle
(`assets/index-BUxP66NE.js`) issued only qik REST requests. The visible
three-article population is the qik `reader_state = 'eligible'` projection,
not a conflicting total-table census.

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

## Corrected F1–F15 foundation-to-runtime matrix

Statuses are evidence classifications, not completion levels:

- `VERIFIED`: freshly rechecked against the pinned source/live scope.
- `PARTIAL`: some required behavior is proved, but material contract scope remains.
- `REPORTED_NOT_RECHECKED`: carried only as dated evidence from the prior checkpoint.
- `NOT_DEMONSTRATED`: neither success nor nonexistence is inferred.
- `BLOCKED`: a named gate prevents the stage.
- `NOT_FOUND_IN_INSPECTED_SCOPE`: bounded negative search, not global absence.
- `NOT_APPLICABLE`: the dimension does not apply to the scoped foundation.

| ID / foundation | D1 located | D2 coverage | D3 isolated test | D4 integrated | D5 installed/deployed | D6 enabled | D7 authorized real data | D8 canonical E2E |
|---|---|---|---|---|---|---|---|---|
| F1 evidence-to-hypothesis relations | VERIFIED | PARTIAL | VERIFIED | PARTIAL | NOT_DEMONSTRATED | NOT_DEMONSTRATED | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F2 hypothesis revision store | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED: exact `mip_hypothesis` package absent on qik | NOT_DEMONSTRATED | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F3 actor identity and agency | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED: exact `mip_mentions` package absent; overlapping graph exists | NOT_DEMONSTRATED on qik | VERIFIED on predecessors; authority unresolved | NOT_DEMONSTRATED |
| F4 content-addressed storage/exact citation | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED: exact `mip_cas` absent; qik capture overlap present | NOT_DEMONSTRATED for exact-byte path | VERIFIED row presence; rights/custody unresolved | NOT_DEMONSTRATED |
| F5 assessment lineage/invalidation | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED: qik overlapping objects + one assessment | NOT_DEMONSTRATED for active generation | VERIFIED row presence; provenance unresolved | NOT_DEMONSTRATED |
| F6 Markets evidence contract | VERIFIED | PARTIAL | VERIFIED | PARTIAL | NOT_DEMONSTRATED as runtime | NOT_APPLICABLE to standalone validator | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F7 Markets workspace/private service | VERIFIED | PARTIAL | VERIFIED | PARTIAL | NOT_DEMONSTRATED; PR #175 unmerged | BLOCKED: endpoint approval/config default-closed | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F8 weather source-rights gate | VERIFIED | PARTIAL | VERIFIED | PARTIAL: static call chain | VERIFIED in current main Pages build | VERIFIED fail-closed; optional feeds disabled | NOT_APPLICABLE while no feed is authorized | NOT_DEMONSTRATED |
| F9 operation evidence/cutover authority | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED: exact 008–010 schemas absent on qik | NOT_DEMONSTRATED | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F10 ingestion/execution ownership | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED: yhb runtime; qik shadow only | VERIFIED: yhb active; qik recurring scheduler absent | VERIFIED predecessor activity; rights completeness unresolved | NOT_DEMONSTRATED on qik |
| F11 World View foundations | VERIFIED | PARTIAL | VERIFIED | PARTIAL | VERIFIED in main Pages/qik | PARTIAL: core live; optional feeds intentionally off | NOT_APPLICABLE to optional feeds | NOT_DEMONSTRATED for consolidated analytical E2E |
| F12 optional GEV-style Live mode | NOT_FOUND_IN_INSPECTED_SCOPE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE |
| F13 provider-neutral decision/reuse | VERIFIED: distributed foundations | PARTIAL | PARTIAL | NOT_DEMONSTRATED | PARTIAL: qik overlap, no canonical whole | NOT_DEMONSTRATED | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F14 absence-semantics ownership | VERIFIED: distributed representations | PARTIAL | PARTIAL | NOT_DEMONSTRATED | NOT_DEMONSTRATED as canonical owner | NOT_DEMONSTRATED | NOT_DEMONSTRATED | NOT_DEMONSTRATED |
| F15 knowledge-change ownership | VERIFIED: distributed ledgers/triggers | PARTIAL | PARTIAL | PARTIAL: hypothesis cause chain | PARTIAL: qik overlapping history | NOT_DEMONSTRATED as complete taxonomy | NOT_DEMONSTRATED | NOT_DEMONSTRATED |

D1–D8 are independent. A live row does not prove the producer is enabled; a
validator does not prove runtime integration; a successful predecessor schedule
does not prove the canonical path; and absence of a qualification schema does
not prove absence of overlapping capability.

### Parent-reconciled evidence and smallest deltas

- **F1/F2/F5:** `src/lib/hypothesisAssessment.js`, the isolated
  `supabase/qualification/hypothesis-assessments/` chain, and live qik
  assessment/change tables cover complementary pieces. The revision store is
  explicitly non-deployable qualification material. The live migration states
  that it adds dependency/invalidation mechanics, not a semantic model or
  publication path. RECONCILE/EXTEND qik; do not create another belief engine.
- **F3:** `entity-resolution/001_mentions.sql` and `002_agency.sql` keep
  mentions, identity decisions, actor revisions/lineage and agency assertions
  distinct. Registration and accepted agency are not established fact.
  Preserve that separation while mapping predecessor IDs and history into qik.
- **F4:** the isolated CAS package defines exact hashes, representations,
  references, tiers, jobs, permissions and exact-citation derivation. Qik has
  overlapping captures/identities/retrieval, but no live exact-byte custody and
  rehydration proof. EXTEND that foundation; do not create a second evidence store.
- **F6/F7:** the Markets validator is contract qualification, not a live
  endpoint. The private workspace is statically composed but returns no UI until
  endpoint, bundle and readiness are approved. The repaired parser run passed;
  the unapplied graph candidate still lacks database/runtime composition proof.
- **F8:** fresh caller tracing proves
  `weatherSourceRights.js -> eventTimeWeather.js -> spatialBackend.js -> WorldView`.
  This is a narrow fail-closed display path, not system-wide rights enforcement.
  Optional live feeds remain outside the consolidation critical path.
- **F9:** only 008–010 are independently justified here. 008 is an opt-in
  isolated operation-evidence cache with no seeded grants; 009/010 remain
  narrow qualification layers. Former-lane 011/012 are excluded and supply no
  product authority in this workstream.
- **F10:** yhb is the only verified active recurring collector/comparison
  authority. Qik's seven receipt-only shadow probes neither schedule ingestion
  nor write canonical articles/analysis. The external caller that initiated
  those probes is UNKNOWN.
- **F11/F12:** the current core World View path is live; optional feeds and
  optional GEV-style Live mode are not consolidation blockers.
- **F13:** distributed code covers decision/revision IDs, input hashes, evidence
  spans, temporal cutoff, method/model revisions, failure retention and private
  release. No one provider-neutral contract owns semantic key, evidence-set
  digest, subject-role binding, policy/domain/provider versions,
  authorization-safe reuse/invalidation, typed deterministic disposition and
  provider-disabled behavior. RECONCILE, not NEW.
- **F14:** concrete unavailability, insufficient-evidence, rights-denial and
  review states exist, but not-reported, not-retained, not-extracted and
  not-searched remain liable to collapse. Add typed, scoped observations to
  existing owners; do not infer real-world absence.
- **F15:** existing causes include new evidence, correction, withdrawal,
  contradiction, shared origin, methodology, permission and human
  reconsideration. Canonical distinct entity remap, temporal reinterpretation,
  algorithm/policy/domain/provider changes, full lineage change, relationship
  reassessment and authorized override envelopes remain to be reconciled under
  append-only history.

## Live observations reconciled at this checkpoint

Read-only re-verification through approximately
`2026-09-20T20:07:00Z` found:

- qik has 104 application tables, nine application views, and 22,321 exact
  application rows. It has 98 articles, of which exactly three are
  `reader_state = 'eligible'`; 95 captures; 95 article identities; 96
  evidence candidates; 195 evidence changes; 100 record versions; two
  investigation observations; one assessment; and zero worker evaluations or
  revocations. The live evidence and assessment objects are real foundations,
  not proof that generation is enabled or end-to-end operational.
- qik has no exact `mip_hypothesis`, `mip_mentions`, `mip_cas`,
  `mip_markets`, `mip_identity`, `mip_factual`, or
  `mip_cutover_authority` schema. That proves those package names are absent;
  it does not prove the underlying capabilities lack overlapping foundations.
- yhb has 97 application tables, 12 views, and 177,996 exact rows. It held
  34,343 articles, 1,604 article claims, 45,630 article-entity links, 13,008
  events, and 13,541 entities. Seven of seven ingest sources were enabled and
  seven of seven ingestion sources were active. Its two five-minute pg_cron
  jobs each recorded 288 successes and zero failures in the preceding 24
  hours; the latest observed ingestion completed at
  `2026-09-20T19:55:19.482Z`.
- The deployed yhb ingestion function accepts the owner run key or its
  Vault-backed scheduler token and selects only enabled sources. This confirms
  that current collection is active on yhb; qik's seven receipt-only shadow
  probes do not constitute a scheduler or canonical ingestion.
- nie has 92 application tables, three views, 14,103 exact rows, three Auth
  users, five of five enabled source rows, and two inactive cron definitions.
  Enabled source rows do not override an inactive scheduler.
- jfn has 28 application tables, 46 exact rows, and no Edge Function or
  scheduler. Its 39 spatial rows remain unique recovery material.

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
- The High authority review distinguishes the independently justified 008–010
  chain from later extensions. 011/012 are outside the selected current
  authority chain and are not adopted merely because their disposable tests
  passed.
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

Eligible isolated work may continue: contract/test reconciliation,
machine-readable inventory, caller tracing, native disposable qualification,
and non-deployed migration/security planning. Do not enable sources, workers,
or schedules; copy protected production data; provision credentials; create
paid infrastructure; deploy; cut over; or retire a predecessor without the
applicable owner gate.

The first bounded owner gate is now critical authorization containment, not
live-surface selection. The exact candidate revokes and Edge guard requirements
are recorded under
`supabase/production-candidates/backend-consolidation-security/`. They make
no row changes and are not installed. A later, separate gate is required for a
fresh isolated recovery/full-pipeline rehearsal with approved rights scope,
disabled schedules/publication/provider calls, an approved destination, and a
named recovery custodian.

