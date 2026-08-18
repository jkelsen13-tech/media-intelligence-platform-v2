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
