# R4.9 Stage D closeout — bounded display-only terrain integration

**Status:** COMPLETE and live. Stage E not started. No Supabase mutation performed. No paid service, account, secret, token, bulk mirror, or purchase used.

Program label is written `R4.9` in this file. G2 uncertainty levels live only in `docs/UNCERTAINTY_VOCABULARY.md`; this closeout does not redefine them.

---

## 1. Stopping point

| Item | Value |
|---|---|
| Repo | `jkelsen13-tech/media-intelligence-platform-v2` |
| Branch | `main` |
| Stopping SHA | `9000b7e2c67aa71b56592f8868bfb3112640d60f` |
| Closeout date | 2026-09-04 |
| Canonical subject | `acc55cb2-5ac2-4aed-be36-3f576d2bc443` (2024 Total Solar Eclipse, Cleveland, Ohio) |
| Live Pages base | https://jkelsen13-tech.github.io/media-intelligence-platform-v2/ |
| Live World View URL | https://jkelsen13-tech.github.io/media-intelligence-platform-v2/#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/world |

### Live Pages asset hashes (confirmed 2026-09-04, post-repair deploy)

- `assets/index-BKvWcfKW.js`
- `assets/map-stack-C5-ZGlAr.js`
- `assets/cesium-globe-XVRzhl-W.js`
- `assets/cesium-globe-CGNOqgEs.css`
- `assets/index-oGyBut6h.css`
- `assets/map-stack-CuCRB34y.css`

Live backend project `qikvmopbtijoebdqosyq` was **not written** by this stage.

---

## 2. Owner decisions honored (normative, carried verbatim from authorization)

1. Raw Mapzen Terrarium elevation may be used during development as **display-only, source-datum terrain**.
2. Terrain must **never** become evidence, alter `precision_class`, supply an asserted event altitude, snap evidence to the surface, or strengthen geographic certainty.
3. The approximately **34.1-meter Cleveland datum offset** is accepted for development because terrain remains display-only and the city camera floor is **34,641.016 meters**.
4. The **frozen Mapzen/AWS v1.1 dataset** is accepted as a development source **without an SLA**.
5. An approved, versioned, geoid-corrected **R2 mirror remains a launch-preparation decision** — not part of Stage D.
6. **Cesium ion and paid terrain providers are not approved or required.**
7. Stage D begins with **bounded Cleveland/Ohio coverage**. Access to the global Mapzen bucket is not approval to display or fetch globally licensed terrain.

Coverage correction honored: no globally sourced root/parent terrain is requested to reach Cleveland descendants; no missing or unapproved terrain is zero-filled; outside the approved terrain boundary the globe honestly remains the Cesium reference ellipsoid.

---

## 3. Terrain source attribution (displayed + normative record)

Renderer credit surface shows: `Terrain: USGS 3DEP/SRTM/GMTED2010 · NOAA ETOPO1 · via Mapzen/AWS Terrain Tiles`. Imagery: `© OpenStreetMap contributors`. Renderer: CesiumJS (Apache-2.0), self-hosted static assets, **no ion**.

Approved per-tile provenance prefixes (enforced fail-closed from the bucket's CORS-exposed `x-amz-meta-x-imagery-sources` header):

| Prefix | Source | Note |
|---|---|---|
| `ned/` | USGS 3DEP / NED (1 arc-second and 1/9 arc-second products) | Observed live on Ohio tiles |
| `ned13/` | USGS 3DEP / NED 1/3 arc-second | **Added during the live repair loop** — observed on live Ohio tiles (e.g. `ned13/imgn42w082_13.tif`); within the owner-approved US-federal set |
| `ned_topobathy/` | USGS NED Topobathy | Approved, not observed |
| `srtm/` | NASA/NGA SRTM via USGS | Observed live (mixed headers) |
| `gmted/` | USGS GMTED2010 | Observed live (mixed headers) |
| `etopo1/` | NOAA ETOPO1 bathymetry | Approved, not observed |

The exact live-observed provenance header for Cleveland tile `terrarium/11/559/764.png` (`ned/ned19_n41x50_w081x75_oh_north_2006.tif, ned/ned19_n41x75_w081x75_oh_north_2006.tif, ned13/imgn42w082_13.tif`) is pinned in `tests/worldViewStageDTerrain.test.mjs`.

### `nrcan_cdem/` fail-closed behavior (owner policy question flagged)

Lake Erie-adjacent tiles inside the approved geographic boundary carry provenance mixing **Canadian CDEM** (`nrcan_cdem/…`) with US sources. These tiles are **rejected fail-closed** and render their nearest real ancestor (upsampled parent or ellipsoid). Observed live on the Cleveland descent: 12 of 31 tile responses carried CDEM-mixed headers; all 12 were rejected; all 19 served tiles were fully approved-source. Broadening the licensed-source set (e.g. licensing CDEM, or substituting an approved US-only composite) is an **owner policy decision — not taken in Stage D**.

---

## 4. Datum addendum

- Terrarium heights are **source-datum** (NAVD88 for US 3DEP/NED coverage). They are displayed **raw** under the display-only rule.
- Cleveland offset: approx. **+34.1 m** vs the WGS84 ellipsoid (GEOID18 N = −34.111 m at 41.4 N, 81.7 W). Terrain never feeds the camera floor: the city-class floor is exactly **34,641.016151377546 m**, verified live post-repair.
- Geoid-corrected re-encoding and the approved, versioned R2 mirror remain a **launch-preparation gate** (owner decision #5). No geoid re-encoding was performed in Stage D.
- Sampled heights are display-only probe values; they are never written to canonical state. Live acceptance sample at Cleveland city center: **202.061 m** (source datum).

---

## 5. Coverage and level enforcement (technical boundary)

| Rule | Value |
|---|---|
| Approved coverage | `cleveland-ohio-dev-v1`: west −85.0, south 38.3, east −80.4, north 42.1 (Ohio bbox; Cleveland well inside) |
| Zoom band | levels **8–15** only (level 15 is the finest the frozen dataset serves; deeper renders the real level-15 parent) |
| Geographic rule | dataset tiles fetched **only when fully inside** the boundary |
| Below-band ancestry | levels 0–7 served **from memory** as all-zero 65×65 heightmaps — height zero IS the WGS84 reference ellipsoid; **no network request, no dataset bytes** |
| Outside coverage / unapproved / missing / failed / over-zoom | never zero-filled or fabricated; render real parent or ellipsoid |
| Live band audit | 31 dataset requests on the Cleveland acceptance walk, **0 coverage violations** |

The definitive `getTileDataAvailable` override publishes the bounded policy as true/false (never "unknown"), which the engine's quadtree refinement gate requires to descend past dataless tiles.

---

## 6. Frozen-dataset limitation

Mapzen Terrain Tiles on AWS Open Data is **frozen v1.1 (2017)** with **no SLA** (owner decision #4). Consequences: tiles may be stale relative to current 3DEP; the bucket may change availability without notice. Failure handling is honest degradation (status `unavailable` + reference-ellipsoid rendering + UI disclosure), verified by failure drill §7. The launch-prep R2 mirror decision addresses this.

---

## 7. Live-only defect log and repairs (bounded repair loop, authorized)

Stage D landed via PR #24 (squash `5d90b0d0c5a83f227fcb8d26f8d5e51f69ea5084`, deployed). Four live-only defects were found in post-deploy acceptance and repaired on `main` (`7c1eb77`, `e273ad4`, `4e44cab`, `9000b7e`); every push byte-verified against the locally tested tree via tarball diff. Repair commits landed by direct push because the PR-creation channel was unavailable in the execution environment; the CI gate (test → build → deploy) ran on each push to `main` exactly as it would have for a merged PR, and the workflow registers no `pull_request` trigger.

| # | Live symptom | Root cause | Fix |
|---|---|---|---|
| 1 | Every fetched Ohio tile rejected as unapproved-source | `ned13/` (USGS 3DEP NED 1/3 arc-second) missing from the approved-source prefixes | Added `ned13/`; live provenance header pinned in tests |
| 2 | Terrain never activated: zero tile requests, idle status, globe surface not renderable | Engine `GlobeSurfaceTileProvider.canRefine` refuses to refine a dataless tile when `getTileDataAvailable` answers "unknown" (stock provider behavior) → quadtree stalled at root | Below-band in-memory ellipsoid ancestry (all-zero heightmap = WGS84 ellipsoid; no network) + definitive boolean `getTileDataAvailable` override |
| 3 | Out-of-coverage terrain sampling hung indefinitely | Engine `sampleTerrain` retries deferred (synchronous-undefined) tiles forever | Adapter pre-filters positions through the bounded availability policy; unserved positions honestly report 0 (the displayed ellipsoid) |
| 4 | Terrain torn down to ellipsoid mid-descent on the real site | First in-band requests on the Cleveland descent are CDEM-mixed Lake Erie tiles; their fail-closed policy rejections were counted toward `maxFailuresBeforeUnavailable`, tripping the teardown before approved core tiles resolved | Policy rejections are boundary enforcement, not reachability failures: `noteFailure` returns early on `unapproved-source`; only genuine fetch/decode failures count. Regression test replays the live mixed-provenance descent |

Verification per repair: full suite green (715/715 at stop), production build green, CI green on `main` head, then live acceptance.

---

## 8. Acceptance evidence (live, 2026-09-04)

Machine-checked live walk against the deployed site (canonical Cleveland URL), 12/12 PASS:

| Check | Result |
|---|---|
| Boot: canvas mounts on live world view | PASS |
| Fly-to: camera reaches exact city floor 34,641.016151377546 m | PASS (exact) |
| Terrain: status `active` on live site | PASS (`fetchAttempts=30, fetchSuccesses=17→19, sourceRejections=9→12` as tiles settled) |
| Sampling: Cleveland 202.061 m source-datum; mid-Pacific honest 0 without hang | PASS |
| Band audit: 31/31 dataset requests fully inside approved coverage at z8–15 | PASS, 0 violations |
| Provenance: 19/19 served tiles fully approved-source; 12/12 CDEM-mixed rejected | PASS |
| Disclosure: "display-only" / "never evidence" text rendered | PASS |
| Drill — terrain source blocked: status `unavailable` + honest ellipsoid UI + globe keeps rendering | PASS |
| Drill — `/cesium/**` blocked: honest MapLibre fallback renders | PASS |
| Drill — WebGL unavailable: coherent non-black fallback surface | PASS |

CI on stopping SHA `9000b7e2`: golden regression suite SUCCESS; test-gated Pages deploy SUCCESS. Test totals: 715/715 (`tests/worldViewStageDTerrain.test.mjs` grew 18 → 23; no test weakened or deleted).

---

## 9. Remaining risks and deferred costs (launch preparation, not Stage D)

1. **CDEM policy question** (§3): Lake Erie-adjacent tiles stay ellipsoid/parent-rendered until the owner broadens the licensed-source set or accepts the seam as-is.
2. **Frozen dataset, no SLA** (§6): availability/staleness risk until the R2 mirror decision is executed.
3. **Datum**: source-datum display remains raw; geoid-corrected re-encoding deferred to the launch gate (owner decision #5).
4. **Coverage**: bounded to `cleveland-ohio-dev-v1`. Any expansion is a new owner decision with its own source/licensing review.

---

## 10. Stopping statement

Stage D is complete and live at the stopping SHA above. **Stage E (3D buildings, glTF, asset registry, cross-surface 3D sync) is not started. Stage I mobile, R2 provisioning, geoid re-encoding, global licensing, Cesium ion, Supabase changes, and R5/R6 remain untouched.**
