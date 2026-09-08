# Visual Fidelity VF-1

## Reconciled baseline and failure

Base d3d0066010a7166ccdc546f6d0167e693a268801. WorldView unmounts WorldMapCanvas
in Graph mode. Its old useState(true) relief choice therefore reset on return.
The root invariant is that preferences belong above transient renderers.
WorldView now owns a serializable version-1 session profile; Map/Graph/Split
remounts consume its latest value. Leaving World View or reloading resets it.
No persistent settings or evidence cache is added.

Exact lockfile: cesium 1.145.0, Apache-2.0. Existing shader/provider remain.
Version-matched official source:
https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/Globe.js
documents the material setter and marks shaders dirty only on material change.
No new vendor API or dependency is introduced: the existing material helper
and scene.requestRender are reused. Repeated effective settings no longer
recreate the material/request another frame. Camera, imagery, terrain provider,
projection rows, time, selection and privacy admission are unchanged.

## Profile and capabilities

Fields: version, enabled, preset, categories. Five categories contain enabled
gates and remembered approved leaves. Unsupported versions normalize to off;
nonboolean truthy values cannot activate effects; unknown fields are stripped.
Manual leaf/category changes select Custom. Master off retains preset/children.
Categories retain child choices. Capabilities are separate runtime metadata,
never part of canonical evidence or a persisted profile.

| Preset | Relief | New leaves | Resolution/refinement |
| --- | --- | --- | --- |
| Initial Custom | On (existing presentation) | Deferred/off | Existing neutral |
| Performance | Off | Deferred/off | Existing neutral |
| Balanced | On | Deferred/off | Existing neutral |
| Maximum | On | Deferred/off | Existing neutral |
| Custom | User choice, gated | Deferred/off | Existing neutral |

Balanced and Maximum intentionally coincide until later measured effects pass
their gates. Neither becomes the default. Maximum does not bypass capability,
source or measurement gates. UI states this limitation explicitly.
Neutral resolution is 1.0x as a reserved profile value, not a new renderer write.

Only existing MIP relief is implemented. Lighting, atmosphere, FXAA, refinement,
resolution enhancement, shadows, AO, sharpening and materials remain deferred.
The panel uses checkbox semantics, expandable categories, mixed-state support,
44px label/control targets, focus outlines and bounded mobile layout.
Unchecked unavailable leaves never imply active fallback rendering. Master and
category gates preserve remembered configuration. Terrain unavailable/renderer
failure reports capability loss and gates relief; fallback preferences survive.

## Verification contract

New pure tests exercise defaults, deterministic presets, invalid/foreign fields,
nonmutation, remembered state, mixed categories, unavailable capabilities and
latest-profile startup replay. Existing shader tests follow the moved checkbox
while preserving material/source/precision assertions. All existing World View,
camera, fallback, pipeline and evidence tests remain required.

runVisualFidelityBrowser.mjs uses real eligible Cleveland geography in Chromium
and WebKit at 1280/390px, same-camera master toggles, canvas identity, remembered
leaf state through Map/Graph/Map/Split, deterministic presets, deferred leaves,
keyboard control, no horizontal overflow, same subject/time route, backend
boundary and screenshot evidence. It reports software-browser interaction time
and request counts; these are not physical-device GPU benchmarks or a reason
to activate expensive effects. Preview and postmerge results must be recorded
on the PR before this wave is described as verified live.

## Remaining work

VF-2 needs version-matched built-in API proof and same-camera/runtime/physical
device measurements before any default changes. Terrain refinement/fog require
request-volume qualification. VF-3/4/5 and all Markets/provider gates remain.
Backend consolidation is incomplete: active Manus collectors, Auth, spatial
history, external runtime and positive authorized journeys still need closure.
No project is proven safe to retire. This batch makes no database writes.

## Navigation lifecycle reconciliation

WebKit diagnostics traced an intermittent navigation failure to the MIP terrain
PNG decoder, not Cesium worker startup. Terrain requests previously outlived
their viewer. Provider teardown now aborts its owned fetches and checks the
abort signal before decoding late response bodies and accepting decoded data.
Teardown does not count as source unavailability. A pending-body regression
proves no late decode/status mutation or new callback work after destruction.
Browser error assertions remain enforced; CI must validate the observed journey.
