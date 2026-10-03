# Retained News replay and correction semantics — 3 October 2026

The bounded candidate repairs correction interpretation in the existing News
state engine and adds an offline, source-bound replay verifier. The existing
`mip-news-state-2026-10-02-v1` numerical policy and its
`synthetic_calibrated_candidate` qualification remain unchanged. No empirical
threshold selection or live permission follows from this work.

Source baseline: `ca72a6df511bbb26c6b9e0a193a3e0baf01aa428`, tree
`cbcfc510a117101fd163f83b3c574dd979085b02`, checked through GitHub commit/tree
reads and the clean frozen worktree. No applicable AGENTS/current.skills file
was present. The parent's CURRENTDURABLERECORDSREAD gate was opened before
edits, after current Owner Decisions and Library v6 register/v19 handoff and
review were read. The owner's later bounded implementation authority governs
this isolated candidate. Master Plan 2.1.5 (3 September), later verified by
the parent, supersedes the register's historical 2.1.4-latest statement.

## Existing engine repair

The owner contract declares `kind` and `novelty` independently. A valid
`kind: update`, `novelty: correction` declaration previously bypassed the
correction notice path. A backdated correction disappeared immediately into
Historical, while a recent correction could contribute Developing velocity.
The repaired engine treats correction novelty and correction kind together
for notice decay, phase restart exclusion, velocity exclusion and history
boundaries. It retains the actual effective clock and the correction's
declaration clock; correction urgency never becomes new Breaking activity.

Attributed source reports now carry additive versioned reason codes and the
matched material-version/declaration/effective-time/evidence/review bindings.
Missing source time, stale source time, supersession and incomplete history
remain explicit reasons. `assertion_scope: attributed_source_report_only`
and pending MIP verification remain intact. Shared deterministic boundary
calculation keeps these reason transitions current without a network poll.
The numerical policy version is retained because this repairs interpretation
of existing categorical owner declarations, not the candidate thresholds.
The new source digest and commit identify the corrected implementation.

## Retained material actually available

The existing Project 2025 source-mapped seed describes 56 publisher metadata
records and four named DOJ actions. Its seed dates are day precision. Four
retained research indexes contain 51 RSS items, 44 decoded 2025 publisher
links, 12 decoded 2026 links and ten February 2026 links. These indexes can
overlap; the counts are not summed into a unique corpus. Aggregator publication
clocks, source URLs and date-only seed rows cannot establish source capture
identity, materiality, actual event time, permitted rights or historical MIP
review/label chronology. The verifier retains each input hash and reports
zero replay-eligible cases from these indexes.

A separately authorized acquisition worker retained two actual immutable
CISA KEV catalog CSV revisions from the official government repository:

| Revision | Repository commit UTC | Raw bytes | SHA-256 |
| --- | --- | ---: | --- |
| `b6ec201bce3fc8cf29484c35e54ab3c3f6c2b4a1` | 2025-03-27 18:34:36 | 651,543 | `c31b4b8af97e63c4fcb8d823d7740ec191eaf0970b216c38b1ed09ff21899ce5` |
| `6ff2cc19002acfb5d9214f4ee9bc428640c5084a` | 2025-03-31 18:47:50 | 652,343 | `35823149b421051320c6849cc90c1de55ad63c6f40684dae58b5bf80640db206` |

The exact bytes total 1,303,886 and were retrieved on 3 October 2026 at
04:19:48 UTC. SHA-256, Git blob SHA-1, row counts, direct parent/child commit
identity, CC0 license and official README hashes are checked offline. The
acquisition manifest hash is
`0ba77e64879a53221ef953d0c08cdfa9b7c720e98969418f89e8dd2bf3ec1c2e`.
The retained current license expressly covers the KEV database; separate
historical license-version auditing remains open. No linked third-party
content or logo/seal endorsement right is included.

Independent exact-field CSV comparison reproduces one added entry
(`CVE-2024-20439`), the `Unknown` to `Known` ransomware field amendment for
`CVE-2025-26633`, required-action amendments for `CVE-2025-30066` and
`CVE-2025-30154`, and 1,308 unchanged common records. These are observed
source differences. Provider-designated correction/retraction history,
underlying exploitation times and factual/materiality truth are unknown.
The 346,394-second repository revision interval establishes no intervening
repository commit for this direct parent/child pair; it does not establish
a quiet factual interval or precise canonical CISA availability time.

The acquisition worker preserved denied NHC routes and stopped that route.
Its complete acquisition attempts remain in the dated corpus receipt. The
bounded request cap was reached; this replay performs no source acquisition.

## Replay contract and results

`scripts/retainedNewsReplay20261003.mjs` uses the existing owner response
normalizer and existing News decision functions. Inputs must bind the exact
selected context digest, retained capture bytes/digests/IDs/source clocks,
rights/capture references and retained review-receipt context bindings.
Snapshots cannot contain future declarations or reviewed evidence. The
verifier evaluates contiguous label intervals at each retained snapshot,
label boundary and the engine's next deterministic clock boundary. It records
Story/public/material-version IDs, material-change IDs, policy versions,
effective/declaration/source clocks, source-report reasons, evidence/review
references and transitions. No latest-head substitution is performed.
An explicit as-of regression proves that a later correction's Story version,
material ID and evidence cannot appear in the earlier snapshot. Event effective
time remains distinct from declaration/review/known time. Retrospective labels
are evaluation oracles only; changing a later label never changes an earlier
engine decision. One declaration remains one change, not a velocity series.

Duration totals measure state disagreement, false Breaking persistence,
premature Breaking decay, attributed report-label errors, material binding
errors and correction errors over the explicitly labeled observation windows.
Labels and source integrity do not independently establish journalism truth.
Corpus classes remain separate:

- `synthetic_regression`: thirteen explicit fixtures cover rapid/slow updates,
  quiet unresolved events, one-off changes, corrections, retraction,
  contradiction, supersession, stale reports, repeated reads/fetch observations,
  syndication, late evidence and missing source time. Labels are predeclared
  synthetic constraints. The retained candidate has zero duration errors;
  the short/long comparison records decay/persistence tradeoffs. These are
  regression outcomes, not observed real-world accuracy.
- `retained_real_simulated_review`: two benchmark cases use the genuine CISA
  CSV bytes and exact source differences, with explicit simulated owner
  fixtures and review bindings. Current capture/review/declaration clocks use
  actual late retrieval. One case projects repository commit time only as
  a declared benchmark proxy; the other preserves unknown publication time
  as null. Neither invents historical MIP admission or a vulnerability event
  timestamp. Repeated current reads remain SOURCE REPORT, with no settled MIP
  proposition or new urgency. All three numerical candidates pass the same
  categorical stale/missing-clock constraints; this offers no evidence for
  choosing a different numerical threshold.
- `retained_real`: zero actual admitted/reviewed Story cases with independent
  retained label chronology were supplied. The metrics have zero observation
  duration; no real accuracy or error-rate estimate exists.

References and receipt hashes establish integrity and recorded relationships.
They do not confer rights, publication permission, actual reviewer authority,
independent review or representative coverage. Simulated review receipts
cannot be reclassified as genuine owner reviews by changing a corpus label.
No second materiality/publication engine, learned scoring, external model,
live source collector or publication bypass is introduced.

## Qualification and remaining gate

Node **22.23.3** and **24.19.0** each pass **55/55** targeted tests with
zero failures, cancellations, skips or todos. These include the new engine,
receipt/chronology/capture failures, actual official bytes/CSV parser and
existing mounted News/Feed regressions. Both runtimes produce byte-identical
replay JSON. Exact test logs and the equivalence digest are retained under
`verifier/news-calibration-2026-10-03/`; the canonical replay is
`verifier/retainedNewsCalibration20261003.json`. Existing dependencies were
reused unchanged. No broad source re-audit or build was substituted for the
parent's separately frozen 2,578-test-per-runtime frontend qualification.

The external empirical gate remains: representative permitted longitudinal
News captures with real source issue/effective/declaration clocks, exact
owner Story/version/material/evidence/review bindings, independent label
chronology, corrections/retractions/contradictions and rapid/slow/quiet cases.
Those inputs are required to measure production false persistence, premature
decay and materiality accuracy and justify revised numerical candidates.
This narrow real source pair advances retention and replay while leaving that
gate open. The proposals/installation sequence, App UI, dependencies, shared
source manifests and frozen baseline remain outside this lane; integration,
full CI and outside review belong to the parent. No protected operation,
activation, merge, deployment, release, physical-device test or outreach was
performed.
