# Mobile Explore World View prototypes — 1 October 2026

Status: bounded prototype implementation. **Owner visual choice is pending.** The default A layout is a starting point inside an explicit prototype gate, not an approved production direction. No hosting, provider, feed, backend, camera-policy, or geographic-precision changes belong to this candidate.

The October 1 Work Plan §20.5 calls for a nearly full-screen globe, compact essential controls, actual source/fidelity disclosure, collapsible evidence context, reliable page/globe gesture separation, and continuity of camera and canonical investigation/time state. Section 20.6 keeps source truth separate from requested graphics preferences. Major design alternatives require comparable screenshots and owner selection.

## Two reversible alternatives

| Prototype | Mobile arrangement | Evidence/context access | Controls |
| --- | --- | --- | --- |
| A — Immersive | The central viewport remains a full-width globe. | A compact preview anchors above native map credits and expands upward into a scrollable sheet. | Compact floating interaction/options row; options open a bounded panel. |
| B — Split dock | A narrow separate gesture/control rail frames the globe, with a dock below it. | Preview and evidence expansion occupy the lower dock; on wide screens evidence becomes a right-side dock. | Interaction/options sit in the side rail; options open beside it. |

Both use the same toolbar, recorded-time label, source footer, source attribution, camera, investigation, and evidence content. A/B selection changes CSS classes only. The map child and all its React ancestors stay in the same positions; no portal, changing map key, or alternate renderer tree is used. The source footer stays outside the map. A leaves 42 CSS pixels of clearance above the map's bottom edge for native credits. Full vendor credits remain inside the existing child renderer.

`Interact` grants globe gestures through the existing interaction callback. `Done — scroll` releases gestures so evidence/options/source panels can scroll. `Page` or `Close` returns to document flow and the recorded page position. Escape first closes options, then evidence, then releases active gestures, then exits Explore. Focus moves to Close on entry, remains inside the visible Explore surface while tabbing, and returns to the entry control on exit. Document/body overflow, ancestor scroll positions, and keyboard listeners are released during exit and unmount.

## Integration contract

Keep one `WorldViewExploreShell` mounted around the existing map/stage DOM, outside conditional Explore and direction branches. The existing map may still follow existing Map/Graph/Split behavior; the shell itself must not add a mode-related renderer remount.

```jsx
<WorldViewExploreShell
  prototypeEnabled={explicitPrototypeQueryGate}
  contextToken={{
    subjectKey: canonicalSelectedIdentity,
    version: canonicalInvestigationRevision,
    investigationKey: canonicalInvestigationIdentity,
    timeToken: JSON.stringify({ as_of_time, selected_time_range }),
  }}
  recordedTimeLabel={existingRecordedTimeLabel}
  cameraAdapter={{
    getCameraState: () => cameraControlsRef.current?.getCameraState() ?? null,
    setCameraState: state => cameraControlsRef.current?.setCameraState(state) ?? false,
  }}
  interactionEnabled={touchInteraction}
  onInteractionChange={setTouchInteraction}
  controls={existingFidelityAndCameraControls}
  status={actualActiveRendererAndSourceStatus}
  attribution={existingSourceDisclosure}
  preview={selectedSubjectPreview}
  context={existingEvidenceContext}
>
  {existingStableMapStage}
</WorldViewExploreShell>
```

`prototypeEnabled` defaults to `false`; only an explicit prototype route/query gate enables the entry and comparison controls. `initialDirection` can be `immersive` (default) or `dock`; changes during a visit are made by the visible prototype buttons. Optional `onExploreChange(boolean)` reports entry/exit. Optional `onRestoreResult(result)` reports restoration outcome. `interactionEnabled` is controlled when provided; without it the shell maintains local UI state, but integrations must supply `onInteractionChange` to gate the actual renderer.

`controls`, `status`, `attribution`, `preview`, and `context` are React nodes. Preserve the complete existing evidence fields, temporal meaning, precision and source limits in the context slot; pass actual active-source status rather than inferring it from graphics preferences. A missing recorded-time label displays “Recorded time unavailable.” Missing status/attribution does not make claims about active sources.

The controls slot owns one existing Visual Fidelity panel: it stays mounted and appears in document flow before the map while Explore is inactive; inside Explore it appears in the Options panel. Do not mount a duplicate panel outside the shell. Native inline `.wv-camera-controls` are hidden in Explore to free map space; the coordinator provides overview/cancel and other needed camera controls in the controls slot. Keep terrain source disclosure accessible in the source slot before suppressing any long inline terrain disclosure.

The production camera ref is supplied by the coordinator. Application code must not use the acceptance-only `window.__MIP_WORLD_VIEW_CAMERA_PROBE__`. No new camera/precision normalization is defined: the session imports the existing renderer-neutral camera parser/serializer and the adapter remains responsible for its existing safety constraints.

## Memory-only session API

`createExploreSession()` returns `enter`, `observe`, `exit`, `getSnapshot`, and `clear`.

- `enter({ cameraState, contextToken, scrollPosition: { x, y }, capturedAt })` captures the normalized serialized camera, immutable scalar context identity, page position and capture timestamp. `capturedAt` is epoch milliseconds and defaults to `Date.now()`. Repeated entry while active retains the original snapshot.
- `contextToken` requires explicit `subjectKey`, `version`, and `timeToken`, each a string, finite number, or explicit null. Optional `investigationKey` has the same scalar contract. Include every canonical inspection-time field in a stable serialized `timeToken`; missing fields are unsafe. Do not substitute a wall clock for the investigation's recorded-time token.
- `observe(contextToken)` latches invalidation on any identity/version/time change during the visit, even if fields later return to their old values.
- `exit({ contextToken, restoreCamera })` validates again at exit. A valid unchanged context restores the exact normalized earlier camera through the synchronous adapter callback, which must return `true` to report success. Stale/invalid context never invokes it. Exit never writes selection, Investigation Context, selected time range, recorded time, route, or hash.
- Result fields are `restored`, `reason`, `scrollPosition`, and `capturedAt`. Reasons include `restored`, `context-changed`, `invalid-context`, `invalid-camera`, `restore-unavailable`, `restore-rejected`, `restore-failed`, and `inactive`. Missing or failing renderer restoration is disclosed in the shell. Canonical drift keeps the new canonical state and current camera.
- `clear()` forgets the local snapshot. Unmount uses it and releases gestures without restoring a camera into a removed renderer.

There is no durable storage, network/provider call, global camera probe access, or stored copy of canonical rows. Direction switching does not capture a new session or reset its camera.

## Verification and comparable evidence

Run:

```sh
node --test tests/worldViewExploreState.test.mjs tests/worldViewExploreShell.test.mjs
```

The 18 passing tests cover normalized entry/exit snapshots, exact camera restoration, single-use restoration, invalid camera/context snapshots, subject/version/time drift, a drift-and-return excursion, synchronous adapter rejection/errors, gate removal, one renderer mount across entry/exit/A/B switches, Escape dismissal levels, entry/return focus, ancestor/document scroll restoration, and active-unmount cleanup.

The component test uses React's existing test renderer and a minimal document harness. It verifies component/state behavior, not Cesium touch reliability or real browser focus visibility. Browser/runtime evidence and screenshot capture belong to coordinator wiring.

For every A/B comparison, hold the subject/version/time, actual renderer/source tier, camera position/angles, map mode, viewport dimensions, evidence content, panel expansion state, and device/emulation class constant. Capture collapsed preview and expanded evidence at the same camera; verify native map credits remain visible. Include repeated enter/exit, switching A/B during interaction, invalid/stale restoration disclosure, options/evidence scrolling, and landscape/small-height bounds. Label browser-emulated mobile screenshots as emulated viewport evidence; they do not qualify physical-device touch, performance, loading cost, or motion.

The coordinator must complete comparable screenshots and owner review before selecting or locking a final direction. These prototypes do not qualify a photoreal source, building detail, historical background correspondence, or increased evidence-location precision.
