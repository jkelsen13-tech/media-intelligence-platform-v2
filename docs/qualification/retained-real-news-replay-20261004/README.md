# Retained CISA clock replay — 4 October 2026

Five supplemental replay cases now qualify clock separation, revision selection,
correction notice decay and source-only behavior against the existing News owner
engine. The original two actual-byte benchmark cases remain unchanged. No owner
engine defect was reproduced, so `newsStoryState.js`, the numeric policy,
existing manifests, original evidence and source pins were not edited.

Implementation commit: `b83ba2930dcc78545ec4bb5106ac60284091ec4f`, tree
`d87b5b3d8d4688258bea59bb1657f6714cc4c583`. Exact base:
`0ebf51d80179130c2b05041663c02777c427fcf4`, tree
`aa2b71604f4fd782316b27bc340c88763db4eaad`. Source and receipt digests are
recorded in `source-binding.json`; the later receipt commit is recorded by Git
instead of embedding a circular self-hash.

The current retained governance readbacks are handoff/review version 20,
requirements and both World View plans version 8, and Owner Decisions
`libfile_720892b4771c8191a3216a89362f7028` (returned version null). No applicable
AGENTS.md was found in the worktree or its parent directories. The owner accepts
deterministic, evidence-bound states and versioned reasons, explicitly attributed
Source Reports, and empirical threshold calibration. A recent fetch alone never
qualifies Breaking. This work follows those accepted semantics and introduces no
additional Story engine or subjective product choice.

## Inputs and clocks

The existing loader verifies 1,303,886 exact retained CISA CSV bytes across two
immutable official repository revisions, SHA-256 and Git blob hashes, row counts,
direct parent/child relation, current CC0 license/README hashes and exact-field
differences. It reproduces one catalog addition, three field amendments and 1,308
unchanged common records. The acquisition manifest remains byte-pinned at
`0ba77e64879a53221ef953d0c08cdfa9b7c720e98969418f89e8dd2bf3ec1c2e`.

The supplemental adapter additionally binds each actual byte digest to its owner
capture hash and records a clock sidecar outside the owner context. The source
repository clocks are 27 March and 31 March 2025; actual retrieval is
`2026-10-03T04:19:48Z`. Original fetch/capture clocks remain that retrieval time.
Repeated fetch observations are explicitly simulated sidecar observations and do
not replace those immutable clocks.

Repository commit time is a proxy only. Authoritative event time, source report
time and canonical CISA availability remain null. `published_at` is either null
or the explicitly marked repository-committer proxy. The adapter refuses source
clock promotion, byte/capture mismatch, changed actual retention clocks, real
review relabeling, provider correction designation and historical-observation
relabeling.

All Story/public/material/capture IDs, owner reviews, review receipts, current or
superseded selection declarations, materiality/novelty declarations, observation
times and oracle intervals are simulated. Observation clocks at or after actual
retention are deterministic benchmark choices, not observations of historical
users. The simulated correction exercises accepted correction semantics over
retained bytes; none of the three actual field amendments was designated a
correction by the provider.

## Supplemental coverage

| Case | Explicit benchmark window | Qualified behavior |
| --- | ---: | --- |
| As-of revision selection | 80 hours | Earlier selected version keeps predecessor bytes, material ID and evidence; later revision does not alter an earlier decision. |
| Stale report with simulated fresh major declaration | 75 hours | Source report stays non-Breaking; reason changes from stale clock to established update at 2 hours and quiet phase at 72 hours; repeated observations do not reset it. |
| Unknown report time with simulated rapid declaration | 4 hours | Null report time stays null and Source Report remains non-Breaking. |
| Simulated backdated correction notice | 75 hours | Old effective time remains exact; correction reason starts at its simulated declaration and decays 72 hours later without new Breaking activity. |
| Superseded selected source | 3 hours | Exact predecessor bytes remain selected with an explicit supersession reason; no latest-source fallback occurs. |

Every supplemental interval keeps independent MIP state unavailable and its
visible report label `SOURCE REPORT`. State/report/binding/correction disagreement
durations are zero against the explicit simulated constraints. These results
qualify the declared benchmark windows only; they are not empirical journalism
accuracy or threshold selection.

## Reproduction and retained evidence

From the repository root, generate the deterministic receipt with:

```sh
node scripts/qualification/retained-real-news-replay/run.mjs
```

Run the affected qualification with either Node 22 or Node 24:

```sh
node --test --test-reporter=tap tests/retainedRealNewsReplay20261004.test.mjs tests/retainedNewsReplay20261003.test.mjs tests/officialKevBenchmark20261003.test.mjs tests/newsStoryStateCorrections20261003.test.mjs tests/newsStoryState.test.mjs tests/newsStateCalibration.test.mjs
```

The retained `node22.tap` and `node24.tap` each report 39 passes and zero
failures/cancellations/skips/todo, including eight new tests and rejection
controls. Node versions are 22.23.3 and 24.19.0. The two replay JSON files are
byte-identical: 156,023 bytes, SHA-256
`baf98af4b6b4fad020ff5d67f0527a8b57d9170b8e95ab9a186946e4ae99a0a7`.
No full-suite, build, browser, physical-device or outside-review qualification is
claimed. Rejection controls demonstrate refusal; they are not red reproductions
of a product defect.

## Remaining empirical gates

Actual MIP admissions remain zero. All seven actual-byte benchmark cases use
simulated review; the representative real retained admitted/reviewed corpus gate
is OPEN. The policy remains `mip-news-state-2026-10-02-v1`, qualified as
`synthetic_calibrated_candidate`: Breaking fresh 2 hours/max 6 hours, rapid arrival
3 hours, velocity 12 hours/minimum 2 changes, Developing quiet 24 hours and
Updated quiet 72 hours. No threshold changed or received live approval.

Representative longitudinal source capture, authoritative event/report clocks,
actual permitted owner review/admission, independent materiality/accuracy labels
and empirical threshold calibration remain necessary. Historical license-version
auditing and provider-designated correction chronology remain open. The source
revision interval establishes no quiet factual interval.

This continuation made no network acquisition and did not retry or bypass the
stopped NHC/NWS routes. It performed no Library canonical write, provider/source
activation, live-account work, Supabase/qik operation, account creation, spend,
external dispatch, push, merge or deployment. Parent integration and any coherent
outside review remain separate.
