# Run log — Track B Step 3, item 2 (Policy Arc screen, Screen 4)

Date: 2026-08-18. Namespace: trackb3-v2. Criteria: `trackb3-v2/trackb3-step3-item2.md`.
Branch: main. Environment: master working copy on /mnt mount; rsync copy in
/tmp for install/test/build (mount blocks exec bits — v4 precedent).

## Live-DB pre-implementation queries (read-only, project SUPABASE_PRODUCTION_REF_REDACTED)

- `SELECT category, count(*) FROM arc_events GROUP BY category` →
  accountability 34, geopolitical 23, economic 8, legislative 5.
- `SELECT category, count(*) FROM story_arcs GROUP BY category` →
  unclassified 14, geopolitical_consequence 11, institutional_accountability 10,
  legislative_regulatory 10, economic_policy 4.
- `SELECT confidence, count(*) FROM arc_events GROUP BY confidence` →
  corroborated 66, confirmed 4. Zero inferred, zero dispute signal.
- `SELECT status, count(*) FROM arc_milestones GROUP BY status` →
  pending 34, confirmed 1.
- `information_schema.columns` for arc_events → id, arc_id, title, category,
  confidence, occurred_at, description. NO source/outlet/url/excerpt columns.

Consequences encoded in `src/lib/policyArcModel.js` (see criteria doc
"Data-mapping decisions"): contested is a documented constant zero; sources
line derives from attached articles only; missing-scope copy is exercised by
real data (34 pending milestones live).

## Baseline

- Suite before changes: 284/284 (item-1 close state).

## Results

- `node --test tests/`: 301/301 PASS (284 baseline + 17 new in
  tests/policyArcModel.test.mjs). First run failed 1 (Node ESM requires the
  explicit `.js` extension on the policyArcModel → epistemicModel import;
  Vite resolves extensionless, node --test does not). Fixed; full suite
  green on rerun.
- `npm run build`: clean, 7.19s (pre-existing chunk-size warning only).
- Live-data behavior notes (derivations against census): a typical arc
  renders supporting = its confirmed+corroborated event count, contested 0,
  missing = pending milestones with the computed scope line ("Scope: N
  expected outcomes tracked for this arc, checked against the monitored
  corpus from [start] through [last milestone update].").

## Acceptance-criteria verdicts (trackb3-v2)

A2.1–A2.15 all PASS. Unit-pinned: A2.1, A2.6 (icon fallback), A2.8
(derivation + documented-zero contested probe + scope-copy legs), A2.9,
A2.10, A2.13 (null → render nothing across badge/pill/icon seams), A2.14
(hex audit incl. new files). Static-guarded: A2.5 (caption hardcoded, no
caption prop, no progress vocabulary), A2.7 (verbatim banner copy), A2.11
(reviewedAt={null} in ArcsView). Visual/grayscale evidence is deferred to
the item-5 acceptance pass per the item plan (screenshots both screens,
accent removal, AA contrast, mobile 390px + desktop) — recorded here so the
deferral is explicit, not silent.

## Push record

1. Code + tests — commit 21506a6282e4d9722fa211c686268c6c6ecb6733.
   Blob verification (git hash-object local vs remote blob SHA):
   - src/lib/epistemicModel.js 72418982533af2d999ffeaf136e1efebb9ecd044 MATCH
   - src/lib/policyArcModel.js 996fcc391db68000cbabd5240cec9dfa81883f2f MATCH
   - src/components/LifecycleStrip.jsx 6414c9f485f39aa179a382c88733670d2b8468d0 MATCH
   - src/components/TypeIcon.jsx ad4eed70c64b752b921a50a9ecb7279f8c8e6546 MATCH
   - src/components/epistemic.css 415de6683a700d2cd09238b9049582e58ba1b30e MATCH
   - src/views/ArcsView.jsx 5e94369cf68965f58455c565685c9ae37d952bec MATCH
   - tests/policyArcModel.test.mjs 7704c4ee4a1e9e22be9e1042341099a7022cb59b MATCH
   CI on 21506a62: Golden regression suite SUCCESS, Deploy SUCCESS.
2. Verifier criteria — commit be46dc9d2909d2f1b7e9908263d8b0ecd80d6101.
   - verifier/trackb3-v2/trackb3-step3-item2.md f06bfd9cb29b443c31fd9fb1cf9fd328e7e74baf MATCH
   CI on be46dc9d: Golden regression suite SUCCESS, Deploy SUCCESS.
3. README index append — commit c3d50a43ec58236ce1adc623528526a7da96091e.
   - verifier/README.md e82b73b74b688a51a9e6005f966e3a8807d568e6 MATCH
     (base adopted from remote canonical d8879132 before appending; no
     transcription slip this pass).
   CI on c3d50a43: Golden regression suite SUCCESS, Deploy SUCCESS.
4. This run log — commit 321161467210f16b64a26ddfaf48fbf55419eedd.
   - verifier/runs/2026-08-18-trackb-step3-item2.md bb3433f5b2bffcd19f31e3ad81958a13e7758a23 MATCH
   CI on 32116146: Golden regression suite SUCCESS, Deploy SUCCESS.

No DB mutations, no flag changes, no scope expansion. All queries read-only.
