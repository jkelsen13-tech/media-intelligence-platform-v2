# Saved input-impact identity integrity — 8 September 2026

The saved-trail frontend already rejected duplicate assessment identities. Its
server input-impact projection and browser response validator still built maps
that selected the last duplicate row. A conflicting or identical duplicate could
therefore become a definite context relationship or display arbitrary reasoning.

This batch treats every repeated assessment identity as unresolved, independent
of row order and number of duplicates. Unique unrelated references and explicit
citations remain available. An ambiguous selected input fails with a sanitized
service-unavailable response; it is not reported as missing evidence.
The browser validates the same identity rule before rendering saved reasoning.
No inference, reassessment, review receipt or publication decision is written.

## Changed paths

- supabase/functions/investigation-input-impact/impact.mjs
- src/lib/investigationInputImpactClient.js
- tests/inputImpactIdentityAmbiguity.test.mjs
- tests/investigationInputImpactFrontend.test.mjs
- tests/investigationApi.test.mjs
- verifier/investigation-api-input-identity-2026-09-08.json
- .github/workflows/world-weather-preview.yml
- This document.

## Verification and deployment boundary

The counterexample was reproduced against main d02edd7. New cases cover
conflicting/identical/triple duplicate assessments, row reversal, unrelated input
duplicates, exact positions, frontend/server agreement, immutable snapshots,
rendered unresolved copy, and both standalone and composed API error envelopes.
Existing PGlite integration tests cover authorized exact-version reads and revoked
access. Full regression/build and representative browser checks run in GitHub.

The version-2 deployment receipt is historical and remains unchanged. The new
manifest binds the candidate nine-file composed bundle. Deployment must preserve
all other files and JWT configuration for both investigation-api and the compatible
investigation-input-impact endpoint on qikvmopbtijoebdqosyq.
Do not infer positive signed-in live verification from anonymous boundary checks.

No new dependencies, donor code, datasets, providers or notices are introduced.
No database migration, evidence edit, assignment, grant, worker activation, legacy
cutover or paid service is part of this batch. Source remains in GitHub and deployed
runtime in Supabase; no project files are stored on the owner's device.
The full consolidation gate remains incomplete. Next work remains the qualified
producer/collector prerequisites and bounded source-rights packages in the governing plan.
