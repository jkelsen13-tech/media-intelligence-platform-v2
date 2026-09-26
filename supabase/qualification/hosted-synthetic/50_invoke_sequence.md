# Hosted-synthetic bounded empty-POST sequence

**Source only.** Not authorization to invoke the live function. Empty POST must not carry work; `30_seed_runtime_and_work.sql` enqueues the single synthetic generation first.

Host contract (verified in `supabase/functions/source-comparison-generation-candidate/host.js`):

- `POST` only
- `Authorization: Bearer` + exact `MIP_QIK_WORKER_INVOKE_TOKEN`
- Body must be empty (`content-length` `0` or absent without `transfer-encoding`; Deno empty stream admitted only as EOF / one zero-byte chunk then EOF)
- Worker JWT `role` claim must be `mip_comparison_worker_v1`
- Success/failure JSON exposes `state` plus optional `recovered` / `held` only

Claim HTTP results are limited to what this sequence demonstrates. This is not hosted gateway/JWT/PostgREST qualification, not publication, and not cutover.

## Sequence

Use the deployed `source-comparison-generation-candidate` URL only after owner-gated deploy. Each step is one POST.

### (a) Refuse non-empty body

POST with a non-empty body (or `content-length` not `0`, or `transfer-encoding`) and a valid invoke bearer.

Expect: `400` with `{"state":"body_denied"}`. Zero worker RPCs.

### (b) Refuse bad invoke token

POST with empty body and `Authorization` missing, wrong, or not exactly `Bearer ` + invoke token.

Expect: `403` with `{"state":"denied"}`. Zero worker RPCs.

### (c) Success claim/complete after seed

Preconditions: install order through `30_seed_runtime_and_work.sql`; Route A JWT + Route B session secrets present; runtime/implementation match seed labels; one pending generation from producer_enqueue.

POST empty body with valid invoke bearer.

Expect: `200` with `{"state":"completed"}` if the journaled worker claimed the seeded generation and `worker_complete` returned `completed`.

The HTTP body does **not** include `generation_id`, lease token, or source payload. Do not treat this as evidence of public projection or real `public.events` reads.

If the host hits an ambiguous RPC/transport failure: `503` `{"state":"recovery_required"}`. That is not completion.

### (d) Second empty POST: replay/idempotent or `no_ready_work`

POST empty body again with the same valid invoke bearer.

The host mints a **new** `p_request` UUID per invocation (`crypto.randomUUID()`), so this is not a replay of the first `worker_claim` request id. After (c) consumes the single seeded job, scoped claim records `no_ready_work` and the worker returns idle.

Expect: `200` with `{"state":"idle"}` (SQL outcome `no_ready_work` / null claim).

A true journal replay (`mip_request_replay_omits_token`) would require repeating the **same** `p_request`. This sequence does not demonstrate that path. Do not claim journal idempotence from (d).

If journal discovery still holds an in-flight native claim, `state` may be `waiting_native_claim_recovery` or `recovery_required` instead. Stop; do not invent extra POSTs to drain.

### (e) Claim-result limit

This sequence demonstrates only:

| Step | Demonstrated | Not demonstrated |
|---|---|---|
| (a) | empty-body admission refuses payload | Deno/gateway framing beyond `host.js` tests |
| (b) | invoke bearer gate | provider gateway JWT `verify_jwt` |
| (c) | one seeded synthetic generation can complete through journaled worker RPCs | live public source reads; publication; scheduler |
| (d) | second admission finds no further ready work (`idle` / `no_ready_work`) | same-request replay; crash recovery matrix |

Do not expand the run to extra POSTs, payload POSTs that “help” the worker, or a second seed. Cleanup is `90_cleanup.sql` after the owner-authorized run, not an extra invoke.
