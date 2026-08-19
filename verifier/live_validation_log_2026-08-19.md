# Live Validation Log — 2026-08-19

## Deployment baseline

The deployed v2 website was opened directly at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` after commit `6d9580f` was pushed. The public News page loaded the isolated v2 corpus and displayed **838 articles**. It also exposed the public navigation, search input, Region/Evidence/Topic controls, outlet controls, and corpus-status controls. Login was visible but is deliberately excluded from validation at the owner's instruction.

## Initial visual check — News

The live News page uses the expected light article-card feed and a separate information banner, consistent with the designated News reference (`IMG_2992.PNG`). The designated animated-context background is not evaluated. Further page-by-page desktop and mobile interaction checks remain in this log.

## Verified discrepancy — News controls

Directly activating the live **Region** control produced no filtering interface. Its live accessibility hint states: `Region filtering is planned but not yet wired — shown for orientation only.` The live **Evidence** and **Topic** controls expose the corresponding unwired hints. This does not meet the intended active-filter behavior and must be traced in the deployed code before the validation can be marked complete.

## Live News re-check — current deployment

After GitHub Pages reported a successful deployment, reopening the same public site with a cache-busting query loaded the current build. The prior inert-filter discrepancy was a stale cached asset, not the pushed implementation. The live page now renders Region, Evidence, Topic, and source-order controls as active selects. Selecting **Topic → Immigration** reduced the live result set from **838** to **14** records and showed only matching published metadata, confirming the filter tool works. The visible note correctly distinguishes corpus representation and recorded source tiers from popularity or a composite reliability score.

Further public News-tool checks passed: **Evidence → Primary records linked**, when combined with the previously selected Immigration topic, narrowed the live list to **one** source-attributed DOJ metadata record. The original unfiltered view remained available through the same active controls. This demonstrates that the Topic and Evidence controls are functional server-read parameters rather than presentational labels.

## Region-filter repair and live verification

The isolated outlet table initially had five publisher rows with all `country` values null, so the live selector had only its default option. A narrowly scoped, source-noted seed populated only four directly supported country values: Al Jazeera → Qatar, BBC News → United Kingdom, Fox News → United States, and The New York Times → United States. CNN remains null rather than guessed. Reloading the actual public site exposed **Qatar**, **United Kingdom**, and **United States** as Region options. Selecting **United States** reduced the live News view to **90** articles, all from the recorded United States-labelled outlet rows. The Region control is now functionally verified.

The Region selector also reset cleanly to **All regions**. The public search path was then exercised with `Project 2025`; the live UI correctly displayed its transient loading state while its documented debounce/read cycle ran. The resolved result state is checked next.

## Live search and News-to-Arc navigation

After its debounce, `Project 2025` returned **56** live records with source-attributed metadata. Clicking the visible **Open arc** button on the first result opened the matching Project 2025 Story Arc. The destination rendered the approved reference-aligned structure: an overview-level policy lifecycle with recorded dates, developments, and evidence-state badges; attached News articles are not embedded in that table. This matches the required separation between lifecycle overview and evidence.

## Story Arc public tools

The Project 2025 Arc’s **Timeline** tab rendered dated event cards, explicit **Confirmed** states, and **Sequence only** connectors where no causal relationship is asserted. Opening **View details** exposed the reader with separate What changed, source-excerpt availability, authentication, and remaining-uncertainty fields. This is consistent with the designated Timeline and Story Arc reference principles: chronology remains visibly distinct from causal attribution, and missing evidence is shown as unavailable rather than fabricated.

The live **Evidence** tab displayed **60 attached articles** in its dedicated evidence section, while the Overview retained only lifecycle records. Selecting an attached article successfully returned to the public News surface and opened the article-card reader state, confirming the Evidence-to-News path works. This directly satisfies the requested overview/evidence separation and button-based cross-surface navigation.

## Knowledge Graph and relationship list

The live Knowledge Graph loaded a focused view of **15 of 47 nodes** with **14 documented relationships**, typed-node legend, reliability threshold controls, hypotheses toggle, Topics control, graph zoom/fit/reset controls, and an explicit focused/full graph transition. The public **Relationship list** opened a textual, filterable table with one contained row per documented relationship and a dedicated Evidence button per row. This uses separate per-row boundaries rather than a single page-covering relationship border, aligning with the requested selected-connection treatment and the designated Graph reference’s typed relationship hierarchy.

Activating a relationship-row Evidence button opened a dedicated **Relationship** reader with the selected edge’s source/target, documentary type, raw relation text, signal source, claimant, and stance. The graph canvas remained visible behind the panel and its relationship markings stayed local to the selected connection; closing the reader restored the graph without side effects. The exact selected edge therefore receives a contained opaque reader/selection treatment, rather than an all-table border.

## Geographic Graph lens

The live **Geography** tab rendered a lightweight orthographic globe with exactly **4 confirmed city-level representative points**, **0 automated candidates** shown, and **12** focused nodes with no documented location. Its visible safeguards state that markers require literal, confirmed source records or human verification; they are broad city-level points, not incident coordinates. Louisville, Minneapolis, Norfolk, and Seattle each disclosed the exact source-field phrase, city-level precision, and remaining uncertainty. Selecting Louisville focused the documented node and opened its evidence panel with the linked official DOJ source record and separate connection controls. This validates the requested globe/background functionality without text-derived coordinate invention.

The focused-graph **Time** mode displayed the current focus’s recorded dates in chronological order and explicitly labeled the institution row **No recorded date**. It remains a local graph inspection tool rather than a claim that undated nodes occurred at an inferred time. The tab returned to Relationships cleanly and did not alter graph data.

## Causal Timeline — complete News-record coverage

The live Causal Timeline initially showed the privacy-safe Epstein process arc with **13 timeline records**, including **6 clearly labelled News records** separate from accountability entries. Selecting the Project 2025 arc showed **64 timeline records: 60 News records and 4 accountability records**. This exactly matches the verified isolated-v2 assignment inventory and demonstrates that attached News coverage is chronologically represented without falsely recasting each publication as a graph event. The visual card axis, date labels, evidence badges, and sequence-only connector language align with the designated Timeline reference.

The Causal Timeline **Evidence** tab independently rendered the same **60 attached articles** together with evidence-state counts, a coverage-over-time indicator, and an explicit coverage-gap statement. These publication records remain outside the lifecycle-event overview, preserving the distinction demanded by the reference screenshots and owner instruction.

The Causal Timeline **Connections** tab showed the Project 2025 arc’s **8 documented relationships**, with plain-language relation labels and documentary strength shown independently of the 60 publication records. Returning to Timeline restored the 64-record chronology without data loss.

The live Timeline record-type filter narrowed the Project 2025 chronology from **64** total records to **60 News records**, and composing it with **February 2025** narrowed the displayed set to **7** publication records. Both controls preserved the stated `filtered from 64` context and did not reclassify News records as accountability events.

A live News-record **View details** reader displayed its source attribution, source excerpt, authentication availability, remaining uncertainty, and sequence-only distinction. The global-corpus button then showed **91 timeline records**, comprising **15 graph events** and **76 separately listed News records**, with **6 duplicate event mirrors suppressed**. Global timeline search, event-type, link-status, pagination, evidence, and connection controls were present. This confirms deduplication suppresses only duplicate event mirrors while retaining explicit publication chronology.

## Source Comparison live-reference check

The live **Source Comparison** page rendered the requested reference-aligned hierarchy: a blue-accent coverage header, event-level claim/evidence/review totals, explicit lineage disclosure, an **Ingested outlet sample** card, captured framing, included-claim count, source-tier disclosure, and per-claim epistemic state. Where only one outlet is ingested, the interface explicitly says comparison and source independence are **not established**. It also exposes button controls for Story Arc, Causal Timeline, and News, plus a separate provenance/explanation disclosure. This matches the designated Source Comparison reference without inventing an independence finding or a composite reliability score.


## Post-57129b8 correction validation — News baseline

A cache-busted direct visit to the deployed v2 website loaded the isolated **838-article** corpus and active Region, Evidence, Topic, source-order, outlet, and status controls. Cards visibly show publisher outlets and a provenance footer such as **“Source-linked summary.”** The expanded reader is the next target for confirming the new publisher-source, byline-availability, structured-claim, framing-marker, and supporting-citation disclosures.

The isolated-v2 inventory reconciliation confirms that the live graph’s **47** is its node count. The same tables contain **36 documented relationships**, **0 inferred relationships**, and all 36 edges have valid source and target endpoints.


The expanded live DOJ News record now displays a **Publisher source record** with its outlet, a direct publisher URL button, an explicit byline-availability statement, and separate structured-substantive-claim, framing-marker, and supporting-citation availability disclosures. The text correctly identifies missing structured extraction as a gap rather than a claim of neutrality, lack of content, or lack of publisher attribution.

The live Knowledge Graph now shows a compact **Graph location overlay** directly on the Relationships canvas. It contains visible land and country boundaries, a title identifying it as an interactive orthographic globe, reset control, keyboard/drag instruction, and four individually selectable source-backed city markers. The overlay is bounded in the lower-right canvas area and does not cover the primary graph controls or visible desktop node cards.


Selecting a live geographic marker opened the corresponding focused node reader and rendered source-linked node records and connection evidence controls, confirming the repaired marker-to-graph selection path. The reader’s focused graph scope correctly updated to **9 of 47 nodes** and **8 documented relationships** for the selected Norfolk matter.

The live Story Arc Overview now places **Arc age**, **Coverage over time**, the coverage-gap disclosure, and the milestone checklist above **Policy lifecycle**. The lifecycle table itself explicitly states that attached articles remain in Evidence. The Overview contains no attached-source inventory, matching the requested split.


The live Arc Evidence tab contains only the eight labelled **Attached source records** and an explicit note that Arc age, coverage, and milestone context appear in Overview. Each attached publisher record exposes an **Open in News Feed** control. The public **More** menu also opened correctly and exposes button-driven Source Comparison and Legal & Policy destinations; login remains intentionally out of scope.

## Gate correction validation — commit 691194b

The source-table graph census confirms **47 nodes** and **36 documented relationships**; no edge has a missing endpoint, self-reference, or duplicate `(source, target, type)` group. The live Graph labels use keyset-paginated reads of those source tables.

The mobile graph reader was verified at a 375 × 812 viewport by a reproducible Chromium run: a hub selection created the one eligible mobile graph card, and tapping that card opened the `Article panel` bottom-sheet reader. The null edge-clear guard permits node selection to proceed on mobile.

The live News record **DOJ OIG announces audit initiation** now renders its reviewed substantive claim and the separately labeled primary-document evidence record. Its empty framing-marker and citation sections remain explicit data gaps, not inferred neutrality or an absence of publisher attribution. This verifies the narrow read-path correction for existing cross-surface provenance without changing the wider extraction backlog.
