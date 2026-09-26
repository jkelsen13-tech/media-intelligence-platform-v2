# Collector → native capture qualification (composed, source-free)

**Status:** SOURCE-READY · **LIVE HOLD** · not applied · not deployed · not scheduled.

Composes C3 (qik-ingest retain collector) with the existing native
`mip_pipeline_v1` enqueue/claim/finish path and C4 (`mip_cas` +
`bindExactCaptureBytes`). Draft into
`codex/mip-backend-consolidation-20260920`. Does **not** merge to
consolidation, does not force-push peer branches, and does not apply SQL /
deploy Edge / create secrets / enable cron / transfer articles.

Peer trees reused (not rewritten as a second architecture):

| Peer | HEAD | What is kept |
|---|---|---|
| PR #182 C3 | `fa01f62` | YHB v8 `parseFeed`, source gate, run ledger, watermarks, disabled schedule intent |
| PR #181 C4 | `da7d4b3` | `mip_cas` install, `bindExactCaptureBytes`, `captureCasRehydrate` cases |
| PR #179 | `5f8afb9` | **Pattern only:** `05_operation_ledger` + `90_cleanup`. Hosted-synthetic is not rebuilt |

## Connection (existing paths)

Discovery is `qik_ingest.observed_items` (not `INSERT` into `public.articles`).
The collector then calls existing `public.mip_pipeline_v1`:

`observe → enqueue → claim → finish → article_captures` + `record_versions`
(history triggers from `20260905082406_evidence_pipeline_reliability.sql`)
`→ bindExactCaptureBytes`.

Identical `(canonical_url, input_hash)` is idle. Changed content at the same
URL is a new job whose finish outcome is `revision_pending`: reviewed
`reader_state` / title / body are not overwritten; capture `review_state`
stays `pending`.

## Cleanup boundaries

- C3: no `DROP OWNED` / schema `CASCADE`. Ledger-bound drop; refuse
  pre-existing package identities; restore recorded collection constraints;
  preserve unrelated grants and `public.articles`.
- C4: do not `DROP FUNCTION … CASCADE` on `mip_cas` functions. Refuse
  unapproved external dependents; drop only recorded objects.

## Tests

PGlite: `tests/qikIngestCollector.test.mjs`, `tests/captureCasRehydrate.test.mjs`
(reused, plus external-dependent case), `tests/collectorNativeCapture.test.mjs`.

Native Postgres (existing disposable route; not PostgREST):
`MIP_DISPOSABLE_POSTGRES=collector-native-capture-qualification`
`tests/collectorNativeCapturePostgres.test.mjs`.

PGlite `SET ROLE` is **not** hosted PostgREST auth.

Golden / Deno / broker **not rerun**. Prefer `[skip ci]`.

## Live hold

See `LIVE_OPERATION_PASTE.md`. That paste is documentation for a **future**
owner authorization. It is not authorization now.
