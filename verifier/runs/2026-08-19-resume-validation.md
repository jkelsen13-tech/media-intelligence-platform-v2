# Resume Validation — 2026-08-19

This record documents the validation performed when resuming the authorized v2 work.

## Live deployment

The public GitHub Pages application at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` was reopened on 2026-08-19. After hydration, it rendered the intended light public-knowledge visual system, including white article cards, dark ink text, blue accents, and the pale information banner. The active page reported a live corpus of **767 articles**, updated approximately one hour before the check. The primary navigation exposed **News Feed**, **Knowledge Graph**, **Causal Timeline**, **Story Arcs**, **More**, and **Sign in**.

The News view was functional: search, outlet filters, status filters, articles, and a Load more action were visible. Region, Evidence, and Topic controls remained clearly marked as presentational/orientation controls whose filtering is not wired; this is a known, explicitly disclosed state rather than a new regression. The browser capture is stored at `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_02-06-51_1723.webp`.

## Local verification

At commit `1969e23` on `main` (matching `origin/main`), `npm test` passed **418/418** tests with no failures. `npm run build` completed successfully. The build emitted existing non-blocking chunk/dynamic-import warnings; no compilation failure occurred. The working tree remained clean after verification.

## Isolated configuration check

The isolated Supabase sandbox `mip-v2-manus-sandbox-20260818` (`yhbwnrtlqbjtcrrlpbge`) was confirmed active and healthy. Its `pipeline_config.track_b_light_theme` value is `true`, consistent with the rendered light deployment. No database write or production resource change was made during this resumed validation.

## Cross-surface visual verification

The published **Causal Timeline** was opened directly. It rendered the arc-scoped `Documented DOJ consent-decree actions (2025)` view with three dated accountability events, the shared Timeline / Connections / Evidence controls, date and event-type filters, explicit `Sequence only` relationship labels, `Confirmed` statuses, `Open Evidence (5 articles)`, `Open Connections (6)`, and the locked explanatory boundary that chronology does not imply causation. Capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_02-07-08_4561.webp`.

The published **Knowledge Graph** was opened directly. It rendered the focused 7-of-8-node graph with six documented relationships, a `Show full graph (8 nodes)` control, relationship/geography/time views, region selection, an expansion control, hypothesis/topic affordances, zoom/reset controls, and the evidence-model legend. The legend distinguishes causal from sequence claims, describes relationship labels in plain language, presents a reliability control, and states that edges are neutral until selected or hovered. Capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_02-07-14_7015.webp`.
