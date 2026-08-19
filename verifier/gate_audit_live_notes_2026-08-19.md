# Gate Audit — Live v2 Deployment

**URL:** https://jkelsen13-tech.github.io/media-intelligence-platform-v2/  
**Audit time:** 2026-08-19 06:03 UTC

| Gate | Live observation | Preliminary status |
|---|---|---|
| Arc age / Evidence split | Source implementation inspected separately; live Story Arcs still requires direct validation. | Pending live validation |
| Globe | Knowledge Graph renders a bounded **Graph location overlay** over the Cytoscape canvas. It describes D3 orthographic interaction, public-domain Natural Earth boundaries, drag/arrow-key rotation, and source-backed city markers. The live focused graph reports **4 visible of 4 confirmed city-level representative points**. | Functional visual control observed |
| Graph count | The default focused view displays **15 of 47 nodes** and **14 documented relationships**. The control labels the full graph as **47 nodes**, not 47 connections. The audited database currently lists 47 `nodes` and 36 `edges`; relationship labels must be validated against the database before a final count conclusion. | Count terminology discrepancy requires reconciliation |
| News source display | The live News surface reports **838 articles** and card provenance text such as “Source-linked summary.” An expanded-record audit remains required for publisher source record, claims, framing markers, citations, and byline labels. | Pending detail validation |

The browser run confirms the globe is functionally overlaid rather than decorative. No backfill was initiated or continued during this audit.

## Expanded News Record Check

The expanded DOJ disclosure-index record renders the **Publisher source record** section, an original publisher URL, a clear **byline-not-stored** disclosure, and an explicit distinction between source attribution and claim-level citations. Its empty substantive-claim, framing-marker, and citation sections render as stated extraction gaps rather than “none” or neutrality conclusions. This confirms that the observed empty metadata on this record is **not a display failure**: the UI is rendering the missing-data state intentionally because structured extraction records are absent for that article.

The source-table audit must still quantify this corpus-level extraction gap and confirm that records with stored structured data render populated fields.

## Story Arc Placement Check

The deployed Overview for **February 2026 — source-mapped public-policy watch** renders **Arc age** (195 days), the coverage proxy, and the milestone checklist immediately above **Policy lifecycle**. The deployed Evidence tab renders **Attached source records (8)** and explicitly states that arc age, coverage, and milestone context appear in Overview. No source-card list appears in Overview, and no lifecycle/status block is duplicated in Evidence.

## Source-Table Graph Census

The isolated v2 sandbox contains **47 nodes** and **36 documented relationships (edges)**. The integrity audit found **0 orphan edges**, **0 self-edges**, and **0 duplicate `(source, target, type)` groups**. The live client uses unfiltered keyset-paginated reads of the same `nodes` and `edges` tables, so the live labels are consistent with the full stored graph census.

## Extraction-Completeness Pattern

The first audit used only News-facing `articles.claims` and `citations`: 838 total articles, 8 with a JSON claim array, 9 with citation rows, and 0 rows in the newly introduced `article_extraction_results` table. A record-level reconciliation found an additional 21 reviewed `article_claims` records, including a DOJ OIG record with an active manual-primary-source claim and a linked primary-document URL that the prior News detail loader did not read.

Using the visible News fields alone, 8 articles are partially extracted and 830 are extraction-absent; no article contains all three of a substantive claim, a recorded framing marker, and a structured citation. The absence is systematic rather than outlet-random: the 752-row `v2-original-reference-news-2026-08-19` run is entirely extraction-absent, as is the 60-row Project 2025 run. The eight February 2026 source-mapped records are partially extracted through structured citations, while four BBC News records and several legacy CNN records contain substantive claims only. Major outlets in the original reference run (Al Jazeera, BBC, South China Morning Post, Fox News, New York Times, Times of India, The Guardian, NPR) are extraction-absent in the News-facing fields.

The reconciliation establishes two distinct conditions: **a read-path gap** for already-reviewed cross-surface `article_claims` / `claim_evidence_links` such as the DOJ OIG record, and **a backlog-generation gap** for the much larger original-reference and Project 2025 runs. The current change corrects only the former; the review-gated ingestion pipeline is the appropriate mechanism for the latter. No claims, framing markers, or citations were fabricated.

## Globe and Mobile Graph Interaction

The deployed globe uses **D3 `geoOrthographic`** with local `world-atlas/countries-110m.json` / `topojson-client` Natural Earth geometry. This was selected over a heavier WebGL globe because the requirement is a bounded, readable overlay inside an existing Cytoscape workspace: D3 supports drag rotation, keyboard rotation, visible graticules/borders, deterministic SVG hit targets, and source-backed marker sizing without introducing a second 3D rendering engine. Marker radius denotes only the count of confirmed location mentions at a displayed city; it does not imply event importance, reliability, or prevalence.

A dedicated headless Chromium check ran against the live deployment at a **375 × 812** viewport. It confirmed the mobile breakpoint, opened the first graph hub, found the one eligible active card, tapped it, and observed the `Article panel` mobile bottom-sheet reader. The historical mobile-only failure was the graph integration path invoking an optional edge-clear callback with a null selection; the guarded callback now clears edge evidence only when a real edge is present, allowing the independent node selection callback to open the reader. Desktop remains unaffected because it uses the same node selection state but desktop card presentation.
