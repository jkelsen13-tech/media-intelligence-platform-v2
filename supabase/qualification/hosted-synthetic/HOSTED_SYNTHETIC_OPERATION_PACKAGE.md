# Hosted-synthetic operation package (qik)

**Status: SOURCE + disposable tests.** Files under `supabase/qualification/hosted-synthetic/` plus `tests/hostedSyntheticQualification.test.mjs`. This does not apply SQL, create or overwrite secrets, deploy Edge functions, merge or execute PR #177, cut over, delete live objects, or run CI (commits use `[skip ci]`). Local PGlite is not hosted success.

| Field | Value |
|---|---|
| Target | Supabase project ref `qikvmopbtijoebdqosyq` only |
| Repository | `jkelsen13-tech/media-intelligence-platform-v2` |
| Base tip | `c4cfd28db7672c631e86af012febda4890e34f33` |
| Cost boundary | **$0** — no paid runner upgrade, no extra compute add-on, no project plan change, no billed API expansion. Owner-authorized later stages must stay inside already-included quota or stop |
| Cleanup | `supabase/qualification/hosted-synthetic/90_cleanup.sql` plus owner Edge/secret undeploy listed there |
| Install order | `supabase/qualification/hosted-synthetic/00_INSTALL_ORDER.md` |

## Explicitly NOT authorized until the owner pastes allowance

This package is **not** authorization for:

- installing SQL on qik or any other project
- creating, rotating, or overwriting Edge/project secrets
- deploying or redeploying Edge functions
- running CI jobs beyond the pull request’s natural path (prefer no extra workflows)
- reading or writing real `public.events` / `public.articles` / membership / pipeline rows as qualification input
- merging, applying, or otherwise executing [PR #177](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/pull/177)
- cutover, publication release, scheduler enablement
- deletion of live projects, roles that exist outside this install, or secrets this run did not create

Silence is not allowance. A prior auth package, this source tree, and disposable PGlite/CI evidence are not qik execution rights.

## Gaps this delta corrects

1. **Worker JWT signing is not `mip_identity.issue`.** `issue` returns a session UUID from a `token_hash`. Provider HS256 (`role=mip_comparison_worker_v1`) is a separate owner mint. See `40_credential_operators.md`. This package does not add an issuer/controller.
2. **`source_snapshot` and kernel `SELECT` bind to `comparison_qualification.synthetic_*`, not `public.*`.** Skipping `source-fixture.sql` is not enough: 005 still grants `SELECT` on the four public tables. `10_synthetic_source_adapter.sql` plus `20_grant_rebind.sql` (after 005) close that.
3. **Empty POST carries no work.** Seed is `30_seed_runtime_and_work.sql` via `producer_enqueue` / approved bind/session RPCs. Invoke sequence is `50_invoke_sequence.md`.
4. **Cleanup is exact.** `90_cleanup.sql` drops test-owned relations after ownership/dependent checks. No `DISABLE TRIGGER`, no `DELETE` from immutable journals, no `CASCADE`, no secret overwrite.

## Proposed changes (this package)

Files:

- `supabase/qualification/hosted-synthetic/00_INSTALL_ORDER.md`
- `supabase/qualification/hosted-synthetic/10_synthetic_source_adapter.sql`
- `supabase/qualification/hosted-synthetic/20_grant_rebind.sql`
- `supabase/qualification/hosted-synthetic/30_seed_runtime_and_work.sql`
- `supabase/qualification/hosted-synthetic/40_credential_operators.md`
- `supabase/qualification/hosted-synthetic/50_invoke_sequence.md`
- `supabase/qualification/hosted-synthetic/60_disposable_credential_session.mjs`
- `supabase/qualification/hosted-synthetic/90_cleanup.sql`
- `supabase/qualification/hosted-synthetic/HOSTED_SYNTHETIC_OPERATION_PACKAGE.md`
- `tests/hostedSyntheticFixture.mjs`
- `tests/hostedSyntheticQualification.test.mjs`

No migrations under `supabase/migrations/`. No `config.toml` change. No secret material. No new workflow.

## Owner actions (gated; not this commit)

Documented for a later paste-allowance. Do not perform them from this source commit.

1. Read-only catalog preflight on `qikvmopbtijoebdqosyq` (stage 1).
2. Apply `00_INSTALL_ORDER.md` files 1–17 in the SQL editor as `postgres` (stage 2).
3. Owner-chosen `mip_identity` key/mapping rows; RS256 mint; `issueWorkloadSession` as `mip_identity_broker_v2`; HS256 worker JWT; create **missing** `MIP_QIK_*` secrets only; `GRANT mip_comparison_worker_v1 TO authenticator`; expose `mip_identity` on the Data API (stage 3).
4. Deploy `source-comparison-generation-candidate` with `verify_jwt=false` for that function only (stage 4).
5. Bounded empty-POST sequence in `50_invoke_sequence.md` (stage 5).
6. `90_cleanup.sql` plus Edge undeploy and listed-secret delete if this run created them (stage 6).

## Execution allowance text

The owner pastes a distinct allowance for the stage they mean. Example for **stage 2 only**:

> I authorize hosted-synthetic SQL install on qik project `qikvmopbtijoebdqosyq` only, using `supabase/qualification/hosted-synthetic/00_INSTALL_ORDER.md` at commit `<this commit sha>`, files 1–17, cost boundary $0. No Edge deploy, no secret writes, no overwrite of existing secrets, no PR #177, no cutover, no deletion. If any stage-2 check fails, stop.

Example for **stage 3 only** (secrets):

> I authorize creating only absent `MIP_QIK_*` names listed in `40_credential_operators.md` on qik `qikvmopbtijoebdqosyq` for hosted-synthetic, cost boundary $0. Do not overwrite existing secrets. No deploy, no #177, no cutover, no deletion.

Example for **stage 4 only** (deploy):

> I authorize deploying `source-comparison-generation-candidate` to qik `qikvmopbtijoebdqosyq` with `verify_jwt=false` for that function only, using this package’s host/index at commit `<this commit sha>`, cost boundary $0. No other functions. No secret overwrite. No #177. No cutover.

Example for **stage 6 only** (cleanup):

> I authorize `90_cleanup.sql` on qik `qikvmopbtijoebdqosyq` and undeploy/delete only this run’s listed `MIP_QIK_*` secrets and this function if this run deployed it, cost boundary $0. Stop on unexpected dependents. No CASCADE. No DISABLE TRIGGER. No public table drops.

## Stages (resource-dependent checks stay inside the stage)

### Stage 0 — source (this package)

**Check:** tree contains the hosted-synthetic files and disposable tests; no live apply.

**Do:** keep the reviewable PR. Stop before qik SQL/secrets/deploy.

### Stage 1 — read-only qik preflight

**Checks (stop if any fail):**

- Project ref is `qikvmopbtijoebdqosyq` and the project is the intended survivor.
- `comparison_qualification`, `mip_identity`, and `mip_cutover_authority` are **absent** (this install is not a second copy).
- `public.events`, `public.event_articles`, `public.articles`, `public.pipeline_config` **exist** (005 will grant `SELECT` to `mip_kernel_owner_v2`; 20 must revoke it).
- `mip_kernel_owner_v2` / `mip_comparison_worker_v1` / `mip_identity_broker_v2` are absent or the owner has a written exception.
- Named Edge secrets `MIP_QIK_WORKER_RPC_URL`, `MIP_QIK_PUBLISHABLE_KEY`, `MIP_QIK_WORKER_JWT`, `MIP_QIK_WORKER_INVOKE_TOKEN`, `MIP_QIK_WORKER_SESSION`, `MIP_QIK_WORKER_RUNTIME`, `MIP_QIK_WORKER_IMPLEMENTATION` are inventoried. Existing names **block stage 3** (no overwrite).
- Function `source-comparison-generation-candidate` inventory: already-deployed bodies/verify_jwt are recorded. A foreign contract **blocks stage 4**.

**Do not:** SELECT real article bodies or event text beyond existence/privilege catalog.

### Stage 2 — SQL install

**Requires:** pasted stage-2 allowance; stage 1 pass.

**Checks during load:**

- After file 4: `source_snapshot` text reads `synthetic_events` and does not read `public.events`.
- After file 11 (005): if `GRANT SELECT` on public tables fails, stop (qik is expected to have those tables).
- File 12 (`20_grant_rebind.sql`) **raises** if public `SELECT` cannot be revoked from `mip_kernel_owner_v2`.
- After file 17: one pending job whose `source_project` is `hosted-synthetic-qik`, not a live public id.

**Do not:** load `source-fixture.sql` or stock `source-snapshot.sql`; do not load 006–012; do not `SET ROLE` a live data role against public tables.

### Stage 3 — credentials

**Requires:** pasted stage-3 allowance; stage 2 pass.

**Checks:** each `MIP_QIK_*` name is created only when absent; HS256 `role` is exactly `mip_comparison_worker_v1`; RS256 mint matches seeded JWK/`kid`; `mip_identity.issue` returns UUID only; runtime/implementation secrets equal `hosted-synthetic-qik-v1` / `hosted-synthetic-event-projection-v1`.

**Do not:** put the RS256 workload token in `MIP_QIK_WORKER_JWT`; do not use `service_role`; do not invent iss/aud/sub in leftover SQL.

### Stage 4 — Edge deploy

**Requires:** pasted stage-4 allowance; stage 3 pass.

**Checks:** deploy identity is `source-comparison-generation-candidate` only; `verify_jwt=false` for that function only; `index.ts` env names match the seven `MIP_QIK_*` keys; no `SUPABASE_SERVICE_ROLE_KEY` fallback.

**Do not:** deploy other functions; do not enable a schedule.

### Stage 5 — bounded invoke

**Requires:** pasted stage-5 allowance; stage 4 pass.

**Do:** `50_invoke_sequence.md` steps (a)–(d) only. **Check:** (e) limits claims to that sequence.

**Do not:** extra POSTs, payload “help”, second seed, or publication RPCs.

### Stage 6 — cleanup

**Requires:** pasted stage-6 allowance.

**Checks:** `90_cleanup.sql` ownership/dependent raises abort the transaction; public events/articles still exist; only listed secrets created by this run are deleted.

**Do not:** `DROP … CASCADE`; `DISABLE TRIGGER`; `DELETE` from immutable journals; drop `public.*` source tables; delete unrelated secrets.

## Cost boundary

**$0.** This source commit must not start paid work. Later owner stages use the existing qik project and included quota. If a stage would require a paid runner, add-on, or plan change, stop.
