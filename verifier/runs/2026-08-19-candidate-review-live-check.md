# Candidate Review Live Check — 2026-08-19

The public GitHub Pages deployment at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` was reopened after the candidate-review ledger closure. It loaded successfully from Supabase, reported a live corpus of **12,558 articles**, and exposed the News Feed, Knowledge Graph, Causal Timeline, Story Arcs, and More navigation.

The News interface rendered the source-aware controls for date, region, evidence basis, topic, source ordering, and article state. Its evidence model explicitly states that corroboration is unavailable until verified source-lineage records exist, that multiple outlets do not establish independence, and that no composite vendor or reliability score is calculated. This is consistent with the no-auto-promotion posture.

Candidate-ledger audit of the isolated sandbox found no `approved` or `pending` rows in `cross_surface_candidates`: the reviewed set comprises 18 rejected records and three `owner_hold` records. Consequently, there were no newly approved records requiring cross-surface propagation checks in this run. The three owner holds remain blocked from all propagation by the hard-stop rule.

Browser capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-51-48_9588.webp`.

## Cross-surface smoke check

The public **Knowledge Graph** loaded after the candidate-ledger closure. It showed 47 total nodes, 15 nodes in the focused view, and 14 documented relationships. The graph retained its explicit causal-versus-sequence distinction, reliability controls, geographic overlay, and source-backed city markers. Capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-52-56_2910.webp`.

The public **Causal Timeline** loaded after the candidate-ledger closure. The selected `Epstein Files Transparency Act — process, safeguards, and oversight` arc rendered 13 timeline records, including six News records; records were explicitly marked `Sequence only` where causality was not source-supported. The shared evidence and connection controls were present. Capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-53-03_7197.webp`.

These are baseline live surfaces; no newly approved candidate was present because the approved count was zero. The candidate ledger's 18 rejected records and three owner-held records remain excluded from propagation.

## Current reference-screen audit — initial observations

A fresh public News check after the current 10k isolated backfill loaded the 12,558-article corpus with live date, region, evidence, topic, source-order, outlet, and article-state controls. The screen retained its explicit no-composite-score and unverified-lineage disclosures. At the top of the default, newest-first feed, several records correctly disclose `Publisher source URL recorded` where no text or richer provenance is retained; one record title is itself a publisher URL. These records are not presented with fabricated summaries, citations, status badges, or graph/arc links.

A fresh public Knowledge Graph check loaded the focused workspace with 15 of 47 nodes, 14 documented relationships, the Relationships / Geography / Time modes, region filter, Fit / Reset / Expand controls, dashed cluster boundaries, a type/edge legend, reliability controls, and a confirmed-location overlay. The rendered graph continued to distinguish causal from sequence edges in plain language and did not display an aggregate confidence score.

Screenshots: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-56-59_5853.webp` and `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-58-43_6130.webp`.

The public **Causal Timeline** loaded its Epstein process-only arc with a 13-record sequence, three semantic tabs, date/event filters, an evidence/connection count, `View details` affordances, white-card hierarchy, and explicit `Sequence only` labels between every adjacent record. The screen retained the mandatory chronology/causality footnote and no causal connector was implied by visual adjacency. Screenshot: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-59-03_4234.webp`.

The public **Story Arcs** screen loaded the February 2026 source-mapped policy-watch arc with an honest dormant status, bounded-scope description, tabs, Graph jump, arc-age and coverage measures, coverage-gap explanation, explicit lifecycle orientation caption, key developments, evidence-state counts, and chronology/correlation boundary. Screenshot: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-59-19_5355.webp`.

The public **Source Comparison** screen loaded with light cards, an evidence-review header, explicit no-composite-score boundary, source-comparison search, claim and primary-evidence-link totals, review date, lineage-status disclosure, one-outlet disclosure, exact captured framing, included-claim count, source-tier state, claim evidence class, article and primary-document links where available, and remaining uncertainty. It used `Reported by` rather than an unsupported independence claim. Screenshot: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-59-42_1540.webp`.

The public **Legal & Policy** view loaded with curated-record framing, explicit documented-claim and no-composite-score language, draft statuses, Source Locator detail, stated-objective versus actual-outcome separation, official source links where available, and explicit evidence-gap markers. The active rendering preserves the distinction between a source-stated objective, a documented action, and an unidentified outcome; no conclusion is drawn from missing evidence. Screenshot: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_19-00-07_6479.webp`.

## Narrow mobile visual verification — 390 × 844

The live responsive check at 390 × 844 entered the mobile breakpoint and reported no horizontal overflow for the focused Graph, full Graph, Timeline, or Story Arcs views. The expanded Graph reported 47 total nodes and 36 documented relationships with zero visible DOM node cards, retaining the canvas-first mobile treatment; its one-line status, Relationships / Geography / Time modes, region filter, legend, reliability controls, graph grid, location overlay, and five-item bottom navigation all remained readable in the captured mobile frame.

The Timeline capture rendered the policy-change eyebrow, legible title/subtitle, arc selector, global-events control, semantic tabs, date/type controls, inline missing-evidence banner, count line, white event cards, dated vertical spine, per-gap `Sequence only` connector, status icon plus label, and fixed five-item navigation without horizontal scrolling. Screenshots: `verifier/live_responsive_surface_check/graph-expanded-mobile.png` and `verifier/live_responsive_surface_check/timeline-mobile.png`.

### Mobile Story Arcs reference-alignment repair

The initial 390 × 844 live capture confirmed the underlying mobile list/detail route worked but opened on the list-selector state, pushing the selected arc’s reference-style overview below the fold. The reference screen places the selected arc overview first. `ArcsView` now marks the initial selected arc as opened on narrow screens; the existing **All story arcs** control continues to return to the searchable list. Desktop keeps the split-pane because its layout ignores the mobile-only detail class. The complete regression suite passed 433/433 and the Vite production build completed after the repair.
