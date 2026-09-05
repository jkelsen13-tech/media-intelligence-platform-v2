# Investigation workspace visual fidelity

Owner-reviewed Codex target captures for the shared investigation workspace.
Use these eight PNGs as the primary visual authority for Graph, Timeline,
Arcs, Source Comparison, World View, and the phone / tablet frames.

Desktop targets (about 1363×936):

- `graph-desktop.png`
- `timeline-desktop.png`
- `arcs-desktop.png`
- `source-comparison-desktop.png`
- `world-desktop.png`

Responsive targets (app content only; ignore gray iframe chrome):

- `workspace-phone.png`
- `timeline-phone.png`
- `timeline-tablet.png`

## Frame to match

- Mobius mark + MIP wordmark in the left rail (not a circular badge in a full-width header)
- Rail 190px, collapsed 72px; top bar 64px to the right of the rail
- Event header and evidence strip span the workspace; generic inspector is 286px **below** the view tabs
- Cool white / blue-gray palette (`#202c41` / `#56657b` / `#e1e7ef` / `#315dbe`)
- Modest 5–8px radii; flat evidence strip with fine rules
- World View uses its native event inspector only (`has-native-inspector`)

## Intentional residuals

- World View keeps Cesium / MapLibre / terrain adapters. The target screenshot used a Natural Earth fallback; do not force that fallback just to match pixels.
- Graph node / policy / relationship panels still occupy the right dock when open (PR #26 behavior).
- Chronology and view-tab overflow on phone/tablet is intentional.
