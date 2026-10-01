# World View source reconciliation and pilot bookmarks — 1 October 2026

This bounded frontend package starts from accepted main `39fdab77fc75736c57f2eb3a9b8500456ea27eae` on `codex/world-view-realism-20261001`. It adds renderer-neutral display metadata and camera fixtures. It does not admit imagery, mesh, elevation, credentials, paid access or an analytical dataset. PR191 repair/release, backend consolidation and owner release decisions remain separate. The coordinator records the integrated candidate head and runtime evidence.

Authority: the authorized Library text in `MIP_World_View_Work_Plan_Updated_2026-10-01.docx.parsed.txt` and `MIP_World_View_Realism_and_Zoom_Plan_Updated_2026-10-01.docx.parsed.txt`, including available October 1 owner amendments; README; current source; and [the September 29 successor closeout](WORLD_VIEW_SUCCESSOR_2026-09-29.md). The source determines present implementation. The supplied mobile stills establish appearance and differing camera states; this package does not independently claim their runtime provider, build identity, motion, hardware or capture dates.

## Current source contract

| Surface or capability | Reconciled state | Evidence and limit |
| --- | --- | --- |
| Globe | ACTIVE only when explicit readiness is supplied | Existing `ellipsoid-globe` renderer, separate from source loading. |
| Globe imagery | Cartographic OSM raster configured; loading UNKNOWN unless explicitly observed | `worldViewCesiumEllipsoidRendererAdapter.js` creates `UrlTemplateImageryProvider` for `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, maximum level 19, then passes an explicit `ImageryLayer` as `baseLayer`. No photo source or 3D tileset is created. Maximum level is a configuration bound, not measured geographic resolution. |
| OpenFreeMap fallback | Cartographic vector source configured; loading UNKNOWN unless explicitly observed | `worldViewMapStack.js` points to the Positron style. The broader stack attribution is not proof that the globe actively uses OpenFreeMap. |
| OSM fallback | Cartographic raster source configured; loading UNKNOWN unless explicitly observed | MapLibre's OSM style uses the same public raster endpoint and maximum zoom 19. |
| Atlas | FALLBACK when explicit overview readiness is supplied | Static Natural Earth via world-atlas 110m. It does not render the approved elevation or photographic texture. |
| Elevation | ACTIVE only for globe readiness plus `status: 'active'` and integer `fetchSuccesses > 0` | The bounded provider reports a successful approved fetch/decode. This confirms provider activity, not coverage at every displayed pixel. |
| Elevation before first success | AVAILABLE BUT INACTIVE | Below-band ancestry is in-memory reference ellipsoid. Attempts, failure counts and rejected source headers do not establish source terrain. |
| Elevation unavailable | FALLBACK | Explicit `status: 'unavailable'` takes precedence over stale success counters. The adapter degrades to its reference ellipsoid. Cause is unknown unless separately observed. |
| Elevation on map/atlas | AVAILABLE BUT INACTIVE | These fallback renderers have no admitted elevation layer. Stale globe terrain counters must not activate it. |
| Buildings/facades/extrusions | NOT IMPLEMENTED | No source or implementation exists in these renderers. Photographic imagery and genuine textured facade detail are SOURCE-DEPENDENT. |
| Photoreal control | PREFERENCE ONLY | `worldViewVisualFidelity.js` stores display intent and resolves individually supported effects. A checked master, preset or effect is not source admission or source loading. |
| Capture dates and historical background correspondence | UNKNOWN | Neither tile configuration nor provider status supplies a verified capture date. Dataset release/version is not local capture time. Background dates must not be copied from evidence time. |

The provider is technically bounded to `west -85.0, south 38.3, east -80.4, north 42.1`, and levels 8–15. Only dataset tiles fully inside the approved Ohio rectangle are fetched. Frozen Mapzen Terrain Tiles v1.1 (2017) is delivered through the existing AWS endpoint; source headers must match approved USGS NED/3DEP, SRTM, GMTED2010, NOAA ETOPO1 or NRCan CDEM prefixes. Source-datum elevation is displayed raw, rather than claimed as WGS84 ellipsoid-referenced evidence altitude. Per-tile capture time and local resolution remain unestablished here.

Below level 8, reference-ellipsoid ancestry is generated without fetching dataset bytes. Outside coverage, rejected/missing data and over-zoom behavior use a real parent or the reference ellipsoid; missing source data is not fabricated. Genuine failures before any success can report unavailable. Source-policy rejections increment failure/rejection counters but do not trigger provider unavailability. The first successful tile emits `status: 'active'` with `fetchSuccesses: 1`; there is no `status.success` boolean. The callback is not a continuously refreshed per-viewport coverage feed.

Attribution remains on the existing expanded copyright surfaces and below-canvas terrain disclosure, including Canada licence text. The resolver supplies display descriptions; it does not replace those rights notices. New lawful-source research and admission belongs to the coordinator's separate source package.

## Olive/tan treatment

`worldViewCesiumTerrainReliefShading.js` alpha-blends an elevation-derived material over cartographic imagery. Its clamped source-datum range is 0–600 m, peak strength 0.45, fade band 25 m, and low/mid/high ramp colors are `(0.13, 0.42, 0.20)`, `(0.55, 0.44, 0.27)`, `(0.85, 0.83, 0.80)`. Geometry is not exaggerated, recolored data is not a photographic texture, and alpha is zero on the reference ellipsoid.

The successor closeout's controlled same-camera comparison reports relief as the major olive/tan wash contributor, distinct from park greens already present in OSM imagery. Those are retained historical observations, not newly reproduced runtime evidence in this package. Approved coverage and parent-tile behavior can produce an edge, but source inspection does not diagnose the cause of each owner's still-image boundary or dark northern oval. No edge smoothing, palette change, terrain bug repair or mobile touch claim is made here. Matched covered/uncovered/missing-data land and water views remain a runtime qualification step.

## Resolver interface

`resolveWorldViewSourceStatus({ stackId, rendererReady, terrainStatus, requestedProfile, imageryStatus })` returns frozen detached JSON metadata:

```js
{
  renderer: { id, label, status, detail },
  requested: { enabled, preset, status, label, detail },
  imagery: { status, label, detail, source, captureDate: null,
    kind, availability, photographicStatus: 'SOURCE-DEPENDENT' },
  elevation: { status, label, detail, source, captureDate: null },
  buildings: { status: 'NOT IMPLEMENTED', label, detail, source: null, captureDate: null },
  sourceCapture: { status: 'UNKNOWN', label, detail },
  background: { label, detail }
}
```

`requestedProfile` accepts the existing display profile's `enabled` and `preset` fields. Missing preference remains unknown. `terrainStatus` accepts the existing detached provider snapshot. `imageryStatus` is optional explicit runtime observation with `status: 'active' | 'loading' | 'unavailable' | 'unknown'`; ready renderer alone leaves tiled imagery UNKNOWN. Active imagery observation describes the configured cartographic source, never a caller-invented photo source. No tile sampling, network, storage, renderer object, camera mutation or evidence mutation occurs inside the resolver.

The display status vocabulary is ACTIVE, AVAILABLE BUT INACTIVE, PREFERENCE ONLY, FALLBACK, SOURCE-DEPENDENT, NOT IMPLEMENTED and UNKNOWN. FALLBACK describes the selected stack or explicit terrain degradation; it does not infer a hardware or initialization failure. Background detail always remains context, with unchanged evidence precision and no claimed correspondence to investigation time.

## Reproducible camera poses and return journey

`createWorldViewPilotBookmarks({ coordinate, precisionClass })` receives the selected projection row's coordinate dynamically. It returns four frozen records; invalid or absent coordinates return an empty frozen array. No Cleveland location is invented and no canonical row is copied into display state.

| Stable ID | Requested ellipsoid height | Heading | Pitch | City acceptance |
| --- | ---: | ---: | ---: | --- |
| `globe` | 20,000,000 m | 0° | −90° | Requested height |
| `regional` | 750,000 m | 0° | −90° | Requested height |
| `city` | 60,000 m | 0° | −90° | Requested height |
| `close-oblique` | 12,000 m | 25° | −45° | Existing 34,641.016151377546 m floor |

All poses use roll 0° and the shared `makeCameraState`/`serializeCameraState` contract. The three nadir views place their camera above the supplied coordinate; close oblique offsets only the camera geographically opposite its heading so the camera faces the selected point. Every record's frozen `pointOfInterest` array retains the exact input coordinate. Each record contains `{ id, label, cameraState, pointOfInterest, cameraGroundOffsetMeters, requestedHeightMeters, acceptedHeightMeters, precisionClass, minHeightMeters, heightConstrained, disclosure }`. `cameraState` is the existing version-1 JSON string. Unknown/null precision follows the existing camera-state policy; no new floor or precision upgrade is introduced. The close oblique label denotes a constrained comparison pose, not building-level inspection or visible facades.

The offset uses accepted height, depression angle from pitch and the existing public camera radius `EARTH_SEMI_MAJOR_METERS = 6378137`. A spherical ray/surface intersection supplies the ground arc; a spherical destination calculation travels from the point of interest on bearing heading + 180°. For a test point `[-81.7, 41.4]` at city precision, camera position is approximately `[-81.87504336248605, 41.1170656791099]`, surface arc 34,735.774338230025 m, height 34,641.016151377546 m, heading 25°, pitch −45°. That example is display framing, not a replacement canonical coordinate or a surveyed camera. The disclosure explicitly says “Spherical approximation for camera framing only.” Ellipsoid flattening, terrain and heading convergence are not exact in this approximation; the coordinator's actual browser checks must establish that the selected point remains within the viewport.

The longitude wrap can produce tiny floating-point roundoff in serialized display state; canonical coordinate fields remain exact and unchanged. These camera positions do not promise a terrain look-at-target equivalence. Existing adapters revalidate against the current selected row's precision when applying a bookmark, including precision updates after initial construction. MapLibre's existing Mercator latitude/pitch and approximate meter-scale bridge govern its fallback acceptance.

The reversible journey is: retain `getCameraState()` with the current framing target key in existing session-local camera memory; apply globe → regional → city → close oblique through `setCameraState`; reverse the sequence; use existing Stop flight; restore the retained pose; and use existing forced subject framing for Reset. Same-target restoration suppresses redundant fly-to, while a different subject or precision frames itself. Graphics settings remain independent from those poses. Canonical object/version, source row, coordinates, time and privacy state are not bookmark fields and must survive each UI transition.

Mobile contracts remain the existing explicit interaction gate, page scrolling outside interaction, expanded attribution, accessible evidence access and remembered camera. The October 1 Explore concept requires preserved selection/time/context on entry/exit and a compact preview plus expandable context sheet. This package does not change layout, gestures or context-card composition. Physical iPad/GPU performance, WebKit drag, WebKit MapLibre wheel, ground collision, clipping, underneath-camera regression and continuous motion require separately named runtime evidence; Node fixtures do not qualify them.

## Validation and remaining evidence

Passed after the oblique point-of-interest correction: `node --test tests/worldViewSourceStatus.test.mjs tests/worldViewPilotBookmarks.test.mjs tests/worldViewCameraStateStageC.test.mjs tests/worldViewCameraMemory.test.mjs tests/worldViewCameraFraming.test.mjs` — 52 tests, zero failures. The 14 new tests cover conservative source status, stale/fallback snapshots, finite precision-constrained poses, offset direction/range at accepted height, exact immutable point of interest, dateline/pole state validity and detached forward/reverse/stop/reset/return coordination with exact canonical/time input preservation. The remaining 38 are existing camera-state/memory/framing regressions. Finite pole states do not qualify pole look-at accuracy.

Initial targeted run: 10/12 passed, with two strict serialized-longitude equality assertions failing because the existing shared wrap returns approximately `-81.69999999999999` for `-81.7`. The tests now use the existing 1e−6-degree camera comparison contract and retain exact canonical input comparison. No camera contract or canonical field was changed to hide that limitation.

Coordinator runtime review subsequently identified that the original close-oblique pose, directly over the selected point while looking at −45°, could look away and put the point outside the viewport. The display-only geographic offset addresses that framing deficiency while retaining the heading, pitch, precision floor and original point of interest. Node tests establish the offset calculation and unchanged data; runtime viewport acceptance remains the coordinator's responsibility.

Not exercised by this worker: browser integration, new screenshots, actual tiled imagery success/error observation, matched tint-boundary journeys, terrain geometry registration, device/network performance, idle traces, hosted candidate, live release and physical touch hardware. No build, install, asset activation, backend work, commit, push, merge or deployment occurred in this package. The worker was configured as GPT-6.1 Sol by the delegated tool request; underlying model telemetry was not independently exposed or measured.

Next coordinator action: bind the detached runtime snapshot to concise source UI, keep tiled imagery unconfirmed until observable tile-loading evidence exists, apply bookmarks via existing display seams, and qualify affected UI journeys on the integrated exact head. Detailed close facades remain gated on an admitted substrate; requested visual fidelity cannot satisfy that gate.
