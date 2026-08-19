# Scalable Geographic Graph Research Notes

**Date:** 2026-08-19  
**Scope:** Research inputs for an evidence-safe v2 Graph that may grow from hundreds to thousands of nodes and optionally support documented geographic placement.

## Design Conclusions

The appropriate v2 strategy is **not** a full force-directed rendering of every record. The current focused-graph approach should become a multi-resolution system: a light global overview, bounded local subgraphs, optional geographic aggregation, and explicit expansion controls. Cytoscape’s own layout guidance cautions that a full large graph becomes visually unreadable even before rendering performance becomes a bottleneck; it recommends selecting a relevant subgraph—such as a bounded hop neighborhood—and allowing users to navigate among subsets.[1]

For ordinary relationship exploration, retain the existing FCOSE local layout and apply it only to a bounded selected subgraph. Cytoscape describes FCOSE as its latest compound-graph force-directed option and says it is generally the fastest of its CoSE-family layouts; the same guidance identifies CISE as appropriate for graphs with well-defined clusters.[1] This supports a measured architecture: retain FCOSE for a reader-selected evidence neighborhood, use stable aggregate/place nodes for broad views, and do not create inferred relationships to improve visual density.

A globe should be an **optional geographic lens**, not a substitute for the relationship graph. A full tile-backed globe adds remote tile dependencies and a second rendering engine. D3’s geographic projections instead accept longitude/latitude and produce screen coordinates, including clipping behavior for points outside the visible hemisphere.[2] A lightweight D3/SVG or canvas globe background therefore suits the user’s requested aesthetic and avoids an external map-key dependency. MapLibre GL JS can render a globe, but its reference example depends on third-party raster tiles; that makes it unsuitable as a default evidence-surface dependency until tile provenance and service terms are selected.[3]

## Scalable Graph Architecture

| Layer | Algorithmic role | Safe rendering rule |
|---|---|---|
| Global overview | Aggregate only by documented geography and/or explicit source-mapped category. | Never render all raw edges; display count-bearing place groups and only aggregate, non-causal links. |
| Geographic view | Spatially bucket **already resolved** location records by country, region, or configured grid. | A record without a resolved place remains in an unlocated lane; it is never placed by publisher location or headline guess alone. |
| Focused relationship view | Retrieve a node’s bounded 1–2-hop neighborhood, then apply FCOSE. | Keep the existing Expand control, cardinality disclosure, and source/type filters; do not infer additional edges. |
| Cluster drill-in | Expand a place/cluster into a bounded member list and then a local relationship graph. | Preserve source count, unresolved count, and the exact geographic precision used. |
| Long-tail access | Server-side cursor pagination and search for additional members in a selected cluster/neighborhood. | Rank only with a disclosed deterministic retrieval rule; do not use popularity as truth or reliability. |

Academic work on multilevel coarsening describes an “overview first, zoom and filter, details on demand” pattern: users begin at a coarse representation and expand selected groups at higher resolution.[4] This directly matches the user’s request for future thousands-node operation better than forcing a whole-corpus node-link drawing.

## Geographic Data Model and Extraction Guardrails

Location placement must model **what kind of location the source supports**. A news article may name an event location, publisher/production location, subject jurisdiction, or a merely associative reference. The v2 Graph must label and keep these distinct. A geolocated-news study likewise distinguishes production, event, and consumption locations rather than treating all mentions as an event coordinate.[5]

The minimum provenance-bearing record should be:

| Field | Required use |
|---|---|
| `article_id` / `node_id` | Binds the location to an existing source-mapped record. |
| `mention_text` | Exact source text, e.g., a literal headline or lead-paragraph span. |
| `mention_offset` and `text_field` | Identifies whether it came from a headline, summary, or body lead. |
| `location_role` | `event`, `jurisdiction`, `facility`, `publisher`, `context`, or `unresolved`. |
| `literal_status` | `literal`, `associative`, `ambiguous`, or `rejected`. |
| `gazetteer_id`, `latitude`, `longitude`, `precision` | Stored only once a candidate is resolved with recorded basis. |
| `resolution_method` and `review_state` | Makes automated candidate, human review, and final state visible. |
| `candidate_set` / `remaining_uncertainty` | Retains alternatives when a name is ambiguous rather than silently choosing one. |

Geoparsing research describes a two-stage process: first identify literal place names, then resolve them with surrounding context against a geographic knowledge base.[6] It further documents that metonymy, homonyms, and associative use make naïve NER unreliable. For example, “London” may stand for people or an institution rather than a physical location.[6] A later evaluation found that a meaningful share of toponyms in news are associative rather than literal, so a headline/lead mention alone is not sufficient evidence of an event location.[7]

Accordingly, the first v2 implementation should follow this conservative cascade:

1. Extract candidate literal toponyms from headline, then the first available body/summary paragraph, retaining exact text spans.
2. Reject known associative/metonymic patterns or mark them `ambiguous` rather than emitting coordinates.
3. Retrieve multiple gazetteer candidates using country, state/region, feature type, and neighboring literal toponyms as contextual constraints.
4. Store a candidate result only as `automated_candidate`; show it in a review queue or as broad-area placement, never as a verified precise point.
5. Promote to map/graph placement only when a deterministic rule has a unique, context-supported candidate or a reviewer confirms the resolution.
6. Use country/region or a coarse geographic cell for initial visual placement. Exact coordinates remain hidden or generalized when the source only supports a broad area.

The recent RACCOON work reinforces the need for a retrieval-and-reranking architecture: it uses a gazetteer, multiple candidates, country/state context, and feature type rather than asking an LLM to invent coordinates.[8] Its reported population-heuristic bias is a reason **not** to use population as a final location decision in v2; it may be used only as a disclosed, non-decisive candidate ordering aid.[8]

## Spatial Aggregation and Scale

PostGIS offers two useful later-stage building blocks if the v2 sandbox has or is granted the extension:

* `ST_SnapToGrid` can snap already-resolved points into a configured regular grid, supporting coarse, privacy-preserving display buckets.[9]
* `ST_ClusterDBSCAN` groups points based on a chosen distance and density without requiring a preselected cluster count; its documentation notes that border assignment can be ambiguous and recommends an `ORDER BY` for determinism.[10]

These are **aggregation tools**, not evidence tools. A spatial cluster expresses display proximity at a selected scale; it does not establish a relationship, similarity, common cause, or shared reporting lineage. The Graph legend and panel must state this distinction.

## Recommended Initial v2 Build

1. Add a location-provenance table and pure deterministic read model; do not backfill unverified points.
2. Add Geography view aggregates: `resolved areas`, `automated candidates awaiting review`, and `no documented location`.
3. Project only confirmed/coarse coordinates on a lightweight optional globe backdrop; keep unlocated records in a visible non-geographic region.
4. Keep Cytoscape for relationship topology. Selecting a geographic aggregate should open a bounded local graph rather than attempting to combine every raw edge with geographic coordinates.
5. Add test fixtures for literal, associative, homonymous, multi-place, facility, and no-location cases before running any corpus-wide extraction.

## References

[1]: https://blog.js.cytoscape.org/2020/05/11/layouts/ "Cytoscape.js: Using layouts"
[2]: https://d3js.org/d3-geo/projection "D3 Geo: Projections"
[3]: https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/ "MapLibre GL JS: Display a globe with an atmosphere"
[4]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9244804/ "Multilevel Coarsening for Interactive Visualization of Large Bipartite Networks"
[5]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12223224/ "A geolocated dataset of German news articles"
[6]: https://pmc.ncbi.nlm.nih.gov/articles/PMC6560650/ "What’s missing in geographical parsing?"
[7]: https://pmc.ncbi.nlm.nih.gov/articles/PMC7406539/ "A pragmatic guide to geoparsing evaluation"
[8]: https://arxiv.org/html/2501.11440v1 "RACCOON: A Retrieval-Augmented Generation Approach for Location Coordinate Capture from News Articles"
[9]: https://postgis.net/docs/ST_SnapToGrid.html "PostGIS: ST_SnapToGrid"
[10]: https://postgis.net/docs/ST_ClusterDBSCAN.html "PostGIS: ST_ClusterDBSCAN"
