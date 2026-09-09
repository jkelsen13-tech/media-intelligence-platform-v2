# Recorded-time sun lighting qualification

This batch connects the exact World View inspection timestamp to a frozen Cesium display clock and adds an optional, calculated Sun lighting control. It does not assert observed sunlight, event occurrence, weather, or source imagery captured at that time.

The raw SQL/ISO text, offset and fractional precision remain in the investigation context and display contract. Only the renderer's derivative uses milliseconds. A date-only scope cannot borrow an incidental precise marker for lighting. Invalid, absent or date-only input disables lighting; the internal neutral clock is never exposed as a selected/event time. The globe sun and moon sprites remain hidden. No timer, device time, continuous clock animation, source fetch, geometry rewrite or camera movement is introduced by a lighting toggle.

All presets keep sunlight off. Master/category gates retain the independent leaf preference; Graph/Map remount restores the latest exact time before reapplying effects. Fallback renderers cannot claim support. Dynamic atmosphere, sun-directed atmosphere and terrain shadows remain deferred and off; SDK dynamic-atmosphere defaults are explicitly neutralized. Existing ground atmosphere and haze remain independent display effects with unchanged culling policy.

Cesium's day/night treatment fades out at close range. Qualification therefore compares globe pixels from space, at a fixed camera. This does not qualify physical-device performance or fix the previously recorded small polar rendering gap.

## Verification requirements

Before merge: Node 22/24 full tests and production build, preview browser checks, review actual generated images and exact changed source. The new tests cover the real Cesium Clock API, malformed/local/date-only input, SQL precision, source immutability, rejected setters, frozen ticks, async mount replay, fallback and gate memory. Browser checks cover Chromium/WebKit desktop/phone pixel differences, unchanged camera/canvas, settled tile request count, existing atmosphere coexistence, presets, remount and retained timestamp/date-scope transitions.

After merge: exact main commit/deployment receipt and the complete live acceptance suite, including relevant earlier workspace, Timeline, Graph, comparison, arcs, weather, precision and fallback behavior. Results and exact workflow receipts will be attached to the pull request after verification.

## API provenance

Locked Cesium 1.145 Clock source: https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Core/Clock.js
Public Clock contract: https://cesium.com/learn/cesiumjs/ref-doc/Clock.html
Public Globe lighting and independent atmosphere contracts: https://cesium.com/learn/cesiumjs/ref-doc/Globe.html

No backend, publication, privacy, rights, provider activation, collector acknowledgement or retirement changes are included. Generation-bound collector outputs/acknowledgement, broader consolidation, Markets prerequisites, physical-device qualification and the known polar gap remain pending.
