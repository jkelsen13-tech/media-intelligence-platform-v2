# VF-2 first slice — optional FXAA

The Image Quality category now offers FXAA edge smoothing in Custom settings.
It is OFF initially and in Performance, Balanced and Maximum. Master/category
gates retain its preference, including Map/Graph/Map remounts. The UI warns that
smoothing can soften labels. This does not add source detail or evidence.

## Exact-version API and ownership

The lock remains Cesium 1.145.0 (Apache-2.0), with no dependency changes.
Version-matched official source:
- https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/PostProcessStageCollection.js
- https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/PostProcessStage.js

The public scene.postProcessStages.fxaa stage exposes enabled and ready. It starts
disabled. Its collection owns disposal. MIP sets enabled on that same stage,
requests a render only for a real change and allocates no additional pass.
Missing/destroyed stages are unavailable. A failed write stays unavailable for
that renderer instance; a later neutral cleanup cannot erase that failure.
Shader/render failure continues through the existing honest renderer fallback.

The adapter reports serializable enabled/ready state to the read-only acceptance
probe. No camera, selection, source, timeline, privacy or evidence fields are
written. requestRenderMode stays enabled; terrain refinement and resolution are
unchanged. FXAA is image-space processing, not a data request.

## Verification and limits

Tests cover strict boolean normalization, default/preset exclusion, remembered
gates, fallback masking, exact stage reuse, idempotent writes, request-render
preservation, destroyed/missing/rejecting stages and latched failures.

Preview and live acceptance run Chromium/WebKit at desktop 1280 and touch 390:
actual stage readiness, same-camera pixel pairs, unchanged canvas, recorded route,
master/category memory, Map/Graph/Map, fallback, keyboard controls and all existing
regressions. Request counts and screenshot evidence are recorded on the PR.
Software browser results do not substitute for physical-device GPU measurements.

Sun lighting, atmosphere, bounded resolution, terrain refinement, shadows, AO and
sharpening remain outstanding. Physical-device measurements are still required
before adding FXAA to named presets. Markets/provider and backend-consolidation
gates remain independently open. This batch makes no backend writes.
