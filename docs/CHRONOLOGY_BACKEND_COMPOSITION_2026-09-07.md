# Shared chronology backend — 2026-09-07

Timeline, grouped Timeline, and Arcs now consume `mipBackend.publicData.chronology`, composed from the same browser Supabase client as News and the other public reads. Its eight methods cover arc lists, details, articles, connections, attributed excerpts, global chronology, grouped chronology, and the grouped feature flag. Child views and excerpt cards receive that same interface.

The existing public projections, RLS, publication rules, identifiers, availability states, and event-versus-publisher-record distinction remain authoritative. Construction makes no requests and stores no session token. Requests use the client's current session. An explicit null client cannot fall back to the configured global client; legacy offline behavior remains available. No schema, Edge Function, service-role routing, or dependency change is included.

Arc detail reads previously stopped at the database's default 1,000-row response limit. Both public milestones and arc events now paginate by stable identity with the arc filter on every page, then restore ascending chronology with undated rows last. A later-page failure rejects the result instead of showing an incomplete result as complete. Missing public arc titles display as “Untitled story arc” in Timeline selectors and Arcs headings/list entries.

## Verification

- Six new installed-SDK contract tests cover all eight methods, explicit null isolation, current-session headers, 1,002 events and 1,003 milestones, per-page arc isolation, ordering, later-page failure, empty/error states, grouped feature flags, and record/relationship semantics.
- 57 focused tests passed across chronology, News, public backend composition, pagination, public milestone projection, and timeline screen contracts.
- Browser preview used real Timeline and Arcs components with the real shared interface and a synthetic SDK transport. Verified flat and grouped chronology, attributed article excerpt, evidence and pending milestones, Arcs Overview/Timeline/Evidence, and missing-title labels. The preview's standalone bundler needed automatic JSX configuration; the corrected preview ran without new application errors.
- Full regression and production-build results are recorded in the pull request after Linux CI. Local Windows resource limits make Linux CI the full-suite gate.
- PR #62 was merged as `112c77846922ad99ca33fe7c7e1230f2d6659d4c`; its main regression and Pages deployment succeeded. Live News showed three eligible articles, correct Fox News detail after switching articles, and no browser errors.

## Remaining consolidation

Source comparison and specialist evidence/spatial panels still need their remaining direct reads brought under the shared root. Reconcile the deployed spatial runtime source and actual worker inventory before consolidating their execution. Private operations already use the unified investigation gateway; public browser reads retain their own RLS boundary. This batch advances a shared backend contract and does not claim every worker or specialist read is consolidated.
