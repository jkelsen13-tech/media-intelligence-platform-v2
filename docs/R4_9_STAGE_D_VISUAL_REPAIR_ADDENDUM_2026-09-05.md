# Stage D terrain visual-continuity repair — closeout addendum (2026-09-05)

Addendum to `R4_9_STAGE_D_TERRAIN_CLOSEOUT_2026-09-04.md`. Prior defect
history is preserved below; nothing in the earlier closeout is retracted.
This addendum covers only the bounded, owner-authorized Stage D
visual-continuity repair: its defect, its repair, a post-deploy
investigation that cleared a suspected regression, and the post-deploy live
acceptance evidence.

## 1. Defect history (preserved)

- **Owner-visible defect (2026-09-04/05):** on the live World View, terrain
  around the Cleveland node was technically active but not visually legible
  at the enforced city camera floor — a normal user could not tell terrain
  from the flat ellipsoid. Additionally, CDEM-mixed Lake Erie-adjacent tiles
  were fail-closed rejected, punching a seam into the approved coverage.
- **Preflight evidence (2026-09-05, runs 02-10Z / 05-40Z):** live terrain
  status, accepted/rejected tile counts (12 CDEM-mixed rejections of 30
  attempts), exact `x-amz-meta-x-imagery-sources` headers, same-camera
  terrain-vs-ellipsoid captures, and the city camera floor verified
  byte-exact at 34,641.016151377546 m.

## 2. Repair shipped (PR #25, merged `d7665e2e`)

- `src/lib/worldViewCesiumTerrainReliefShading.js` (new): a restrained,
  labeled, height-derived relief tint (0–600 m, strength 0.45, 25 m fade)
  implemented as a Cesium globe material. Display-only; reads the actual
  approved terrain heights; no vertical exaggeration; no geometry, camera,
  precision-class, or canonical-state changes.
- CDEM admitted to the display-only allowlist only after primary-source
  verification of the Open Government Licence – Canada 2.0 (use,
  reproduction, redistribution, and commercial launch permitted; no
  payment/account/token; exact attribution sentence identified and carried
  in the UI disclosure and provenance text). CDEM heights stay source-datum,
  display-only, never evidentiary.
- UI: "Terrain relief shading" toggle (default ON) with an honest legend
  ("untinted areas are the reference ellipsoid or have no approved
  terrain").
- Tests: 723/723 including the new visual-repair suite (fabric contract,
  tint clamp, exact floor, no `terrainExaggeration`, governance-clean); CI
  golden suite green; test-gated Pages deploy green.

## 3. Post-deploy investigation — suspected regression cleared

After deploy, this sandbox showed a starfield-only globe and the 22-05Z run
recorded suspicion that the shipped material made the globe transparent.
Resolved with a minimal-repro matrix and Cesium 1.145 engine-source reading:

- `Material.translucent` is inert for globe rendering (referenced nowhere in
  the globe path of `@cesium/engine`; only `Material.js` and `Moon.js`).
- The sandbox blackholes `tile.openstreetmap.org` — connections hang beyond
  150 s without erroring — and stock Cesium holds globe tiles
  non-renderable until imagery resolves. Instrumented live state: level-0
  tiles `renderable=false`, zero tiles drawn, zero imagery errors. Removing
  the material at runtime changed nothing.
- With imagery failing **fast**, the globe renders its base color with the
  material attached; with **working** imagery, the tint blends over imagery
  exactly per the GlobeFS `alphaBlend(materialColor, color)` contract.

**Conclusion: no code regression was shipped; the deployed build is correct
wherever imagery resolves (including the owner's browser); no follow-up PR
was required.** The hanging-imagery behavior is pre-existing stock Cesium,
out of scope for this repair.

## 4. Post-deploy live acceptance (2026-09-05, run 23-55Z)

Ten labeled evidence items captured against the deployed site at the
canonical Cleveland URL (machine-checked; disclosed sandbox accommodation:
OSM requests aborted fail-fast because this sandbox blackholes the host;
terrain traffic real). Summary:

| Item | Result |
|---|---|
| Same-camera terrain-on (relief on) | PASS — globe region mean RGB ≈ (42, 50, 98) |
| Same-camera forced ellipsoid | PASS — mean RGB ≈ (1, 2, 127) |
| Visibly discernible terrain | PASS — relief-off is pixel-identical to the ellipsoid; relief-on differs by ≈ (+41, +40, −24), plainly visible |
| Pin unchanged | PASS — Cleveland, `coarsened_to_precision_class`, `city`, hash intact |
| Floor holds | PASS — exact 34,641.016151377546 m after a below-floor attempt |
| Requests within coverage | PASS — 32 requests, 0 violations |
| Approved headers only | PASS — 0 violations; `ned/`, `ned13/`, `srtm/`, `gmted/`, `nrcan_cdem/`; 30/30 fetches, 0 rejections |
| Terrain outage → ellipsoid | PASS — `unavailable` status + honest UI, globe keeps rendering |
| Cesium outage → MapLibre | PASS — stack advances to `openfreemap-positron`, canvas mounts, deep link preserved (global WebGL loss advances honestly to `atlas-fallback`) |
| Graph / Split / deep link unchanged | PASS — graph renders the node; split resolves with the pre-existing fail-closed notice; hashes preserved |

**Plain-language verdict:** the before/after evidence would let an ordinary
user see a meaningful difference. Unshaded terrain was indistinguishable
from the ellipsoid (pixel-identical); the repaired view carries a clearly
visible, labeled, height-derived tint, with a user toggle and an honest
legend.

## 5. Scope and stopping statement

Scope held: no Stage E, navigation polish, assets, buildings, glTF, Supabase
work, later-release-phase work, geoid re-encoding, object-storage mirroring,
global-terrain expansion, Cesium ion, or paid providers. Terrain remains
display-only, source-datum, fail-closed, and never evidence. The city camera
floor is unchanged. **Stop here: no further stage is begun.**
