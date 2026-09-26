# Hosted-synthetic install order (qik only)

**Target:** Supabase project `qikvmopbtijoebdqosyq` only.  
**This file is source.** It is not authorization to apply SQL, create secrets, deploy Edge functions, merge PR #177, cut over, or delete anything.  
**No ephemeral branch.** Load the numbered files below from this repository tree. Do not substitute globbed paths, “latest”, or a throwaway checkout.

Base tip this package was written against: `c4cfd28db7672c631e86af012febda4890e34f33`.

## Verified numbered load list

No wildcards. Paths are relative to the repository root.

1. `supabase/qualification/comparison-generations/contract.sql`
2. `supabase/qualification/comparison-generations/selection.sql`
3. `supabase/qualification/comparison-generations/capability.sql`
4. `supabase/qualification/hosted-synthetic/10_synthetic_source_adapter.sql`
5. **SKIP** `supabase/qualification/comparison-generations/source-fixture.sql` — do not load. It creates `public.events` / `public.articles` / `public.event_articles` / `public.pipeline_config` and would be unsafe on live qik.
6. **SKIP** `supabase/qualification/comparison-generations/source-snapshot.sql` — do not load. It reads those `public.*` tables. File 4 replaces `source_snapshot` / `capture_source` to read only `comparison_qualification.synthetic_*`.
7. `supabase/qualification/mip-cutover-authority/001_execute_only_identities.sql`
8. `supabase/qualification/mip-cutover-authority/002_candidate_interfaces.sql`
9. `supabase/qualification/mip-cutover-authority/003_scoped_queue.sql`
10. `supabase/qualification/mip-cutover-authority/004_publication_staging.sql`
11. `supabase/qualification/mip-cutover-authority/005_broker_sessions.sql`
12. `supabase/qualification/hosted-synthetic/20_grant_rebind.sql` — must run **after** 005. 005 grants `SELECT` on `public.events`, `public.event_articles`, `public.articles`, and `public.pipeline_config` to `mip_kernel_owner_v2`; this file revokes those public grants and binds `SELECT` to the four `synthetic_*` tables.
13. `supabase/qualification/mip-cutover-authority/013_worker_journal.sql`
14. `supabase/qualification/mip-cutover-authority/014_worker_journal_discovery.sql`
15. `supabase/qualification/mip-cutover-authority/015_worker_claim_resumption.sql`
16. `supabase/qualification/mip-cutover-authority/016_worker_broker_recovery.sql`
17. `supabase/qualification/hosted-synthetic/30_seed_runtime_and_work.sql` — setup only. Enqueues work through approved RPCs. Empty POST invocations must not carry work.

Do **not** load `006_collector_reconciliation.sql` through `012_efta_live_authentication.sql` as part of this package.

Edge deploy, `MIP_QIK_*` secrets, JWT minting, `GRANT … TO authenticator`, and PostgREST schema exposure are **owner-gated later stages**. They are not this commit’s execution. See `HOSTED_SYNTHETIC_OPERATION_PACKAGE.md`.

Cleanup: `supabase/qualification/hosted-synthetic/90_cleanup.sql` plus the owner Edge/secret actions listed in that file. Credential operators: `40_credential_operators.md`. Bounded empty-POST sequence: `50_invoke_sequence.md`.

Disposable (not SQL, not live qik): `60_disposable_credential_session.mjs` is the executable HS256-shape + RS256 `issueWorkloadSession` procedure used by `tests/hostedSyntheticQualification.test.mjs` on PGlite. Do **not** load it in the SQL editor. Do not treat local PGlite evidence as hosted qualification.

## Verification (do not invert files 1–3)

`capability.sql` line 1: *Load after contract.sql and selection.sql.*

`capability.sql` references `comparison_qualification.selection_history` and `comparison_qualification.generations`, which `selection.sql` and `contract.sql` create. Isolated loaders in this tree use the same order:

- `tests/isolatedCandidateFixture.mjs`
- `tests/comparisonGenerationCandidate.test.mjs`
- `verifier/integrated/fixture.mjs`
- `docs/COMPARISON_CAPABILITY_SEPARATION_2026-09-10.md`

A capability-first order is not executable.

`selection.sql` **is required** by `capability.sql` (publication history FK to `selection_history`, plus selector/publication RPCs). It is not required by `contract.sql` itself.

## Role and schema names (from tip files; do not rename)

- Worker PostgREST role claim: `mip_comparison_worker_v1`
- Kernel owner (005): `mip_kernel_owner_v2`
- Broker operator: `mip_identity_broker_v2`
- Identity schema / issue RPC: `mip_identity.issue` returns `uuid` session only
- Comparison kernel schema: `comparison_qualification`
- Cutover schema: `mip_cutover_authority`
- Isolated `qual_*` roles stay in `comparison-generations/` and must not be copied onto live projects under those names as an ambient worker identity

This package does not invent JWT `iss` / `aud` / `sub` values in SQL.
