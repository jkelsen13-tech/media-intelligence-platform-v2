# VF-2 bounded render resolution qualification

Base b2d7c569534d3e7158f421fa2c50d01c77d98614. Custom Image Quality offers
0.75x, neutral 1.0x and 1.25x. Every preset and initial profile remains 1.0x.
Lower resolution may soften labels; 1.25x uses about 56% more framebuffer pixels.
This changes rendering, not source detail, geographic precision or evidence.

The fixed allowlist rejects strings, nonfinite numbers and arbitrary scales.
Master/category OFF and unsupported renderers resolve to 1.0x while preserving
the selected value. Returning to the globe reapplies the remembered setting.
The image-quality mixed state includes non-neutral resolution.

Exact locked Cesium 1.145 Viewer.resolutionScale and resize are used. The existing
useBrowserRecommendedResolution=true policy remains required and unchanged;
devicePixelRatio is never multiplied into the setting. The viewer/canvas is reused,
a render is requested only on a change, and requestRenderMode is preserved.
A rejected application is latched unavailable and attempts neutral cleanup.
No camera, clock, route, selection, geometry, terrain policy or evidence writes.

Primary source:
https://github.com/CesiumGS/cesium/blob/1.145/packages/widgets/Source/Viewer/Viewer.js
https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Widget/CesiumWidget.js

Unit qualification covers bounds, neutral presets, memory, unsupported policy,
idempotence, exact viewer/canvas reuse and rejected writes. Preview/live checks
measure actual buffer sizes at both widths in Chromium/WebKit, preserve exact
camera/route, compare same-camera screenshots, count terrain/imagery requests,
exercise gates/remount and the full no-WebGL fallback. Physical-device performance
and preset membership remain pending; software-browser timings are not GPU benchmarks.

MapLibre screenshots now wait for network idle plus a settling interval and
retain response/cancellation diagnostics, following the previous live capture gap.
No payload or test fixture is written to production sources.

No dependency/provider/backend change is made. Collector output/acknowledgement
generation fencing, operational parity, Auth/external runtime and spatial history
remain prerequisite work; no legacy backend is SAFE TO RETIRE. Markets typed asset
history, trusted publication/rights readers and real stock/crypto paths are still
pending. Sun/atmosphere, refinement, shadows/AO and sharpening remain separate
qualification work. Full current-head tests, preview and postmerge live checks
are required; this document does not assert those checks already passed.
