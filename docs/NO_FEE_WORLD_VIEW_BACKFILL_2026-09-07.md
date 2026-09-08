# No-fee World View plan reconciliation and first backfill

## Governing instruction and baseline

The owner's 7 September 2026 DOCX supersedes the earlier Astra work plan.
[Full extracted plan and embedded execution prompt](MIP_GOVERNING_WORK_PLAN_2026-09-07.md).
Reconciled against main `52335e529bf2d0f55a98c101f603f889f4d6433b` (PR #78).
Existing conditional owner approval permits merge only after relevant tests/build,
review and required runtime/visual verification pass with no unresolved material findings.
No new automatic publication, scheduler, unbounded ingestion or paid commitment.

## Completed work carried forward

- PR #72: phone Account access, including 320/390 px checks.
- PR #75: Node 22/24 regression matrix, Node 24 Pages build and dependency/advisor triage.
  This aligned CI; it did not resolve the dependency findings.
- PR #76: explicit private-investigation to current-public Graph/Timeline/World View handoff and return.
  Current public records are labeled separately from saved private versions.
- PR #77: producer-aware, evaluation-gated record claims; the original six pending jobs
  remain unclaimed without a qualifying held-out evaluation. No evaluation was fabricated.
- PR #78: NASA second immutable version, before/after comparison, explicit reviewed receipt,
  preserved version 1 and synchronized handoff verified. Two retained NASA excerpts support
  reported totality timing; the one-minute partial-end discrepancy remains unresolved.
  The sources share NASA origin. The lexical report is not the semantic assessment.
  See the PR #78 verifier record for exact private version and receipt identifiers.

The backend trigger-function advisor hardening had only been investigated when the new
document arrived. No unfinished migration or open implementation batch needed completion.

## First backfill: restricted hosted weather route

The current loader automatically called the free hosted Open-Meteo archive endpoint.
Its **data license** is CC BY 4.0, while its **free hosted service** restricts commercial
use. A permissive data license does not grant commercial hosted-service permission.
Reviewed official pages on 7 September 2026:
[service terms](https://open-meteo.com/en/terms),
[data license](https://open-meteo.com/en/licence).
This is an incompatibility with the owner's no-fee commercial-compatible source policy,
not a determination of the owner's present commercial status.

This batch removes the loader's network path. Historical time and released-geometry
validation still run; eligible requests return `source_terms_incompatible` with the
existing calm weather-unavailable copy. No weather values or provider attribution are
invented. Old pure ERA5 parser/URL helpers remain for legacy fixture compatibility and
are not a source approval. Their temporal/missing-value hardening is deferred with the
replacement adapter, so they must not be used as evidence admission.

`src/lib/weatherSourceRights.js` records the blocked route and explicitly pending NASA
POWER/GHCNh candidates. Unknown providers, actions and permissions deny. Deep freezing
prevents caller mutation. This is a **weather-only registry seed**, not a completed global
rights registry or overlay policy. Even changing a source review to approved does not
implement or activate a replacement adapter.

### Exact changed paths

- `src/lib/weatherSourceRights.js`: source-specific service/data separation and deny decisions.
- `src/lib/eventTimeWeather.js`: remove restricted network requests; preserve historical guards.
- `tests/weatherSourceRights.test.mjs`: permissions, mutation and zero-network regressions.
- `tests/worldViewLaunch.test.mjs`: preserve legacy parser checks, assert the new loader denial.
- `verifier/runWeatherRightsBrowser.mjs`: built-app anonymous public-data smoke/visual capture.
- `.github/workflows/world-weather-preview.yml`: bounded ephemeral runner preview on relevant PRs.
- This document and `docs/MIP_GOVERNING_WORK_PLAN_2026-09-07.md`.

Additional verification paths updated after the first CI run:
- `tests/spatialBackend.test.mjs`: zero provider/database calls through the shared backend.
- `tests/r475Step8Closeout.test.mjs`: preserve historical closeout while referencing the superseding current weather test.
- `tests/golden/vocabulary_drift.test.mjs`: one explicit archived owner-plan exception for release labels, with an assertion that it links to the unchanged vocabulary authority.

### Owner clarification: stop only the uncertain component

The owner subsequently directed: if commercial-use rights, redistribution rights,
required attribution, patent/license compatibility, or service terms for any new
dependency, dataset, model or API are uncertain, do not integrate or activate that
component. Flag it for review and continue independent unaffected work.

This applies before integration as well as activation. A provider's reputation, a
free tier, a permissive wrapper license or a planned adapter is not approval.
The NASA POWER and GHCNh records here contain review metadata only, not integrations.

The CI-only Playwright 1.63.0 package and its pinned playwright-core dependency use
Apache-2.0; its exact upstream LICENSE and package manifest were inspected. The license
contains copyright and contributor patent grants subject to its stated conditions;
this is not an assertion about all third-party patents. It is used unmodified as an
isolated development tool, with its packaged notices retained, and is not bundled,
relicensed or redistributed with the app. Browser installation uses the upstream
Playwright installer in the ephemeral runner. No hosted browser subscription is used.
Any later bundling, redistribution or different license combination requires its own review.

### Source, software and notices inventory for this batch

| Item | Review / shipped effect |
| --- | --- |
| Open-Meteo free archive / ERA5 | Blocked service route; data CC BY 4.0 does not override service terms. No new payload retained or exported. |
| NASA POWER hourly | Candidate only; exact product, upstream release, parameters, limits and rights review pending. No request or license approval. |
| NOAA GHCNh hourly | Candidate only; exact station, release, route and rights review pending. No request or license approval. |
| Playwright 1.63.0 | Apache-2.0 CI-only browser tooling, installed in ephemeral runner; not added to production dependencies or shipped app. [Upstream license](https://github.com/microsoft/playwright/blob/v1.63.0/LICENSE). |
| Existing map/terrain/OSM/atlas | No source, attribution, notice or renderer change in this batch. Existing source-specific review must be reconciled before extension. |
| Donor repository | No donor code or data copied. Its license does not authorize third-party datasets. |

The registry's false/null operation permissions are application decisions. They are not
claims that the underlying data license forbids those operations in every setting.
There is no new data distribution NOTICE because no new data is distributed.
Future reviewed datasets must ship their own exact required notices with distribution
and surface attribution in map inspector, fallback, fullscreen, mobile and exports.

### Verification and infrastructure limits

Required before merge: full suite/build on Node 22 and 24; new adversarial unit cases;
built-app preview with a real released public geometry at 320/390/1280 px, weather
unavailable, no restricted provider requests, no horizontal weather-panel clipping,
no uncaught page errors, and manual inspection of the captured weather panels.
The preview is a single anonymous browser session with three viewport sizes, reads
existing public data, has a 12-minute job timeout, runs only on relevant pull requests,
and uses existing GitHub-hosted CI. No deploy or new hosting subscription is created.
Encoded screenshots in CI logs contain only the public weather panel. No private session,
auth storage or user data is captured. Source files stay on GitHub and ephemeral runners.

After merge: wait for Pages, reload the live site, confirm weather state and phone
Account affordance. Record actual verification results in the PR; pending checks are
not represented here as passed. No database migration or backend mutation is required.

## Backfill and package matrix

Status means inspected scope at the baseline, not a blanket acceptance of a package.

| Package / campaign | Baseline and next action |
| --- | --- |
| Algorithm / evidence | NASA exact-version slice done. Next: qualified live record producer with independent held-out labels; then one real commitment-to-outcome case. Preserve claim meaning, origin dependence, time and reassessment invariants. |
| Shared context / rights | Weather-only registry seed in this batch. Next: versioned context contract and exact source/release notices before a new adapter. Distinguish valid/publication/retrieval/recorded times, geometry precision, observation/model, units, quality, payload reference/hash and allowed retention/export. Context is not admitted evidence. |
| 01 Navigation | Existing camera/framing/state and touch tests present; inspect cancellation, restore, dateline/poles against current implementation before new changes. |
| 02 Marker legibility | Existing renderer/picking present; clustering/horizon/label density acceptance remains to audit without changing evidence coordinates or identity. |
| 03 Attribution/layer state | Existing map attribution/fallback present. New-source rights registry and mobile/fullscreen/export completeness remain to backfill. |
| 04 Share views/presets | Existing deep links and version handoff present. Exact historical version/time/camera/authorized-layer preset contract and token/privacy regressions remain. |
| 05 Measurements/annotations | Deferred until rights/context contract and scoped analyst method/permission semantics. No new verified relationship implied. |
| 06 Terrain/fallback | Bundled Natural Earth fallback and bounded existing terrain present. Reconcile exact release/datum/source notices; no global terrain download or new paid service. |
| 07 Buildings | Not enabled. Review bounded Microsoft CDLA-2.0 release and explicit measured/estimated/unknown height semantics. |
| 08 Places | Not enabled. Per-record Overture licenses, notices, temporal identity and coverage uncertainty required; no private-person layer. |
| 09 Weather | Immediate restricted-route backfill in this batch. Next source target: one retained, bounded POWER/GHCNh example after review, UTC/unit/missing/quality/interval tests and retention rights. |
| 10 Imagery | Not enabled. One reviewed NASA-origin GIBS product/date, resolution/cloud/nodata and immutable reference required. |
| 11 Earthquakes | Disabled by current policy. Future opt-in requires explicit narrow policy change, bounded catalog query and revision/proximity tests. |
| 12 FIRMS | Not enabled. Reviewed product and bounded backend key/limit handling required; anomaly is not a wildfire/responsibility conclusion. |
| Dependency/advisor triage | Compatible transitive dependency updates remain next maintenance batch, followed by Vite/plugin migration. Trigger search-path/EXECUTE hardening remains open; owner-context views require disclosure/dependency review. |

## Next ready batches and continuing prompt

1. Close this restricted-weather backfill only after required verification.
2. Reconcile rights and define the shared context record with temporal/origin/evidence
   counterexamples, keeping approximately 50% evidence work, 30% integration, 20% navigation.
3. Review a single bounded POWER or GHCNh product/route and retain one authorized weather
   example; do not infer global provider permission or silently substitute model/station data.
4. Continue ready maintenance and evidence-producer qualification; do not use the six
   pending jobs to sidestep held-out evaluation.
5. Work through the plan's remaining waves in small verified batches, backfilling the
   matrix rather than claiming the twelve packages are already delivered.

Use the full embedded owner prompt in the linked governing plan. Maintain exact version
identity, immutable evidence, explicit uncertainty, no automatic reassessment/publication,
default-deny sensitive overlays, no new fees and no project storage on the owner's device.


## Following batch: shared point-context foundation

The weather backfill (#79) merged as `e7f70fd87edc0077c14d3cb1738032f1e19ae4f6`.
Node 22/24 full suites/builds, browser previews and live phone/desktop verification
passed; live bundle `index-Cn7Yusn8.js` matched Pages. Phone Account, NASA revision 2
and explicit unsourced weather were verified after deployment.

[Retained point-context contract](RETAINED_POINT_CONTEXT_CONTRACT_2026-09-07.md)
adds an offline, project-owned snapshot/receipt contract with synthetic tests. It
preserves temporal precision, exact payload identity, origin uncertainty and rights
review assertions without admitting evidence or authenticating those assertions.
It is not a protected rights registry or a provider adapter.

This advances the shared-context row above. Source-specific rights review, trusted
registry/ledger integration, a bounded real weather example, held-out producer
qualification, remaining package audits and maintenance are still open.


## Batch 81 — independent trigger hardening

Five existing trigger functions now pin an empty search path; three definer triggers remove public/client EXECUTE grants. Exact-body PostgreSQL behavior tests pass; live bodies, attachments, evidence/job/profile data and access policies are preserved. Eight security warnings cleared without new findings. See [verification and remaining findings](TRIGGER_FUNCTION_HARDENING_2026-09-08.md).

POWER remains pending separate API/service, selected product/release and upstream-source rights review. No activation, ingestion or production dependency is allowed before current authoritative verification of commercial use, attribution, retention/redistribution and limits. Acceptable attribution/NOTICE obligations will be recorded and implemented; incompatible or unresolved rights route to planned GHCNh or another compatible no-fee source. Continue independent work.


## Batch 82 — compatible build dependency patches

PostCSS 8.5.28 and Nano ID 3.3.18 replace vulnerable versions within the existing dependency ranges. Exact MIT release licenses and notices are retained; only these two lock entries change. Source-map boundary and bounded generator regressions are added, and dependency changes now run the responsive built-app preview. See [scope, rights and remaining work](COMPATIBLE_BUILD_DEPENDENCY_PATCHES_2026-09-08.md). Browserslist plus browser-data packages and the coordinated Vite/plugin upgrade remain separate maintenance batches. POWER remains pending.


## Batch 83 — separate rights layers and dependency hold

The offline point-context contract now requires independent software/service/dataset/upstream review assertions, exact release binding, intersected operation permissions, bounded request-policy declarations and obligation implementation references. It remains operator-supplied context, not authenticated rights clearance or evidence. See [contract 2 and verification scope](SEPARATE_CONTEXT_RIGHTS_2026-09-08.md).

The Browserslist candidate is held because the newly resolved Baseline mapping includes private-feed-derived data whose applicable upstream reuse terms have not been verified. No candidate lockfile is integrated. Existing dependency findings and POWER remain pending; independent work continues.


## Batch 84 — held-out evaluation diagnostics

The offline record-candidate evaluator binds exact corpus/run identity, rejects declared group/input/time leakage, requires every held-out prediction, and reports retrieval, verifier errors, unresolved labels and abstention with explicit denominators. It does not qualify a worker. See [measurement scope and remaining real-corpus work](RECORD_CANDIDATE_EVALUATION_2026-09-08.md). The pending record jobs remain gated; a rights-cleared independently adjudicated corpus and comparative run are still required.


## Batch 85 — cancel obsolete camera flights

Package 01 now cancels an accepted subject flight when selected geometry disappears, and explicitly stops older flights before valid camera restoration. Ordinary refreshes preserve manual navigation; renderer startup/replacement gates remain. See [scope and verification](WORLD_VIEW_CAMERA_CANCELLATION_2026-09-08.md). No provider or rights activation; broader navigation/preset acceptance remains open.


## Batch 86 — safe shareable route boundary

Package 04 preflight now rejects malformed/oversized path segments safely, treats inherited property names as unknown views, and drops ambiguous duplicate selections. Credential/private-text fields remain excluded from generated route state. See [scope and verification](SHAREABLE_ROUTE_BOUNDARY_2026-09-08.md). Exact private-version presets and authorized-layer persistence remain pending; this is a prerequisite backfill, not their completion.
