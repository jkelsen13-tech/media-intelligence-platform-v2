# Media Intelligence Platform v2

MIP is a React frontend for investigating news, evidence, source history, timelines and geographic context, backed by Supabase.

## Cloud workspace

- **Frontend source and validation:** [this GitHub repository](https://github.com/jkelsen13-tech/media-intelligence-platform-v2). Changes run through the Golden regression suite and production build in GitHub Actions.
- **Frontend hosting:** [GitHub Pages](https://jkelsen13-tech.github.io/media-intelligence-platform-v2/).
- **Backend:** Supabase project `qikvmopbtijoebdqosyq` (the current v2 account-verification project). Database records, access controls and deployed Edge Functions live there.
- **Development workflow:** make changes through GitHub without creating local project files. Use feature branches for review. Run GitHub Actions only when the owner has authorized the exact execution scope and budget.

### Agent pre-publication refusal

Before updating any remote ref, opening or updating a pull request, dispatching or rerunning a workflow, merging, or deploying, the agent must name the exact commits, target ref, changed paths, and event(s) the action would create. It must read every applicable workflow at the event SHA/ref, including push and pull-request branch/path filters, job conditions, reusable-workflow callers, and downstream workflow_run/repository_dispatch/check triggers. It must count all jobs expected from both push and PR events and verify explicit owner authority and remaining CI budget. If any triggered execution, charge, required check, or chained effect is unknown or unauthorized, **refuse publication and keep the ref unchanged**. A commit message containing `[skip ci]` is not proof of a no-CI route. Record the preflight result before publication and reconcile observed runs afterward. This gate also applies to source-only commits and evidence-repository updates.

The browser uses `mipBackend.publicData` for eligible public projections and `mipBackend.investigations` for the authenticated investigation API. Server credentials belong in Supabase's server environment, never in browser code or public build variables.

## Current backend work

The private investigation gateway is deployed as `investigation-api`. Public, news, comparison, chronology, evidence, curated and spatial reads share the frontend composition while preserving their access and historical contracts.

Capture retrieval has a Supabase-hosted operator entry point in this change; see [hosted retrieval](docs/HOSTED_CAPTURE_RETRIEVAL_2026-09-07.md) for its explicit request and saved-progress contract. Hosting this runner does not enable automatic ingestion, scheduling or publication. Do not infer active workers from older checked-in scripts.

## Architecture and progress

- [Backend consolidation](docs/BACKEND_CONSOLIDATION_2026-09-07.md)
- [Public reads](docs/PUBLIC_BACKEND_COMPOSITION_2026-09-07.md)
- [Spatial reads](docs/SPATIAL_BACKEND_COMPOSITION_2026-09-07.md)
- [Operator composition and remaining worker work](docs/OPERATOR_BACKEND_COMPOSITION_2026-09-07.md)
- [Investigation workspace](docs/INVESTIGATION_WORKSPACE_BLUEPRINT_2026-09-06.md)
- [Documentation index](docs/00_INDEX.md)

Historical schema/seed files and deployment notes describe earlier states. Compare registered migrations with the current remote database before making backend changes; do not replay historical setup instructions against v2.
