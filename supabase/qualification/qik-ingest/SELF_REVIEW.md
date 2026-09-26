# C3 qik-ingest — non-implementing self-review

Reviewer stance: inspect source and disposable tests only. No hosted SQL, Edge
deploy, Vault, cron, or real feed fetch. Golden / Deno / broker not rerun.

## Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | must-fix | First Edge draft only checked `MIP_QIK_INGEST_RUN_KEY` and 503'd when unset. Captured YHB **v8** (`runtime-snapshots/ingest-rss-v8-live-20260920`) authorizes **owner run key or** Vault scheduler RPC (`mip_ingest_rss_schedule_authorized`). | **CLOSE** — `mip_qik_ingest_schedule_authorized` + `x-mip-qik-ingest-scheduler-token`; unset owner key disables that path only. |
| F2 | must-fix | `090` could not `DROP ROLE qik_ingest_runtime` (grants remained). Composition replaces `DROP OWNED` with ledger-bound drops. | **CLOSE** — revoke recorded grants + exact drops |
| F3 | must-fix | Static scan treated SQL comments mentioning forbidden APIs as executable. | **CLOSE** — scan strips `--` comments. |
| F4 | should-fix | All-fail and all-success were tested; mixed source failure (Phase B honesty) was not. | **CLOSE** — `completed_with_errors` + `qik_forward_stale` + `is_current=false`. |
| F5 | should-fix | Successful complete did not re-read observe. | **CLOSE** — observe after ok remains `is_current=false`, freshness `qik_forward_ok`. |
| F6 | note | `cron.schedule` is omitted from 010–050 because pg_cron creates **active** jobs. | **CLOSE** — disabled intent + check `active=false`; enable is owner paste only. |
| F7 | residual | Hosted `ALTER FUNCTION OWNER` / Vault bind / pooler identity / ambient Edge `service_role` are not proved on PGlite. | **OPEN** — live-gated; documented in SCHEMA_CONTRACT_DELTA. |
| F8 | residual | RPC token must hash-match `runtime_credentials` even after Edge accepts the owner env key. Two secrets can drift. | **OPEN** — paste now says hash or vault-bind both presented tokens. |
| F9 | residual | Parser is YHB v8 sanitize/parseFeed only. Full v8 still does NER/embed/arcs; this package must not claim that successor. | **OPEN** — C5/C9; explicitly out of scope. |
| F10 | residual | `observe` reads `schedule_intent` created in 050. Partial apply of 020 alone would fail at runtime. | **OPEN** — INSTALL_ORDER is the contract; not a silent default. |

## Corrections applied in this PR

1. Dual-auth Edge + boolean scheduler RPC (qik names only).
2. Cleanup revoke/`DROP OWNED` so roles drop. **Superseded in composition:** ledger-bound 090, no DROP OWNED.
3. Comment-stripped activation scan.
4. Mixed-failure and post-success observe assertions.
5. Docs cite the v8 snapshot and the hash/vault bind requirement.

## Remaining blockers for owner enable (not this PR)

- Separate authorization to apply 010–050 on qik.
- Vault secret + Edge secret + optional `cron.schedule` (active control).
- Collection gate + one source enable.
- Hosted identity/owner/ACL qualification (qik `postgres` is not a disposable superuser).
- YHB cron stays `active=false`.
- No article transfer of 36183.

No remaining must-fix inside the disposable source-ready scope.
