# R4.75 Step 8 closeout — evidence package

**Status:** packaged for owner / CoS review. **Not merged. Not R5.**

Governing spec (read authority; file is not checked into this repo):
`MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1` §16 Step 8, §17, §19, §20.

This package is **evidence packaging only**. It does not authorize product mutation, V2/Supabase writes, a second public event, Port Meridian overlays, a God’s Eye View clone, or the start of R5.

**Do not merge. Frontend does not merge. No V2 writes. Do not start R5.**

---

## 1. Stopping point

| Item | Value |
|---|---|
| Repo | `jkelsen13-tech/media-intelligence-platform-v2` |
| Branch this package is based on | `main` |
| Stopping SHA | `49010caeb22913215aa4dcab08ffe7c8a4ccb5fd` |
| Stopping commit | `R4 World View launch spine (MapLibre + event-time weather) (#12)` |
| Closeout date | 2026-09-03 |
| Canonical subject | `acc55cb2-5ac2-4aed-be36-3f576d2bc443` (2024 Total Solar Eclipse, Cleveland, Ohio) |
| Live Pages base | https://jkelsen13-tech.github.io/media-intelligence-platform-v2/ |
| Live World View URL | https://jkelsen13-tech.github.io/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world |

### Live Pages asset hashes (re-confirmed 2026-09-03)

`GET https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` still serves:

- `assets/index-CsIIFAtO.js`
- `assets/map-stack-BRFtLxm-.js`
- `assets/map-stack-CuCRB34y.css`
- `assets/index-oGyBut6h.css`

World View §8 A–K live-verified PASS on that SHA / those JS assets (verbatim matrix in §4 below).

V2 project `qikvmopbtijoebdqosyq` was **not written** by this closeout.

---

## 2. Steps 0–7 → landed PRs

Verified via `gh pr list --repo jkelsen13-tech/media-intelligence-platform-v2` and `git log` on `main` at `49010cae`. PR numbers below are not invented.

| Step | Spec citation (as locked in landed code/PRs) | Landed PR | Merge SHA on `main` | Notes |
|---|---|---|---|---|
| 0 | Inventory (accepted before Step 1) | *no PR titled Step 0* | — | Step 1 authorization recorded “Step 0 inventory already accepted.” Honest-empty News / temporal DISPLAY baseline: PRs **#3**, **#4**, **#5**. |
| 1 | §3 / §16 Step 1 — Investigation Context | **[#6](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/6)** | `4ed3b32` | IC preserved across view changes. |
| 2 | *(no dedicated R4.75 PR on this repo)* | — | — | Do not invent a Step 2 PR number. View consumption of the shared IC landed with Step 1 (#6). |
| 3 | §5 / §16 Step 3 — Explore / Change Topic | **[#7](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/7)** | `01520b3` (merge of `7908b6a`) | Follow-up comment honesty: `2f06992`. |
| 4 | §7 / §16 Step 4 — discovery vs investigation filters | **[#8](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/8)** | `30878de` | |
| 5 | §5.3 / §16 Step 5 — new-subject propagation | **[#9](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/9)** | `592a7a6` | |
| 6 | §10 / §11.1 / §16 Step 6 — deep links + recent-context | **[#10](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/10)** | `23dc962` | |
| 7 | §13 / §14 / §16 Step 7 — failure / freshness / a11y / perf | **[#11](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/11)** | `1f39e54` | `/arcs` aliases `/arc`. |
| Adjacent R4 spine | World View launch v0.1 §8 A–K | **[#12](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/12)** | `49010cae` | Not an R4.75 product step. Included as adjacent live evidence. |
| 8 | §16 Step 8 / §19 / §20 — this package | *this PR* | — | Evidence + regression lock only. **Leave unmerged.** |

---

## 3. §19 Definition of done — acceptance matrix

The governing markdown is **not in this repository**. Bullets below are the Definition-of-done requirements named by landed PRs #6–#11 as implementing `MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1` sections, plus standing Index / G2 / spatial rules, plus the Step 8 authorization. Owner review may remap numbering if the off-repo §19 list differs. **Do not treat a remapping as authorization to change product behavior.**

Machine check: `tests/r475Step8Closeout.test.mjs` asserts every `19-*` id in this table is present here as `PASS` and re-locks the shipped invariant.

| ID | §19 requirement | Result | Evidence |
|---|---|---|---|
| 19-A | Shared Investigation Context with `canonical_subject_type`, `canonical_subject_id`, `parent_event_id` (nullable), `as_of_time` / `selected_time_range` (honest absent OK), `active_view`, `temporal_assessment_reference` (existing DISPLAY key; not recomputed). | **PASS** | `tests/investigationContext.test.mjs` — `empty Investigation Context has the contract fields and invents no subject`; `temporal_assessment_reference is the existing DISPLAY key, not a recompute`. Source: `src/lib/investigationContext.js` `INVESTIGATION_CONTEXT_FIELDS`. |
| 19-B | Ordinary view / tab change preserves `canonical_subject_id`. Cleveland `acc55cb2-5ac2-4aed-be36-3f576d2bc443` survives News ← Graph ← Timeline ← Arcs ← World View. Empty input invents no subject. | **PASS** | `tests/investigationContext.test.mjs` — `view change preserves Cleveland; News browse does not wipe the subject`; `empty World View / Graph selection does not invent Cleveland or any second event`. Live: IC bar on `#/event/acc55cb2-…/world` (owner-verified 2026-09-03, World View C). |
| 19-C | Ordinary nav does not fire `JUMP_CLEARS` / does not replace the subject. | **PASS** | `tests/investigationContext.test.mjs` — `JUMP_CLEARS does not include Investigation Context; tab nav must not reset it`. |
| 19-D | Graph, World View, Timeline, Arcs, Compare, and inspector DISPLAY/consume the shared IC. Spatial `mip_object_id` is not the canonical id. | **PASS** | `tests/investigationContext.test.mjs` — `Graph, World View, Timeline, Arcs, and inspector consume the shared object`; `World View Cleveland row seeds event acc55cb2, not the spatial mip_object_id`. Live World View D: no `mip_object_id` schema dump. |
| 19-E | Explore / Change Topic is reachable from every page. Opening the shell is **not** a view change. | **PASS** | `tests/exploreShell.test.mjs` — `App shell has Explore / Change Topic and opening it is not a view change`. Live Pages header control present on World View URL. |
| 19-F | Explore open / News-filter browse / dismiss do not mutate Investigation Context. | **PASS** | `tests/exploreShell.test.mjs` — `Explore open / News filter browse / dismiss preserve Cleveland and do not JUMP_CLEARS`. `tests/investigationJoinState.test.mjs` — `Explore dismiss does not clear Cleveland; drawer stays non-mutating`. |
| 19-G | Discovery filters are a named contract separate from Investigation Context. News / Explore chips do not write `canonical_subject_id`. | **PASS** | `tests/discoveryFilters.test.mjs` — `discovery state is a named contract and does not grow Investigation Context`; `applying discovery filters does not change Cleveland or call applySubject`; `source-scan: News/Explore labeled discovery; Graph/World View/Timeline are investigation`. |
| 19-H | §7.3 no leakage: discovery Region Europe does not hide US-origin investigation evidence on the active subject. | **PASS** | `tests/discoveryFilters.test.mjs` — `§7.3 no leakage: discovery Region Europe does not hide US-origin investigation evidence`. |
| 19-I | Investigation view-slices (Graph region/depth, World View recorded time / `as_of_time`, Timeline month/type) do not replace `canonical_subject_id`. | **PASS** | `tests/discoveryFilters.test.mjs` — `investigation filters do not replace canonical_subject_id`. Live World View G: pan/zoom does not change precision class / identity. |
| 19-J | Explicit new-subject select commits Investigation Context **once** via `commitNewSubject`. Analytical pages then read IC without a per-page search. | **PASS** | `tests/newSubjectPropagation.test.mjs` — `fixture Cleveland → fixture B commits Investigation Context exactly once`; `tab / view preserve after commit; inspector bindings follow the new IC`; `Explore / News explicit select paths use the single commitNewSubject seam`. |
| 19-K | Prior-subject sub-selections are cleared on new-subject commit. Discovery filters are **not** on that clear list. | **PASS** | `tests/newSubjectPropagation.test.mjs` — `invalid sub-selections are named for clear; discovery is not among them`; `discovery filters do not strip new-subject evidence and do not replace the subject`. |
| 19-L | Honest empty News (0 eligible / no named id) does not invent a subject and does not wipe Cleveland without a select. | **PASS** | `tests/newSubjectPropagation.test.mjs` — `honest empty News does not invent a subject or wipe Cleveland without a select`. `tests/newsSchemaFailClose.test.mjs` (PRs #3–#5). Live Pages News / Explore: 0 eligible; `public.edges` unavailable. |
| 19-M | Shareable hash `#/event/<canonical_subject_id>/<view>` reconstructs subject + view from **ids**. `/arc` and `/arcs` both land on Arcs. | **PASS** | `tests/deepLinks.test.mjs` — `deep link reconstructs fixture subject + view from ids`; `/arc and /arcs both reconstruct the fixture subject onto Arcs; unknown slugs fail-close`. `tests/worldViewLaunch.test.mjs` — `#/event/<id>/world reconstructs Cleveland onto World View`. Live: `#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world`. |
| 19-N | Invalid / stale `claim` / `entity` / `source` / `place` ids fall back to the **parent** Investigation Context with disclosure. They do not select a different subject. | **PASS** | `tests/deepLinks.test.mjs` — `invalid/stale sub-selection ID falls back to parent IC, not a different subject`. `tests/investigationJoinState.test.mjs` — `invalid selection IDs fail closed to parent IC with consistent disclosure`. Live World View B: invalid sub-selection → parent IC. |
| 19-O | Identity is never derived from display title / label / name. | **PASS** | `tests/deepLinks.test.mjs` — `identity is not derived from display text`. `tests/recentInvestigation.test.mjs` — `identity is the stored id, never a display title`. |
| 19-P | Recent-context return: push prior IC on subject change; restore subject/view; bound to 8; unauthenticated session/local only. No Account Pipeline. | **PASS** | `tests/recentInvestigation.test.mjs` — `recent stack push on subject change + restore returns prior subject/view`; `stack is bounded and does not grow without limit`; `unauthenticated storage key is session/local only`. |
| 19-Q | Honest empty / missing / unsupported joins are distinguishable (no joined data, insufficient evidence, object type not representable, withheld, request failed, stale cached). Never invent a subject, Arc, News row, edge, or weather. | **PASS** | `tests/investigationJoinState.test.mjs` — `join kinds are distinguishable and never invent a subject or weather`. Live World View B: honest empties (`public.edges` unavailable). Live F: Temporal UNAVAILABLE / insufficient history. |
| 19-R | Unsupported joins and rapid view changes fall back to parent IC. `/arc` + `/arcs` keep the fixture event id on Arcs. | **PASS** | `tests/investigationJoinState.test.mjs` — `unsupported join falls back to parent IC; /arc and /arcs land on Arcs`; `rapid view switches preserve the fixture subject and invent no second event`. |
| 19-S | Accessibility / mobile / performance: Explore keyboard + focus restore; filter chips not color-only; search debounce 350ms + in-flight cancel; recent stack max 8; lens / tab change does not `loadGraph`. Freshness uses existing as-of / revision markers (no backend revision API). | **PASS** | `tests/investigationJoinState.test.mjs` — `a11y labels and Explore focus hooks are present; filters are not color-only`; `search debounce/cancel and recent history stay bounded; lens change does not refetch graph`; `stale / as-of freshness uses existing markers and invents no revision API`. |
| 19-T | DISPLAY / client only. No V2 / Supabase writes. No `reader_state` mutation. No `service_role`. Production `src/` does not hardcode Cleveland as the only identity path. | **PASS** | DISPLAY-only source-scans in `investigationContext`, `exploreShell`, `discoveryFilters`, `newSubjectPropagation`, `deepLinks`, `recentInvestigation`, `investigationJoinState`, `worldViewLaunch` tests. Closeout test re-scans R4.75 modules. This Step 8 PR adds **docs + tests only**. |
| 19-U | G2 dimensions stay **separate**. No composite truth / bias / authority score. Confidence is labeled text: “CONFIDENCE (NOT A TRUTH OR BIAS SCORE)”. | **PASS** | `tests/spatialProjection.test.mjs` — `G2 dimensions stay separate; confidence is labeled text, not a composite score`. `tests/worldViewLaunch.test.mjs` — `D: inspector has date/time, city precision, provenance, G2 separate, no composite score`. Live World View D. Index: missing evidence is not contradicting evidence. |
| 19-V | Missing ≠ contradicting. Absence of joined data / temporal history / weather is explicit UNAVAILABLE / insufficient — not a contrary finding. | **PASS** | Join-state copies in `src/lib/investigationJoinState.js`. Temporal DISPLAY refuses `truth_probability` / `expected_range` (`tests/investigationContext.test.mjs`, `tests/worldViewLaunch.test.mjs` F). Live World View B / F / J. |
| 19-W | Spatial is a **projection of MIP knowledge**, not a second globe truth. n=1 Cleveland city Point `[-81.7, 41.4]`; pan/zoom does not invent denser geometry. | **PASS** | `tests/spatialProjection.test.mjs`; `tests/worldViewLaunch.test.mjs` A / G. Live World View A / G. |
| 19-X | No second invented public event. No Port Meridian / evacuation / AQI / shipping / humidity-cloud widgets. No GEV fork / Cesium / person-CCTV-aircraft-vessel overlays. | **PASS** | `tests/worldViewLaunch.test.mjs` A / H / K and `src has no globe-vendor / 3D-tile strings`. Live World View A / H / K. Closeout invents no second subject. |
| 19-Y | Automated tests green (`npm test`). Closeout evidence doc maps every §19 bullet. | **PASS** | This document + `tests/r475Step8Closeout.test.mjs`. `npm test` on the Step 8 branch (see PR). |
| 19-Z | Stop before R5. Frontend does not merge. Owner / CoS review only. | **PASS** | This document §5–§6. PR body states: Do not merge. Frontend does not merge. No V2 writes. Do not start R5. CoS/owner review only. |

---

## 4. World View launch §8 A–K (adjacent R4 spine — copy verbatim)

Owner live-verified **2026-09-03** on `main` `49010cae` / assets `index-CsIIFAtO.js` + `map-stack-BRFtLxm-.js`.

Overall **PASS** on `#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world`:

- **A PASS:** Cleveland city Point [-81.7, 41.4]; 1 row; no second event
- **B PASS:** honest empties (public.edges unavailable; invalid sub-selection → parent IC); no demo city
- **C PASS:** same canonical_subject_id across IC / Map / Graph / Split / inspector
- **D PASS:** date/time, city precision, provenance; G2 separate; CONFIDENCE (NOT A TRUTH OR BIAS SCORE); no mip_object_id schema dump
- **E PASS:** event-time weather DELAYED ERA5/Open-Meteo at 2024-04-08T17:00Z (18°C / 0 mm / 13.6 km/h); not present-day
- **F PASS:** Temporal UNAVAILABLE / insufficient history; no expected-range / truth_probability
- **G PASS:** pan/zoom; precision class unchanged
- **H PASS:** no person/CCTV/aircraft/vessel overlays
- **I PASS:** OSM/OpenFreeMap attribution visible
- **J PASS:** RECONSTRUCTED / DELAYED / UNAVAILABLE / UNCLASSIFIED labels distinct
- **K PASS:** no Port Meridian / evacuation / AQI / shipping / humidity-cloud widgets

Repo lock (does not replace live Pages): `tests/worldViewLaunch.test.mjs` A–K.

This closeout **does not re-implement World View**.

---

## 5. §17 — R5 inherits (list only; do not implement)

R5 must re-run these inherited invariants **independently**. Packaging them here is not a start of R5 and is not a waiver.

1. One Investigation Context identity (`canonical_subject_id` / type / parent / as-of / view). Ordinary view change does not replace it.
2. Explore / Change Topic browse and dismiss remain non-mutating until explicit select.
3. Discovery filters stay separate from investigation evidence (no leakage).
4. New-subject select is a single `commitNewSubject` commit; invalid sub-selections clear; discovery is not a sub-selection.
5. Deep links reconstruct from ids; invalid sub-selection → parent IC; identity is never display text.
6. Recent-context is bounded session/local for unauthenticated visitors (until R5 separately authorizes otherwise).
7. Honest join states: missing ≠ contradicting; never invent subject / Arc / News row / edge / weather.
8. G2 dimensions stay separate; no composite truth / bias / authority score.
9. Spatial remains a projection of MIP knowledge; n=1 city coarsening is not denser geometry.
10. World View privacy lock: no person / CCTV / aircraft / vessel overlays; no GEV clone; no Port Meridian launch widgets.
11. DISPLAY / client until R5 is **separately** authorized to write. No silent V2 writes from this package.
12. Canonical fixture remains Cleveland `acc55cb2-…` until a second **real** public event is owner-authorized. Do not invent one.

---

## 6. §20 — stop before R5

**Stop for owner review.**

- Do **not** start R5.
- Do **not** merge this PR. Frontend does not merge.
- Do **not** write to V2 / Supabase (`qikvmopbtijoebdqosyq`) or any database.
- Do **not** invent a second public event or Port Meridian overlays.
- Do **not** clone / fork God’s Eye View.
- Do **not** reopen Steps 0–7 product behavior except to cite / test it.
- Docs in this PR are evidence packaging, not authorization for further mutation.

R5, if later authorized, inherits §17 and must prove those invariants on its own branch with its own evidence.
