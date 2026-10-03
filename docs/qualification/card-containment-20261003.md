# Selected World View card containment — 3 October 2026

The repaired implementation is `b220edfd5a219f92649571c6ce1727a5fc8f3ccd`,
tree `2e892e486d8b6855b56273d229aac1d73622cb7f`. The
[source and evidence manifest](card-containment-20261003-source.json) pins the
six changed source/test/harness files and every qualification receipt. The later
documentation-only seal preserves those bytes; browser execution remains bound
to the clean implementation head.

The original `58667adcef63dfff56fd14242ed74082490873c9` public CI
`37100924579` (2689 passing tests on each runtime, build/audit0), fresh
cursor-grok-4.6-xhigh source CLEAN and previous browser counts remain historical
evidence. Their records and screenshots were not rewritten. The later visual
finding establishes a check those browser assertions did not cover: the old
harness restored the primary orientation before activating Close and Inspector.

## Reproduction and repair

| Objective failure | Measured cause | Existing owner correction |
| --- | --- | --- |
| Narrow rotated card extended to x328.03 beyond canvas x317; Desktop rotated extended to x761.33 beyond canvas x681, with 0/9 Close hit points. | The renderer snapped the viewport rebase, then CSS separately interpolated obsolete left/width coordinates for 160ms. Settled horizontal geometry fit. | Remove the second geometry transition. Renderer relocation remains bounded and the 220ms canonical-anchor entrance remains. |
| Narrow portrait Inspector remained below the clipped reader after all motion ended: card bottom463.19, Inspector bottom504.06, 0/9 hit points. | The 183px preferred reader allocated75% of available height while header/tabs/footer and module minimum extent exceeded that envelope. | Align preferred height with the existing95% presentation allowance and allow the compact module viewport to shrink. |
| A120-character source title with truthful canonical occlusion pushed Inspector54.64px below a231.8px card even after the first height correction. | The fixed header had an unbounded title; full source text expanded the header. | Retain the full title in an independently keyboard-scrollable two-line-height area, focusable only when measured overflow exists. Preserve all precision/status cues and fixed controls. Reuse the compact footer's existing zero vertical padding. |

The title has a conservative2.6em CSS fallback before2lh. Neither unit support
nor responsive browser observations qualify physical Safari. The title observer
disconnects on geometry changes, invalidation and unmount. A focused renderer
double regression covers fitting/overflowing titles, resize, hidden return,
invalidation and remount cleanup; actual keyboard scrolling is checked in the
browser separately.

## Focused qualification

Node22.23.3 and Node24.19.0 each pass64/64 relevant tests with zero failures,
skips, cancellations or todo. The focused commands ran before committing
against the identical production/test bytes in the manifest. The root owns the
complete integrated suite, build, dependency audit, public CI and fresh review.

Both clean browser runs execute sourceb220, tree2e892, in Chromium151.0.7922.173
on Node24.19.0, using the actual App, renderers and CSS. Backend/session/geometry
authority is explicitly synthetic; all nonlocal HTTP requests are blocked.

| Clean run | Profiles | Passing journeys | Separate owner judgment blocks | PNGs / distinct hashes |
| --- | --- | --- | --- | --- |
| Normal fixture | iPad, iPhone, narrow touch, Desktop | 40 | 4 | 180 /129 |
| 120-character title and canonical occlusion stress | Narrow touch, iPhone | 20 | 2 | 94 /58 |

Each profile executes five alternating primary/rotated states. Both immediate
and settled painted card/overlay/canvas rectangles are checked. The full source
title and precision/status rectangles stay inside the card; coarse tabs retain
44px height; the module has a positive independent content viewport. Actual
End/Home keys scroll the module, and the stress case also scrolls the complete
120-character title. Each orientation prepares and snapshots Close and Inspector
individually, asserts all nine hit points, activates each at direct screen
coordinates, and exercises both through keyboard before restoring orientation.
Inspector activation focuses the existing Selected-event inspector. Canonical
identity, coordinates, recorded time and exact camera serialization remain
unchanged through those control states; the facility floor remains8660.254m.
The synthetic occlusion diagnostic explicitly changes the camera and restores
its exact baseline before the control qualification.

The iPhone landscape workspace has a154.5px ordinary scrollport with the normal
title and109.5px with the stress title. Its reader exceeds that height. This is
distinct from internal card/canvas clipping: ordinary page scrolling reaches
each44px control separately. Preparation intersects the browser viewport with
all actual auto/scroll/hidden/clip ancestors and records the scroll owner,
bounds, requested delta and resulting position. No z-index/style changes or
automatic locator scrolling substitute for the direct activation proof.

All274 PNG hashes were independently recomputed. Raw receipts, screenshots and
failed development attempts remain under
`/workspace/mip-launch-receipts/oct03-card-containment`; their exact paths,
byte counts and hashes are in the manifest. These local receipts are not
claimed to be an archived production build or physical-device evidence.

Physical responsive-web operation, Safari/native-app behavior, owner density,
real-source/final appearance and hardware FPS/thermal qualification remain
separate. Historical cold portrait14→26 RED and the unchanged delta-under12
budget remain unchanged; the original measurement boundary is unrecovered.
