# Deterministic News states and attributed reports — 2026-10-02

This source candidate implements the October 2 accepted owner direction in the native News/Story reader. It introduces no publication shortcut or automatic report permission. SQL/API proposals from the reviewed-public-version and Story Following lanes remain unapplied; actual source acquisition, installation, real account journeys, physical devices and release are separate gates.

Authority read: owner decisions `libfile_720892b4771c8191a3216a89362f7028`, current whole-platform register `libfile_953c9013cec08191be2e9bef847b753f`, handoff `libfile_90ebe4e040b48191ac4838f42b0d99dd`, repository index, canonical intake/reader, fetched-clock, News backend, private Following and convergence documents. Local source SHA-256 respectively: `ce9cb2489586380f19120f6f8fba1bb3cb72baebf0ad73c5b3cc85b55956f120`, `c4ae0f94bdf049f575e9db23ba557ff6ef29ac603520232252bdf1b0431c57fa`, `7e9ff9b6233722de2bbf1da0a4da428173a741adde04b262cadbcea60ab88c6a`. The accepted decisions supersede earlier unresolved Breaking policy language. Their authority expressly excludes protected installation, deployment, paid activation and release.

## Ownership and implementation

Requirement → existing foundation → missing delta → **EXTEND / RECONCILE** → preserve existing owners → qualified read path:

- Existing `newsFeedModel`, `newsBackend`, `NewsView`, native reader shell and provenance remain the consumer owners. Current-page event grouping remains page-local and never creates a story ID.
- The public-version lane supplies persistent, reviewer-bound Story UUID → existing canonical subject binding and immutable reviewed source/story versions. The Following lane supplies immutable reviewer material declarations, exact version ancestry, public context and private per-account preferences.
- News delegates `loadStoryStateContext` to the shared `createStoryFollowingBackend` reader and `loadArticleStory`/`loadStoryDirectory` to `createReviewedPublicVersionBackend`. It does not query private captures, claim extraction or raw history. The source registry/material SQL and actual read RPCs belong to those existing-owner extensions, not a second News evidence database.
- `newsStoryState.js` is a pure display policy over that admitted context. `newsStatePolicy.js` is the immutable, explicitly versioned candidate. Every available decision retains Story/subject/public-version identity, material-change ID, material-version ID, exact effective/declaration clocks, reviewer reason, evidence/review references and both display/material policy versions.
- Native Home/Breaking reads the bounded reviewed Story directory, then pins each exact Story context. It discloses unavailable contexts and page scope. Feed cards resolve explicit persistent Story membership before showing Read story. The readable Story renders permitted member summaries, clocks, uncertainty, corrections, original-source actions, state reason, reconstructed history and real Following controls. Raw version IDs, digests, policy identifiers and review references remain inspectable in collapsed disclosures so the default reading order starts with reporting. Following uses the shared private account backend and in-app panel; no external delivery is introduced. The parent owns the App route/session props.

## Deterministic semantics

The policy never reads `fetched_at`, outlet count, title terms, popularity or an LLM to decide state. Bigint revisions remain decimal strings. Effective/declaration/visibility comparisons retain supplied nanoseconds; display/timer derivatives round future sub-millisecond boundaries upward.

Breaking requires an explicit major, genuinely new material declaration, rapid effective-to-declaration arrival, a fresh qualifying material effective time and a bounded active-phase duration. Every supporting source version must be admitted as a reviewed proposition. Consecutive updates cannot reset the maximum phase duration. A separately quiet phase can begin later from a new admitted material change.

Developing requires continuing distinct material changes inside the velocity window and a recent qualifying change after Breaking has ended. A single material update, late-arriving update, correction or resolved event is Updated / Established. A quiet unresolved event still becomes Historical; that state describes the registered material-change phase, not resolution or exhaustive coverage. A newly declared backdated correction uses its declaration clock for the correction notice while preserving the old effective clock; it never makes the old event Breaking. Effective-time watermarks cannot move backwards to manufacture a new phase. A latest report awaiting verification withholds the settled MIP state while retaining prior admitted evidence. No declaration gives unavailable state. Truncated ancestry withholds state and report urgency. Every display says the coverage is declared material changes only; missing classification remains unknown.

History is reconstructed deterministically from retained selected-version declarations and policy clock boundaries. It keeps the selected public Story version fixed, with separate material-version references. It does not synthesize an earlier approval, persisted state receipt or proof that a historical reader saw that state. A mounted reader updates its local display clock at the next deterministic boundary; it performs no polling or subscription mutation.

## Attributed SOURCE REPORT

A source report requires the public owner to explicitly admit the exact report envelope. Pending capture retention, existing article eligibility and a source URL alone do not authorize it. The shared normalizer permits no proposition evidence in a `source_report` member. Report-only material declarations never establish the MIP Story state.

The permitted report is explicitly attributed and pending in ordinary feed cards, both article-detail paths and the Story reader. The permitted report renders SOURCE REPORT, optionally BREAKING • SOURCE REPORT when its own declared urgency and reporting clock qualify, always beside **Pending MIP verification / reconciliation** and the statement that MIP has not independently established the reported proposition. The envelope retains source/article ID, exact capture/version/hash, public report version, source name/locator, report time, review reference/uncertainty and correction/predecessor identity. A stale reporting clock cannot borrow recent fetch, retention or review time to become Breaking. Corrections remain corrections and cannot restart urgency.

Native captures currently lack an exact capture-fetch observation. The report's exact source-version fetch time therefore displays unavailable (`fetch_time: null`), while the article's original fetched time and exact capture retention time are separately named. No clock is relabeled to hide that absence. Rejected locators remain inert recorded text; safe HTTP(S) original-source links preserve opener-safe attributes.

## Numerical calibration and its limits

`verifier/runNewsStateCalibration.mjs` executes three simple candidate policies through the production decision functions. `tests/fixtures/newsStateCalibrationCorpus.mjs` supplies seven predeclared synthetic risk constraints and eight untouched holdout scenarios. These cover rapid changes, reconciliation latency, false persistence, premature decay, quiet unresolved phases, corrections, resumed phases and stale/corrected reports. Adversarial regressions separately cover multiple source records, fresh fetches, version-only advances, malformed clocks, sub-millisecond boundaries, foreign identity, missing evidence/review references and truncation.

| Candidate | Calibration constraint failures | Holdout failures | Consequence |
| --- | ---: | ---: | --- |
| Short | 2 / 7 | 4 / 8 | Drops urgency/continuing changes too early under fixture reconciliation latency. |
| Selected v1 | 0 / 7 | 0 / 8 | Satisfies these bounded synthetic risk constraints. |
| Long | 3 / 7 | 3 / 8 | Retains urgency or active-phase labels after the fixture phase becomes quiet. |

The selected candidate has a two-hour qualifying-change freshness window, six-hour Breaking phase maximum, three-hour rapid-arrival bound, twelve-hour velocity window with two distinct changes, twenty-four-hour Developing quiet bound and seventy-two-hour material-phase quiet bound. Correction and event-resolution semantics are categorical, independent of these numbers. The policy version is `mip-news-state-2026-10-02-v1`; its qualification is `synthetic_calibrated_candidate`.

Selection keeps the simplest candidate satisfying all predeclared risk constraints. It does not optimize label density, infer evidence sufficiency from elapsed time, fit a model or treat synthetic fixture labels as observed journalism. The checked-in JSON records every result. **No representative real retained news corpus or measured production false-persistence/decay rate was available.** These numbers are a reproducible source candidate, not empirically certified live thresholds. Real corpus replay and independent review remain required before authorized installation/release.

## Qualification

Run the pure, installed-SDK and mounted production-reader tests, then build:

```sh
node --test --test-concurrency=1 tests/newsStoryState.test.mjs tests/newsStateCalibration.test.mjs tests/newsStoryReaderFrontend.test.mjs tests/newsFeedModel.test.mjs tests/newsBackend.test.mjs tests/newsBackendFrontend.test.mjs
node verifier/runNewsStateCalibration.mjs
npm run build -- --configLoader native
```

New qualification includes actual installed Supabase SDK → exact shared context RPC → shared nested normalizer → mounted production NewsView, alongside deterministic and adversarial cases. Wrong-version/private/malformed contexts show unavailable and render none of their source fields. Account/session Following semantics are owned and tested by its lane. The mounted tests are source fixtures, not browser-pixel or physical-device acceptance. Raw lane receipts reside in `/workspace/mip-news-state-receipts`; final counts and dependency identities are reported in the lane handoff.

The SDK RPC and RLS documentation were checked at their official Supabase URLs. The changelog Markdown endpoint was attempted through both browsing and curl but refused/unsupported; no changelog compatibility conclusion is claimed. No API upgrade or dependency change was made. No live backend, credential, publication, collector, provider, merge, push, deployment or release operation occurred.


Final News lane qualification after shared owner integration: **70/70 targeted tests pass** on Node 24.19.0, including 46 News/policy/mounted tests, fourteen actual restored-public-owner/SDK/install-package checks and ten retained locator regressions. Final build passes with existing chunk/externalization notices. Qualification uses unchanged parent-provided shared dependencies in `/workspace/mip-launch-gates/node_modules`. The lane's copies of dependency commits are `53df3bb` (original `6958c57`), `b5627bf` (original `5485fa2`) and `eecdc9f` (original `2a88728`); its own implementation and followup commits remain separate for parent integration. Source and mounted fixtures do not establish live rights, source corpus accuracy, installed permissions, real sessions, independent review or device acceptance.
