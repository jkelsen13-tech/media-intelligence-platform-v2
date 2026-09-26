# C4 capture / CAS / exact citation — source install (2026-09-26)

Status: **SOURCE-READY**. Does **not** authorize SQL apply, Edge deploy, ingest enable, or live qik/YHB/NIE mutation.

Chosen capability: **C4** (Phase A EXTEND). F4 remains `NOT_DEMONSTRATED` for the exact-byte path on qik until an owner-gated live op.

## Why this slice

Phase A DAG step 1 already owns evidence/capture on qik; ingest enable (C3) is a separate live gate. C4 can prove byte custody without that gate:

- qik already has `evidence_pipeline` captures/`capture-retrieval` (overlap).
- Repo already has `mip_cas` (`001_store.sql` + `store.mjs`) — exact hash, tiers, rehydrate, rights, span citation.
- F4: exact `mip_cas` **absent** on qik; rights/custody unresolved.
- C5 extraction needs a retained article producer (ingest-gated). C21 watermarks already exist on qik and do not close F4.

This package **reuses** the existing CAS algorithm. It does not add a second evidence store.

`002_exact_citation.sql` (hypothesis field registry) stays out of this slice; it depends on `mip_hypothesis` (C12). C4 citation is `createStore.resolveCitation`.

## Files

| Path | Role |
|---|---|
| `supabase/qualification/content-addressed-storage/001_store.sql` | Unmodified CAS algorithm |
| `store.mjs` | Unmodified putOnce/get/rehydrate/citation adapter |
| `00_preflight.sql` / `05_operation_ledger.sql` / `90_cleanup.sql` | Source install orchestration |
| `installCaptureCas.mjs` | Load order + session-user transport |
| `bindExactCaptureBytes.mjs` | Bind pipeline `content_hash` to exact payload bytes |
| `fixtures/synthetic-canonical.json` | Values already used by native CAS + evidence-pipeline tests |
| `tests/captureCasRehydrate.test.mjs` | Disposable PGlite proof |

PGlite ignores `RESET SESSION AUTHORIZATION`; the installer/session transport restores `postgres` explicitly. pgcrypto is not dropped.

## Phase A C4 acceptance (minus live install)

Proof target: *byte-level retrieve/rehydrate; rights/custody gate held.*

| Criterion | Disposable evidence | Live qik |
|---|---|---|
| Installer refuses leftover schema/roles | PGlite | gated |
| Exact Unicode round-trip | `putOnce`/`get` on fixture | gated |
| Cold read is `rehydration_required`; complete restores exact bytes | PGlite | gated |
| Expired rights / foreign principal denied | PGlite | gated |
| Exact span citation; latest/similar cannot substitute; cold blocks until rehydrate | native fixture values | gated |
| Locator text is not evidence | poisoned index | gated |
| Capture `content_hash` = SHA-256(`payload::text` UTF-8); mismatch refuses | synthetic pipeline article already in repo tests | gated |
| Unexpected `mip_cas` relation blocks cleanup | PGlite | gated |
| Unapproved public view/trigger dependent refuses cleanup | PGlite | gated |
| Cleanup removes package; does not delete public articles | PGlite | gated |

## Live-gated remainder

- Apply `001_store.sql` to qik `qikvmopbtijoebdqosyq`.
- Map live `evidence_pipeline.article_captures` bytes (not JSON.stringify) through `bindExactCaptureBytes`.
- Owner-seeded rights/privacy tuples (fixture `synthetic-only` is not a rights grant).
- Native concurrent CAS races (`MIP_DISPOSABLE_POSTGRES=content-addressed-qualification`) and 002/hypothesis citation overlay.
- Ingest enable, YHB/NIE mutation, Edge deploy, publication.

## Coordinated eventual live-op paste (NOT authorized)

Do not run this from this commit. `$0`. No ingest enable.

> I authorize one bounded C4 capture/CAS source install on qik project `qikvmopbtijoebdqosyq` only, at commit `<this SHA>`, cost boundary $0.
>
> Setup: confirm pgcrypto is already available. Run `installCaptureCas.mjs` load order (`00_preflight.sql`, `001_store.sql`, `05_operation_ledger.sql`). Refuse if `mip_cas` / package roles already exist. Do not load `002_exact_citation.sql`. Do not deploy Edge. Do not enable ingest, cron, or YHB jobs. Do not write real article payloads. Do not GRANT extra public table privileges.
>
> Checks: `mip_cas` relations match the ledger; qualification flags remain false; no public SECURITY DEFINER copied from YHB.
>
> Cleanup on failure or completion: `90_cleanup.sql` (ledger-bound). Stop on
> `mip_cas_unexpected_object` or `mip_cas_unapproved_external_dependent`. Do not
> `DROP FUNCTION CASCADE`. No CASCADE onto `public`. No DROP of
> `evidence_pipeline` or `public.articles`. No secret overwrite. No PR #177/#179
> merge. No cutover.

## Non-actions

No qik/YHB/NIE SQL apply in this PR. No Edge deploy. No secrets. No Golden rerun. `[skip ci]`.
