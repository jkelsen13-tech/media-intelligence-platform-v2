# Supabase-hosted capture retrieval

The capture runner now has an additive server entry point, `capture-retrieval`, on the current v2 Supabase project `qikvmopbtijoebdqosyq`. The frontend remains hosted by GitHub Pages. Project files and validation belong in GitHub; no checkout, input file or local worker is required for hosted execution.

## Contract

POST `https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/capture-retrieval` from an authorized server, with JSON and its server-held credential. If the configured credential starts with `sb_secret_`, send it on `apikey`; for a legacy JWT credential, use `Authorization: Bearer <server key>`. Gateway JWT verification remains enabled: include a valid project JWT on `Authorization` when using an opaque `apikey`. Passing gateway verification alone does not grant operator access; the handler additionally requires exact equality with its configured server credential. Anonymous or signed-in user tokens alone, incorrect secret keys, browser-origin requests, arbitrary routes and query parameters are rejected. Never put the server credential or endpoint client in the public frontend.

The deployed runtime can supply an opaque secret through `SUPABASE_SERVICE_ROLE_KEY`; the variable name is not a guarantee of JWT format. The adapter selects the header by actual credential format. Outbound database calls send opaque keys on `apikey` only, while preserving both headers for legacy JWTs. The Supabase administration tester may prefill a public key: replace its `apikey` with the server preset and supply a valid project JWT for the unchanged gateway check. No credential value should appear in test output or source.

- `{"action":"status"}` reads intake and evidence-change queue summaries. It does not claim jobs.
- `{"action":"retrieval","apply":true,"input":{"mode":"start","job_id":"<existing UUID>","lease_token":"<current lease UUID>"}}` processes one page for an explicitly selected leased capture job.
- Resume with `mode: "resume"`, `run_id` and the current lease for unfinished initial runs. Refresh uses `mode: "refresh"` and an explicitly selected completed capture `job_id`.

Inputs retain the existing runner's allowlist and UUID validation. The Edge entry point limits requests to 8 KiB, a five-second body read, one page by default and two pages maximum; page size is at most 25. Start/read, at most two page calls and final durable read each have the existing 25-second network timeout. This leaves headroom below the hosted request limit. A previously aging lease can still expire: inspect saved state and obtain a valid lease through the established operator contract.

The runner and transport live in `supabase/functions/_shared`; existing CLI imports re-export the same implementations. There is no second retrieval algorithm and no filesystem import in the hosted dependency graph.

Responses report `partial`, `completed` or `indeterminate` with identifiers and counts. They exclude lease tokens and retained text. Completion comes from database readback, including recovery from a lost committed-page response. Indeterminate operations return HTTP 502; callers must inspect durable state before retrying. All handler responses are private/no-store.

## Scope

This hosts explicitly selected retrieval; it does not activate scheduling, claim the mixed-producer queue, ingest external sources, run paid models or publish candidates. Producer-aware claiming remains a separate next step. The existing SQL contracts, leases, immutable manifests, publication gates and browser permissions are unchanged.

## Verification

The GitHub regression workflow runs the existing runner and database tests plus eight hosted-handler and transport tests covering authorization, request limits, read-only status, bounded execution, durable resume and sanitized failures. No local project files are needed. Live deployment and verification results are recorded in the accompanying pull request.

References: [hosted limits](https://supabase.com/docs/guides/functions/limits), [function authorization](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [shared function modules](https://supabase.com/docs/guides/functions/recursive-functions).

## Authoritative plan alignment

This bounded batch follows the owner-supplied *MIP Astra Extra High Work Plan Updated 2026-09-06*, especially its final Product Refinement and Refined Delivery Sequence. It continues active backend consolidation. The owner's 7 September instruction places backend execution in Supabase and frontend/source work in GitHub, with no local project files, superseding the plan's earlier local setup directions.

Invariant: moving an existing operator into a hosted runtime must preserve exact saved input/run identities, immutable prior results, explicit lease requirements and honest incomplete states. The hosted adapter cannot reinterpret lexical candidates as semantic support, independent corroboration, a changed conclusion or publication. New adversarial tests target unauthorized server execution and over-budget requests. Existing runner/database tests continue to cover late-arrival refresh and durable recovery. Merge remains explicitly gated by owner authorization.
