# Design QA — investigation workspace

Visual target: the light investigation-workspace captures (graph, timeline, arcs, source-comparison, world desktop; workspace/timeline phone; timeline tablet).

## Must match

- Light canvas, white reading surfaces, blue active tabs.
- Desktop three-pane shell: collapsible left nav, canonical header, right inspector.
- Phone: hamburger drawer, scrollable evidence dimensions, scrollable view tabs, inspector as a bottom sheet.
- Canonical subject stays in the header when a child node is selected.
- Missing location and missing evidence read "not recorded" (or the existing node-level "not yet recorded" copy). Never invent a place or a score.
- Timeline chronology is recorded order. The spacing note must remain visible. List is an alternative, not a replacement of the connector engine.
- Arcs and Source Comparison use honest unavailable cards when released data is absent.
- World View keeps Map / Graph / Split and the live globe/map adapters.

## Must not regress

- Explore / Change Topic still opens the existing drawer and does not call a view change.
- Investigation Context identity fields survive ordinary tab switches.
- Deep links, recent investigations, and new-subject commit stay on their existing seams.
- Cesium base URL assignment-before-import and fatal MapLibre fallback stay intact.
- No composite score, no mock arcs, no mock comparison metrics.

## Out of scope

- Backend flags, schema, RLS, ingest, or release writes.
- New globe stages, terrain, or precision-class product work.
- Account sync or multi-investigation tabs.
