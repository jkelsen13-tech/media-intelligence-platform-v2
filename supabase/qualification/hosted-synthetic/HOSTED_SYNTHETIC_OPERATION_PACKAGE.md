# Hosted-synthetic operation package (qik)

**LIVE HOLD. Not authorized.** Source + disposable tests only. Files under `supabase/qualification/hosted-synthetic/` plus `tests/hostedSyntheticQualification.test.mjs`. This does not apply SQL, create or overwrite secrets, deploy Edge functions, merge PR #177 or #179, cut over, delete live objects, or run extra CI (commits use `[skip ci]`). Local PGlite is not hosted success.

| Field | Value |
|---|---|
| Target | Supabase project ref `qikvmopbtijoebdqosyq` only |
| Repository | `jkelsen13-tech/media-intelligence-platform-v2` |
| Base tip | `c4cfd28db7672c631e86af012febda4890e34f33` |
| Cost boundary | **$0** |
| Install | `installHostedSynthetic.mjs` (ledger + atomic 005→20) |
| Cleanup | `90_cleanup.sql` bound to `hosted_synthetic_operation` ledger |
| Credentials | `40_credential_operators.md` + `61_broker_connection_adapter.mjs` (disposable) |

Silence is not allowance. A prior auth package, this source tree, and disposable PGlite evidence are not qik execution rights.

## What this package implements

1. **Worker JWT signing is not `mip_identity.issue`.** Issue returns a session UUID. Route A HS256 is owner-machine mint with the project JWT secret (never this utility, never an online debugger). Route B is existing `issueWorkloadSession` via `61_broker_connection_adapter.mjs`.
2. **`source_snapshot` binds `synthetic_*`.** `20_grant_rebind.sql` clears 005 public SELECT (table and column). Installer runs 005 and 20 in **one transaction**. If 005 ever commits alone, `25_window_recovery.sql` syncs created package roles vs the install baseline, revokes table and column public-source SELECT, and refuses if effective SELECT remains. It does not `REVOKE FROM PUBLIC`.
3. **Empty POST carries no work.** Seed is `30_seed_runtime_and_work.sql` with a **15-minute** producer session recorded in the ledger.
4. **Cleanup is operation-owned.** `05_operation_ledger.sql` records exact created objects/roles/grants. `90_cleanup.sql` refuses unexpected same-schema objects and unrelated public privileges; it does not enumerate-and-erase or `REVOKE ALL ON ALL TABLES IN SCHEMA public`. No CASCADE, DISABLE TRIGGER, journal DELETE, or public table DROP. Pre-existing package roles are refused at install.

## Proposed bounded operation (paste-ready, **not authorized**)

Replace the old stage-by-stage pastes. One allowance covers setup, checks, invocation, and exact cleanup on failure:

> I authorize one bounded hosted-synthetic qualification operation on qik project `qikvmopbtijoebdqosyq` only, at commit `<this commit sha>`, cost boundary $0.
>
> Setup: run `supabase/qualification/hosted-synthetic/installHostedSynthetic.mjs` load order (ledger, files 1–4, 001–004, **005+20 in one transaction**, 013–016, 30 seed). Refuse if package roles/schemas already exist. Do not load source-fixture.sql, stock source-snapshot.sql, or 006–012.
>
> Checks: after install, `mip_kernel_owner_v2` has no table or column SELECT on public.events / event_articles / articles / pipeline_config; source_snapshot reads synthetic_* only; producer session expires within 15 minutes; one pending generation with source_project hosted-synthetic-qik.
>
> Credentials (disposable keys in this phase; live Route A HS256 only on the owner machine with MIP_QIK_JWT_SECRET already present, via the node:crypto HMAC in 40_credential_operators.md — never an online debugger, never this repo). Route B via 61_broker_connection_adapter.mjs as mip_identity_broker_v2; mip_identity.issue returns UUID only. Create only absent MIP_QIK_* names. GRANT mip_comparison_worker_v1 TO authenticator only after confirming authenticator is the live API switch role; 90_cleanup revokes that membership when authenticator exists because the worker role is created_roles. Expose mip_identity on the Data API. Deploy source-comparison-generation-candidate with verify_jwt=false for that function only.
>
> Invocation: 50_invoke_sequence.md steps (a)–(d) only. Empty POST bodies. Stop on failure.
>
> Cleanup on failure or completion: 25_window_recovery.sql if 005 committed without 20; then 90_cleanup.sql (ledger-bound). Stop on unexpected objects or unrelated privileges. REVOKE mip_comparison_worker_v1 FROM authenticator if this run granted it. Undeploy this function and delete listed MIP_QIK_* names only if this run created them. No CASCADE. No DISABLE TRIGGER. No public table drops. No PR #177. No cutover. No secret overwrite.

Do not perform that operation from this source commit.

## Checks (stay inside the one operation)

- Project ref is `qikvmopbtijoebdqosyq`.
- Package schemas and listed package roles are **absent** before install (no exceptions).
- `public.events`, `public.event_articles`, `public.articles`, `public.pipeline_config` exist (005 will grant SELECT; 20 / recovery must clear table and column SELECT for package roles).
- Named Edge secrets inventoried; existing names block create (no overwrite).
- Function `source-comparison-generation-candidate` inventory: a foreign contract blocks deploy.
- Do not SELECT real article bodies beyond existence/privilege catalog.

## Cost boundary

**$0.** If a step would require a paid runner, add-on, or plan change, stop.
