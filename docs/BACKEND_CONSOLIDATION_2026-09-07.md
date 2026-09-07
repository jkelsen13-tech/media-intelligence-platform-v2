# Backend consolidation: private investigation API

The target is one coherent backend feeding the frontend through shared identities, retained versions and explicit access contracts. This first consolidation batch replaces five separately wired private API connections with one deployed entry point and one frontend composition root. It follows PR #59, merged at `0269de1754826a85913fb1c078d24a366979d38f` and verified on Pages.

## Current architecture and this batch

All five private investigation services already use the same V2 Supabase project, `qikvmopbtijoebdqosyq`. Their domain separation does not represent five independent databases. The fragmentation was at the API and frontend composition boundaries.

The production frontend now imports `mipBackend` from `src/lib/mipBackend.js`. Its `investigations` interface supplies workspace, evidence checks, evidence reviews, input references and source spans. `App.jsx` and the investigation inspector use this shared composition. Existing injectable fixture clients remain available for tests; production construction makes no requests and captures no session token.

| Frontend capability | Unified route | Authoritative backend |
| --- | --- | --- |
| `investigations.workspace` | `investigation-api/workspace` | Workspace RPC: assigned list/read and explicit review acknowledgement |
| `investigations.checks` | `investigation-api/checks` | Evidence-check RPC: saved report/read and explicit reviewer run |
| `investigations.reviews` | `investigation-api/reviews` | Evidence-review RPC: relevance decisions, history and repeat-request/conflict handling |
| `investigations.inputImpact` | `investigation-api/input-impact` | Authorized workspace read plus existing saved-reference projection |
| `investigations.sourceSpans` | `investigation-api/source-spans` | Authorized workspace read plus existing exact-text comparison |

The gateway imports the existing domain handlers directly. It does not call other Edge Functions, copy records, combine response snapshots, invent a second graph, or expose arbitrary RPC names. One shared Auth transport verifies the current user per request. Each handler keeps its input allowlist, byte limit, error mapping and service-only RPC. Membership, reviewer privileges and version/report identity still resolve in the existing database contracts.

The route is `/functions/v1/investigation-api/<capability>` externally; the runtime's `/investigation-api/<capability>` path is also accepted. Unknown routes, extra path segments and query parameters are rejected. Only domain POST/OPTIONS methods are supported. Response envelopes are unchanged, with `X-MIP-Backend: investigation-api-1` added for release verification. Allowed Pages origin and private/no-store responses remain enforced. There is no cache, automatic retry, legacy endpoint fallback, or public projection through this private gateway.

## Verification and deployment

The new `investigation-api` Edge Function is deployed ACTIVE, version 1, with JWT verification enabled. All nine deployed files were read back and exactly matched the tested source bytes. The accompanying verifier JSON records source hashes and live route checks. Existing functions and database schemas were not changed; no migration, sample investigation, assignment or analyst record was written to production.

Live HTTP checks verified each of the five actual routes: Pages-origin preflight returns 204, and a legacy anonymous API token reaches the handler but receives `authentication_required` with 401 and private/no-store headers. This verifies routing and anonymous denial, not a positive signed-in user's live data request. PR #59's live page also retained the signed-out investigation boundary without console errors.

Eleven new tests cover deployed source hashes, dispatch, malformed/oversized requests, origin denial, authentication failures, sanitized errors, credential separation, no recursive HTTP calls, and no frontend retries/fallback. The SDK integration test uses the installed FunctionsClient, the actual gateway/domain handlers and real PGlite migrations. It exercises all five domains, reviewer commands, identical and conflicting retries, exact review history, viewer/outsider/revoked denial, session changes, and late correction isolation. The SDK test uses an invalid test hostname and an injected fetch transport, so fixtures cannot fall through to production.

The focused tests pass, including existing frontend/lifecycle tests and their pinned backend-file checksums. Updated application-wiring checks reflect the shared composition; three touched test files now use file URLs for their Windows imports. The full regression suite and production build run in Linux CI because prior full local Vite builds reached Windows memory limits.

Synthetic browser verification exercised all five unified routes, saved input references, exact changed-text inspection, historical navigation, report/review loading, and an outage followed by explicit retry. Captured server requests used only `investigation-api/*`; browsing issued list/read actions only. No browser console errors occurred. Preview artifacts are ignored and do not ship.

## Release and remaining consolidation

Deploying the additive gateway precedes the frontend cutover. After explicit PR merge approval and successful current-head CI, Pages will switch the five private capabilities together. Verify the deployed frontend afterward. Existing standalone endpoints remain compatible during rollout; deleting or disabling them is a later reviewed retirement step. Do not change the pinned historical handlers or replay their registered migrations.

The wider backend is not yet fully consolidated:

1. Public feed, graph, arcs, source comparison, legal/policy and explanation reads still use the existing functions in `src/lib/supabase.js` and their specialist read-path modules. They must join the common frontend interface with explicit eligible/public projection contracts, pagination and historical semantics. Private service credentials must not bypass publication gates to make those reads appear unified.
2. World View uses `src/lib/spatialProjection.js` and the separately deployed `spatial-runtime` (version 6 observed at preflight). Preserve its eligibility, navigation and revision contracts while connecting it to the same composition. Its deployed runtime is not represented by a matching top-level function directory in this checkout, so reconcile source registration before changing it.
3. Ingestion/extraction and analysis code includes repository functions such as `ingest-rss`, `batch-intake`, `graph-analysis-run`, `source-comparison-run`, and `services/extraction/main.py`. These were absent from the returned live Edge Function inventory. Verify their actual deployment and authoritative publication workflow before treating them as active workers or combining execution.
4. The next batch should establish the public-read contract and route inventory, then move one bounded eligible data path into the shared composition with regression tests. Add broader snapshots only after proving revision consistency; a common URL alone does not make independent queries atomic.

Source origins, semantic reassessment, calibrated confidence and external retrieval remain their own evidence requirements. Consolidation must preserve their explicit unknown/unfinished states.

Implementation references: [Supabase function Auth](https://supabase.com/docs/guides/functions/auth-legacy-jwt) and [direct shared-library composition instead of nested function calls](https://supabase.com/docs/guides/functions/recursive-functions). The current changelog was checked before implementation; the listed Management API logs and extension-version changes do not affect this route-only deployment.
