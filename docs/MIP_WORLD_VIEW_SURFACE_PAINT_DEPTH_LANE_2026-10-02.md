# Native surface paint depth candidate — 2026-10-02

Base `4f45432d0d7d55ba1b7dba0b5ebc49d78f2679a0`, branch `codex/mip-launch-plaque-depth-20261002`. Keyboard repair is separately frozen at `434610f1093e70887574aa4d6e811de9d7fb27cf`. The parent owns native browser qualification and `verifier/runWorldViewIntegrationSyntheticBrowser.mjs`.

The parent-provided software-Chromium/SwiftShader facility screenshot shows globe-colored triangular holes through a selected 180×56 scope plaque after closing its reader. The center pointer tap did not reopen it, while an opaque edge was functional. The retained probe reports current, unoccluded native admission, surface world position, `HeightReference.NONE`, and `disableDepthTestDistance:0`. This **suggests surface-coincident quad/globe depth interference**; screenshot inspection alone does not prove a universal GPU cause.

Original evidence stays outside the repository:

- `/workspace/mip-launch-receipts/browser-facility/failure.png`, SHA256 `b8406f92e9b210ee63c0463781acfbf63ed948556084b83f2af0febeee78a8a3`.
- `/workspace/mip-launch-receipts/browser-facility/failure-state.json`, SHA256 `792e85fef599097c6412366a6003325dddd948098b99a216aef5b5bb0d3eaf28`.

The bounded candidate sets the native billboard's `eyeOffset` to `(0,0,-0.5)` meters. [Cesium's official API](https://cesium.com/learn/cesiumjs/ref-doc/Billboard.html#eyeOffset) describes this as a separate eye-coordinate offset, with z pointing into the screen. The installed Cesium 1.145 shader `czm_eyeOffset` applies it after world-to-eye transformation and before screen-facing quad expansion; negative z biases paint toward the camera. Its declared `Billboard.position` remains the same sampled surface position. This changes paint geometry in eye space, not the canonical coordinate, world surface elevation, precision floor, tether, selected subject, recorded time, or distance/density policy. It introduces no vertical stem and requests no additional provider data.

The 0.5 m magnitude is bounded to the existing center-ray terrain occlusion tolerance. GPU depth testing remains enabled (`disableDepthTestDistance:0`), and the existing terrain-center/ellipsoid admission gate is unchanged. This is **not exact per-pixel occlusion equivalence**: very close depth coincidences inside that paint margin can change. Larger offsets or disabling depth are outside this candidate. The diagnostic probe adds a copied `eyeOffset` triple separately from the unchanged declared world position, so browser receipts can verify the actual paint setting without granting scene mutation.

Node **22.23.3** and **24.19.0** pass **18 focused native-adapter, billboard integration and scene lifecycle contracts**, zero failures/skips/cancellations. Enhanced actual-adapter tests assert the bounded eye offset, copied diagnostic output, unchanged sampled world position through orbit, unchanged canonical tether/precision floor, original-row picks, terrain occlusion suppression, and disposal. These tests use real Cesium math with an owned renderer double; they do not exercise raster depth or establish GPU center picking. Both final-source production builds pass, with the existing large-chunk advisory. Logs are `/tmp/mip-plaque-depth-tests-node{22,24}.log` and `/tmp/mip-plaque-depth-build-node{22,24}.log`.

```sh
node --test tests/worldViewBillboardNativeAdapter.test.mjs tests/worldViewBillboardIntegration.test.mjs tests/worldViewBillboardScenePhase2.test.mjs
node node_modules/vite/bin/vite.js build
```

Repeat with `/workspace/mip-runtime22/node_modules/node/bin/node` for Node 22. **Actual-native raster/center-pointer repair remains pending the parent's browser harness.** It must record the eye offset and unchanged world/canonical anchors, inspect the formerly clipped center, test close/reopen/Inspector and keyboard return, and retain depth/terrain occlusion checks. A passing software-browser sample still does not establish physical-device or all-provider behavior. This lane claims a qualified source candidate only; no broad visual redesign, source admission, deployment, or paid provider activation occurred.
