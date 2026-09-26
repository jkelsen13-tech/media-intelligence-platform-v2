# Case-level results (disposable only)

Golden / Deno / broker **not rerun**. CI: **0 minutes** (`[skip ci]`). Unused ~60 min
CI allowance carried. `$0`. Hosted qik/YHB/NIE were not touched.

Command: `node --test --test-concurrency=1 tests/qikIngestCollector.test.mjs tests/collectorNativeCapture.test.mjs tests/captureCasRehydrate.test.mjs`

Native: `MIP_DISPOSABLE_POSTGRES=collector-native-capture-qualification node --test tests/collectorNativeCapturePostgres.test.mjs`

| Case | Harness | Result |
|---|---|---|
| C3 live-hold / no cron·vault·anon grants / no DROP OWNED | PGlite | pass |
| C3 gate off: no `collection_enabled`, 503 writer | PGlite | pass |
| Identical delivery idle; changed title → `revision_pending`; reviewed row unchanged | PGlite | pass |
| Publication fields + `javascript:` rejected | PGlite | pass |
| Source fail + inflight recover → not `current` | PGlite | pass |
| Mixed source fail → `completed_with_errors` / stale | PGlite | pass |
| Schedule cannot activate; fence adds 0 articles | PGlite | pass |
| Anon / bad token denied (PGlite SET ROLE ≠ PostgREST) | PGlite | pass |
| Pre-existing C3 role refuses install; cleanup restores collection check; unrelated SELECT remains | PGlite | pass |
| YHB v8 `parseFeed` seams | PGlite | pass |
| C4 preflight leftover role/schema | PGlite | pass |
| C4 Unicode putOnce/get, cold rehydrate, rights, citation, poisoned locator | PGlite | pass |
| C4 reused pipeline `bindExactCaptureBytes` / hash mismatch | PGlite | pass |
| C4 unexpected table blocks cleanup | PGlite | pass |
| C4 unapproved public view dependent of `mip_cas.policy` refuses cleanup | PGlite | pass |
| C4 cleanup drops package; fixture logins + `public.articles` remain | PGlite | pass |
| Composed observe → enqueue/claim/finish → history insert versions → reused C4 bind | PGlite | pass |
| Anon cannot `SELECT` captures (catalog privilege; not PostgREST) | PGlite | pass |
| C3 extra same-role table / extra public GRANT refuse cleanup | PGlite | pass |
| Interrupted C3 install (05+010) ledger cleanup restores constraint; articles remain | PGlite | pass |
| C4 public view+trigger dependents refuse; role-owned extra table refuses; articles remain | PGlite | pass |
| Native session `anon` denied on captures; `service_role` has `mip_pipeline_v1`; external view refuses C4 cleanup; unrelated C3 GRANT refuses; sentinels remain | Disposable PostgreSQL 16 | pass |

**29/29** PGlite cases pass. **1/1** native disposable Postgres case pass.
