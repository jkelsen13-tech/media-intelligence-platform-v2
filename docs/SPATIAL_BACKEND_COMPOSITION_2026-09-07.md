# Shared spatial backend and live UI verification — 2026-09-07

World View now uses `mipBackend.publicData.spatial` for published spatial projections, its graph, the registered temporal assessment, and event-time weather. Database reads bind the same browser client and current session as the other workspace views. The existing project-origin allowlist, projection columns, revision pagination, temporal composer hash, publication semantics, and unavailable states are preserved. Explicit null cannot fall back to a globally configured client.

Weather still comes from the established Open-Meteo archive adapter. It uses recorded event time and display coordinates, carries reanalysis/provider/model provenance, and refuses present-day substitution. No database credentials are sent to the archive. The shared method accepts row/time only; callers cannot replace its transport or clock. This composition provides one frontend interface without pretending the external archive is a database record.

World View reloads when its backend changes, clears prior data, and ignores obsolete spatial, graph, temporal, and weather responses. Existing selection and revision rules remain intact.

## Camera finding and repair

The live check exposed an existing display defect: initial framing and Return to selected location positioned an oblique camera directly above the subject, then looked beyond it across Lake Erie. The marker was outside the useful frame and the terrain coverage edge dominated the view.

Both subject-framing paths now use the recorded point as a bounding-sphere target. Slant range is derived from the existing precision-class height and pitch, so the city height floor remains enforced. Saved free-camera restoration is unchanged. No coordinates, terrain heights, geometry, identity, or review state are modified. The real renderer preview centers the city marker on startup and return; measured camera height was about 34,881 m, above the 34,641 m city floor. Terrain shading remains derived from the approved terrain values.

## Deployed spatial write inventory

Read-only inspection of project `qikvmopbtijoebdqosyq` found `spatial-runtime` ACTIVE version 6, JWT verification enabled, bundle identifier `1f15a3947525158d4f6477b73d036b71ba614008652655a066f8400bc2638c50`. Retrieved files: `index.ts`, `config.ts`, `handler.ts`, `canonical.ts`, `jcs.ts`, `sha256.ts`, `operations.ts`, and `deno.json`. No corresponding runtime source directory exists in this checkout.

This is a controlled append service, not the World View SELECT route. The retrieved handler verifies the caller with Auth, checks profile existence, validates allowlisted operations, and uses the dedicated spatial writer role with canonical database functions and transaction rollback. Its twelve operations cover policy artifacts, audience scopes, assertions/revisions/lineage, evidence artifacts/snapshots/links, geometry snapshots, condition events, review decisions, and release decisions. This batch leaves that deployed write boundary unchanged; importing or consolidating its execution requires source registration and parity tests.

The other returned functions are the five private investigation domain endpoints and the shared investigation API. Repository ingestion/analysis workers remain absent from this Edge inventory. Their actual execution hosts and publication workflow still need verification before worker consolidation.

## Verification

- 112 focused tests passed: spatial SDK/frontend, public null isolation, projection and temporal contracts, launch rules, camera framing/restoration, and terrain display controls.
- Seven new tests cover more than 1,000 spatial revisions/nodes/edges, current-session headers, origin rejection, later-page failure, missing edges, temporal hash rejection, weather credential separation, rendered provenance, obsolete responses, and subject-centered camera geometry.
- A pre-existing Windows path conversion in the launch scanner was corrected without weakening its source restrictions. The duration guard now follows the bounded-sphere framing call.
- The real renderer ran locally with the installed engine and existing approved imagery/terrain. Startup and explicit return centered the recorded city point; no browser errors occurred. Frontend tests stub only GPU renderers while exercising the real World View and installed SDK.
- Full Linux regression and production-build results are recorded in the pull request after CI. No dependencies, migrations, production data, permissions, flags, or deployed functions changed.

## Prior visible releases checked after PR #66

PR #66 merged as `5f64eec61161eeda4da219267acba1037a4b747b`; main regression and Pages deployment passed. Live browser checks covered:

- Feed: three eligible articles, source metadata, retained-text claim labels, and explicit missing structured citations.
- Source Comparison: three outlets, extracted framing, unverified lineage, and Open in News resolving the New York Times article.
- Graph: the published eclipse node, evidence panel, honest unavailable source records, and no fabricated relationships.
- Timeline: the recorded eclipse event and sequence disclosure; Arcs: the current no-released-arcs state.
- Investigations: signed-out private records remain withheld. No authenticated assigned-user session was available for live positive verification.
- Review Status: the disabled provenance state. Legal & Policy remains absent from navigation under its existing beta gate; positive gated states were tested with fixtures, not enabled in production.
- World View: one released city projection, source-native times, the recorded uncertainty note, insufficient temporal history, and historical ERA5 reanalysis with provider/time labels. The camera defect found during this check is repaired in this batch.

The expected published states landed, but this does not claim all reference-screen data exists. Worker execution and source registration remain separate work. Reference: [Cesium target framing API](https://cesium.com/learn/cesiumjs/ref-doc/Camera.html#flyToBoundingSphere); Supabase changelog and current RLS documentation were checked before implementation.
