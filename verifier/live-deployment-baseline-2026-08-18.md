# Live Deployment Baseline — 2026-08-18

The public GitHub Pages deployment was opened at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` before implementation work.

| Check | Observed state |
|---|---|
| Deployment availability | The page loaded successfully and exposed News Feed, Knowledge Graph, Causal Timeline, Story Arcs, and More navigation. |
| Initial route | News Feed loaded with an eight-article live corpus and a visible search field plus filter controls. |
| Theme parity | The rendered page used a black/dark visual system rather than the light, blue-accented card system in the owner-supplied mobile references. |
| Reference alignment | The visible header, information hierarchy, bottom navigation treatment, controls, and article-card treatment did not yet align with the supplied mobile News reference. |
| Functionality signals | Region, Evidence, and Topic controls expressly indicated that filtering is planned but not wired. |

This is an observation baseline only. It is not evidence that the intended production flag, repository branch, or deployment workflow is in sync; those are verified separately.

Screenshot captured by the browser session: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-18_18-47-53_1566.webp`.

## Reference basis

The owner supplied the mobile News, Graph, Timeline, Arcs, Source Comparison, Legal & Policy, and Location Corroboration screens in this task. The blue outer area behind white content cards is explicitly excluded from this comparison because it will become animated.

## Follow-up live check

A second live-deployment check confirmed that the public build is connected to an eight-article corpus and exposes the flag-gated **More** and **Sign in** controls. The visual theme still resolves to the dark fallback, which is incompatible with the owner-supplied light card references. Because the isolated Supabase sandbox contains exactly eight articles and matching configured features, the live deployment is very likely connected to that sandbox rather than rendering the bundled static demo dataset. The immediate diagnostic scope is therefore the persisted `track_b_light_theme` flag value or its public read policy, not the absence of a client configuration.

Screenshot captured: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-18_18-51-42_5092.webp`.

## Light-theme reconciliation

At 2026-08-18 19:10 EDT, the isolated sandbox flag `pipeline_config.track_b_light_theme` was updated from JSONB `false` to JSONB `true`. The actual GitHub Pages deployment was reopened immediately afterward. It rendered the expected light reading surfaces, ink text, blue structural accents, pale information banner, and white article cards while retaining the eight-article live corpus and active navigation. This closes the observed flag-state mismatch; the excluded blue outer background remains intentionally untouched.

Screenshot captured: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-18_19-10-28_8559.webp`.

## Published Phase 3 release check

After commit `b2b84cd` was pushed to `main`, the live GitHub Pages application was reopened and allowed to hydrate. The build completed successfully: the existing light news surface remained functional and the **More** control appeared in the primary navigation, confirming that the isolated `phase3_beta=true` flag is being read by the live build. The next validation step is to open the More sheet and inspect the Legal & Policy policy cards.

## Live Legal & Policy navigation check

The public **More** sheet exposed both Source Comparison and Legal & Policy. Legal & Policy loaded all six isolated Project 2025 Track 1 stated-objective cards with the required draft status, 2023-04-21 capture date, method tag, separated empty actual-outcome strip, and explicit remaining-uncertainty text. No outcome, composite score, or Callais relationship was presented.

At this check, the two new policy-card provenance lines (owning agency and chapter/page source locator) were absent from the live output despite the deployment workflow reporting success for commit `b2b84cd`. This was treated as a live deployment mismatch rather than accepted. The source code and deployment target must be reconciled before final closure.

## Final published provenance confirmation

A cache-busted live check resumed after the Pages workflow completed. Legal & Policy now visibly renders `Owning agency: DOJ` and the complete structured source locator on every Project 2025 policy card. All six card rows retain the distinct **stated objective** lifecycle, `draft` review status, the 2023-04-21 source-capture date, explicit primary-source requirement for any later outcome, and an empty actual-outcome strip. This resolves the transient post-deploy visibility lag and passes the desktop live-screen content check.

## Responsive News validation

Independent Chromium captures of the actual GitHub Pages release were reviewed at **390 × 844** and **1440 × 1024**. The mobile view preserved the intended light card system, readable masthead, evidence banner, search/filter affordances, rounded article cards, and fixed five-item bottom navigation. The desktop view preserved the same light-card hierarchy and evidence-first copy with a stable top navigation and no overflow observed. The supplied blue outer animated-background treatment was intentionally not changed, per owner direction.

Captured evidence: `verifier/screenshots/live-mobile-news.png` and `verifier/screenshots/live-desktop-news.png`.

## Cross-surface integrity: graph boundary

The live Knowledge Graph remains reachable and renders its explicit empty-state copy: no published graph nodes or documented relationships exist in the isolated live sandbox. This is consistent with the documented separation between the Phase 3 policy tracker and graph/arc tables. No Project 2025 graph node, edge, causal tag, or arc was fabricated merely to fill the Graph screen; adding one would exceed Document 08’s authorization and violate its no-Callais-link rule.

## Cross-surface integrity: Timeline and Arcs

The live Causal Timeline remains reachable with its reference-aligned controls and an explicit zero-event empty state. The live Story Arcs surface remains reachable with its explicit no-arcs state. These screens are not silently populated with Project 2025 data because the approved Track 1 record is a bounded Phase 3 policy-lifecycle canary, not a graph, article, timeline, or arc publication. The results are internally consistent: News contains eight independently ingested articles; Graph, Timeline, and Arcs contain no published derived records; Legal & Policy contains the six approved curated policy objectives.

## Responsive Legal & Policy validation

A DevTools-emulated live capture at **390 × 844** opened More → Legal & Policy successfully. The light-card layout retained a usable fixed bottom navigation; the Legal & Policy banner, policy title, draft status, agency, source locator, stated-objective pill, and explicit empty actual-outcome copy all fit without horizontal clipping or background artifact. The policy remains visibly framed as a source-stated objective, not an executed outcome.

Captured evidence: `verifier/screenshots/live-mobile-phase3.png`.
