# Self-review — composed collector → native capture

Reviewer stance: inspect source and disposable tests only. No hosted SQL, Edge
deploy, Vault, cron, or real feed fetch. Golden / Deno / broker not rerun.

## Reused (not rebuilt)

| Source | Kept as-is / connected |
|---|---|
| PR #182 C3 | YHB v8 `parseFeed`, collection gate, run/observe RPCs, watermarks, disabled schedule intent, Edge dual-auth names |
| PR #181 C4 | `001_store.sql`, `store.mjs`, `bindExactCaptureBytes.mjs`, `installCaptureCas.mjs`, `captureCasRehydrate` cases (pipeline-capture bind **reused**, not rewritten) |
| PR #179 | Operation-ledger + exact-object cleanup **pattern** (`05` / `90`). Hosted-synthetic package was **not** copied or rebuilt |
| Repo native path | `public.mip_pipeline_v1` enqueue/claim/finish, `revision_pending`, history triggers in `20260905082406_evidence_pipeline_reliability.sql`, news-intake adapter/worker **actions** (JS `nativeHandoff.mjs`) |

## Changed in this composition

1. C3 `retain_item` no longer `INSERT`s `public.articles` with `ON CONFLICT DO NOTHING`. That silently discarded changed titles at the same URL. Discovery is `qik_ingest.observed_items`; native enqueue is the retain handoff.
2. Collector drains existing `mip_pipeline_v1` claim/finish. Identical hash → duplicate; changed content → `revision_pending` without overwriting reviewed rows or capture `review_state`.
3. C3 `05_operation_ledger.sql` + `090_cleanup.sql` replace `DROP OWNED` / `DROP SCHEMA CASCADE`. Pre-existing package identities are refused. Recorded collection constraints are restored. Unrelated grants survive.
4. C4 `90_cleanup.sql` no longer `DROP FUNCTION … CASCADE` on `mip_cas` functions (that is not schema-limited). It refuses unapproved external view/trigger/function dependents and drops only recorded objects.

## Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | must-fix | C3 inserted articles and skipped jobs/captures/history | **CLOSE** — observe → enqueue/claim/finish |
| F2 | must-fix | C3 duplicate path discarded changed content | **CLOSE** — `revision_pending` |
| F3 | must-fix | C3 `DROP OWNED CASCADE` | **CLOSE** — #179-style ledger cleanup |
| F4 | must-fix | C4 assumed `mip_cas` function CASCADE stayed in-schema | **CLOSE** — refuse external dependents, RESTRICT drops |
| F5 | note | PGlite `SET ROLE` / `SET SESSION AUTHORIZATION` | **OPEN** — not PostgREST; native route used for session/privilege cases |
| F6 | residual | Hosted owner/Vault/pooler/Data API | **OPEN** — live-gated |
| F7 | residual | Fixture `synthetic-only` rights are not a live grant | **OPEN** — C4 live remainder |
| F8 | residual | Global `claim` can take unrelated pending jobs | **OPEN** — existing worker contract; disposable DBs are isolated |

No remaining must-fix inside the disposable composed scope.
