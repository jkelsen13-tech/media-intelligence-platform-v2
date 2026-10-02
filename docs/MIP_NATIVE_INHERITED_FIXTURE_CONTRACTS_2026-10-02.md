# Inherited native fixture contracts — 2026-10-02

Exact-source public CI run `37075731275` for
`b829d0fe9f92ebe47d8572da817d22f5a92f3843` reported four failures on each
Node runtime in three inherited test files. This bounded successor repairs those
test contracts. It changes no production source, dependency, source manifest,
backend, or native lifecycle behavior.

The unchanged local baseline reproduces all four failures on Node 22.23.3 and
24.19.0: 25 cases, 21 passing, four failing, no skips. Both original RED TAP
files and all three before-test snapshots are preserved outside source at
`/workspace/mip-native-inherited-fixture-contract-evidence`. The parent retains
the raw public CI logs separately; their hashes are recorded in the final receipt.

`worldViewBillboardNativeAdapter.test.mjs` previously counted every invocation
of its fake element's `remove()` as another host removal while always reporting
`isConnected: true`. Production detaches its owned host promptly and may repeat
the safe DOM removal during native finalization. The fixture now models an
initially detached element, connection by `appendChild`, and one connected-to-
detached transition. It still requires exactly one host detachment after repeated
adapter destruction, and explicitly checks connection before cleanup and
disconnection afterward. Native Viewer/handler destruction, listener release,
empty markers, terrain occlusion and canonical tether assertions remain intact.

`worldViewCameraStateStageC.test.mjs` required the dispatcher's old unguarded
get/set passthrough syntax. Its production API now gates those methods after
destruction even when a failed native implementation survives for retry. The
test executes the actual dispatcher for both MapLibre and globe branches,
requires exact delegation while alive, then requires `null`/`false` with no
implementation calls after `destroy()` returns false. A later successful retry
still leaves the camera unavailable. Existing renderer source checks for shared
camera parsing, precision limits, MapLibre `jumpTo`, globe clone and `setView`
remain unchanged. No regex is widened to accept arbitrary camera behavior.

Two `worldViewReadyPublication.test.mjs` Canvas mocks omitted
`getSourceImageryState`; their void destructors also could not establish healthy
teardown. Canvas correctly rejected registration before those mocks could mount.
Each mock now owns an independent destruction flag, exposes typed zero-resource
state and returns strict `true` from idempotent cleanup. The existing assertions
still require current FXAA controls before camera framing, observer publication
outside delivery, one frame for a burst, the latest presentation, and refusal of
stale frames and callbacks after unmount. The observer case additionally verifies
once-only destruction and the released zero-resource state.

Final qualification passes all 25 cases on Node 22.23.3 and 24.19.0, with zero
failures, skips or React cleanup warnings. No case is removed or skipped and no
expected host-removal count is relaxed. These tests use controlled lifecycle
inputs and do not claim native GPU or browser pixel evidence. The exact commit,
tree, test/receipt hashes and unchanged production source-tree binding are in
the outside-source `qualification.json`.

Parent-owned source manifest regeneration, exact-source full CI and targeted
rereview remain separate gates. Historical held-candidate review and prior source
gates remain intact. This follow-up does not run a browser, admit a source,
activate a provider, use paid services, modify protected/live state, dispatch
Cursor, merge, deploy or release.
