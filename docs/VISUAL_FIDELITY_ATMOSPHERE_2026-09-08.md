# VF-2 ground atmosphere and visual haze qualification

Base: 12547a959f4f5e23bf1380e328a472e89aa96524. Ground atmosphere and distance
haze are optional Custom display effects. Initial profiles and every named preset
keep both OFF. The profile now explicitly controls the corresponding existing
renderer defaults; the sky backdrop remains separate and unchanged.

Only locked Cesium 1.145 public globe.showGroundAtmosphere and fog.renderable
properties are changed. The unlit globe is required; sun/dynamic-atmosphere
lighting remains deferred pending recorded-time qualification. No clock, light,
camera, selection, route or coordinate writes occur in an effect toggle.

Haze changes rendering only. fog.enabled, density, height policy, culling/SSE
and terrain coverage/refinement are preserved. Ground atmosphere is most visible
from space; haze is most visible toward the horizon. Both are stylized scattering,
not observed weather, historical sunlight, evidence or improved source precision.
A hidden master/category or fallback masks the actual effect and preserves its
preference. Rejected writes remain unavailable for the renderer lifetime.

Qualification includes strict booleans, preset neutrality, remembered gates,
failure latching and exact non-display state preservation. Browser checks use
same-camera before/after pixels, stable canvas/route, unchanged fog policy and
zero additional settled terrain/imagery requests. A disposable high camera tests
ground atmosphere; the local Cleveland view tests haze. Map remount must restore
both settings with visible loaded terrain. Full preview and live regressions
remain required; this document is not a claim that pending runs passed.

Primary sources:
https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/Globe.js
https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/Fog.js

No new dependency, data provider, fee, backend write or publication decision.
Physical-device measurements and preset tuning remain pending. Sun-directed
lighting, refinement, shadows/AO, sharpening and optional authorized persistence
remain separate gates. Markets needs trusted typed asset/evidence integration;
collector cutover needs generation-bound durable output/acknowledgement and
operational/history/Auth/external-runtime parity. No legacy is SAFE TO RETIRE.
