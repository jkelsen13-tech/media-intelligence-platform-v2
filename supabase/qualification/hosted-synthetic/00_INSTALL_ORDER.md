# Hosted-synthetic install order (qik only)

**Target:** Supabase project `qikvmopbtijoebdqosyq` only.  
**This file is source.** It is not authorization to apply SQL, create secrets, deploy Edge functions, merge PR #177, cut over, or delete anything.  
**No ephemeral branch.** Load via `installHostedSynthetic.mjs` (preferred) or the numbered files below. Do not substitute globbed paths.

Base tip this package was written against: `c4cfd28db7672c631e86af012febda4890e34f33`.

## Verified numbered load list

No wildcards. Paths are relative to the repository root.

0. `supabase/qualification/hosted-synthetic/05_operation_ledger.sql` — create operation ledger, snapshot baseline, **refuse pre-existing package roles/schemas**.
1. `supabase/qualification/comparison-generations/contract.sql`
2. `supabase/qualification/comparison-generations/selection.sql`
3. `supabase/qualification/comparison-generations/capability.sql`
4. `supabase/qualification/hosted-synthetic/10_synthetic_source_adapter.sql`
5. **SKIP** `supabase/qualification/comparison-generations/source-fixture.sql`
6. **SKIP** `supabase/qualification/comparison-generations/source-snapshot.sql`
7. `supabase/qualification/mip-cutover-authority/001_execute_only_identities.sql`
8. `supabase/qualification/mip-cutover-authority/002_candidate_interfaces.sql`
9. `supabase/qualification/mip-cutover-authority/003_scoped_queue.sql`
10. `supabase/qualification/mip-cutover-authority/004_publication_staging.sql`
11. `supabase/qualification/mip-cutover-authority/005_broker_sessions.sql` **and**
12. `supabase/qualification/hosted-synthetic/20_grant_rebind.sql` — **one transaction**. The installer strips each file’s `BEGIN`/`COMMIT` and commits only after 20. Do not leave 005 committed without 20. If that happens, run `25_window_recovery.sql` (same operation). Recovery syncs `created_roles` vs the install baseline (not relations), records the exact 005 public-source SELECT/USAGE, revokes table **and** column SELECT, and refuses if any created package role still has effective SELECT. It does not `REVOKE FROM PUBLIC`.
13. `supabase/qualification/mip-cutover-authority/013_worker_journal.sql`
14. `supabase/qualification/mip-cutover-authority/014_worker_journal_discovery.sql`
15. `supabase/qualification/mip-cutover-authority/015_worker_claim_resumption.sql`
16. `supabase/qualification/mip-cutover-authority/016_worker_broker_recovery.sql`
17. `supabase/qualification/hosted-synthetic/30_seed_runtime_and_work.sql` — producer session lifetime **15 minutes**, recorded in the ledger for explicit revoke on cleanup.

Do **not** load `006_collector_reconciliation.sql` through `012_efta_live_authentication.sql`.

Cleanup: `90_cleanup.sql` (ledger-bound). Credentials: `40_credential_operators.md`. Broker adapter: `61_broker_connection_adapter.mjs`. Invoke: `50_invoke_sequence.md`. Installer: `installHostedSynthetic.mjs`.

Disposable operator: `60_disposable_credential_session.mjs` `runDisposableOperatorOneshot`. Do **not** load it in the SQL editor. Do not treat local PGlite evidence as hosted qualification.

## Verification (do not invert files 1–3)

`capability.sql` line 1: *Load after contract.sql and selection.sql.* Isolated loaders in this tree use the same order. A capability-first order is not executable.

## Role and schema names (from tip files; do not rename)

- Worker PostgREST role claim: `mip_comparison_worker_v1`
- Kernel owner (005): `mip_kernel_owner_v2`
- Broker operator: `mip_identity_broker_v2`
- Identity schema / issue RPC: `mip_identity.issue` returns `uuid` session only
- Comparison kernel schema: `comparison_qualification`
- Cutover schema: `mip_cutover_authority`
- Operation ledger schema: `hosted_synthetic_operation`
- Isolated `qual_*` roles stay in `comparison-generations/` and must not be copied onto live projects under those names as an ambient worker identity

This package does not invent JWT `iss` / `aud` / `sub` values in SQL.
