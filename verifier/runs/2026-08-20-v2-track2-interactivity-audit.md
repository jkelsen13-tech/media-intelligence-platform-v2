# V2 pre-launch Track 2 — Public interactivity audit

**Scope:** public V2 pages only: News, Knowledge Graph, Causal Timeline, Story Arcs, and Source Comparison. Legal/Policy surfaces are excluded.

## Live finding log

| Page | Element | Expected behavior | Observed behavior | Classification | Status |
|---|---|---|---|---|---|
| News | Global text search | Filter the live feed by headline, summary, or article text | **Pass after repair.** On the deployed V2 site, entering `Michigan Looks Left` returned the single matching New York Times card (Aug. 3, 2026, 05:35 PM) with its stored summary; no timeout or fallback occurred. | Repaired UI | Closed — migration `20260820_v2_accelerate_public_news_search.sql` adds trigram indexes for all three existing public substring-search fields. |

**Repair and validation.** The original server-side `title OR summary OR body_text ILIKE` query timed out against the 12,558-article corpus. The V2-only migration adds three `pg_trgm` GIN indexes without changing the public data contract or restoring any base-table grant. The isolated-sandbox anonymous probe returned HTTP 200 in approximately 1.3 seconds, and the post-deployment live-browser replay above returned the expected result without a timeout.

| News | Article-card expansion | Open selected article detail and disclose stored publisher/provenance data without fabricating citations | **Pass.** The selected card expanded; publisher source record and URL were exposed, an absent author was labeled as unrecorded, claims were disclosed, and unavailable structured citation/framing data used clear empty states. |

The card detail remained interactive after the timed-out search was cleared. Its provenance disclosures did not mislabel the publisher record as a claim-level citation.

| Knowledge Graph | Focused default, legend, reliability, zoom/reset controls | Open a bounded graph with interpretable relationship legend and visible controls | **Pass baseline.** Live graph rendered a focused 20-node, 22-relationship view with an explicit 805-node full-graph option, region selector, Expand, legend, reliability threshold, hypothesis toggle, Topics, canvas, zoom, Fit, and Reset controls. |
| Knowledge Graph | Expand / Reset | Expand one documented relationship level, then restore focused layout | **Pass.** Expand changed the focused graph from 20 nodes / 22 relationships to 26 nodes / 28 documented relationships; Reset restored the bounded focus layout. |
| Knowledge Graph | Geography tab / globe | Switch to graph-connected geography and expose only confirmed source-backed markers | **Pass.** The tab opened an interactive globe with explicit controls and a truthful zero-marker state: 0 confirmed locations, 0 candidates surfaced, and 26 unlocated nodes withheld rather than inferred. |
| Knowledge Graph | Time tab | Switch to an ordered list of the focused graph records and retain date uncertainty | **Pass.** The tab rendered all 26 focused records chronologically, including explicit `No recorded date` labels for undated records rather than invented ordering. |
| Causal Timeline | Arc selector, ordered records, date/type filters | Load an auditable chronological sequence without treating temporal order as causation | **Pass baseline.** The selected arc rendered 13 dated records with accountability/news distinctions, explicit `Sequence only` labels, a chronology/causation disclaimer, and working date/type filter controls. |
| Causal Timeline | Record detail / Evidence panel | Expand a record and open its attached evidence records | **Pass.** Record details disclosed the stored basis plus explicit empty evidence/authentication/uncertainty fields; the Evidence panel listed all 6 attached source records and offered working News Feed destinations. |
| Story Arcs | Arc directory, Overview, Timeline/Evidence tabs, coverage/milestone status | Select an arc and inspect its documented longitudinal context | **Pass.** The selected arc showed clear dormant status, coverage proxy, coverage-gap disclosure, milestone empty state, lifecycle records, and source-attributed developments. The Evidence tab listed its 8 attached publisher records with working News Feed destinations. |
| Source Comparison | Projection-backed populated card / Arc, Timeline, News, and explanation controls | Load a multi-outlet comparison, preserve review status, and expose cross-surface actions | **Pass baseline.** The page loaded a populated 4-outlet event with 20 extracted claims, review state, lineage caveat, timing, source-framing cards, claim-level provenance, article links, Arc/Timeline destinations, News destinations, and expandable explanation disclosures. |
| Source Comparison | Event search | Filter populated comparison cards by event title | **Pass.** Searching `Pochettino` retained the matching populated card and its projection-backed claim/explanation disclosures. |

## Final Track 2 disposition

The functional cross-page audit found one reproducible public UI defect: the News full-text query timed out against the live corpus. That defect is now repaired, tested in the local 457-test regression suite, built successfully, deployed in commit `12337e2`, and replayed successfully on the live V2 site. The repair preserves the existing search semantics across title, summary, and article text while retaining all anonymous base-table revocations; it changes only query performance through V2-only indexes.

All checked News, Knowledge Graph, Geography, Causal Timeline, Story Arcs, and Source Comparison controls now have a recorded **Pass** result. Legal/Policy pages and Callais/redistricting-adjacent material were excluded from this audit.
