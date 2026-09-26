# qik-ingest-rss (source only — not deployed)

Successor slug for C3. Adapted from YHB `ingest-rss` **v8** retain/discovery
seams (`predecessorV8` sanitize/parseFeed) with qik environment names.

This directory is **not** registered under `supabase/functions/` so a casual
`supabase functions deploy` of the repo functions tree cannot publish it.

## Env / headers (qik names)

| Name | Role |
|---|---|
| `MIP_QIK_INGEST_RUN_KEY` | Owner/oneshot key (YHB `INGEST_RSS_RUN_KEY` analogue). Unset disables this path only. |
| `x-mip-qik-ingest-key` | Owner header compared to the run key. |
| `x-mip-qik-ingest-scheduler-token` | Scheduler header; Edge asks `mip_qik_ingest_schedule_authorized` (YHB v8 `mip_ingest_rss_schedule_authorized` analogue). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Platform Edge runtime only. |
| Vault `mip_qik_ingest_scheduler_token` | Documented scheduler secret name; **not created** by this package. |

Both presented tokens must also hash-match `qik_ingest.runtime_credentials` (or a later vault bind) because retain RPCs re-check the token. Missing both headers ⇒ 401. The collection gate can still return 503 writer disabled.

Do not reuse YHB `INGEST_RSS_RUN_KEY` material or cron jobname
`mip-ingest-rss-hourly`.

## Deploy posture (later owner paste)

- Slug: `qik-ingest-rss`
- `verify_jwt = true` (anon JWT is public; the run key is the writer gate)
- Do not set `verify_jwt = false`
- Do not overwrite `collector-shadow` or YHB `ingest-rss`

`index.ts` is a thin Deno.serve wrapper around `../collector.mjs`. Tests execute
the worker with injected `fetchText`; they do not call hosted Edge or real RSS.
