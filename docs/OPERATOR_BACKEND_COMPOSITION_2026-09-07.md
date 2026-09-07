# Shared operator backend and bounded capture retrieval

The server-side intake CLI and the new capture-retrieval runner share `createOperatorBackend`. Its three fixed facets call the existing `mip_pipeline_v1`, `mip_evidence_changes_v1`, and `mip_capture_retrieval_v1` RPCs on `qikvmopbtijoebdqosyq`. Existing intake imports remain compatible through `createPipelineRpc`. Actions and the origin are allowlisted, redirects are refused, requests have a 25-second timeout, and unreadable successful responses are errors rather than empty queue results.

This is the operator side of backend composition. The browser continues through `mipBackend.publicData` and the authenticated investigation gateway. Service credentials belong only in `MIP_PIPELINE_URL` / `MIP_PIPELINE_SERVICE_KEY` in the server environment. Neither module belongs in `src/`, a Vite environment variable, or a public artifact. The live RPCs were checked read-only: all three are security-invoker, callable by service_role, and unavailable to anon/authenticated.

## Commands and durable progress

`node scripts/runCaptureRetrieval.mjs status` reports intake and change-queue counts without claiming work.

`node scripts/runCaptureRetrieval.mjs retrieval input.json --apply` runs one explicitly selected retrieval. The input is limited to 8 KiB and accepts only:

| Mode | Identifiers | Operation |
| --- | --- | --- |
| `start` | `job_id`, `lease_token` | Start or recover the initial run for an already claimed capture new-candidate-search job. |
| `resume` | `run_id`, optional `lease_token` | Continue the saved manifest. An unfinished initial run needs its current lease; refresh runs do not. |
| `refresh` | `job_id` | Freeze the currently visible capture set for a completed capture job, preserving older runs. |

All modes accept `maxPages` (default 4, range 1–80) and `pageSize` (default 25, range 1–25). For example, a private operator input for a saved refresh is `{"mode":"resume","run_id":"<existing-run-UUID>","maxPages":4}`. Replace the placeholder with an existing identifier; do not commit lease files.

The runner never claims arbitrary queue items. The current generic queue mixes capture and record-history producers, and the lexical retriever supports captures only. It also never writes a queue completion receipt or failure itself. The established database page operation atomically validates manifest coverage, saves results, and completes the initial queue job.

After paging, the runner reads the saved run. It reports `completed` only when that run has a valid completion time and its saved progress covers the whole manifest. `partial` means the page budget ended with work remaining. `indeterminate` means the operation or readback could not be verified; the CLI exits nonzero. A lost committed page response can resolve to completed through readback. A lost start response can be retried with the same job/lease; no compensating mutation or new job is created. Reports contain identifiers and counts, never retained text or lease tokens.

The database's two-minute lease, five-attempt cap, immutable results, 2,000-target snapshot ceiling, and lexical-only meaning remain unchanged. Large/slow batches can outlive a lease; stop and inspect durable state, then resume using a legitimately renewed lease. This runner does not renew or reacquire leases. Refresh earlier completed jobs explicitly to include concurrent arrivals; no high-water mark or corpus-wide completeness is asserted. Lexical overlap creates private candidates, not semantic assessments, independent corroboration, or publication.

## Deployment boundary and next batch

No schema migration, function replacement, production queue write, source ingestion, publication, or scheduler activation is part of this batch. Earlier read-only inventory found no ingestion Edge Functions, no `cron.job` table, and no recorded Cloud Run deployment workflow runs. The checked-in Cloud Run extraction service is a health-only scaffold. External worker execution remains unverified.

The next worker step is an additive producer-aware claiming contract with atomic lease semantics and tests proving unsupported history notices remain untouched. Other dependency/semantic adapters and the deployed spatial writer require their own source registration and parity checks. Deploying the operator runner requires a verified server host; GitHub Pages hosts the browser, not this worker.

## Verification

Focused tests exercise the shared transport, route/origin rejection, malformed responses, bounded resume, missing/expired leases, empty manifests, lost responses, false receipts, explicit write gating, and read-only status. The real SQL fixture drives intake through retained captures, queue leases, partial retrieval, lost-response recovery, idempotent completion, and refresh for a late historical capture. It checks one completion event, preserved earlier manifests, private results, no semantic assessments, and pending-review article state. The fixture transaction rolls back.

The initial local PGlite run exhausted the Windows WebAssembly compiler's memory. Running the same database tests with one compilation task and baseline WebAssembly compilation passed; full standard Linux CI remains the merge gate. This batch changes no public UI or released data, so post-merge verification must confirm Pages deployment and continued rendering of the existing public views.
