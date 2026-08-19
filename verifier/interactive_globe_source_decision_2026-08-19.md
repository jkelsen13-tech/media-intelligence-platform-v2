# Interactive Globe Source Decision — 2026-08-19

The Geographic Graph overlay will use the existing D3 geographic rendering stack together with a local copy of the `world-atlas` 110m country topology, derived from Natural Earth administrative boundaries. This adds visible land and country outlines to make the spherical projection plainly legible as a globe while retaining a compact, dependency-light browser payload.

Natural Earth places its vector and raster map data in the public domain and permits use and modification without permission. The `world-atlas` project redistributes Natural Earth vector data as compact, unprojected TopoJSON suitable for D3 geographic projections. D3 represents spherical geographic features and supports projection rotation, making it appropriate for pointer/keyboard rotation of an orthographic globe.

The globe will remain an evidence display rather than a geographic inference engine. Only existing confirmed literal, city-level, source-record or human-verified points will be plotted. Dot size/halo will represent the number of recorded confirmed mentions for the same displayed city only; it will not represent event magnitude, reliability, or prominence. Candidate, ambiguous, and unlocated records remain withheld from the marker layer.

## References

1. [Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)
2. [topojson/world-atlas](https://github.com/topojson/world-atlas)
3. [D3 Geo](https://d3js.org/d3-geo)
