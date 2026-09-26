# Self-review — composed collector → native capture

Reviewer stance: inspect source and disposable tests only. No hosted SQL, Edge
deploy, Vault, cron, or real feed fetch. Golden / Deno / broker not rerun.

## Reused (not rebuilt)

| Source | Kept as-is / connected |
|---|---|
| PR #182 C3 | YHB v8 `parseFeed`, collection gate, run/observe RPCs, watermarks, disabled schedule intent, Edge dual-auth names |
| PR #181 C4 | `001_store.sql`, `store.mjs`, `bindExactCaptureBytes.mjs`, `installCaptureCas.mjs`, `captureCasRehydrate` cases (pipeline-capture bind **reused**, not rewritten) |
| PR #179 | Operation-ledger + exact-object cleanup **pattern** (`05` / `90`). Hosted-synthetic package was **not** copied or rebuilt |
| Repo native path | `public.mip_pipeline_v1` enqueue/finish, `mip_qik_ingest_claim_bound`, `revision_pending`, history triggers in `20260905082406_evidence_pipeline_reliability.sql` |

## Changed in this composition

1. C3 `retain_item` no longer `INSERT`s `public.articles` with `ON CONFLICT DO NOTHING`. That silently discarded changed titles at the same URL. Discovery is `qik_ingest.observed_items`; native enqueue is the retain handoff.
2. Collector drains **bound** job ids via `mip_qik_ingest_claim_bound` (same
   queue/lease rules as `claim_job`) then existing `mip_pipeline_v1` finish.
   Unscoped claim is refused. Identical hash → duplicate from native completed
   job state; unfinished own jobs are `unresolved`, not duplicates; changed
   content → `revision_pending`.
3. C3 `05_operation_ledger.sql` + `090_cleanup.sql` replace `DROP OWNED` /
   `DROP SCHEMA CASCADE`. Pre-existing package identities are refused.
   Recorded collection constraints are restored. Unrelated grants survive.
   Native articles/captures/history remain (append-only); hosted residual is
   an explicit owner-approved synthetic trail.
4. C4 `90_cleanup.sql` no longer `DROP FUNCTION … CASCADE` on `mip_cas`
   functions (that is not schema-limited). It refuses unapproved external
   view/trigger/function dependents and drops only recorded objects.

## Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | must-fix | C3 inserted articles and skipped jobs/captures/history | **CLOSE** — observe → enqueue/claim/finish |
| F2 | must-fix | C3 duplicate path discarded changed content | **CLOSE** — `revision_pending` |
| F3 | must-fix | C3 `DROP OWNED CASCADE` | **CLOSE** — #179-style ledger cleanup |
| F4 | must-fix | C4 assumed `mip_cas` function CASCADE stayed in-schema | **CLOSE** — refuse external dependents, RESTRICT drops |
| F8 | must-fix | Global `claim` mutates unrelated pending/expired jobs | **CLOSE** — `mip_qik_ingest_claim_bound` on explicit job ids |
| F9 | must-fix | Unfinished wanted jobs counted as duplicates | **CLOSE** — native `state`/`outcome`; `unresolved`/`failed` |
| F10 | residual | Package cleanup leaves native articles/captures/history | **OPEN** — documented retained synthetic trail; no append-only bypass |
| F11 | residual | Hosted owner/Vault/pooler/Data API/Edge/cron/live RSS | **OPEN** — this PR is database/driver qualification only |
| F12 | residual | Fixture `synthetic-only` rights are not a live grant | **OPEN** — C4 live remainder |
| F5 | note | PGlite `SET ROLE` / `SET SESSION AUTHORIZATION` | **OPEN** — not PostgREST |

## Corrections in this follow-up

- Bound claim/expire/finish on explicit job ids; unscoped `claim` throws.
- Outcome accounting from native job `state`/`outcome`.
- Hosted paste is database/driver qualification with operation-ID deltas and
  an explicit retained synthetic audit trail. Fixture-wide source disables are
  not copied into the hosted procedure.

No remaining must-fix inside the disposable composed scope.
