# News frontend lane

Isolated branch: codex/mip-news-frontend-20260930, based on production frontend main 1a9f7bbe99676ca535c21dd6e68d3de7da62e69e. No merge/deployment is performed by this lane. The held managed successor and qik are not inputs to its execution.

The existing light Track B visual tokens, source grouping and card anatomy are retained. NewsView remains the actual News/Explore screen, with its existing mipBackend.publicData.news reader seam. The new public story adapter validates the existing loadArticles response, allows only explicit public presentation fields, and produces data for a pure reusable card. The card preserves source attribution, citation-derived provenance, recorded navigation destinations and evidence expansion. It receives no credentials, private comparison data or detail payload. Fixtures exercise that existing boundary without network requests or live article ingestion.

Feed refreshes hide prior-filter cards until the new read completes, and malformed page input fails into the retry state. Initial loading, empty, unavailable, retry, pagination progress and pagination failure are distinct. Existing detail/destination sequencing remains in place. Filters use the existing focus/escape/tab helpers and return focus to their trigger. Touch targets and narrow-screen text wrapping use existing theme tokens.

## Unresolved presentation authority

The current loadArticles projection contains id/title/url/summary/published_at/outlet/monoculture/unattributed/arc_id and a public byline join. It contains no breaking-news designation, pinned-story identity/order, or editorial lead designation. Event grouping is a separate public join. Recency does not establish breaking-news status, and a browser-local pin is not an authoritative public pinned story. These are contract gaps: no database field, alternative persistence, publication change, or editorial ranking is invented here. Homepage material hierarchy remains subject to owner visual direction; the existing visual system is preserved while that input is pending.

Validation uses existing GitHub Actions Golden regression/build on the feature branch. Its Pages workflow triggers only on main; no frontend production deployment is requested. No dependency or lockfile change, backend caller cutover, qik query, schema/role/secret change, ingestion, activation, or actual historical data is part of this lane.

## Measured map-loading change

Before route splitting, the existing remote production build emitted the initial script at 1,699.54 kB (501.49 kB gzip), map-stack at 2,040.17 kB and Cesium at 4,973.11 kB. App eagerly imported WorldView. The fixed WorldView import now lives behind a React lazy loading/retry boundary and mounts only for the existing World route; reader and navigation props remain unchanged. Deterministic fixtures test loading, prop forwarding, sanitized failure and retry. No dependency or build configuration is changed. Post-change output and any remaining shared dependencies are recorded in the private receipt; a separate emitted chunk alone is not proof of browser transfer improvement.
