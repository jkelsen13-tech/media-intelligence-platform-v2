# Saved input references

This batch continues Source History (PR #53). Each retained capture can explicitly request the saved assessments, hypotheses, and commitment stages that reference its exact input position in the displayed immutable version. The reference disclosures lead to the existing exact-excerpt inspector. Desktop capture comparisons remain in two columns; mobile captures stack.

## Meaning and limits

- Assessment references are membership in selected assessments' saved `context_positions`, including inherited context. They do not establish support, independence, causality, or a withdrawal result.
- Hypotheses distinguish direct evidence citations from links to selected assessments whose context includes the input.
- Commitment stages include direct citations only. Prerequisite links do not imply a citation or downstream impact.
- Missing assessment context remains unresolved. Empty results mean no reference in the inspected fields, not irrelevance or no use elsewhere.
- The lookup does not withdraw inputs, append assessments, create reports, change saved definitions, or mark a version reviewed. It is groundwork for inspecting dependencies, not counterfactual recomputation.

## Server contract and access

The new `investigation-input-impact` Edge Function accepts only a JSON POST with `action: "read"` and exact `input` keys `investigation_id`, `version_id`, and `position`. IDs are required UUIDs; position stays a canonical positive PostgreSQL bigint decimal string, including values above JavaScript's safe integer range. The body is limited to 8 KiB. Responses are private and no-store; browser origins are allowlisted.

The function reuses the existing fixed-project workspace transport for Auth user verification and the service-only `mip_investigation_workspace_v1` RPC. Only the `read` action is called, with the verified user ID. Existing SQL verifies the current assignment and that the requested version belongs to that investigation in one read. Anonymous users, revoked assignments, browser-supplied principals, and cross-investigation versions cannot obtain references. The server checks returned investigation/version/observation identities and returns a projection of this authorized immutable bundle. No SQL migration or new RPC privilege is needed.

The browser checks every returned reference against the displayed version and input. Switching versions/captures, unmounting, or a superseding request invalidates pending results. A current authentication/access failure clears private workspace state through the existing lifecycle; a failure from a departed bundle cannot clear a newly selected investigation. Requests occur only when a user selects the lookup button.

## Validation

New tests exercise the real SQL migrations with PGlite, the HTTP handler, browser adapter, React rendering and workspace lifecycle. Cases include late corrections outside an earlier snapshot, exact Unicode citations, bigint positions, repeated links, missing context, read-only behavior, revoked and anonymous access, invalid requests, upstream identity mismatches, retries, stale responses, and exact inspector callbacks.

Local browser verification uses explicitly synthetic data with the actual frontend, HTTP handler, and projection (the preview's RPC is a fixture). Populated and empty results, refresh, exact-excerpt drilldown, desktop and 390/320px widths were checked. This does not establish a populated signed-in production result. The public PR #53 deployment and signed-out investigation boundary were checked separately. Local Vite production bundling encountered Windows memory exhaustion; GitHub's Linux checks are the production-build gate.

## Release and rollback

After explicit release approval, deploy `investigation-input-impact` to project `qikvmopbtijoebdqosyq` with `verify_jwt: true` before merging the frontend PR. Include `index.ts`, `handler.mjs`, `impact.mjs`, and the unchanged sibling `investigation-workspace/handler.mjs` in the function bundle so its relative transport import resolves. Existing project URL, anon-key, and service-role environment secrets are reused; do not place service credentials in the frontend. Verify deployed metadata and unauthenticated rejection, then merge the reviewed frontend commit and verify the Pages deployment. An assigned signed-in user is needed to validate populated production behavior.

No database state changes are part of this release. Frontend rollback removes the lookup controls; the new read-only function can then be removed or rolled back independently. An absent/unavailable function shows a retryable unavailable state rather than fabricated references. Existing source history and workspace reads remain available.
