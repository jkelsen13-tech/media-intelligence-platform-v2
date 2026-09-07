# Shared public workspace backend

This batch follows the private gateway in PR #60, merged at `e8fd5a9cd5e0d44faeef5c00fa22f21c6e06d0e0`. Its Pages deployment and main regression run succeeded. The deployed feed retained three eligible articles, and private investigations required sign-in without browser console errors. A positive assigned-user production session was not available.

`mipBackend` now composes private investigations and public workspace reads from the same configured browser client. `App.jsx` uses `mipBackend.publicData` for the seven reads below. Public reads keep the client's current session and existing database publication/RLS contracts. They do not use the private gateway's service credentials.

| Method | Existing authoritative read | Unavailable behavior |
| --- | --- | --- |
| `loadGraph` | Published nodes and graph edges, keyset pagination | Node errors propagate; edge errors retain an explicit unavailable message. A configured empty graph stays empty. |
| `loadGraphCoverage` | `graph_coverage_public` | Null disclosure; stored counts are not completeness or reliability scores. |
| `loadNodeLocations` | `node_location_mentions` with released place context | Empty rows; no invented coordinates or precision. |
| `loadTopics` | Topics and paginated node/topic memberships | Null taxonomy when unavailable. |
| `loadCorpusMeta` | Eligible article count and latest recorded fetch | Unknown values for denied access; other failures retain the existing error contract. |
| `loadInvestigationSurface` | `investigation_surface_public`, exact canonical event ID | Null when unavailable; unknown article counts remain unknown. |
| `resolveEligibleArticleForNews` | Eligible article URL lookup | Missing, pending and withheld URL targets remain unresolved. A direct ID is only a navigation hint; the destination article reader still enforces eligibility. |

Construction performs no requests. Each method keeps its existing independent request/error lifecycle, including App's subject-change cancellation guard. The shared interface does not claim an atomic snapshot across separate reads. No response cache or session token is captured.

The seven underlying loaders now distinguish an omitted client override from explicit null. Omitted/undefined overrides retain the legacy global default. Explicit null stays unconfigured even when a global client exists. This prevents an isolated backend instance from falling through to a different connection. The factory defaults to null; production explicitly supplies the configured client. Unconfigured graph reads retain the existing labeled demo contract.

## Verification

Six new tests cover a configured global-client isolation regression, the installed Supabase SDK's current-session/browser-key headers, keyset/composite pagination beyond 1,000 rows, provenance and location uncertainty, eligible-only corpus and URL joins, exact canonical identity, unknown counts, optional-read isolation and App composition. The SDK transport uses an invalid test hostname and synthetic rows. It verifies request and response behavior; existing PGlite publication-gate tests separately verify SQL permissions and reviewer revocation.

Adjacent graph, identity handoff, pagination, publication gate, authenticated review/revoke and public-surface tests are run alongside the new tests. Full regression and production build verification run in Linux CI due the previously observed Windows memory limit during full builds.

Local validation passed all six new tests and 77 adjacent checks. The full Vite development preview crashed in the browser while loading, so it is not counted as a successful full-app browser check. A smaller isolated preview rendered the real GraphView and coverage component from synthetic data loaded through the new backend and the installed SDK. Graph fit and expanded coverage worked without browser console errors. Its fixture and build artifacts are ignored and do not ship.

No database migration, Edge Function redeployment, production record write or visual redesign is required by this frontend composition change. Existing private gateway source and pinned historical contracts are unchanged.

## Remaining batches

Public feed/detail, timeline, arcs, comparison and specialist legal/policy reads still need to join the composition. The World View spatial runtime still requires deployed-source reconciliation before consolidation. Ingestion and analysis workers need a verified deployment inventory and publication workflow before their execution can be combined. Legacy private endpoints remain available pending a separately reviewed retirement. This is a bounded step toward one coherent backend, not a claim that consolidation is complete.
