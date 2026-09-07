# Hosted single-capture worker

Extends the existing server-only `capture-retrieval` endpoint with `{"action":"run-next","apply":true}`. Optional `input` accepts only `maxPages` (1–2, default 1) and `pageSize` (1–25, default 25). Validation precedes backend construction and claiming.

The fixed operator facet calls `mip_evidence_change_claim_v1` for `new_candidate_search` and `capture` only. Exactly one claim is made per request. The existing retrieval runner starts or resumes the claimed job's saved initial run, processes the bounded pages, then verifies durable state. No synthetic finish/fail or automatic retry is issued.

Results are `no_ready_capture`, `partial`, `completed`, or `indeterminate` (HTTP 502). A null claim means no capture job is ready now, not that the queue is empty or collection complete. An unreadable/lost claim may have acquired a lease: inspect queue state before another invocation. Responses omit leases, retained text and target identities.

## Recovery and limits

Partial work retains its immutable target manifest and progress. An operator can use the existing explicit retrieval/resume operation with the saved run ID and current server-held lease. This endpoint does not expose the lease. If it expires, the existing producer-scoped claim recovers it with backoff and a later claim resumes the same run. This consumes the existing five-attempt budget; do not use repeated expiry as an unlimited paging mechanism. Larger searches need deliberate continuation under a valid lease, not a scheduler that blindly repeats run-next. Indeterminate results require durable inspection, including when a start committed but its response was lost.

At most claim + start + two pages + durable read are requested, with existing 25-second network timeouts. The claim precedes lease processing; start/pages/read fit within 100 seconds of request timeouts, below the two-minute lease. The full five-call budget is 125 seconds plus bounded request parsing, below the hosted 150-second idle limit. No external retrieval, semantic assessment, publication or scheduling is enabled.

Existing server credential checks, opaque/legacy header behavior, JWT gateway verification, origin denial, status reads and explicit retrieval remain intact. No database migration is needed. Shared deployed files are reconciled before rollout.

## Verification

GitHub-only tests exercise the actual handler, operator transport and PGlite migrations: partial recovery to the same run, lost claim/start/page responses, unsupported producer preservation, one completion receipt, private results, no publication and no assessment creation. Unit checks cover input/auth rejection, fixed producer selection, malformed claim responses and credential separation. Positive production processing requires an ordinary ready capture; none was pending at the prior batch. Do not seed production fixtures or consume record-version jobs to manufacture that demonstration.

Deployment and live verification pending current-head CI. References: [Supabase hosted limits](https://supabase.com/docs/guides/functions/limits).
