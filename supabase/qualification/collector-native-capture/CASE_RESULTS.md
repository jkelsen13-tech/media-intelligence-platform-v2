# Case-level results (disposable only)

Golden / Deno / broker **not rerun**. C4 `captureCasRehydrate` bind cases **not
rerun** (unchanged). CI: **0 minutes** (`[skip ci]`). Unused ~60 min CI
allowance carried. `$0`. Hosted qik/YHB/NIE were not touched.

This follow-up: `node --test --test-concurrency=1 tests/qikIngestCollector.test.mjs tests/collectorNativeCapture.test.mjs` → **18/18 pass**.

Native: `MIP_DISPOSABLE_POSTGRES=collector-native-capture-qualification node --test --test-concurrency=1 tests/collectorNativeCapturePostgres.test.mjs` → **2/2 pass**.

PGlite `SET ROLE` is **not** hosted PostgREST auth.

| Case | Harness | Result |
|---|---|---|
| C3 live-hold / no cron·vault·anon grants / no DROP OWNED / unscoped claim forbidden | PGlite | pass (rerun) |
| C3 gate off: no `collection_enabled`, 503 writer | PGlite | pass (rerun) |
| Identical delivery idle; changed title → `revision_pending`; reviewed row unchanged; `unresolved=0` | PGlite | pass (rerun) |
| Publication fields + `javascript:` rejected | PGlite | pass (rerun) |
| Source fail + inflight recover → not `current` | PGlite | pass (rerun) |
| Mixed source fail → `completed_with_errors` / stale | PGlite | pass (rerun) |
| Schedule cannot activate; fence adds 0 articles | PGlite | pass (rerun) |
| Anon / bad token denied (PGlite SET ROLE ≠ PostgREST) | PGlite | pass (rerun) |
| Pre-existing C3 role refuses install; cleanup restores collection check; unrelated SELECT remains | PGlite | pass (rerun) |
| YHB v8 `parseFeed` seams | PGlite | pass (rerun) |
| Composed observe → bound claim → finish → history → reused C4 bind | PGlite | pass (rerun) |
| Anon cannot `SELECT` captures (catalog privilege; not PostgREST) | PGlite | pass (rerun) |
| C3 extra same-role table / extra public GRANT refuse cleanup | PGlite | pass (rerun) |
| Interrupted C3 install (05+010) ledger cleanup restores constraint; articles remain | PGlite | pass (rerun) |
| C4 public view+trigger dependents refuse; role-owned extra table refuses; articles remain | PGlite | pass (rerun) |
| `countHandoffOutcomes` does not treat pending/leased/retry/dead_letter as duplicate | PGlite | pass (**new**) |
| Drain limit: 1 inserted + 1 unresolved; collector `completed_with_errors`, not `completed` | PGlite | pass (**new**) |
| Bound claim/expire: unrelated pending + expired + held lease unchanged; bound expired → `retry_wait` | PGlite | pass (**new**) |
| Native session `anon` denied on captures; `service_role` has `mip_pipeline_v1`; external view refuses C4 cleanup; unrelated C3 GRANT refuses; sentinels remain | Disposable PostgreSQL 16 | pass (rerun) |
| Bound claim does not mutate unrelated pending, expired, or held leases; SKIP LOCKED leaves locked own job pending; no captures/history for them | Disposable PostgreSQL 16 | pass (**new**) |
| C4 Unicode putOnce/get, cold rehydrate, rights, citation, poisoned locator, reused `bindExactCaptureBytes` | PGlite | pass (prior HEAD; not rerun) |
| C4 unexpected table / unapproved view / cleanup sentinels | PGlite | pass (prior HEAD; not rerun) |

**18/18** targeted PGlite cases this follow-up. **2/2** native disposable Postgres cases. C4 bind suite preserved from `dbaa321` scope.
