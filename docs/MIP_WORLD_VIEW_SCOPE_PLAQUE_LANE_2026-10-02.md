# World View scope plaque and selected reader — 2 October 2026

Implemented on `codex/mip-launch-plaque-20261002`, based on the qualified corrective source `78541e522bae4b0db0256c5941f70f2ea6cfbede`. This is a bounded frontend source lane. It does not authorize merge, deployment, release, provider activation, protected mutation, or spending.

The owner decision record supplied through Library (`libfile_720892b4771c8191a3216a89362f7028`) resolves the compact near plaque → explicit selected reader → Inspector interaction. The prior World View work plan (`libfile_249b861f9e84819193b8fa1ba925cc7f`), realism reconciliation (`libfile_faf64a8bf8608191902d59c249926ffa`), and register (`libfile_953c9013cec08191be2e9bef847b753f`) retain their earlier technical receipts and remaining source, device, appearance, and release boundaries. No prior gate was reopened or relabeled as release acceptance.

## Implemented interaction

The existing far icons/group chooser and approach ribbons remain the starting affordances. The closest legal camera view can show a compact scope plaque for a supplied city, area, or facility record. Tapping a native singleton invokes the existing selection callback with the retained original row. The explicit selection opens one viewer-relative reader, with its tether following the projected canonical anchor during orbit. Close dismisses the reader and restores an extant opener's focus without clearing the canonical selection or changing recorded time. Tapping the native marker reopens the reader. Open Inspector closes the compact reader and routes to the existing Inspector/context surface. Atlas retains the existing spatial context card and explicit member chooser.

The native scope plaque and the selected reader both disclose `city/area/facility scope · not exact position`. The reader identifies the coordinate as a representative scope anchor, rather than a surveyed feature or building. No uncertainty radius, building attachment, new evidence position, source fact, or domain module is inferred from a Point or proximity. Only explicit supplied module payloads retain their existing admission contract.

## Precision-derived density boundary

The physical distance bands remain **near 1,200 m**, **far 12,000 m**, and **12% hysteresis**, bounded by the existing 15% maximum. The minimum supported facility camera floor remains **8,660.254 m**. Consequently, the old physical near band remains unsupported by the actual canonical precision classes. This implementation does not claim otherwise or move its thresholds.

Scope density has a separate boundary derived from the existing admitted class floor:

- A fresh supported city/area/facility scope plaque enters only when the raw live camera height reaches that class's existing legal floor, allowing a numerical tolerance of at most `max(1e-6 m, floor × 1e-10)`.
- A retained scope plaque can remain while the camera moves outward to `floor × 1.12`; thereafter the original physical icon/ribbon bands resume.
- A lower caller-supplied floor cannot waive the canonical class floor. A stricter supplied floor is preserved.
- Missing/unknown precision, an unavailable or below-floor raw camera height, and coarse country/region classes cannot acquire a scope plaque. The physical near state falls back to a ribbon where appropriate.
- Dataset/coordinate/precision changes invalidate runtime distance memory. An incompatible precision change cannot inherit a former scope plaque's retained band.
- Importance changes priority for bounded display admission, not evidence precision or the density thresholds.

The existing `worldViewPrototype=1` rollout gate remains necessary to enable native billboard mode. The pure legacy distance fixture contract remains supported without being promoted to admitted-record precision qualification.

## Canonical anchor, source terrain, and occlusion

The production adapter removes the guessed 18 m native display stem. It reads only a height already available from the renderer-owned globe at the admitted lon/lat. That observed background height supplies the native glyph's DISPLAY surface position; absent or failed samples retain the reference ellipsoid. It does not request or admit new source bytes, modify any row coordinate, claim an evidence elevation, or assign a terrain datum to the record.

Display grouping and native painted bounds use the sampled display surface projection. The selected reader and tether retain the separately projected canonical coordinate. The source-ground sample and canonical coordinate remain separate, including when the canonical reference point is beneath displayed terrain. Globe ray intersection tests report center terrain occlusion; a failed test suppresses the native target. GPU depth testing remains enabled (`disableDepthTestDistance: 0`) for the full glyph. The selected reader retains its tether and explicit canonical occlusion cue when a native target is hidden. No unselected glyph is made visible through geometry.

Native singleton paint admission reserves the existing top controls and bottom credits, bounds plaques to four, ribbons to ten, and singleton targets to twenty-four. Overflow downgrades to compact icons or is omitted; coordinates are never relocated. Existing display groups and their explicit current-member chooser remain authoritative for grouped originals. The current visible row controls remain the accessible route to omitted singleton targets. The selected reader uses the existing safe envelope and bounded 24 CSS-pixel relocation controller across orbit, resize, portrait, and landscape.

## Qualification

Local Node **24.19.0** and **22.23.3** each pass **519 World View checks**, with zero failures, cancellations, skips, or todos:

```sh
node --test tests/worldView*.test.mjs tests/worldMapCanvasRealismLifecycle.test.mjs
```

The final lane adds thirteen regression checks: three precision/density cases, two native display contracts, two actual-adapter cases with real Cesium math and owned renderer doubles, and six mounted reader/WorldView cases. They cover legal floor entry and retained exit, below-floor/unknown/coarse rejection, preserved physical thresholds, immutable coordinates, source-ground/display separation, actual original-row native picking, one reader, Inspector and close/reopen, stable orbit tether, precision/record/time resets, portrait/landscape, center terrain occlusion, explicit cluster member selection, Atlas binding, reduced motion, hidden/resume attachment sampling, stale model rejection, and complete frame/listener/handler cleanup. Existing World View precision, clustering, clock, fallback, resource, lifecycle, and accessibility checks also pass in that focused run.

Production builds pass on both runtimes. Node 24 and Node 22 build logs are retained locally at `/tmp/mip-plaque-build-node24.log` and `/tmp/mip-plaque-build-node22.log`; focus logs are `/tmp/mip-plaque-worldview-node24.log` and `/tmp/mip-plaque-worldview-node22.log`. These are local execution receipts, not CI or independent review receipts.

The two native-adapter checks execute the actual application adapter with real Cesium math, deterministic source-height/terrain-intersection doubles, and owned renderer objects. The mounted reader/WorldView checks execute real UI callbacks with recorded SDK fixtures and supplied projected pixels. They establish source behavior, not real GPU depth, actual provider terrain heights, live credentialed accounts, lawful newly admitted bytes, or device performance. The isolated synthetic billboard scene and its historical appearance evidence are separate from this production-adapter delta.

## Remaining gates

Exact integrated CI and independent source review belong to the coordinator's coherent candidate. Controlled browser pixels, real GPU depth and final appearance, real source imagery/terrain/geometry admission, and physical iPad/iPhone/desktop evidence remain required before owner launch acceptance. The current physical near 1,200 m combination remains unsupported; the new scope plaque qualifies the precision-derived density transition only. The earlier cold-portrait performance result and its original threshold remain unchanged. Merge/deploy/release, provider rights and authority, global/provider accounting, and protected backend installation remain separately gated.
