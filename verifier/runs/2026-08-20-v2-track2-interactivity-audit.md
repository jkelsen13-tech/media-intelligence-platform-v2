# V2 pre-launch Track 2 — Public interactivity audit

**Scope:** public V2 pages only: News, Knowledge Graph, Causal Timeline, Story Arcs, and Source Comparison. Legal/Policy surfaces are excluded.

## Live finding log

| Page | Element | Expected behavior | Observed behavior | Classification | Status |
|---|---|---|---|---|---|
| News | Global text search | Filter the live feed by headline, summary, or article text | Entering `Michigan Looks Left` produces `Failed to load articles: canceling statement due to statement timeout`; the page falls back to unrelated default cards. | Broken UI | Open — query-path performance defect. |

The search control is wired and accepts input, but its server-side `title OR summary OR body_text ILIKE` filter times out against the 12,558-article corpus. This is a query-performance defect, not a missing UI. The audit will continue across all pages before applying the scoped fix.

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

## Audit disposition before repair

The functional cross-page audit found one reproducible public UI defect: the News full-text query times out against the live corpus. Graph, Geography, Timeline, Story Arcs, and Source Comparison controls tested above behaved as wired and used explicit uncertainty or empty-state disclosures where content was unavailable. The next phase applies the bounded News search query performance repair and then revalidates all affected live controls.
